/**
 * MCP File Transfer Extension — Server-side integration for TypeScript MCP servers.
 *
 * Intercepts FTE JSON-RPC methods at the transport layer and dispatches them
 * to registered URI scheme handlers.
 */

import { Transport, TransportSendOptions } from "@modelcontextprotocol/sdk/shared/transport.js";
import { JSONRPCMessage, JSONRPCRequest, JSONRPCResponse, JSONRPCError, ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";

import { Methods, FteErrorCodes } from "./protocol.js";

// ── URI Handler interface ──

/**
 * Pluggable handler for a URI scheme (e.g. "file", "content", "s3").
 * Register via `FteServerConfig.customHandlers`.
 * Throw `McpError` with an FteErrorCodes code for protocol-level error responses.
 */
export interface UriHandler {
    readonly scheme: string;
    getSize(uri: string): number;
    read(uri: string, offset: number, length: number): Buffer;
    write(uri: string, offset: number, data: Buffer): void;
    close(uri: string): void;
}

// ── Configuration ──

export interface FteServerConfig {
    /** Root directories allowed for file:// URIs. Default: no file:// access. Set `["/"]` for full access. */
    sandbox?: string[];
    /** Custom URI scheme handlers (e.g. { content: myHandler }). */
    customHandlers?: Record<string, UriHandler>;
    maxChunkSize?: number;
    ttlSeconds?: number;
}

// ── File path resolution ──

function resolveFilePath(uri: string, sandbox: string[]): string {
    const u = new URL(uri);
    let fp = decodeURIComponent(u.pathname);
    if (/^\/[a-zA-Z]:/.test(fp)) fp = fp.slice(1);
    if (fp.includes("..")) throw new McpError(FteErrorCodes.URI_NOT_ALLOWED, "Path traversal not allowed");
    const resolved = path.resolve(fp);
    const allowed = sandbox.some(root =>
        resolved.toLowerCase().startsWith(path.resolve(root).toLowerCase())
    );
    if (!allowed) throw new McpError(FteErrorCodes.URI_NOT_ALLOWED, `Path not in sandbox: ${fp}`);
    return resolved;
}

// ── Built-in file:// handler ──

function createFileHandler(sandbox: string[]): UriHandler {
    const resolve = (uri: string) => resolveFilePath(uri, sandbox);

    return {
        scheme: "file",
        getSize(uri: string) {
            try { return fs.statSync(resolve(uri)).size; }
            catch (e: any) {
                if (e.code === "ENOENT") throw new McpError(FteErrorCodes.FILE_NOT_FOUND, e.message);
                if (e.code === "EACCES" || e.code === "EPERM") throw new McpError(FteErrorCodes.PERMISSION_DENIED, e.message);
                throw e;
            }
        },
        read(uri: string, offset: number, length: number) {
            const fd = fs.openSync(resolve(uri), "r");
            try {
                const buf = Buffer.alloc(length);
                const n = fs.readSync(fd, buf, 0, length, offset);
                return buf.subarray(0, n);
            } finally { fs.closeSync(fd); }
        },
        write(uri: string, offset: number, data: Buffer) {
            const fp = resolve(uri);
            const dir = path.dirname(fp);
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
            const fd = fs.openSync(fp, "r+");
            try { fs.writeSync(fd, data, 0, data.length, offset); }
            finally { fs.closeSync(fd); }
        },
        close(_uri: string) { /* stateless */ },
    };
}

// ── Transport Wrapper ──

interface TransferSession {
    id: string;
    uri: string;
    direction: "read" | "write";
    totalSize: number;
    createdAt: number;
    lastActivity: number;
}

export class FteServer {
    static wrapTransport(delegate: Transport, config: FteServerConfig = {}): Transport {
        const sessions = new Map<string, TransferSession>();
        const ttlMs = (config.ttlSeconds ?? 300) * 1000;
        const maxChunk = config.maxChunkSize ?? 2 * 1024 * 1024;

        // periodic cleanup
        const timer = setInterval(() => {
            const now = Date.now();
            for (const [id, s] of sessions) {
                if (now - s.lastActivity > ttlMs) sessions.delete(id);
            }
        }, 30_000);
        if (timer.unref) timer.unref();

        // build handler registry
        const handlers = new Map<string, UriHandler>();

        // file:// handler — only if sandbox is explicitly configured
        const sb = config.sandbox;
        if (sb && sb.length > 0) handlers.set("file", createFileHandler(sb));

        // custom handlers
        if (config.customHandlers) {
            for (const [scheme, h] of Object.entries(config.customHandlers)) {
                handlers.set(scheme, h);
            }
        }

        function getHandler(uri: string): UriHandler {
            const scheme = new URL(uri).protocol.replace(/:$/, "");
            const h = handlers.get(scheme);
            if (!h) throw new McpError(FteErrorCodes.URI_NOT_ALLOWED, `Scheme not supported or not configured: ${scheme}`);
            return h;
        }

        // ── dispatch ──

        function dispatch(p: Record<string, unknown>, method: string): Record<string, unknown> {
            switch (method) {
                case Methods.READ_INIT: {
                    const uri = str(p, "uri");
                    const h = getHandler(uri);
                    const size = h.getSize(uri);
                    const s: TransferSession = { id: crypto.randomUUID(), uri, direction: "read", totalSize: size, createdAt: Date.now(), lastActivity: Date.now() };
                    sessions.set(s.id, s);
                    return { transfer_id: s.id, total_size: size, ttl: ttlMs / 1000 };
                }
                case Methods.READ_CHUNK: {
                    const s = getSession(p, "read");
                    const offset = num(p, "offset");
                    if (offset < 0 || offset >= s.totalSize) {
                        throw new McpError(FteErrorCodes.INVALID_OFFSET, `Offset ${offset} out of range [0, ${s.totalSize})`);
                    }
                    const len = Math.min(num(p, "length"), maxChunk);
                    const h = getHandler(s.uri);
                    const buf = h.read(s.uri, offset, len);
                    const eof = offset + buf.length >= s.totalSize;
                    return { data: buf.toString("base64"), eof };
                }
                case Methods.READ_CLOSE: {
                    const s = getSession(p, "read");
                    getHandler(s.uri).close(s.uri);
                    sessions.delete(s.id);
                    return {};
                }
                case Methods.WRITE_INIT: {
                    const uri = str(p, "uri");
                    const h = getHandler(uri);
                    const force = p.force === true;
                    if (!force) {
                        try { h.getSize(uri); throw new McpError(FteErrorCodes.WRITE_CONFLICT, `Target already exists: ${uri}`); }
                        catch (e) { if (e instanceof McpError && e.code === FteErrorCodes.WRITE_CONFLICT) throw e; /* file not found is OK, proceed */ }
                    }
                    // Create empty file for file:// URIs so subsequent write/chunk can open it
                    if (h.scheme === "file") {
                        const fp = resolveFilePath(uri, config.sandbox ?? []);
                        fs.mkdirSync(path.dirname(fp), { recursive: true });
                        fs.writeFileSync(fp, Buffer.alloc(0));
                    }
                    const s: TransferSession = { id: crypto.randomUUID(), uri, direction: "write", totalSize: (p.expected_size as number) ?? -1, createdAt: Date.now(), lastActivity: Date.now() };
                    sessions.set(s.id, s);
                    return { transfer_id: s.id, ttl: ttlMs / 1000 };
                }
                case Methods.WRITE_CHUNK: {
                    const s = getSession(p, "write");
                    const h = getHandler(s.uri);
                    const buf = Buffer.from(str(p, "data"), "base64");
                    h.write(s.uri, num(p, "offset"), buf);
                    return { bytes_written: buf.length };
                }
                case Methods.WRITE_CLOSE: {
                    const s = getSession(p, "write");
                    let verified: boolean | undefined;
                    if (p.hash_algorithm === "sha256" && p.expected_hash) {
                        const h = getHandler(s.uri);
                        const buf = h.read(s.uri, 0, h.getSize(s.uri));
                        const actual = crypto.createHash("sha256").update(buf).digest("hex");
                        verified = actual === p.expected_hash;
                        if (!verified) throw new McpError(FteErrorCodes.HASH_MISMATCH, "Hash mismatch");
                    }
                    getHandler(s.uri).close(s.uri);
                    sessions.delete(s.id);
                    return { verified };
                }
                case Methods.ABORT: {
                    const id = p.transfer_id as string;
                    const s = sessions.get(id);
                    if (s) { getHandler(s.uri).close(s.uri); sessions.delete(id); }
                    return {};
                }
                default:
                    throw new McpError(ErrorCode.MethodNotFound, `Unknown FTE method: ${method}`);
            }
        }

        // error → JSON-RPC error mapping
        function toRpcError(e: unknown): { code: number; message: string } {
            if (e instanceof McpError && e.code !== ErrorCode.InternalError) {
                return { code: e.code, message: e.message };
            }
            const msg = e instanceof Error ? e.message : String(e);
            return { code: ErrorCode.InternalError, message: msg };
        }

        // ── wrapper ──

        let upstream: ((msg: JSONRPCMessage) => void) | null = null;

        const wrapper: Transport = {
            start: () => delegate.start(),
            close: () => { clearInterval(timer); sessions.clear(); return delegate.close(); },
            send(m: JSONRPCMessage, o?: TransportSendOptions) { return delegate.send(m, o); },

            get onclose() { return delegate.onclose; },
            set onclose(cb) { delegate.onclose = cb; },
            get onerror() { return delegate.onerror; },
            set onerror(cb) { delegate.onerror = cb; },
            get onmessage() { return delegate.onmessage; },
            set onmessage(cb) {
                upstream = cb ?? null;
                delegate.onmessage = (m: JSONRPCMessage) => {
                    if (isReq(m) && Methods.isFteMethod(m.method)) {
                        handle(m).then(r => { if (r) delegate.send(r).catch(() => { }); });
                    } else if (upstream) {
                        upstream(m);
                    }
                };
            },
        };

        function isReq(m: JSONRPCMessage): m is JSONRPCRequest { return "method" in m && "id" in m; }

        async function handle(req: JSONRPCRequest): Promise<JSONRPCMessage | null> {
            try {
                return { jsonrpc: "2.0", id: req.id, result: dispatch((req.params ?? {}) as Record<string, unknown>, req.method) };
            } catch (e) {
                const err = toRpcError(e);
                return { jsonrpc: "2.0", id: req.id, error: { code: err.code, message: err.message } };
            }
        }

        function getSession(p: Record<string, unknown>, dir: "read" | "write"): TransferSession {
            const id = str(p, "transfer_id");
            const s = sessions.get(id);
            if (!s) throw new McpError(FteErrorCodes.TRANSFER_NOT_FOUND, `Session not found: ${id}`);
            if (s.direction !== dir) throw new McpError(FteErrorCodes.TRANSFER_NOT_FOUND, `Session ${id} is not a ${dir} session`);
            if (Date.now() - s.lastActivity > ttlMs) { sessions.delete(id); throw new McpError(FteErrorCodes.SESSION_EXPIRED, `Session ${id} expired`); }
            s.lastActivity = Date.now();
            return s;
        }

        return wrapper;
    }

    /**
     * Build the FTE capabilities object for MCP server initialization.
     * Merge the return value into your server's `capabilities.experimental`.
     *
     * ```
     * const server = new McpServer(info, {
     *     capabilities: {
     *         ...FteServer.capabilities({ sandbox: ["/data"] }),
     *     },
     * });
     * ```
     */
    static capabilities(config: FteServerConfig = {}): Record<string, unknown> {
        const schemes: string[] = [];
        if (config.sandbox && config.sandbox.length > 0) schemes.push("file");
        if (config.customHandlers) schemes.push(...Object.keys(config.customHandlers));

        return {
            experimental: {
                "cc.qqxing/file-transfer": {
                    supported_schemes: schemes,
                    max_chunk_size: config.maxChunkSize ?? 2 * 1024 * 1024,
                },
            },
        };
    }
}

function str(p: Record<string, unknown>, k: string): string {
    const v = p[k];
    if (typeof v !== "string") throw new McpError(ErrorCode.InvalidParams, `Missing or invalid: ${k}`);
    return v;
}
function num(p: Record<string, unknown>, k: string): number {
    const v = p[k];
    if (typeof v !== "number") throw new McpError(ErrorCode.InvalidParams, `Missing or invalid: ${k}`);
    return v;
}

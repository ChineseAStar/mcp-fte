/**
 * MCP File Transfer Extension — Client-side entry point.
 *
 * Discovers FTE-capable MCP servers, exposes transfer tools to LLMs,
 * and executes cross-server chunked file transfers.
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { z } from "zod";

import { EXTENSION_ID, Methods, TransferArgs, TransferResult } from "./protocol.js";

interface RegisteredClient {
    serverId: string;
    client: Client;
    supportedSchemes: string[];
}

export interface FteOptions {
    chunkSize?: number;
    logger?: FteLogger;
}

export interface FteLogger {
    info(msg: string, ...args: unknown[]): void;
    error(msg: string, ...args: unknown[]): void;
}

const noop: FteLogger = { info() { }, error() { } };

export class Fte {
    private clients = new Map<string, RegisteredClient>();
    private logger: FteLogger;
    private chunkSize: number;

    constructor(opts?: FteOptions) {
        this.logger = opts?.logger ?? noop;
        this.chunkSize = opts?.chunkSize ?? 1024 * 1024;
    }

    /**
     * Register a connected MCP client.
     *
     * @param serverId     unique identifier for this server
     * @param client       MCP Client instance from `@modelcontextprotocol/sdk`
     * @param capabilities raw `initialize` response capabilities object (from `client.getServerCapabilities()`)
     */
    register(serverId: string, client: Client, capabilities: Record<string, unknown>): void {
        const exp = capabilities?.experimental as Record<string, unknown> | undefined;
        const raw = exp?.[EXTENSION_ID] as Record<string, unknown> | undefined;
        if (!raw) {
            this.logger.info(`"${serverId}" does not support ${EXTENSION_ID}`);
            return;
        }
        const schemes = Array.isArray(raw.supported_schemes) ? raw.supported_schemes as string[] : ["file"];
        this.clients.set(serverId, { serverId, client, supportedSchemes: schemes });
        this.logger.info(`Registered "${serverId}" (schemes: ${schemes.join(", ")})`);
    }

    /** Remove a disconnected client. */
    unregister(serverId: string): void {
        this.clients.delete(serverId);
    }

    /** Whether at least 2 FTE-capable servers are registered. */
    get available(): boolean {
        return this.clients.size >= 2;
    }

    /**
     * Build the LLM-facing transfer tool definition, or null if unavailable.
     */
    transferTool(): object | null {
        if (this.clients.size < 2) return null;
        const ids = Array.from(this.clients.keys());

        return {
            name: "transfer_file",
            description: "Transfer a file between MCP servers. Available: " + ids.join(", "),
            inputSchema: {
                type: "object",
                properties: {
                    source_mcp: { type: "string", description: "Source server: " + ids.join(", "), enum: ids },
                    source_uri: { type: "string", description: "Source URI (e.g. file:///data/app.apk)" },
                    target_mcp: { type: "string", description: "Target server: " + ids.join(", "), enum: ids },
                    target_uri: { type: "string", description: "Target URI (e.g. file:///workspace/app.apk)" },
                    force: { type: "boolean", description: "Overwrite target if it exists. Default false." },
                },
                required: ["source_mcp", "source_uri", "target_mcp", "target_uri"],
            },
        };
    }

    /** Check whether a tool name is the FTE transfer tool. */
    isTransferTool(name: string): boolean {
        return name === "transfer_file";
    }

    /**
     * Execute a cross-server file transfer.
     *
     * The LLM calls `transfer_file`, the host intercepts the call and passes
     * the parsed args here. Fte orchestrates read→chunk-loop→write, returns a
     * clean result string for the LLM.
     */
    async transfer(args: TransferArgs): Promise<TransferResult> {
        const src = this.clients.get(args.source_mcp);
        const tgt = this.clients.get(args.target_mcp);
        if (!src) return { success: false, message: `Source not found: ${args.source_mcp}` };
        if (!tgt) return { success: false, message: `Target not found: ${args.target_mcp}` };

        const t0 = Date.now();
        try {
            this.logger.info(`${args.source_mcp}:${args.source_uri} → ${args.target_mcp}:${args.target_uri}`);

            // 1. read/init
            const ri = await this.rpc(src.client, Methods.READ_INIT, { uri: args.source_uri });
            const rid = ri.transfer_id as string;
            const total = ri.total_size as number;
            this.logger.info(`read session ${rid}, ${this.fmt(total)}`);

            // 2. write/init
            const wi = await this.rpc(tgt.client, Methods.WRITE_INIT, {
                uri: args.target_uri,
                expected_size: total,
                force: args.force ?? false,
            });
            const wid = wi.transfer_id as string;

            // 3. chunk loop
            let offset = 0;
            while (offset < total) {
                const rc = await this.rpc(src.client, Methods.READ_CHUNK, { transfer_id: rid, offset, length: this.chunkSize });
                const wc = await this.rpc(tgt.client, Methods.WRITE_CHUNK, { transfer_id: wid, offset, data: rc.data });
                offset += wc.bytes_written as number;
                this.logger.info(`${this.fmt(offset)} / ${this.fmt(total)}`);
                if (rc.eof) break;
            }

            // 4. close
            await this.rpc(src.client, Methods.READ_CLOSE, { transfer_id: rid });
            await this.rpc(tgt.client, Methods.WRITE_CLOSE, { transfer_id: wid });

            const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
            const msg = `Transferred ${this.fmt(total)} in ${elapsed}s`;
            this.logger.info(msg);
            return { success: true, message: msg, elapsed_ms: Date.now() - t0, bytes_transferred: total };
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            this.logger.error(msg);
            return { success: false, message: msg };
        }
    }

    /** Send a raw FTE JSON-RPC request and unwrap `_meta` if present. */
    private async rpc(client: Client, method: string, params: Record<string, unknown>): Promise<Record<string, unknown>> {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const raw = await (client as any).request({ method, params }, z.object({}).passthrough());
        return this.unwrap(raw);
    }

    private unwrap(r: Record<string, unknown>): Record<string, unknown> {
        if (r && typeof r === "object" && !Array.isArray(r)) {
            const k = Object.keys(r);
            if (k.length === 1 && k[0] === "_meta") return (r as any)._meta;
        }
        return r;
    }

    private fmt(b: number): string {
        if (b < 1024) return `${b} B`;
        if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
        return `${(b / (1024 * 1024)).toFixed(1)} MB`;
    }
}

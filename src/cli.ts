#!/usr/bin/env node

/**
 * mcp-fte — MCP File Transfer Extension CLI
 *
 * Test file transfers against any MCP server.
 * Supported transports: stdio, http (StreamableHTTP), reverse (mcp-reverse).
 *
 * Usage:
 *   mcp-fte probe --transport stdio --command "node server.js"
 *   mcp-fte pull file:///data/report.pdf --transport http --url http://localhost:3001/mcp -o ./report.pdf
 *   mcp-fte push ./report.pdf file:///data/report.pdf --transport stdio --command "node server.js"
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { z } from "zod";
import { Methods, EXTENSION_ID } from "./protocol.js";
import type { FteCapabilities, ReadInitResponse, ReadChunkResponse, WriteInitResponse, WriteChunkResponse } from "./protocol.js";

// ─── Constants ─────────────────────────────────────────────────────────
const DEFAULT_CHUNK_SIZE = 1024 * 1024; // 1 MiB
const FTE_ERROR_MESSAGES: Record<number, string> = {
    [-32000]: "TRANSFER_NOT_FOUND — The transfer session does not exist or has expired",
    [-32001]: "URI_NOT_ALLOWED — The URI scheme or path is not permitted",
    [-32002]: "INVALID_OFFSET — The read/write offset is out of range",
    [-32003]: "SESSION_EXPIRED — The transfer session expired (TTL exceeded)",
    [-32004]: "HASH_MISMATCH — The hash verification failed on write/close",
    [-32005]: "FILE_NOT_FOUND — The requested file does not exist",
    [-32006]: "PERMISSION_DENIED — Access to the file is denied",
    [-32007]: "WRITE_CONFLICT — The target file already exists (use --force to overwrite)",
};

// ─── Help ──────────────────────────────────────────────────────────────

function printHelp(): void {
    console.log(`
mcp-fte — MCP File Transfer Extension CLI

Test file transfers against any MCP server supporting the fte protocol.

Usage:
  mcp-fte <command> [options]

Commands:
  probe                 Check whether a server supports fte transfers
  pull <uri>            Download a file from a remote MCP server
  push <file> <uri>     Upload a local file to a remote MCP server

Transport options (required for all commands):
  --transport <type>    stdio | http | reverse
  --command <cmd>       (stdio) shell command to spawn the server
  --url <url>           (http) StreamableHTTP endpoint (e.g. http://host:port/mcp)
  --header <k:v>        (http) extra request header (repeatable)

Pull options:
  --output, -o <path>   Local output path (default: basename of uri)

Push options:
  --force               Allow overwriting an existing file on the server

Common options:
  --chunk-size <bytes>  Chunk size in bytes (default: 1048576)
  --help, -h            Show this help message

Examples:
  # stdio — spawn a child process
  $ mcp-fte probe --transport stdio --command "node my-fte-server.js"
  $ mcp-fte pull file:///data/report.pdf --transport stdio --command "node server.js" -o ./report.pdf

  # http — connect to a StreamableHTTP endpoint
  $ mcp-fte probe --transport http --url http://localhost:3001/mcp
  $ mcp-fte push ./data.csv file:///incoming/data.csv --transport http --url http://localhost:3001/mcp --force

  # reverse — connect through mcp-reverse gateway (coming soon)
  $ mcp-fte probe --transport reverse --url http://gateway:3000/api/mcp-reverse --header "Authorization: Bearer xxx"
`);
}

// ─── Arg Parsing ───────────────────────────────────────────────────────

interface ParsedArgs {
    command: "probe" | "pull" | "push" | "help";
    transport: "stdio" | "http" | "reverse";
    cmd?: string;
    url?: string;
    headers: Record<string, string>;
    uri?: string;
    localFile?: string;
    targetUri?: string;
    output?: string;
    force: boolean;
    chunkSize: number;
}

function parseArgs(raw: string[]): ParsedArgs {
    const result: ParsedArgs = {
        command: "help",
        transport: "stdio",
        headers: {},
        force: false,
        chunkSize: DEFAULT_CHUNK_SIZE,
    };

    let i = 0;
    const positional: string[] = [];

    while (i < raw.length) {
        const arg = raw[i];
        switch (arg) {
            case "probe":
            case "pull":
            case "push":
                result.command = arg;
                break;
            case "--help":
            case "-h":
                result.command = "help";
                break;
            case "--transport":
                result.transport = raw[++i] as ParsedArgs["transport"];
                break;
            case "--command":
                result.cmd = raw[++i];
                break;
            case "--url":
                result.url = raw[++i];
                break;
            case "--header": {
                const kv = raw[++i];
                const sep = kv.indexOf(":");
                if (sep > 0) {
                    result.headers[kv.slice(0, sep).trim()] = kv.slice(sep + 1).trim();
                }
                break;
            }
            case "--output":
            case "-o":
                result.output = raw[++i];
                break;
            case "--force":
                result.force = true;
                break;
            case "--chunk-size":
                result.chunkSize = parseInt(raw[++i], 10);
                break;
            default:
                if (!arg.startsWith("-")) {
                    positional.push(arg);
                }
                break;
        }
        i++;
    }

    if (result.command === "pull" && positional.length >= 1) {
        result.uri = positional[0];
    } else if (result.command === "push" && positional.length >= 2) {
        result.localFile = positional[0];
        result.targetUri = positional[1];
    }

    return result;
}

// ─── Transport Factory ─────────────────────────────────────────────────

function createTransport(args: ParsedArgs) {
    switch (args.transport) {
        case "stdio": {
            if (!args.cmd) throw new CLIError("--command is required for stdio transport");
            const [cmd, ...cmdArgs] = args.cmd.split(/\s+/);
            return new StdioClientTransport({ command: cmd, args: cmdArgs });
        }
        case "http": {
            if (!args.url) throw new CLIError("--url is required for http transport");
            return new StreamableHTTPClientTransport(new URL(args.url), {
                requestInit: Object.keys(args.headers).length > 0 ? { headers: args.headers } : undefined,
            });
        }
        case "reverse": {
            throw new CLIError(
                "Reverse transport is not yet implemented.\n" +
                "  The reverse transport depends on the mcp-reverse package.\n" +
                "  Track progress at: https://github.com/ChineseAStar/mcp-fte"
            );
        }
        default:
            throw new CLIError(`Unknown transport: ${args.transport}`);
    }
}

// ─── FTE RPC Helper ────────────────────────────────────────────────────

function unwrapMeta(raw: Record<string, unknown>): Record<string, unknown> {
    if (raw._meta && typeof raw._meta === "object" && raw._meta !== null) {
        const { _meta, ...rest } = raw;
        return rest;
    }
    return raw;
}

async function fteCall(client: Client, method: string, params: Record<string, unknown>): Promise<Record<string, unknown>> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw = await (client as any).request({ method, params }, z.object({}).passthrough()) as Record<string, unknown>;
    const data = unwrapMeta(raw);

    if (typeof data.code === "number" && typeof data.message === "string") {
        const code = data.code as number;
        const label = FTE_ERROR_MESSAGES[code] || `Unknown error code ${code}`;
        throw new Error(`${label}\n  Server message: ${data.message}`);
    }

    return data;
}

// ─── Commands ──────────────────────────────────────────────────────────

async function cmdProbe(client: Client): Promise<void> {
    const caps = client.getServerCapabilities();
    if (!caps) {
        console.log("❌ No capabilities received from server (initialize may have failed)");
        return;
    }

    const experimental = caps.experimental as Record<string, unknown> | undefined;
    const fte: FteCapabilities | undefined = experimental?.[EXTENSION_ID] as FteCapabilities | undefined;

    if (!fte) {
        console.log(`❌ Server does NOT support FTE (${EXTENSION_ID} not in capabilities.experimental)`);
        if (experimental) {
            console.log(`   experimental keys: ${Object.keys(experimental).join(", ")}`);
        }
        return;
    }

    console.log(`✅ Server supports FTE`);
    console.log(`   Supported schemes: ${fte.supported_schemes?.join(", ") || "(none)"}`);
    if (fte.max_chunk_size) {
        console.log(`   Max chunk size:    ${fte.max_chunk_size} bytes`);
    }
}

async function cmdPull(client: Client, args: ParsedArgs): Promise<void> {
    const uri = args.uri!;
    const outputPath = args.output || path.basename(uri.replace(/^[a-z]+:\/\//, "")) || "download.bin";
    const chunkSize = args.chunkSize;

    console.log(`📥 Pulling ${uri} → ${outputPath}`);

    const ri = await fteCall(client, Methods.READ_INIT, { uri }) as unknown as ReadInitResponse;
    console.log(`   Transfer ID: ${ri.transfer_id}`);
    console.log(`   Total size:  ${ri.total_size} bytes`);
    console.log(`   TTL:         ${ri.ttl}s`);

    const fd = fs.openSync(outputPath, "w");
    let offset = 0;
    const startTime = Date.now();

    try {
        while (offset < ri.total_size) {
            const length = Math.min(chunkSize, ri.total_size - offset);
            const rc = await fteCall(client, Methods.READ_CHUNK, {
                transfer_id: ri.transfer_id,
                offset,
                length,
            }) as unknown as ReadChunkResponse;

            const buf = Buffer.from(rc.data, "base64");
            fs.writeSync(fd, buf);
            offset += buf.length;

            const pct = ((offset / ri.total_size) * 100).toFixed(1);
            const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
            process.stdout.write(`\r   ${offset}/${ri.total_size} (${pct}%) — ${elapsed}s`);

            if (rc.eof) break;
        }
        console.log();

        await fteCall(client, Methods.READ_CLOSE, { transfer_id: ri.transfer_id });
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        const speed = offset > 0 ? (offset / (parseFloat(elapsed) || 0.001) / 1024 / 1024).toFixed(1) : "0";
        console.log(`✅ Downloaded ${offset} bytes in ${elapsed}s (${speed} MiB/s) → ${outputPath}`);
    } finally {
        fs.closeSync(fd);
    }
}

async function cmdPush(client: Client, args: ParsedArgs): Promise<void> {
    const localFile = args.localFile!;
    const targetUri = args.targetUri!;
    const chunkSize = args.chunkSize;

    if (!fs.existsSync(localFile)) {
        throw new CLIError(`Local file not found: ${localFile}`);
    }

    const stat = fs.statSync(localFile);
    const totalSize = stat.size;
    console.log(`📤 Pushing ${localFile} (${totalSize} bytes) → ${targetUri}`);

    const wi = await fteCall(client, Methods.WRITE_INIT, {
        uri: targetUri,
        expected_size: totalSize,
        force: args.force,
    }) as unknown as WriteInitResponse;
    console.log(`   Transfer ID: ${wi.transfer_id}`);
    console.log(`   TTL:         ${wi.ttl}s`);

    const fd = fs.openSync(localFile, "r");
    let offset = 0;
    const startTime = Date.now();

    try {
        while (offset < totalSize) {
            const length = Math.min(chunkSize, totalSize - offset);
            const buf = Buffer.alloc(length);
            fs.readSync(fd, buf, 0, length, offset);

            await fteCall(client, Methods.WRITE_CHUNK, {
                transfer_id: wi.transfer_id,
                offset,
                data: buf.toString("base64"),
            }) as unknown as WriteChunkResponse;

            offset += length;

            const pct = ((offset / totalSize) * 100).toFixed(1);
            const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
            process.stdout.write(`\r   ${offset}/${totalSize} (${pct}%) — ${elapsed}s`);
        }
        console.log();

        await fteCall(client, Methods.WRITE_CLOSE, { transfer_id: wi.transfer_id });
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        const speed = totalSize > 0 ? (totalSize / (parseFloat(elapsed) || 0.001) / 1024 / 1024).toFixed(1) : "0";
        console.log(`✅ Uploaded ${totalSize} bytes in ${elapsed}s (${speed} MiB/s) → ${targetUri}`);
    } finally {
        fs.closeSync(fd);
    }
}

// ─── CLI Error ─────────────────────────────────────────────────────────

class CLIError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "CLIError";
    }
}

// ─── Main ──────────────────────────────────────────────────────────────

async function main(): Promise<void> {
    const args = parseArgs(process.argv.slice(2));

    if (args.command === "help") {
        printHelp();
        process.exit(0);
    }

    if (!["stdio", "http", "reverse"].includes(args.transport)) {
        throw new CLIError(`Invalid transport: ${args.transport}. Use stdio, http, or reverse.`);
    }

    if (args.command === "pull" && !args.uri) {
        throw new CLIError("pull requires a URI. Usage: mcp-fte pull <uri> [options]");
    }
    if (args.command === "push" && (!args.localFile || !args.targetUri)) {
        throw new CLIError("push requires both <file> and <uri>. Usage: mcp-fte push <file> <uri> [options]");
    }

    console.log(`🔌 Connecting via ${args.transport}...`);

    const transport = createTransport(args);
    const client = new Client(
        { name: "fte-cli", version: "0.1.0" },
        { capabilities: {} },
    );

    try {
        await client.connect(transport);
        console.log("   Connected.");

        const serverInfo = client.getServerVersion();
        if (serverInfo) {
            console.log(`   Server: ${serverInfo.name} v${serverInfo.version}`);
        }

        switch (args.command) {
            case "probe": await cmdProbe(client); break;
            case "pull":  await cmdPull(client, args); break;
            case "push":  await cmdPush(client, args); break;
        }
    } finally {
        await client.close();
    }
}

main().catch((err) => {
    if (err instanceof CLIError) {
        console.error(`\nError: ${err.message}\n`);
        console.error("Run with --help for usage information.\n");
    } else {
        console.error(`\nFatal: ${(err as Error).message}\n`);
    }
    process.exit(1);
});

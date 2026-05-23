#!/usr/bin/env node
/**
 * fte-server — Example: Adding FTE to an MCP server over stdio
 *
 * Run:
 *   npx tsx examples/fte-server.ts
 *
 * Test with CLI:
 *   node dist/cli.js probe --transport stdio --command "npx tsx examples/fte-server.ts"
 *   node dist/cli.js pull file:///tmp/mcp-fte-server/hello.txt \
 *     --transport stdio --command "npx tsx examples/fte-server.ts"
 */

import * as fs from "node:fs";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { FteServer } from "../src/server.js";

const SANDBOX = "/tmp/mcp-fte-server";
fs.mkdirSync(SANDBOX, { recursive: true });

// 1. Create raw stdio transport, then wrap it with FTE.
//    The wrapper intercepts FTE methods (read/init, write/chunk, etc.) BEFORE
//    they reach your application handler. Your handler only sees non-FTE messages.
const rawTransport = new StdioServerTransport();
const transport = FteServer.wrapTransport(rawTransport, { sandbox: [SANDBOX] });

// 2. Set your application handler on the wrapped transport.
//    The wrapper's onmessage setter chains handlers: FTE → handled by wrapper,
//    everything else → forwarded to your handler.
transport.onmessage = async (msg: Record<string, unknown>) => {
    const method = msg.method as string | undefined;
    const id = msg.id as number | undefined;

    // --- MCP lifecycle ---
    if (method === "initialize") {
        transport.send?.({
            jsonrpc: "2.0", id,
            result: {
                protocolVersion: "2025-03-26",
                serverInfo: { name: "my-fte-server", version: "1.0.0" },
                capabilities: {
                    // Register your own tools/resources here...
                    tools: {},
                    // ...and advertise FTE support via experimental capabilities.
                    // Clients (e.g. `mcp-fte probe`) look for this key.
                    experimental: {
                        "cc.qqxing/file-transfer": {
                            supported_schemes: ["file"],
                        },
                    },
                },
            },
        } as any);
        return;
    }

    if (method === "notifications/initialized") return;
    if (method === "ping") {
        transport.send?.({ jsonrpc: "2.0", id, result: {} } as any);
        return;
    }

    // --- Your own tools go here ---
    // Example: respond to "echo" tool
    if (method === "tools/call" && (msg.params as any)?.name === "echo") {
        transport.send?.({
            jsonrpc: "2.0", id,
            result: {
                content: [{ type: "text", text: "Echo!" }],
            },
        } as any);
        return;
    }

    // Unknown method
    if (id !== undefined) {
        transport.send?.({
            jsonrpc: "2.0", id,
            error: { code: -32601, message: `Method not found: ${method}` },
        } as any);
    }
};

// 3. Start listening
transport.start?.();
console.error(`FTE server ready — sandbox: ${SANDBOX}`);
console.error(`Try: node dist/cli.js probe --transport stdio --command "npx tsx examples/fte-server.ts"`);

process.on("SIGINT", () => process.exit(0));
process.on("SIGTERM", () => process.exit(0));

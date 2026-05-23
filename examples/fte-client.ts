#!/usr/bin/env node
/**
 * fte-client — Example: Orchestrating file transfers between MCP servers
 *
 * Creates two in-memory FTE-capable servers and uses the `Fte` class
 * to transfer a file between them. Self-contained — no external servers needed.
 *
 * Run:
 *   npx tsx examples/fte-client.ts
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { Fte } from "../src/client.js";
import { FteServer } from "../src/server.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";

const SANDBOX = "/tmp/mcp-fte-demo";

function makeFteServer(sandbox: string): Transport {
    const pair = InMemoryTransport.createLinkedPair();
    // pair[0] = client side, pair[1] = server side
    const fteTransport = FteServer.wrapTransport(pair[1] as Transport, { sandbox: [sandbox] });

    // Set lifecycle handler. FTE methods (read/init, write/chunk, ...) are
    // intercepted by the wrapper. Everything else (initialize, ping) reaches
    // this handler.
    fteTransport.onmessage = (msg: any) => {
        const method = msg.method as string;
        if (method === "initialize") {
            fteTransport.send?.({
                jsonrpc: "2.0", id: msg.id,
                result: {
                    protocolVersion: "2025-03-26",
                    serverInfo: { name: "demo-server", version: "0.1.0" },
                    capabilities: {},
                },
            });
        } else if (method === "ping") {
            fteTransport.send?.({ jsonrpc: "2.0", id: msg.id, result: {} });
        }
    };

    return pair[0] as Transport; // return client-side transport
}

async function main(): Promise<void> {
    fs.mkdirSync(SANDBOX, { recursive: true });
    const srcPath = path.join(SANDBOX, "src.txt");
    fs.writeFileSync(srcPath, "Hello from FTE orchestrator!\n");

    // ── 1. Create two FTE-capable servers (in-memory) ──────────────────
    const transportA = makeFteServer(SANDBOX);
    const transportB = makeFteServer(SANDBOX);
    // Each returns a client-side transport to connect to

    // ── 2. Connect MCP clients ─────────────────────────────────────────
    const clientA = new Client({ name: "client-a", version: "0.1.0" }, { capabilities: {} });
    const clientB = new Client({ name: "client-b", version: "0.1.0" }, { capabilities: {} });
    await clientA.connect(transportA);
    await clientB.connect(transportB);

    // ── 3. Register with Fte orchestrator ──────────────────────────────
    const fte = new Fte();
    fte.register("server-a", clientA, {
        experimental: { "cc.qqxing/file-transfer": { supported_schemes: ["file"] } },
    });
    fte.register("server-b", clientB, {
        experimental: { "cc.qqxing/file-transfer": { supported_schemes: ["file"] } },
    });

    console.log(`✅ Servers registered: ${fte.available ? "server-a, server-b" : "none"}`);

    // ── 4. Transfer file from server-a → server-b ─────────────────────
    const sourceUri = `file://${srcPath}`;
    const targetUri = `file://${SANDBOX}/dst.txt`;

    console.log(`📋 Transferring ${sourceUri} → server-b:${targetUri}`);
    const result = await fte.transfer({
        source_server_id: "server-a",
        target_server_id: "server-b",
        source_uri: sourceUri,
        target_uri: targetUri,
    });

    console.log(`✅ Transferred ${result.bytes_transferred} bytes in ${(result.elapsed_ms ?? 0) / 1000}s`);
    console.log(`   ${result.message}`);

    // ── 5. Cleanup ─────────────────────────────────────────────────────
    await clientA.close();
    await clientB.close();
}

main().catch((err) => {
    console.error("Error:", err.message);
    process.exit(1);
});

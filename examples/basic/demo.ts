/**
 * Minimal FTE demo — test the engine via paired transports.
 *
 * Usage: npx tsx examples/basic/demo.ts
 */

import { Transport, TransportSendOptions } from "@modelcontextprotocol/sdk/shared/transport.js";
import { JSONRPCMessage, JSONRPCRequest } from "@modelcontextprotocol/sdk/types.js";
import { FteServer } from "../../src/server.js";
import { Methods } from "../../src/protocol.js";
import * as fs from "node:fs";
import * as crypto from "node:crypto";

const DIR_A = "/tmp/mcp-fte-demo-a";
const DIR_B = "/tmp/mcp-fte-demo-b";
const TEST_FILE = "data.bin";
const TEST_SIZE = 1024 * 1024;

// ── Paired transport ──

function paired(): [Transport, Transport] {
    let aCb: ((msg: JSONRPCMessage) => void) | null = null;
    let bCb: ((msg: JSONRPCMessage) => void) | null = null;

    const a: Transport = {
        start: async () => {},
        close: async () => {},
        send: async (msg) => { bCb?.(msg); },
        set onmessage(cb) { aCb = cb; },
        get onmessage() { return aCb!; },
        set onclose(cb: any) {},
        get onclose() { return undefined!; },
        set onerror(cb: any) {},
        get onerror() { return undefined!; },
    };
    const b: Transport = {
        start: async () => {},
        close: async () => {},
        send: async (msg) => { aCb?.(msg); },
        set onmessage(cb) { bCb = cb; },
        get onmessage() { return bCb!; },
        set onclose(cb: any) {},
        get onclose() { return undefined!; },
        set onerror(cb: any) {},
        get onerror() { return undefined!; },
    };
    return [a, b];
}

async function main() {
    fs.mkdirSync(DIR_A, { recursive: true });
    fs.mkdirSync(DIR_B, { recursive: true });
    const buf = crypto.randomBytes(TEST_SIZE);
    fs.writeFileSync(`${DIR_A}/${TEST_FILE}`, buf);
    const hash = crypto.createHash("sha256").update(buf).digest("hex");
    console.log(`Created ${(TEST_SIZE / 1024 / 1024).toFixed(1)}MB file, SHA256: ${hash.substring(0, 16)}...\n`);

    // Server A
    const [srvA, clientA] = paired();
    FteServer.wrapTransport(srvA, { sandbox: [DIR_A] }).onmessage = () => {};

    // Server B
    const [srvB, clientB] = paired();
    FteServer.wrapTransport(srvB, { sandbox: [DIR_B] }).onmessage = () => {};

    // Raw request helper
    let nextId = 1;
    async function send(t: Transport, method: string, params: Record<string, unknown>): Promise<any> {
        const id = nextId++;
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error(`timeout: ${method}`)), 5000);
            const prev = t.onmessage;
            t.onmessage = (msg: any) => {
                if (msg.id === id) {
                    clearTimeout(timer);
                    t.onmessage = prev;
                    if (msg.error) reject(new Error(`[${msg.error.code}] ${msg.error.message}`));
                    else resolve(msg.result);
                } else {
                    prev?.(msg);
                }
            };
            t.send({ jsonrpc: "2.0", id, method, params } as any).catch(reject);
        });
    }

    function unwrap(r: any): any {
        if (r && typeof r === "object" && !Array.isArray(r)) {
            const k = Object.keys(r);
            if (k.length === 1 && k[0] === "_meta") return r._meta;
        }
        return r;
    }

    // ── Transfer ──

    console.log("1. read/init");
    const ri = unwrap(await send(clientA, Methods.READ_INIT, { uri: `file://${DIR_A}/${TEST_FILE}` }));
    console.log(`   transfer_id=${ri.transfer_id}, size=${ri.total_size}`);

    console.log("2. write/init (force=true)");
    const wi = unwrap(await send(clientB, Methods.WRITE_INIT, { uri: `file://${DIR_B}/${TEST_FILE}`, expected_size: ri.total_size, force: true }));
    console.log(`   transfer_id=${wi.transfer_id}`);

    console.log("3. chunk loop");
    let offset = 0;
    let chunks = 0;
    while (offset < ri.total_size) {
        const rc = unwrap(await send(clientA, Methods.READ_CHUNK, { transfer_id: ri.transfer_id, offset, length: 1024 * 1024 }));
        const wc = unwrap(await send(clientB, Methods.WRITE_CHUNK, { transfer_id: wi.transfer_id, offset, data: rc.data }));
        offset += wc.bytes_written;
        chunks++;
        if (rc.eof) break;
    }
    console.log(`   ${chunks} chunks, ${(offset / 1024 / 1024).toFixed(1)}MB`);

    console.log("4. close");
    await send(clientA, Methods.READ_CLOSE, { transfer_id: ri.transfer_id });
    await send(clientB, Methods.WRITE_CLOSE, { transfer_id: wi.transfer_id });

    // ── Verify ──

    const output = fs.readFileSync(`${DIR_B}/${TEST_FILE}`);
    const outHash = crypto.createHash("sha256").update(output).digest("hex");
    console.log(`\n5. verify: ${hash === outHash ? "✅ PASS" : "❌ FAIL"}\n`);

    // ── force=false → WRITE_CONFLICT ──

    console.log("6. force=false → should throw WRITE_CONFLICT");
    try {
        await send(clientB, Methods.WRITE_INIT, { uri: `file://${DIR_B}/${TEST_FILE}`, expected_size: 100 });
        console.log("   ❌ FAIL — should have thrown");
    } catch (e: any) {
        console.log(`   ✅ ${e.message}`);
    }

    // ── INVALID_OFFSET ──

    console.log("7. offset out of range → should throw INVALID_OFFSET");
    // Re-init a read session to test offset validation
    const ri2 = unwrap(await send(clientA, Methods.READ_INIT, { uri: `file://${DIR_A}/${TEST_FILE}` }));
    try {
        await send(clientA, Methods.READ_CHUNK, { transfer_id: ri2.transfer_id, offset: 999999999, length: 1 });
        console.log("   ❌ FAIL");
    } catch (e: any) {
        console.log(`   ✅ ${e.message}`);
    }
    await send(clientA, Methods.READ_CLOSE, { transfer_id: ri2.transfer_id });

    // Cleanup
    fs.rmSync(DIR_A, { recursive: true, force: true });
    fs.rmSync(DIR_B, { recursive: true, force: true });
    console.log("\nDone.");
}

main().catch(e => { console.error(e); process.exit(1); });

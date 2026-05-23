/**
 * Minimal smoke test for protocol exports and constants.
 * NOTE: E2E tests (requiring running MCP servers) live under examples/basic/.
 */
import { describe, it } from "node:test";
import * as assert from "node:assert";
import {
    EXTENSION_ID,
    Methods,
    FteErrorCodes,
    Fte,
} from "../src/index.js";

describe("EXTENSION_ID", () => {
    it("should be the correct value", () => {
        assert.strictEqual(EXTENSION_ID, "cc.qqxing/file-transfer");
    });
});

describe("Methods", () => {
    it("should have 7 tool methods + 1 isFteMethod helper", () => {
        assert.strictEqual(Methods.READ_INIT, "cc.qqxing/file-transfer/read/init");
        assert.strictEqual(Methods.READ_CHUNK, "cc.qqxing/file-transfer/read/chunk");
        assert.strictEqual(Methods.READ_CLOSE, "cc.qqxing/file-transfer/read/close");
        assert.strictEqual(Methods.WRITE_INIT, "cc.qqxing/file-transfer/write/init");
        assert.strictEqual(Methods.WRITE_CHUNK, "cc.qqxing/file-transfer/write/chunk");
        assert.strictEqual(Methods.WRITE_CLOSE, "cc.qqxing/file-transfer/write/close");
        assert.strictEqual(Methods.ABORT, "cc.qqxing/file-transfer/abort");
    });

    it("isFteMethod should match FTE methods", () => {
        assert.strictEqual(Methods.isFteMethod("cc.qqxing/file-transfer/read/init"), true);
        assert.strictEqual(Methods.isFteMethod("some/other/tool"), false);
        assert.strictEqual(Methods.isFteMethod("cc.qqxing/file-transfer/"), true);
    });
});

describe("FteErrorCodes", () => {
    it("should define 8 error codes", () => {
        const codes = Object.values(FteErrorCodes);
        assert.strictEqual(codes.length, 8);
    });

    it("should not overlap", () => {
        const codes = Object.values(FteErrorCodes);
        assert.strictEqual(new Set(codes).size, codes.length);
    });

    it("should be in range -32000 to -32007", () => {
        const codes = Object.values(FteErrorCodes);
        for (const c of codes) {
            assert.ok(c <= -32000 && c >= -32007);
        }
    });
});

describe("Fte class", () => {
    it("should be constructable", () => {
        const fte = new Fte();
        assert.ok(fte instanceof Fte);
        assert.strictEqual(typeof fte.transfer, "function");
        assert.strictEqual(typeof fte.register, "function");
        assert.strictEqual(typeof fte.unregister, "function");
    });
});

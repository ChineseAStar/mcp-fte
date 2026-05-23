"use strict";
/**
 * MCP File Transfer Extension — protocol constants and types.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.FteErrorCodes = exports.Methods = exports.EXTENSION_ID = void 0;
exports.EXTENSION_ID = "cc.qqxing/file-transfer";
exports.Methods = {
    READ_INIT: "".concat(exports.EXTENSION_ID, "/read/init"),
    READ_CHUNK: "".concat(exports.EXTENSION_ID, "/read/chunk"),
    READ_CLOSE: "".concat(exports.EXTENSION_ID, "/read/close"),
    WRITE_INIT: "".concat(exports.EXTENSION_ID, "/write/init"),
    WRITE_CHUNK: "".concat(exports.EXTENSION_ID, "/write/chunk"),
    WRITE_CLOSE: "".concat(exports.EXTENSION_ID, "/write/close"),
    ABORT: "".concat(exports.EXTENSION_ID, "/abort"),
    isFteMethod: function (method) {
        return method.startsWith("".concat(exports.EXTENSION_ID, "/"));
    },
};
// ── Error codes ──
exports.FteErrorCodes = {
    TRANSFER_NOT_FOUND: -32000,
    URI_NOT_ALLOWED: -32001,
    INVALID_OFFSET: -32002,
    SESSION_EXPIRED: -32003,
    HASH_MISMATCH: -32004,
    FILE_NOT_FOUND: -32005,
    PERMISSION_DENIED: -32006,
    WRITE_CONFLICT: -32007,
};

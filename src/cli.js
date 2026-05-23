#!/usr/bin/env node
"use strict";
/**
 * fte — MCP File Transfer Extension CLI
 *
 * Test file transfers against any MCP server.
 *
 * Usage:
 *   fte probe --transport stdio --command "node server.js"
 *   fte pull file:///data/report.pdf --transport http --url http://localhost:3001/mcp --output ./report.pdf
 *   fte push ./report.pdf file:///data/report.pdf --transport sse --url http://localhost:3001/sse
 */
var __extends = (this && this.__extends) || (function () {
    var extendStatics = function (d, b) {
        extendStatics = Object.setPrototypeOf ||
            ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
            function (d, b) { for (var p in b) if (Object.prototype.hasOwnProperty.call(b, p)) d[p] = b[p]; };
        return extendStatics(d, b);
    };
    return function (d, b) {
        if (typeof b !== "function" && b !== null)
            throw new TypeError("Class extends value " + String(b) + " is not a constructor or null");
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var __rest = (this && this.__rest) || function (s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
            if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                t[p[i]] = s[p[i]];
        }
    return t;
};
var _a;
Object.defineProperty(exports, "__esModule", { value: true });
var fs = require("node:fs");
var path = require("node:path");
var index_js_1 = require("@modelcontextprotocol/sdk/client/index.js");
var stdio_js_1 = require("@modelcontextprotocol/sdk/client/stdio.js");
var sse_js_1 = require("@modelcontextprotocol/sdk/client/sse.js");
var streamableHttp_js_1 = require("@modelcontextprotocol/sdk/client/streamableHttp.js");
var zod_1 = require("zod");
var protocol_js_1 = require("./protocol.js");
// ─── Constants ─────────────────────────────────────────────────────────
var DEFAULT_CHUNK_SIZE = 1024 * 1024; // 1 MiB
var FTE_ERROR_MESSAGES = (_a = {},
    _a[-32000] = "TRANSFER_NOT_FOUND — The transfer session does not exist or has expired",
    _a[-32001] = "URI_NOT_ALLOWED — The URI scheme or path is not permitted",
    _a[-32002] = "INVALID_OFFSET — The read/write offset is out of range",
    _a[-32003] = "SESSION_EXPIRED — The transfer session expired (TTL exceeded)",
    _a[-32004] = "HASH_MISMATCH — The hash verification failed on write/close",
    _a[-32005] = "FILE_NOT_FOUND — The requested file does not exist",
    _a[-32006] = "PERMISSION_DENIED — Access to the file is denied",
    _a[-32007] = "WRITE_CONFLICT — The target file already exists (use --force to overwrite)",
    _a);
// ─── Help ──────────────────────────────────────────────────────────────
function printHelp() {
    console.log("\nfte \u2014 MCP File Transfer Extension CLI\n\nTest file transfers against any MCP server supporting the fte protocol.\n\nUsage:\n  fte <command> [options]\n\nCommands:\n  probe        Check whether a server supports fte transfers\n  pull <uri>   Download a file from a remote MCP server\n  push <file> <uri>  Upload a local file to a remote MCP server\n\nTransport options (required for all commands):\n  --transport <type>    stdio | sse | http\n  --command <cmd>       (stdio) shell command to spawn the server\n  --url <url>           (sse/http) server endpoint URL\n  --header <k:v>        (sse/http) extra request header (repeatable)\n\nPull options:\n  --output, -o <path>   Local file path to save (default: basename of uri)\n\nPush options:\n  --force               Allow overwriting an existing file on the server\n\nCommon options:\n  --chunk-size <bytes>  Chunk size in bytes (default: 1048576)\n  --help, -h            Show this help message\n\nExamples:\n  $ fte probe --transport stdio --command \"node my-fte-server.js\"\n  $ fte probe --transport http --url http://localhost:3001/mcp\n  $ fte pull file:///documents/report.pdf --transport sse --url http://localhost:3001/sse -o ./report.pdf\n  $ fte push ./data.csv file:///incoming/data.csv --transport http --url http://localhost:3001/mcp --force\n");
}
function parseArgs(raw) {
    var result = {
        command: "help",
        transport: "stdio",
        headers: {},
        force: false,
        chunkSize: DEFAULT_CHUNK_SIZE,
    };
    var i = 0;
    var positional = [];
    while (i < raw.length) {
        var arg = raw[i];
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
                result.transport = raw[++i];
                break;
            case "--command":
                result.cmd = raw[++i];
                break;
            case "--url":
                result.url = raw[++i];
                break;
            case "--header": {
                var kv = raw[++i];
                var sep = kv.indexOf(":");
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
    // Positional args
    if (result.command === "pull" && positional.length >= 1) {
        result.uri = positional[0];
    }
    else if (result.command === "push" && positional.length >= 2) {
        result.localFile = positional[0];
        result.targetUri = positional[1];
    }
    return result;
}
// ─── Transport Factory ─────────────────────────────────────────────────
function createTransport(args) {
    switch (args.transport) {
        case "stdio": {
            if (!args.cmd)
                throw new CLIError("--command is required for stdio transport");
            var _a = args.cmd.split(/\s+/), cmd = _a[0], cmdArgs = _a.slice(1);
            return new stdio_js_1.StdioClientTransport({ command: cmd, args: cmdArgs });
        }
        case "sse": {
            if (!args.url)
                throw new CLIError("--url is required for sse transport");
            return new sse_js_1.SSEClientTransport(new URL(args.url), {
                requestInit: args.headers ? { headers: args.headers } : undefined,
            });
        }
        case "http": {
            if (!args.url)
                throw new CLIError("--url is required for http transport");
            return new streamableHttp_js_1.StreamableHTTPClientTransport(new URL(args.url), {
                requestInit: args.headers ? { headers: args.headers } : undefined,
            });
        }
        default:
            throw new CLIError("Unknown transport: ".concat(args.transport));
    }
}
// ─── FTE RPC Helper ────────────────────────────────────────────────────
/**
 * Unwrap `_meta` nesting that Kotlin servers use.
 * Responses may be `{_meta:{}, actualKey: actualVal, ...}`.
 */
function unwrapMeta(raw) {
    if (raw._meta && typeof raw._meta === "object" && raw._meta !== null) {
        var _meta = raw._meta, rest = __rest(raw, ["_meta"]);
        return rest;
    }
    return raw;
}
/**
 * Call an FTE method on the connected client, unwrapping _meta and errors.
 */
function fteCall(client, method, params) {
    return __awaiter(this, void 0, void 0, function () {
        var raw, data, code, label;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, client.request({ method: method, params: params }, zod_1.z.object({}).passthrough())];
                case 1:
                    raw = _a.sent();
                    data = unwrapMeta(raw);
                    // Check for JSON-RPC error in response
                    if (typeof data.code === "number" && typeof data.message === "string") {
                        code = data.code;
                        label = FTE_ERROR_MESSAGES[code] || "Unknown error code ".concat(code);
                        throw new Error("".concat(label, "\n  Server message: ").concat(data.message));
                    }
                    return [2 /*return*/, data];
            }
        });
    });
}
// ─── Commands ──────────────────────────────────────────────────────────
function cmdProbe(client) {
    return __awaiter(this, void 0, void 0, function () {
        var caps, experimental, fte;
        var _a;
        return __generator(this, function (_b) {
            caps = client.getServerCapabilities();
            if (!caps) {
                console.log("❌ No capabilities received from server (initialize may have failed)");
                return [2 /*return*/];
            }
            experimental = caps.experimental;
            fte = experimental === null || experimental === void 0 ? void 0 : experimental[protocol_js_1.EXTENSION_ID];
            if (!fte) {
                console.log("\u274C Server does NOT support FTE (".concat(protocol_js_1.EXTENSION_ID, " not in capabilities.experimental)"));
                if (experimental) {
                    console.log("   experimental keys: ".concat(Object.keys(experimental).join(", ")));
                }
                return [2 /*return*/];
            }
            console.log("\u2705 Server supports FTE");
            console.log("   Supported schemes: ".concat(((_a = fte.supported_schemes) === null || _a === void 0 ? void 0 : _a.join(", ")) || "(none)"));
            if (fte.max_chunk_size) {
                console.log("   Max chunk size:    ".concat(fte.max_chunk_size, " bytes"));
            }
            return [2 /*return*/];
        });
    });
}
function cmdPull(client, args) {
    return __awaiter(this, void 0, void 0, function () {
        var uri, outputPath, chunkSize, ri, fd, offset, startTime, length_1, rc, buf, pct, elapsed_1, elapsed, speed;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    uri = args.uri;
                    outputPath = args.output || path.basename(uri.replace(/^[a-z]+:\/\//, "")) || "download.bin";
                    chunkSize = args.chunkSize;
                    console.log("\uD83D\uDCE5 Pulling ".concat(uri, " \u2192 ").concat(outputPath));
                    return [4 /*yield*/, fteCall(client, protocol_js_1.Methods.READ_INIT, { uri: uri })];
                case 1:
                    ri = _a.sent();
                    console.log("   Transfer ID: ".concat(ri.transfer_id));
                    console.log("   Total size:  ".concat(ri.total_size, " bytes"));
                    console.log("   TTL:         ".concat(ri.ttl, "s"));
                    fd = fs.openSync(outputPath, "w");
                    offset = 0;
                    startTime = Date.now();
                    _a.label = 2;
                case 2:
                    _a.trys.push([2, , 7, 8]);
                    _a.label = 3;
                case 3:
                    if (!(offset < ri.total_size)) return [3 /*break*/, 5];
                    length_1 = Math.min(chunkSize, ri.total_size - offset);
                    return [4 /*yield*/, fteCall(client, protocol_js_1.Methods.READ_CHUNK, {
                            transfer_id: ri.transfer_id,
                            offset: offset,
                            length: length_1,
                        })];
                case 4:
                    rc = _a.sent();
                    buf = Buffer.from(rc.data, "base64");
                    fs.writeSync(fd, buf);
                    offset += buf.length;
                    pct = ((offset / ri.total_size) * 100).toFixed(1);
                    elapsed_1 = ((Date.now() - startTime) / 1000).toFixed(1);
                    process.stdout.write("\r   ".concat(offset, "/").concat(ri.total_size, " (").concat(pct, "%) \u2014 ").concat(elapsed_1, "s"));
                    if (rc.eof)
                        return [3 /*break*/, 5];
                    return [3 /*break*/, 3];
                case 5:
                    console.log(); // newline after progress
                    // read/close
                    return [4 /*yield*/, fteCall(client, protocol_js_1.Methods.READ_CLOSE, { transfer_id: ri.transfer_id })];
                case 6:
                    // read/close
                    _a.sent();
                    elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
                    speed = offset > 0 ? (offset / (parseFloat(elapsed) || 0.001) / 1024 / 1024).toFixed(1) : "0";
                    console.log("\u2705 Downloaded ".concat(offset, " bytes in ").concat(elapsed, "s (").concat(speed, " MiB/s) \u2192 ").concat(outputPath));
                    return [3 /*break*/, 8];
                case 7:
                    fs.closeSync(fd);
                    return [7 /*endfinally*/];
                case 8: return [2 /*return*/];
            }
        });
    });
}
function cmdPush(client, args) {
    return __awaiter(this, void 0, void 0, function () {
        var localFile, targetUri, chunkSize, stat, totalSize, wi, fd, offset, startTime, length_2, buf, pct, elapsed_2, elapsed, speed;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    localFile = args.localFile;
                    targetUri = args.targetUri;
                    chunkSize = args.chunkSize;
                    if (!fs.existsSync(localFile)) {
                        throw new CLIError("Local file not found: ".concat(localFile));
                    }
                    stat = fs.statSync(localFile);
                    totalSize = stat.size;
                    console.log("\uD83D\uDCE4 Pushing ".concat(localFile, " (").concat(totalSize, " bytes) \u2192 ").concat(targetUri));
                    return [4 /*yield*/, fteCall(client, protocol_js_1.Methods.WRITE_INIT, {
                            uri: targetUri,
                            expected_size: totalSize,
                            force: args.force,
                        })];
                case 1:
                    wi = _a.sent();
                    console.log("   Transfer ID: ".concat(wi.transfer_id));
                    console.log("   TTL:         ".concat(wi.ttl, "s"));
                    fd = fs.openSync(localFile, "r");
                    offset = 0;
                    startTime = Date.now();
                    _a.label = 2;
                case 2:
                    _a.trys.push([2, , 7, 8]);
                    _a.label = 3;
                case 3:
                    if (!(offset < totalSize)) return [3 /*break*/, 5];
                    length_2 = Math.min(chunkSize, totalSize - offset);
                    buf = Buffer.alloc(length_2);
                    fs.readSync(fd, buf, 0, length_2, offset);
                    return [4 /*yield*/, fteCall(client, protocol_js_1.Methods.WRITE_CHUNK, {
                            transfer_id: wi.transfer_id,
                            offset: offset,
                            data: buf.toString("base64"),
                        })];
                case 4:
                    _a.sent();
                    offset += length_2;
                    pct = ((offset / totalSize) * 100).toFixed(1);
                    elapsed_2 = ((Date.now() - startTime) / 1000).toFixed(1);
                    process.stdout.write("\r   ".concat(offset, "/").concat(totalSize, " (").concat(pct, "%) \u2014 ").concat(elapsed_2, "s"));
                    return [3 /*break*/, 3];
                case 5:
                    console.log(); // newline after progress
                    // write/close
                    return [4 /*yield*/, fteCall(client, protocol_js_1.Methods.WRITE_CLOSE, { transfer_id: wi.transfer_id })];
                case 6:
                    // write/close
                    _a.sent();
                    elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
                    speed = totalSize > 0 ? (totalSize / (parseFloat(elapsed) || 0.001) / 1024 / 1024).toFixed(1) : "0";
                    console.log("\u2705 Uploaded ".concat(totalSize, " bytes in ").concat(elapsed, "s (").concat(speed, " MiB/s) \u2192 ").concat(targetUri));
                    return [3 /*break*/, 8];
                case 7:
                    fs.closeSync(fd);
                    return [7 /*endfinally*/];
                case 8: return [2 /*return*/];
            }
        });
    });
}
// ─── CLI Error ─────────────────────────────────────────────────────────
var CLIError = /** @class */ (function (_super) {
    __extends(CLIError, _super);
    function CLIError(message) {
        var _this = _super.call(this, message) || this;
        _this.name = "CLIError";
        return _this;
    }
    return CLIError;
}(Error));
// ─── Main ──────────────────────────────────────────────────────────────
function main() {
    return __awaiter(this, void 0, void 0, function () {
        var args, transport, client, initResult, _a;
        var _b, _c;
        return __generator(this, function (_d) {
            switch (_d.label) {
                case 0:
                    args = parseArgs(process.argv.slice(2));
                    if (args.command === "help") {
                        printHelp();
                        process.exit(0);
                    }
                    // Validate transport
                    if (!["stdio", "sse", "http"].includes(args.transport)) {
                        throw new CLIError("Invalid transport: ".concat(args.transport, ". Use stdio, sse, or http."));
                    }
                    // Validate command-specific requirements
                    if (args.command === "pull" && !args.uri) {
                        throw new CLIError("pull requires a URI argument. Usage: fte pull <uri> [options]");
                    }
                    if (args.command === "push" && (!args.localFile || !args.targetUri)) {
                        throw new CLIError("push requires both <localFile> and <uri>. Usage: fte push <file> <uri> [options]");
                    }
                    console.log("\uD83D\uDD0C Connecting to ".concat(args.transport, " server..."));
                    transport = createTransport(args);
                    client = new index_js_1.Client({ name: "fte-cli", version: "0.1.0" }, { capabilities: {} });
                    _d.label = 1;
                case 1:
                    _d.trys.push([1, , 11, 13]);
                    return [4 /*yield*/, client.connect(transport)];
                case 2:
                    _d.sent();
                    console.log("   Connected.");
                    return [4 /*yield*/, client.initialize({
                            protocolVersion: "2025-03-26",
                            capabilities: {},
                            clientInfo: { name: "fte-cli", version: "0.1.0" },
                        })];
                case 3:
                    initResult = _d.sent();
                    console.log("   Server: ".concat(((_b = initResult.serverInfo) === null || _b === void 0 ? void 0 : _b.name) || "unknown", " v").concat(((_c = initResult.serverInfo) === null || _c === void 0 ? void 0 : _c.version) || "?"));
                    console.log("   Protocol: ".concat(initResult.protocolVersion));
                    _a = args.command;
                    switch (_a) {
                        case "probe": return [3 /*break*/, 4];
                        case "pull": return [3 /*break*/, 6];
                        case "push": return [3 /*break*/, 8];
                    }
                    return [3 /*break*/, 10];
                case 4: return [4 /*yield*/, cmdProbe(client)];
                case 5:
                    _d.sent();
                    return [3 /*break*/, 10];
                case 6: return [4 /*yield*/, cmdPull(client, args)];
                case 7:
                    _d.sent();
                    return [3 /*break*/, 10];
                case 8: return [4 /*yield*/, cmdPush(client, args)];
                case 9:
                    _d.sent();
                    return [3 /*break*/, 10];
                case 10: return [3 /*break*/, 13];
                case 11: return [4 /*yield*/, client.close()];
                case 12:
                    _d.sent();
                    return [7 /*endfinally*/];
                case 13: return [2 /*return*/];
            }
        });
    });
}
main().catch(function (err) {
    if (err instanceof CLIError) {
        console.error("\nError: ".concat(err.message, "\n"));
        console.error("Run with --help for usage information.\n");
    }
    else {
        console.error("\nFatal: ".concat(err.message, "\n"));
    }
    process.exit(1);
});

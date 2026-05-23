# mcp-fte

MCP File Transfer Extension — TypeScript client & server library.

Chunk-based file transfer between MCP servers. Zero LLM context bloat.

## Install

```bash
npm install mcp-fte
```

## CLI

The `mcp-fte` command tests file transfers against any MCP server. See [docs/cli.md](docs/cli.md) for full usage.

```bash
# From source
node dist/cli.js probe --transport stdio --command "npx tsx examples/fte-server.ts"

# After npm install
mcp-fte probe --transport http --url http://localhost:3001/mcp

# Pull / push
mcp-fte pull file:///data/report.pdf --transport stdio --command "node server.js" -o ./report.pdf
mcp-fte push ./data.csv file:///incoming/data.csv --transport http --url http://localhost:3001/mcp --force
```

Transports: `stdio` (spawn child process), `http` (StreamableHTTP, requires GET+SSE server), `reverse` (coming soon).

## Client (Host Side)

Use `Fte` in any MCP host application that connects to multiple servers.

```typescript
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { Fte } from "mcp-fte";

// 1. connect to each MCP server as usual
const clientA = new Client({ name: "host", version: "1.0.0" });
await clientA.connect(new StdioClientTransport({ command: "server-a" }));
const capsA = clientA.getServerCapabilities();

const clientB = new Client({ name: "host", version: "1.0.0" });
await clientB.connect(new StdioClientTransport({ command: "server-b" }));
const capsB = clientB.getServerCapabilities();

// 2. register with Fte
const fte = new Fte({ chunkSize: 1024 * 1024 });
fte.register("server-a", clientA, capsA);
fte.register("server-b", clientB, capsB);

// 3. expose transfer tool to LLM when available
if (fte.available) {
    tools.push(fte.transferTool());
}

// 4. intercept tool calls
if (fte.isTransferTool(toolName)) {
    const args = JSON.parse(argsJson);
    const result = await fte.transfer(args);
    // → "Transferred 52.0 MB in 3.2s"
}
```

## Server Extension

```typescript
import { FteServer } from "mcp-fte";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

const transport = FteServer.wrapTransport(new StdioServerTransport(), {
    sandbox: ["/data/local/tmp"],   // enable file:// for this directory
    // sandbox: ["/"],              // enable file:// for entire filesystem
    // sandbox: undefined,          // disable file:// entirely (default)
    customHandlers: { content: new ContentHandler() },
});

const server = new McpServer({ name: "my-server", version: "1.0.0" });
await server.connect(transport);
```

## Sandbox & Security

| `sandbox` | file:// access |
|-----------|----------------|
| `undefined` (default) | none — file:// is disabled |
| `["/data"]` | only `/data` and its subdirectories |
| `["/"]` | entire filesystem (use only in dev/test) |
| `["/data", "/tmp"]` | multiple roots |

Path traversal (`..`) is always rejected regardless of sandbox setting.

## Custom URI Schemes

Implement `UriHandler` to support any URI scheme beyond `file://`:

```typescript
import { UriHandler } from "mcp-fte";

class ContentHandler implements UriHandler {
    readonly scheme = "content";

    getSize(uri: string): number {
        // query Android ContentResolver
        return 0;
    }
    read(uri: string, offset: number, length: number): Buffer {
        // ContentResolver.openInputStream() → skip(offset) → read(length)
        return Buffer.alloc(0);
    }
    write(uri: string, offset: number, data: Buffer): void {
        // throw new McpError(FteErrorCodes.PERMISSION_DENIED, "Read-only");
    }
    close(uri: string): void {}
}

// register via FteServerConfig
FteServer.wrapTransport(transport, {
    customHandlers: { content: new ContentHandler() },
});
```

## Access Control (Business Layer)

Apply custom rules inside your `UriHandler`. Throw `McpError` with an
`FteErrorCodes` code — the transport wrapper converts it to a standard
JSON-RPC error response without crashing the server.

```typescript
import { McpError } from "@modelcontextprotocol/sdk/types.js";
import { FteErrorCodes } from "mcp-fte";

read(uri: string, offset: number, length: number): Buffer {
    // block by extension
    if (uri.endsWith(".abc")) {
        throw new McpError(FteErrorCodes.PERMISSION_DENIED, "Forbidden: .abc files");
    }
    // time-based restrictions
    if (new Date().getHours() > 18) {
        throw new McpError(FteErrorCodes.PERMISSION_DENIED, "Read not allowed after 18:00");
    }
    // normal read
    return ...;
}
```

## Windows

`file://` URI on Windows: `file:///C:/data/local/tmp/file.bin`

Sandbox config: `sandbox: ["C:\\data"]` or `sandbox: ["C:/data"]`

Sandbox comparison is case-insensitive on Windows.

## Protocol

Extension ID: `cc.qqxing/file-transfer`

7 methods: `read/init`, `read/chunk`, `read/close`, `write/init`, `write/chunk`, `write/close`, `abort`.

Full spec: [PROTOCOL.md](./docs/spec/PROTOCOL.md)

## License

MIT

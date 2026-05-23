# Examples

## fte-server.ts — Add FTE to an MCP server

A minimal stdio MCP server with FTE file transfer support. Shows how to:

1. Create a raw transport (stdio)
2. Wrap it with `FteServer.wrapTransport()` — intercepts FTE requests
3. Handle MCP lifecycle (initialize, ping) in your application handler
4. Advertise FTE capabilities in the initialize response

```bash
npx tsx examples/fte-server.ts

# In another terminal — test with the CLI:
node dist/cli.js probe --transport stdio --command "npx tsx examples/fte-server.ts"
echo "hello" > /tmp/mcp-fte-server/hello.txt
node dist/cli.js pull file:///tmp/mcp-fte-server/hello.txt \
  --transport stdio --command "npx tsx examples/fte-server.ts"
```

## fte-client.ts — Orchestrate transfers between servers

A self-contained demo showing the `Fte` class API. Creates two in-memory
MCP servers, registers them with Fte, and transfers a file between them.

```bash
npx tsx examples/fte-client.ts

# Output:
# ✅ Servers registered: server-a, server-b
# 📋 Transferring file:///tmp/mcp-fte-demo/hello.txt → server-b:file:///tmp/mcp-fte-demo/copy.txt
# ✅ Transferred 13 bytes
#    Source hash:  abc123...
#    Target hash:  abc123...
#    Hash match:   ✅ YES
```

## See also

- Protocol spec: [docs/spec/PROTOCOL.md](docs/spec/PROTOCOL.md)
- CLI docs: [docs/cli.md](docs/cli.md)
- Integration tests: `tests/`

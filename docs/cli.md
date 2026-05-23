# mcp-fte CLI

Command-line tool for testing MCP File Transfer Extension against any MCP server.

## Installation

```bash
# From source (development)
cd mcp-fte-ts
npm install && npm run build
node dist/cli.js probe --transport stdio --command "node server.js"

# After npm publish (global)
npm install -g mcp-fte
mcp-fte probe --transport http --url http://localhost:3001/mcp

# After npm publish (one-shot)
npx mcp-mcp-fte probe --transport http --url http://localhost:3001/mcp
```

## Commands

### `probe` — Check FTE support

```
mcp-fte probe --transport stdio --command "node server.js"
mcp-fte probe --transport http --url http://localhost:3001/mcp
```

Outputs whether the server advertises `cc.qqxing/file-transfer` in its
experimental capabilities, plus supported URI schemes and max chunk size.

### `pull` — Download a file

```
mcp-fte pull <uri> --transport stdio --command "node server.js" [--output path]
```

- `<uri>` — Remote file URI (e.g. `file:///data/report.pdf`)
- `--output, -o` — Local save path (default: basename of URI)

Shows a progress bar with transfer speed.

### `push` — Upload a file

```
mcp-fte push <local-file> <target-uri> --transport stdio --command "node server.js" [--force]
```

- `<local-file>` — Local file to upload
- `<target-uri>` — Remote destination URI
- `--force` — Overwrite if target already exists

## Transports

| Transport | Required Flag | Description |
|-----------|--------------|-------------|
| `stdio` | `--command` | Spawn a child process, communicate via stdin/stdout |
| `http` | `--url` | Connect to a StreamableHTTP endpoint (e.g. `http://host:3001/mcp`) |
| `reverse` | *(coming soon)* | Connect through mcp-reverse gateway |

## Options

| Flag | Description |
|------|-------------|
| `--transport <type>` | `stdio`, `http`, or `reverse` (required) |
| `--command <cmd>` | Shell command to spawn the server (stdio only) |
| `--url <url>` | Server endpoint URL (http only) |
| `--header k:v` | Extra HTTP request header, repeatable (http only) |
| `--output, -o <path>` | Local output path for `pull` |
| `--force` | Overwrite existing file on `push` |
| `--chunk-size <bytes>` | Chunk size (default: 1048576 = 1 MiB) |
| `--help, -h` | Show help |

## Examples

```bash
# Probe a local FTE server
mcp-fte probe --transport stdio --command "node examples/fte-server.ts"

# Pull a file
mcp-fte pull file:///data/report.pdf \
  --transport stdio --command "node my-server.js" -o ./report.pdf

# Push a file to a remote StreamableHTTP server
mcp-fte push ./data.csv file:///incoming/data.csv \
  --transport http --url https://my-server.example.com/mcp \
  --header "Authorization: Bearer token123" --force
```

## Testing against the example server

The project includes a minimal FTE server for testing:

```bash
# In one terminal (or let the CLI spawn it)
npx tsx examples/fte-server.ts

# In another terminal
node dist/cli.js probe --transport stdio --command "npx tsx examples/fte-server.ts"

# Or let the CLI spawn the server automatically:
echo "hello" > /tmp/mcp-fte-server/hello.txt
node dist/cli.js pull file:///tmp/mcp-fte-server/hello.txt \
  --transport stdio --command "npx tsx examples/fte-server.ts"
```

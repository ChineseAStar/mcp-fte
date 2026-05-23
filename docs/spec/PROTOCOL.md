# MCP File Transfer Extension Protocol v1.0

Extension ID: `cc.qqxing/file-transfer`

## Capability Negotiation

Server declares support in `capabilities.experimental`:

```json
{
  "cc.qqxing/file-transfer": {
    "supported_schemes": ["file", "content"],
    "max_chunk_size": 2097152
  }
}
```

| Field | Required | Description |
|-------|:---:|------|
| `supported_schemes` | yes | URI schemes this server can read/write |
| `max_chunk_size` | no | Max bytes per chunk (default 1MB) |

## Methods

All methods use prefix `cc.qqxing/file-transfer/`. Binary data is Base64-encoded.

| Method | Direction | Params | Result |
|--------|-----------|--------|--------|
| `read/init` | C→S | `{ uri }` | `{ transfer_id, total_size, ttl }` |
| `read/chunk` | C→S | `{ transfer_id, offset, length }` | `{ data: base64, eof }` |
| `read/close` | C→S | `{ transfer_id }` | `{}` |
| `write/init` | C→S | `{ uri, expected_size?, force? }` | `{ transfer_id, ttl }` |
| `write/chunk` | C→S | `{ transfer_id, offset, data }` | `{ bytes_written }` |
| `write/close` | C→S | `{ transfer_id, hash_algorithm?, expected_hash? }` | `{ verified? }` |
| `abort` | C→S | `{ transfer_id }` | `{}` |

## Error Codes

| Code | Name | Description |
|------|------|-------------|
| -32000 | TRANSFER_NOT_FOUND | Session not exist or expired |
| -32001 | URI_NOT_ALLOWED | Scheme unsupported or path denied |
| -32002 | INVALID_OFFSET | Offset exceeds bounds |
| -32003 | SESSION_EXPIRED | TTL timeout |
| -32004 | HASH_MISMATCH | Verification failed |
| -32005 | FILE_NOT_FOUND | Resource not found |
| -32006 | PERMISSION_DENIED | Read/write denied |
| -32007 | WRITE_CONFLICT | Target already exists (pass `force: true` to overwrite) |

## URI Semantics

All resources are addressed by absolute URI. The `file://` scheme maps to the local filesystem. Additional schemes are supported via pluggable `UriHandler` implementations.

Path traversal (`..`) is always rejected by the SDK.

## Session Lifecycle

- Default TTL: 300s, reset on each `chunk` call
- `init` → `chunk × N` → `close` / `abort`
- TTL timeout at any stage → session destroyed

## Implementing Custom Schemes

Implement the `UriHandler` interface and register it via `FteConfig.customHandlers`. The handler receives the full URI string and is responsible for parsing scheme-specific components.

Throw protocol errors using `FteException(code, message)` — the SDK converts them to standard JSON-RPC error responses. The server process does not crash.

Example schemes: `content://` (Android Content Provider), `s3://` (AWS S3), `http://` (HTTP Range requests).

## SDK Compatibility

Kotlin SDK wraps response data in `EmptyResult._meta`. Clients must unwrap when `result` has exactly one key `_meta`.

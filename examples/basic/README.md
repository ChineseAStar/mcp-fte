# E2E Demo

自含式端到端测试，验证 FTE 协议的完整流程。不依赖任何外部 MCP Server。

## 运行

```bash
cd mcp-fte-ts
npx tsx examples/basic/demo.ts
```

## 测试项目

| # | 测试 | 预期 |
|---|------|------|
| 1 | `read/init` | 返回 transfer_id + total_size |
| 2 | `write/init` (force=true) | 覆盖已存在文件，返回 session |
| 3 | 分块传输 1MB 文件 | 1 chunk 完成，eof=true |
| 4 | `read/close` + `write/close` | 会话正常关闭 |
| 5 | SHA-256 校验 | 源和目标哈希一致 |
| 6 | `write/init` (force=false, 文件已存在) | `-32007 WRITE_CONFLICT` |
| 7 | `read/chunk` (offset 越界) | `-32002 INVALID_OFFSET` |

## 工作原理

通过内存中的 paired transport 模拟两个 FTE-wrapped Server，不启实际进程。
所有文件操作发生在 `/tmp/mcp-fte-demo-a/` 和 `/tmp/mcp-fte-demo-b/` 中，
运行结束后自动清理。

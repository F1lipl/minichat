# 仿微信即时通讯系统

这是一个基于 C++、Node.js、gRPC、MySQL 和 Redis 的仿微信即时通讯项目。系统支持邮箱验证码注册、登录、好友搜索、好友申请、好友认证、实时文本聊天、跨 ChatServer 消息转发、离线消息拉取和心跳保活。

## 性能压测结论

当前本地单机双 ChatServer Debug 环境下，系统可实时支撑 `10000` 条 TCP 长连接。在 `100` 倍 fanout 场景下，实时可用吞吐约 `500 message/s`，对应约 `50,000 notify/s` 实际推送，ACK/Notify 成功率 `100%`，Notify P95 `641ms`。继续升到 `1500-3000 message/s` 时仍可可靠投递，但 P95 延迟进入秒级到十秒级，更适合作为可靠峰值而不是实时聊天指标。

| 指标 | 结果 |
| --- | --- |
| 极限可用连接数 | `10000` TCP 长连接 |
| 实时可用吞吐 | 约 `500 message/s` |
| 实时推送吞吐 | 约 `50,000 notify/s` |
| 实时样本延迟 | ACK P95 `584ms`，Notify P95 `641ms` |
| 可靠性 | ACK/Notify 成功率 `100%` |
| 可靠峰值样本 | 约 `2997 message/s` / `299,500 notify/s`，Notify P95 `25.8s` |
| 主要瓶颈 | 高 fanout 下的连接写入和通知排队压力 |

详细整理见：[性能压测与优化说明](docs/performance-optimization.md)、[后端优化报告](load_results/optimization_report_20260602.md)、[推送吞吐报告](load_results/push_throughput_20260602.md)。

## 项目结构

| 目录 | 说明 |
| --- | --- |
| `WeChatClient` | 仿微信浏览器前端和 Node 本地桥接服务 |
| `GateServer` | C++ HTTP 网关，负责注册、登录、验证码、重置密码 |
| `VarifyServer` | Node gRPC 验证码服务，负责生成验证码并发送邮件 |
| `StatusServer` | C++ gRPC 状态服务，负责分配 ChatServer 和生成 token |
| `ChatSever` | C++ 聊天服务实例 chatserver1 |
| `ChatServer2` | C++ 聊天服务实例 chatserver2 |
| `docs` | 项目文档和架构图 |
| `load_results` | 压测结果、采样数据和压测报告 |

## 文档

- [项目文档](docs/project-documentation.md)
- [架构图](docs/architecture.md)
- [性能压测与优化说明](docs/performance-optimization.md)
- [极限可用压测报告](load_results/usable_limit_report_20260602.md)
- [后端优化报告](load_results/optimization_report_20260602.md)
- [推送吞吐报告](load_results/push_throughput_20260602.md)

## 默认端口

| 服务 | 端口 |
| --- | --- |
| WeChatClient | `5174` |
| GateServer | `8080` |
| VarifyServer | `50051` |
| StatusServer | `50052` |
| ChatServer1 TCP / RPC | `8090` / `50055` |
| ChatServer2 TCP / RPC | `8091` / `50056` |
| MySQL | `3308` |
| Redis | `6380` |

## 配置说明

真实配置文件包含邮箱授权码、数据库密码等敏感信息，不建议提交到 GitHub。仓库提供 `config.example.*` 作为模板，首次运行时复制为对应的 `config.ini` 或 `config.json` 后再填写本机配置。

## 启动顺序

1. 启动 MySQL 和 Redis。
2. 启动 VarifyServer。
3. 启动 StatusServer。
4. 启动 ChatServer1 和 ChatServer2。
5. 启动 GateServer。
6. 启动 WeChatClient。

WeChatClient 启动：

```powershell
cd D:\workspace\project\WeChatClient
npm start
```

浏览器访问：

```text
http://127.0.0.1:5174
```

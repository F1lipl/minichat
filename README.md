# 仿微信即时通讯系统

这是一个基于 C++、Node.js、gRPC、MySQL 和 Redis 的仿微信即时通讯项目。系统支持邮箱验证码注册、登录、好友搜索、好友申请、好友认证、实时文本聊天、跨 ChatServer 消息转发、离线消息拉取和心跳保活。

## 性能压测结论

当前本地单机双 ChatServer Debug 环境下，系统可实时支撑 `10000` 条 TCP 长连接、约 `200 msg/s` 消息吞吐，ACK/通知成功率 `100%`，P95 延迟约 `20-30ms`。当实际吞吐提升到约 `250 msg/s` 以上时，消息仍可可靠投递，但 P95 延迟上升到秒级，已不适合作为实时聊天可用指标。

| 指标 | 结果 |
| --- | --- |
| 极限可用连接数 | `10000` TCP 长连接 |
| 极限可用吞吐 | 约 `200 msg/s` |
| 可用样本延迟 | ACK P95 `26ms`，Notify P95 `23ms` |
| 可靠性 | ACK/Notify 成功率 `100%` |
| 不可用边界 | 约 `254 msg/s` 时 P95 升至 `3.7s` 左右 |

详细压测报告见：[MiniChat 极限可用压测报告](load_results/usable_limit_report_20260602.md)。

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
- [极限可用压测报告](load_results/usable_limit_report_20260602.md)

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

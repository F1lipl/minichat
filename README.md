# 仿微信即时通讯系统

这是一个基于 C++、Node.js、gRPC、MySQL 和 Redis 的仿微信即时通讯项目。系统支持邮箱验证码注册、登录、好友搜索、好友申请、好友认证、实时文本聊天、跨 ChatServer 消息转发、离线消息拉取和心跳保活。

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

## 文档

- [项目文档](docs/project-documentation.md)
- [架构图](docs/architecture.md)

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


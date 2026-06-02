# 仿微信即时通讯系统项目文档

最后更新：2026-06-02

## 1. 项目概述

本项目是一个仿微信的即时通讯系统，包含浏览器前端、HTTP 网关、验证码服务、状态服务、聊天服务集群、MySQL 数据库和 Redis 缓存。系统支持邮箱验证码注册、登录、好友搜索、好友申请、好友认证、实时文本聊天、跨聊天服务器消息转发、离线消息拉取和心跳保活等功能。

项目整体采用分层和服务拆分的方式设计。浏览器端通过本地 Node 桥接服务访问后端，HTTP 类业务由 GateServer 处理，聊天类业务通过自定义 TCP 协议连接 ChatServer，服务之间使用 gRPC 进行通信，数据落在 MySQL 与 Redis 中。

## 2. 项目亮点

- 多服务拆分：包含 GateServer、VarifyServer、StatusServer、ChatServer1、ChatServer2 和 WeChatClient。
- C++ 后端为主：核心网关、状态服务和聊天服务均使用 C++ 实现。
- gRPC 服务通信：验证码获取、聊天服务器分配、跨 ChatServer 通知均通过 gRPC 完成。
- Redis 状态管理：验证码、登录 token、用户在线服务器映射、用户基础信息缓存、离线消息队列。
- MySQL 业务持久化：用户、好友申请、好友关系等核心数据持久化。
- 支持多 ChatServer：用户可以被分配到不同聊天服务器，跨服好友申请和聊天消息可通过 gRPC 转发。
- 仿微信前端：包含登录、注册、会话、通讯录、好友申请和聊天窗口等页面。
- 离线消息能力：当接收方离线或会话不可达时，消息写入 Redis 队列，用户下次登录时拉取。
- 压测数据支撑：本地单机双 ChatServer Debug 环境下，实时可用压测达到 `10000` 条 TCP 长连接、约 `200 msg/s`，ACK/通知成功率 `100%`，P95 延迟约 `20-30ms`。

## 3. 技术栈

| 模块 | 技术 |
| --- | --- |
| 前端页面 | HTML、CSS、原生 JavaScript |
| 前端桥接服务 | Node.js、HTTP Server、TCP Socket、SSE |
| HTTP 网关 | C++、Boost.Asio、Boost.Beast、JsonCpp |
| 聊天服务 | C++、Boost.Asio、自定义 TCP 协议、JsonCpp |
| RPC 通信 | gRPC、Protocol Buffers |
| 验证码服务 | Node.js、@grpc/grpc-js、Nodemailer |
| 数据库 | MySQL |
| 缓存和状态 | Redis |
| 构建环境 | Visual Studio C++ 工程、npm |

## 4. 服务模块说明

### 4.1 WeChatClient

目录：`WeChatClient`

WeChatClient 是浏览器前端和本地桥接层。由于浏览器不能直接使用项目中的原生 TCP 协议连接 ChatServer，因此 `server.js` 提供了一个 Node 服务：

- 对浏览器提供静态页面。
- 将 `/api/gate/*` 请求转发到 GateServer。
- 使用 Node TCP Socket 连接 ChatServer。
- 将聊天服务端推送事件通过 SSE 转发给浏览器。
- 管理浏览器登录后的聊天 session。

默认端口：`127.0.0.1:5174`

核心接口：

| 接口 | 说明 |
| --- | --- |
| `GET /api/config` | 获取网关、状态服务、聊天默认配置和消息 ID |
| `POST /api/gate/get_varifycode` | 代理验证码请求 |
| `POST /api/gate/user_register` | 代理注册请求 |
| `POST /api/gate/reset_pwd` | 代理重置密码请求 |
| `POST /api/gate/user_login` | 代理登录请求 |
| `POST /api/chat/connect` | 建立 ChatServer TCP 会话并发送聊天登录 |
| `POST /api/chat/request` | 发送需要响应包的聊天请求 |
| `POST /api/chat/send` | 发送无需同步等待响应的聊天请求 |
| `GET /api/chat/events/:sessionId` | SSE 推送聊天通知 |
| `POST /api/chat/disconnect` | 断开聊天会话 |

### 4.2 GateServer

目录：`GateServer`

GateServer 是系统的 HTTP 网关，负责注册、登录、验证码、重置密码等账号相关接口。

默认端口：`8080`

主要职责：

- 解析 HTTP 请求和 JSON 请求体。
- 调用 VarifyServer 获取邮箱验证码。
- 从 Redis 校验验证码，验证码 key 前缀为 `code_`。
- 操作 MySQL 完成用户注册、密码校验和密码重置。
- 调用 StatusServer 获取可连接的 ChatServer 地址和登录 token。

核心 HTTP 接口：

| 接口 | 说明 |
| --- | --- |
| `POST /get_varifycode` | 调用验证码 gRPC 服务生成并发送验证码 |
| `POST /user_register` | 校验验证码后注册用户 |
| `POST /reset_pwd` | 校验验证码后重置密码 |
| `POST /user_login` | 校验账号密码，获取 ChatServer 地址和 token |

### 4.3 VarifyServer

目录：`VarifyServer`

VarifyServer 是 Node.js 实现的验证码 gRPC 服务，负责生成验证码、写入 Redis 并通过 SMTP 发送邮件。

默认端口：`50051`

gRPC 服务：

```protobuf
service VarifyService {
  rpc GetVarifyCode (GetVarifyReq) returns (GetVarifyRsp) {}
}
```

验证码规则：

- Redis key：`code_<email>`
- 验证码长度：4 位
- 有效期：60 秒
- 发送方式：SMTP 邮件

注意：`VarifyServer/config.json` 中包含邮箱授权码等敏感配置，后续建议改为环境变量或 `.env`，不要提交真实密钥。

### 4.4 StatusServer

目录：`StatusServer`

StatusServer 是聊天状态服务，负责给登录用户分配 ChatServer，并生成登录 token。

默认端口：`50052`

gRPC 服务：

```protobuf
service StatusService {
  rpc GetChatServer (GetChatServerReq) returns (GetChatServerRsp) {}
  rpc Login(LoginReq) returns(LoginRsp);
}
```

主要职责：

- 维护可用 ChatServer 列表。
- 按连接数或服务状态选择 ChatServer。
- 生成用户登录 token。
- 将 token 写入 Redis：`utoken_<uid>`。
- 为 ChatServer 登录校验提供 token 判断。

### 4.5 ChatSever / ChatServer2

目录：`ChatSever`、`ChatServer2`

这两个模块是聊天服务实例。它们功能基本一致，分别代表 `chatserver1` 和 `chatserver2`，用于模拟聊天服务集群。

默认端口：

| 服务 | TCP 端口 | gRPC 端口 |
| --- | --- | --- |
| chatserver1 | `8090` | `50055` |
| chatserver2 | `8091` | `50056` |

主要职责：

- 接收客户端 TCP 连接。
- 使用自定义协议解析消息包。
- 校验用户 token 并完成聊天登录。
- 维护用户 session 映射。
- 处理用户搜索、好友申请、好友认证、文本消息、心跳。
- 通过 Redis Set 记录用户当前在线的 ChatServer 集合：`uip_<uid>`。
- 通过 gRPC 给其他 ChatServer 转发好友申请、好友认证和文本消息通知。
- 读取 MySQL 中的好友申请和好友列表。
- 使用 Redis 队列保存离线消息：`offline_msg_<uid>`。

聊天协议消息 ID：

| 消息 ID | 名称 | 说明 |
| --- | --- | --- |
| `1005` | `MSG_CHAT_LOGIN` | 聊天服务登录 |
| `1006` | `MSG_CHAT_LOGIN_RSP` | 聊天登录响应 |
| `1007` | `ID_SEARCH_USER_REQ` | 搜索用户 |
| `1008` | `ID_SEARCH_USER_RSP` | 搜索用户响应 |
| `1009` | `ID_ADD_FRIEND_REQ` | 发起好友申请 |
| `1010` | `ID_ADD_FRIEND_RSP` | 好友申请响应 |
| `1011` | `ID_NOTIFY_ADD_FRIEND_REQ` | 通知收到好友申请 |
| `1013` | `ID_AUTH_FRIEND_REQ` | 同意好友申请 |
| `1014` | `ID_AUTH_FRIEND_RSP` | 好友认证响应 |
| `1015` | `ID_NOTIFY_AUTH_FRIEND_REQ` | 通知好友认证通过 |
| `1017` | `ID_TEXT_CHAT_MSG_REQ` | 发送文本消息 |
| `1018` | `ID_TEXT_CHAT_MSG_RSP` | 文本消息发送响应 |
| `1019` | `ID_NOTIFY_TEXT_CHAT_MSG_REQ` | 通知收到文本消息 |
| `1021` | `ID_NOTIFY_OFF_LINE_REQ` | 通知下线 |
| `1023` | `ID_HEART_BEAT_REQ` | 心跳请求 |
| `1024` | `ID_HEARTBEAT_RSP` | 心跳响应 |

## 5. 端口规划

| 服务 | 地址 | 端口 | 协议 | 说明 |
| --- | --- | --- | --- | --- |
| WeChatClient | `127.0.0.1` | `5174` | HTTP/SSE | 浏览器前端和桥接服务 |
| GateServer | `127.0.0.1` | `8080` | HTTP | 注册、登录、验证码、重置密码 |
| VarifyServer | `127.0.0.1` | `50051` | gRPC | 邮箱验证码服务 |
| StatusServer | `127.0.0.1` | `50052` | gRPC | 聊天服务器分配和 token 管理 |
| ChatServer1 | `0.0.0.0` | `8090` | TCP | 聊天客户端接入 |
| ChatServer1 RPC | `127.0.0.1` | `50055` | gRPC | 跨服消息通知 |
| ChatServer2 | `0.0.0.0` | `8091` | TCP | 聊天客户端接入 |
| ChatServer2 RPC | `127.0.0.1` | `50056` | gRPC | 跨服消息通知 |
| MySQL | `127.0.0.1` | `3308` | TCP | 业务数据存储 |
| Redis | `127.0.0.1` | `6380` | TCP | 验证码、token、在线状态、离线消息 |

## 6. 核心业务流程

### 6.1 注册流程

1. 用户在前端输入邮箱，请求验证码。
2. WeChatClient 调用 `/api/gate/get_varifycode`。
3. GateServer 调用 VarifyServer 的 `GetVarifyCode`。
4. VarifyServer 生成验证码，写入 Redis：`code_<email>`，TTL 为 60 秒。
5. VarifyServer 通过 SMTP 发送验证码邮件。
6. 用户提交用户名、邮箱、密码、验证码。
7. GateServer 从 Redis 读取验证码并校验。
8. 校验通过后，GateServer 写入 MySQL `user` 表。

### 6.2 登录流程

1. 用户输入邮箱和密码。
2. WeChatClient 调用 `/api/gate/user_login`。
3. GateServer 查询 MySQL 校验账号密码。
4. GateServer 调用 StatusServer 的 `GetChatServer`。
5. StatusServer 选择 ChatServer，生成 token 并写入 Redis：`utoken_<uid>`。
6. GateServer 将 `uid`、`token`、`host`、`port` 返回给前端。
7. WeChatClient 使用 TCP 连接对应 ChatServer。
8. ChatServer 校验 Redis 中的 token。
9. 登录成功后，ChatServer 返回用户信息、好友申请列表、好友列表和离线消息列表。
10. ChatServer 将当前服务名写入用户在线服务器集合：`SADD uip_<uid> chatserverX`。

### 6.3 好友申请流程

1. 用户 A 搜索用户 B。
2. 用户 A 发送好友申请。
3. ChatServer 将申请写入 MySQL `friend_apply`。
4. ChatServer 查询 Redis 的 `uip_<uid>` 判断用户 B 是否在线。
5. 如果 B 在线且在同一个 ChatServer，直接通过本地 session 推送 `1011`。
6. 如果 B 在线但在另一个 ChatServer，通过 gRPC 调用对方 ChatServer 的 `NotifyAddFriend`。
7. 如果 B 离线，申请仍保存在 MySQL，B 下次登录时通过 `apply_list` 拉取。

### 6.4 好友认证流程

1. 用户 B 同意用户 A 的好友申请。
2. ChatServer 更新 MySQL `friend_apply.status = 1`。
3. ChatServer 在 MySQL `friend` 表中写入双向好友关系。
4. 如果 A 在线，ChatServer 直接通知或通过跨服 gRPC 通知 A。
5. A 收到 `1015` 后，前端更新联系人列表。

### 6.5 文本聊天流程

1. 用户 A 发送文本消息。
2. ChatServer 返回 `1018` 表示发送请求已处理。
3. ChatServer 查询 Redis 的 `uip_<touid>` 判断用户 B 所在服务器。
4. 如果 B 在线且在本服，直接推送 `1019`。
5. 如果 B 在线且在其他 ChatServer，通过 gRPC `NotifyTextChatMsg` 转发。
6. 如果 B 离线或转发失败，消息写入 Redis：`offline_msg_<uid>`。
7. B 下次登录时，ChatServer 从 `offline_msg_<uid>` 最多弹出 200 条消息并返回给前端。

## 7. 数据设计

### 7.1 MySQL 主要表

当前代码中涉及的核心表如下：

| 表名 | 作用 | 主要字段 |
| --- | --- | --- |
| `user` | 用户基础信息 | `uid`、`name`、`email`、`pwd`、`nick`、`desc`、`sex`、`icon` |
| `user_id` | 用户 ID 自增辅助表 | `id` |
| `friend_apply` | 好友申请记录 | `id`、`from_uid`、`to_uid`、`status` |
| `friend` | 好友关系表 | `self_id`、`friend_id`、`back` |

说明：当前文本消息没有持久化到 MySQL 消息表，离线消息主要依赖 Redis 队列。后续如果要增强可靠性，可以新增 `message` 表记录消息投递状态。

### 7.2 Redis 主要 Key

| Key | 类型 | 作用 |
| --- | --- | --- |
| `code_<email>` | String + TTL | 邮箱验证码，60 秒过期 |
| `utoken_<uid>` | String | 用户登录 ChatServer 的 token |
| `uip_<uid>` | Set | 用户当前在线的 ChatServer 集合，用于多端登录和跨服消息 fan-out |
| `ubaseinfo_<uid>` | String JSON | 用户基础信息缓存 |
| `nameinfo_<name>` | String JSON | 用户名搜索缓存 |
| `logincount` | Hash | ChatServer 登录数量统计 |
| `offline_msg_<uid>` | List | 用户离线文本消息队列 |

## 8. 部署和启动说明

建议启动顺序：

1. 启动 MySQL，监听 `3308`。
2. 启动 Redis，监听 `6380`。
3. 启动 VarifyServer。
4. 启动 StatusServer。
5. 启动 ChatServer1 和 ChatServer2。
6. 启动 GateServer。
7. 启动 WeChatClient。

WeChatClient 启动命令：

```powershell
cd D:\workspace\project\WeChatClient
npm start
```

浏览器访问：

```text
http://127.0.0.1:5174
```

临时公网访问可以使用 Cloudflare Tunnel 将本地 `5174` 暴露出去：

```powershell
D:\workspace\project\tools\cloudflared.exe tunnel --url http://127.0.0.1:5174 --no-autoupdate
```

## 9. 性能压测结果

### 9.1 可用判定标准

本轮压测将“实时可用”定义为：

- ACK 成功率 = `100%`。
- 消息通知成功率 = `100%`。
- ACK P95 延迟 `<= 200ms`。
- Notify P95 延迟 `<= 200ms`。

超过该标准但仍无 ACK/通知丢失的结果，记为“可靠但不可实时使用”。

### 9.2 最终结论

当前本地单机双 ChatServer Debug 环境下，系统可实时支撑 `10000` 条 TCP 长连接、约 `200 msg/s` 消息吞吐，ACK/通知成功率 `100%`，P95 延迟约 `20-30ms`。

当实际吞吐提升到约 `250 msg/s` 以上时，消息仍能可靠投递，但 ACK/Notify P95 延迟上升到秒级，已经不适合作为实时聊天可用指标。

建议简历或答辩中使用如下表述：

> 本地单机双 ChatServer Debug 环境下，系统可实时支撑 `10000` 条 TCP 长连接、约 `200 msg/s` 消息吞吐，ACK/通知成功率 `100%`，P95 延迟约 `20-30ms`；当吞吐提升到约 `250 msg/s` 以上时，消息仍可可靠投递，但延迟进入秒级。

### 9.3 关键压测数据

| Label | 连接数 | 目标速率 | 实际速率 | ACK 成功率 | Notify 成功率 | ACK P95 | Notify P95 | 结论 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| `usable_conn1000_rate250` | 1000 | 250 | 200.12 msg/s | 100% | 100% | 40ms | 36ms | 可用 |
| `usable_conn1000_rate300_retest` | 1000 | 300 | 253.89 msg/s | 100% | 100% | 3526ms | 3347ms | 可靠但不可实时使用 |
| `usable_conn3000_rate250` | 3000 | 250 | 200.58 msg/s | 100% | 100% | 40ms | 37ms | 可用 |
| `usable_conn3000_rate300` | 3000 | 300 | 260.39 msg/s | 100% | 100% | 3129ms | 3215ms | 可靠但不可实时使用 |
| `usable_conn5000_rate250` | 5000 | 250 | 199.32 msg/s | 100% | 100% | 92ms | 90ms | 可用 |
| `usable_conn10000_rate250` | 10000 | 250 | 202.70 msg/s | 100% | 100% | 26ms | 23ms | 可用 |
| `usable_conn10000_rate300` | 10000 | 300 | 254.10 msg/s | 100% | 100% | 3741ms | 3751ms | 可靠但不可实时使用 |

### 9.4 测试环境

| 项目 | 配置 |
| --- | --- |
| OS | Microsoft Windows 11 家庭版 中文版, 10.0.26200, 64 位 |
| CPU | Intel(R) Core(TM) Ultra 9 185H |
| CPU 核心 | 16 核 / 22 逻辑处理器 |
| 内存 | 31.61 GB |
| Node.js | v24.11.1 |
| Redis | 5.0.14.1, `127.0.0.1:6380` |
| MySQL | 8.0.45, `127.0.0.1:3308` |
| 服务部署 | GateServer、ChatServer1、ChatServer2、Redis、MySQL 和压测客户端同机运行 |
| 编译环境 | 本地 Debug/开发环境 |

详细报告与 JSON 数据索引：

- `load_results/usable_limit_report_20260602.md`
- `load_results/usable_limit_report_20260602.json`

## 10. 当前已实现功能

- 邮箱验证码获取。
- 验证码 60 秒有效期。
- 邮件真实发送。
- 用户注册。
- 用户登录。
- 状态服务分配 ChatServer。
- TCP 聊天服务登录。
- 用户搜索。
- 好友申请。
- 好友申请实时通知。
- 好友申请离线拉取。
- 好友同意和双向好友关系建立。
- 文本消息发送。
- 跨 ChatServer 消息通知。
- 离线文本消息缓存和登录拉取。
- 心跳保活。
- 仿微信前端页面。
- 临时公网访问。

## 11. 可继续优化方向

- 使用 Release 编译重新压测，排除 Debug 构建对延迟和吞吐的影响。
- 将压测客户端与服务端拆到不同机器，减少单机资源竞争。
- 优化同步日志输出，改为异步日志或压测时降低日志级别。
- 使用 Docker Compose 一键启动 MySQL、Redis 和所有服务。
- 将数据库密码、邮箱授权码等敏感配置迁移到环境变量。
- 增加消息表，实现消息持久化、已读未读、送达状态和历史消息分页。
- 给 GateServer 增加接口鉴权、限流和请求日志。
- 给 ChatServer 增加断线重连、会话恢复和重复消息去重。
- 增加统一日志格式和错误码文档。
- 增加自动化测试，覆盖注册、登录、好友申请、离线消息和跨服消息。
- 修正项目中 `ChatSever` 的目录拼写，统一命名为 `ChatServer`。
- 将 StatusServer 的 ChatServer 选择策略完善为最小连接数或一致性哈希。
- 为公网访问增加 HTTPS 域名、反向代理和生产环境部署方案。

## 12. 答辩或面试讲解重点

可以重点讲以下内容：

- 为什么浏览器前端需要 Node 桥接层：浏览器不能直接连接原生 TCP 协议。
- 为什么拆分 GateServer、StatusServer 和 ChatServer：账号类 HTTP 业务、状态分配、长连接聊天解耦。
- Redis 在系统中的作用：验证码 TTL、token 校验、在线状态、用户缓存、离线消息。
- 多 ChatServer 如何通信：通过 `uip_<uid>` Set 找到用户在线的服务器集合，再用 gRPC 向目标 ChatServer 转发通知并对多端 session fan-out。
- 离线消息如何实现：接收方不在线时写入 Redis List，登录时批量 `LPop`。
- 好友申请为什么需要同时支持实时通知和登录拉取：在线体验和离线一致性都要保证。
- 性能压测结论：本地双 ChatServer Debug 环境下可实时支撑 `10000` 长连接、约 `200 msg/s`，超过约 `250 msg/s` 后开始出现秒级排队。
- 调试过程中解决过的问题：gRPC 调用失败、GateServer 超时、ChatServer 崩溃、跨服申请不显示、离线消息登录不可见。

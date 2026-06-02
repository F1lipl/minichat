# 仿微信即时通讯系统架构图

最后更新：2026-06-02

```mermaid
flowchart LR
  User["外部/本地用户<br/>浏览器访问"] --> Browser["仿微信前端页面<br/>HTML CSS JavaScript"]

  Browser -->|HTTP API| Client["WeChatClient<br/>Node 本地桥接服务<br/>127.0.0.1:5174"]
  Client -->|SSE 推送事件| Browser

  Client -->|HTTP<br/>注册 登录 验证码| Gate["GateServer<br/>C++ HTTP 网关<br/>:8080"]
  Client -->|TCP 自定义协议<br/>聊天长连接| Chat1["ChatServer1<br/>C++ TCP :8090<br/>gRPC :50055"]
  Client -->|TCP 自定义协议<br/>聊天长连接| Chat2["ChatServer2<br/>C++ TCP :8091<br/>gRPC :50056"]

  Gate -->|gRPC GetVarifyCode| Verify["VarifyServer<br/>Node gRPC 验证码服务<br/>:50051"]
  Gate -->|gRPC GetChatServer| Status["StatusServer<br/>C++ gRPC 状态服务<br/>:50052"]

  Verify -->|SMTP| Mail["邮箱服务<br/>发送 60 秒验证码"]

  Status -->|读取配置<br/>分配 ChatServer| ChatList["ChatServer 列表<br/>chatserver1 / chatserver2"]

  Chat1 <-->|gRPC<br/>好友申请 好友认证 文本消息| Chat2

  Gate -->|用户注册 登录 密码重置| MySQL[("MySQL<br/>cmr schema<br/>user / user_id / friend_apply / friend")]
  Chat1 -->|好友申请 好友关系 用户查询| MySQL
  Chat2 -->|好友申请 好友关系 用户查询| MySQL

  Verify -->|code_email<br/>验证码 TTL 60s| Redis[("Redis<br/>验证码 token 在线映射 缓存 离线消息")]
  Gate -->|读取 code_email| Redis
  Status -->|utoken_uid<br/>写入登录 token| Redis
  Chat1 -->|uip_uid / ubaseinfo_uid<br/>offline_msg_uid| Redis
  Chat2 -->|uip_uid / ubaseinfo_uid<br/>offline_msg_uid| Redis

  subgraph AccountFlow["账号链路"]
    Gate
    Verify
    Status
  end

  subgraph ChatCluster["聊天服务集群"]
    Chat1
    Chat2
  end

  subgraph Storage["数据与状态存储"]
    MySQL
    Redis
  end
```

## 架构说明

系统分为前端接入层、账号网关层、状态服务层、聊天服务集群和数据存储层。

WeChatClient 是浏览器和后端之间的桥接层。浏览器通过 HTTP 调用 WeChatClient，WeChatClient 再分别访问 GateServer 或 ChatServer。账号注册、登录、验证码等请求走 GateServer；聊天长连接、好友申请、好友认证和文本消息走 ChatServer TCP 协议。

GateServer 负责账号类 HTTP 接口。它通过 gRPC 调用 VarifyServer 生成验证码，通过 StatusServer 获取 ChatServer 地址和登录 token，并访问 MySQL / Redis 完成用户注册、登录和验证码校验。

StatusServer 负责聊天服务发现和 token 管理。用户登录成功后，StatusServer 选择一个 ChatServer，生成 token，并写入 Redis 的 `utoken_<uid>`。

ChatServer1 和 ChatServer2 构成聊天服务集群。用户登录聊天服务后，ChatServer 会把 `uip_<uid>` 写入 Redis，表示该用户当前在哪个聊天服务器。发送好友申请或文本消息时，如果目标用户在另一台 ChatServer，则通过 gRPC 跨服通知；如果目标用户离线，则写入 `offline_msg_<uid>`，下次登录时拉取。

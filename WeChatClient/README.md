# WeChatClient

这是一个仿微信桌面端风格的浏览器前端，并配了一个很薄的 Node 本地桥接层。

后端现状是：

- `GateServer` 提供 HTTP 接口：验证码、注册、重置密码、登录。
- `ChatServer2` 提供自定义 TCP 协议：登录聊天服、查找用户、好友申请、好友认证、文本消息、心跳。
- 浏览器不能直接连接原生 TCP，所以 `server.js` 会把浏览器请求转为后端 HTTP/TCP 调用。

## 启动

先启动你的后端服务，再运行：

```powershell
cd D:\workspace\project\WeChatClient
npm start
```

打开：

```text
http://127.0.0.1:5174
```

## 可配置环境变量

- `CHAT_CLIENT_PORT`：前端桥接服务端口，默认 `5174`
- `GATE_HOST`：GateServer 地址，默认读取 `GateServer/config.ini`，没有则用 `127.0.0.1`
- `GATE_PORT`：GateServer 端口，默认读取 `GateServer/config.ini`，没有则用 `8080`

## 已接入的后端能力

- 获取验证码：`POST /get_varifycode`
- 注册：`POST /user_register`
- 重置密码：`POST /reset_pwd`
- 登录网关：`POST /user_login`
- 登录聊天服：`MSG_CHAT_LOGIN`
- 搜索用户：`ID_SEARCH_USER_REQ`
- 添加好友：`ID_ADD_FRIEND_REQ`
- 同意好友申请：`ID_AUTH_FRIEND_REQ`
- 文本聊天：`ID_TEXT_CHAT_MSG_REQ`
- 接收好友申请、认证通过、文本消息通知
- 心跳保活

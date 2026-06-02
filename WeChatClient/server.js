const http = require("http");
const fs = require("fs");
const path = require("path");
const net = require("net");
const crypto = require("crypto");
const { EventEmitter } = require("events");

const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, "public");
const WORKSPACE_ROOT = path.resolve(ROOT, "..");
const MAX_BODY = 1024 * 1024;
const MAX_PACKET = 1024 * 2;

const MSG = {
  CHAT_LOGIN: 1005,
  CHAT_LOGIN_RSP: 1006,
  SEARCH_USER_REQ: 1007,
  SEARCH_USER_RSP: 1008,
  ADD_FRIEND_REQ: 1009,
  ADD_FRIEND_RSP: 1010,
  NOTIFY_ADD_FRIEND_REQ: 1011,
  AUTH_FRIEND_REQ: 1013,
  AUTH_FRIEND_RSP: 1014,
  NOTIFY_AUTH_FRIEND_REQ: 1015,
  TEXT_CHAT_MSG_REQ: 1017,
  TEXT_CHAT_MSG_RSP: 1018,
  NOTIFY_TEXT_CHAT_MSG_REQ: 1019,
  NOTIFY_OFF_LINE_REQ: 1021,
  HEART_BEAT_REQ: 1023,
  HEARTBEAT_RSP: 1024
};

const allowedGateRoutes = new Set([
  "get_varifycode",
  "user_register",
  "reset_pwd",
  "user_login"
]);

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ico": "image/x-icon"
};

function parseIni(filePath) {
  if (!fs.existsSync(filePath)) {
    return {};
  }

  const result = {};
  let section = "";
  const content = fs.readFileSync(filePath, "utf8");

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith(";") || line.startsWith("#")) {
      continue;
    }
    if (line.startsWith("[") && line.endsWith("]")) {
      section = line.slice(1, -1).trim();
      result[section] = result[section] || {};
      continue;
    }
    const eq = line.indexOf("=");
    if (eq === -1 || !section) {
      continue;
    }
    const key = line.slice(0, eq).trim();
    const value = line.slice(eq + 1).trim();
    result[section][key] = value;
  }

  return result;
}

const gateIni = parseIni(path.join(WORKSPACE_ROOT, "GateServer", "config.ini"));
const statusIni = parseIni(path.join(WORKSPACE_ROOT, "StatusServer", "config.ini"));
const chatIni = parseIni(path.join(WORKSPACE_ROOT, "ChatServer2", "config.ini"));

const runtimeConfig = {
  port: Number(process.env.CHAT_CLIENT_PORT || 5174),
  gate: {
    host: process.env.GATE_HOST || gateIni.GateServer?.Host || "127.0.0.1",
    port: Number(process.env.GATE_PORT || gateIni.GateServer?.Port || 8080)
  },
  status: {
    host: statusIni.StatusServer?.Host || "127.0.0.1",
    port: Number(statusIni.StatusServer?.Port || 50052)
  },
  chatDefaults: {
    selfName: chatIni.SelfServer?.Name || "chatserver2",
    host: normalizeHost(chatIni.SelfServer?.Host || "127.0.0.1"),
    port: Number(chatIni.SelfServer?.Port || 8091)
  }
};

const sessions = new Map();

class ChatSession extends EventEmitter {
  constructor({ uid, token, host, port }) {
    super();
    this.id = crypto.randomUUID();
    this.uid = Number(uid);
    this.token = token;
    this.host = normalizeHost(host);
    this.port = Number(port);
    this.status = "connecting";
    this.buffer = Buffer.alloc(0);
    this.socket = null;
    this.heartbeat = null;
    this.createdAt = Date.now();
  }

  connect() {
    return new Promise((resolve, reject) => {
      let settled = false;
      const done = (fn, value) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timer);
        fn(value);
      };

      const timer = setTimeout(() => {
        this.close();
        done(reject, new Error(`连接聊天服务器超时 ${this.host}:${this.port}`));
      }, 7000);

      this.socket = net.createConnection({ host: this.host, port: this.port }, () => {
        this.status = "connected";
        this.emitStatus("connected");
        this.startHeartbeat();
        done(resolve);
      });

      this.socket.on("data", (chunk) => this.handleData(chunk));
      this.socket.on("error", (error) => {
        this.emitStatus("error", error.message);
        done(reject, error);
      });
      this.socket.on("close", () => {
        this.status = "closed";
        this.stopHeartbeat();
        this.emitStatus("closed");
      });
    });
  }

  emitStatus(state, message = "") {
    this.emit("status", {
      state,
      message,
      sessionId: this.id,
      host: this.host,
      port: this.port,
      time: Date.now()
    });
  }

  startHeartbeat() {
    this.stopHeartbeat();
    this.heartbeat = setInterval(() => {
      if (this.status === "connected") {
        this.sendJson(MSG.HEART_BEAT_REQ, { fromuid: this.uid }).catch(() => {});
      }
    }, 25000);
  }

  stopHeartbeat() {
    if (this.heartbeat) {
      clearInterval(this.heartbeat);
      this.heartbeat = null;
    }
  }

  handleData(chunk) {
    this.buffer = Buffer.concat([this.buffer, chunk]);

    while (this.buffer.length >= 4) {
      const msgId = this.buffer.readUInt16BE(0);
      const length = this.buffer.readUInt16BE(2);

      if (length > MAX_PACKET) {
        this.emitStatus("error", `收到超过限制的数据包: ${length}`);
        this.close();
        return;
      }

      if (this.buffer.length < 4 + length) {
        return;
      }

      const bodyBuffer = this.buffer.subarray(4, 4 + length);
      this.buffer = this.buffer.subarray(4 + length);
      const raw = bodyBuffer.toString("utf8");
      let payload = {};

      try {
        payload = raw ? JSON.parse(raw) : {};
      } catch (error) {
        payload = { error: -2, raw, parseError: error.message };
      }

      this.emit("packet", {
        msgId,
        payload,
        raw,
        sessionId: this.id,
        time: Date.now()
      });
    }
  }

  async sendJson(msgId, payload) {
    if (!this.socket || this.status !== "connected") {
      throw new Error("聊天连接未建立");
    }

    const body = Buffer.from(JSON.stringify(payload || {}), "utf8");
    if (body.length > MAX_PACKET) {
      throw new Error(`消息过大，当前 ${body.length} 字节，最大 ${MAX_PACKET} 字节`);
    }

    const packet = Buffer.alloc(4 + body.length);
    packet.writeUInt16BE(Number(msgId), 0);
    packet.writeUInt16BE(body.length, 2);
    body.copy(packet, 4);

    await new Promise((resolve, reject) => {
      this.socket.write(packet, (error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }

  waitForPacket(msgId, timeoutMs = 6000) {
    const ids = Array.isArray(msgId) ? msgId.map(Number) : [Number(msgId)];

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error(`等待消息 ${ids.join(",")} 超时`));
      }, Number(timeoutMs) || 6000);

      const onPacket = (packet) => {
        if (!ids.includes(Number(packet.msgId))) {
          return;
        }
        cleanup();
        resolve(packet);
      };

      const onStatus = (status) => {
        if (status.state === "closed" || status.state === "error") {
          cleanup();
          reject(new Error(status.message || "聊天连接已断开"));
        }
      };

      const cleanup = () => {
        clearTimeout(timer);
        this.off("packet", onPacket);
        this.off("status", onStatus);
      };

      this.on("packet", onPacket);
      this.on("status", onStatus);
    });
  }

  close() {
    this.stopHeartbeat();
    this.status = "closed";
    if (this.socket) {
      this.socket.destroy();
      this.socket = null;
    }
  }
}

function normalizeHost(host) {
  const value = String(host || "").trim();
  if (!value || value === "0.0.0.0") {
    return "127.0.0.1";
  }
  return value;
}

function sendJson(res, statusCode, data) {
  const body = JSON.stringify(data);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body)
  });
  res.end(body);
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > MAX_BODY) {
        reject(new Error("请求体过大"));
        req.destroy();
      }
    });
    req.on("end", () => {
      if (!raw) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch (error) {
        reject(new Error("请求体不是合法 JSON"));
      }
    });
    req.on("error", reject);
  });
}

function proxyGate(route, body) {
  const payload = JSON.stringify(body || {});
  const options = {
    hostname: runtimeConfig.gate.host,
    port: runtimeConfig.gate.port,
    path: `/${route}`,
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(payload)
    },
    timeout: 10000
  };

  return new Promise((resolve, reject) => {
    const req = http.request(options, (gateRes) => {
      let raw = "";
      gateRes.setEncoding("utf8");
      gateRes.on("data", (chunk) => {
        raw += chunk;
      });
      gateRes.on("end", () => {
        let data = raw;
        try {
          data = raw ? JSON.parse(raw) : {};
        } catch (_) {
          data = { raw };
        }
        resolve({
          status: gateRes.statusCode || 200,
          data
        });
      });
    });

    req.on("timeout", () => {
      req.destroy(new Error("GateServer 响应超时"));
    });
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

async function handleApi(req, res, url) {
  if (req.method === "GET" && url.pathname === "/api/config") {
    sendJson(res, 200, {
      gate: runtimeConfig.gate,
      status: runtimeConfig.status,
      chatDefaults: runtimeConfig.chatDefaults,
      msg: MSG
    });
    return true;
  }

  if (req.method === "GET" && url.pathname.startsWith("/api/chat/events/")) {
    const sessionId = decodeURIComponent(url.pathname.split("/").pop());
    streamEvents(req, res, sessionId);
    return true;
  }

  if (!url.pathname.startsWith("/api/")) {
    return false;
  }

  try {
    if (req.method === "POST" && url.pathname.startsWith("/api/gate/")) {
      const route = decodeURIComponent(url.pathname.replace("/api/gate/", ""));
      if (!allowedGateRoutes.has(route)) {
        sendJson(res, 404, { error: -1, message: "未允许的 GateServer 路由" });
        return true;
      }
      const body = await readJsonBody(req);
      const gateReply = await proxyGate(route, body);
      sendJson(res, gateReply.status, gateReply.data);
      return true;
    }

    if (req.method === "POST" && url.pathname === "/api/chat/connect") {
      const body = await readJsonBody(req);
      const session = new ChatSession({
        uid: body.uid,
        token: body.token,
        host: body.host || runtimeConfig.chatDefaults.host,
        port: body.port || runtimeConfig.chatDefaults.port
      });

      sessions.set(session.id, session);
      await session.connect();
      let waiter = session.waitForPacket(MSG.CHAT_LOGIN_RSP, 6000);
      let packet;
      try {
        await session.sendJson(MSG.CHAT_LOGIN, {
          uid: Number(body.uid),
          token: String(body.token || "")
        });
        packet = await waiter;
      } catch (error) {
        waiter.catch(() => {});
        throw error;
      }
      sendJson(res, 200, {
        ok: packet.payload?.error === 0,
        sessionId: session.id,
        packet,
        host: session.host,
        port: session.port
      });
      return true;
    }

    if (req.method === "POST" && url.pathname === "/api/chat/request") {
      const body = await readJsonBody(req);
      const session = sessions.get(body.sessionId);
      if (!session) {
        sendJson(res, 404, { error: -1, message: "聊天会话不存在，请重新登录" });
        return true;
      }

      let waiter = session.waitForPacket(body.replyMsgId, body.timeoutMs || 7000);
      let packet;
      try {
        await session.sendJson(body.msgId, body.payload || {});
        packet = await waiter;
      } catch (error) {
        waiter.catch(() => {});
        throw error;
      }
      sendJson(res, 200, { ok: packet.payload?.error === 0, packet });
      return true;
    }

    if (req.method === "POST" && url.pathname === "/api/chat/send") {
      const body = await readJsonBody(req);
      const session = sessions.get(body.sessionId);
      if (!session) {
        sendJson(res, 404, { error: -1, message: "聊天会话不存在，请重新登录" });
        return true;
      }
      await session.sendJson(body.msgId, body.payload || {});
      sendJson(res, 200, { ok: true });
      return true;
    }

    if (req.method === "POST" && url.pathname === "/api/chat/disconnect") {
      const body = await readJsonBody(req);
      const session = sessions.get(body.sessionId);
      if (session) {
        session.close();
        sessions.delete(body.sessionId);
      }
      sendJson(res, 200, { ok: true });
      return true;
    }
  } catch (error) {
    sendJson(res, 502, {
      error: -1,
      message: error.message || "请求失败"
    });
    return true;
  }

  sendJson(res, 404, { error: -1, message: "接口不存在" });
  return true;
}

function streamEvents(req, res, sessionId) {
  const session = sessions.get(sessionId);
  if (!session) {
    sendJson(res, 404, { error: -1, message: "聊天会话不存在" });
    return;
  }

  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no"
  });

  const write = (event, data) => {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  const onPacket = (packet) => write("packet", packet);
  const onStatus = (status) => write("status", status);
  const keepAlive = setInterval(() => {
    res.write(": keep-alive\n\n");
  }, 15000);

  session.on("packet", onPacket);
  session.on("status", onStatus);
  write("status", {
    state: session.status,
    sessionId: session.id,
    host: session.host,
    port: session.port,
    time: Date.now()
  });

  req.on("close", () => {
    clearInterval(keepAlive);
    session.off("packet", onPacket);
    session.off("status", onStatus);
  });
}

function serveStatic(req, res, url) {
  let relativePath = decodeURIComponent(url.pathname);
  if (relativePath === "/") {
    relativePath = "/index.html";
  }

  const filePath = path.resolve(PUBLIC_DIR, `.${relativePath}`);
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.stat(filePath, (statError, stat) => {
    if (statError || !stat.isFile()) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not found");
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      "Content-Type": mimeTypes[ext] || "application/octet-stream"
    });
    fs.createReadStream(filePath).pipe(res);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "127.0.0.1"}`);
  const handled = await handleApi(req, res, url);
  if (!handled) {
    serveStatic(req, res, url);
  }
});

server.listen(runtimeConfig.port, "127.0.0.1", () => {
  console.log(`WeChatClient started: http://127.0.0.1:${runtimeConfig.port}`);
  console.log(`GateServer proxy: http://${runtimeConfig.gate.host}:${runtimeConfig.gate.port}`);
});

process.on("SIGINT", () => {
  for (const session of sessions.values()) {
    session.close();
  }
  server.close(() => process.exit(0));
});

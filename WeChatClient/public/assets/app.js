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
  HEARTBEAT_RSP: 1024,
  GET_CHAT_HISTORY_REQ: 1025,
  GET_CHAT_HISTORY_RSP: 1026,
  CREATE_GROUP_REQ: 1027,
  CREATE_GROUP_RSP: 1028,
  GET_GROUP_LIST_REQ: 1029,
  GET_GROUP_LIST_RSP: 1030,
  GET_GROUP_MEMBERS_REQ: 1031,
  GET_GROUP_MEMBERS_RSP: 1032,
  GROUP_TEXT_MSG_REQ: 1033,
  GROUP_TEXT_MSG_RSP: 1034
};

const HISTORY_PAGE_SIZE = 30;
// Sentinel prefix marking a chat message whose body is a file reference (JSON).
// Uses control chars so it can't collide with user-typed text.
const FILE_MARKER = "minichat-file";
// Group markers, shared with the C++ server (see const.h): a group message or
// group event rides inside the normal text-message channel.
const GROUP_MSG_MARKER = "minichat-gmsg";
const GROUP_EVENT_MARKER = "minichat-gevt";
const MAX_UPLOAD_MB = 20;

const errorText = {
  0: "成功",
  1001: "JSON 解析错误",
  1002: "RPC 请求失败",
  1003: "验证码已过期",
  1004: "验证码错误",
  1005: "用户已经存在",
  1006: "两次密码不一致",
  1007: "用户名与邮箱不匹配",
  1008: "密码更新失败",
  1009: "账号或密码错误",
  1010: "Token 已失效",
  1011: "用户不存在或 UID 无效",
  "-1": "服务请求失败",
  "-2": "聊天消息解析失败"
};

const app = document.querySelector("#app");

const state = {
  config: null,
  authMode: "login",
  sessionId: "",
  eventSource: null,
  connection: "offline",
  user: null,
  activeNav: "chat",
  chatType: "user",
  activeContactId: null,
  activeGroupId: null,
  contacts: [],
  conversations: [],
  groups: [],
  groupConversations: [],
  groupMembers: {},
  messages: {},
  history: {},
  requests: [],
  searchResult: null,
  lastSearch: "",
  showCreateGroup: false,
  pendingScroll: null
};

init();

async function init() {
  try {
    state.config = await apiGet("/api/config");
    renderAuth();
  } catch (error) {
    app.innerHTML = `
      <div class="boot-screen">
        <div class="boot-card">
          <img src="/assets/default-avatar.svg" alt="" class="boot-mark">
          <p>${escapeHtml(error.message || "前端桥接服务不可用")}</p>
        </div>
      </div>
    `;
  }
}

async function apiGet(url) {
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.message || `请求失败 ${response.status}`);
  }
  return data;
}

async function apiPost(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json"
    },
    body: JSON.stringify(body || {})
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.message || getErrorText(data.error) || `请求失败 ${response.status}`);
  }
  return data;
}

function renderAuth() {
  const gate = state.config?.gate || {};
  app.innerHTML = `
    <div class="auth-shell">
      <div class="auth-card">
        <aside class="auth-side">
          <div class="brand-row">
            <img src="/assets/default-avatar.svg" alt="">
            <div>
              <p class="brand-title">聊天室</p>
              <p class="brand-subtitle">GateServer + ChatServer</p>
            </div>
          </div>
          <div class="auth-copy">
            <h1>像微信一样聊天</h1>
            <p>登录后会通过本地桥接层连接你的 C++ TCP 聊天服务，支持查找用户、好友申请和文本消息。</p>
          </div>
          <div class="server-chip">GateServer ${escapeHtml(gate.host || "127.0.0.1")}:${escapeHtml(gate.port || "8080")}</div>
        </aside>

        <main class="auth-main">
          <div class="auth-tabs" role="tablist">
            ${authTab("login", "登录")}
            ${authTab("register", "注册")}
            ${authTab("reset", "重置密码")}
          </div>

          ${loginForm()}
          ${registerForm()}
          ${resetForm()}
        </main>
      </div>
    </div>
  `;

  bindAuthEvents();
}

function authTab(mode, label) {
  const active = state.authMode === mode ? " is-active" : "";
  return `<button class="auth-tab${active}" data-auth-tab="${mode}" type="button">${label}</button>`;
}

function loginForm() {
  const last = localStorage.getItem("wechat-client:last-account") || "";
  const active = state.authMode === "login" ? " is-active" : "";
  return `
    <form class="auth-form${active}" id="loginForm">
      <h2 class="form-title">登录</h2>
      <p class="form-note">使用后端 /user_login 返回的 uid、token、host、port 继续连接聊天服务器。</p>
      <div class="field-grid">
        <div class="field">
          <label for="loginEmail">邮箱</label>
          <input id="loginEmail" name="email" value="${escapeAttr(last)}" autocomplete="username" placeholder="例如 name@example.com" required>
        </div>
        <div class="field">
          <label for="loginPassword">密码</label>
          <input id="loginPassword" name="passwd" type="password" autocomplete="current-password" placeholder="请输入密码" required>
        </div>
      </div>
      <div class="submit-row">
        <span class="inline-hint" id="loginHint"></span>
        <button class="primary-btn" type="submit">${icon("message")}进入聊天</button>
      </div>
    </form>
  `;
}

function registerForm() {
  const active = state.authMode === "register" ? " is-active" : "";
  return `
    <form class="auth-form${active}" id="registerForm">
      <h2 class="form-title">注册</h2>
      <p class="form-note">验证码走 /get_varifycode，提交时使用 /user_register。</p>
      <div class="field-grid">
        <div class="field">
          <label for="registerEmail">邮箱</label>
          <div class="code-row">
            <input id="registerEmail" name="email" autocomplete="email" placeholder="用于接收验证码" required>
            <button class="ghost-btn" type="button" data-action="register-code">获取验证码</button>
          </div>
        </div>
        <div class="field">
          <label for="registerUser">用户名</label>
          <input id="registerUser" name="user" autocomplete="nickname" placeholder="用于搜索和展示" required>
        </div>
        <div class="field">
          <label for="registerPassword">密码</label>
          <input id="registerPassword" name="passwd" type="password" autocomplete="new-password" required>
        </div>
        <div class="field">
          <label for="registerConfirm">确认密码</label>
          <input id="registerConfirm" name="confirm" type="password" autocomplete="new-password" required>
        </div>
        <div class="field">
          <label for="registerCode">验证码</label>
          <input id="registerCode" name="varifycode" inputmode="text" placeholder="邮件中的验证码" required>
        </div>
        <div class="field">
          <label for="registerIcon">头像</label>
          <select id="registerIcon" name="icon">
            <option value="tone-0">青绿</option>
            <option value="tone-1">紫红</option>
            <option value="tone-2">橙红</option>
            <option value="tone-3">蓝绿</option>
          </select>
        </div>
      </div>
      <div class="submit-row">
        <span class="inline-hint" id="registerHint"></span>
        <button class="primary-btn" type="submit">${icon("check")}创建账号</button>
      </div>
    </form>
  `;
}

function resetForm() {
  const active = state.authMode === "reset" ? " is-active" : "";
  return `
    <form class="auth-form${active}" id="resetForm">
      <h2 class="form-title">重置密码</h2>
      <p class="form-note">使用用户名、邮箱和验证码调用 /reset_pwd 更新密码。</p>
      <div class="field-grid">
        <div class="field">
          <label for="resetEmail">邮箱</label>
          <div class="code-row">
            <input id="resetEmail" name="email" autocomplete="email" placeholder="注册邮箱" required>
            <button class="ghost-btn" type="button" data-action="reset-code">获取验证码</button>
          </div>
        </div>
        <div class="field">
          <label for="resetName">用户名</label>
          <input id="resetName" name="name" autocomplete="username" required>
        </div>
        <div class="field">
          <label for="resetPassword">新密码</label>
          <input id="resetPassword" name="passwd" type="password" autocomplete="new-password" required>
        </div>
        <div class="field">
          <label for="resetCode">验证码</label>
          <input id="resetCode" name="varifycode" required>
        </div>
      </div>
      <div class="submit-row">
        <span class="inline-hint" id="resetHint"></span>
        <button class="primary-btn" type="submit">${icon("check")}更新密码</button>
      </div>
    </form>
  `;
}

function bindAuthEvents() {
  app.querySelectorAll("[data-auth-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      state.authMode = button.dataset.authTab;
      renderAuth();
    });
  });

  app.querySelector("#loginForm")?.addEventListener("submit", handleLogin);
  app.querySelector("#registerForm")?.addEventListener("submit", handleRegister);
  app.querySelector("#resetForm")?.addEventListener("submit", handleReset);

  app.querySelector("[data-action='register-code']")?.addEventListener("click", () => {
    requestCode("registerEmail", "registerHint");
  });
  app.querySelector("[data-action='reset-code']")?.addEventListener("click", () => {
    requestCode("resetEmail", "resetHint");
  });
}

async function handleLogin(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector("button[type='submit']");
  const hint = form.querySelector("#loginHint");
  const email = form.email.value.trim();
  const passwd = form.passwd.value;

  setBusy(button, true);
  setHint(hint, "正在登录网关");

  try {
    const gateReply = await apiPost("/api/gate/user_login", { email, passwd });
    assertSuccess(gateReply);
    setHint(hint, "正在连接聊天服务器");

    const chatReply = await apiPost("/api/chat/connect", {
      uid: gateReply.uid,
      token: gateReply.token,
      host: gateReply.host,
      port: gateReply.port
    });

    assertSuccess(chatReply.packet?.payload || chatReply);
    const loginPayload = chatReply.packet?.payload || {};
    state.sessionId = chatReply.sessionId;
    state.connection = "connected";
    state.user = normalizeUser({
      ...loginPayload,
      uid: gateReply.uid,
      email: loginPayload.email || gateReply.email || email,
      token: gateReply.token,
      chatHost: chatReply.host || gateReply.host,
      chatPort: chatReply.port || gateReply.port
    });

    localStorage.setItem("wechat-client:last-account", email);
    loadLocalState();
    applyLoginLists(loginPayload);
    openEventStream();
    renderApp();
    // Pull the user's groups, then auto-load history for the default open chat.
    loadGroupList();
    if (state.activeNav === "chat" && state.chatType === "user" && state.activeContactId) {
      loadHistoryFor({ type: "user", uid: state.activeContactId }, { initial: true });
    }
    toast("登录成功");
  } catch (error) {
    setHint(hint, error.message, true);
    toast(error.message, "error");
  } finally {
    setBusy(button, false);
  }
}

async function handleRegister(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector("button[type='submit']");
  const hint = form.querySelector("#registerHint");
  const body = formData(form);

  setBusy(button, true);
  setHint(hint, "正在创建账号");

  try {
    const reply = await apiPost("/api/gate/user_register", body);
    assertSuccess(reply);
    state.authMode = "login";
    localStorage.setItem("wechat-client:last-account", body.email);
    renderAuth();
    toast(`注册成功，uid ${reply.uid || ""}`.trim());
  } catch (error) {
    setHint(hint, error.message, true);
    toast(error.message, "error");
  } finally {
    setBusy(button, false);
  }
}

async function handleReset(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector("button[type='submit']");
  const hint = form.querySelector("#resetHint");
  const body = formData(form);

  setBusy(button, true);
  setHint(hint, "正在更新密码");

  try {
    const reply = await apiPost("/api/gate/reset_pwd", body);
    assertSuccess(reply);
    state.authMode = "login";
    renderAuth();
    toast("密码已更新");
  } catch (error) {
    setHint(hint, error.message, true);
    toast(error.message, "error");
  } finally {
    setBusy(button, false);
  }
}

async function requestCode(inputId, hintId) {
  const input = app.querySelector(`#${inputId}`);
  const hint = app.querySelector(`#${hintId}`);
  const email = input?.value.trim();

  if (!email) {
    setHint(hint, "请先输入邮箱", true);
    input?.focus();
    return;
  }

  setHint(hint, "正在发送验证码");
  try {
    const reply = await apiPost("/api/gate/get_varifycode", { email });
    assertSuccess(reply);
    setHint(hint, "验证码已发送，请查看邮箱");
    toast("验证码已发送");
  } catch (error) {
    setHint(hint, error.message, true);
    toast(error.message, "error");
  }
}

function renderApp() {
  app.innerHTML = `
    <div class="app-shell ${state.activeNav === "chat" && (state.activeContactId || state.activeGroupId) ? "chat-open" : ""}">
      ${renderRail()}
      ${renderSidePanel()}
      ${renderMainPanel()}
    </div>
    ${state.showCreateGroup ? renderCreateGroupModal() : ""}
  `;

  bindAppEvents();
  applyPostRenderScroll();
}

function applyPostRenderScroll() {
  const pending = state.pendingScroll;
  state.pendingScroll = null;
  // When paging older messages we keep the viewport anchored on the message the
  // user was reading, instead of jumping to the bottom.
  if (pending && pending.mode === "preserve") {
    requestAnimationFrame(() => {
      const scroll = app.querySelector("#messageScroll");
      if (scroll) {
        scroll.scrollTop = scroll.scrollHeight - pending.prevBottomOffset;
      }
    });
    return;
  }
  scrollMessagesToBottom();
}

function renderRail() {
  return `
    <aside class="rail">
      <div class="rail-avatar">${avatarHtml(state.user, "avatar")}</div>
      <nav class="nav-stack" aria-label="主导航">
        ${railButton("chat", "message", "聊天", unreadTotal())}
        ${railButton("contacts", "users", "通讯录", 0)}
        ${railButton("requests", "user-plus", "好友申请", pendingRequestCount())}
      </nav>
      <div class="rail-spacer"></div>
      ${railButton("settings", "settings", "设置", 0)}
      <button class="rail-btn" data-action="logout" type="button" title="退出登录">${icon("logout")}</button>
    </aside>
  `;
}

function railButton(nav, iconName, label, badgeCount) {
  const active = state.activeNav === nav ? " is-active" : "";
  const badge = badgeCount ? `<span class="badge">${badgeCount > 99 ? "99+" : badgeCount}</span>` : "";
  return `<button class="rail-btn${active}" data-nav="${nav}" type="button" title="${label}">${icon(iconName)}${badge}</button>`;
}

function renderSidePanel() {
  const title = {
    chat: "聊天",
    contacts: "通讯录",
    requests: "好友申请",
    settings: "设置"
  }[state.activeNav] || "聊天";

  return `
    <section class="side-panel">
      <div class="side-top">
        <div class="search-row">
          <label class="search-box">
            ${icon("search")}
            <input id="globalSearch" value="${escapeAttr(state.lastSearch)}" placeholder="搜索用户名或 uid">
          </label>
          <button class="ghost-btn icon-btn" data-action="search-user" type="button" title="搜索">${icon("search")}</button>
        </div>
        <div class="side-title">
          <h2>${escapeHtml(title)}</h2>
          ${state.activeNav === "chat" ? `<button class="ghost-btn icon-btn" data-action="new-group" type="button" title="新建群聊">${icon("plus")}</button>` : ""}
          ${connectionBadge()}
        </div>
      </div>
      <div class="list">
        ${renderSideList()}
      </div>
    </section>
  `;
}

function renderCreateGroupModal() {
  const friends = [...state.contacts].sort((a, b) => displayName(a).localeCompare(displayName(b), "zh-CN"));
  const memberOptions = friends.length
    ? friends.map((c) => `
        <label class="member-pick">
          <input type="checkbox" name="group-member" value="${c.uid}">
          ${avatarHtml(c, "small-avatar")}
          <span>${escapeHtml(displayName(c))}</span>
        </label>
      `).join("")
    : `<div class="empty-state">先添加好友才能拉人建群</div>`;

  return `
    <div class="modal-mask" data-action="create-group-cancel">
      <div class="modal" data-action="modal-noop">
        <div class="modal-head">
          <h3>新建群聊</h3>
          <button class="icon-btn" data-action="create-group-cancel" type="button" title="关闭">${icon("x")}</button>
        </div>
        <div class="modal-body">
          <input id="groupNameInput" class="modal-input" placeholder="群名称" maxlength="60">
          <div class="member-pick-title">选择成员</div>
          <div class="member-pick-list">${memberOptions}</div>
        </div>
        <div class="modal-foot">
          <button class="ghost-btn" data-action="create-group-cancel" type="button">取消</button>
          <button class="primary-btn" data-action="create-group-submit" type="button">创建</button>
        </div>
      </div>
    </div>
  `;
}

function renderSideList() {
  if (state.activeNav === "chat") {
    return renderConversationList();
  }
  if (state.activeNav === "contacts") {
    return renderContactList();
  }
  if (state.activeNav === "requests") {
    return renderRequestListCompact();
  }
  return renderSettingsList();
}

function renderConversationList() {
  // Merge 1-1 conversations and group conversations into one time-sorted list.
  const userItems = sortedConversations().map((c) => {
    const contact = getContact(c.uid) || normalizeUser({ uid: c.uid });
    return {
      kind: "user",
      id: c.uid,
      name: displayName(contact),
      avatar: avatarHtml(contact, "avatar"),
      active: state.chatType === "user" && Number(state.activeContactId) === Number(c.uid),
      lastText: c.lastText,
      lastTime: c.lastTime,
      unread: c.unread
    };
  });
  const groupItems = sortedGroupConversations().map((g) => ({
    kind: "group",
    id: g.group_id,
    name: g.name || `群 ${g.group_id}`,
    avatar: groupAvatarHtml(g.name),
    active: state.chatType === "group" && Number(state.activeGroupId) === Number(g.group_id),
    lastText: g.lastText,
    lastTime: g.lastTime,
    unread: g.unread
  }));

  const items = [...userItems, ...groupItems]
    .sort((a, b) => Number(b.lastTime || 0) - Number(a.lastTime || 0));

  if (!items.length) {
    return `<div class="empty-state">还没有会话<br>搜索用户、发起聊天，或新建群聊</div>`;
  }

  return items.map((item) => {
    const action = item.kind === "group" ? "open-group" : "open-chat";
    return `
      <button class="list-item${item.active ? " is-active" : ""}" data-action="${action}" data-uid="${item.id}" type="button">
        ${item.avatar}
        <span class="item-main">
          <span class="item-title">
            <strong>${escapeHtml(item.name)}</strong>
            ${item.unread ? `<span class="badge">${item.unread > 99 ? "99+" : item.unread}</span>` : ""}
          </span>
          <span class="item-sub">${escapeHtml(previewText(item.lastText))}</span>
        </span>
        <span class="item-time">${formatListTime(item.lastTime)}</span>
      </button>
    `;
  }).join("");
}

function groupAvatarHtml(name) {
  const initial = Array.from(String(name || "群"))[0] || "群";
  return `<span class="avatar group-avatar">${escapeHtml(initial)}</span>`;
}

function renderContactList() {
  if (!state.contacts.length) {
    return `<div class="empty-state">通讯录为空<br>可以用上方搜索添加好友</div>`;
  }

  return [...state.contacts]
    .sort((a, b) => displayName(a).localeCompare(displayName(b), "zh-CN"))
    .map((contact) => {
      const active = Number(state.activeContactId) === Number(contact.uid) ? " is-active" : "";
      return `
        <button class="list-item${active}" data-action="open-contact" data-uid="${contact.uid}" type="button">
          ${avatarHtml(contact, "avatar")}
          <span class="item-main">
            <span class="item-title"><strong>${escapeHtml(displayName(contact))}</strong></span>
            <span class="item-sub">uid ${escapeHtml(contact.uid)}</span>
          </span>
        </button>
      `;
    }).join("");
}

function renderRequestListCompact() {
  const requests = state.requests.filter((item) => item.status !== "accepted");
  if (!requests.length) {
    return `<div class="empty-state">暂无新的好友申请</div>`;
  }

  return requests.map((request) => `
    <button class="list-item" data-action="focus-request" data-uid="${request.applyuid}" type="button">
      ${avatarHtml(request, "avatar")}
      <span class="item-main">
        <span class="item-title">
          <strong>${escapeHtml(displayName(request))}</strong>
          ${request.status === "pending" ? `<span class="badge">新</span>` : ""}
        </span>
        <span class="item-sub">${escapeHtml(request.desc || "请求添加你为好友")}</span>
      </span>
    </button>
  `).join("");
}

function renderSettingsList() {
  return `
    <div class="empty-state">
      当前账号<br>
      ${escapeHtml(displayName(state.user))}<br>
      uid ${escapeHtml(state.user?.uid || "")}
    </div>
  `;
}

function renderMainPanel() {
  if (state.activeNav === "chat") {
    return renderChatPanel();
  }
  if (state.activeNav === "contacts") {
    return renderContactsPanel();
  }
  if (state.activeNav === "requests") {
    return renderRequestsPanel();
  }
  return renderSettingsPanel();
}

function historyControlHtml(key, hasMessages) {
  const hist = state.history[key] || {};
  if (hist.loaded && !hist.noMore) {
    return `<div class="history-more"><button class="ghost-btn" data-action="load-history" type="button">加载更多历史消息</button></div>`;
  }
  if (hist.noMore && hasMessages) {
    return `<div class="history-end">没有更多历史消息了</div>`;
  }
  return "";
}

function composerHtml() {
  return `
    <form class="composer" id="composerForm">
      <div class="composer-tools">
        <button class="icon-btn" type="button" title="表情">${icon("smile")}</button>
        <button class="icon-btn" data-action="attach-file" type="button" title="发送图片或文件">${icon("paperclip")}</button>
        <input type="file" id="fileInput" hidden>
      </div>
      <textarea id="messageInput" placeholder="输入消息"></textarea>
      <div class="composer-actions">
        <span>Enter 发送，Shift + Enter 换行</span>
        <button class="primary-btn" type="submit">${icon("send")}发送</button>
      </div>
    </form>
  `;
}

function renderChatPanel() {
  if (state.chatType === "group") {
    return renderGroupChatPanel();
  }

  const contact = getContact(state.activeContactId);
  if (!contact) {
    return `
      <main class="main-panel">
        <div class="empty-state">选择一个会话开始聊天</div>
      </main>
    `;
  }

  const messages = state.messages[String(contact.uid)] || [];
  return `
    <main class="main-panel">
      <header class="chat-header">
        <button class="ghost-btn mobile-back" data-action="mobile-back" type="button">${icon("x")}返回</button>
        <div class="chat-title">
          <h2>${escapeHtml(displayName(contact))}</h2>
          <p>uid ${escapeHtml(contact.uid)}</p>
        </div>
        <div class="chat-tools">
          <button class="icon-btn" data-action="open-contact" data-uid="${contact.uid}" type="button" title="查看资料">${icon("more")}</button>
        </div>
      </header>

      <div class="message-scroll" id="messageScroll">
        ${historyControlHtml(String(contact.uid), messages.length > 0)}
        ${messages.length ? messages.map((message) => renderMessage(message, contact)).join("") : `<div class="empty-state">还没有消息</div>`}
      </div>

      ${composerHtml()}
    </main>
  `;
}

function renderGroupChatPanel() {
  const group = getGroup(state.activeGroupId);
  if (!group) {
    return `
      <main class="main-panel">
        <div class="empty-state">选择一个会话开始聊天</div>
      </main>
    `;
  }

  const key = `g${group.group_id}`;
  const messages = state.messages[key] || [];
  return `
    <main class="main-panel">
      <header class="chat-header">
        <button class="ghost-btn mobile-back" data-action="mobile-back" type="button">${icon("x")}返回</button>
        <div class="chat-title">
          <h2>${escapeHtml(group.name)}</h2>
          <p>${escapeHtml(group.member_count || "")} 名成员</p>
        </div>
        <div class="chat-tools">
          <button class="icon-btn" data-action="open-group-members" data-uid="${group.group_id}" type="button" title="查看群成员">${icon("users")}</button>
        </div>
      </header>

      <div class="message-scroll" id="messageScroll">
        ${historyControlHtml(key, messages.length > 0)}
        ${messages.length ? messages.map((message) => renderGroupMessage(message, group)).join("") : `<div class="empty-state">还没有消息</div>`}
      </div>

      ${composerHtml()}
    </main>
  `;
}

function renderGroupMessage(message, group) {
  const isMe = Number(message.fromuid) === Number(state.user.uid);
  const senderName = groupMemberName(group.group_id, message.fromuid);
  const avatarUser = isMe ? state.user : { uid: message.fromuid, name: senderName };
  const fileMeta = parseFileContent(message.content);
  const bubble = fileMeta
    ? renderFileBubble(fileMeta)
    : `<div class="bubble">${escapeHtml(message.content)}</div>`;
  const sender = isMe ? "" : `<div class="group-sender">${escapeHtml(senderName)}</div>`;
  const body = `
    <div>
      ${sender}
      ${bubble}
      <div class="message-meta">${formatTime(message.time)}${message.status === "failed" ? " 发送失败" : ""}</div>
    </div>
  `;
  const avatarNode = avatarHtml(avatarUser, "small-avatar");
  return `
    <div class="message-row${isMe ? " is-me" : ""}">
      ${isMe ? `${body}${avatarNode}` : `${avatarNode}${body}`}
    </div>
  `;
}

function renderMessage(message, contact) {
  const isMe = Number(message.fromuid) === Number(state.user.uid);
  const avatar = isMe ? state.user : contact;
  const fileMeta = parseFileContent(message.content);
  const bubble = fileMeta
    ? renderFileBubble(fileMeta)
    : `<div class="bubble">${escapeHtml(message.content)}</div>`;
  const body = `
    <div>
      ${bubble}
      <div class="message-meta">${formatTime(message.time)}${message.status === "failed" ? " 发送失败" : ""}</div>
    </div>
  `;
  const avatarNode = avatarHtml(avatar, "small-avatar");

  return `
    <div class="message-row${isMe ? " is-me" : ""}">
      ${isMe ? `${body}${avatarNode}` : `${avatarNode}${body}`}
    </div>
  `;
}

function renderFileBubble(meta) {
  const url = `/api/file/${encodeURIComponent(meta.id)}`;
  if (meta.kind === "image") {
    return `
      <a class="image-bubble" href="${url}" target="_blank" rel="noopener">
        <img src="${url}" alt="${escapeAttr(meta.name || "image")}" loading="lazy">
      </a>
    `;
  }
  return `
    <a class="file-bubble" href="${url}" download="${escapeAttr(meta.name || "file")}">
      <span class="file-bubble-icon">${icon("paperclip")}</span>
      <span class="file-bubble-info">
        <span class="file-bubble-name">${escapeHtml(meta.name || "文件")}</span>
        <span class="file-bubble-size">${formatFileSize(meta.size)}</span>
      </span>
    </a>
  `;
}

function renderContactsPanel() {
  const result = state.searchResult ? renderSearchResult() : "";
  const contact = getContact(state.activeContactId);
  return `
    <main class="main-panel">
      <div class="panel-view">
        <section class="content-section">
          <div class="section-header">
            <div>
              <h2>通讯录</h2>
              <p>搜索后可以发起好友申请，也可以从已有联系人进入聊天。</p>
            </div>
          </div>
          ${result}
          ${contact ? renderContactDetail(contact) : `<div class="empty-state">选择一个联系人查看资料</div>`}
        </section>
      </div>
    </main>
  `;
}

function renderSearchResult() {
  const user = state.searchResult;
  return `
    <div class="result-card">
      ${avatarHtml(user, "avatar")}
      <div class="card-title">
        <strong>${escapeHtml(displayName(user))}</strong>
        <span>uid ${escapeHtml(user.uid)} ${user.email ? ` · ${escapeHtml(user.email)}` : ""}</span>
      </div>
      <button class="mini-btn" data-action="add-friend" data-uid="${user.uid}" type="button">${icon("user-plus")}添加</button>
    </div>
  `;
}

function renderContactDetail(contact) {
  return `
    <div class="profile-detail">
      <div class="profile-head">
        ${avatarHtml(contact, "avatar")}
        <div>
          <h3>${escapeHtml(displayName(contact))}</h3>
          <p>uid ${escapeHtml(contact.uid)}</p>
        </div>
      </div>
      <dl class="settings-grid">
        <dt>昵称</dt>
        <dd>${escapeHtml(contact.nick || contact.name || "未设置")}</dd>
        <dt>邮箱</dt>
        <dd>${escapeHtml(contact.email || "未返回")}</dd>
        <dt>签名</dt>
        <dd>${escapeHtml(contact.desc || "这个人很安静")}</dd>
      </dl>
      <div class="profile-actions">
        <button class="primary-btn" data-action="open-chat" data-uid="${contact.uid}" type="button">${icon("message")}发消息</button>
        <button class="ghost-btn" data-action="add-friend" data-uid="${contact.uid}" type="button">${icon("user-plus")}重新申请</button>
      </div>
    </div>
  `;
}

function renderRequestsPanel() {
  const requests = state.requests.filter((request) => request.status !== "accepted");
  return `
    <main class="main-panel">
      <div class="panel-view">
        <section class="content-section">
          <div class="section-header">
            <div>
              <h2>好友申请</h2>
              <p>在线申请会通过 ID_NOTIFY_ADD_FRIEND_REQ 实时推送到这里。</p>
            </div>
          </div>
          ${requests.length ? requests.map(renderRequestCard).join("") : `<div class="empty-state">暂无新的好友申请</div>`}
        </section>
      </div>
    </main>
  `;
}

function renderRequestCard(request) {
  return `
    <div class="request-card">
      ${avatarHtml(request, "avatar")}
      <div class="card-title">
        <strong>${escapeHtml(displayName(request))}</strong>
        <span>uid ${escapeHtml(request.applyuid)} ${request.desc ? ` · ${escapeHtml(request.desc)}` : ""}</span>
      </div>
      <button class="mini-btn" data-action="accept-request" data-uid="${request.applyuid}" type="button">${icon("check")}同意</button>
    </div>
  `;
}

function renderSettingsPanel() {
  const gate = state.config?.gate || {};
  const status = state.config?.status || {};
  return `
    <main class="main-panel">
      <div class="panel-view">
        <section class="content-section">
          <div class="section-header">
            <div>
              <h2>设置</h2>
              <p>这里展示前端读取到的后端连接信息，不暴露 Redis 或 MySQL 密码。</p>
            </div>
          </div>
          <div class="settings-box">
            <dl class="settings-grid">
              <dt>当前账号</dt>
              <dd>${escapeHtml(displayName(state.user))} · uid ${escapeHtml(state.user?.uid || "")}</dd>
              <dt>连接状态</dt>
              <dd>${connectionBadge(true)}</dd>
              <dt>GateServer</dt>
              <dd>${escapeHtml(gate.host || "")}:${escapeHtml(gate.port || "")}</dd>
              <dt>StatusServer</dt>
              <dd>${escapeHtml(status.host || "")}:${escapeHtml(status.port || "")}</dd>
              <dt>ChatServer</dt>
              <dd>${escapeHtml(state.user?.chatHost || "")}:${escapeHtml(state.user?.chatPort || "")}</dd>
              <dt>本地会话</dt>
              <dd>${escapeHtml(state.sessionId || "未建立")}</dd>
            </dl>
          </div>
          <button class="danger-btn" data-action="logout" type="button">${icon("logout")}退出登录</button>
        </section>
      </div>
    </main>
  `;
}

function bindAppEvents() {
  app.onclick = async (event) => {
    const navButton = event.target.closest("[data-nav]");
    if (navButton) {
      state.activeNav = navButton.dataset.nav;
      if (state.activeNav !== "chat") {
        app.querySelector(".app-shell")?.classList.remove("chat-open");
      }
      renderApp();
      return;
    }

    const actionButton = event.target.closest("[data-action]");
    if (!actionButton) {
      return;
    }

    const action = actionButton.dataset.action;
    const uid = Number(actionButton.dataset.uid);

    if (action === "logout") {
      await logout();
    }
    if (action === "search-user") {
      await searchUser();
    }
    if (action === "open-chat") {
      openChat(uid);
    }
    if (action === "open-group") {
      openGroup(uid);
    }
    if (action === "load-history") {
      await loadHistoryFor(activeChatTarget(), { initial: false });
    }
    if (action === "attach-file") {
      app.querySelector("#fileInput")?.click();
    }
    if (action === "new-group") {
      openCreateGroup();
    }
    if (action === "create-group-cancel") {
      closeCreateGroup();
    }
    if (action === "create-group-submit") {
      await submitCreateGroup();
    }
    if (action === "open-group-members") {
      loadGroupMembers(uid, { toastList: true });
    }
    if (action === "open-contact") {
      openContact(uid);
    }
    if (action === "add-friend") {
      await addFriend(uid);
    }
    if (action === "accept-request") {
      await acceptRequest(uid);
    }
    if (action === "focus-request") {
      state.activeNav = "requests";
      renderApp();
    }
    if (action === "mobile-back") {
      app.querySelector(".app-shell")?.classList.remove("chat-open");
    }
  };

  app.onkeydown = async (event) => {
    if (event.target?.id === "globalSearch" && event.key === "Enter") {
      event.preventDefault();
      await searchUser();
    }

    if (event.target?.id === "messageInput" && event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      app.querySelector("#composerForm")?.requestSubmit();
    }
  };

  app.querySelector("#composerForm")?.addEventListener("submit", sendMessage);
  app.querySelector("#fileInput")?.addEventListener("change", handleFileSelected);
}

async function handleFileSelected(event) {
  const input = event.currentTarget;
  const file = input.files && input.files[0];
  input.value = "";
  if (file) {
    await uploadAndSendFile(file);
  }
}

async function searchUser() {
  const input = app.querySelector("#globalSearch");
  const query = input?.value.trim();
  if (!query) {
    input?.focus();
    return;
  }

  state.lastSearch = query;
  try {
    const reply = await chatRequest(MSG.SEARCH_USER_REQ, MSG.SEARCH_USER_RSP, { uid: query });
    assertSuccess(reply.packet.payload);
    const found = normalizeUser(reply.packet.payload);
    if (!found.uid) {
      throw new Error("后端没有返回用户 uid");
    }
    state.searchResult = found;
    mergeContact(found, { silent: true });
    state.activeNav = "contacts";
    state.activeContactId = found.uid;
    persistLocalState();
    renderApp();
    toast("已找到用户");
  } catch (error) {
    toast(error.message, "error");
  }
}

function openContact(uid) {
  const contact = getContact(uid);
  if (!contact) {
    return;
  }
  state.activeNav = "contacts";
  state.activeContactId = Number(uid);
  renderApp();
}

function openChat(uid) {
  const contact = getContact(uid) || state.searchResult;
  if (!contact || !contact.uid) {
    return;
  }
  mergeContact(contact, { silent: true });
  ensureConversation(contact.uid).unread = 0;
  state.activeNav = "chat";
  state.chatType = "user";
  state.activeContactId = Number(contact.uid);
  state.activeGroupId = null;
  persistLocalState();
  renderApp();
  // Lazy-load the latest page of persisted history the first time a chat opens.
  loadHistoryFor({ type: "user", uid: contact.uid }, { initial: true });
}

function openGroup(group_id) {
  const group = getGroup(group_id);
  if (!group) {
    return;
  }
  ensureGroupConversation(group.group_id).unread = 0;
  state.activeNav = "chat";
  state.chatType = "group";
  state.activeGroupId = Number(group.group_id);
  state.activeContactId = null;
  persistLocalState();
  renderApp();
  loadGroupMembers(group.group_id);
  loadHistoryFor({ type: "group", group_id: group.group_id }, { initial: true });
}

async function addFriend(uid) {
  const target = getContact(uid) || state.searchResult;
  if (!target?.uid) {
    toast("请先搜索到一个用户", "error");
    return;
  }

  try {
    const reply = await chatRequest(MSG.ADD_FRIEND_REQ, MSG.ADD_FRIEND_RSP, {
      uid: Number(state.user.uid),
      applyname: displayName(state.user),
      bakname: "",
      touid: Number(target.uid)
    });
    assertSuccess(reply.packet.payload);
    toast("好友申请已发送");
  } catch (error) {
    toast(error.message, "error");
  }
}

async function acceptRequest(uid) {
  const request = state.requests.find((item) => Number(item.applyuid) === Number(uid));
  if (!request) {
    return;
  }

  try {
    const reply = await chatRequest(MSG.AUTH_FRIEND_REQ, MSG.AUTH_FRIEND_RSP, {
      fromuid: Number(state.user.uid),
      touid: Number(request.applyuid),
      back: request.name || request.nick || ""
    });
    assertSuccess(reply.packet.payload);
    request.status = "accepted";
    mergeContact(normalizeUser({
      ...request,
      ...reply.packet.payload,
      uid: reply.packet.payload.uid || request.applyuid
    }));
    persistLocalState();
    renderApp();
    toast("已同意好友申请");
  } catch (error) {
    toast(error.message, "error");
  }
}

async function sendMessage(event) {
  event.preventDefault();
  const textarea = app.querySelector("#messageInput");
  const text = textarea?.value.trim();
  if (!text) {
    return;
  }
  if (state.chatType === "group") {
    if (textarea) {
      textarea.value = "";
    }
    await sendGroupContent(text);
    return;
  }

  const contact = getContact(state.activeContactId);
  if (!contact) {
    return;
  }

  const msgid = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
  const localMessage = {
    id: msgid,
    fromuid: Number(state.user.uid),
    touid: Number(contact.uid),
    content: text,
    time: Date.now(),
    status: "sending"
  };

  textarea.value = "";
  appendMessage(contact.uid, localMessage);
  renderApp();

  try {
    const reply = await chatRequest(MSG.TEXT_CHAT_MSG_REQ, MSG.TEXT_CHAT_MSG_RSP, {
      fromuid: Number(state.user.uid),
      touid: Number(contact.uid),
      text_array: [{ msgid, content: text }]
    });
    assertSuccess(reply.packet.payload);
    updateMessageStatus(contact.uid, msgid, "sent");
    renderApp();
  } catch (error) {
    updateMessageStatus(contact.uid, msgid, "failed");
    renderApp();
    toast(error.message, "error");
  }
}

// Upload a file to the FileServer (via the bridge), then send it as a chat
// message whose body is a file reference. File messages reuse the text-message
// channel, so they persist and fan out across servers like any other message.
async function uploadAndSendFile(file) {
  const isGroup = state.chatType === "group";
  const contact = isGroup ? null : getContact(state.activeContactId);
  if (!file || (!isGroup && !contact) || (isGroup && !state.activeGroupId)) {
    return;
  }
  if (file.size > MAX_UPLOAD_MB * 1024 * 1024) {
    toast(`文件超过 ${MAX_UPLOAD_MB}MB 限制`, "error");
    return;
  }

  toast("上传中…");
  let meta;
  try {
    const form = new FormData();
    form.append("file", file);
    const response = await fetch("/api/file/upload", { method: "POST", body: form });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || Number(data.error) !== 0) {
      throw new Error(data.message || "上传失败");
    }
    meta = {
      kind: data.is_image ? "image" : "file",
      id: data.file_id,
      name: data.name,
      size: data.size,
      type: data.type
    };
  } catch (error) {
    toast(error.message, "error");
    return;
  }

  const content = FILE_MARKER + JSON.stringify(meta);
  if (isGroup) {
    await sendGroupContent(content);
    return;
  }
  await sendUserContent(contact, content);
}

// Send an already-built content body to a 1-1 chat with optimistic echo.
async function sendUserContent(contact, content) {
  const msgid = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
  appendMessage(contact.uid, {
    id: msgid,
    fromuid: Number(state.user.uid),
    touid: Number(contact.uid),
    content,
    time: Date.now(),
    status: "sending"
  });
  renderApp();

  try {
    const reply = await chatRequest(MSG.TEXT_CHAT_MSG_REQ, MSG.TEXT_CHAT_MSG_RSP, {
      fromuid: Number(state.user.uid),
      touid: Number(contact.uid),
      text_array: [{ msgid, content }]
    });
    assertSuccess(reply.packet.payload);
    updateMessageStatus(contact.uid, msgid, "sent");
    renderApp();
  } catch (error) {
    updateMessageStatus(contact.uid, msgid, "failed");
    renderApp();
    toast(error.message, "error");
  }
}

// If a message body is a file reference, return its parsed metadata, else null.
function parseFileContent(content) {
  if (typeof content !== "string" || !content.startsWith(FILE_MARKER)) {
    return null;
  }
  try {
    const meta = JSON.parse(content.slice(FILE_MARKER.length));
    return meta && meta.id ? meta : null;
  } catch (_) {
    return null;
  }
}

// Short preview text for the conversation list (raw file JSON would be ugly).
function previewText(content) {
  const meta = parseFileContent(content);
  if (!meta) {
    return content || "开始聊天";
  }
  return meta.kind === "image" ? "[图片]" : `[文件] ${meta.name || ""}`;
}

function formatFileSize(bytes) {
  const n = Number(bytes || 0);
  if (n < 1024) {
    return `${n} B`;
  }
  if (n < 1024 * 1024) {
    return `${(n / 1024).toFixed(1)} KB`;
  }
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

// ---- Group chat ------------------------------------------------------------

function getGroup(group_id) {
  return state.groups.find((g) => Number(g.group_id) === Number(group_id)) || null;
}

function ensureGroupConversation(group_id, name) {
  const numeric = Number(group_id);
  let conv = state.groupConversations.find((item) => Number(item.group_id) === numeric);
  if (!conv) {
    conv = { group_id: numeric, name: name || "", lastText: "", lastTime: Date.now(), unread: 0 };
    state.groupConversations.push(conv);
  }
  if (name) {
    conv.name = name;
  }
  return conv;
}

function sortedGroupConversations() {
  return [...state.groupConversations].sort((a, b) => Number(b.lastTime || 0) - Number(a.lastTime || 0));
}

function appendGroupMessage(group_id, message, options = {}) {
  const key = `g${group_id}`;
  state.messages[key] = state.messages[key] || [];
  if (!state.messages[key].some((item) => item.id === message.id)) {
    state.messages[key].push(message);
  }
  const conv = ensureGroupConversation(group_id);
  conv.lastText = message.content;
  conv.lastTime = message.time;
  if (options.incoming && !(state.chatType === "group" && Number(state.activeGroupId) === Number(group_id))) {
    conv.unread = Number(conv.unread || 0) + 1;
  }
  persistLocalState();
}

function updateGroupMessageStatus(group_id, id, status) {
  const list = state.messages[`g${group_id}`] || [];
  const item = list.find((m) => m.id === id);
  if (item) {
    item.status = status;
    persistLocalState();
  }
}

// Send a content body (plain text or file reference) to the active group.
async function sendGroupContent(content) {
  const group = getGroup(state.activeGroupId);
  if (!group) {
    return;
  }
  const msgid = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
  appendGroupMessage(group.group_id, {
    id: msgid,
    fromuid: Number(state.user.uid),
    content,
    time: Date.now(),
    status: "sending"
  });
  renderApp();

  try {
    const reply = await chatRequest(MSG.GROUP_TEXT_MSG_REQ, MSG.GROUP_TEXT_MSG_RSP, {
      fromuid: Number(state.user.uid),
      group_id: Number(group.group_id),
      text_array: [{ msgid, content }]
    });
    assertSuccess(reply.packet.payload);
    updateGroupMessageStatus(group.group_id, msgid, "sent");
    renderApp();
  } catch (error) {
    updateGroupMessageStatus(group.group_id, msgid, "failed");
    renderApp();
    toast(error.message, "error");
  }
}

async function loadGroupList() {
  if (!state.sessionId || !state.user?.uid) {
    return;
  }
  try {
    const reply = await chatRequest(MSG.GET_GROUP_LIST_REQ, MSG.GET_GROUP_LIST_RSP, {
      fromuid: Number(state.user.uid)
    });
    assertSuccess(reply.packet.payload);
    const list = reply.packet.payload?.group_list || [];
    state.groups = list.map((g) => ({
      group_id: Number(g.group_id),
      name: g.name || `群 ${g.group_id}`,
      owner_uid: Number(g.owner_uid),
      member_count: Number(g.member_count || 0)
    }));
    state.groups.forEach((g) => ensureGroupConversation(g.group_id, g.name));
    persistLocalState();
    renderApp();
  } catch (error) {
    toast(error.message, "error");
  }
}

async function loadGroupMembers(group_id, { toastList = false } = {}) {
  try {
    const reply = await chatRequest(MSG.GET_GROUP_MEMBERS_REQ, MSG.GET_GROUP_MEMBERS_RSP, {
      fromuid: Number(state.user.uid),
      group_id: Number(group_id)
    });
    assertSuccess(reply.packet.payload);
    const members = reply.packet.payload?.members || [];
    state.groupMembers[String(group_id)] = members.map((m) => normalizeUser(m));
    if (toastList) {
      const names = state.groupMembers[String(group_id)].map((m) => displayName(m)).join("、");
      toast(`群成员：${names}`);
    }
    renderApp();
  } catch (error) {
    toast(error.message, "error");
  }
}

function groupMemberName(group_id, uid) {
  if (Number(uid) === Number(state.user?.uid)) {
    return displayName(state.user);
  }
  const members = state.groupMembers[String(group_id)] || [];
  const found = members.find((m) => Number(m.uid) === Number(uid));
  if (found) {
    return displayName(found);
  }
  const contact = getContact(uid);
  return contact ? displayName(contact) : `用户 ${uid}`;
}

function openCreateGroup() {
  state.showCreateGroup = true;
  renderApp();
}

function closeCreateGroup() {
  state.showCreateGroup = false;
  renderApp();
}

async function submitCreateGroup() {
  const nameInput = app.querySelector("#groupNameInput");
  const name = nameInput?.value.trim();
  if (!name) {
    toast("请输入群名称", "error");
    return;
  }
  const checked = Array.from(app.querySelectorAll("input[name='group-member']:checked"))
    .map((el) => Number(el.value));
  if (!checked.length) {
    toast("至少选择一个成员", "error");
    return;
  }

  try {
    const reply = await chatRequest(MSG.CREATE_GROUP_REQ, MSG.CREATE_GROUP_RSP, {
      fromuid: Number(state.user.uid),
      name,
      members: checked
    });
    assertSuccess(reply.packet.payload);
    const payload = reply.packet.payload || {};
    state.showCreateGroup = false;
    toast("群聊已创建");
    // Refresh the authoritative group list, then open the new group.
    await loadGroupList();
    if (payload.group_id) {
      openGroup(Number(payload.group_id));
    }
  } catch (error) {
    toast(error.message, "error");
  }
}

// ---- Group message marshalling --------------------------------------------

function parseGroupContent(content) {
  if (typeof content !== "string" || !content.startsWith(GROUP_MSG_MARKER)) {
    return null;
  }
  try {
    const obj = JSON.parse(content.slice(GROUP_MSG_MARKER.length));
    return obj && obj.group_id ? obj : null;
  } catch (_) {
    return null;
  }
}

function parseGroupEvent(content) {
  if (typeof content !== "string" || !content.startsWith(GROUP_EVENT_MARKER)) {
    return null;
  }
  try {
    const obj = JSON.parse(content.slice(GROUP_EVENT_MARKER.length));
    return obj && obj.group_id ? obj : null;
  } catch (_) {
    return null;
  }
}

function handleIncomingGroupMessage(groupMsg, item) {
  const group_id = Number(groupMsg.group_id);
  const fromuid = Number(groupMsg.from_uid);
  ensureGroupConversation(group_id, groupMsg.name);
  appendGroupMessage(group_id, {
    id: item.msgid || `${Date.now()}-${Math.random()}`,
    fromuid,
    content: groupMsg.content || "",
    time: Number(item.time || Date.now()),
    status: "received"
  }, { incoming: true });
  // We don't know this group yet (created elsewhere) -> refresh the list.
  if (!getGroup(group_id)) {
    loadGroupList();
  }
}

function handleGroupEvent(evt) {
  toast(`你被加入群聊「${evt.name || ""}」`);
  loadGroupList();
}

async function chatRequest(msgId, replyMsgId, payload) {
  return apiPost("/api/chat/request", {
    sessionId: state.sessionId,
    msgId,
    replyMsgId,
    payload,
    timeoutMs: 8000
  });
}

// Storage key for a conversation: 1-1 chats key by uid, groups by `g<id>`.
function messageKeyFor(target) {
  return target.type === "group" ? `g${target.group_id}` : String(target.uid);
}

// The chat currently open, as a target descriptor (or null).
function activeChatTarget() {
  if (state.chatType === "group") {
    return state.activeGroupId ? { type: "group", group_id: Number(state.activeGroupId) } : null;
  }
  return state.activeContactId ? { type: "user", uid: Number(state.activeContactId) } : null;
}

// Pull persisted history for a 1-1 or group chat. `initial` loads the newest
// page the first time a chat opens; otherwise it pages back using the cursor.
async function loadHistoryFor(target, { initial = false } = {}) {
  if (!state.sessionId || !state.user?.uid || !target) {
    return;
  }

  const key = messageKeyFor(target);
  const hist = state.history[key] || (state.history[key] = {
    loaded: false,
    loading: false,
    cursor: 0,
    noMore: false
  });

  if (hist.loading) {
    return;
  }
  if (initial && hist.loaded) {
    return;
  }
  if (!initial && hist.noMore) {
    return;
  }

  hist.loading = true;

  // When paging older messages, remember the distance from the bottom so the
  // viewport stays anchored after the older rows are prepended.
  let prevBottomOffset = null;
  if (!initial) {
    const scroll = app.querySelector("#messageScroll");
    if (scroll) {
      prevBottomOffset = scroll.scrollHeight - scroll.scrollTop;
    }
    const moreBtn = app.querySelector("[data-action='load-history']");
    if (moreBtn) {
      moreBtn.disabled = true;
      moreBtn.textContent = "加载中…";
    }
  }

  const payload = {
    fromuid: Number(state.user.uid),
    last_msgid: initial ? 0 : Number(hist.cursor || 0),
    limit: HISTORY_PAGE_SIZE
  };
  if (target.type === "group") {
    payload.group_id = Number(target.group_id);
  } else {
    payload.touid = Number(target.uid);
  }

  try {
    const reply = await chatRequest(MSG.GET_CHAT_HISTORY_REQ, MSG.GET_CHAT_HISTORY_RSP, payload);
    assertSuccess(reply.packet.payload);

    const data = reply.packet.payload || {};
    const arr = Array.isArray(data.msg_array) ? data.msg_array : [];
    mergeHistoryMessages(key, arr);

    hist.loaded = true;
    hist.cursor = Number(data.next_cursor || 0);
    if (!hist.cursor || arr.length < HISTORY_PAGE_SIZE) {
      hist.noMore = true;
    }
    persistLocalState();
  } catch (error) {
    toast(error.message, "error");
  } finally {
    hist.loading = false;
  }

  if (!initial && prevBottomOffset != null) {
    state.pendingScroll = { mode: "preserve", prevBottomOffset };
  }
  renderApp();
}

// Merge a page of history rows into the local message store, deduping by id
// (the client msg id, shared with live messages) and keeping chronological order.
function mergeHistoryMessages(key, arr) {
  const list = state.messages[key] || (state.messages[key] = []);
  const existing = new Set(list.map((item) => String(item.id)));
  const selfUid = Number(state.user.uid);

  for (const item of arr) {
    const id = item.msgid || `h${item.msg_id}`;
    if (existing.has(String(id))) {
      continue;
    }
    const fromuid = Number(item.fromuid);
    list.push({
      id,
      msgId: Number(item.msg_id || 0),
      fromuid,
      touid: Number(item.touid),
      content: item.content || "",
      time: parseServerTime(item.create_time),
      status: fromuid === selfUid ? "sent" : "received"
    });
    existing.add(String(id));
  }

  // Order by time, falling back to the DB message id for same-second messages.
  list.sort((a, b) =>
    (Number(a.time || 0) - Number(b.time || 0)) ||
    (Number(a.msgId || 0) - Number(b.msgId || 0)));
}

// Parse a MySQL DATETIME string ("YYYY-MM-DD HH:MM:SS") as local time.
function parseServerTime(value) {
  if (!value) {
    return Date.now();
  }
  const m = String(value).match(/(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
  if (!m) {
    const t = Date.parse(value);
    return Number.isNaN(t) ? Date.now() : t;
  }
  return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]).getTime();
}

function openEventStream() {
  if (state.eventSource) {
    state.eventSource.close();
  }

  state.eventSource = new EventSource(`/api/chat/events/${encodeURIComponent(state.sessionId)}`);
  state.eventSource.addEventListener("packet", (event) => {
    try {
      handlePacket(JSON.parse(event.data));
    } catch (error) {
      toast(error.message, "error");
    }
  });
  state.eventSource.addEventListener("status", (event) => {
    const status = JSON.parse(event.data);
    state.connection = status.state === "connected" ? "connected" : status.state;
    updateConnectionOnly();
  });
  state.eventSource.onerror = () => {
    state.connection = "error";
    updateConnectionOnly();
  };
}

function handlePacket(packet) {
  const payload = packet.payload || {};

  if (packet.msgId === MSG.HEARTBEAT_RSP) {
    state.connection = "connected";
    updateConnectionOnly();
    return;
  }

  if (packet.msgId === MSG.NOTIFY_ADD_FRIEND_REQ) {
    upsertRequest({
      ...payload,
      applyuid: payload.applyuid,
      status: "pending"
    });
    persistLocalState();
    renderApp();
    toast(`${displayName(payload)} 请求添加你为好友`);
    return;
  }

  if (packet.msgId === MSG.NOTIFY_AUTH_FRIEND_REQ) {
    const contact = normalizeUser({
      ...payload,
      uid: payload.fromuid
    });
    mergeContact(contact);
    persistLocalState();
    renderApp();
    toast(`${displayName(contact)} 已通过你的好友申请`);
    return;
  }

  if (packet.msgId === MSG.NOTIFY_TEXT_CHAT_MSG_REQ) {
    appendIncomingTextMessages(payload);
    persistLocalState();
    renderApp();
  }
}

function loadLocalState() {
  const fallback = {
    contacts: [],
    conversations: [],
    messages: {},
    requests: []
  };

  const raw = localStorage.getItem(localKey());
  const data = raw ? safeJson(raw, fallback) : fallback;
  state.contacts = Array.isArray(data.contacts) ? data.contacts.map(normalizeUser).filter((item) => item.uid) : [];
  state.conversations = Array.isArray(data.conversations) ? data.conversations : [];
  state.groups = Array.isArray(data.groups) ? data.groups : [];
  state.groupConversations = Array.isArray(data.groupConversations) ? data.groupConversations : [];
  state.groupMembers = {};
  state.messages = data.messages && typeof data.messages === "object" ? data.messages : {};
  state.history = {};
  state.requests = Array.isArray(data.requests) ? data.requests : [];
  state.searchResult = null;
  state.lastSearch = "";
  state.activeNav = "chat";
  state.chatType = "user";
  state.activeGroupId = null;
  state.showCreateGroup = false;
  state.activeContactId = sortedConversations()[0]?.uid || state.contacts[0]?.uid || null;
}

function applyLoginLists(payload = {}) {
  const friends = Array.isArray(payload.friend_list) ? payload.friend_list : [];
  const requests = Array.isArray(payload.apply_list) ? payload.apply_list : [];
  const offlineMessages = Array.isArray(payload.offline_msg_list) ? payload.offline_msg_list : [];

  friends.forEach((item) => mergeContact(item, { silent: true }));
  requests.forEach((item) => {
    upsertRequest({
      ...item,
      applyuid: item.applyuid ?? item.uid,
      status: normalizeRequestStatus(item.status)
    });
  });
  offlineMessages.forEach((item) => appendIncomingTextMessages(item));

  if (friends.length || requests.length || offlineMessages.length) {
    persistLocalState();
  }
}

function persistLocalState() {
  if (!state.user?.uid) {
    return;
  }
  localStorage.setItem(localKey(), JSON.stringify({
    contacts: state.contacts,
    conversations: state.conversations,
    groups: state.groups,
    groupConversations: state.groupConversations,
    messages: state.messages,
    requests: state.requests
  }));
}

function localKey() {
  return `wechat-client:${state.user.uid}`;
}

function normalizeUser(user) {
  const uid = Number(user?.uid ?? user?.applyuid ?? user?.fromuid ?? 0);
  const name = String(user?.name || "").trim();
  const nick = String(user?.nick || "").trim();
  return {
    uid,
    applyuid: Number(user?.applyuid || uid || 0),
    fromuid: Number(user?.fromuid || uid || 0),
    name,
    nick,
    email: String(user?.email || "").trim(),
    desc: String(user?.desc || "").trim(),
    sex: Number(user?.sex || 0),
    icon: String(user?.icon || "").trim(),
    back: String(user?.back || "").trim(),
    token: user?.token || "",
    chatHost: user?.chatHost || "",
    chatPort: user?.chatPort || ""
  };
}

function mergeContact(user, options = {}) {
  const contact = normalizeUser(user);
  if (!contact.uid || contact.uid === Number(state.user?.uid)) {
    return contact;
  }

  const index = state.contacts.findIndex((item) => Number(item.uid) === Number(contact.uid));
  if (index >= 0) {
    state.contacts[index] = { ...state.contacts[index], ...compactObject(contact) };
  } else {
    state.contacts.push(contact);
  }

  if (!options.silent) {
    ensureConversation(contact.uid);
  }
  return getContact(contact.uid);
}

function compactObject(object) {
  return Object.fromEntries(Object.entries(object).filter(([, value]) => value !== "" && value !== 0 && value != null));
}

function getContact(uid) {
  const numeric = Number(uid);
  return state.contacts.find((item) => Number(item.uid) === numeric) || null;
}

function displayName(user) {
  return user?.back || user?.nick || user?.name || (user?.uid || user?.applyuid ? `用户 ${user.uid || user.applyuid}` : "未知用户");
}

function upsertRequest(request) {
  const applyuid = Number(request.applyuid);
  if (!applyuid) {
    return;
  }
  const index = state.requests.findIndex((item) => Number(item.applyuid) === applyuid);
  const normalized = {
    ...normalizeUser(request),
    applyuid,
    status: normalizeRequestStatus(request.status),
    time: request.time || Date.now()
  };
  if (index >= 0) {
    state.requests[index] = { ...state.requests[index], ...normalized };
  } else {
    state.requests.unshift(normalized);
  }
}

function normalizeRequestStatus(status) {
  const value = String(status ?? "").toLowerCase();
  if (status === 1 || value === "1" || value === "accepted" || value === "approved") {
    return "accepted";
  }
  return "pending";
}

// Process an incoming text payload (live or pulled offline). Each item may be a
// 1-1 message, a wrapped group message, or a group event; route accordingly.
function appendIncomingTextMessages(payload = {}) {
  const fromuid = Number(payload.fromuid);
  if (!fromuid) {
    return;
  }

  for (const item of payload.text_array || []) {
    const raw = item.content || item.msgcontent || "";

    const groupMsg = parseGroupContent(raw);
    if (groupMsg) {
      handleIncomingGroupMessage(groupMsg, item);
      continue;
    }
    const groupEvt = parseGroupEvent(raw);
    if (groupEvt) {
      handleGroupEvent(groupEvt);
      continue;
    }

    const contact = getContact(fromuid) || normalizeUser({ uid: fromuid, name: `用户 ${fromuid}` });
    mergeContact(contact, { silent: true });
    appendMessage(fromuid, {
      id: item.msgid || `${Date.now()}-${Math.random()}`,
      fromuid,
      touid: Number(payload.touid),
      content: raw,
      time: Number(item.time || payload.time || Date.now()),
      status: "received"
    }, { incoming: true });
  }
}

function appendMessage(contactUid, message, options = {}) {
  const key = String(contactUid);
  state.messages[key] = state.messages[key] || [];

  if (!state.messages[key].some((item) => item.id === message.id)) {
    state.messages[key].push(message);
  }

  const conversation = ensureConversation(contactUid);
  conversation.lastText = message.content;
  conversation.lastTime = message.time;
  if (options.incoming && Number(state.activeContactId) !== Number(contactUid)) {
    conversation.unread = Number(conversation.unread || 0) + 1;
  }

  persistLocalState();
}

function updateMessageStatus(contactUid, id, status) {
  const list = state.messages[String(contactUid)] || [];
  const item = list.find((message) => message.id === id);
  if (item) {
    item.status = status;
    persistLocalState();
  }
}

function ensureConversation(uid) {
  const numeric = Number(uid);
  let conversation = state.conversations.find((item) => Number(item.uid) === numeric);
  if (!conversation) {
    conversation = {
      uid: numeric,
      lastText: "",
      lastTime: Date.now(),
      unread: 0
    };
    state.conversations.push(conversation);
  }
  return conversation;
}

function sortedConversations() {
  return [...state.conversations].sort((a, b) => Number(b.lastTime || 0) - Number(a.lastTime || 0));
}

function unreadTotal() {
  const userUnread = state.conversations.reduce((total, item) => total + Number(item.unread || 0), 0);
  const groupUnread = state.groupConversations.reduce((total, item) => total + Number(item.unread || 0), 0);
  return userUnread + groupUnread;
}

function pendingRequestCount() {
  return state.requests.filter((item) => item.status === "pending").length;
}

async function logout() {
  try {
    if (state.sessionId) {
      await apiPost("/api/chat/disconnect", { sessionId: state.sessionId });
    }
  } catch (_) {
  }

  if (state.eventSource) {
    state.eventSource.close();
  }

  state.sessionId = "";
  state.eventSource = null;
  state.connection = "offline";
  state.user = null;
  state.contacts = [];
  state.conversations = [];
  state.groups = [];
  state.groupConversations = [];
  state.groupMembers = {};
  state.messages = {};
  state.history = {};
  state.requests = [];
  state.activeContactId = null;
  state.activeGroupId = null;
  state.chatType = "user";
  state.showCreateGroup = false;
  state.activeNav = "chat";
  renderAuth();
}

function updateConnectionOnly() {
  app.querySelectorAll("[data-connection-badge]").forEach((node) => {
    node.outerHTML = connectionBadge(node.dataset.connectionBadge === "long");
  });
}

function connectionBadge(long = false) {
  const online = state.connection === "connected";
  const error = state.connection === "error";
  const label = online ? "在线" : error ? "异常" : "离线";
  const cls = online ? " is-online" : error ? " is-error" : "";
  if (long) {
    return `<span data-connection-badge="long"><span class="status-dot${cls}"></span> ${label}</span>`;
  }
  return `<span data-connection-badge="short" title="${label}"><span class="status-dot${cls}"></span></span>`;
}

function avatarHtml(user, size = "avatar") {
  const iconValue = String(user?.icon || "").trim();
  const name = displayName(user);
  const initial = Array.from(name)[0] || "微";
  const tone = iconValue.startsWith("tone-") ? iconValue : `tone-${hashString(String(user?.uid || name)) % 4}`;

  if (/^(https?:\/\/|data:image\/|\/)/i.test(iconValue)) {
    return `<span class="${size}"><img src="${escapeAttr(iconValue)}" alt=""></span>`;
  }

  return `<span class="${size} ${escapeAttr(tone)}">${escapeHtml(initial)}</span>`;
}

function icon(name) {
  return `<svg class="icon" aria-hidden="true"><use href="#i-${name}"></use></svg>`;
}

function setBusy(button, busy) {
  if (!button) {
    return;
  }
  button.disabled = busy;
  button.dataset.originalText = button.dataset.originalText || button.innerHTML;
  button.innerHTML = busy ? "处理中" : button.dataset.originalText;
}

function setHint(node, message, isError = false) {
  if (!node) {
    return;
  }
  node.textContent = message || "";
  node.style.color = isError ? "var(--danger)" : "var(--muted)";
}

function formData(form) {
  return Object.fromEntries(new FormData(form).entries());
}

function assertSuccess(reply) {
  const error = Number(reply?.error || 0);
  if (error !== 0) {
    throw new Error(getErrorText(error));
  }
}

function getErrorText(error) {
  return errorText[String(error)] || `后端错误 ${error}`;
}

function safeJson(raw, fallback) {
  try {
    return JSON.parse(raw);
  } catch (_) {
    return fallback;
  }
}

function hashString(value) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0;
  }
  return Math.abs(hash);
}

function formatTime(timestamp) {
  if (!timestamp) {
    return "";
  }
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(new Date(timestamp));
}

function formatListTime(timestamp) {
  if (!timestamp) {
    return "";
  }
  const date = new Date(timestamp);
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  if (sameDay) {
    return formatTime(timestamp);
  }
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

function scrollMessagesToBottom() {
  requestAnimationFrame(() => {
    const scroll = app.querySelector("#messageScroll");
    if (scroll) {
      scroll.scrollTop = scroll.scrollHeight;
    }
  });
}

function toast(message, type = "info") {
  let stack = document.querySelector(".toast-stack");
  if (!stack) {
    stack = document.createElement("div");
    stack.className = "toast-stack";
    document.body.appendChild(stack);
  }

  const node = document.createElement("div");
  node.className = `toast${type === "error" ? " is-error" : ""}`;
  node.textContent = message;
  stack.appendChild(node);
  setTimeout(() => {
    node.remove();
  }, 3600);
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;"
  })[char]);
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/`/g, "&#96;");
}

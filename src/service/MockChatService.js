import { ChatService, ChatError } from './ChatService.js';
import { validateNickname, MESSAGE_MAX } from '../nickname.js';

// 階段一的假後端：資料只存在這個瀏覽器裡，
// 用 BroadcastChannel 讓「同一個瀏覽器的不同分頁」互相收得到。
// 不同電腦之間不會互通，那要等階段二接上 Supabase。

const CHANNEL = 'cocoanonymous-chat';
const STORE_KEY = 'cc:messages';
const KEEP = 200; // 資料庫只保留最近 200 則
const RECENT = 50; // 新人進來看到最近 50 則
const HEARTBEAT_MS = 5000;
const EXPIRE_MS = 30000; // 約 30 秒沒消息就視為離開
const WHOIS_WAIT_MS = 300;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const uuid = () => crypto.randomUUID();

function readStore() {
  try {
    const list = JSON.parse(localStorage.getItem(STORE_KEY) ?? '[]');
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function writeStore(list) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(list.slice(-KEEP)));
  } catch {
    /* 儲存空間不可用時，仍可在畫面上聊天，只是不保留歷史 */
  }
}

export class MockChatService extends ChatService {
  constructor() {
    super();
    this.tabId = uuid();
    this.me = null; // { nickname, key, joinedAt }
    this.peers = new Map(); // tabId -> { nickname, key, joinedAt, lastSeen }
    this.timers = [];
    this.channel = new BroadcastChannel(CHANNEL);
    this.channel.onmessage = (e) => this.#onRemote(e.data);
    window.addEventListener('online', () => this._emit('status', 'connected'));
    window.addEventListener('offline', () => this._emit('status', 'disconnected'));
    window.addEventListener('pagehide', () => this.leave());
  }

  async join(raw) {
    const check = validateNickname(raw);
    if (!check.ok) throw new ChatError(check.code);

    // 問一下目前有哪些人在線，檢查代號有沒有被用走
    this.peers.clear();
    this.channel.postMessage({ t: 'whois' });
    await sleep(WHOIS_WAIT_MS);
    for (const p of this.peers.values()) {
      if (p.key === check.key) {
        this.peers.clear();
        throw new ChatError('taken');
      }
    }

    this.me = { nickname: check.nickname, key: check.key, joinedAt: Date.now() };
    this.#announce();
    this.timers.push(setInterval(() => this.#announce(), HEARTBEAT_MS));
    this.timers.push(setInterval(() => this.#sweep(), HEARTBEAT_MS));
    this.#publish(this.#notice(`${check.nickname} 加入了聊天室`, `join-${this.tabId}-${this.me.joinedAt}`));

    const history = readStore().slice(-RECENT);
    return { history, users: this.#users() };
  }

  async leave() {
    if (!this.me) return;
    const { nickname } = this.me;
    this.#publish(this.#notice(`${nickname} 離開了聊天室`, `leave-${this.tabId}-${Date.now()}`));
    this.channel.postMessage({ t: 'leave', tabId: this.tabId });
    this.timers.forEach(clearInterval);
    this.timers = [];
    this.me = null;
    this.peers.clear();
  }

  async send(text) {
    if (!this.me) throw new ChatError('not-joined');
    if (!navigator.onLine) throw new ChatError('offline');
    const content = String(text ?? '').trim();
    if (!content || Array.from(content).length > MESSAGE_MAX) throw new ChatError('invalid');
    this.#publish({
      id: uuid(),
      type: 'message',
      nickname: this.me.nickname,
      content,
      createdAt: new Date().toISOString(),
    });
  }

  // ---- 內部 ----

  #notice(content, id) {
    return { id, type: 'notice', content, createdAt: new Date().toISOString() };
  }

  // 存起來、廣播給其他分頁、也通知自己的畫面
  #publish(msg) {
    this.#persist(msg);
    this.channel.postMessage({ t: 'message', msg });
    this._emit('message', msg);
  }

  #persist(msg) {
    const list = readStore();
    if (list.some((m) => m.id === msg.id)) return;
    list.push(msg);
    writeStore(list);
  }

  #announce() {
    if (!this.me) return;
    this.channel.postMessage({
      t: 'presence',
      tabId: this.tabId,
      nickname: this.me.nickname,
      key: this.me.key,
      joinedAt: this.me.joinedAt,
    });
  }

  #users() {
    const list = [...this.peers.values()].map((p) => ({ nickname: p.nickname, joinedAt: p.joinedAt, self: false }));
    if (this.me) list.push({ nickname: this.me.nickname, joinedAt: this.me.joinedAt, self: true });
    return list.sort((a, b) => a.joinedAt - b.joinedAt).map(({ nickname, self }) => ({ nickname, self }));
  }

  // 超過 30 秒沒有心跳的分頁視為已離開（例如直接關機或當機）
  #sweep() {
    const now = Date.now();
    let changed = false;
    for (const [tabId, p] of this.peers) {
      if (now - p.lastSeen > EXPIRE_MS) {
        this.peers.delete(tabId);
        changed = true;
        const notice = this.#notice(`${p.nickname} 離開了聊天室`, `expire-${tabId}-${p.lastSeen}`);
        this.#persist(notice);
        this._emit('message', notice);
      }
    }
    if (changed) this._emit('presence', this.#users());
  }

  #onRemote(data) {
    switch (data.t) {
      case 'whois':
        this.#announce();
        break;
      case 'presence': {
        if (data.tabId === this.tabId) break;
        const isNew = !this.peers.has(data.tabId);
        this.peers.set(data.tabId, { ...data, lastSeen: Date.now() });
        if (isNew && this.me) this._emit('presence', this.#users());
        break;
      }
      case 'leave':
        if (this.peers.delete(data.tabId) && this.me) this._emit('presence', this.#users());
        break;
      case 'message':
        if (this.me) this._emit('message', data.msg);
        break;
    }
  }
}

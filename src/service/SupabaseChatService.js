import { createClient } from '@supabase/supabase-js';
import { ChatService, ChatError } from './ChatService.js';
import { validateNickname, MESSAGE_MAX } from '../nickname.js';

// 階段二的真後端：訊息存在 Supabase 資料表 messages，
// 即時推送用 Realtime，線上名單用 Presence。
// 對畫面來說，用法和 MockChatService 完全一樣（見 ChatService.js）。

const ROOM = 'anonymous-chat-room';
const RECENT = 50; // 新人進來看到最近 50 則
const SYNC_WAIT_MS = 2000;
const RIVAL_WAIT_MS = 600;
const DUPLICATE_KEY = '23505';
const HEARTBEAT_MS = 20000; // 向資料庫報到的間隔；所有人都停止報到後，資料庫會清空聊天室

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function toMessage(row) {
  return {
    id: row.id,
    type: row.type,
    nickname: row.nickname ?? undefined,
    content: row.content,
    createdAt: row.created_at,
  };
}

// 用文字算出固定的 UUID。同一件事（例如「某人離開」）每個人算出來的編號相同，
// 資料庫會擋掉重複的，所以提示只會留下一則。
async function uuidFrom(text) {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
  const b = digest.slice(0, 16);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const hex = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export class SupabaseChatService extends ChatService {
  constructor() {
    super();
    const url = import.meta.env.VITE_SUPABASE_URL;
    const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
    if (!url || !key) {
      throw new Error('缺少 VITE_SUPABASE_URL 或 VITE_SUPABASE_ANON_KEY，請檢查 .env.local');
    }
    this.client = createClient(url, key);
    this.tabId = crypto.randomUUID();
    this.channel = null;
    this.me = null; // { nickname, nkey, joinedAt, tabId }
    this.lastSeen = null; // 最後收到的訊息時間，重連後用來補漏掉的訊息
    this.down = false;

    window.addEventListener('offline', () => this.#markDown());
    window.addEventListener('pagehide', () => this.leave());
  }

  async join(raw) {
    const check = validateNickname(raw);
    if (!check.ok) throw new ChatError(check.code);

    const channel = this.client.channel(ROOM, { config: { presence: { key: this.tabId } } });
    this.channel = channel;

    let firstSync;
    const synced = new Promise((resolve) => (firstSync = resolve));
    channel.on('presence', { event: 'sync' }, () => {
      firstSync();
      if (this.me) this._emit('presence', this.#users());
    });
    channel.on('presence', { event: 'leave' }, ({ leftPresences }) => this.#onLeave(leftPresences));
    channel.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, ({ new: row }) =>
      this.#receive(row),
    );

    try {
      await this.#subscribe(channel);
      await Promise.race([synced, sleep(SYNC_WAIT_MS)]);

      // 代號有人用了就不能進
      if (this.#others().some((p) => p.nkey === check.key)) throw new ChatError('taken');

      const me = { nickname: check.nickname, nkey: check.key, joinedAt: Date.now(), tabId: this.tabId };
      await channel.track(me);

      // 兩個人同時搶同一個代號時，先進來的人留下，另一個退出
      await sleep(RIVAL_WAIT_MS);
      const rival = this.#others().some(
        (p) => p.nkey === me.nkey && (p.joinedAt < me.joinedAt || (p.joinedAt === me.joinedAt && p.tabId < me.tabId)),
      );
      if (rival) throw new ChatError('taken');

      this.me = me;
    } catch (err) {
      await this.#teardown();
      throw err instanceof ChatError ? err : new ChatError('failed');
    }

    await this.#beat();
    this.heartbeat = setInterval(() => this.#beat(), HEARTBEAT_MS);
    await this.#insertNotice(`join-${this.tabId}-${this.me.joinedAt}`, `${check.nickname} 加入了聊天室`);

    const { data, error } = await this.client
      .from('messages')
      .select('*')
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(RECENT);
    if (error) {
      await this.#teardown();
      throw new ChatError('failed');
    }
    const history = data.reverse().map(toMessage);
    this.lastSeen = history.at(-1)?.createdAt ?? null;
    return { history, users: this.#users() };
  }

  async leave() {
    if (!this.channel) return;
    await this.#teardown();
  }

  async send(text) {
    if (!this.me) throw new ChatError('not-joined');
    if (this.down || !navigator.onLine) throw new ChatError('offline');
    const content = String(text ?? '').trim();
    if (!content || Array.from(content).length > MESSAGE_MAX) throw new ChatError('invalid');

    const { data, error } = await this.client
      .from('messages')
      .insert({ type: 'message', nickname: this.me.nickname, content })
      .select()
      .single();
    if (error) throw new ChatError('failed');
    this.#receive(data);
  }

  // ---- 內部 ----

  #subscribe(channel) {
    return new Promise((resolve, reject) => {
      let first = true;
      const timer = setTimeout(() => {
        if (first) reject(new ChatError('failed'));
      }, 10000);
      channel.subscribe((status) => {
        if (channel !== this.channel) return;
        if (status === 'SUBSCRIBED') {
          if (first) {
            first = false;
            clearTimeout(timer);
            resolve();
          } else if (this.down) {
            this.down = false;
            this.#resume();
            this._emit('status', 'connected');
          }
        } else if (['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED'].includes(status)) {
          if (first) {
            first = false;
            clearTimeout(timer);
            reject(new ChatError('failed'));
          } else {
            this.#markDown();
          }
        }
      });
    });
  }

  #markDown() {
    if (!this.me || this.down) return;
    this.down = true;
    this._emit('status', 'disconnected');
  }

  // 重新連上後：重新登記在線，並補上斷線期間漏掉的訊息
  async #resume() {
    if (!this.me || !this.channel) return;
    try {
      await this.channel.track(this.me);
      let query = this.client.from('messages').select('*').order('created_at', { ascending: true });
      if (this.lastSeen) query = query.gt('created_at', this.lastSeen);
      const { data } = await query.limit(200);
      for (const row of data ?? []) this.#receive(row);
    } catch {
      /* 補不到就算了，下一次重連再試 */
    }
  }

  async #teardown() {
    const channel = this.channel;
    this.channel = null;
    this.me = null;
    this.down = false;
    clearInterval(this.heartbeat);
    this.heartbeat = null;
    if (!channel) return;
    try {
      await channel.untrack();
    } catch {
      /* 已經斷線也沒關係 */
    }
    await this.client.removeChannel(channel);
  }

  #receive(row) {
    const msg = toMessage(row);
    if (!this.lastSeen || msg.createdAt > this.lastSeen) this.lastSeen = msg.createdAt;
    this._emit('message', msg);
  }

  #others() {
    if (!this.channel) return [];
    return Object.values(this.channel.presenceState())
      .flat()
      .filter((p) => p.tabId !== this.tabId);
  }

  #users() {
    const list = this.#others().map((p) => ({ nickname: p.nickname, joinedAt: p.joinedAt, self: false }));
    if (this.me) list.push({ nickname: this.me.nickname, joinedAt: this.me.joinedAt, self: true });
    return list.sort((a, b) => a.joinedAt - b.joinedAt).map(({ nickname, self }) => ({ nickname, self }));
  }

  // 有人離開（按離開、關掉網頁、或斷線太久）：留下一則提示
  async #onLeave(leftPresences) {
    if (!this.me) return;
    for (const p of leftPresences) {
      if (p.tabId === this.tabId || !p.nickname) continue;
      await this.#insertNotice(`leave-${p.tabId}-${p.joinedAt}`, `${p.nickname} 離開了聊天室`);
    }
  }

  // 告訴資料庫「我還在線上」。失敗不影響聊天（例如剛好斷線），下一次再報
  async #beat() {
    try {
      await this.client.rpc('heartbeat', { p_session: this.tabId });
    } catch {
      /* 忽略 */
    }
  }

  async #insertNotice(seed, content) {
    const id = await uuidFrom(seed);
    const { error } = await this.client.from('messages').insert({ id, type: 'notice', content });
    // 別人已經先寫入同一則提示時會重複，這是正常的
    if (error && error.code !== DUPLICATE_KEY) console.warn('notice failed', error.message);
  }
}

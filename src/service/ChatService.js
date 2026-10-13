// 畫面只透過這組介面跟後端溝通。
// 階段一用 MockChatService，階段二換成 SupabaseChatService，畫面程式不用改。
//
//   join(代號)       進入聊天室，回傳 { history, users }；失敗時丟出 ChatError
//   leave()          離開聊天室並釋出代號
//   send(文字)       送出訊息
//   onMessage(fn)    收到訊息或進出提示時通知畫面
//   onPresence(fn)   線上名單變化時通知畫面（收到完整名單）
//   onStatus(fn)     連線狀態變化：'connected' | 'disconnected'
//   typing()         告訴其他人「我正在輸入」
//   onTyping(fn)     別人正在輸入時通知畫面（收到對方的代號）
//
// 訊息格式：
//   { id, type: 'message', nickname, content, createdAt }
//   { id, type: 'notice',  content, createdAt }            // 加入／離開提示
// 線上名單格式：[{ nickname, self }]

export class ChatError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

export class ChatService {
  #handlers = { message: new Set(), presence: new Set(), status: new Set(), typing: new Set() };

  onMessage(fn) {
    return this.#subscribe('message', fn);
  }
  onPresence(fn) {
    return this.#subscribe('presence', fn);
  }
  onStatus(fn) {
    return this.#subscribe('status', fn);
  }

  onTyping(fn) {
    return this.#subscribe('typing', fn);
  }

  // 告訴其他人「我正在輸入」。沒有這個功能的後端什麼都不用做。
  typing() {}

  #subscribe(type, fn) {
    this.#handlers[type].add(fn);
    return () => this.#handlers[type].delete(fn);
  }

  _emit(type, payload) {
    for (const fn of this.#handlers[type]) fn(payload);
  }

  async join() {
    throw new Error('not implemented');
  }
  async leave() {
    throw new Error('not implemented');
  }
  async send() {
    throw new Error('not implemented');
  }
}

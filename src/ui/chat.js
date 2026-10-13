import { h, nicknameHue, formatTime, dayKey, formatDay } from './dom.js';
import { MESSAGE_MAX } from '../nickname.js';
import { getTheme, nextTheme, THEME_LABELS } from './theme.js';

const COARSE_POINTER = window.matchMedia('(pointer: coarse)');
const TITLE = '匿名聊天室';
const TYPING_SEND_MS = 2000; // 自己輸入時，最多每 2 秒通知一次
const TYPING_SHOW_MS = 4000; // 對方停止輸入 4 秒後，「正在輸入」就消失

export function renderChat({ service, session, onLeave }) {
  const me = session.nickname;
  const seen = new Set(); // 已顯示過的訊息編號，避免重複
  let lastNick = null; // 目前這一串連續訊息的發話者
  let lastDay = null;
  let hasMessages = false;
  let connected = true;

  // ---- 元素 ----
  const whoCount = h('span', {}, String(session.users.length));
  const whoBtn = h(
    'button',
    { type: 'button', class: 'who', 'aria-expanded': 'false', 'aria-controls': 'roster' },
    whoCount,
    ' 人在線',
  );
  const leaveBtn = h(
    'button',
    {
      type: 'button',
      class: 'btn-leave',
      onClick: () => {
        cleanup();
        onLeave();
      },
    },
    '離開',
  );
  const themeBtn = h('button', { type: 'button', class: 'btn-theme', onClick: onThemeClick });
  const status = h('div', { class: 'status', role: 'status', hidden: true }, '連線中斷，重新連線中…');

  const rosterList = h('ul', { class: 'roster-list' });
  const rosterTitle = h('h2', { class: 'roster-title' }, '線上');
  const roster = h('aside', { class: 'roster', id: 'roster', 'aria-label': '線上名單' }, rosterTitle, rosterList);

  const empty = h('p', { class: 'empty' }, '還沒有人說話，來打個招呼吧');
  const log = h(
    'div',
    { class: 'log', 'aria-live': 'polite', 'aria-label': '聊天訊息', tabindex: '0' },
    h('p', { class: 'retention' }, '訊息只保留最近的 200 則，所有人離開後會自動清空'),
    empty,
  );
  const jump = h('button', { type: 'button', class: 'jump', hidden: true, onClick: () => scrollToBottom() }, '有新訊息 ↓');

  const typingRow = h('p', { class: 'typing', 'aria-live': 'polite' });

  const textarea = h('textarea', {
    class: 'composer-input',
    rows: '1',
    placeholder: '輸入訊息',
    'aria-label': '輸入訊息',
  });
  const counter = h('span', { class: 'counter' }, `0 / ${MESSAGE_MAX}`);
  const sendBtn = h('button', { type: 'submit', class: 'btn-primary btn-send', disabled: true }, '送出');
  const composer = h(
    'form',
    { class: 'composer', onSubmit: onSubmit },
    h('div', { class: 'composer-row' }, textarea, sendBtn),
    counter,
  );

  const root = h(
    'div',
    { class: 'chat', 'data-roster': 'closed' },
    h('header', { class: 'bar' }, h('h1', { class: 'bar-title' }, TITLE), whoBtn, themeBtn, leaveBtn),
    status,
    h('div', { class: 'body' }, h('main', { class: 'main' }, log, jump, typingRow, composer), roster),
  );

  // ---- 主題切換（只影響自己的畫面）----
  function renderTheme() {
    const { icon, text } = THEME_LABELS[getTheme()];
    themeBtn.textContent = icon;
    themeBtn.setAttribute('aria-label', `${text}（點一下切換）`);
    themeBtn.title = text;
  }
  function onThemeClick() {
    nextTheme();
    renderTheme();
  }
  renderTheme();

  // ---- 分頁標題的未讀數（只影響自己的畫面）----
  let unread = 0;
  function renderTitle() {
    document.title = unread > 0 ? `(${unread}) ${TITLE}` : TITLE;
  }
  function onVisibility() {
    if (!document.hidden) {
      unread = 0;
      renderTitle();
    }
  }
  document.addEventListener('visibilitychange', onVisibility);

  function cleanup() {
    document.removeEventListener('visibilitychange', onVisibility);
    clearInterval(typingTimer);
    unread = 0;
    renderTitle();
  }

  // ---- 「正在輸入」（會即時同步給所有人）----
  const typers = new Map(); // 代號 -> 到期時間
  let typingTimer = null;
  let lastTypingSent = 0;

  function renderTyping() {
    const now = Date.now();
    for (const [nick, until] of typers) if (until <= now) typers.delete(nick);
    const names = [...typers.keys()];
    typingRow.classList.remove('typing-error');
    typingRow.textContent =
      names.length === 0 ? '' : names.length > 2 ? '多人正在輸入…' : `${names.join('、')} 正在輸入…`;
    if (names.length === 0) {
      clearInterval(typingTimer);
      typingTimer = null;
    }
  }
  function onTyping(nickname) {
    typers.set(nickname, Date.now() + TYPING_SHOW_MS);
    renderTyping();
    if (!typingTimer) typingTimer = setInterval(renderTyping, 1000);
  }
  function showHint(text) {
    typingRow.classList.add('typing-error');
    typingRow.textContent = text;
    setTimeout(renderTyping, 3000);
  }

  // ---- 線上名單 ----
  function renderRoster(users) {
    whoCount.textContent = String(users.length);
    rosterTitle.textContent = `線上（${users.length}）`;
    rosterList.replaceChildren(
      ...users.map((u) =>
        h(
          'li',
          { class: 'roster-item', style: `--hue:${nicknameHue(u.nickname)}` },
          h('span', { class: 'dot', 'aria-hidden': 'true' }),
          h('span', { class: 'roster-name' }, u.nickname, u.self ? '（你）' : ''),
        ),
      ),
    );
  }

  whoBtn.addEventListener('click', () => {
    const open = root.dataset.roster !== 'open';
    root.dataset.roster = open ? 'open' : 'closed';
    whoBtn.setAttribute('aria-expanded', String(open));
  });

  // ---- 訊息 ----
  const nearBottom = () => log.scrollHeight - log.scrollTop - log.clientHeight < 60;
  function scrollToBottom() {
    log.scrollTop = log.scrollHeight;
    jump.hidden = true;
  }

  function appendItem(msg) {
    if (seen.has(msg.id)) return null;
    seen.add(msg.id);

    const day = dayKey(msg.createdAt);
    if (day !== lastDay) {
      log.append(h('div', { class: 'day', role: 'separator' }, h('span', {}, formatDay(msg.createdAt))));
      lastDay = day;
      lastNick = null;
    }

    if (msg.type === 'notice') {
      lastNick = null;
      log.append(h('p', { class: 'notice' }, msg.content));
      return msg;
    }

    if (!hasMessages) {
      hasMessages = true;
      empty.remove();
    }
    const mine = msg.nickname === me;
    const grouped = lastNick === msg.nickname;
    lastNick = msg.nickname;

    log.append(
      h(
        'div',
        {
          class: `msg ${mine ? 'msg-mine' : 'msg-other'}${grouped ? ' msg-grouped' : ''}`,
          style: `--hue:${nicknameHue(msg.nickname)}`,
        },
        !mine && !grouped ? h('span', { class: 'msg-name' }, msg.nickname) : null,
        h(
          'div',
          { class: 'msg-line' },
          h('p', { class: 'bubble' }, msg.content),
          h('time', { class: 'msg-time', datetime: msg.createdAt }, formatTime(msg.createdAt)),
        ),
      ),
    );
    return msg;
  }

  function onIncoming(msg) {
    const stick = nearBottom();
    const added = appendItem(msg);
    if (!added) return;
    if (msg.type === 'message' && msg.nickname !== me) {
      // 對方送出訊息，「正在輸入」就不用顯示了；分頁在背景時累計未讀數
      if (typers.delete(msg.nickname)) renderTyping();
      if (document.hidden) {
        unread += 1;
        renderTitle();
      }
    }
    if (msg.type === 'message' && msg.nickname === me) scrollToBottom();
    else if (stick) scrollToBottom();
    else if (msg.type === 'message') jump.hidden = false;
  }

  log.addEventListener('scroll', () => {
    if (nearBottom()) jump.hidden = true;
  });

  // ---- 輸入與送出 ----
  function autosize() {
    textarea.style.height = 'auto';
    const max = parseFloat(getComputedStyle(textarea).lineHeight) * 4 + 20;
    textarea.style.height = `${Math.min(textarea.scrollHeight, max)}px`;
    textarea.style.overflowY = textarea.scrollHeight > max ? 'auto' : 'hidden';
  }

  function updateComposer() {
    // 用「字」而不是 UTF-16 長度計算，emoji 才不會被多算成兩個字
    const chars = Array.from(textarea.value);
    if (chars.length > MESSAGE_MAX) textarea.value = chars.slice(0, MESSAGE_MAX).join('');
    const length = Math.min(chars.length, MESSAGE_MAX);
    counter.textContent = `${length} / ${MESSAGE_MAX}`;
    counter.classList.toggle('counter-warn', MESSAGE_MAX - length < 50);
    sendBtn.disabled = !connected || textarea.value.trim().length === 0;
    autosize();
  }

  async function onSubmit(e) {
    e.preventDefault();
    const text = textarea.value;
    if (sendBtn.disabled) return;
    try {
      await service.send(text);
      textarea.value = '';
      updateComposer();
    } catch (err) {
      // 送不出去時保留已打的字
      if (err?.code === 'rate-limited') showHint('送太快了，請稍等幾秒再送');
    }
    textarea.focus();
  }

  textarea.addEventListener('input', () => {
    updateComposer();
    const now = Date.now();
    if (textarea.value.trim() && now - lastTypingSent > TYPING_SEND_MS) {
      lastTypingSent = now;
      service.typing();
    }
  });
  textarea.addEventListener('keydown', (e) => {
    // 電腦：Enter 送出、Shift+Enter 換行。手機：Enter 換行，用送出按鈕。
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && !COARSE_POINTER.matches) {
      e.preventDefault();
      composer.requestSubmit();
    }
  });

  // ---- 連線狀態 ----
  function setConnected(value) {
    connected = value;
    status.hidden = value;
    textarea.disabled = !value; // 停用但保留已打的字
    updateComposer();
    if (value) textarea.focus();
  }

  // ---- 啟動 ----
  const unsubscribe = [
    service.onMessage(onIncoming),
    service.onPresence(renderRoster),
    service.onStatus((s) => setConnected(s === 'connected')),
    service.onTyping(onTyping),
  ];
  const stopListening = cleanup;
  cleanup = () => {
    unsubscribe.forEach((off) => off());
    stopListening();
  };

  renderRoster(session.users);
  for (const msg of session.history) appendItem(msg);
  queueMicrotask(() => {
    scrollToBottom();
    textarea.focus();
  });
  if (!navigator.onLine) setConnected(false);

  return root;
}

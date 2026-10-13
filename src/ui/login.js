import { h } from './dom.js';
import { NICKNAME_MAX, NICKNAME_ERRORS, validateNickname } from '../nickname.js';

const LAST_KEY = 'cc:lastNickname';

function readLast() {
  try {
    return localStorage.getItem(LAST_KEY) ?? '';
  } catch {
    return '';
  }
}

function saveLast(nickname) {
  try {
    localStorage.setItem(LAST_KEY, nickname);
  } catch {
    /* 沒有儲存空間也能使用，只是不會預填 */
  }
}

export function renderLogin({ service, onJoined }) {
  const input = h('input', {
    id: 'nickname',
    type: 'text',
    value: readLast(),
    autocomplete: 'off',
    autocapitalize: 'off',
    spellcheck: 'false',
    'aria-describedby': 'nickname-error',
  });
  // maxlength 以 UTF-16 計算，emoji 會被多算；改用程式檢查字數，輸入框只放寬上限
  input.maxLength = NICKNAME_MAX * 4;

  const error = h('p', { class: 'field-error', id: 'nickname-error', role: 'alert' });
  const submit = h('button', { type: 'submit', class: 'btn-primary' }, '進入');

  function showError(message) {
    error.textContent = message ?? '';
    input.toggleAttribute('aria-invalid', Boolean(message));
  }

  const form = h(
    'form',
    {
      class: 'login-card',
      novalidate: true,
      onSubmit: async (e) => {
        e.preventDefault();
        showError('');
        const check = validateNickname(input.value);
        if (!check.ok) {
          showError(NICKNAME_ERRORS[check.code]);
          input.focus();
          return;
        }
        submit.disabled = true;
        submit.textContent = '進入中…';
        try {
          const session = await service.join(check.nickname);
          saveLast(check.nickname);
          onJoined({ ...session, nickname: check.nickname });
        } catch (err) {
          showError(NICKNAME_ERRORS[err.code] ?? NICKNAME_ERRORS.failed);
          input.focus();
          input.select();
          submit.disabled = false;
          submit.textContent = '進入';
        }
      },
    },
    h('h1', { class: 'login-title' }, '匿名聊天室'),
    h('p', { class: 'login-lead' }, '不用登入，取個代號就能聊'),
    h('label', { for: 'nickname', class: 'field-label' }, '代號'),
    input,
    error,
    submit,
  );

  const screen = h('main', { class: 'login' }, form);
  queueMicrotask(() => input.focus());
  return screen;
}

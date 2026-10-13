// 手動切換主題：自動（跟隨系統）→ 淺色 → 深色，選擇會記在這個瀏覽器裡。
const KEY = 'cc:theme';
const MODES = ['auto', 'light', 'dark'];

export const THEME_LABELS = {
  auto: { icon: '◐', text: '主題：跟隨系統' },
  light: { icon: '☀', text: '主題：淺色' },
  dark: { icon: '☾', text: '主題：深色' },
};

export function getTheme() {
  try {
    const mode = localStorage.getItem(KEY);
    return MODES.includes(mode) ? mode : 'auto';
  } catch {
    return 'auto';
  }
}

export function applyTheme(mode = getTheme()) {
  if (mode === 'auto') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', mode);
}

export function nextTheme() {
  const mode = MODES[(MODES.indexOf(getTheme()) + 1) % MODES.length];
  try {
    localStorage.setItem(KEY, mode);
  } catch {
    /* 沒有儲存空間時，這次切換仍然有效，只是重新整理後會回到自動 */
  }
  applyTheme(mode);
  return mode;
}

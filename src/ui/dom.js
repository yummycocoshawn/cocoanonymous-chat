// 小工具：建立 DOM 元素。文字一律用 textContent / 文字節點，不用 innerHTML，
// 所以使用者輸入的內容永遠只會被當成純文字顯示。
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === false || value == null) continue;
    if (key.startsWith('on')) el.addEventListener(key.slice(2).toLowerCase(), value);
    else if (key === 'class') el.className = value;
    else if (key === 'style') el.style.cssText = value;
    else el.setAttribute(key, value === true ? '' : value);
  }
  for (const child of children.flat()) {
    if (child == null || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return el;
}

// 依代號算出固定的色相，同一個代號永遠同一個顏色
export function nicknameHue(nickname) {
  let hash = 0;
  for (const ch of nickname.toLowerCase()) hash = (hash * 31 + ch.codePointAt(0)) >>> 0;
  const palette = [335, 15, 35, 150, 175, 200, 225, 255, 285, 310];
  return palette[hash % palette.length];
}

export function formatTime(iso) {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function dayKey(iso) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

export function formatDay(iso) {
  const d = new Date(iso);
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

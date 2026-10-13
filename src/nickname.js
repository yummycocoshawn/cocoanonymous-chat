export const NICKNAME_MAX = 12;
export const MESSAGE_MAX = 500;

// 代號規則：前後空白去掉、1～12 字（emoji 算一字）、英文大小寫視為相同。
export function validateNickname(raw) {
  const nickname = String(raw ?? '').trim();
  if (nickname.length === 0) return { ok: false, code: 'empty' };
  if (Array.from(nickname).length > NICKNAME_MAX) return { ok: false, code: 'too-long' };
  return { ok: true, nickname, key: nickname.toLowerCase() };
}

export const NICKNAME_ERRORS = {
  empty: '請輸入代號',
  'too-long': `代號最多 ${NICKNAME_MAX} 個字`,
  taken: '這個代號已經有人用了，請換一個',
  failed: '暫時無法進入，請稍後再試',
};

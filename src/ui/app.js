import { h } from './dom.js';
import { renderLogin } from './login.js';
import { renderChat } from './chat.js';

// 在「輸入代號」與「聊天室」兩個畫面之間切換。
export function mountApp(root, service) {
  function showLogin() {
    root.replaceChildren(
      renderLogin({
        service,
        onJoined: (session) => showChat(session),
      }),
    );
  }

  function showChat(session) {
    root.replaceChildren(
      renderChat({
        service,
        session,
        onLeave: async () => {
          await service.leave();
          showLogin();
        },
      }),
    );
  }

  root.append(h('noscript', {}, '請開啟 JavaScript 後再使用聊天室。'));
  showLogin();
}

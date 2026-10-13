import './styles/main.css';
import { mountApp } from './ui/app.js';
import { MockChatService } from './service/MockChatService.js';

// 階段二接上 Supabase 時，只需要把這一行換成 SupabaseChatService。
const service = new MockChatService();

mountApp(document.getElementById('app'), service);

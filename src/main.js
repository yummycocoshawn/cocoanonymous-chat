import './styles/main.css';
import { mountApp } from './ui/app.js';
import { SupabaseChatService } from './service/SupabaseChatService.js';

// 階段二：通訊交給 Supabase。階段一用的 MockChatService 還留在 src/service/，
// 需要的話把這一行換回去就能切回假後端。
const service = new SupabaseChatService();

mountApp(document.getElementById('app'), service);

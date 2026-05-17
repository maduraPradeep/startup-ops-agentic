import { useAuthStore } from './stores/auth.store';
import { ChatPage } from './pages/ChatPage';
import { LoginPage } from './pages/LoginPage';

export default function App() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  return isAuthenticated ? <ChatPage /> : <LoginPage />;
}

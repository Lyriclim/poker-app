import { Routes, Route, Navigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth } from './store/auth';
import LandingPage from './pages/LandingPage';
import LoginPage from './pages/LoginPage';
import LobbyPage from './pages/LobbyPage';
import TablePage from './pages/TablePage';
import { useLayout } from './store/layout';

function RequireAuth({ children }: { children: ReactNode }) {
  const token = useAuth((s) => s.token);
  if (!token) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  const mode = useLayout((s) => s.mode);
  return (
    <div className={`app-shell layout-${mode}`}>
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/lobby"
        element={
          <RequireAuth>
            <LobbyPage />
          </RequireAuth>
        }
      />
      <Route
        path="/table/:roomId"
        element={
          <RequireAuth>
            <TablePage />
          </RequireAuth>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </div>
  );
}

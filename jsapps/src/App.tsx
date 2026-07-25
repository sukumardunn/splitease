import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { AppContextProvider } from './context/AppContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider } from './components/ui/Toast';
import AuthScreen from './components/auth/AuthScreen';
import LoadingScreen from './components/ui/LoadingScreen';
import Layout from './components/layout/Layout';
import Dashboard from './pages/Dashboard';
import Groups from './pages/Groups';
import Expenses from './pages/Expenses';
import Friends from './pages/Friends';
import Activity from './pages/Activity';
import Analytics from './pages/Analytics';
import RecentlyDeleted from './pages/RecentlyDeleted';
import Settings from './pages/Settings';
import GroupDetail from './pages/GroupDetail';

function AuthGate() {
  const { session, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!session) return <AuthScreen />;
  return (
    <AppContextProvider>
      <Router>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<Dashboard />} />
            <Route path="groups" element={<Groups />} />
            <Route path="groups/:id" element={<GroupDetail />} />
            <Route path="expenses" element={<Expenses />} />
            <Route path="friends" element={<Friends />} />
            <Route path="analytics" element={<Analytics />} />
            <Route path="activity" element={<Activity />} />
            <Route path="recently-deleted" element={<RecentlyDeleted />} />
            <Route path="settings" element={<Settings />} />
          </Route>
        </Routes>
      </Router>
    </AppContextProvider>
  );
}

function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <AuthGate />
      </AuthProvider>
    </ToastProvider>
  );
}

export default App;

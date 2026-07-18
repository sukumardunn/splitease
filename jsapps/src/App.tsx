import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { AppContextProvider } from './context/AppContext';
import { ToastProvider } from './components/ui/Toast';
import Layout from './components/layout/Layout';
import Dashboard from './pages/Dashboard';
import Groups from './pages/Groups';
import Expenses from './pages/Expenses';
import Friends from './pages/Friends';
import Activity from './pages/Activity';
import RecentlyDeleted from './pages/RecentlyDeleted';
import Settings from './pages/Settings';
import GroupDetail from './pages/GroupDetail';

function App() {
  return (
    <AppContextProvider>
      <ToastProvider>
        <Router>
          <Routes>
            <Route path="/" element={<Layout />}>
              <Route index element={<Dashboard />} />
              <Route path="groups" element={<Groups />} />
              <Route path="groups/:id" element={<GroupDetail />} />
              <Route path="expenses" element={<Expenses />} />
              <Route path="friends" element={<Friends />} />
              <Route path="activity" element={<Activity />} />
              <Route path="recently-deleted" element={<RecentlyDeleted />} />
              <Route path="settings" element={<Settings />} />
            </Route>
          </Routes>
        </Router>
      </ToastProvider>
    </AppContextProvider>
  );
}

export default App;
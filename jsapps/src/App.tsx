import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { AppContextProvider } from './context/AppContext';
import Layout from './components/layout/Layout';
import Dashboard from './pages/Dashboard';
import Groups from './pages/Groups';
import Expenses from './pages/Expenses';
import Friends from './pages/Friends';
import Activity from './pages/Activity';
import Settings from './pages/Settings';
import GroupDetail from './pages/GroupDetail';
import LoginPage from './pages/Login';
import SignupPage from './pages/Signup';
import ProtectedRoute from './components/auth/ProtectedRoute';
import AuthRedirect from './components/auth/AuthRedirect';

function App() {
  return (
    <AppContextProvider>
      <Router>
        <Routes>
          {/* Auth routes: redirect if logged in */}
          <Route path="/login" element={<AuthRedirect><LoginPage /></AuthRedirect>} />
          <Route path="/signup" element={<AuthRedirect><SignupPage /></AuthRedirect>} />

          {/* Protected routes: Layout and its children */}
          <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
            <Route index element={<Dashboard />} />
            <Route path="groups" element={<Groups />} />
            <Route path="groups/:id" element={<GroupDetail />} />
            <Route path="expenses" element={<Expenses />} />
            <Route path="friends" element={<Friends />} />
            <Route path="activity" element={<Activity />} />
            <Route path="settings" element={<Settings />} />
          </Route>
          
          {/* Consider adding a NotFoundPage route here */}
          {/* <Route path="*" element={<NotFoundPage />} /> */}
        </Routes>
      </Router>
    </AppContextProvider>
  );
}

export default App;
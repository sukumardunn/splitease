import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAppContext } from '../../context/AppContext';

interface AuthRedirectProps {
  children: JSX.Element;
}

const AuthRedirect: React.FC<AuthRedirectProps> = ({ children }) => {
  const { currentUser, isLoading } = useAppContext();

  if (isLoading) {
    // Optional: Show a loading spinner while checking auth state
    // For auth pages, often it's fine to just let them render if simple,
    // or show a minimal loader if AppContext's initial load is significant.
    return (
      <div className="flex justify-center items-center min-h-screen">
        <p className="text-lg font-semibold text-gray-700">Checking authentication...</p>
      </div>
    );
  }

  if (currentUser) {
    // User is logged in, redirect from auth pages (like login/signup) to the main app page
    return <Navigate to="/" replace />;
  }

  // User is not logged in, render the children (e.g., Login or Signup page)
  return children;
};

export default AuthRedirect;

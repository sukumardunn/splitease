import React from 'react';
import { Loader2 } from 'lucide-react';

const LoadingScreen: React.FC = () => (
  <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 text-gray-500">
    <Loader2 className="h-8 w-8 animate-spin text-teal-500 mb-3" />
    <p className="text-sm font-medium">Loading SplitEase…</p>
  </div>
);

export default LoadingScreen;

'use client';

import { Sidebar } from './sidebar';
import { useGlobalJobMonitor } from '@/lib/hooks/useGlobalJobMonitor';
import { GlobalJobIndicator } from '@/components/ui/global-job-indicator';

export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Initialize global job monitoring
  useGlobalJobMonitor();

  return (
    <div className="flex h-screen bg-background">
      {/* Sidebar */}
      <Sidebar />

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header with Global Job Indicator */}
        <div className="flex justify-end p-4 border-b bg-white">
          <GlobalJobIndicator />
        </div>

        <main className="flex-1 overflow-y-auto p-6">
          {children}
        </main>
      </div>
    </div>
  );
}

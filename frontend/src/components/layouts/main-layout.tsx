'use client';

import { Sidebar } from './sidebar';
import { MobileNavigation } from './mobile-navigation';
import { JobMonitorProvider } from '@/lib/contexts/JobMonitorContext';
import { GlobalJobIndicator } from '@/components/ui/global-job-indicator';

export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <JobMonitorProvider>
      <div className="flex h-screen bg-background">
        {/* Desktop Sidebar */}
        <div className="hidden md:block">
          <Sidebar />
        </div>

        {/* Main Content */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Header with Mobile Navigation and Global Job Indicator */}
          <div className="flex items-center justify-between p-4 border-b bg-white">
            {/* Mobile Navigation */}
            <MobileNavigation />

            {/* Desktop Spacer */}
            <div className="hidden md:block flex-1"></div>

            <GlobalJobIndicator />
          </div>

          <main className="flex-1 overflow-y-auto p-6">
            {children}
          </main>
        </div>
      </div>
    </JobMonitorProvider>
  );
}

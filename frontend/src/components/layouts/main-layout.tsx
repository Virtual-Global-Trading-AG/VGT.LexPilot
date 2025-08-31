'use client';

import { useState } from 'react';
import { Sidebar } from './sidebar';
import { JobMonitorProvider } from '@/lib/contexts/JobMonitorContext';
import { GlobalJobIndicator } from '@/components/ui/global-job-indicator';
import { Menu } from 'lucide-react';

export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <JobMonitorProvider>
      <div className="flex h-screen bg-background">
        {/* Sidebar */}
        <Sidebar 
          mobileOpen={mobileMenuOpen}
          onMobileClose={() => setMobileMenuOpen(false)}
        />

        {/* Main Content */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Header with Mobile Menu Button and Global Job Indicator */}
          <div className="flex items-center justify-between p-4 border-b bg-white">
            {/* Mobile Menu Button */}
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="md:hidden flex h-8 w-8 items-center justify-center rounded-lg hover:bg-accent transition-colors"
              aria-label="Open mobile menu"
            >
              <Menu className="h-5 w-5" />
            </button>

            {/* Spacer for desktop */}
            <div className="hidden md:block"></div>

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

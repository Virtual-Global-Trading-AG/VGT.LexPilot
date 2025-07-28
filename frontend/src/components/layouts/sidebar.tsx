'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ThemeToggle } from '@/components/theme-toggle';
import {
  BarChart3,
  FileText,
  FolderOpen,
  Shield,
  Settings,
  Zap,
  User,
  ChevronsLeft,
  Menu
} from 'lucide-react';

const navigation = [
  {
    name: 'Dashboard',
    href: '/dashboard',
    icon: BarChart3,
    current: false,
  },
  {
    name: 'Verträge',
    href: '/contracts',
    icon: FolderOpen,
    current: false,
  },
  {
    name: 'Generator',
    href: '/generator',
    icon: Zap,
    current: false,
  },
  {
    name: 'DSGVO-Check',
    href: '/dsgvo-check',
    icon: Shield,
    current: false,
  },
  {
    name: 'Einstellungen',
    href: '/settings',
    icon: Settings,
    current: false,
  },
];

interface SidebarProps {
  className?: string;
}

export function Sidebar({ className }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();

  return (
    <div
      className={cn(
        'flex h-full flex-col border-r border-border bg-card transition-all duration-300',
        collapsed ? 'w-16' : 'w-64',
        className
      )}
    >
      {/* Header */}
      <div className="flex h-16 items-center justify-between border-b border-border px-4">
        {!collapsed && (
          <div className="flex items-center space-x-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
              <FileText className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="text-lg font-semibold text-foreground">
              LexPilot AI
            </span>
          </div>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-accent"
        >
          {collapsed ? (
            <Menu className="h-4 w-4" />
          ) : (
            <ChevronsLeft className="h-4 w-4" />
          )}
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 p-2">
        {navigation.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                'flex items-center space-x-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
              )}
            >
              <item.icon className="h-5 w-5 shrink-0" />
              {!collapsed && <span>{item.name}</span>}
            </Link>
          );
        })}
      </nav>

      {/* Pro Plan Badge */}
      {!collapsed && (
        <div className="p-4">
          <div className="rounded-lg bg-gradient-to-r from-blue-500 to-purple-600 p-4 text-white">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-medium">Pro Plan</span>
              <Badge variant="secondary" className="bg-white/20 text-white">
                CHF 299
              </Badge>
            </div>
            <p className="text-xs text-white/80">
              Unbegrenzte Vertragsanalysen
            </p>
          </div>
        </div>
      )}

      {/* User Profile */}
      <div className="border-t border-border p-4">
        <div className="flex items-center space-x-3">
          <Avatar className="h-8 w-8">
            <AvatarImage src="/avatars/user.jpg" alt="User" />
            <AvatarFallback>MM</AvatarFallback>
          </Avatar>
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground truncate">
                Max Mustermann
              </p>
              <p className="text-xs text-muted-foreground truncate">
                max.mustermann@example.com
              </p>
            </div>
          )}
          {!collapsed && <ThemeToggle />}
        </div>
      </div>
    </div>
  );
}

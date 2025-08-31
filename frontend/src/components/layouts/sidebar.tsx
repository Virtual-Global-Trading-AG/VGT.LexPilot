'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ThemeToggle } from '@/components/theme-toggle';
import { useAuthStore } from '@/lib/stores/authStore';
import {
  BarChart3,
  FileText,
  FolderOpen,
  Shield,
  Settings,
  Zap,
  User,
  ChevronsLeft,
  Menu,
  X
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
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

export function Sidebar({ className, mobileOpen = false, onMobileClose }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const pathname = usePathname();
  const { userProfile } = useAuthStore();

  // Check if we're on mobile
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Close mobile menu when route changes
  useEffect(() => {
    if (isMobile && onMobileClose) {
      onMobileClose();
    }
  }, [pathname, isMobile, onMobileClose]);

  const getInitials = () => {
    if (userProfile?.displayName) {
      return userProfile.displayName.split(' ').map(n => n[0]).join('').toUpperCase();
    }
    if (userProfile?.firstName && userProfile?.lastName) {
      return `${userProfile.firstName[0]}${userProfile.lastName[0]}`.toUpperCase();
    }
    if (userProfile?.email) {
      return userProfile.email[0]?.toUpperCase() || 'U';
    }
    return 'U';
  };

  const getDisplayName = () => {
    if (userProfile?.displayName) return userProfile.displayName;
    if (userProfile?.firstName && userProfile?.lastName) {
      return `${userProfile.firstName} ${userProfile.lastName}`;
    }
    if (userProfile?.firstName) return userProfile.firstName;
    return 'Benutzer';
  };

  return (
    <>
      {/* Mobile Overlay */}
      {isMobile && mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black bg-opacity-50 md:hidden"
          onClick={onMobileClose}
        />
      )}

      {/* Sidebar */}
      <div
        className={cn(
          'flex h-full flex-col border-r border-border bg-card transition-all duration-300',
          // Desktop behavior
          'md:relative md:translate-x-0',
          // Mobile behavior
          isMobile ? [
            'fixed inset-y-0 left-0 z-50 w-64',
            mobileOpen ? 'translate-x-0' : '-translate-x-full'
          ] : [
            collapsed ? 'w-16' : 'w-64'
          ],
          className
        )}
      >
        {/* Header */}
        <div className="flex h-16 items-center justify-between border-b border-border px-4">
          {!collapsed && !isMobile && (
            <div className="flex items-center space-x-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
                <FileText className="h-4 w-4 text-primary-foreground" />
              </div>
              <span className="text-lg font-semibold text-foreground">
                LexForm AI
              </span>
            </div>
          )}
          {isMobile && (
            <div className="flex items-center space-x-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
                <FileText className="h-4 w-4 text-primary-foreground" />
              </div>
              <span className="text-lg font-semibold text-foreground">
                LexForm AI
              </span>
            </div>
          )}
          <button
            onClick={isMobile ? onMobileClose : () => setCollapsed(!collapsed)}
            className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-accent"
          >
            {isMobile ? (
              <X className="h-4 w-4" />
            ) : collapsed ? (
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
                {(!collapsed || isMobile) && <span>{item.name}</span>}
              </Link>
            );
          })}
        </nav>

        {/* Pro Plan Badge */}
        {(!collapsed || isMobile) && (
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
              <AvatarImage src={userProfile?.photoURL} alt="User" />
              <AvatarFallback>{getInitials()}</AvatarFallback>
            </Avatar>
            {(!collapsed || isMobile) && (
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">
                  {getDisplayName()}
                </p>
                <p className="text-xs text-muted-foreground truncate">
                  {userProfile?.email || 'Keine E-Mail'}
                </p>
              </div>
            )}
            {(!collapsed || isMobile) && <ThemeToggle />}
          </div>
        </div>
      </div>
    </>
  );
}

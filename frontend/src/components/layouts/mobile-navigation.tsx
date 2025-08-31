'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ThemeToggle } from '@/components/theme-toggle';
import { useAuthStore } from '@/lib/stores/authStore';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  BarChart3,
  FileText,
  FolderOpen,
  Shield,
  Settings,
  Zap,
  User,
  Menu,
  LogOut
} from 'lucide-react';

const navigation = [
  {
    name: 'Dashboard',
    href: '/dashboard',
    icon: BarChart3,
  },
  {
    name: 'Verträge',
    href: '/contracts',
    icon: FolderOpen,
  },
  {
    name: 'Generator',
    href: '/generator',
    icon: Zap,
  },
  {
    name: 'DSGVO-Check',
    href: '/dsgvo-check',
    icon: Shield,
  },
  {
    name: 'Einstellungen',
    href: '/settings',
    icon: Settings,
  },
];

interface MobileNavigationProps {
  className?: string;
}

export function MobileNavigation({ className }: MobileNavigationProps) {
  const pathname = usePathname();
  const { userProfile, signOut } = useAuthStore();

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

  const getCurrentPageName = () => {
    const currentNav = navigation.find(item => item.href === pathname);
    return currentNav?.name || 'LexForm AI';
  };

  return (
    <div className={cn('md:hidden flex items-center justify-between w-full', className)}>
      {/* Logo and Current Page */}
      <div className="flex items-center space-x-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
          <FileText className="h-4 w-4 text-primary-foreground" />
        </div>
        <span className="text-lg font-semibold text-foreground">
          {getCurrentPageName()}
        </span>
      </div>

      {/* Navigation Dropdown */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className="flex h-10 w-10 items-center justify-center rounded-lg hover:bg-accent transition-colors"
            aria-label="Navigation menu"
          >
            <Menu className="h-5 w-5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-64 p-2" align="end">
          {/* User Profile Section */}
          <div className="flex items-center space-x-3 p-2 mb-2">
            <Avatar className="h-8 w-8">
              <AvatarImage src={userProfile?.photoURL} alt="User" />
              <AvatarFallback>{getInitials()}</AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground truncate">
                {getDisplayName()}
              </p>
              <p className="text-xs text-muted-foreground truncate">
                {userProfile?.email || 'Keine E-Mail'}
              </p>
            </div>
            <ThemeToggle />
          </div>

          <DropdownMenuSeparator />

          {/* Navigation Items */}
          {navigation.map((item) => {
            const isActive = pathname === item.href;
            return (
              <DropdownMenuItem key={item.name} asChild>
                <Link
                  href={item.href}
                  className={cn(
                    'flex items-center space-x-3 w-full px-2 py-2 rounded-md transition-colors',
                    isActive
                      ? 'bg-primary text-primary-foreground'
                      : 'hover:bg-accent hover:text-accent-foreground'
                  )}
                >
                  <item.icon className="h-4 w-4 shrink-0" />
                  <span>{item.name}</span>
                </Link>
              </DropdownMenuItem>
            );
          })}

          <DropdownMenuSeparator />

          {/* Pro Plan Badge */}
          <div className="p-2">
            <div className="rounded-lg bg-gradient-to-r from-blue-500 to-purple-600 p-3 text-white">
              <div className="mb-1 flex items-center justify-between">
                <span className="text-xs font-medium">Pro Plan</span>
                <Badge variant="secondary" className="bg-white/20 text-white text-xs">
                  CHF 299
                </Badge>
              </div>
              <p className="text-xs text-white/80">
                Unbegrenzte Vertragsanalysen
              </p>
            </div>
          </div>

          <DropdownMenuSeparator />

          {/* Logout */}
          <DropdownMenuItem
            onClick={() => signOut()}
            className="flex items-center space-x-3 text-red-600 hover:text-red-700 hover:bg-red-50"
          >
            <LogOut className="h-4 w-4" />
            <span>Abmelden</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
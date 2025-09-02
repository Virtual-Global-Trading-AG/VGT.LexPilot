"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { useAuthStore } from "@/lib/stores/authStore"
import { Spinner } from "@/components/ui/spinner"

interface AuthGuardProps {
  children: React.ReactNode
  requireAuth?: boolean
  redirectTo?: string
  fallback?: React.ReactNode
}

export function AuthGuard({ 
  children, 
  requireAuth = true, 
  redirectTo,
  fallback 
}: AuthGuardProps) {
  const { isAuthenticated, loading, user } = useAuthStore()
  const router = useRouter()

  useEffect(() => {
    if (loading) return

    if (requireAuth && !isAuthenticated) {
      router.push(redirectTo || "/login")
    } else if (!requireAuth && isAuthenticated) {
      router.push(redirectTo || "/dashboard")
    }
  }, [isAuthenticated, loading, requireAuth, redirectTo, router])

  if (loading) {
    return (
      fallback || (
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-center space-y-4">
            <Spinner size="lg" />
          </div>
        </div>
      )
    )
  }

  if (requireAuth && !isAuthenticated) {
    return null // Will redirect
  }

  if (!requireAuth && isAuthenticated) {
    return null // Will redirect
  }

  return <>{children}</>
}

export function ProtectedRoute({ children, ...props }: Omit<AuthGuardProps, 'requireAuth'>) {
  return (
    <AuthGuard requireAuth={true} {...props}>
      {children}
    </AuthGuard>
  )
}

export function PublicRoute({ children, ...props }: Omit<AuthGuardProps, 'requireAuth'>) {
  return (
    <AuthGuard requireAuth={false} {...props}>
      {children}
    </AuthGuard>
  )
}

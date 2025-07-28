"use client"

import { AuthLayout } from "@/components/features/auth/AuthLayout"
import { LoginForm } from "@/components/features/auth/LoginForm"
import { PublicRoute } from "@/components/features/auth/AuthGuard"

export default function LoginPage() {
  return (
    <PublicRoute redirectTo="/dashboard">
      <AuthLayout>
        <LoginForm />
      </AuthLayout>
    </PublicRoute>
  )
}

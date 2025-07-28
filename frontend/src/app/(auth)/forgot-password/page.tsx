"use client"

import { AuthLayout } from "@/components/features/auth/AuthLayout"
import { ForgotPasswordForm } from "@/components/features/auth/ForgotPasswordForm"
import { PublicRoute } from "@/components/features/auth/AuthGuard"

export default function ForgotPasswordPage() {
  return (
    <PublicRoute redirectTo="/dashboard">
      <AuthLayout>
        <ForgotPasswordForm />
      </AuthLayout>
    </PublicRoute>
  )
}

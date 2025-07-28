"use client"

import { AuthLayout } from "@/components/features/auth/AuthLayout"
import { RegisterForm } from "@/components/features/auth/RegisterForm"
import { PublicRoute } from "@/components/features/auth/AuthGuard"

export default function RegisterPage() {
  return (
    <PublicRoute redirectTo="/dashboard">
      <AuthLayout>
        <RegisterForm />
      </AuthLayout>
    </PublicRoute>
  )
}

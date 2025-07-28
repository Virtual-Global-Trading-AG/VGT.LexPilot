"use client"

import { ProtectedRoute } from "@/components/features/auth/AuthGuard"

export default function PrivateLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <ProtectedRoute redirectTo="/login">
      {children}
    </ProtectedRoute>
  )
}

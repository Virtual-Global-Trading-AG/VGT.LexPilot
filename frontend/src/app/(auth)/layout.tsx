import { Metadata } from "next"

export const metadata: Metadata = {
  title: "Authentifizierung - VGT.LexForm",
  description: "Melden Sie sich an oder registrieren Sie sich für VGT.LexPilot",
}

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 dark:from-gray-900 dark:to-blue-900">
      {children}
    </div>
  )
}

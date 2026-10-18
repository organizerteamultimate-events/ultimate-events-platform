import type { Metadata } from 'next'
import { AuthShell } from '@/components/site/auth-shell'
import { LoginForm } from '@/components/forms/login-form'

export const metadata: Metadata = { title: 'Admin Login', robots: { index: false } }

export default function AdminLoginPage() {
  return (
    <AuthShell
      title="Admin Login"
      description="Restricted to administrators authorized through the secure bootstrap process."
      feature="Admin authentication"
    >
      <LoginForm variant="admin" />
    </AuthShell>
  )
}

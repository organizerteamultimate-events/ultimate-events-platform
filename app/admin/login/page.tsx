import type { Metadata } from 'next'
import { AuthShell } from '@/components/site/auth-shell'
import { LoginForm } from '@/components/forms/login-form'

export const metadata: Metadata = { title: 'Admin Login', robots: { index: false } }

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error } = await searchParams
  const initialMessage = error === 'unauthorized'
    ? 'This account is not authorized as an administrator.'
    : error === 'account-unavailable'
      ? 'This account is suspended or its administrator status could not be verified.'
      : null

  return (
    <AuthShell
      title="Admin Login"
      description="Restricted to administrators authorized through the secure bootstrap process."
      feature="Admin authentication"
    >
      <LoginForm variant="admin" initialMessage={initialMessage} />
    </AuthShell>
  )
}

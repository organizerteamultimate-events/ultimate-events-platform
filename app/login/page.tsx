import type { Metadata } from 'next'
import { AuthShell } from '@/components/site/auth-shell'
import { LoginForm } from '@/components/forms/login-form'

export const metadata: Metadata = { title: 'Login' }

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error } = await searchParams
  const initialMessage = error === 'account-unavailable'
    ? 'Your account is suspended or its status could not be verified. Contact support for help.'
    : error === 'verification'
      ? 'Email verification could not be completed. Request a new verification email or contact support.'
      : null

  return (
    <AuthShell
      title="Welcome back"
      description="Log in with your registered email and password to open your dashboard."
      feature="Login"
    >
      <LoginForm initialMessage={initialMessage} />
    </AuthShell>
  )
}

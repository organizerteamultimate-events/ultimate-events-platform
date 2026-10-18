import type { Metadata } from 'next'
import { AuthShell } from '@/components/site/auth-shell'
import { LoginForm } from '@/components/forms/login-form'

export const metadata: Metadata = { title: 'Login' }

export default function LoginPage() {
  return (
    <AuthShell
      title="Welcome back"
      description="Log in with your registered email and password to open your dashboard."
      feature="Login"
    >
      <LoginForm />
    </AuthShell>
  )
}

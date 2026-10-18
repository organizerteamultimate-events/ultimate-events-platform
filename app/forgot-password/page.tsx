import type { Metadata } from 'next'
import { AuthShell } from '@/components/site/auth-shell'
import { ForgotPasswordForm } from '@/components/forms/simple-forms'

export const metadata: Metadata = { title: 'Forgot Password' }

export default function ForgotPasswordPage() {
  return (
    <AuthShell
      title="Reset your password"
      description="Enter your account email and we will send a secure, time-limited reset link."
      feature="Password reset"
    >
      <ForgotPasswordForm />
    </AuthShell>
  )
}

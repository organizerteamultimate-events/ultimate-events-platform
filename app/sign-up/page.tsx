import type { Metadata } from 'next'
import { AuthShell } from '@/components/site/auth-shell'
import { SignUpForm } from '@/components/forms/sign-up-form'

export const metadata: Metadata = { title: 'Create Account' }

export default function SignUpPage() {
  return (
    <AuthShell
      wide
      title="Create your account"
      description="Register once to get a permanent participant ID and join any event with the same account."
      feature="Account registration"
    >
      <SignUpForm />
    </AuthShell>
  )
}

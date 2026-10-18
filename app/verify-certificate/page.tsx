import type { Metadata } from 'next'
import { AuthShell } from '@/components/site/auth-shell'
import { CertificateVerifyForm } from '@/components/forms/simple-forms'

export const metadata: Metadata = { title: 'Verify a Certificate' }

export default function VerifyCertificatePage() {
  return (
    <AuthShell
      title="Verify a certificate"
      description="Confirm that a certificate was issued by ULTIMATE EVENTS. Only the minimum details needed for verification are shown."
      feature="Certificate verification"
    >
      <CertificateVerifyForm />
    </AuthShell>
  )
}

import type { Metadata } from 'next'
import { LegalPage } from '@/components/site/legal-page'

export const metadata: Metadata = { title: 'Terms of Service' }

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of Service"
      intro="The rules for using ULTIMATE EVENTS."
      sections={[
        { heading: 'Accounts', body: 'Provide accurate information and keep your password confidential. Each person may hold one account and one permanent participant ID.' },
        { heading: 'Registrations and payments', body: 'Paid registrations are confirmed only after the payment provider verifies the transaction. Refunds follow the policy stated on each event.' },
        { heading: 'Competitions', body: 'Submissions must be your own work. Plagiarism, collusion, or attempts to interfere with judging may lead to disqualification.' },
        { heading: 'Certificates', body: 'Certificates are issued only to participants who meet the published eligibility rules and may be revoked if obtained improperly.' },
      ]}
    />
  )
}

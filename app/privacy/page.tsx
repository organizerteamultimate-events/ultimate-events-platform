import type { Metadata } from 'next'
import { LegalPage } from '@/components/site/legal-page'

export const metadata: Metadata = { title: 'Privacy Policy' }

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      intro="How ULTIMATE EVENTS collects, uses, and protects your information."
      sections={[
        { heading: 'Information we collect', body: 'Your name, email address, mobile number, and optional college, organization, and qualification details, plus the registrations, submissions, and certificates associated with your account.' },
        { heading: 'How we use it', body: 'To operate your account and permanent participant ID, process event registrations and verified payments, publish results you have earned, issue certificates, and send service emails you have not opted out of.' },
        { heading: 'Security', body: 'Passwords are stored only as secure hashes and are never emailed. Manual UPI payment references and submitted receipt images are stored for verification; receipt images are kept in private storage and are available only to the participant and authorized administrators.' },
        { heading: 'Your choices', body: 'You can update your profile, manage notification preferences, unsubscribe from announcements, and contact us to request access to or deletion of your data.' },
      ]}
    />
  )
}

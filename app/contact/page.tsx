import type { Metadata } from 'next'
import { PageHeader, SetupNotice } from '@/components/site/blocks'
import { ContactForm } from '@/components/forms/simple-forms'

export const metadata: Metadata = { title: 'Contact Us' }

export default function ContactPage() {
  return (
    <>
      <PageHeader
        eyebrow="Contact Us"
        title="We are here to help"
        description="Questions about events, registrations, payments, or certificates? Send us a message."
      />
      <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6">
        <div className="rounded-2xl border bg-card p-6 shadow-sm sm:p-8">
          <SetupNotice feature="The contact form" className="mb-6" />
          <ContactForm />
        </div>
      </div>
    </>
  )
}

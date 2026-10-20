import nodemailer from 'nodemailer'

export function isTransactionalEmailConfigured() {
  return Boolean(
    process.env.SMTP_HOST &&
    process.env.SMTP_USER &&
    process.env.SMTP_APP_PASSWORD &&
    process.env.EMAIL_FROM,
  )
}

export function wasRecipientAcceptedBySmtp(
  to: string,
  acceptedRecipients: readonly (string | { address: string })[],
) {
  return acceptedRecipients.some((recipient) => {
    const address = typeof recipient === 'string' ? recipient : recipient.address
    return address.toLowerCase() === to.toLowerCase()
  })
}

export function escapeEmailHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => {
    const escaped: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    }
    return escaped[character]
  })
}

export async function sendTransactionalEmail({
  to,
  subject,
  text,
  html,
}: {
  to: string
  subject: string
  text: string
  html: string
}) {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_APP_PASSWORD, EMAIL_FROM } = process.env
  if (!SMTP_HOST || !SMTP_USER || !SMTP_APP_PASSWORD || !EMAIL_FROM) {
    throw new Error('Server-side email is not configured. Set SMTP_HOST, SMTP_USER, SMTP_APP_PASSWORD, and EMAIL_FROM.')
  }

  const port = SMTP_PORT ? Number(SMTP_PORT) : 465
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('SMTP_PORT must be a valid port number.')
  }

  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port,
    secure: port === 465,
    auth: { user: SMTP_USER, pass: SMTP_APP_PASSWORD },
  })

  const result = await transporter.sendMail({ from: EMAIL_FROM, to, subject, text, html })
  if (!wasRecipientAcceptedBySmtp(to, result.accepted)) {
    throw new Error('SMTP server did not accept the recipient.')
  }

  return { status: 'accepted' as const }
}

export type SignUpValues = {
  fullName: string
  email: string
  mobile: string
  organization: string
  qualification: string
  password: string
  confirmPassword: string
  terms: boolean
}

export type SignUpErrors = Partial<Record<keyof SignUpValues, string>>

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase()
}

export function normalizeMobile(mobile: string) {
  return mobile.replace(/[\s-]/g, '')
}

export function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(email.trim())
}

export function isValidMobile(mobile: string) {
  return /^\+?[0-9]{10,15}$/.test(normalizeMobile(mobile))
}

export function isStrongPassword(password: string) {
  return password.length >= 10 && /[A-Za-z]/.test(password) && /[0-9]/.test(password)
}

export function validateLoginForm(email: string, password: string) {
  const errors: { email?: string; password?: string } = {}
  if (!isValidEmail(email)) errors.email = 'Enter a valid email address.'
  if (!password) errors.password = 'Enter your password.'
  return errors
}

export function validateSignUp(values: SignUpValues): SignUpErrors {
  const errors: SignUpErrors = {}
  if (values.fullName.trim().length < 2) errors.fullName = 'Enter your full name.'
  if (!isValidEmail(values.email)) errors.email = 'Enter a valid email address.'
  if (!isValidMobile(values.mobile)) errors.mobile = 'Enter a valid mobile number (10–15 digits).'
  if (values.password.length < 10) errors.password = 'Use at least 10 characters.'
  else if (!isStrongPassword(values.password)) errors.password = 'Include at least one letter and one number.'
  if (values.confirmPassword !== values.password) errors.confirmPassword = 'Passwords do not match.'
  if (!values.terms) errors.terms = 'You must accept the terms and privacy policy.'
  return errors
}

export function hasAdminAccess(profileRole: string | null | undefined) {
  return profileRole === 'admin'
}

export function getSiteUrl() {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim()
  if (configured) return configured.replace(/\/+$/, '')
  if (typeof window !== 'undefined') return window.location.origin
  return 'http://localhost:3000'
}

export function buildAbsoluteUrl(pathname: string, searchParams?: Record<string, string>) {
  const url = new URL(pathname.startsWith('/') ? pathname : `/${pathname}`, getSiteUrl())
  if (searchParams) {
    for (const [key, value] of Object.entries(searchParams)) {
      url.searchParams.set(key, value)
    }
  }
  return url.toString()
}

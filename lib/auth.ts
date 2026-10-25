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

export function getSafeInternalDestination(
  destination: string | null,
  origin: string,
  fallback = '/dashboard',
) {
  if (!destination || !destination.startsWith('/') || destination.startsWith('//') || destination.includes('\\')) {
    return fallback
  }

  try {
    const base = new URL(origin)
    const target = new URL(destination, base)
    if (target.origin !== base.origin) return fallback
    return `${target.pathname}${target.search}${target.hash}`
  } catch {
    return fallback
  }
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

export function isActiveAccountStatus(status: unknown): status is 'active' {
  return status === 'active'
}

export function isProvisionedProfile(
  profile: { id: string; email: string } | null,
  userId: string,
  email: string,
) {
  return profile?.id === userId && normalizeEmail(profile.email) === normalizeEmail(email)
}

export function getSignUpErrorMessage(error: { message: string; code?: string }) {
  if (
    error.code === 'user_already_exists' ||
    error.code === 'email_exists' ||
    /already (?:registered|exists)/i.test(error.message)
  ) {
    return 'An account with this email already exists. Try logging in or resetting your password.'
  }
  return error.message
}

export function logAuthDiagnostic(operation: string, error: unknown) {
  if (process.env.NODE_ENV !== 'development') return
  const errorType = error instanceof Error ? error.name : 'Unknown error'
  console.warn(`[auth] ${operation} failed (${errorType})`)
}

export function getSiteUrl() {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim()
  if (configured) return configured.replace(/\/+$/, '')
  if (typeof window !== 'undefined') return window.location.origin
  const vercelOrigin = process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL
  if (vercelOrigin) return `https://${vercelOrigin.replace(/^https?:\/\//, '').replace(/\/+$/, '')}`
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

import test from 'node:test'
import assert from 'node:assert/strict'

function normalizeEmail(email) {
  return email.trim().toLowerCase()
}

function normalizeMobile(value) {
  return value.replace(/[\s-]/g, '')
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(email.trim())
}

function isStrongPassword(password) {
  return password.length >= 10 && /[A-Za-z]/.test(password) && /[0-9]/.test(password)
}

function validateLoginForm(email, password) {
  const errors = {}
  if (!isValidEmail(email)) errors.email = 'Enter a valid email address.'
  if (!password) errors.password = 'Enter your password.'
  return errors
}

function validateSignUp(values) {
  const errors = {}
  if (values.fullName.trim().length < 2) errors.fullName = 'Enter your full name.'
  if (!isValidEmail(values.email)) errors.email = 'Enter a valid email address.'
  if (!/^\+?[0-9]{10,15}$/.test(normalizeMobile(values.mobile))) errors.mobile = 'Enter a valid mobile number (10–15 digits).'
  if (values.password.length < 10) errors.password = 'Use at least 10 characters.'
  else if (!isStrongPassword(values.password)) errors.password = 'Include at least one letter and one number.'
  if (values.confirmPassword !== values.password) errors.confirmPassword = 'Passwords do not match.'
  if (!values.terms) errors.terms = 'You must accept the terms and privacy policy.'
  return errors
}

function hasAdminAccess(profileRole) {
  return profileRole === 'admin'
}

function buildAbsoluteUrl(pathname, searchParams = {}) {
  const base = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
  const url = new URL(pathname.startsWith('/') ? pathname : `/${pathname}`, base)
  for (const [key, value] of Object.entries(searchParams)) {
    url.searchParams.set(key, value)
  }
  return url.toString()
}

test('registration validation accepts a valid sign-up payload', () => {
  const result = validateSignUp({
    fullName: 'Jane Doe',
    email: 'jane@example.com',
    mobile: '+91 98765 43210',
    organization: 'Ultimate Events',
    qualification: 'Student',
    password: 'password1234',
    confirmPassword: 'password1234',
    terms: true,
  })

  assert.deepEqual(result, {})
})

test('registration validation rejects weak or missing input', () => {
  const result = validateSignUp({
    fullName: 'A',
    email: 'bad-email',
    mobile: '12',
    organization: '',
    qualification: '',
    password: 'short',
    confirmPassword: 'different',
    terms: false,
  })

  assert.match(result.fullName, /full name/i)
  assert.match(result.email, /valid email/i)
  assert.match(result.mobile, /valid mobile/i)
  assert.match(result.password, /at least 10|one letter/i)
  assert.match(result.confirmPassword, /do not match/i)
  assert.match(result.terms, /accept the terms/i)
})

test('login validation prevents empty credentials', () => {
  assert.deepEqual(validateLoginForm('guest@example.com', ''), { password: 'Enter your password.' })
  assert.deepEqual(validateLoginForm('bad-email', 'Password1234'), { email: 'Enter a valid email address.' })
})

test('admin role check is strict', () => {
  assert.equal(hasAdminAccess('admin'), true)
  assert.equal(hasAdminAccess('user'), false)
  assert.equal(hasAdminAccess(null), false)
})

test('absolute redirect URLs use the configured site origin', () => {
  process.env.NEXT_PUBLIC_SITE_URL = 'https://example.com'
  assert.equal(buildAbsoluteUrl('/auth/callback', { next: '/dashboard' }), 'https://example.com/auth/callback?next=%2Fdashboard')
})

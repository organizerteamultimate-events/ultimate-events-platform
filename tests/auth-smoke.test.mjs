import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildAbsoluteUrl,
  getSafeInternalDestination,
  getSignUpErrorMessage,
  hasAdminAccess,
  isActiveAccountStatus,
  isProvisionedProfile,
  normalizeEmail,
  normalizeMobile,
  validateLoginForm,
  validateSignUp,
} from '../lib/auth.ts'
import { readFileSync } from 'node:fs'
import { allowedPaymentImageTypes, isValidPaymentImage, maxPaymentReceiptBytes } from '../lib/payment-receipts.ts'

const signUpSource = readFileSync(new URL('../components/forms/sign-up-form.tsx', import.meta.url), 'utf8')
const loginSource = readFileSync(new URL('../components/forms/login-form.tsx', import.meta.url), 'utf8')
const proxySource = readFileSync(new URL('../proxy.ts', import.meta.url), 'utf8')
const accessSource = readFileSync(new URL('../lib/supabase/access.ts', import.meta.url), 'utf8')
const authCallbackSource = readFileSync(new URL('../app/auth/callback/route.ts', import.meta.url), 'utf8')
const panelShellSource = readFileSync(new URL('../components/dashboard/panel-shell.tsx', import.meta.url), 'utf8')
const paymentSubmitSource = readFileSync(new URL('../app/api/payments/submit/route.ts', import.meta.url), 'utf8')
const paymentSettingsSource = readFileSync(new URL('../components/dashboard/admin-payment-settings.tsx', import.meta.url), 'utf8')
const receiptViewSource = readFileSync(new URL('../app/api/admin/payments/%5Bid%5D/receipt/route.ts', import.meta.url), 'utf8')
const eventRegistrationSource = readFileSync(new URL('../components/events/event-registration.tsx', import.meta.url), 'utf8')

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

test('new and existing login sessions require an active account status', () => {
  assert.equal(isActiveAccountStatus('active'), true)
  assert.equal(isActiveAccountStatus('suspended'), false)
  assert.equal(isActiveAccountStatus('deleted'), false)
  assert.equal(isActiveAccountStatus(undefined), false)
  assert.match(loginSource, /signInWithPassword/)
  assert.match(loginSource, /select\('account_status'\)/)
  assert.match(loginSource, /await supabase\.auth\.signOut\(\)/)
  assert.match(proxySource, /supabase\.auth\.getUser\(\)/)
  assert.doesNotMatch(proxySource, /\.from\('profiles'\)/)
  assert.match(accessSource, /requireParticipantAccess/)
  assert.match(accessSource, /select\('account_status'\)/)
  assert.match(readFileSync(new URL('../app/dashboard/page.tsx', import.meta.url), 'utf8'), /requireParticipantAccess\(\)/)
  assert.match(loginSource, /<form onSubmit=\{onSubmit\}/)
  assert.match(loginSource, /router\.refresh\(\)/)
  assert.match(loginSource, /finally\s*\{\s*setPending\(false\)/)
  assert.match(readFileSync(new URL('../app/admin/page.tsx', import.meta.url), 'utf8'), /requireAdminAccess\(\)/)
  assert.match(readFileSync(new URL('../app/admin/\[section\]/page.tsx', import.meta.url), 'utf8'), /requireAdminAccess\(\)/)
})

test('login accepts only same-origin internal redirect destinations', () => {
  assert.equal(getSafeInternalDestination('/dashboard/payments?status=pending', 'https://example.com'), '/dashboard/payments?status=pending')
  assert.equal(getSafeInternalDestination('https://attacker.example/path', 'https://example.com'), '/dashboard')
  assert.equal(getSafeInternalDestination('//attacker.example/path', 'https://example.com'), '/dashboard')
  assert.equal(getSafeInternalDestination('/\\attacker.example', 'https://example.com'), '/dashboard')
  assert.equal(getSafeInternalDestination(null, 'https://example.com'), '/dashboard')
  assert.match(authCallbackSource, /getSafeInternalDestination/)
  assert.doesNotMatch(authCallbackSource, /next\?\.startsWith\('\//)
  assert.match(panelShellSource, /router\.replace\(isAdmin \? '\/admin\/login' : '\/login'\)[\s\S]*router\.refresh\(\)/)
  assert.match(panelShellSource, /onClick=\{signOut\}[\s\S]*Signing out/)
})

test('signup verifies a matching profile and handles missing profiles', () => {
  assert.equal(isProvisionedProfile({ id: 'user-1', email: 'jane@example.com' }, 'user-1', 'JANE@example.com'), true)
  assert.equal(isProvisionedProfile(null, 'user-1', 'jane@example.com'), false)
  assert.equal(isProvisionedProfile({ id: 'other-user', email: 'jane@example.com' }, 'user-1', 'jane@example.com'), false)
  assert.equal(isProvisionedProfile({ id: 'user-1', email: 'other@example.com' }, 'user-1', 'jane@example.com'), false)
  assert.match(signUpSource, /auth\.signUp/)
  assert.match(signUpSource, /select\('id, email'\)/)
  assert.match(signUpSource, /isProvisionedProfile/)
  assert.match(signUpSource, /auth\.signOut/)
  assert.match(signUpSource, /<form onSubmit=\{onSubmit\}/)
  assert.match(signUpSource, /router\.refresh\(\)/)
  assert.match(signUpSource, /finally\s*\{\s*setPending\(false\)/)
})

test('signup reports duplicate accounts without exposing passwords or confirming enumeration', () => {
  assert.match(getSignUpErrorMessage({ code: 'user_already_exists', message: 'User exists' }), /already exists.*logging in/i)
  assert.match(getSignUpErrorMessage({ message: 'User already registered' }), /already exists.*resetting/i)
  assert.equal(getSignUpErrorMessage({ message: 'Signup is disabled' }), 'Signup is disabled')
  assert.match(signUpSource, /If you already have an account, try logging in or resetting your password/)
})

test('receipt image validation checks allowed mime, actual signature, and size', () => {
  const pngSignature = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  assert.deepEqual(allowedPaymentImageTypes, ['image/png', 'image/jpeg', 'image/webp'])
  assert.equal(isValidPaymentImage(pngSignature, 'image/png', maxPaymentReceiptBytes), true)
  assert.equal(isValidPaymentImage(pngSignature, 'image/jpeg', maxPaymentReceiptBytes), false)
  assert.equal(isValidPaymentImage(new Uint8Array(maxPaymentReceiptBytes + 1), 'image/png', maxPaymentReceiptBytes), false)
  assert.match(paymentSubmitSource, /eq\('user_id', authData\.user\.id\)/)
  assert.match(paymentSubmitSource, /createSupabaseAdminClient/)
  assert.match(paymentSubmitSource, /rpc\('submit_upi_payment_for_user'/)
  assert.match(paymentSubmitSource, /Payment submission result is uncertain; preserving the uploaded private receipt/)
  assert.match(paymentSubmitSource, /Payment submission returned an error; preserving receipt/)
  assert.doesNotMatch(paymentSubmitSource, /if \(paymentError\) \{\s*await removeUnlinkedReceipt/)
  assert.match(paymentSettingsSource, /select\('upi_id, account_holder_name, qr_image_path, payment_instructions'\)/)
  assert.match(paymentSettingsSource, /savedSettings\?\.upi_id === upiId\.trim\(\)[\s\S]*savedSettings\.account_holder_name === accountHolderName\.trim\(\)[\s\S]*savedSettings\.qr_image_path === nextQrPath[\s\S]*savedSettings\.payment_instructions === instructions\.trim\(\)/)
  assert.match(paymentSubmitSource, /receiptBucket/)
  assert.match(readFileSync(new URL('../lib/supabase/admin.ts', import.meta.url), 'utf8'), /import 'server-only'/)
  assert.match(readFileSync(new URL('../lib/supabase/admin.ts', import.meta.url), 'utf8'), /SUPABASE_SERVICE_ROLE_KEY/)
  assert.match(receiptViewSource, /profile\?\.role !== 'admin'/)
  assert.match(receiptViewSource, /createSignedUrl\(payment\.receipt_path, 60\)/)
  assert.match(receiptViewSource, /Cache-Control': 'private, no-store'/)
  assert.match(eventRegistrationSource, /select\('id, status, payment_status, amount'\)/)
  assert.match(eventRegistrationSource, /setCurrentRegistration\(savedRegistration\)/)
  assert.doesNotMatch(eventRegistrationSource, /status: price === 0 \? 'confirmed'/)
})

test('browser Supabase config supports only public variables and validates URL', async () => {
  const configModule = await import('../lib/supabase/config.ts')
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const originalPublishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  const originalAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  try {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://project.supabase.co'
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = ''
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-public-key'
    assert.deepEqual(configModule.getSupabaseConfig(), {
      url: 'https://project.supabase.co',
      key: 'anon-public-key',
    })
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'javascript:alert(1)'
    assert.equal(configModule.getSupabaseConfig(), null)
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://user:password@project.supabase.co'
    assert.equal(configModule.getSupabaseConfig(), null)
    process.env.NEXT_PUBLIC_SUPABASE_URL = ''
    assert.equal(configModule.getSupabaseConfig(), null)
  } finally {
    if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL
    else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl
    if (originalPublishableKey === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    else process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = originalPublishableKey
    if (originalAnonKey === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = originalAnonKey
  }
})

test('absolute redirect URLs use the configured site origin', () => {
  process.env.NEXT_PUBLIC_SITE_URL = 'https://example.com'
  assert.equal(buildAbsoluteUrl('/auth/callback', { next: '/dashboard' }), 'https://example.com/auth/callback?next=%2Fdashboard')
})

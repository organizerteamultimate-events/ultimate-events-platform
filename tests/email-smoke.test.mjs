import test from 'node:test'
import assert from 'node:assert/strict'
import { wasRecipientAcceptedBySmtp } from '../lib/email.ts'

test('SMTP acceptance requires the intended recipient address', () => {
  assert.equal(wasRecipientAcceptedBySmtp('participant@example.com', ['participant@example.com']), true)
  assert.equal(wasRecipientAcceptedBySmtp('Participant@example.com', [{ address: 'participant@example.com' }]), true)
  assert.equal(wasRecipientAcceptedBySmtp('participant@example.com', ['someone-else@example.com']), false)
  assert.equal(wasRecipientAcceptedBySmtp('participant@example.com', []), false)
})

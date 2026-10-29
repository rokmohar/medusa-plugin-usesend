import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { describe, it } from 'node:test'
import { handleWebhook } from '../../src/api/hooks/usesend/handle-webhook'
import { UseSendService } from '../../src/modules/usesend/services'
import type { UseSendWebhookEventData } from '../../src/modules/usesend/types'

const SECRET = 'whsec_test'

const logger = {
  info: () => {},
  warn: () => {},
}

const sign = (body: string, secret = SECRET, timestamp = String(Date.now())) => {
  return {
    'x-usesend-timestamp': timestamp,
    'x-usesend-signature': `v1=${createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex')}`,
  }
}

const setup = (options: Record<string, unknown> = { webhook_secret: SECRET }) => {
  const emitted: { name: string; data: UseSendWebhookEventData }[] = []
  const usesend = new UseSendService({ logger }, { api_key: 'k', from: 'shop@example.com', ...options })
  const dependencies = {
    usesend,
    findNotificationId: async (emailId: string) => {
      return emailId === 'email_1' ? 'noti_1' : null
    },
    emit: async (name: string, data: UseSendWebhookEventData) => {
      emitted.push({ name, data })
    },
  }

  return { dependencies, emitted }
}

const bounced = JSON.stringify({
  id: 'call_1',
  type: 'email.bounced',
  version: '1',
  createdAt: '2026-10-29T10:00:00.000Z',
  teamId: 1,
  attempt: 1,
  data: {
    id: 'email_1',
    status: 'BOUNCED',
    from: 'shop@example.com',
    to: ['ana@example.com'],
    occurredAt: '2026-10-29T10:00:00.000Z',
    bounce: { type: 'Permanent', subType: 'General', message: 'Mailbox does not exist' },
  },
})

describe('handleWebhook', () => {
  it('emits a verified email event with its notification', async () => {
    const { dependencies, emitted } = setup()
    const result = await handleWebhook(dependencies, bounced, sign(bounced))

    assert.deepEqual(result, { status: 200, body: { received: true } })
    assert.equal(emitted.length, 1)
    assert.equal(emitted[0]?.name, 'usesend.email.bounced')
    assert.deepEqual(
      { ...emitted[0]?.data, data: undefined },
      {
        call_id: 'call_1',
        type: 'email.bounced',
        email_id: 'email_1',
        notification_id: 'noti_1',
        to: ['ana@example.com'],
        status: 'BOUNCED',
        data: undefined,
      },
    )
    assert.equal(emitted[0]?.data.data.bounce !== undefined, true)
  })

  it('emits non-email events without email fields', async () => {
    const { dependencies, emitted } = setup()
    const body = JSON.stringify({ id: 'call_2', type: 'contact.created', data: { id: 'contact_1', email: 'a@b.c' } })

    await handleWebhook(dependencies, body, sign(body))

    assert.equal(emitted[0]?.name, 'usesend.contact.created')
    assert.equal(emitted[0]?.data.email_id, null)
    assert.equal(emitted[0]?.data.notification_id, null)
  })

  it('rejects a wrong signature', async () => {
    const { dependencies, emitted } = setup()
    const result = await handleWebhook(dependencies, bounced, sign(bounced, 'whsec_other'))

    assert.equal(result.status, 400)
    assert.equal(result.body?.code, 'SIGNATURE_MISMATCH')
    assert.equal(emitted.length, 0)
  })

  it('rejects an old call', async () => {
    const { dependencies } = setup()
    const result = await handleWebhook(dependencies, bounced, sign(bounced, SECRET, String(Date.now() - 10 * 60_000)))

    assert.equal(result.body?.code, 'TIMESTAMP_OUT_OF_RANGE')
  })

  it('is not found without a webhook secret', async () => {
    const { dependencies } = setup({})

    assert.deepEqual(await handleWebhook(dependencies, bounced, sign(bounced)), { status: 404 })
  })
})

import assert from 'node:assert/strict'
import { describe, it, mock } from 'node:test'
import { createElement } from 'react'
import { UseSendService } from '../../src/modules/usesend/services'
import { RetryStrategy } from '../../src/modules/usesend/utils/retry-strategy'

let templateCount = 0

const createService = (options: Record<string, unknown> = {}) => {
  const messages: string[] = []
  const log = (message: string) => {
    messages.push(message)
  }
  const service = new UseSendService(
    { logger: { info: log, warn: log } },
    { api_key: 'us_test', from: 'Shop <shop@example.com>', retry: { delay: 0 }, ...options },
  )
  const send = mock.method(service['client'].emails, 'send', async () => {
    return { data: { emailId: 'email_1' }, error: null }
  })

  return { service, send, messages }
}

const addTemplate = (service: UseSendService, subject = 'Hello') => {
  const name = `template-${templateCount++}`

  service.addTemplate(name, {
    subject,
    content: { react: ({ name: person }: { name?: string }) => createElement('p', null, `Hi ${person ?? 'there'}`) },
  })

  return name
}

const sentPayload = (send: ReturnType<typeof createService>['send'], index = 0) => {
  const call = send.mock.calls[index]

  const payload = call?.arguments[0]

  assert.ok(payload, `expected send call ${index}`)

  return payload
}

describe('sending', () => {
  it('renders the template to HTML and plain text, keyed by the notification id', async () => {
    const { service, send } = createService()
    const template = addTemplate(service, 'Welcome')
    const notification = { id: 'noti_1', to: 'ana@example.com', channel: 'email', template, data: { name: 'Ana' } }

    assert.deepEqual(await service.send(notification), { id: 'email_1' })

    const payload = sentPayload(send)

    assert.equal(payload.subject, 'Welcome')
    assert.deepEqual(payload.to, ['ana@example.com'])
    assert.match(payload.html ?? '', /<p>Hi Ana<\/p>/)
    assert.equal(payload.text, 'Hi Ana')
    assert.deepEqual(send.mock.calls[0]?.arguments[1], { idempotencyKey: 'noti_1' })
  })

  it('lets the notification content override the template', async () => {
    const { service, send } = createService()
    const template = addTemplate(service)

    await service.send({
      to: 'ana@example.com',
      channel: 'email',
      template,
      content: { subject: 'Custom', html: '<p>Custom body</p>', text: 'Custom text' },
    })

    const payload = sentPayload(send)

    assert.equal(payload.subject, 'Custom')
    assert.equal(payload.html, '<p>Custom body</p>')
    assert.equal(payload.text, 'Custom text')
  })

  it('sends notification content without a template', async () => {
    const { service, send } = createService()

    await service.send({
      to: 'ana@example.com',
      channel: 'email',
      template: 'unregistered',
      content: { subject: 'Plain', html: '<p>Only content</p>' },
    })

    assert.equal(sentPayload(send).text, 'Only content')
  })

  it('fails without a template or content, and without a subject', async () => {
    const { service, send } = createService()

    await assert.rejects(
      service.send({ to: 'ana@example.com', channel: 'email', template: 'missing' }),
      /Couldn't find an email template for missing/,
    )
    await assert.rejects(
      service.send({ to: 'ana@example.com', channel: 'email', template: 'missing', content: { html: '<p>x</p>' } }),
      /needs a subject/,
    )
    assert.equal(send.mock.callCount(), 0)
  })

  it('sends only the filename and content of attachments', async () => {
    const { service, send } = createService()
    const template = addTemplate(service)

    await service.send({
      to: 'ana@example.com',
      channel: 'email',
      template,
      attachments: [{ filename: 'invoice.pdf', content: 'QQ==', content_type: 'application/pdf' }],
    })

    assert.deepEqual(sentPayload(send).attachments, [{ filename: 'invoice.pdf', content: 'QQ==' }])
  })
})

describe('provider_data', () => {
  it('passes the per-email options to useSend', async () => {
    const { service, send } = createService()
    const template = addTemplate(service)

    await service.send({
      to: 'ana@example.com',
      channel: 'email',
      template,
      provider_data: {
        replyTo: 'support@example.com',
        cc: ['boss@example.com'],
        bcc: 'archive@example.com',
        headers: { 'X-Campaign': 'spring' },
        scheduledAt: '2026-11-01T09:00:00Z',
      },
    })

    const payload = sentPayload(send)

    assert.equal(payload.replyTo, 'support@example.com')
    assert.deepEqual(payload.cc, ['boss@example.com'])
    assert.equal(payload.bcc, 'archive@example.com')
    assert.deepEqual(payload.headers, { 'X-Campaign': 'spring' })
    assert.equal(payload.scheduledAt, '2026-11-01T09:00:00Z')
  })

  it('sends a useSend dashboard template without rendering locally', async () => {
    const { service, send } = createService()

    await service.send({
      to: 'ana@example.com',
      channel: 'email',
      template: 'dashboard',
      provider_data: { templateId: 'tmpl_1', variables: { name: 'Ana' } },
    })

    const payload = sentPayload(send)

    assert.equal(payload.templateId, 'tmpl_1')
    assert.deepEqual(payload.variables, { name: 'Ana' })
    assert.equal(payload.html, undefined)
    assert.equal(payload.subject, undefined)
  })

  it('rejects invalid provider_data without sending', async () => {
    const { service, send } = createService()
    const template = addTemplate(service)

    await assert.rejects(
      service.send({ to: 'ana@example.com', channel: 'email', template, provider_data: { cc: 5 } }),
      /Invalid useSend provider_data/,
    )
    assert.equal(send.mock.callCount(), 0)
  })
})

describe('locales', () => {
  const setup = (options: Record<string, unknown> = {}) => {
    const { service, send } = createService(options)
    const template = `localized-${templateCount++}`
    const react = () => createElement('p')

    service.addTemplate(template, { subject: 'English', content: { react } })
    service.addTemplate(template, { subject: 'Slovensko', content: { react } }, 'sl')
    service.addTemplate(template, { subject: 'Deutsch', content: { react } }, 'de')

    return { service, send, template }
  }

  it('uses data.locale, matching the language of a regional locale', async () => {
    const { service, send, template } = setup()

    await service.send({ to: 'ana@example.com', channel: 'email', template, data: { locale: 'sl-SI' } })

    assert.equal(sentPayload(send).subject, 'Slovensko')
  })

  it('prefers provider_data.locale over data.locale', async () => {
    const { service, send, template } = setup()

    await service.send({
      to: 'ana@example.com',
      channel: 'email',
      template,
      data: { locale: 'sl' },
      provider_data: { locale: 'de' },
    })

    assert.equal(sentPayload(send).subject, 'Deutsch')
  })

  it('falls back to defaultLocale, then to the template without a locale', async () => {
    const withDefault = setup({ defaultLocale: 'de' })
    const withoutDefault = setup()

    await withDefault.service.send({
      to: 'a@example.com',
      channel: 'email',
      template: withDefault.template,
      data: { locale: 'fr' },
    })
    await withoutDefault.service.send({
      to: 'a@example.com',
      channel: 'email',
      template: withoutDefault.template,
      data: { locale: 'fr' },
    })

    assert.equal(sentPayload(withDefault.send).subject, 'Deutsch')
    assert.equal(sentPayload(withoutDefault.send).subject, 'English')
  })
})

describe('dryRun and redirectTo', () => {
  it('logs instead of sending in a dry run', async () => {
    const { service, send, messages } = createService({ dryRun: true })
    const template = addTemplate(service, 'Dry')
    const result = await service.send({ to: 'ana@example.com', channel: 'email', template })

    assert.match(result.id ?? '', /^dry-run-/)
    assert.equal(send.mock.callCount(), 0)
    assert.ok(messages.some((message) => message.includes('Dry run') && message.includes('ana@example.com')))
  })

  it('redirects every recipient to one address', async () => {
    const { service, send } = createService({ redirectTo: 'dev@example.com' })
    const template = addTemplate(service)

    await service.send({
      to: 'ana@example.com',
      channel: 'email',
      template,
      provider_data: { cc: 'boss@example.com', bcc: ['archive@example.com'] },
    })

    const payload = sentPayload(send)

    assert.deepEqual(payload.to, ['dev@example.com'])
    assert.equal(payload.cc, undefined)
    assert.equal(payload.bcc, undefined)
    assert.equal(payload.headers?.['X-Original-To'], 'ana@example.com, boss@example.com, archive@example.com')
  })
})

describe('retries', () => {
  it('retries network errors', async () => {
    const { service, send } = createService()
    const template = addTemplate(service)

    send.mock.mockImplementationOnce(async () => {
      throw new TypeError('fetch failed')
    })

    assert.deepEqual(await service.send({ to: 'ana@example.com', channel: 'email', template }), { id: 'email_1' })
    assert.equal(send.mock.callCount(), 2)
  })

  it('retries server errors up to maxAttempts', async () => {
    const { service, send } = createService({ retry: { delay: 0, maxAttempts: 3 } })
    const template = addTemplate(service)

    send.mock.mockImplementation(async () => {
      return { data: null, error: { code: 'INTERNAL_SERVER_ERROR', message: 'Oops' } }
    })

    await assert.rejects(service.send({ to: 'ana@example.com', channel: 'email', template }), /Oops/)
    assert.equal(send.mock.callCount(), 3)
  })

  it('does not retry errors that fail the same way again', async () => {
    const { service, send } = createService()
    const template = addTemplate(service)

    send.mock.mockImplementation(async () => {
      return { data: null, error: { code: 'BAD_REQUEST', message: 'Invalid recipient' } }
    })

    await assert.rejects(service.send({ to: 'nope', channel: 'email', template }), /Invalid recipient \(BAD_REQUEST\)/)
    assert.equal(send.mock.callCount(), 1)
  })

  it('waits linearly or exponentially between attempts', async () => {
    const waits = (backoff: 'linear' | 'exponential') => {
      const delays: number[] = []
      const timer = mock.method(globalThis, 'setTimeout', (callback: () => void, ms: number) => {
        delays.push(ms)
        callback()
      })
      const strategy = new RetryStrategy({ maxAttempts: 4, delay: 10, backoff })

      return strategy
        .execute(async () => {
          throw new Error('down')
        })
        .catch(() => {
          timer.mock.restore()

          return delays
        })
    }

    assert.deepEqual(await waits('linear'), [10, 20, 30])
    assert.deepEqual(await waits('exponential'), [10, 20, 40])
  })
})

describe('options', () => {
  it('rejects invalid options', () => {
    assert.throws(() => {
      UseSendService.validateOptions({ api_key: 'k', from: 'a@b.c', retry: { backoff: 'random' }, dryRun: 'yes' })
    }, /Retry backoff must be one of: linear, exponential[\s\S]*`dryRun` must be a boolean/)
  })
})

describe('preview', () => {
  it('renders a template with its preview props', async () => {
    const { service } = createService()
    const name = `preview-${templateCount++}`

    service.addTemplate(name, {
      subject: 'Preview',
      previewProps: { name: 'Ana' },
      content: { react: ({ name: person }: { name: string }) => createElement('p', null, `Hi ${person}`) },
    })

    const preview = await service.previewTemplate(name)

    assert.equal(preview.subject, 'Preview')
    assert.equal(preview.text, 'Hi Ana')
  })
})

describe('contacts', () => {
  it('upserts into the default contact book, keyed by email', async () => {
    const { service } = createService({ contacts: { contactBookId: 'book_1' } })
    const upsert = mock.method(service['client'].contacts, 'upsert', async () => {
      return { data: { contactId: 'contact_1' }, error: null }
    })

    assert.deepEqual(await service.upsertContact({ email: 'ana@example.com', subscribed: true }), { id: 'contact_1' })
    assert.deepEqual(upsert.mock.calls[0]?.arguments, [
      'book_1',
      'ana@example.com',
      { email: 'ana@example.com', subscribed: true },
    ])
  })

  it('needs a contact book', async () => {
    const { service } = createService()

    await assert.rejects(service.upsertContact({ email: 'ana@example.com' }), /No contact book id given/)
  })
})

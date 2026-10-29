import assert from 'node:assert/strict'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import { createElement } from 'react'
import { loadTemplates } from '../../src/modules/usesend/loaders'
import { localeCandidates, TemplateRepository } from '../../src/modules/usesend/templates/template-repository'

const createLogger = () => {
  const messages: string[] = []
  const log = (message: string) => {
    messages.push(message)
  }

  return { messages, logger: { info: log, warn: log, error: log } }
}

describe('localeCandidates', () => {
  it('tries the full locale, then its language', () => {
    assert.deepEqual(localeCandidates('sl_SI'), ['sl-si', 'sl'])
    assert.deepEqual(localeCandidates('en'), ['en'])
    assert.deepEqual(localeCandidates(undefined), [])
  })
})

describe('TemplateRepository locales', () => {
  const repository = TemplateRepository.getInstance()
  const component = () => createElement('p')

  repository.addTemplate('order-placed', { subject: 'Order placed', content: { react: component } })
  repository.addTemplate('order-placed', { subject: 'Naročilo oddano', content: { react: component } }, 'sl')
  repository.addTemplate('only-german', { subject: 'Bestellung', content: { react: component } }, 'de')

  it('picks the most specific variant', () => {
    assert.equal(repository.getTemplate('order-placed', localeCandidates('sl-SI'))?.subject, 'Naročilo oddano')
  })

  it('falls back to the template without a locale', () => {
    assert.equal(repository.getTemplate('order-placed', localeCandidates('fr'))?.subject, 'Order placed')
    assert.equal(repository.getTemplate('order-placed')?.subject, 'Order placed')
  })

  it('returns nothing when only other locales exist', () => {
    assert.equal(repository.getTemplate('only-german', ['en']), undefined)
    assert.equal(repository.hasTemplate('only-german'), true)
  })

  it('rejects a second variant for the same locale', () => {
    assert.throws(() => {
      repository.addTemplate('order-placed', { subject: 'x', content: { react: component } }, 'SL')
    }, /already exists/)
  })

  it('lists templates with their locales', () => {
    const summary = repository.listTemplates().find((template) => template.name === 'only-german')

    assert.deepEqual(summary?.locales, ['de'])
    assert.equal(summary.template.subject, 'Bestellung')
  })
})

describe('loadTemplates', () => {
  it('loads every valid template and reports the broken ones', async () => {
    const { messages, logger } = createLogger()
    const result = await loadTemplates(join(__dirname, '../fixtures/templates'), logger)
    const repository = TemplateRepository.getInstance()
    const base = repository.getTemplate('welcome')
    const slovenian = repository.getTemplate('welcome', ['sl'])

    assert.deepEqual(result, { loaded: 2, failed: 2 })
    assert.equal(base?.subject, 'Welcome')
    assert.equal(base?.version, '1.2.0')
    assert.deepEqual(base?.metadata?.tags, ['customer'])
    assert.deepEqual(base?.previewProps, { name: 'Ana' })
    assert.equal(slovenian?.subject, 'Dobrodošli v trgovini')
    assert.equal(slovenian?.version, '1.2.0')
    assert.ok(messages.some((message) => message.includes('"Broken.js": boom')))
    assert.ok(messages.some((message) => message.includes('"NotAComponent.js"')))
  })

  it('warns when the folder is missing', async () => {
    const { messages, logger } = createLogger()

    assert.deepEqual(await loadTemplates(join(__dirname, 'missing'), logger), { loaded: 0, failed: 0 })
    assert.ok(messages[0]?.includes("Couldn't read the email template folder"))
  })
})

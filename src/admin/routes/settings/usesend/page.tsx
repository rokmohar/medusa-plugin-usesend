import { defineRouteConfig } from '@medusajs/admin-sdk'
import { Alert, Badge, Button, Container, Heading, Input, Label, Select, Text, Textarea, toast } from '@medusajs/ui'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { z } from 'zod'
import { sdk } from '../../../lib/sdk'

const DEFAULT_LOCALE = '__default__'

const templateSchema = z.object({
  name: z.string(),
  locales: z.array(z.string()),
  subject: z.string(),
  version: z.string().nullable(),
  description: z.string().nullable(),
  tags: z.array(z.string()),
  preview_props: z.record(z.string(), z.unknown()).nullable(),
})

const templatesResponseSchema = z.object({
  status: z.object({
    dryRun: z.boolean(),
    redirectTo: z.string().nullable(),
    defaultLocale: z.string().nullable(),
    webhooks: z.boolean(),
    contactBookId: z.string().nullable(),
  }),
  templates: z.array(templateSchema),
})

const previewResponseSchema = z.object({
  preview: z.object({
    subject: z.string(),
    html: z.string().optional(),
    text: z.string().optional(),
  }),
})

const testResponseSchema = z.object({
  notification: z.object({
    id: z.string(),
    status: z.string(),
    external_id: z.string().nullable(),
  }),
})

type Template = z.infer<typeof templateSchema>

const toJson = (value: unknown) => JSON.stringify(value ?? {}, null, 2)

/**
 * Parses the data editor's JSON. Returns an error message instead of throwing, so the form can show it.
 */
const parseData = (json: string): { data: Record<string, unknown> } | { error: string } => {
  try {
    const result = z.record(z.string(), z.unknown()).safeParse(JSON.parse(json))

    return result.success ? { data: result.data } : { error: 'The data must be a JSON object' }
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Invalid JSON' }
  }
}

const TemplatePanel = ({ template }: { template: Template }) => {
  const [locale, setLocale] = useState(DEFAULT_LOCALE)
  const [json, setJson] = useState(toJson(template.preview_props))
  const [to, setTo] = useState('')
  const parsed = parseData(json)
  const body = 'data' in parsed ? { data: parsed.data, ...(locale === DEFAULT_LOCALE ? {} : { locale }) } : undefined

  const preview = useMutation({
    mutationFn: async () => {
      return previewResponseSchema.parse(
        await sdk.client.fetch(`/admin/usesend/templates/${encodeURIComponent(template.name)}/preview`, {
          method: 'POST',
          body,
        }),
      ).preview
    },
    onError: (error) => {
      toast.error(error.message)
    },
  })

  const sendTest = useMutation({
    mutationFn: async () => {
      return testResponseSchema.parse(
        await sdk.client.fetch(`/admin/usesend/templates/${encodeURIComponent(template.name)}/send-test`, {
          method: 'POST',
          body: { ...body, to },
        }),
      ).notification
    },
    onSuccess: (notification) => {
      toast.success(
        notification.external_id?.startsWith('dry-run-')
          ? 'Dry run: the email was logged, not sent'
          : `Test email sent (${notification.status})`,
      )
    },
    onError: (error) => {
      toast.error(error.message)
    },
  })

  return (
    <div className="flex min-w-0 flex-col gap-y-4">
      <div className="flex flex-col gap-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <Heading level="h2">{template.name}</Heading>
          {template.version && (
            <Badge size="2xsmall" color="grey">
              v{template.version}
            </Badge>
          )}
        </div>
        {template.description && (
          <Text size="small" className="text-ui-fg-subtle">
            {template.description}
          </Text>
        )}
      </div>

      {template.locales.length > 0 && (
        <div className="flex flex-col gap-y-2">
          <Label size="small" htmlFor="usesend-locale">
            Locale
          </Label>
          <Select value={locale} onValueChange={setLocale}>
            <Select.Trigger id="usesend-locale" className="sm:max-w-[240px]">
              <Select.Value />
            </Select.Trigger>
            <Select.Content>
              <Select.Item value={DEFAULT_LOCALE}>Default</Select.Item>
              {template.locales.map((code) => {
                return (
                  <Select.Item key={code} value={code}>
                    {code}
                  </Select.Item>
                )
              })}
            </Select.Content>
          </Select>
        </div>
      )}

      <div className="flex flex-col gap-y-2">
        <Label size="small" htmlFor="usesend-data">
          Template data (JSON)
        </Label>
        <Textarea
          id="usesend-data"
          rows={8}
          className="font-mono text-xs"
          value={json}
          onChange={(event) => {
            setJson(event.target.value)
          }}
        />
        {'error' in parsed && (
          <Text size="small" className="text-ui-fg-error">
            {parsed.error}
          </Text>
        )}
        {!template.preview_props && (
          <Text size="xsmall" className="text-ui-fg-subtle">
            Add a static PreviewProps to the component, or previewProps to its metadata file, to fill this in.
          </Text>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          size="small"
          variant="secondary"
          disabled={!body}
          isLoading={preview.isPending}
          onClick={() => {
            preview.mutate()
          }}
        >
          Preview
        </Button>
      </div>

      {preview.data && (
        <div className="flex flex-col gap-y-2">
          <Text size="small">
            <span className="text-ui-fg-subtle">Subject: </span>
            {preview.data.subject}
          </Text>
          {preview.data.html ? (
            <iframe
              title={`Preview of ${template.name}`}
              sandbox=""
              srcDoc={preview.data.html}
              className="border-ui-border-base h-[480px] w-full rounded-md border bg-white"
            />
          ) : (
            <Text size="small" className="text-ui-fg-subtle">
              This template has no HTML.
            </Text>
          )}
          {preview.data.text && (
            <details>
              <summary className="text-ui-fg-subtle cursor-pointer text-sm">Plain-text version</summary>
              <pre className="bg-ui-bg-subtle mt-2 whitespace-pre-wrap rounded-md p-3 text-xs">{preview.data.text}</pre>
            </details>
          )}
        </div>
      )}

      <form
        className="flex flex-col gap-2 sm:flex-row sm:items-end"
        onSubmit={(event) => {
          event.preventDefault()
          sendTest.mutate()
        }}
      >
        <div className="flex flex-1 flex-col gap-y-2">
          <Label size="small" htmlFor="usesend-test-to">
            Send a test to
          </Label>
          <Input
            id="usesend-test-to"
            size="small"
            type="email"
            required
            placeholder="you@example.com"
            value={to}
            onChange={(event) => {
              setTo(event.target.value)
            }}
          />
        </div>
        <Button size="small" type="submit" disabled={!body || !to} isLoading={sendTest.isPending}>
          Send test
        </Button>
      </form>
    </div>
  )
}

const UseSendPage = () => {
  const [selected, setSelected] = useState<string | null>(null)

  const { data, isLoading, error } = useQuery({
    queryKey: ['usesend-templates'],
    queryFn: async () => {
      return templatesResponseSchema.parse(await sdk.client.fetch('/admin/usesend/templates'))
    },
  })

  const templates = data?.templates ?? []
  const current = templates.find((template) => template.name === selected) ?? templates[0]
  const status = data?.status

  return (
    <Container className="divide-y p-0">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-6 py-4">
        <div className="min-w-0">
          <Heading>useSend</Heading>
          <Text size="small" className="text-ui-fg-subtle">
            Preview the email templates and send yourself a test.
          </Text>
        </div>
        {status && (
          <Badge color={status.dryRun ? 'orange' : status.redirectTo ? 'blue' : 'green'}>
            {status.dryRun ? 'Dry run' : status.redirectTo ? `Redirect to ${status.redirectTo}` : 'Live'}
          </Badge>
        )}
      </div>

      {status && (
        <div className="flex flex-wrap gap-x-6 gap-y-1 px-6 py-3">
          <Text size="small" className="text-ui-fg-subtle">
            Default locale: {status.defaultLocale ?? 'none'}
          </Text>
          <Text size="small" className="text-ui-fg-subtle">
            Webhooks: {status.webhooks ? 'on' : 'off'}
          </Text>
          <Text size="small" className="text-ui-fg-subtle">
            Contact book: {status.contactBookId ?? 'none'}
          </Text>
        </div>
      )}

      {error && (
        <div className="px-6 py-4">
          <Alert variant="error">{error.message}</Alert>
        </div>
      )}

      {isLoading ? (
        <div className="px-6 py-4">
          <Text size="small">Loading…</Text>
        </div>
      ) : templates.length === 0 ? (
        <div className="px-6 py-4">
          <Text size="small" className="text-ui-fg-subtle">
            No email templates are loaded. Add them to src/templates/emails, or the folder set in templateDir.
          </Text>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-[220px_1fr]">
          <nav className="flex gap-1 overflow-x-auto px-4 py-4 md:flex-col md:border-r md:px-3">
            {templates.map((template) => {
              const isCurrent = template.name === current?.name

              return (
                <button
                  key={template.name}
                  type="button"
                  aria-current={isCurrent}
                  className={`txt-compact-small shrink-0 rounded-md px-3 py-1.5 text-left ${
                    isCurrent ? 'bg-ui-bg-base-pressed text-ui-fg-base' : 'text-ui-fg-subtle hover:bg-ui-bg-base-hover'
                  }`}
                  onClick={() => {
                    setSelected(template.name)
                  }}
                >
                  {template.name}
                  {template.locales.length > 0 && (
                    <span className="text-ui-fg-muted"> · {template.locales.join(', ')}</span>
                  )}
                </button>
              )
            })}
          </nav>
          <div className="min-w-0 px-6 py-4">{current && <TemplatePanel key={current.name} template={current} />}</div>
        </div>
      )}
    </Container>
  )
}

export const config = defineRouteConfig({
  label: 'useSend',
})

export const handle = {
  breadcrumb: () => {
    return 'useSend'
  },
}

export default UseSendPage

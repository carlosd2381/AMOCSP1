export type TemplateTokenValueMap = Record<string, string>

const TOKEN_PATTERN = /{{\s*([a-z0-9_]+)\s*}}/gi

export function normalizeTokenValueMap(source: Record<string, unknown> | null | undefined): TemplateTokenValueMap {
  if (!source) return {}

  return Object.entries(source).reduce<TemplateTokenValueMap>((acc, [key, value]) => {
    if (typeof value !== 'string') return acc
    const normalizedKey = key.trim()
    if (!normalizedKey) return acc
    acc[normalizedKey] = value
    return acc
  }, {})
}

export function resolveTemplateTokens(templateHtml: string, values: TemplateTokenValueMap): string {
  if (!templateHtml.trim()) return templateHtml

  return templateHtml.replace(TOKEN_PATTERN, (match, tokenKey) => {
    const normalizedKey = String(tokenKey || '').trim()
    if (!normalizedKey) return match

    if (!(normalizedKey in values)) {
      return match
    }

    const nextValue = values[normalizedKey]
    return typeof nextValue === 'string' ? nextValue : match
  })
}

export function extractTemplateTokenKeys(templateHtml: string): string[] {
  if (!templateHtml.trim()) return []

  const keys = new Set<string>()
  let match: RegExpExecArray | null
  const pattern = new RegExp(TOKEN_PATTERN.source, TOKEN_PATTERN.flags)

  while ((match = pattern.exec(templateHtml)) !== null) {
    const key = String(match[1] ?? '').trim()
    if (!key) continue
    keys.add(key)
  }

  return Array.from(keys)
}

export function formatMoneyValue(amount: number, currency: string): string {
  const normalizedCurrency = currency === 'USD' ? 'USD' : 'MXN'
  const safeAmount = Number.isFinite(amount) ? amount : 0

  return safeAmount.toLocaleString('es-MX', {
    style: 'currency',
    currency: normalizedCurrency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

export function formatEventDate(value: string | null | undefined): string {
  if (!value) return ''
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toLocaleDateString('en-US', { dateStyle: 'long' })
}

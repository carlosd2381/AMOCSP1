interface ResolveLedgerCurrencyOptions {
  invoiceCurrency?: string | null
  preferredCurrency?: string | null
  fallback?: string
}

export function formatCurrencyAmount(value: number, currency: string, locale = 'es-MX') {
  const normalizedCurrency = sanitizeCurrencyCode(currency) ?? 'MXN'
  return value.toLocaleString(locale, {
    style: 'currency',
    currency: normalizedCurrency,
  })
}

export function resolveLedgerCurrency(options: ResolveLedgerCurrencyOptions) {
  return (
    sanitizeCurrencyCode(options.invoiceCurrency)
    ?? sanitizeCurrencyCode(options.preferredCurrency)
    ?? sanitizeCurrencyCode(options.fallback)
    ?? 'MXN'
  )
}

function sanitizeCurrencyCode(value: string | null | undefined) {
  if (!value) return null
  const normalized = value.trim().toUpperCase()
  if (!/^[A-Z]{3}$/.test(normalized)) return null
  return normalized
}

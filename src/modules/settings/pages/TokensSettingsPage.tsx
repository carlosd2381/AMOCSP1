import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Link } from 'react-router-dom'
import { ArrowLeft, Copy, Plus, Trash2 } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { useBranding } from '@/contexts/BrandingContext'
import {
  SYSTEM_TEMPLATE_TOKENS,
  buildTemplateTokenReference,
  fetchTokenSettings,
  saveTokenSettings,
  type TemplateTokenDefinition,
  type TokenScope,
  type TokenSettings,
} from '@/services/tokenSettingsService'

function emptyDraft(): TokenSettings {
  return {
    customTokens: [],
  }
}

const TOKEN_SCOPE_OPTIONS: Array<{ value: TokenScope; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'documents', label: 'Documents' },
  { value: 'emails', label: 'Emails' },
]

function normalizeTokenKey(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_.]/g, '_')
    .replace(/_+/g, '_')
    .replace(/\.+/g, '.')
    .replace(/^[_\.]+|[_\.]+$/g, '')
}

function copyToClipboard(value: string) {
  return navigator.clipboard.writeText(value)
}

export function TokensSettingsPage() {
  const { brand } = useBranding()
  const queryClient = useQueryClient()
  const [draft, setDraft] = useState<TokenSettings>(emptyDraft())

  const settingsQuery = useQuery({
    queryKey: ['settings-template-tokens', brand.slug],
    queryFn: () => fetchTokenSettings(brand.slug),
  })

  useEffect(() => {
    if (!settingsQuery.data) return
    setDraft(settingsQuery.data)
  }, [settingsQuery.data])

  const hasChanges = useMemo(() => {
    if (!settingsQuery.data) return false
    return JSON.stringify(settingsQuery.data) !== JSON.stringify(draft)
  }, [settingsQuery.data, draft])

  const hasValidationError = useMemo(() => {
    const seen = new Set<string>()

    for (const token of draft.customTokens) {
      const key = normalizeTokenKey(token.key)
      if (!key) return true
      if (!token.label.trim()) return true
      if (seen.has(key)) return true
      seen.add(key)
    }

    return false
  }, [draft.customTokens])

  const tokenReference = useMemo(() => {
    return buildTemplateTokenReference(draft)
  }, [draft])

  const saveMutation = useMutation({
    mutationFn: () => saveTokenSettings(brand.slug, draft),
    onSuccess: async (saved) => {
      queryClient.setQueryData(['settings-template-tokens', brand.slug], saved)
      await queryClient.invalidateQueries({ queryKey: ['settings-template-tokens', brand.slug] })
      toast.success('Template token settings updated')
    },
    onError: (error) => {
      console.error(error)
      toast.error(error instanceof Error ? error.message : 'Unable to save token settings')
    },
  })

  const disabled = settingsQuery.isLoading || saveMutation.isPending

  const updateToken = (
    tokenId: string,
    updater: (token: TemplateTokenDefinition) => TemplateTokenDefinition,
  ) => {
    setDraft((prev) => ({
      ...prev,
      customTokens: prev.customTokens.map((token) => (token.id === tokenId ? updater(token) : token)),
    }))
  }

  const removeToken = (tokenId: string) => {
    setDraft((prev) => ({
      ...prev,
      customTokens: prev.customTokens.filter((token) => token.id !== tokenId),
    }))
  }

  const addToken = () => {
    setDraft((prev) => {
      const nextIndex = prev.customTokens.length + 1
      const key = `custom_token_${nextIndex}`
      return {
        ...prev,
        customTokens: [
          ...prev.customTokens,
          {
            id: `custom-token-${Date.now()}`,
            key,
            label: `Custom Token ${nextIndex}`,
            description: '',
            exampleValue: '',
            scope: 'all',
            isActive: true,
          },
        ],
      }
    })
  }

  return (
    <div className="space-y-4">
      <Card title="Template Tokens" className="p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm text-brand-muted">
              Manage reusable tokens for documents and emails. Use tokens as placeholders like <strong>{'{{client_name}}'}</strong>.
            </p>
            <Link to="/settings" className="mt-3 inline-flex items-center gap-2 text-xs uppercase tracking-[0.12em] text-brand-primary">
              <ArrowLeft size={12} /> Back to settings
            </Link>
          </div>
          <button
            type="button"
            onClick={() => saveMutation.mutate()}
            disabled={disabled || !hasChanges || hasValidationError}
            className="btn-compact-primary"
          >
            {saveMutation.isPending ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </Card>

      <Card title="System Tokens (Read-only)" className="p-4">
        <div className="space-y-2">
          {SYSTEM_TEMPLATE_TOKENS.map((token) => (
            <div key={token.id} className="grid gap-2 border border-border/30 bg-surface-muted/20 p-2 md:grid-cols-[220px_1fr_auto] md:items-center">
              <div>
                <p className="text-xs uppercase tracking-[0.1em] text-brand-muted">{token.label}</p>
                <p className="text-sm text-white">{`{{${token.key}}}`}</p>
              </div>
              <div>
                <p className="text-sm text-brand-muted">{token.description}</p>
                <p className="text-xs text-brand-muted/80">Example: {token.exampleValue || 'n/a'}</p>
              </div>
              <button
                type="button"
                className="btn-compact-secondary"
                onClick={() => {
                  void copyToClipboard(`{{${token.key}}}`).then(() => toast.success('Token copied'))
                }}
              >
                <Copy size={14} /> Copy
              </button>
            </div>
          ))}
        </div>
      </Card>

      <Card title="Custom Tokens" className="p-4">
        <div className="space-y-3">
          {settingsQuery.isLoading ? <p className="text-sm text-brand-muted">Loading token settings...</p> : null}

          {draft.customTokens.length ? (
            <div className="space-y-2">
              {draft.customTokens.map((token) => (
                <div key={token.id} className="grid gap-2 border border-border/30 bg-surface-muted/20 p-2 md:grid-cols-[180px_180px_160px_1fr_auto_auto] md:items-center">
                  <label className="grid gap-1 text-[11px] uppercase tracking-[0.1em] text-brand-muted">
                    Key
                    <input
                      type="text"
                      className="input-compact"
                      value={token.key}
                      onChange={(event) => updateToken(token.id, (current) => ({
                        ...current,
                        key: normalizeTokenKey(event.target.value),
                      }))}
                      disabled={disabled}
                    />
                  </label>
                  <label className="grid gap-1 text-[11px] uppercase tracking-[0.1em] text-brand-muted">
                    Label
                    <input
                      type="text"
                      className="input-compact"
                      value={token.label}
                      onChange={(event) => updateToken(token.id, (current) => ({
                        ...current,
                        label: event.target.value,
                      }))}
                      disabled={disabled}
                    />
                  </label>
                  <label className="grid gap-1 text-[11px] uppercase tracking-[0.1em] text-brand-muted">
                    Scope
                    <select
                      className="select-compact"
                      value={token.scope}
                      onChange={(event) => updateToken(token.id, (current) => ({
                        ...current,
                        scope: event.target.value as TokenScope,
                      }))}
                      disabled={disabled}
                    >
                      {TOKEN_SCOPE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </label>
                  <label className="grid gap-1 text-[11px] uppercase tracking-[0.1em] text-brand-muted">
                    Description
                    <input
                      type="text"
                      className="input-compact"
                      value={token.description}
                      onChange={(event) => updateToken(token.id, (current) => ({
                        ...current,
                        description: event.target.value,
                      }))}
                      disabled={disabled}
                    />
                  </label>
                  <button
                    type="button"
                    className="btn-compact-secondary"
                    onClick={() => {
                      void copyToClipboard(`{{${token.key}}}`).then(() => toast.success('Token copied'))
                    }}
                    disabled={!token.key}
                  >
                    <Copy size={14} /> Copy
                  </button>
                  <button
                    type="button"
                    className="btn-compact-secondary"
                    onClick={() => removeToken(token.id)}
                    disabled={disabled}
                  >
                    <Trash2 size={14} /> Remove
                  </button>
                  <label className="grid gap-1 text-[11px] uppercase tracking-[0.1em] text-brand-muted md:col-span-2">
                    Example Value
                    <input
                      type="text"
                      className="input-compact"
                      value={token.exampleValue}
                      onChange={(event) => updateToken(token.id, (current) => ({
                        ...current,
                        exampleValue: event.target.value,
                      }))}
                      disabled={disabled}
                    />
                  </label>
                  <label className="mt-5 flex items-center gap-2 text-xs text-white md:col-span-2">
                    <input
                      type="checkbox"
                      className="accent-brand-primary"
                      checked={token.isActive}
                      onChange={(event) => updateToken(token.id, (current) => ({
                        ...current,
                        isActive: event.target.checked,
                      }))}
                      disabled={disabled}
                    />
                    Active
                  </label>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-brand-muted">No custom tokens yet.</p>
          )}

          <button type="button" className="btn-compact-secondary" onClick={addToken} disabled={disabled}>
            <Plus size={14} /> Add Custom Token
          </button>

          {hasValidationError ? (
            <p className="text-xs text-rose-300">
              Each custom token needs a unique key and a label. Keys should use lowercase letters, numbers, and underscores.
            </p>
          ) : null}
        </div>
      </Card>

      <Card title="Combined Token Reference" className="p-4">
        <p className="mb-2 text-xs uppercase tracking-[0.12em] text-brand-muted">Active tokens available for templates</p>
        <div className="flex flex-wrap gap-2">
          {tokenReference.map((token) => (
            <span
              key={`${token.id}-${token.key}`}
              className="inline-flex items-center border border-border/40 bg-surface-muted/20 px-2 py-1 text-xs text-white"
              title={token.description}
            >
              {`{{${token.key}}}`}
            </span>
          ))}
        </div>
      </Card>
    </div>
  )
}

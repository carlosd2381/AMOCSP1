import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Link } from 'react-router-dom'
import { ArrowLeft, Plus, Trash2 } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { useBranding } from '@/contexts/BrandingContext'
import {
  fetchContractTemplateSettings,
  saveContractTemplateSettings,
  type ContractTemplateDefinition,
  type ContractTemplateSettings,
} from '@/services/contractTemplateSettingsService'
import { buildTemplateTokenReference, fetchTokenSettings } from '@/services/tokenSettingsService'
import { extractTemplateTokenKeys } from '@/services/templateTokenRenderingService'

function emptyDraft(): ContractTemplateSettings {
  return {
    applyByDefaultWhenMissing: true,
    templates: [
      {
        id: 'standard-service-agreement',
        name: 'Standard Service Agreement',
        isDefault: true,
        title: 'Production Agreement',
        bodyHtml: '<h2>Production Agreement</h2><p>This agreement is entered into by and between {{brand}} and {{client_name}}.</p>',
      },
    ],
  }
}

export function ContractTemplatesSettingsPage() {
  const { brand } = useBranding()
  const queryClient = useQueryClient()
  const [draft, setDraft] = useState<ContractTemplateSettings>(emptyDraft())
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('standard-service-agreement')
  const [allowUnknownTokensSave, setAllowUnknownTokensSave] = useState(false)

  const settingsQuery = useQuery({
    queryKey: ['settings-contract-templates', brand.slug],
    queryFn: () => fetchContractTemplateSettings(brand.slug),
  })

  const tokenSettingsQuery = useQuery({
    queryKey: ['settings-template-tokens', brand.slug],
    queryFn: () => fetchTokenSettings(brand.slug),
  })

  useEffect(() => {
    if (!settingsQuery.data) return
    setDraft(settingsQuery.data)
    const defaultTemplate = settingsQuery.data.templates.find((template) => template.isDefault)
      ?? settingsQuery.data.templates[0]
    if (defaultTemplate?.id) {
      setSelectedTemplateId(defaultTemplate.id)
    }
    setAllowUnknownTokensSave(false)
  }, [settingsQuery.data])

  const hasChanges = useMemo(() => {
    if (!settingsQuery.data) return false
    return JSON.stringify(settingsQuery.data) !== JSON.stringify(draft)
  }, [settingsQuery.data, draft])

  const activeTemplate = useMemo(
    () => draft.templates.find((template) => template.id === selectedTemplateId) ?? draft.templates[0] ?? null,
    [draft.templates, selectedTemplateId],
  )

  const hasValidationError = useMemo(() => {
    if (!draft.templates.length) return true

    return draft.templates.some((template) => {
      if (!template.name.trim()) return true
      if (!template.title.trim()) return true
      if (!template.bodyHtml.trim()) return true
      return false
    })
  }, [draft.templates])

  const tokenReference = useMemo(() => {
    return buildTemplateTokenReference(tokenSettingsQuery.data ?? { customTokens: [] })
  }, [tokenSettingsQuery.data])

  const activeTemplateUnknownTokens = useMemo(() => {
    if (!activeTemplate?.bodyHtml) return []

    const knownTokenKeys = new Set(tokenReference.map((token) => token.key))
    const templateTokenKeys = extractTemplateTokenKeys(activeTemplate.bodyHtml)

    return templateTokenKeys.filter((tokenKey) => !knownTokenKeys.has(tokenKey))
  }, [activeTemplate?.bodyHtml, tokenReference])

  useEffect(() => {
    if (!activeTemplateUnknownTokens.length && allowUnknownTokensSave) {
      setAllowUnknownTokensSave(false)
    }
  }, [activeTemplateUnknownTokens.length, allowUnknownTokensSave])

  const canSaveWithUnknownTokens = activeTemplateUnknownTokens.length === 0 || allowUnknownTokensSave

  const saveMutation = useMutation({
    mutationFn: () => saveContractTemplateSettings(brand.slug, draft),
    onSuccess: async (saved) => {
      queryClient.setQueryData(['settings-contract-templates', brand.slug], saved)
      await queryClient.invalidateQueries({ queryKey: ['settings-contract-templates', brand.slug] })
      toast.success('Contract template settings updated')
    },
    onError: (error) => {
      console.error(error)
      toast.error(error instanceof Error ? error.message : 'Unable to save contract template settings')
    },
  })

  const disabled = settingsQuery.isLoading || saveMutation.isPending

  const updateTemplate = (
    templateId: string,
    updater: (template: ContractTemplateDefinition) => ContractTemplateDefinition,
  ) => {
    setDraft((prev) => ({
      ...prev,
      templates: prev.templates.map((template) => (template.id === templateId ? updater(template) : template)),
    }))
  }

  const addTemplate = () => {
    setDraft((prev) => {
      const nextIndex = prev.templates.length + 1
      const id = `contract-template-${Date.now()}`
      const nextTemplate: ContractTemplateDefinition = {
        id,
        name: `Template ${nextIndex}`,
        isDefault: prev.templates.length === 0,
        title: 'Production Agreement',
        bodyHtml: '<h2>Production Agreement</h2><p>Describe scope, deliverables, and terms here.</p>',
      }

      const nextDraft = {
        ...prev,
        templates: [...prev.templates, nextTemplate],
      }
      setSelectedTemplateId(id)
      return nextDraft
    })
  }

  const removeTemplate = (templateId: string) => {
    setDraft((prev) => {
      const nextTemplates = prev.templates.filter((template) => template.id !== templateId)
      const normalized = nextTemplates.map((template, index) => ({
        ...template,
        isDefault: nextTemplates.some((entry) => entry.isDefault)
          ? template.isDefault
          : index === 0,
      }))

      if (selectedTemplateId === templateId && normalized[0]?.id) {
        setSelectedTemplateId(normalized[0].id)
      }

      return {
        ...prev,
        templates: normalized,
      }
    })
  }

  const setDefaultTemplate = (templateId: string) => {
    setDraft((prev) => ({
      ...prev,
      templates: prev.templates.map((template) => ({
        ...template,
        isDefault: template.id === templateId,
      })),
    }))
  }

  return (
    <div className="space-y-4">
      <Card title="Contract Templates" className="p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm text-brand-muted">
              Build and manage reusable contract templates for quote-to-contract handoff.
            </p>
            <Link to="/settings" className="mt-3 inline-flex items-center gap-2 text-xs uppercase tracking-[0.12em] text-brand-primary">
              <ArrowLeft size={12} /> Back to settings
            </Link>
          </div>
          <button
            type="button"
            onClick={() => saveMutation.mutate()}
            disabled={disabled || !hasChanges || hasValidationError || !canSaveWithUnknownTokens}
            className="btn-compact-primary"
          >
            {saveMutation.isPending ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </Card>

      {settingsQuery.isLoading ? (
        <Card title="Template Library" className="p-4">
          <p className="text-sm text-brand-muted">Loading contract template settings...</p>
        </Card>
      ) : (
        <>
          <Card title="Activation" className="p-4">
            <label className="flex items-center justify-between gap-3 text-sm text-white">
              <span>Apply default template when proposal has no specific contract template selected</span>
              <input
                type="checkbox"
                checked={draft.applyByDefaultWhenMissing}
                onChange={(event) => setDraft((prev) => ({ ...prev, applyByDefaultWhenMissing: event.target.checked }))}
                className="accent-brand-primary"
                disabled={disabled}
              />
            </label>
          </Card>

          <Card title="Token Reference" className="p-4">
            <p className="text-sm text-brand-muted">
              Use these tokens in template HTML (for example: {'{{client_name}}'}).
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
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
            <Link to="/settings/tokens" className="mt-3 inline-flex items-center gap-2 text-xs uppercase tracking-[0.12em] text-brand-primary">
              Manage token catalog
            </Link>
          </Card>

          <Card title="Template Library" className="p-4">
            <div className="grid gap-4 md:grid-cols-[240px_1fr]">
              <div className="space-y-2">
                {draft.templates.map((template) => (
                  <button
                    key={template.id}
                    type="button"
                    onClick={() => setSelectedTemplateId(template.id)}
                    className={`w-full rounded border px-3 py-2 text-left text-sm ${
                      activeTemplate?.id === template.id
                        ? 'border-brand-primary bg-brand-primary/10 text-white'
                        : 'border-border/40 bg-surface-muted/20 text-brand-muted'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate">{template.name || 'Untitled template'}</span>
                      {template.isDefault ? <span className="text-[10px] uppercase tracking-[0.08em] text-brand-primary">Default</span> : null}
                    </div>
                  </button>
                ))}
                <button
                  type="button"
                  onClick={addTemplate}
                  disabled={disabled}
                  className="btn-compact-secondary w-full"
                >
                  <Plus size={14} /> Add Template
                </button>
              </div>

              {activeTemplate ? (
                <div className="space-y-3">
                  <div className="grid gap-2 md:grid-cols-[1fr_1fr_auto_auto]">
                    <label className="grid gap-1 text-xs uppercase tracking-[0.12em] text-brand-muted">
                      Template Name
                      <input
                        type="text"
                        value={activeTemplate.name}
                        onChange={(event) => updateTemplate(activeTemplate.id, (current) => ({
                          ...current,
                          name: event.target.value,
                        }))}
                        className="input-compact"
                        disabled={disabled}
                      />
                    </label>

                    <label className="grid gap-1 text-xs uppercase tracking-[0.12em] text-brand-muted">
                      Contract Title
                      <input
                        type="text"
                        value={activeTemplate.title}
                        onChange={(event) => updateTemplate(activeTemplate.id, (current) => ({
                          ...current,
                          title: event.target.value,
                        }))}
                        className="input-compact"
                        disabled={disabled}
                      />
                    </label>

                    <button
                      type="button"
                      onClick={() => setDefaultTemplate(activeTemplate.id)}
                      disabled={disabled || activeTemplate.isDefault}
                      className="btn-compact-secondary self-end"
                    >
                      Set Default
                    </button>

                    <button
                      type="button"
                      onClick={() => removeTemplate(activeTemplate.id)}
                      disabled={disabled || draft.templates.length <= 1}
                      className="btn-compact-secondary self-end"
                    >
                      <Trash2 size={14} /> Remove
                    </button>
                  </div>

                  <label className="grid gap-1 text-xs uppercase tracking-[0.12em] text-brand-muted">
                    Body HTML
                    <textarea
                      value={activeTemplate.bodyHtml}
                      onChange={(event) => updateTemplate(activeTemplate.id, (current) => ({
                        ...current,
                        bodyHtml: event.target.value,
                      }))}
                      className="min-h-[280px] w-full rounded border border-border/40 bg-surface-muted/30 px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-brand-primary"
                      disabled={disabled}
                    />
                  </label>

                  {activeTemplateUnknownTokens.length ? (
                    <div className="rounded border border-amber-400/40 bg-amber-400/10 p-3 text-xs">
                      <p className="uppercase tracking-[0.12em] text-amber-200">Unknown Tokens</p>
                      <p className="mt-1 text-brand-muted">
                        {activeTemplateUnknownTokens.length} token{activeTemplateUnknownTokens.length > 1 ? 's are' : ' is'} not in your token catalog.
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {activeTemplateUnknownTokens.map((tokenKey) => (
                          <span
                            key={tokenKey}
                            className="inline-flex items-center border border-amber-300/50 bg-amber-300/10 px-2 py-1 text-[11px] text-amber-100"
                          >
                            {`{{${tokenKey}}}`}
                          </span>
                        ))}
                      </div>
                      <Link to="/settings/tokens" className="mt-3 inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.12em] text-amber-200">
                        Add missing tokens in catalog
                      </Link>
                      <label className="mt-3 flex items-center gap-2 text-[11px] text-white">
                        <input
                          type="checkbox"
                          className="accent-brand-primary"
                          checked={allowUnknownTokensSave}
                          onChange={(event) => setAllowUnknownTokensSave(event.target.checked)}
                        />
                        Allow save with unknown tokens
                      </label>
                    </div>
                  ) : null}

                  <div className="rounded border border-border/40 bg-surface-muted/20 p-3">
                    <p className="text-[11px] uppercase tracking-[0.12em] text-brand-muted">Template Preview</p>
                    <h3 className="mt-2 text-base font-semibold text-white">{activeTemplate.title || 'Untitled Contract'}</h3>
                    <div
                      className="prose prose-invert mt-2 max-w-none text-sm"
                      dangerouslySetInnerHTML={{ __html: activeTemplate.bodyHtml }}
                    />
                  </div>
                </div>
              ) : null}
            </div>
          </Card>
        </>
      )}
    </div>
  )
}

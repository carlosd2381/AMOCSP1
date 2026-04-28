import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Link } from 'react-router-dom'
import { ArrowLeft, Plus, Trash2 } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { useBranding } from '@/contexts/BrandingContext'
import {
  fetchQuestionnaireTemplateSettings,
  saveQuestionnaireTemplateSettings,
  type QuestionnaireFieldType,
  type QuestionnaireTemplateDefinition,
  type QuestionnaireTemplateField,
  type QuestionnaireTemplateSettings,
} from '@/services/questionnaireTemplateSettingsService'

function emptyDraft(): QuestionnaireTemplateSettings {
  return {
    applyByDefaultWhenMissing: true,
    templates: [
      {
        id: 'standard-booking-questionnaire',
        name: 'Standard Booking Questionnaire',
        isDefault: true,
        title: 'Booking Questionnaire',
        description: 'Collect essential planning details before production.',
        fields: [
          {
            id: 'client-names',
            label: 'Client Names',
            type: 'single_line_text',
            required: true,
            clientTokenKey: 'client_name',
            placeholder: 'First and last names',
            helpText: '',
            options: [],
          },
        ],
      },
    ],
  }
}

const FIELD_TYPE_OPTIONS: Array<{ value: QuestionnaireFieldType; label: string }> = [
  { value: 'single_line_text', label: 'Single Line Text' },
  { value: 'paragraph_text', label: 'Paragraph Text' },
  { value: 'multiple_choice', label: 'Multiple Choice' },
  { value: 'dropdown', label: 'Dropdown' },
  { value: 'checkboxes', label: 'Checkboxes' },
  { value: 'radio_buttons', label: 'Radio Buttons' },
  { value: 'email', label: 'Email' },
  { value: 'phone', label: 'Phone' },
  { value: 'number', label: 'Number' },
  { value: 'date', label: 'Date' },
  { value: 'time', label: 'Time' },
]

const OPTION_BASED_TYPES: QuestionnaireFieldType[] = [
  'multiple_choice',
  'dropdown',
  'checkboxes',
  'radio_buttons',
]

const RECOMMENDED_CLIENT_TOKEN_KEYS = [
  'client_name',
  'client_email',
  'client_phone',
  'bride.name',
  'bride.email',
  'bride.phone',
  'groom.name',
  'groom.email',
  'groom.phone',
]

function requiresOptions(type: QuestionnaireFieldType) {
  return OPTION_BASED_TYPES.includes(type)
}

export function QuestionnaireTemplatesSettingsPage() {
  const { brand } = useBranding()
  const queryClient = useQueryClient()
  const [draft, setDraft] = useState<QuestionnaireTemplateSettings>(emptyDraft())
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('standard-booking-questionnaire')

  const settingsQuery = useQuery({
    queryKey: ['settings-questionnaire-templates', brand.slug],
    queryFn: () => fetchQuestionnaireTemplateSettings(brand.slug),
  })

  useEffect(() => {
    if (!settingsQuery.data) return
    setDraft(settingsQuery.data)
    const defaultTemplate = settingsQuery.data.templates.find((template) => template.isDefault)
      ?? settingsQuery.data.templates[0]
    if (defaultTemplate?.id) {
      setSelectedTemplateId(defaultTemplate.id)
    }
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
      if (!template.fields.length) return true

      return template.fields.some((field) => {
        if (!field.label.trim()) return true
        if (requiresOptions(field.type)) {
          const options = (field.options ?? []).map((option) => option.trim()).filter(Boolean)
          return options.length < 1
        }
        return false
      })
    })
  }, [draft.templates])

  const saveMutation = useMutation({
    mutationFn: () => saveQuestionnaireTemplateSettings(brand.slug, draft),
    onSuccess: async (saved) => {
      queryClient.setQueryData(['settings-questionnaire-templates', brand.slug], saved)
      await queryClient.invalidateQueries({ queryKey: ['settings-questionnaire-templates', brand.slug] })
      toast.success('Questionnaire template settings updated')
    },
    onError: (error) => {
      console.error(error)
      toast.error(error instanceof Error ? error.message : 'Unable to save questionnaire template settings')
    },
  })

  const disabled = settingsQuery.isLoading || saveMutation.isPending

  const updateTemplate = (
    templateId: string,
    updater: (template: QuestionnaireTemplateDefinition) => QuestionnaireTemplateDefinition,
  ) => {
    setDraft((prev) => ({
      ...prev,
      templates: prev.templates.map((template) => (template.id === templateId ? updater(template) : template)),
    }))
  }

  const updateField = (
    templateId: string,
    fieldId: string,
    updater: (field: QuestionnaireTemplateField) => QuestionnaireTemplateField,
  ) => {
    updateTemplate(templateId, (template) => ({
      ...template,
      fields: template.fields.map((field) => (field.id === fieldId ? updater(field) : field)),
    }))
  }

  const addTemplate = () => {
    setDraft((prev) => {
      const nextIndex = prev.templates.length + 1
      const id = `questionnaire-template-${Date.now()}`
      const nextTemplate: QuestionnaireTemplateDefinition = {
        id,
        name: `Template ${nextIndex}`,
        isDefault: prev.templates.length === 0,
        title: 'Booking Questionnaire',
        description: '',
        fields: [
          {
            id: `field-${Date.now()}`,
            label: 'New Question',
            type: 'single_line_text',
            required: false,
            clientTokenKey: '',
            placeholder: '',
            helpText: '',
            options: [],
          },
        ],
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

  const addField = (templateId: string) => {
    updateTemplate(templateId, (template) => ({
      ...template,
      fields: [
        ...template.fields,
        {
          id: `field-${Date.now()}`,
          label: `Question ${template.fields.length + 1}`,
          type: 'single_line_text',
          required: false,
          clientTokenKey: '',
          placeholder: '',
          helpText: '',
          options: [],
        },
      ],
    }))
  }

  const removeField = (templateId: string, fieldId: string) => {
    updateTemplate(templateId, (template) => ({
      ...template,
      fields: template.fields.filter((field) => field.id !== fieldId),
    }))
  }

  return (
    <div className="space-y-4">
      <Card title="Questionnaire Templates" className="p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm text-brand-muted">
              Build and manage reusable questionnaire templates with rich field types for your booking process.
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

      {settingsQuery.isLoading ? (
        <Card title="Template Library" className="p-4">
          <p className="text-sm text-brand-muted">Loading questionnaire template settings...</p>
        </Card>
      ) : (
        <>
          <Card title="Activation" className="p-4">
            <label className="flex items-center justify-between gap-3 text-sm text-white">
              <span>Apply default questionnaire template when lead/event has no specific questionnaire template selected</span>
              <input
                type="checkbox"
                checked={draft.applyByDefaultWhenMissing}
                onChange={(event) => setDraft((prev) => ({ ...prev, applyByDefaultWhenMissing: event.target.checked }))}
                className="accent-brand-primary"
                disabled={disabled}
              />
            </label>
          </Card>

          <Card title="Template Library" className="p-4">
            <div className="grid gap-4 md:grid-cols-[260px_1fr]">
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
                    <p className="mt-1 text-[11px] text-brand-muted/80">{template.fields.length} fields</p>
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
                      Questionnaire Title
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
                    Description
                    <textarea
                      value={activeTemplate.description}
                      onChange={(event) => updateTemplate(activeTemplate.id, (current) => ({
                        ...current,
                        description: event.target.value,
                      }))}
                      className="input-compact min-h-[80px]"
                      disabled={disabled}
                    />
                  </label>

                  <div className="space-y-2 border border-border/40 bg-surface-muted/20 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-sm font-semibold text-white">Fields</h3>
                      <button
                        type="button"
                        onClick={() => addField(activeTemplate.id)}
                        disabled={disabled}
                        className="btn-compact-secondary"
                      >
                        <Plus size={14} /> Add Field
                      </button>
                    </div>

                    {activeTemplate.fields.map((field) => (
                      <div key={field.id} className="grid gap-2 border border-border/40 bg-surface/40 p-3 md:grid-cols-[1.1fr_220px_auto]">
                        <label className="grid gap-1 text-[11px] uppercase tracking-[0.1em] text-brand-muted">
                          Question Label
                          <input
                            type="text"
                            value={field.label}
                            onChange={(event) => updateField(activeTemplate.id, field.id, (current) => ({
                              ...current,
                              label: event.target.value,
                            }))}
                            className="input-compact"
                            disabled={disabled}
                          />
                        </label>

                        <label className="grid gap-1 text-[11px] uppercase tracking-[0.1em] text-brand-muted">
                          Field Type
                          <select
                            value={field.type}
                            onChange={(event) => updateField(activeTemplate.id, field.id, (current) => ({
                              ...current,
                              type: event.target.value as QuestionnaireFieldType,
                              options: requiresOptions(event.target.value as QuestionnaireFieldType)
                                ? ((current.options ?? []).length ? current.options : ['Option 1'])
                                : [],
                            }))}
                            className="select-compact"
                            disabled={disabled}
                          >
                            {FIELD_TYPE_OPTIONS.map((option) => (
                              <option key={option.value} value={option.value}>{option.label}</option>
                            ))}
                          </select>
                        </label>

                        <div className="flex items-end justify-end">
                          <button
                            type="button"
                            onClick={() => removeField(activeTemplate.id, field.id)}
                            disabled={disabled || activeTemplate.fields.length <= 1}
                            className="btn-compact-secondary"
                          >
                            <Trash2 size={14} /> Remove
                          </button>
                        </div>

                        <label className="grid gap-1 text-[11px] uppercase tracking-[0.1em] text-brand-muted md:col-span-2">
                          Placeholder
                          <input
                            type="text"
                            value={field.placeholder ?? ''}
                            onChange={(event) => updateField(activeTemplate.id, field.id, (current) => ({
                              ...current,
                              placeholder: event.target.value,
                            }))}
                            className="input-compact"
                            disabled={disabled}
                          />
                        </label>

                        <label className="grid gap-1 text-[11px] uppercase tracking-[0.1em] text-brand-muted md:col-span-1">
                          Client Token Key
                          <input
                            type="text"
                            value={field.clientTokenKey ?? ''}
                            onChange={(event) => updateField(activeTemplate.id, field.id, (current) => ({
                              ...current,
                              clientTokenKey: event.target.value
                                .trim()
                                .toLowerCase()
                                .replace(/[^a-z0-9_.]/g, '_')
                                .replace(/_+/g, '_')
                                .replace(/\.+/g, '.')
                                .replace(/^[_\.]+|[_\.]+$/g, ''),
                            }))}
                            className="input-compact"
                            placeholder="client_phone"
                            disabled={disabled}
                          />
                          <div className="mt-1 flex flex-wrap gap-1">
                            {RECOMMENDED_CLIENT_TOKEN_KEYS.map((tokenKey) => (
                              <button
                                key={`${field.id}-${tokenKey}`}
                                type="button"
                                onClick={() => updateField(activeTemplate.id, field.id, (current) => ({
                                  ...current,
                                  clientTokenKey: tokenKey,
                                }))}
                                className={`rounded border px-2 py-0.5 text-[10px] normal-case tracking-normal ${
                                  (field.clientTokenKey ?? '') === tokenKey
                                    ? 'border-brand-primary text-white bg-brand-primary/20'
                                    : 'border-border/40 text-brand-muted bg-surface-muted/20'
                                }`}
                                disabled={disabled}
                              >
                                {tokenKey}
                              </button>
                            ))}
                          </div>
                        </label>

                        <label className="mt-5 inline-flex items-center gap-2 text-xs text-white">
                          <input
                            type="checkbox"
                            className="accent-brand-primary"
                            checked={field.required}
                            onChange={(event) => updateField(activeTemplate.id, field.id, (current) => ({
                              ...current,
                              required: event.target.checked,
                            }))}
                            disabled={disabled}
                          />
                          Required
                        </label>

                        <label className="grid gap-1 text-[11px] uppercase tracking-[0.1em] text-brand-muted md:col-span-3">
                          Help Text
                          <input
                            type="text"
                            value={field.helpText ?? ''}
                            onChange={(event) => updateField(activeTemplate.id, field.id, (current) => ({
                              ...current,
                              helpText: event.target.value,
                            }))}
                            className="input-compact"
                            disabled={disabled}
                          />
                        </label>

                        {requiresOptions(field.type) ? (
                          <label className="grid gap-1 text-[11px] uppercase tracking-[0.1em] text-brand-muted md:col-span-3">
                            Options (one per line)
                            <textarea
                              value={(field.options ?? []).join('\n')}
                              onChange={(event) => updateField(activeTemplate.id, field.id, (current) => ({
                                ...current,
                                options: event.target.value
                                  .split('\n')
                                  .map((option) => option.trim())
                                  .filter(Boolean),
                              }))}
                              className="input-compact min-h-[96px]"
                              disabled={disabled}
                            />
                          </label>
                        ) : null}
                      </div>
                    ))}
                  </div>

                  <div className="rounded border border-border/40 bg-surface-muted/20 p-3">
                    <p className="text-[11px] uppercase tracking-[0.12em] text-brand-muted">Template Preview</p>
                    <h3 className="mt-2 text-base font-semibold text-white">{activeTemplate.title || 'Untitled Questionnaire'}</h3>
                    {activeTemplate.description ? <p className="mt-1 text-sm text-brand-muted">{activeTemplate.description}</p> : null}
                    <div className="mt-3 space-y-2">
                      {activeTemplate.fields.map((field) => (
                        <div key={`preview-${field.id}`} className="border border-border/30 bg-surface/40 p-2">
                          <p className="text-sm text-white">{field.label}{field.required ? ' *' : ''}</p>
                          <p className="text-xs uppercase tracking-[0.08em] text-brand-muted">
                            {FIELD_TYPE_OPTIONS.find((option) => option.value === field.type)?.label ?? field.type}
                          </p>
                          {field.clientTokenKey ? (
                            <p className="mt-1 text-[11px] text-brand-muted">Maps to token: {'{{'}{field.clientTokenKey}{'}}'}</p>
                          ) : null}
                        </div>
                      ))}
                    </div>
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

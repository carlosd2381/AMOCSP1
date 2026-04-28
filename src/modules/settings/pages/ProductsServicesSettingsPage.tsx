import { type ChangeEvent, type KeyboardEvent as ReactKeyboardEvent, useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { ChevronDown, ChevronUp, ChevronsUpDown, Download, Pencil, Plus, Trash2, X } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { useBranding } from '@/contexts/BrandingContext'
import { ServiceCatalogComposerPanel } from '../components/ServiceCatalogComposerPanel'
import {
  createEmptyProductServiceDraft,
  createProductService,
  deletePackageLineItemMapping,
  deleteProductService,
  exportProductsServicesBundle,
  fetchPackageLineItemMappings,
  fetchProductsServices,
  getMainPackageTemplateNames,
  importProductsServicesBundle,
  syncMainPackagesFromSheets,
  type ProductServiceCategory,
  type ProductServiceDraft,
  type PackageLineItemMapping,
  type ProductServiceRecord,
  upsertPackageLineItemMapping,
  updateProductService,
} from '@/services/productsServicesService'

type SortDirection = 'asc' | 'desc'
type SortKey = 'name' | 'category' | 'cost' | 'price' | 'margin' | 'updated'
type ProductsServicesTab = 'catalog' | 'composer' | 'mapping'

const CATEGORY_OPTIONS: Array<{ value: ProductServiceCategory; label: string }> = [
  { value: 'package', label: 'Package' },
  { value: 'service', label: 'Service' },
  { value: 'addon', label: 'Add-on' },
  { value: 'product', label: 'Product' },
]

const TAB_OPTIONS: Array<{ id: ProductsServicesTab; label: string; description: string }> = [
  { id: 'catalog', label: 'Catalog', description: 'Products, services, and import/export tools' },
  { id: 'composer', label: 'Packages', description: 'Atomic services and hourly package composer' },
  { id: 'mapping', label: 'Quote Mapping', description: 'Map legacy quote labels to templates' },
]

export function ProductsServicesSettingsPage() {
  const { brand } = useBranding()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('updated')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')
  const [activeTab, setActiveTab] = useState<ProductsServicesTab>('catalog')
  const [editorMode, setEditorMode] = useState<'create' | 'edit' | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<ProductServiceDraft>(createEmptyProductServiceDraft())
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [deleteStep, setDeleteStep] = useState<1 | 2>(1)
  const [mappingLabel, setMappingLabel] = useState('')
  const [mappingTemplateName, setMappingTemplateName] = useState('')
  const [toolsOpen, setToolsOpen] = useState(false)
  const toolsMenuRef = useRef<HTMLDivElement | null>(null)
  const toolsTriggerRef = useRef<HTMLButtonElement | null>(null)
  const toolItemRefs = useRef<Array<HTMLButtonElement | null>>([])
  const [focusedToolIndex, setFocusedToolIndex] = useState(0)
  const importInputRef = useRef<HTMLInputElement | null>(null)
  const importCatalogCsvInputRef = useRef<HTMLInputElement | null>(null)
  const importMappingsCsvInputRef = useRef<HTMLInputElement | null>(null)

  const templateNames = useMemo(() => getMainPackageTemplateNames(), [])

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (!toolsOpen) return
      const target = event.target as Node | null
      if (!target) return
      if (toolsMenuRef.current?.contains(target)) return
      setToolsOpen(false)
    }

    const handleEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setToolsOpen(false)
    }

    window.addEventListener('mousedown', handlePointerDown)
    window.addEventListener('keydown', handleEscape)

    return () => {
      window.removeEventListener('mousedown', handlePointerDown)
      window.removeEventListener('keydown', handleEscape)
    }
  }, [toolsOpen])

  const recordsQuery = useQuery({
    queryKey: ['settings-products-services', brand.slug],
    queryFn: () => fetchProductsServices(brand.slug),
  })

  const records = useMemo(() => recordsQuery.data ?? [], [recordsQuery.data])

  const mappingsQuery = useQuery({
    queryKey: ['settings-line-item-mappings', brand.slug],
    queryFn: () => fetchPackageLineItemMappings(brand.slug),
  })

  const mappings = useMemo<PackageLineItemMapping[]>(() => mappingsQuery.data ?? [], [mappingsQuery.data])

  const filteredRecords = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return records

    return records.filter((item) => {
      const haystack = [item.name, item.category, item.description, item.price.toFixed(2), item.cost.toFixed(2)]
        .join(' ')
        .toLowerCase()
      return haystack.includes(query)
    })
  }, [records, search])

  const sortedRecords = useMemo(() => {
    const next = [...filteredRecords]

    next.sort((a, b) => {
      const directionFactor = sortDirection === 'asc' ? 1 : -1

      if (sortKey === 'name') return a.name.localeCompare(b.name) * directionFactor
      if (sortKey === 'category') return a.category.localeCompare(b.category) * directionFactor
      if (sortKey === 'cost') return (a.cost - b.cost) * directionFactor
      if (sortKey === 'price') return (a.price - b.price) * directionFactor
      if (sortKey === 'margin') return ((a.price - a.cost) - (b.price - b.cost)) * directionFactor

      const aTime = new Date(a.updatedAt).getTime() || 0
      const bTime = new Date(b.updatedAt).getTime() || 0
      return (aTime - bTime) * directionFactor
    })

    return next
  }, [filteredRecords, sortDirection, sortKey])

  const selectedRecord = useMemo(
    () => records.find((item) => item.id === editingId) ?? null,
    [records, editingId],
  )

  const deleteTarget = useMemo(
    () => records.find((item) => item.id === deleteId) ?? null,
    [records, deleteId],
  )

  const createMutation = useMutation({
    mutationFn: (payload: ProductServiceDraft) => createProductService(brand.slug, payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['settings-products-services', brand.slug] })
      toast.success('Product or service added')
      closeEditor()
    },
    onError: (error) => {
      console.error(error)
      toast.error(error instanceof Error ? error.message : 'Unable to save product or service')
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: ProductServiceDraft }) => updateProductService(id, payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['settings-products-services', brand.slug] })
      toast.success('Product or service updated')
      closeEditor()
    },
    onError: (error) => {
      console.error(error)
      toast.error(error instanceof Error ? error.message : 'Unable to update product or service')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteProductService(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['settings-products-services', brand.slug] })
      toast.success('Product or service removed')
      setDeleteId(null)
      setDeleteStep(1)
      if (editorMode === 'edit' && editingId === deleteId) {
        closeEditor()
      }
    },
    onError: (error) => {
      console.error(error)
      toast.error(error instanceof Error ? error.message : 'Unable to remove product or service')
    },
  })

  const syncMainPackagesMutation = useMutation({
    mutationFn: () => syncMainPackagesFromSheets(brand.slug),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ['settings-products-services', brand.slug] })
      toast.success(`Main packages synced (${result.created} created, ${result.updated} updated)`)
    },
    onError: (error) => {
      console.error(error)
      toast.error(error instanceof Error ? error.message : 'Unable to sync main packages')
    },
  })

  const upsertMappingMutation = useMutation({
    mutationFn: () => upsertPackageLineItemMapping(brand.slug, mappingLabel, mappingTemplateName),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['settings-line-item-mappings', brand.slug] })
      toast.success('Mapping saved')
      setMappingLabel('')
    },
    onError: (error) => {
      console.error(error)
      toast.error(error instanceof Error ? error.message : 'Unable to save mapping')
    },
  })

  const deleteMappingMutation = useMutation({
    mutationFn: (mappingId: string) => deletePackageLineItemMapping(mappingId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['settings-line-item-mappings', brand.slug] })
      toast.success('Mapping removed')
    },
    onError: (error) => {
      console.error(error)
      toast.error(error instanceof Error ? error.message : 'Unable to remove mapping')
    },
  })

  const exportMutation = useMutation({
    mutationFn: () => exportProductsServicesBundle(brand.slug),
    onSuccess: (bundle) => {
      const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' })
      const url = window.URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      const timestamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
      anchor.href = url
      anchor.download = `${brand.slug}-products-services-${timestamp}.json`
      document.body.append(anchor)
      anchor.click()
      anchor.remove()
      window.URL.revokeObjectURL(url)
      toast.success('Export downloaded')
    },
    onError: (error) => {
      console.error(error)
      toast.error(error instanceof Error ? error.message : 'Unable to export catalog')
    },
  })

  const importMutation = useMutation({
    mutationFn: async (file: File) => {
      const content = await file.text()
      const payload = JSON.parse(content) as unknown
      return importProductsServicesBundle(brand.slug, payload)
    },
    onSuccess: async (result) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['settings-products-services', brand.slug] }),
        queryClient.invalidateQueries({ queryKey: ['settings-line-item-mappings', brand.slug] }),
      ])
      toast.success(
        `Import complete: ${result.created} created, ${result.updated} updated, ${result.mappingsCreated} mappings created, ${result.mappingsUpdated} mappings updated, ${result.skipped} skipped`,
      )
    },
    onError: (error) => {
      console.error(error)
      toast.error(error instanceof Error ? error.message : 'Unable to import file')
    },
  })

  const importCatalogCsvMutation = useMutation({
    mutationFn: async (file: File) => {
      const text = await file.text()
      const rows = parseCsv(text)
      if (!rows.length) throw new Error('CSV file is empty')

      const header = rows[0].map((cell) => cell.trim())
      const nameIndex = header.indexOf('name')
      const categoryIndex = header.indexOf('category')
      const descriptionIndex = header.indexOf('description')
      const costIndex = header.indexOf('cost')
      const priceIndex = header.indexOf('price')
      const activeIndex = header.indexOf('isActive')

      if ([nameIndex, categoryIndex, descriptionIndex, costIndex, priceIndex, activeIndex].some((index) => index < 0)) {
        throw new Error('Invalid catalog CSV header. Expected: name,category,description,cost,price,isActive')
      }

      let created = 0
      let updated = 0
      let skipped = 0

      for (const row of rows.slice(1)) {
        const name = (row[nameIndex] ?? '').trim()
        const category = (row[categoryIndex] ?? '').trim() as ProductServiceCategory
        const description = (row[descriptionIndex] ?? '').trim()
        const cost = Number(row[costIndex] ?? 0)
        const price = Number(row[priceIndex] ?? 0)
        const isActive = parseBoolean(row[activeIndex] ?? '')

        if (!name || !isValidCategory(category) || !Number.isFinite(cost) || !Number.isFinite(price)) {
          skipped += 1
          continue
        }

        const existing = records.find((item) => normalizeKey(item.name) === normalizeKey(name))
        if (existing) {
          await updateProductService(existing.id, {
            name,
            category,
            description,
            cost,
            price,
            isActive,
          })
          updated += 1
        } else {
          await createProductService(brand.slug, {
            name,
            category,
            description,
            cost,
            price,
            isActive,
          })
          created += 1
        }
      }

      return { created, updated, skipped }
    },
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ['settings-products-services', brand.slug] })
      toast.success(`Catalog CSV imported: ${result.created} created, ${result.updated} updated, ${result.skipped} skipped`)
    },
    onError: (error) => {
      console.error(error)
      toast.error(error instanceof Error ? error.message : 'Unable to import catalog CSV')
    },
  })

  const importMappingsCsvMutation = useMutation({
    mutationFn: async (file: File) => {
      const text = await file.text()
      const rows = parseCsv(text)
      if (!rows.length) throw new Error('CSV file is empty')

      const header = rows[0].map((cell) => cell.trim())
      const labelIndex = header.indexOf('quoteLineItemLabel')
      const templateIndex = header.indexOf('templateName')

      if ([labelIndex, templateIndex].some((index) => index < 0)) {
        throw new Error('Invalid mappings CSV header. Expected: quoteLineItemLabel,templateName')
      }

      let created = 0
      let updated = 0
      let skipped = 0

      for (const row of rows.slice(1)) {
        const quoteLineItemLabel = (row[labelIndex] ?? '').trim()
        const templateName = (row[templateIndex] ?? '').trim()

        if (!quoteLineItemLabel || !templateName || !templateNames.includes(templateName)) {
          skipped += 1
          continue
        }

        const existing = mappings.find((mapping) => normalizeKey(mapping.quoteLineItemLabel) === normalizeKey(quoteLineItemLabel))
        await upsertPackageLineItemMapping(brand.slug, quoteLineItemLabel, templateName)
        if (existing) {
          updated += 1
        } else {
          created += 1
        }
      }

      return { created, updated, skipped }
    },
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ['settings-line-item-mappings', brand.slug] })
      toast.success(`Mappings CSV imported: ${result.created} created, ${result.updated} updated, ${result.skipped} skipped`)
    },
    onError: (error) => {
      console.error(error)
      toast.error(error instanceof Error ? error.message : 'Unable to import mappings CSV')
    },
  })

  const saveMapping = async () => {
    if (!mappingLabel.trim()) {
      toast.error('Line item label is required')
      return
    }
    if (!mappingTemplateName) {
      toast.error('Select a package template')
      return
    }
    await upsertMappingMutation.mutateAsync()
  }

  const toolActions = [
    {
      label: syncMainPackagesMutation.isPending ? 'Loading Main Packages…' : 'Load Main Packages',
      onSelect: () => {
        setToolsOpen(false)
        void syncMainPackagesMutation.mutateAsync()
      },
    },
    {
      label: exportMutation.isPending ? 'Exporting JSON…' : 'Export JSON',
      onSelect: () => {
        setToolsOpen(false)
        void exportMutation.mutateAsync()
      },
    },
    {
      label: 'Export Catalog CSV',
      onSelect: () => {
        setToolsOpen(false)
        exportCsv()
      },
    },
    {
      label: 'Export Mappings CSV',
      onSelect: () => {
        setToolsOpen(false)
        exportMappingsCsv()
      },
    },
    {
      label: importMutation.isPending ? 'Importing JSON…' : 'Import JSON',
      onSelect: () => {
        setToolsOpen(false)
        importInputRef.current?.click()
      },
    },
    {
      label: importCatalogCsvMutation.isPending ? 'Importing Catalog CSV…' : 'Import Catalog CSV',
      onSelect: () => {
        setToolsOpen(false)
        importCatalogCsvInputRef.current?.click()
      },
    },
    {
      label: importMappingsCsvMutation.isPending ? 'Importing Mappings CSV…' : 'Import Mappings CSV',
      onSelect: () => {
        setToolsOpen(false)
        importMappingsCsvInputRef.current?.click()
      },
    },
    {
      label: 'Catalog CSV Template',
      onSelect: () => {
        setToolsOpen(false)
        downloadCatalogCsvTemplate()
      },
    },
    {
      label: 'Mappings CSV Template',
      onSelect: () => {
        setToolsOpen(false)
        downloadMappingsCsvTemplate()
      },
    },
  ]

  useEffect(() => {
    if (!toolsOpen) return
    setFocusedToolIndex(0)
    const focusTimer = window.setTimeout(() => {
      toolItemRefs.current[0]?.focus()
    }, 0)
    return () => window.clearTimeout(focusTimer)
  }, [toolsOpen])

  const handleToolsMenuKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!toolsOpen) return

    if (event.key === 'ArrowDown') {
      event.preventDefault()
      const nextIndex = (focusedToolIndex + 1) % toolActions.length
      setFocusedToolIndex(nextIndex)
      toolItemRefs.current[nextIndex]?.focus()
      return
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault()
      const nextIndex = (focusedToolIndex - 1 + toolActions.length) % toolActions.length
      setFocusedToolIndex(nextIndex)
      toolItemRefs.current[nextIndex]?.focus()
      return
    }

    if (event.key === 'Home') {
      event.preventDefault()
      setFocusedToolIndex(0)
      toolItemRefs.current[0]?.focus()
      return
    }

    if (event.key === 'End') {
      event.preventDefault()
      const lastIndex = toolActions.length - 1
      setFocusedToolIndex(lastIndex)
      toolItemRefs.current[lastIndex]?.focus()
      return
    }

    if (event.key === 'Escape') {
      event.preventDefault()
      setToolsOpen(false)
      toolsTriggerRef.current?.focus()
      return
    }

    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      toolActions[focusedToolIndex]?.onSelect()
    }
  }

  const handleToolsTriggerKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setToolsOpen(true)
      setFocusedToolIndex(0)
      window.setTimeout(() => {
        toolItemRefs.current[0]?.focus()
      }, 0)
      return
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault()
      const lastIndex = toolActions.length - 1
      setToolsOpen(true)
      setFocusedToolIndex(lastIndex)
      window.setTimeout(() => {
        toolItemRefs.current[lastIndex]?.focus()
      }, 0)
    }
  }

  const exportCsv = () => {
    const header = ['name', 'category', 'description', 'cost', 'price', 'isActive', 'createdAt', 'updatedAt']
    const rows = records.map((item) => [
      item.name,
      item.category,
      item.description,
      item.cost.toFixed(2),
      item.price.toFixed(2),
      item.isActive ? 'true' : 'false',
      item.createdAt,
      item.updatedAt,
    ])

    const csv = [header, ...rows]
      .map((columns) => columns.map((value) => toCsvCell(value)).join(','))
      .join('\n')

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = window.URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    const timestamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
    anchor.href = url
    anchor.download = `${brand.slug}-products-services-${timestamp}.csv`
    document.body.append(anchor)
    anchor.click()
    anchor.remove()
    window.URL.revokeObjectURL(url)
    toast.success('CSV export downloaded')
  }

  const exportMappingsCsv = () => {
    const header = ['quoteLineItemLabel', 'templateName', 'createdAt', 'updatedAt']
    const rows = mappings.map((mapping) => [
      mapping.quoteLineItemLabel,
      mapping.templateName,
      mapping.createdAt,
      mapping.updatedAt,
    ])

    const csv = [header, ...rows]
      .map((columns) => columns.map((value) => toCsvCell(value)).join(','))
      .join('\n')

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = window.URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    const timestamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
    anchor.href = url
    anchor.download = `${brand.slug}-line-item-mappings-${timestamp}.csv`
    document.body.append(anchor)
    anchor.click()
    anchor.remove()
    window.URL.revokeObjectURL(url)
    toast.success('Mappings CSV export downloaded')
  }

  const downloadCatalogCsvTemplate = () => {
    const templateRows = [
      ['name', 'category', 'description', 'cost', 'price', 'isActive'],
      ['Photography | 1 Photographer | 8 Hours', 'package', 'Main package example', '19279', '19300', 'true'],
      ['Raw Footage Delivery', 'addon', 'Optional add-on example', '1200', '2500', 'true'],
    ]
    const csv = templateRows.map((row) => row.map((value) => toCsvCell(value)).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = window.URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `${brand.slug}-catalog-template.csv`
    document.body.append(anchor)
    anchor.click()
    anchor.remove()
    window.URL.revokeObjectURL(url)
    toast.success('Catalog CSV template downloaded')
  }

  const downloadMappingsCsvTemplate = () => {
    const exampleTemplate = templateNames[0] ?? 'Photography | 1 Photographer | 1 Hour'
    const templateRows = [
      ['quoteLineItemLabel', 'templateName'],
      ['8hr Wedding Photo Package', exampleTemplate],
      ['Cine Team Coverage - 10h', 'Cinematography | 2 Videographers | 10 Hours'],
    ]
    const csv = templateRows.map((row) => row.map((value) => toCsvCell(value)).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = window.URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `${brand.slug}-mappings-template.csv`
    document.body.append(anchor)
    anchor.click()
    anchor.remove()
    window.URL.revokeObjectURL(url)
    toast.success('Mappings CSV template downloaded')
  }

  const handleImportFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    await importMutation.mutateAsync(file)
    event.target.value = ''
  }

  const openCreate = () => {
    setEditorMode('create')
    setEditingId(null)
    setDraft(createEmptyProductServiceDraft())
  }

  const openEdit = (record: ProductServiceRecord) => {
    setEditorMode('edit')
    setEditingId(record.id)
    setDraft({
      name: record.name,
      category: record.category,
      description: record.description,
      cost: record.cost,
      price: record.price,
      isActive: record.isActive,
    })
  }

  const closeEditor = () => {
    setEditorMode(null)
    setEditingId(null)
    setDraft(createEmptyProductServiceDraft())
  }

  const saveDraft = async () => {
    if (!draft.name.trim()) {
      toast.error('Name is required')
      return
    }

    if (editorMode === 'edit') {
      if (!selectedRecord) {
        toast.error('Select a product or service first')
        return
      }
      await updateMutation.mutateAsync({ id: selectedRecord.id, payload: draft })
      return
    }

    await createMutation.mutateAsync(draft)
  }

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'))
      return
    }

    setSortKey(key)
    setSortDirection('asc')
  }

  return (
    <div className="space-y-4">
      <Card title="Settings / Products / Services / Packages" className="p-4">
        <p className="text-sm text-brand-muted">Use tabs to manage catalog records, package composition, and quote label mapping.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {TAB_OPTIONS.map((tab) => {
            const isActive = activeTab === tab.id
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={isActive
                  ? 'border border-brand-primary/70 bg-brand-primary/20 px-3 py-2 text-left text-sm text-white'
                  : 'border border-border/50 bg-surface px-3 py-2 text-left text-sm text-brand-muted hover:border-border hover:text-white'}
              >
                <span className="block font-semibold">{tab.label}</span>
                <span className="block text-xs opacity-80">{tab.description}</span>
              </button>
            )
          })}
        </div>
      </Card>

      {activeTab === 'catalog' ? (
      <Card
        title="Catalog"
        className="p-4"
        actions={<span className="text-xs text-brand-muted"># {sortedRecords.length} Total</span>}
      >
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-brand-muted">Build your real package, service, product, and add-on catalog for booking workflows.</p>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <div className="relative" ref={toolsMenuRef}>
                <button
                  type="button"
                  ref={toolsTriggerRef}
                  onClick={() => setToolsOpen((current) => !current)}
                  onKeyDown={handleToolsTriggerKeyDown}
                  aria-haspopup="menu"
                  aria-expanded={toolsOpen}
                  aria-controls="products-services-data-tools-menu"
                  className="btn-compact-secondary inline-flex items-center gap-2 whitespace-nowrap focus:border-brand-primary/60 focus:outline-none"
                >
                  <Download size={14} />
                  Data Tools
                  <ChevronDown size={14} />
                </button>
                {toolsOpen ? (
                  <div
                    id="products-services-data-tools-menu"
                    className="absolute right-0 z-20 mt-2 w-64 border border-border/50 bg-surface p-1.5 shadow-card"
                    role="menu"
                    aria-label="Data tools"
                    onKeyDown={handleToolsMenuKeyDown}
                  >
                    {toolActions.map((action, index) => (
                      <button
                        key={action.label}
                        ref={(element) => {
                          toolItemRefs.current[index] = element
                        }}
                        type="button"
                        role="menuitem"
                        tabIndex={focusedToolIndex === index ? 0 : -1}
                        onFocus={() => setFocusedToolIndex(index)}
                        onClick={action.onSelect}
                        className="w-full px-2 py-1.5 text-left text-sm text-brand-muted hover:bg-surface-muted/50 hover:text-white focus:bg-surface-muted/50 focus:text-white focus:outline-none"
                      >
                        {action.label}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
              <button
                type="button"
                onClick={openCreate}
                className="btn-compact-primary inline-flex items-center gap-2 whitespace-nowrap focus:border-brand-primary/60 focus:outline-none"
              >
                <Plus size={14} />
                Add Item
              </button>
            </div>
          </div>

          <input
            ref={importInputRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(event) => {
              void handleImportFile(event)
            }}
          />

          <input
            ref={importCatalogCsvInputRef}
            type="file"
            accept="text/csv,.csv"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (!file) return
              void importCatalogCsvMutation.mutateAsync(file)
              event.target.value = ''
            }}
          />

          <input
            className="input-compact w-full"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search products and services"
          />

          <div className="overflow-x-auto border border-border/40">
            <table className="min-w-full divide-y divide-border/30 text-sm">
              <thead className="bg-surface-muted/50 text-xs uppercase tracking-[0.08em] text-brand-muted">
                <tr>
                  <SortableHeader label="Name" active={sortKey === 'name'} direction={sortDirection} onClick={() => toggleSort('name')} />
                  <SortableHeader label="Category" active={sortKey === 'category'} direction={sortDirection} onClick={() => toggleSort('category')} />
                  <SortableHeader label="Cost" alignRight active={sortKey === 'cost'} direction={sortDirection} onClick={() => toggleSort('cost')} />
                  <SortableHeader label="Price" alignRight active={sortKey === 'price'} direction={sortDirection} onClick={() => toggleSort('price')} />
                  <SortableHeader label="Margin" alignRight active={sortKey === 'margin'} direction={sortDirection} onClick={() => toggleSort('margin')} />
                  <th className="px-3 py-2 text-left">Status</th>
                  <SortableHeader label="Updated" active={sortKey === 'updated'} direction={sortDirection} onClick={() => toggleSort('updated')} />
                  <th className="px-3 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/20">
                {sortedRecords.map((item) => (
                  <tr key={item.id} className="transition hover:bg-surface-muted/35">
                    <td className="px-3 py-2.5 text-white">{item.name}</td>
                    <td className="px-3 py-2.5 text-brand-muted capitalize">{item.category}</td>
                    <td className="px-3 py-2.5 text-right text-brand-muted">{formatCurrency(item.cost)}</td>
                    <td className="px-3 py-2.5 text-right text-brand-muted">{formatCurrency(item.price)}</td>
                    <td className="px-3 py-2.5 text-right text-brand-muted">{formatCurrency(item.price - item.cost)}</td>
                    <td className="px-3 py-2.5 text-left">
                      <span className={item.isActive ? 'text-emerald-300' : 'text-brand-muted'}>{item.isActive ? 'Active' : 'Inactive'}</span>
                    </td>
                    <td className="px-3 py-2.5 text-brand-muted">{formatDate(item.updatedAt)}</td>
                    <td className="px-3 py-2.5">
                      <div className="flex justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => openEdit(item)}
                          className="inline-flex h-8 w-8 items-center justify-center border border-border/50 text-brand-muted hover:border-border hover:text-white focus:border-brand-primary/60 focus:outline-none"
                          aria-label={`Edit ${item.name}`}
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setDeleteId(item.id)
                            setDeleteStep(1)
                          }}
                          className="inline-flex h-8 w-8 items-center justify-center border border-border/50 text-brand-muted hover:border-red-400/60 hover:text-red-300 focus:border-brand-primary/60 focus:outline-none"
                          aria-label={`Delete ${item.name}`}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {!sortedRecords.length ? (
                  <tr>
                    <td colSpan={8} className="px-3 py-8 text-center text-sm text-brand-muted">
                      No products or services yet. Add your first package to start testing your booking flow.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </Card>
      ) : null}

      {activeTab === 'composer' ? <ServiceCatalogComposerPanel /> : null}

      {activeTab === 'mapping' ? (
      <Card title="Quote Line Item Mapping" className="p-4">
        <div className="space-y-3">
          <p className="text-sm text-brand-muted">
            Map custom quote line item names to imported main package templates for automatic A/P breakdown.
          </p>
          <div className="grid gap-2 sm:grid-cols-[1.2fr_1fr_auto]">
            <input
              className="input-compact w-full"
              value={mappingLabel}
              onChange={(event) => setMappingLabel(event.target.value)}
              placeholder="Custom quote line item (exact text)"
            />
            <select
              className="select-compact w-full"
              value={mappingTemplateName}
              onChange={(event) => setMappingTemplateName(event.target.value)}
            >
              <option value="">Select package template</option>
              {templateNames.map((name) => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
            <button
              type="button"
              className="btn-compact-primary focus:border-brand-primary/60 focus:outline-none"
              onClick={() => void saveMapping()}
              disabled={upsertMappingMutation.isPending}
            >
              {upsertMappingMutation.isPending ? 'Saving…' : 'Save Mapping'}
            </button>
          </div>

          <div className="overflow-x-auto border border-border/40">
            <table className="min-w-full divide-y divide-border/30 text-sm">
              <thead className="bg-surface-muted/50 text-xs uppercase tracking-[0.08em] text-brand-muted">
                <tr>
                  <th className="px-3 py-2 text-left">Quote Line Item</th>
                  <th className="px-3 py-2 text-left">Mapped Template</th>
                  <th className="px-3 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/20">
                {mappings.map((mapping) => (
                  <tr key={mapping.id} className="transition hover:bg-surface-muted/35">
                    <td className="px-3 py-2.5 text-white">{mapping.quoteLineItemLabel}</td>
                    <td className="px-3 py-2.5 text-brand-muted">{mapping.templateName}</td>
                    <td className="px-3 py-2.5 text-right">
                      <button
                        type="button"
                        className="btn-compact-secondary focus:border-brand-primary/60 focus:outline-none"
                        onClick={() => deleteMappingMutation.mutate(mapping.id)}
                        disabled={deleteMappingMutation.isPending}
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
                {!mappings.length ? (
                  <tr>
                    <td colSpan={3} className="px-3 py-6 text-center text-sm text-brand-muted">
                      No mappings yet.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </Card>
      ) : null}

      <input
        ref={importMappingsCsvInputRef}
        type="file"
        accept="text/csv,.csv"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (!file) return
          void importMappingsCsvMutation.mutateAsync(file)
          event.target.value = ''
        }}
      />

      {activeTab === 'catalog' && editorMode ? (
        <Card
          title={editorMode === 'create' ? 'New Product or Service' : `Edit ${selectedRecord?.name ?? 'Item'}`}
          className="p-4"
          actions={(
            <button
              type="button"
              onClick={closeEditor}
              className="inline-flex h-8 w-8 items-center justify-center border border-border/60 text-brand-muted hover:border-border hover:text-white focus:border-brand-primary/60 focus:outline-none"
              aria-label="Close editor"
            >
              <X size={14} />
            </button>
          )}
        >
          <div className="grid gap-2 sm:grid-cols-2">
            <input
              className="input-compact w-full"
              value={draft.name}
              onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
              placeholder="Name"
            />
            <select
              className="select-compact w-full"
              value={draft.category}
              onChange={(event) => setDraft((current) => ({ ...current, category: event.target.value as ProductServiceCategory }))}
            >
              {CATEGORY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>

          <textarea
            rows={3}
            className="input-compact mt-2 w-full"
            value={draft.description}
            onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))}
            placeholder="Description"
          />

          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <input
              type="number"
              step="0.01"
              min={0}
              className="input-compact w-full"
              value={draft.cost}
              onChange={(event) => setDraft((current) => ({ ...current, cost: Number(event.target.value) || 0 }))}
              placeholder="Cost"
            />
            <input
              type="number"
              step="0.01"
              min={0}
              className="input-compact w-full"
              value={draft.price}
              onChange={(event) => setDraft((current) => ({ ...current, price: Number(event.target.value) || 0 }))}
              placeholder="Price"
            />
          </div>

          <label className="mt-2 inline-flex items-center gap-2 text-sm text-brand-muted">
            <input
              type="checkbox"
              checked={draft.isActive}
              onChange={(event) => setDraft((current) => ({ ...current, isActive: event.target.checked }))}
            />
            Active in booking flow
          </label>

          <div className="mt-3 flex justify-end gap-2">
            <button type="button" className="btn-compact-secondary focus:border-brand-primary/60 focus:outline-none" onClick={closeEditor}>Cancel</button>
            <button
              type="button"
              className="btn-compact-primary focus:border-brand-primary/60 focus:outline-none"
              onClick={() => void saveDraft()}
              disabled={createMutation.isPending || updateMutation.isPending}
            >
              {createMutation.isPending || updateMutation.isPending ? 'Saving…' : 'Save'}
            </button>
          </div>
        </Card>
      ) : null}

      {activeTab === 'catalog' && deleteId && deleteTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-md border border-border/60 bg-surface p-4 shadow-card">
            <h2 className="text-base font-semibold text-white">Delete {deleteTarget.name}?</h2>
            <p className="mt-2 text-sm text-brand-muted">
              {deleteStep === 1
                ? 'Step 1 of 2: confirm that you want to remove this item from your catalog.'
                : 'Step 2 of 2: this action is permanent for this local catalog.'}
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setDeleteId(null)
                  setDeleteStep(1)
                }}
                className="btn-compact-secondary focus:border-brand-primary/60 focus:outline-none"
              >
                Cancel
              </button>
              {deleteStep === 1 ? (
                <button
                  type="button"
                  onClick={() => setDeleteStep(2)}
                  className="btn-compact-secondary border-red-400/50 text-red-200 hover:border-red-300 hover:text-red-100 focus:border-brand-primary/60 focus:outline-none"
                >
                  Continue
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void deleteMutation.mutateAsync(deleteTarget.id)}
                  className="btn-compact-secondary border-red-400/50 text-red-200 hover:border-red-300 hover:text-red-100 focus:border-brand-primary/60 focus:outline-none"
                  disabled={deleteMutation.isPending}
                >
                  {deleteMutation.isPending ? 'Deleting…' : 'Delete'}
                </button>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

interface SortableHeaderProps {
  label: string
  active: boolean
  direction: SortDirection
  alignRight?: boolean
  onClick: () => void
}

function SortableHeader({ label, active, direction, alignRight = false, onClick }: SortableHeaderProps) {
  return (
    <th className={alignRight ? 'px-3 py-2 text-right' : 'px-3 py-2 text-left'}>
      <button
        type="button"
        onClick={onClick}
        className={alignRight ? 'inline-flex items-center justify-end gap-1 text-right' : 'inline-flex items-center gap-1 text-left'}
      >
        <span>{label}</span>
        {active ? (direction === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />) : <ChevronsUpDown size={12} />}
      </button>
    </th>
  )
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(value)
}

function formatDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'n/a'
  return date.toLocaleDateString()
}

function toCsvCell(value: string) {
  const escaped = value.replace(/"/g, '""')
  return `"${escaped}"`
}

function parseCsv(input: string) {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let inQuotes = false

  for (let index = 0; index < input.length; index += 1) {
    const character = input[index]
    const nextCharacter = input[index + 1]

    if (character === '"') {
      if (inQuotes && nextCharacter === '"') {
        cell += '"'
        index += 1
      } else {
        inQuotes = !inQuotes
      }
      continue
    }

    if (character === ',' && !inQuotes) {
      row.push(cell)
      cell = ''
      continue
    }

    if ((character === '\n' || character === '\r') && !inQuotes) {
      if (character === '\r' && nextCharacter === '\n') {
        index += 1
      }
      row.push(cell)
      if (row.some((value) => value.trim().length > 0)) {
        rows.push(row)
      }
      row = []
      cell = ''
      continue
    }

    cell += character
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell)
    if (row.some((value) => value.trim().length > 0)) {
      rows.push(row)
    }
  }

  return rows
}

function parseBoolean(value: string) {
  const normalized = value.trim().toLowerCase()
  return normalized === 'true' || normalized === '1' || normalized === 'yes'
}

function normalizeKey(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, ' ')
}

function isValidCategory(value: string): value is ProductServiceCategory {
  return value === 'package' || value === 'service' || value === 'addon' || value === 'product'
}

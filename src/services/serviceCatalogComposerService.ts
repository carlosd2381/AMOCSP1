import type { BrandSlug, PricingCatalogKey } from '@/types'
import { supabaseClient } from '@/lib/supabase'
import { getBrandUuidFromSlug } from '@/lib/brandRegistry'
import type { Json } from '@/lib/database.types'

const SERVICE_STORAGE_KEY = 'amocsp.service-catalog.v1'
const MATRIX_STORAGE_KEY = 'amocsp.service-pricing-matrix.v1'
const PRESET_STORAGE_KEY = 'amocsp.package-presets.v1'
const PRICING_INPUTS_STORAGE_KEY = 'amocsp.pricing-inputs.v1'
const DEFAULT_PRICING_CATALOG: PricingCatalogKey = 'INT_USD_ENG'

export interface AtomicServiceRecord {
  id: string
  brandSlug: BrandSlug
  name: string
  nameEs?: string
  description: string
  descriptionEs?: string
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export interface AtomicServiceDraft {
  name: string
  nameEs?: string
  description: string
  descriptionEs?: string
  isActive: boolean
}

export interface ServicePricingTierRecord {
  id: string
  brandSlug: BrandSlug
  catalogKey?: PricingCatalogKey
  serviceId: string
  hours: number
  cost: number
  price: number
  createdAt: string
  updatedAt: string
}

export interface ServicePricingTierDraft {
  hours: number
  cost: number
  price: number
}

export interface PackagePresetComponent {
  serviceId: string
  quantity: number
  billingMode?: 'priced' | 'included'
}

export interface PackagePresetRecord {
  id: string
  brandSlug: BrandSlug
  catalogKey?: PricingCatalogKey
  name: string
  description: string
  isActive: boolean
  packageHourlyPrice?: number
  hourlyPriceByHour?: Record<string, number>
  components: PackagePresetComponent[]
  createdAt: string
  updatedAt: string
}

export interface PackagePresetDraft {
  name: string
  description: string
  isActive: boolean
  packageHourlyPrice?: number
  hourlyPriceByHour?: Record<string, number>
  components: PackagePresetComponent[]
}

export interface PackagePresetQuoteLine {
  serviceId: string
  serviceName: string
  serviceDescription?: string
  quantity: number
  hours: number
  billingMode: 'priced' | 'included'
  lineKind?: 'package' | 'component'
  cost: number
  price: number
  totalCost: number
  totalPrice: number
}

export interface ServiceQuoteOption {
  serviceId: string
  serviceName: string
  serviceDescription?: string
  hours: number
  cost: number
  price: number
}

export interface PricingInputProfile {
  brandSlug: BrandSlug
  catalogKey: PricingCatalogKey
  adminPercent: number
  salesPercent: number
  plannerPercent: number
  profitPercent: number
  paymentFeePercent: number
  taxPercent: number
  includeTaxInSellPrice: boolean
  updatedAt: string
}

interface PricingInputProfileRecord extends PricingInputProfile {
  id: string
}

export const DEFAULT_PRICING_INPUTS = {
  adminPercent: 5,
  salesPercent: 10,
  plannerPercent: 15,
  profitPercent: 35,
  paymentFeePercent: 5.85,
  taxPercent: 16,
  includeTaxInSellPrice: false,
} as const

const hydratedBrands = new Set<BrandSlug>()

interface SupabaseServiceRow {
  id: string
  name: string
  name_es: string | null
  description: string
  description_es: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

interface SupabaseMatrixRow {
  id: string
  service_id: string
  catalog_key: PricingCatalogKey
  hours: number
  cost: number
  price: number
  created_at: string
  updated_at: string
}

interface SupabasePresetRow {
  id: string
  catalog_key: PricingCatalogKey
  name: string
  description: string
  is_active: boolean
  package_hourly_price: number | null
  hourly_price_by_hour: unknown
  components: unknown
  created_at: string
  updated_at: string
}

interface SupabasePricingInputRow {
  id: string
  catalog_key: PricingCatalogKey
  admin_percent: number
  sales_percent: number
  planner_percent: number
  profit_percent: number
  payment_fee_percent: number
  tax_percent: number
  include_tax_in_sell_price: boolean
  updated_at: string
}

async function ensureCatalogHydratedFromSupabase(brandSlug: BrandSlug) {
  if (typeof window === 'undefined') return
  if (hydratedBrands.has(brandSlug)) return

  const brandId = await getBrandUuidFromSlug(brandSlug)

  const [servicesResult, matrixResult, presetsResult, pricingInputsResult] = await Promise.all([
    supabaseClient
      .from('brand_catalog_services')
      .select('id, name, name_es, description, description_es, is_active, created_at, updated_at')
      .eq('brand_id', brandId),
    supabaseClient
      .from('brand_service_pricing_tiers')
      .select('id, service_id, catalog_key, hours, cost, price, created_at, updated_at')
      .eq('brand_id', brandId),
    supabaseClient
      .from('brand_package_presets')
      .select('id, catalog_key, name, description, is_active, package_hourly_price, hourly_price_by_hour, components, created_at, updated_at')
      .eq('brand_id', brandId),
    supabaseClient
      .from('brand_pricing_input_profiles')
      .select('id, catalog_key, admin_percent, sales_percent, planner_percent, profit_percent, payment_fee_percent, tax_percent, include_tax_in_sell_price, updated_at')
      .eq('brand_id', brandId),
  ])

  if (servicesResult.error) throw servicesResult.error
  if (matrixResult.error) throw matrixResult.error
  if (presetsResult.error) throw presetsResult.error
  if (pricingInputsResult.error) throw pricingInputsResult.error

  const remoteServices = (servicesResult.data ?? []) as SupabaseServiceRow[]
  const remoteMatrix = (matrixResult.data ?? []) as SupabaseMatrixRow[]
  const remotePresets = (presetsResult.data ?? []) as SupabasePresetRow[]
  const remotePricingInputs = (pricingInputsResult.data ?? []) as SupabasePricingInputRow[]

  const hasRemoteData = remoteServices.length > 0 || remoteMatrix.length > 0 || remotePresets.length > 0 || remotePricingInputs.length > 0

  if (hasRemoteData) {
    overwriteBrandLocalDataFromRemote(brandSlug, remoteServices, remoteMatrix, remotePresets, remotePricingInputs)
  } else {
    await persistBrandCatalogToSupabase(brandSlug)
  }

  hydratedBrands.add(brandSlug)
}

function overwriteBrandLocalDataFromRemote(
  brandSlug: BrandSlug,
  services: SupabaseServiceRow[],
  matrix: SupabaseMatrixRow[],
  presets: SupabasePresetRow[],
  pricingInputs: SupabasePricingInputRow[],
) {
  const existingServices = readServices().filter((entry) => entry.brandSlug !== brandSlug)
  const existingMatrix = readMatrix().filter((entry) => entry.brandSlug !== brandSlug)
  const existingPresets = readPresets().filter((entry) => entry.brandSlug !== brandSlug)
  const existingPricingInputs = readPricingInputProfiles().filter((entry) => entry.brandSlug !== brandSlug)

  const nextServices: AtomicServiceRecord[] = services
    .map((row) => ({
      id: row.id,
      brandSlug,
      name: row.name,
      nameEs: row.name_es ?? undefined,
      description: row.description,
      descriptionEs: row.description_es ?? undefined,
      isActive: row.is_active,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }))
    .filter((entry) => isAtomicServiceRecord(entry))

  const nextMatrix: ServicePricingTierRecord[] = matrix
    .map((row) => ({
      id: row.id,
      brandSlug,
      serviceId: row.service_id,
      catalogKey: normalizeCatalogKey(row.catalog_key),
      hours: clampHours(row.hours),
      cost: sanitizeMoney(row.cost),
      price: sanitizeMoney(row.price),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }))
    .filter((entry) => isServicePricingTierRecord(entry))

  const nextPresets: PackagePresetRecord[] = presets
    .map((row) => ({
      id: row.id,
      brandSlug,
      catalogKey: normalizeCatalogKey(row.catalog_key),
      name: row.name,
      description: row.description,
      isActive: row.is_active,
      packageHourlyPrice: typeof row.package_hourly_price === 'number' ? sanitizeMoney(row.package_hourly_price) : undefined,
      hourlyPriceByHour: parseHourlyPriceByHour(row.hourly_price_by_hour),
      components: parsePresetComponents(row.components),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }))
    .filter((entry) => isPackagePresetRecord(entry))

  const nextPricingInputs: PricingInputProfileRecord[] = pricingInputs
    .map((row) => ({
      id: row.id,
      brandSlug,
      catalogKey: normalizeCatalogKey(row.catalog_key),
      adminPercent: sanitizePercent(row.admin_percent),
      salesPercent: sanitizePercent(row.sales_percent),
      plannerPercent: sanitizePercent(row.planner_percent),
      profitPercent: sanitizePercent(row.profit_percent),
      paymentFeePercent: sanitizePercent(row.payment_fee_percent),
      taxPercent: sanitizePercent(row.tax_percent),
      includeTaxInSellPrice: Boolean(row.include_tax_in_sell_price),
      updatedAt: row.updated_at,
    }))
    .filter((entry) => isPricingInputProfileRecord(entry))

  writeServices([...existingServices, ...nextServices])
  writeMatrix([...existingMatrix, ...nextMatrix])
  writePresets([...existingPresets, ...nextPresets])
  writePricingInputProfiles([...existingPricingInputs, ...nextPricingInputs])
}

async function persistBrandCatalogToSupabase(brandSlug: BrandSlug) {
  if (typeof window === 'undefined') return

  const brandId = await getBrandUuidFromSlug(brandSlug)
  const services = readServices().filter((entry) => entry.brandSlug === brandSlug)
  const matrix = readMatrix().filter((entry) => entry.brandSlug === brandSlug)
  const presets = readPresets().filter((entry) => entry.brandSlug === brandSlug)
  const pricingInputs = readPricingInputProfiles().filter((entry) => entry.brandSlug === brandSlug)

  const { error: deleteTiersError } = await supabaseClient
    .from('brand_service_pricing_tiers')
    .delete()
    .eq('brand_id', brandId)
  if (deleteTiersError) throw deleteTiersError

  const { error: deletePresetsError } = await supabaseClient
    .from('brand_package_presets')
    .delete()
    .eq('brand_id', brandId)
  if (deletePresetsError) throw deletePresetsError

  const { error: deletePricingInputsError } = await supabaseClient
    .from('brand_pricing_input_profiles')
    .delete()
    .eq('brand_id', brandId)
  if (deletePricingInputsError) throw deletePricingInputsError

  const { error: deleteServicesError } = await supabaseClient
    .from('brand_catalog_services')
    .delete()
    .eq('brand_id', brandId)
  if (deleteServicesError) throw deleteServicesError

  if (services.length) {
    const { error } = await supabaseClient
      .from('brand_catalog_services')
      .insert(services.map((entry) => ({
        id: entry.id,
        brand_id: brandId,
        name: entry.name,
        name_es: entry.nameEs ?? null,
        description: entry.description,
        description_es: entry.descriptionEs ?? null,
        is_active: entry.isActive,
        created_at: entry.createdAt,
        updated_at: entry.updatedAt,
      })))
    if (error) throw error
  }

  if (matrix.length) {
    const { error } = await supabaseClient
      .from('brand_service_pricing_tiers')
      .insert(matrix.map((entry) => ({
        id: entry.id,
        brand_id: brandId,
        service_id: entry.serviceId,
        catalog_key: normalizeCatalogKey(entry.catalogKey ?? DEFAULT_PRICING_CATALOG),
        hours: clampHours(entry.hours),
        cost: sanitizeMoney(entry.cost),
        price: sanitizeMoney(entry.price),
        created_at: entry.createdAt,
        updated_at: entry.updatedAt,
      })))
    if (error) throw error
  }

  if (presets.length) {
    const { error } = await supabaseClient
      .from('brand_package_presets')
      .insert(presets.map((entry) => ({
        id: entry.id,
        brand_id: brandId,
        catalog_key: normalizeCatalogKey(entry.catalogKey ?? DEFAULT_PRICING_CATALOG),
        name: entry.name,
        description: entry.description,
        is_active: entry.isActive,
        package_hourly_price: entry.packageHourlyPrice ?? null,
        hourly_price_by_hour: (entry.hourlyPriceByHour ?? null) as Json,
        components: entry.components as unknown as Json,
        created_at: entry.createdAt,
        updated_at: entry.updatedAt,
      })))
    if (error) throw error
  }

  if (pricingInputs.length) {
    const { error } = await supabaseClient
      .from('brand_pricing_input_profiles')
      .insert(pricingInputs.map((entry) => ({
        id: entry.id,
        brand_id: brandId,
        catalog_key: normalizeCatalogKey(entry.catalogKey),
        admin_percent: sanitizePercent(entry.adminPercent),
        sales_percent: sanitizePercent(entry.salesPercent),
        planner_percent: sanitizePercent(entry.plannerPercent),
        profit_percent: sanitizePercent(entry.profitPercent),
        payment_fee_percent: sanitizePercent(entry.paymentFeePercent),
        tax_percent: sanitizePercent(entry.taxPercent),
        include_tax_in_sell_price: Boolean(entry.includeTaxInSellPrice),
        updated_at: entry.updatedAt,
      })))
    if (error) throw error
  }
}

function parsePresetComponents(value: unknown): PackagePresetComponent[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((entry): entry is PackagePresetComponent => isPresetComponent(entry))
    .map((entry) => ({
      serviceId: entry.serviceId,
      quantity: sanitizeQuantity(entry.quantity),
      billingMode: normalizeBillingMode(entry.billingMode),
    }))
}

function parseHourlyPriceByHour(value: unknown): Record<string, number> | undefined {
  if (!isHourlyPriceByHour(value)) return undefined
  return sanitizeHourlyPriceByHour(value)
}

export async function fetchAtomicServices(brandSlug: BrandSlug): Promise<AtomicServiceRecord[]> {
  await ensureCatalogHydratedFromSupabase(brandSlug)
  return readServices()
    .filter((item) => item.brandSlug === brandSlug)
    .sort((a, b) => a.name.localeCompare(b.name))
}

export async function fetchPricingInputProfile(
  brandSlug: BrandSlug,
  catalogKey: PricingCatalogKey = DEFAULT_PRICING_CATALOG,
): Promise<PricingInputProfile> {
  await ensureCatalogHydratedFromSupabase(brandSlug)
  const normalizedCatalog = normalizeCatalogKey(catalogKey)
  const all = readPricingInputProfiles()
  const existing = all.find((item) => item.brandSlug === brandSlug && isCatalogMatch(item.catalogKey, normalizedCatalog))

  if (!existing) {
    return {
      brandSlug,
      catalogKey: normalizedCatalog,
      ...DEFAULT_PRICING_INPUTS,
      updatedAt: new Date().toISOString(),
    }
  }

  return {
    brandSlug: existing.brandSlug,
    catalogKey: existing.catalogKey,
    adminPercent: existing.adminPercent,
    salesPercent: existing.salesPercent,
    plannerPercent: existing.plannerPercent,
    profitPercent: existing.profitPercent,
    paymentFeePercent: existing.paymentFeePercent,
    taxPercent: existing.taxPercent,
    includeTaxInSellPrice: existing.includeTaxInSellPrice,
    updatedAt: existing.updatedAt,
  }
}

export async function upsertPricingInputProfile(
  brandSlug: BrandSlug,
  catalogKey: PricingCatalogKey,
  profile: Omit<PricingInputProfile, 'brandSlug' | 'catalogKey' | 'updatedAt'>,
): Promise<PricingInputProfile> {
  await ensureCatalogHydratedFromSupabase(brandSlug)
  const normalizedCatalog = normalizeCatalogKey(catalogKey)
  const all = readPricingInputProfiles()
  const now = new Date().toISOString()
  const index = all.findIndex((item) => item.brandSlug === brandSlug && isCatalogMatch(item.catalogKey, normalizedCatalog))

  const nextRecord: PricingInputProfileRecord = {
    id: index >= 0 ? all[index].id : createId(),
    brandSlug,
    catalogKey: normalizedCatalog,
    adminPercent: sanitizePercent(profile.adminPercent),
    salesPercent: sanitizePercent(profile.salesPercent),
    plannerPercent: sanitizePercent(profile.plannerPercent),
    profitPercent: sanitizePercent(profile.profitPercent),
    paymentFeePercent: sanitizePercent(profile.paymentFeePercent),
    taxPercent: sanitizePercent(profile.taxPercent),
    includeTaxInSellPrice: Boolean(profile.includeTaxInSellPrice),
    updatedAt: now,
  }

  if (index >= 0) {
    all[index] = nextRecord
  } else {
    all.unshift(nextRecord)
  }

  writePricingInputProfiles(all)
  await persistBrandCatalogToSupabase(brandSlug)

  return {
    brandSlug,
    catalogKey: normalizedCatalog,
    adminPercent: nextRecord.adminPercent,
    salesPercent: nextRecord.salesPercent,
    plannerPercent: nextRecord.plannerPercent,
    profitPercent: nextRecord.profitPercent,
    paymentFeePercent: nextRecord.paymentFeePercent,
    taxPercent: nextRecord.taxPercent,
    includeTaxInSellPrice: nextRecord.includeTaxInSellPrice,
    updatedAt: nextRecord.updatedAt,
  }
}

export function calculateSuggestedSellPrice(cost: number, profile: Omit<PricingInputProfile, 'brandSlug' | 'catalogKey' | 'updatedAt'>) {
  const cleanCost = sanitizeMoney(cost)
  if (cleanCost <= 0) return 0

  const allocationPercent =
    sanitizePercent(profile.adminPercent)
    + sanitizePercent(profile.salesPercent)
    + sanitizePercent(profile.plannerPercent)
    + sanitizePercent(profile.profitPercent)
    + sanitizePercent(profile.paymentFeePercent)
    + (profile.includeTaxInSellPrice ? sanitizePercent(profile.taxPercent) : 0)

  const rate = Math.min(95, allocationPercent) / 100
  const divisor = 1 - rate
  if (divisor <= 0) return cleanCost

  return sanitizeMoney(cleanCost / divisor)
}

export async function createAtomicService(brandSlug: BrandSlug, draft: AtomicServiceDraft): Promise<AtomicServiceRecord> {
  await ensureCatalogHydratedFromSupabase(brandSlug)
  const now = new Date().toISOString()
  const name = draft.name.trim()
  if (!name) throw new Error('Service name is required')

  const all = readServices()
  const duplicate = all.find((item) => item.brandSlug === brandSlug && normalize(item.name) === normalize(name))
  if (duplicate) throw new Error('A service with this name already exists')

  const created: AtomicServiceRecord = {
    id: createId(),
    brandSlug,
    name,
    nameEs: draft.nameEs?.trim() || undefined,
    description: draft.description.trim(),
    descriptionEs: draft.descriptionEs?.trim() || undefined,
    isActive: draft.isActive,
    createdAt: now,
    updatedAt: now,
  }

  all.unshift(created)
  writeServices(all)
  await persistBrandCatalogToSupabase(brandSlug)
  return created
}

export async function updateAtomicService(
  brandSlug: BrandSlug,
  serviceId: string,
  draft: AtomicServiceDraft,
): Promise<AtomicServiceRecord> {
  await ensureCatalogHydratedFromSupabase(brandSlug)
  const all = readServices()
  const index = all.findIndex((item) => item.brandSlug === brandSlug && item.id === serviceId)
  if (index < 0) throw new Error('Service was not found')

  const name = draft.name.trim()
  if (!name) throw new Error('Service name is required')

  const duplicate = all.find((item) => (
    item.brandSlug === brandSlug
    && item.id !== serviceId
    && normalize(item.name) === normalize(name)
  ))
  if (duplicate) throw new Error('A service with this name already exists')

  const updated: AtomicServiceRecord = {
    ...all[index],
    name,
    nameEs: draft.nameEs?.trim() || undefined,
    description: draft.description.trim(),
    descriptionEs: draft.descriptionEs?.trim() || undefined,
    isActive: draft.isActive,
    updatedAt: new Date().toISOString(),
  }

  all[index] = updated
  writeServices(all)
  await persistBrandCatalogToSupabase(brandSlug)
  return updated
}

export async function duplicateAtomicService(
  brandSlug: BrandSlug,
  serviceId: string,
): Promise<AtomicServiceRecord> {
  await ensureCatalogHydratedFromSupabase(brandSlug)
  const services = readServices()
  const matrix = readMatrix()
  const source = services.find((item) => item.brandSlug === brandSlug && item.id === serviceId)
  if (!source) throw new Error('Service was not found')

  const now = new Date().toISOString()
  const duplicateName = createDuplicateName(source.name, services, brandSlug)

  const duplicatedService: AtomicServiceRecord = {
    id: createId(),
    brandSlug,
    name: duplicateName,
    nameEs: source.nameEs,
    description: source.description,
    descriptionEs: source.descriptionEs,
    isActive: source.isActive,
    createdAt: now,
    updatedAt: now,
  }

  services.unshift(duplicatedService)

  const sourceRows = matrix.filter((item) => item.brandSlug === brandSlug && item.serviceId === source.id)
  sourceRows.forEach((row) => {
    matrix.push({
      id: createId(),
      brandSlug,
      catalogKey: row.catalogKey,
      serviceId: duplicatedService.id,
      hours: row.hours,
      cost: row.cost,
      price: row.price,
      createdAt: now,
      updatedAt: now,
    })
  })

  writeServices(services)
  writeMatrix(matrix)
  await persistBrandCatalogToSupabase(brandSlug)
  return duplicatedService
}

export async function deleteAtomicService(brandSlug: BrandSlug, serviceId: string): Promise<void> {
  await ensureCatalogHydratedFromSupabase(brandSlug)
  const services = readServices()
  const matrix = readMatrix()
  const presets = readPresets()

  const exists = services.some((item) => item.brandSlug === brandSlug && item.id === serviceId)
  if (!exists) throw new Error('Service was not found')

  const nextServices = services.filter((item) => !(item.brandSlug === brandSlug && item.id === serviceId))
  const nextMatrix = matrix.filter((item) => !(item.brandSlug === brandSlug && item.serviceId === serviceId))
  const nextPresets = presets.map((preset) => {
    if (preset.brandSlug !== brandSlug) return preset
    const nextComponents = preset.components.filter((component) => component.serviceId !== serviceId)
    if (nextComponents.length === preset.components.length) return preset
    return {
      ...preset,
      components: nextComponents,
      updatedAt: new Date().toISOString(),
    }
  })

  writeServices(nextServices)
  writeMatrix(nextMatrix)
  writePresets(nextPresets)
  await persistBrandCatalogToSupabase(brandSlug)
}

export async function fetchServicePricingTiers(
  brandSlug: BrandSlug,
  catalogKey: PricingCatalogKey = DEFAULT_PRICING_CATALOG,
): Promise<ServicePricingTierRecord[]> {
  await ensureCatalogHydratedFromSupabase(brandSlug)
  return readMatrix()
    .filter((item) => item.brandSlug === brandSlug && isCatalogMatch(item.catalogKey, catalogKey))
    .sort((a, b) => a.hours - b.hours)
}

export async function upsertServicePricingMatrix(
  brandSlug: BrandSlug,
  catalogKey: PricingCatalogKey,
  serviceId: string,
  rows: ServicePricingTierDraft[],
): Promise<{ created: number; updated: number }> {
  await ensureCatalogHydratedFromSupabase(brandSlug)
  const normalizedCatalog = normalizeCatalogKey(catalogKey)
  const now = new Date().toISOString()
  const all = readMatrix()
  let created = 0
  let updated = 0

  rows.forEach((row) => {
    const hours = clampHours(row.hours)
    const existingIndex = all.findIndex((entry) => (
      entry.brandSlug === brandSlug
      && entry.serviceId === serviceId
      && entry.hours === hours
      && isCatalogMatch(entry.catalogKey, normalizedCatalog)
    ))

    if (existingIndex >= 0) {
      all[existingIndex] = {
        ...all[existingIndex],
        cost: sanitizeMoney(row.cost),
        price: sanitizeMoney(row.price),
        updatedAt: now,
      }
      updated += 1
      return
    }

    all.push({
      id: createId(),
      brandSlug,
      catalogKey: normalizedCatalog,
      serviceId,
      hours,
      cost: sanitizeMoney(row.cost),
      price: sanitizeMoney(row.price),
      createdAt: now,
      updatedAt: now,
    })
    created += 1
  })

  writeMatrix(all)
  await persistBrandCatalogToSupabase(brandSlug)
  return { created, updated }
}

export async function fetchPackagePresets(
  brandSlug: BrandSlug,
  catalogKey: PricingCatalogKey = DEFAULT_PRICING_CATALOG,
): Promise<PackagePresetRecord[]> {
  await ensureCatalogHydratedFromSupabase(brandSlug)
  return readPresets()
    .filter((item) => item.brandSlug === brandSlug && isCatalogMatch(item.catalogKey, catalogKey))
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
}

export async function createPackagePreset(
  brandSlug: BrandSlug,
  catalogKey: PricingCatalogKey,
  draft: PackagePresetDraft,
): Promise<PackagePresetRecord> {
  await ensureCatalogHydratedFromSupabase(brandSlug)
  const normalizedCatalog = normalizeCatalogKey(catalogKey)
  const now = new Date().toISOString()
  const name = draft.name.trim()
  if (!name) throw new Error('Preset name is required')
  if (!draft.components.length) throw new Error('Add at least one service to this preset')

  const services = readServices().filter((item) => item.brandSlug === brandSlug)
  const invalidServiceId = draft.components.find((component) => !services.some((service) => service.id === component.serviceId))
  if (invalidServiceId) throw new Error('Preset contains a service that does not exist')

  const all = readPresets()
  const duplicate = all.find((item) => (
    item.brandSlug === brandSlug
    && isCatalogMatch(item.catalogKey, normalizedCatalog)
    && normalize(item.name) === normalize(name)
  ))
  if (duplicate) throw new Error('A preset with this name already exists')

  const created: PackagePresetRecord = {
    id: createId(),
    brandSlug,
    catalogKey: normalizedCatalog,
    name,
    description: draft.description.trim(),
    isActive: draft.isActive,
    packageHourlyPrice: sanitizeMoney(
      draft.packageHourlyPrice
      ?? draft.hourlyPriceByHour?.['1']
      ?? draft.hourlyPriceByHour?.[1 as unknown as keyof typeof draft.hourlyPriceByHour]
      ?? 0,
    ),
    hourlyPriceByHour: sanitizeHourlyPriceByHour(draft.hourlyPriceByHour),
    components: draft.components.map((component) => ({
      serviceId: component.serviceId,
      quantity: sanitizeQuantity(component.quantity),
      billingMode: normalizeBillingMode(component.billingMode),
    })),
    createdAt: now,
    updatedAt: now,
  }

  all.unshift(created)
  writePresets(all)
  await persistBrandCatalogToSupabase(brandSlug)
  return created
}

export async function updatePackagePreset(
  brandSlug: BrandSlug,
  catalogKey: PricingCatalogKey,
  presetId: string,
  draft: PackagePresetDraft,
): Promise<PackagePresetRecord> {
  await ensureCatalogHydratedFromSupabase(brandSlug)
  const normalizedCatalog = normalizeCatalogKey(catalogKey)
  const all = readPresets()
  const index = all.findIndex((item) => (
    item.brandSlug === brandSlug
    && item.id === presetId
    && isCatalogMatch(item.catalogKey, normalizedCatalog)
  ))
  if (index < 0) throw new Error('Preset was not found')

  const name = draft.name.trim()
  if (!name) throw new Error('Preset name is required')
  if (!draft.components.length) throw new Error('Add at least one service to this preset')

  const services = readServices().filter((item) => item.brandSlug === brandSlug)
  const invalidServiceId = draft.components.find((component) => !services.some((service) => service.id === component.serviceId))
  if (invalidServiceId) throw new Error('Preset contains a service that does not exist')

  const duplicate = all.find((item) => (
    item.brandSlug === brandSlug
    && isCatalogMatch(item.catalogKey, normalizedCatalog)
    && item.id !== presetId
    && normalize(item.name) === normalize(name)
  ))
  if (duplicate) throw new Error('A preset with this name already exists')

  const updated: PackagePresetRecord = {
    ...all[index],
    name,
    description: draft.description.trim(),
    isActive: draft.isActive,
    packageHourlyPrice: sanitizeMoney(
      draft.packageHourlyPrice
      ?? draft.hourlyPriceByHour?.['1']
      ?? draft.hourlyPriceByHour?.[1 as unknown as keyof typeof draft.hourlyPriceByHour]
      ?? 0,
    ),
    hourlyPriceByHour: sanitizeHourlyPriceByHour(draft.hourlyPriceByHour),
    components: draft.components.map((component) => ({
      serviceId: component.serviceId,
      quantity: sanitizeQuantity(component.quantity),
      billingMode: normalizeBillingMode(component.billingMode),
    })),
    updatedAt: new Date().toISOString(),
  }

  all[index] = updated
  writePresets(all)
  await persistBrandCatalogToSupabase(brandSlug)
  return updated
}

export async function duplicatePackagePreset(
  brandSlug: BrandSlug,
  catalogKey: PricingCatalogKey,
  presetId: string,
): Promise<PackagePresetRecord> {
  await ensureCatalogHydratedFromSupabase(brandSlug)
  const normalizedCatalog = normalizeCatalogKey(catalogKey)
  const all = readPresets()
  const source = all.find((item) => (
    item.brandSlug === brandSlug
    && item.id === presetId
    && isCatalogMatch(item.catalogKey, normalizedCatalog)
  ))
  if (!source) throw new Error('Preset was not found')

  const now = new Date().toISOString()
  const duplicateName = createDuplicatePresetName(source.name, all, brandSlug)

  const duplicated: PackagePresetRecord = {
    id: createId(),
    brandSlug,
    catalogKey: normalizedCatalog,
    name: duplicateName,
    description: source.description,
    isActive: source.isActive,
    packageHourlyPrice: sanitizeMoney(source.packageHourlyPrice ?? 0),
    hourlyPriceByHour: sanitizeHourlyPriceByHour(source.hourlyPriceByHour),
    components: source.components.map((component) => ({
      serviceId: component.serviceId,
      quantity: sanitizeQuantity(component.quantity),
      billingMode: normalizeBillingMode(component.billingMode),
    })),
    createdAt: now,
    updatedAt: now,
  }

  all.unshift(duplicated)
  writePresets(all)
  await persistBrandCatalogToSupabase(brandSlug)
  return duplicated
}

export async function deletePackagePreset(
  brandSlug: BrandSlug,
  catalogKey: PricingCatalogKey,
  presetId: string,
): Promise<void> {
  await ensureCatalogHydratedFromSupabase(brandSlug)
  const normalizedCatalog = normalizeCatalogKey(catalogKey)
  const all = readPresets()
  const exists = all.some((item) => (
    item.brandSlug === brandSlug
    && item.id === presetId
    && isCatalogMatch(item.catalogKey, normalizedCatalog)
  ))
  if (!exists) throw new Error('Preset was not found')

  writePresets(all.filter((item) => !(
    item.brandSlug === brandSlug
    && item.id === presetId
    && isCatalogMatch(item.catalogKey, normalizedCatalog)
  )))
  await persistBrandCatalogToSupabase(brandSlug)
}

export async function buildPackagePresetQuoteLines(
  brandSlug: BrandSlug,
  catalogKey: PricingCatalogKey,
  presetId: string,
  coverageHours: number,
  language: 'en' | 'es' = 'en',
): Promise<PackagePresetQuoteLine[]> {
  await ensureCatalogHydratedFromSupabase(brandSlug)
  const normalizedCatalog = normalizeCatalogKey(catalogKey)
  type ComponentBuildRow = PackagePresetQuoteLine & {
    billingMode: 'included'
    lineKind: 'component'
    billedReferenceTotal: number
  }

  const preset = readPresets().find((item) => (
    item.brandSlug === brandSlug
    && item.id === presetId
    && isCatalogMatch(item.catalogKey, normalizedCatalog)
  ))
  if (!preset) throw new Error('Preset was not found')

  const services = readServices().filter((item) => item.brandSlug === brandSlug)
  const matrix = readMatrix().filter((item) => item.brandSlug === brandSlug && isCatalogMatch(item.catalogKey, normalizedCatalog))
  const hours = clampHours(coverageHours)

  const componentRows = preset.components
    .map((component) => {
      const service = services.find((entry) => entry.id === component.serviceId)
      if (!service) return null

      const tier = selectTierForHours(matrix, component.serviceId, hours)
      const cost = tier?.cost ?? 0
      const price = tier?.price ?? 0
      const quantity = sanitizeQuantity(component.quantity)

      const row: ComponentBuildRow = {
        serviceId: component.serviceId,
        serviceName: language === 'es' ? (service.nameEs?.trim() || service.name) : service.name,
        serviceDescription: language === 'es'
          ? (service.descriptionEs?.trim() || service.description?.trim() || undefined)
          : (service.description?.trim() || undefined),
        quantity,
        hours,
        billingMode: 'included',
        lineKind: 'component',
        cost,
        price: 0,
        totalCost: sanitizeMoney(cost * quantity),
        totalPrice: 0,
        billedReferenceTotal: sanitizeMoney(price * quantity),
      }

      return row
    })
    .filter((item): item is ComponentBuildRow => item !== null)

  if (!componentRows.length) {
    return []
  }

  const matrixDerivedPackageTotal = sanitizeMoney(componentRows.reduce((sum, row) => sum + row.billedReferenceTotal, 0))
  const configuredPackageTotal = resolvePresetPackageTotalForHours(preset, hours)
  const packageTotalPrice = configuredPackageTotal > 0
    ? configuredPackageTotal
    : matrixDerivedPackageTotal
  const packageTotalCost = sanitizeMoney(componentRows.reduce((sum, row) => sum + row.totalCost, 0))
  const packageDisplayName = preset.description.trim() || preset.name

  const packageRow: PackagePresetQuoteLine = {
    serviceId: `package-preset-${preset.id}`,
    serviceName: packageDisplayName,
    quantity: 1,
    hours,
    billingMode: 'priced',
    lineKind: 'package',
    cost: packageTotalCost,
    price: packageTotalPrice,
    totalCost: packageTotalCost,
    totalPrice: packageTotalPrice,
  }

  return [
    packageRow,
    ...componentRows.map(({ billedReferenceTotal: _ignored, ...row }) => row),
  ]
}

export async function fetchServiceQuoteOptions(
  brandSlug: BrandSlug,
  catalogKey: PricingCatalogKey,
  coverageHours: number,
  language: 'en' | 'es' = 'en',
): Promise<ServiceQuoteOption[]> {
  await ensureCatalogHydratedFromSupabase(brandSlug)
  const normalizedCatalog = normalizeCatalogKey(catalogKey)
  const services = readServices().filter((item) => item.brandSlug === brandSlug && item.isActive)
  const matrix = readMatrix().filter((item) => item.brandSlug === brandSlug && isCatalogMatch(item.catalogKey, normalizedCatalog))
  const hours = clampHours(coverageHours)

  const options: ServiceQuoteOption[] = []

  for (const service of services) {
    const tier = selectTierForHours(matrix, service.id, hours)
    if (!tier) continue

    options.push({
      serviceId: service.id,
      serviceName: language === 'es' ? (service.nameEs?.trim() || service.name) : service.name,
      serviceDescription: language === 'es'
        ? (service.descriptionEs?.trim() || service.description?.trim() || undefined)
        : (service.description?.trim() || undefined),
      hours,
      cost: tier.cost,
      price: tier.price,
    })
  }

  return options.sort((a, b) => a.serviceName.localeCompare(b.serviceName))
}

function readServices(): AtomicServiceRecord[] {
  if (typeof window === 'undefined') return []
  return readFromStorage<AtomicServiceRecord>(SERVICE_STORAGE_KEY, isAtomicServiceRecord)
}

function writeServices(items: AtomicServiceRecord[]) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(SERVICE_STORAGE_KEY, JSON.stringify(items))
}

function readMatrix(): ServicePricingTierRecord[] {
  if (typeof window === 'undefined') return []
  return readFromStorage<ServicePricingTierRecord>(MATRIX_STORAGE_KEY, isServicePricingTierRecord)
}

function writeMatrix(items: ServicePricingTierRecord[]) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(MATRIX_STORAGE_KEY, JSON.stringify(items))
}

function readPresets(): PackagePresetRecord[] {
  if (typeof window === 'undefined') return []
  return readFromStorage<PackagePresetRecord>(PRESET_STORAGE_KEY, isPackagePresetRecord)
}

function writePresets(items: PackagePresetRecord[]) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(PRESET_STORAGE_KEY, JSON.stringify(items))
}

function readPricingInputProfiles(): PricingInputProfileRecord[] {
  if (typeof window === 'undefined') return []
  return readFromStorage<PricingInputProfileRecord>(PRICING_INPUTS_STORAGE_KEY, isPricingInputProfileRecord)
}

function writePricingInputProfiles(items: PricingInputProfileRecord[]) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(PRICING_INPUTS_STORAGE_KEY, JSON.stringify(items))
}

function readFromStorage<T>(key: string, predicate: (item: unknown) => item is T): T[] {
  const raw = window.localStorage.getItem(key)
  if (!raw) return []

  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter((item) => predicate(item)) as T[]
  } catch {
    return []
  }
}

function isAtomicServiceRecord(value: unknown): value is AtomicServiceRecord {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<AtomicServiceRecord>
  const nameEsValid = candidate.nameEs === undefined || typeof candidate.nameEs === 'string'
  const descriptionEsValid = candidate.descriptionEs === undefined || typeof candidate.descriptionEs === 'string'
  return (
    typeof candidate.id === 'string'
    && isBrandSlug(candidate.brandSlug)
    && typeof candidate.name === 'string'
    && nameEsValid
    && typeof candidate.description === 'string'
    && descriptionEsValid
    && typeof candidate.isActive === 'boolean'
    && typeof candidate.createdAt === 'string'
    && typeof candidate.updatedAt === 'string'
  )
}

function isServicePricingTierRecord(value: unknown): value is ServicePricingTierRecord {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<ServicePricingTierRecord>
  const catalogValid = candidate.catalogKey === undefined || isPricingCatalogKey(candidate.catalogKey)
  return (
    typeof candidate.id === 'string'
    && isBrandSlug(candidate.brandSlug)
    && catalogValid
    && typeof candidate.serviceId === 'string'
    && typeof candidate.hours === 'number'
    && typeof candidate.cost === 'number'
    && typeof candidate.price === 'number'
    && typeof candidate.createdAt === 'string'
    && typeof candidate.updatedAt === 'string'
  )
}

function isPackagePresetRecord(value: unknown): value is PackagePresetRecord {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<PackagePresetRecord>
  const components = Array.isArray(candidate.components) ? candidate.components : []
  const catalogValid = candidate.catalogKey === undefined || isPricingCatalogKey(candidate.catalogKey)
  const packageHourlyPriceValid = candidate.packageHourlyPrice === undefined || typeof candidate.packageHourlyPrice === 'number'
  const hourlyPriceByHourValid = candidate.hourlyPriceByHour === undefined || isHourlyPriceByHour(candidate.hourlyPriceByHour)
  return (
    typeof candidate.id === 'string'
    && isBrandSlug(candidate.brandSlug)
    && catalogValid
    && typeof candidate.name === 'string'
    && typeof candidate.description === 'string'
    && typeof candidate.isActive === 'boolean'
    && packageHourlyPriceValid
    && hourlyPriceByHourValid
    && Array.isArray(candidate.components)
    && components.every((component: unknown) => isPresetComponent(component))
    && typeof candidate.createdAt === 'string'
    && typeof candidate.updatedAt === 'string'
  )
}

function isPresetComponent(value: unknown): value is PackagePresetComponent {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<PackagePresetComponent>
  const billingModeValid = candidate.billingMode === undefined || candidate.billingMode === 'priced' || candidate.billingMode === 'included'
  return typeof candidate.serviceId === 'string' && typeof candidate.quantity === 'number' && billingModeValid
}

function isPricingInputProfileRecord(value: unknown): value is PricingInputProfileRecord {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<PricingInputProfileRecord>
  return (
    typeof candidate.id === 'string'
    && isBrandSlug(candidate.brandSlug)
    && isPricingCatalogKey(candidate.catalogKey)
    && typeof candidate.adminPercent === 'number'
    && typeof candidate.salesPercent === 'number'
    && typeof candidate.plannerPercent === 'number'
    && typeof candidate.profitPercent === 'number'
    && typeof candidate.paymentFeePercent === 'number'
    && typeof candidate.taxPercent === 'number'
    && typeof candidate.includeTaxInSellPrice === 'boolean'
    && typeof candidate.updatedAt === 'string'
  )
}

function sanitizeMoney(value: number) {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Number(value.toFixed(2)))
}

function sanitizePercent(value: number) {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Number(value.toFixed(2)))
}

function sanitizeHourlyPriceByHour(value: Record<string, number> | undefined) {
  if (!value) return undefined
  const output: Record<string, number> = {}
  Object.entries(value).forEach(([hoursKey, price]) => {
    const hours = clampHours(Number(hoursKey))
    output[String(hours)] = sanitizeMoney(price)
  })
  return output
}

function isHourlyPriceByHour(value: unknown): value is Record<string, number> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  return Object.values(value).every((entry) => typeof entry === 'number' && Number.isFinite(entry))
}

function resolvePresetPackageTotalForHours(preset: PackagePresetRecord, hours: number) {
  const exact = preset.hourlyPriceByHour?.[String(hours)]
  // Hour-table values represent final brochure totals for each selected hour.
  if (typeof exact === 'number' && exact > 0) return sanitizeMoney(exact)

  // Legacy fallback: old packageHourlyPrice behaved as an hourly rate.
  if (preset.packageHourlyPrice && preset.packageHourlyPrice > 0) {
    return sanitizeMoney(preset.packageHourlyPrice * hours)
  }

  return 0
}

function sanitizeQuantity(value: number) {
  if (!Number.isFinite(value) || value <= 0) return 1
  return Math.max(1, Math.round(value))
}

function clampHours(value: number) {
  if (!Number.isFinite(value)) return 1
  return Math.min(24, Math.max(1, Math.round(value)))
}

function normalize(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, ' ')
}

function createId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function createDuplicateName(name: string, existing: AtomicServiceRecord[], brandSlug: BrandSlug) {
  const base = `${name} Copy`
  if (!existing.some((item) => item.brandSlug === brandSlug && normalize(item.name) === normalize(base))) {
    return base
  }

  let index = 2
  while (existing.some((item) => item.brandSlug === brandSlug && normalize(item.name) === normalize(`${base} ${index}`))) {
    index += 1
  }

  return `${base} ${index}`
}

function createDuplicatePresetName(name: string, existing: PackagePresetRecord[], brandSlug: BrandSlug) {
  const base = `${name} Copy`
  if (!existing.some((item) => item.brandSlug === brandSlug && normalize(item.name) === normalize(base))) {
    return base
  }

  let index = 2
  while (existing.some((item) => item.brandSlug === brandSlug && normalize(item.name) === normalize(`${base} ${index}`))) {
    index += 1
  }

  return `${base} ${index}`
}

function normalizeBillingMode(value: PackagePresetComponent['billingMode']) {
  return value === 'included' ? 'included' : 'priced'
}

function normalizeCatalogKey(value: PricingCatalogKey) {
  return isPricingCatalogKey(value) ? value : DEFAULT_PRICING_CATALOG
}

function isCatalogMatch(value: PricingCatalogKey | undefined, requested: PricingCatalogKey) {
  if (!value) {
    return requested === DEFAULT_PRICING_CATALOG
  }
  return value === requested
}

function isPricingCatalogKey(value: unknown): value is PricingCatalogKey {
  return value === 'INT_USD_ENG' || value === 'MEX_MXN_ESP'
}

function selectTierForHours(
  matrix: ServicePricingTierRecord[],
  serviceId: string,
  targetHours: number,
) {
  const candidates = matrix.filter((entry) => entry.serviceId === serviceId)
  if (!candidates.length) return undefined

  const exact = candidates.find((entry) => entry.hours === targetHours)
  if (exact) return exact

  return candidates.reduce((best, current) => {
    const bestDistance = Math.abs(best.hours - targetHours)
    const currentDistance = Math.abs(current.hours - targetHours)
    if (currentDistance < bestDistance) return current
    if (currentDistance === bestDistance && current.hours > best.hours) return current
    return best
  })
}

function isBrandSlug(value: unknown): value is BrandSlug {
  return value === 'amo' || value === 'csp'
}

import { type BrandSlug } from '@/types'

const STORAGE_KEY = 'amocsp.products-services.v1'
const MAPPING_STORAGE_KEY = 'amocsp.package-line-item-map.v1'

export type ProductServiceCategory = 'package' | 'service' | 'addon' | 'product'

export interface ProductServiceRecord {
  id: string
  brandSlug: BrandSlug
  name: string
  category: ProductServiceCategory
  description: string
  cost: number
  price: number
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export interface ProductServiceDraft {
  name: string
  category: ProductServiceCategory
  description: string
  cost: number
  price: number
  isActive: boolean
}

export interface ProductServiceSyncResult {
  created: number
  updated: number
}

export interface PackageLineItemMapping {
  id: string
  brandSlug: BrandSlug
  quoteLineItemLabel: string
  templateName: string
  createdAt: string
  updatedAt: string
}

export interface MainPackageCostBreakdown {
  labor: number
  admin: number
  commission: number
  subtotal: number
}

export interface MainPackageTemplate {
  name: string
  description: string
  cost: number
  price: number
  breakdown: MainPackageCostBreakdown
}

export interface ProductsServicesExportBundle {
  version: 1
  exportedAt: string
  brandSlug: BrandSlug
  items: Array<{
    name: string
    category: ProductServiceCategory
    description: string
    cost: number
    price: number
    isActive: boolean
  }>
  mappings: Array<{
    quoteLineItemLabel: string
    templateName: string
  }>
}

export interface ProductsServicesImportResult {
  created: number
  updated: number
  mappingsCreated: number
  mappingsUpdated: number
  skipped: number
}

export function createEmptyProductServiceDraft(): ProductServiceDraft {
  return {
    name: '',
    category: 'package',
    description: '',
    cost: 0,
    price: 0,
    isActive: true,
  }
}

export async function fetchProductsServices(brandSlug: BrandSlug): Promise<ProductServiceRecord[]> {
  const all = readAll()
  return all
    .filter((item) => item.brandSlug === brandSlug)
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
}

export async function createProductService(
  brandSlug: BrandSlug,
  payload: ProductServiceDraft,
): Promise<ProductServiceRecord> {
  const now = new Date().toISOString()
  const next: ProductServiceRecord = {
    id: createId(),
    brandSlug,
    name: payload.name.trim(),
    category: payload.category,
    description: payload.description.trim(),
    cost: sanitizeMoney(payload.cost),
    price: sanitizeMoney(payload.price),
    isActive: payload.isActive,
    createdAt: now,
    updatedAt: now,
  }

  const all = readAll()
  all.unshift(next)
  writeAll(all)
  return next
}

export async function updateProductService(
  recordId: string,
  payload: ProductServiceDraft,
): Promise<ProductServiceRecord> {
  const all = readAll()
  const index = all.findIndex((item) => item.id === recordId)
  if (index < 0) throw new Error('Product or service was not found')

  const current = all[index]
  const updated: ProductServiceRecord = {
    ...current,
    name: payload.name.trim(),
    category: payload.category,
    description: payload.description.trim(),
    cost: sanitizeMoney(payload.cost),
    price: sanitizeMoney(payload.price),
    isActive: payload.isActive,
    updatedAt: new Date().toISOString(),
  }

  all[index] = updated
  writeAll(all)
  return updated
}

export async function deleteProductService(recordId: string): Promise<void> {
  const all = readAll()
  const next = all.filter((item) => item.id !== recordId)
  writeAll(next)
}

export async function syncMainPackagesFromSheets(brandSlug: BrandSlug): Promise<ProductServiceSyncResult> {
  const all = readAll()
  const now = new Date().toISOString()
  const templates = createMainPackageTemplates()
  let created = 0
  let updated = 0

  templates.forEach((template) => {
    const existingIndex = all.findIndex((item) => item.brandSlug === brandSlug && item.name === template.name)

    if (existingIndex >= 0) {
      const current = all[existingIndex]
      all[existingIndex] = {
        ...current,
        category: 'package',
        description: template.description,
        cost: sanitizeMoney(template.cost),
        price: sanitizeMoney(template.price),
        isActive: true,
        updatedAt: now,
      }
      updated += 1
      return
    }

    all.unshift({
      id: createId(),
      brandSlug,
      name: template.name,
      category: 'package',
      description: template.description,
      cost: sanitizeMoney(template.cost),
      price: sanitizeMoney(template.price),
      isActive: true,
      createdAt: now,
      updatedAt: now,
    })
    created += 1
  })

  writeAll(all)
  return { created, updated }
}

export function getMainPackageTemplateByName(name: string): MainPackageTemplate | null {
  return createMainPackageTemplates().find((item) => item.name === name) ?? null
}

export function getMainPackageTemplateNames(): string[] {
  return createMainPackageTemplates().map((item) => item.name)
}

export async function fetchPackageLineItemMappings(brandSlug: BrandSlug): Promise<PackageLineItemMapping[]> {
  return readMappings()
    .filter((item) => item.brandSlug === brandSlug)
    .sort((a, b) => a.quoteLineItemLabel.localeCompare(b.quoteLineItemLabel))
}

export async function upsertPackageLineItemMapping(
  brandSlug: BrandSlug,
  quoteLineItemLabel: string,
  templateName: string,
): Promise<PackageLineItemMapping> {
  const normalizedLabel = quoteLineItemLabel.trim()
  if (!normalizedLabel) throw new Error('Line item label is required')
  if (!getMainPackageTemplateByName(templateName)) throw new Error('Template not found')

  const mappings = readMappings()
  const now = new Date().toISOString()
  const existingIndex = mappings.findIndex((item) => item.brandSlug === brandSlug && normalizeMappingLabel(item.quoteLineItemLabel) === normalizeMappingLabel(normalizedLabel))

  if (existingIndex >= 0) {
    const updated: PackageLineItemMapping = {
      ...mappings[existingIndex],
      quoteLineItemLabel: normalizedLabel,
      templateName,
      updatedAt: now,
    }
    mappings[existingIndex] = updated
    writeMappings(mappings)
    return updated
  }

  const created: PackageLineItemMapping = {
    id: createId(),
    brandSlug,
    quoteLineItemLabel: normalizedLabel,
    templateName,
    createdAt: now,
    updatedAt: now,
  }
  mappings.unshift(created)
  writeMappings(mappings)
  return created
}

export async function deletePackageLineItemMapping(mappingId: string): Promise<void> {
  const mappings = readMappings()
  writeMappings(mappings.filter((item) => item.id !== mappingId))
}

export function resolveMappedPackageTemplateName(brandSlug: BrandSlug, quoteLineItemLabel: string): string | null {
  const normalized = normalizeMappingLabel(quoteLineItemLabel)
  if (!normalized) return null

  const mapping = readMappings().find((item) => item.brandSlug === brandSlug && normalizeMappingLabel(item.quoteLineItemLabel) === normalized)
  return mapping?.templateName ?? null
}

export async function exportProductsServicesBundle(brandSlug: BrandSlug): Promise<ProductsServicesExportBundle> {
  const items = readAll()
    .filter((item) => item.brandSlug === brandSlug)
    .map((item) => ({
      name: item.name,
      category: item.category,
      description: item.description,
      cost: item.cost,
      price: item.price,
      isActive: item.isActive,
    }))

  const mappings = readMappings()
    .filter((mapping) => mapping.brandSlug === brandSlug)
    .map((mapping) => ({
      quoteLineItemLabel: mapping.quoteLineItemLabel,
      templateName: mapping.templateName,
    }))

  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    brandSlug,
    items,
    mappings,
  }
}

export async function importProductsServicesBundle(
  brandSlug: BrandSlug,
  payload: unknown,
): Promise<ProductsServicesImportResult> {
  const bundle = parseImportBundle(payload)

  const now = new Date().toISOString()
  const allItems = readAll()
  const allMappings = readMappings()

  let created = 0
  let updated = 0
  let mappingsCreated = 0
  let mappingsUpdated = 0
  let skipped = 0

  bundle.items.forEach((item) => {
    const normalizedName = item.name.trim()
    if (!normalizedName) {
      skipped += 1
      return
    }

    const existingIndex = allItems.findIndex(
      (entry) => entry.brandSlug === brandSlug && normalizeMappingLabel(entry.name) === normalizeMappingLabel(normalizedName),
    )

    if (existingIndex >= 0) {
      allItems[existingIndex] = {
        ...allItems[existingIndex],
        name: normalizedName,
        category: item.category,
        description: item.description.trim(),
        cost: sanitizeMoney(item.cost),
        price: sanitizeMoney(item.price),
        isActive: item.isActive,
        updatedAt: now,
      }
      updated += 1
      return
    }

    allItems.unshift({
      id: createId(),
      brandSlug,
      name: normalizedName,
      category: item.category,
      description: item.description.trim(),
      cost: sanitizeMoney(item.cost),
      price: sanitizeMoney(item.price),
      isActive: item.isActive,
      createdAt: now,
      updatedAt: now,
    })
    created += 1
  })

  bundle.mappings.forEach((mapping) => {
    const normalizedLabel = mapping.quoteLineItemLabel.trim()
    if (!normalizedLabel || !getMainPackageTemplateByName(mapping.templateName)) {
      skipped += 1
      return
    }

    const existingIndex = allMappings.findIndex(
      (entry) => entry.brandSlug === brandSlug && normalizeMappingLabel(entry.quoteLineItemLabel) === normalizeMappingLabel(normalizedLabel),
    )

    if (existingIndex >= 0) {
      allMappings[existingIndex] = {
        ...allMappings[existingIndex],
        quoteLineItemLabel: normalizedLabel,
        templateName: mapping.templateName,
        updatedAt: now,
      }
      mappingsUpdated += 1
      return
    }

    allMappings.unshift({
      id: createId(),
      brandSlug,
      quoteLineItemLabel: normalizedLabel,
      templateName: mapping.templateName,
      createdAt: now,
      updatedAt: now,
    })
    mappingsCreated += 1
  })

  writeAll(allItems)
  writeMappings(allMappings)

  return {
    created,
    updated,
    mappingsCreated,
    mappingsUpdated,
    skipped,
  }
}

function createMainPackageTemplates(): MainPackageTemplate[] {
  const hours = Array.from({ length: 16 }, (_value, index) => index + 1)

  return [
    ...buildPackageSeries(
      'Photography | 1 Photographer',
      'Main package from pricing sheet (1 photographer).',
      hours,
      [2550, 3750, 5550, 7350, 9150, 10950, 12750, 14550, 16350, 18150, 19950, 21750, 23550, 25350, 25950, 27750],
      [191, 281, 416, 551, 686, 821, 956, 1091, 1226, 1361, 1496, 1631, 1766, 1901, 1946, 2081],
      [638, 938, 1388, 1838, 2288, 2738, 3188, 3638, 4088, 4538, 4988, 5438, 5888, 6338, 6488, 6938],
      [3379, 4969, 7354, 9739, 12124, 14509, 16894, 19279, 21664, 24049, 26434, 28819, 31204, 33589, 34384, 36769],
      [3400, 4975, 7375, 9750, 12125, 14525, 16900, 19300, 21675, 24050, 26450, 28825, 31225, 33600, 34400, 36775],
    ),
    ...buildPackageSeries(
      'Photography | 2 Photographers',
      'Main package from pricing sheet (2 photographers).',
      hours,
      [3710, 6070, 9030, 11990, 14950, 17910, 20870, 23830, 26790, 29750, 32710, 35670, 38630, 41590, 42630, 45590],
      [278, 455, 677, 899, 1121, 1343, 1565, 1787, 2009, 2231, 2453, 2675, 2897, 3119, 3197, 3419],
      [928, 1518, 2258, 2998, 3738, 4478, 5218, 5958, 6698, 7438, 8178, 8918, 9658, 10398, 10658, 11398],
      [4916, 8043, 11965, 15887, 19809, 23731, 27653, 31575, 35497, 39419, 43341, 47263, 51185, 55107, 56485, 60407],
      [4925, 8050, 11975, 15900, 19825, 23750, 27675, 31575, 35500, 39425, 43350, 47275, 51200, 55125, 56500, 60425],
    ),
    ...buildPackageSeries(
      'Cinematography | 1 Videographer',
      'Main package from pricing sheet (1 videographer).',
      hours,
      [6450, 7050, 8250, 9450, 10650, 11850, 13050, 14250, 15450, 16650, 17850, 19050, 20250, 21450, 22650, 23850],
      [484, 529, 619, 709, 799, 889, 979, 1069, 1159, 1249, 1339, 1429, 1519, 1609, 1699, 1789],
      [1613, 1763, 2063, 2363, 2663, 2963, 3263, 3563, 3863, 4163, 4463, 4763, 5063, 5363, 5663, 5963],
      [8546, 9341, 10931, 12521, 14111, 15701, 17291, 18881, 20471, 22061, 23651, 25241, 26831, 28421, 30011, 31601],
      [8550, 9350, 10950, 12525, 14125, 15725, 17300, 18900, 20475, 22075, 23675, 25250, 26850, 28425, 30025, 31625],
    ),
    ...buildPackageSeries(
      'Cinematography | 2 Videographers',
      'Main package from pricing sheet (2 videographers).',
      hours,
      [7250, 8650, 10650, 12650, 14650, 16650, 18650, 20650, 22650, 24650, 26650, 28650, 30650, 32650, 34650, 36650],
      [544, 649, 799, 949, 1099, 1249, 1399, 1549, 1699, 1849, 1999, 2149, 2299, 2449, 2599, 2749],
      [1813, 2163, 2663, 3163, 3663, 4163, 4663, 5163, 5663, 6163, 6663, 7163, 7663, 8163, 8663, 9163],
      [9606, 11461, 14111, 16761, 19411, 22061, 24711, 27361, 30011, 32661, 35311, 37961, 40611, 43261, 45911, 48561],
      [9625, 11475, 14125, 16775, 19425, 22075, 24725, 27375, 30025, 32675, 35325, 37975, 40625, 43275, 45925, 48575],
    ),
    ...buildPackageSeries(
      'Photography & Cinematography | 1 Photo + 1 Video',
      'Main package from pricing sheet (1 photographer and 1 videographer).',
      hours,
      [9000, 10800, 13800, 16800, 19800, 22800, 25800, 28800, 31800, 34800, 37800, 40800, 43800, 46800, 48600, 51600],
      [675, 810, 1035, 1260, 1485, 1710, 1935, 2160, 2385, 2610, 2835, 3060, 3285, 3510, 3645, 3870],
      [2250, 2700, 3450, 4200, 4950, 5700, 6450, 7200, 7950, 8700, 9450, 10200, 10950, 11700, 12150, 12900],
      [11925, 14310, 18285, 22260, 26235, 30210, 34185, 38160, 42135, 46110, 50085, 54060, 58035, 62010, 64395, 68370],
      [11925, 14325, 18300, 22275, 26250, 30225, 34200, 38175, 42150, 46125, 50100, 54075, 58050, 62025, 64400, 68375],
    ),
    ...buildPackageSeries(
      'Photography & Cinematography | 2 Photo + 2 Video',
      'Main package from pricing sheet (2 photographers and 2 videographers).',
      hours,
      [10960, 14720, 19680, 24640, 29600, 34560, 39520, 44480, 49440, 54400, 59360, 64320, 69280, 74240, 77280, 82240],
      [822, 1104, 1476, 1848, 2220, 2592, 2964, 3336, 3708, 4080, 4452, 4824, 5196, 5568, 5796, 6168],
      [2740, 3680, 4920, 6160, 7400, 8640, 9880, 11120, 12360, 13600, 14840, 16080, 17320, 18560, 19320, 20560],
      [14522, 19504, 26076, 32648, 39220, 45792, 52364, 58936, 65508, 72080, 78652, 85224, 91796, 98368, 102396, 108968],
      [14525, 19525, 26100, 32650, 39225, 45800, 52375, 58950, 65525, 72100, 78675, 85225, 91800, 98375, 102400, 108975],
    ),
  ]
}

function buildPackageSeries(
  title: string,
  description: string,
  hours: number[],
  labor: number[],
  admin: number[],
  commission: number[],
  costs: number[],
  prices: number[],
) {
  return hours.map((hour, index) => ({
    name: `${title} | ${hour} Hour${hour === 1 ? '' : 's'}`,
    description,
    cost: costs[index] ?? 0,
    price: prices[index] ?? 0,
    breakdown: {
      labor: labor[index] ?? 0,
      admin: admin[index] ?? 0,
      commission: commission[index] ?? 0,
      subtotal: costs[index] ?? 0,
    },
  }))
}

function sanitizeMoney(value: number) {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Number(value.toFixed(2)))
}

function createId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function readAll(): ProductServiceRecord[] {
  if (typeof window === 'undefined') return []

  const raw = window.localStorage.getItem(STORAGE_KEY)
  if (!raw) return []

  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []

    return parsed
      .map((item): ProductServiceRecord | null => {
        if (!item || typeof item !== 'object') return null
        const candidate = item as Partial<ProductServiceRecord>

        if (
          typeof candidate.id !== 'string'
          || typeof candidate.brandSlug !== 'string'
          || typeof candidate.name !== 'string'
          || typeof candidate.category !== 'string'
          || typeof candidate.description !== 'string'
          || typeof candidate.cost !== 'number'
          || typeof candidate.price !== 'number'
          || typeof candidate.isActive !== 'boolean'
          || typeof candidate.createdAt !== 'string'
          || typeof candidate.updatedAt !== 'string'
        ) {
          return null
        }

        if (!isCategory(candidate.category)) return null
        if (!isBrandSlug(candidate.brandSlug)) return null

        return {
          id: candidate.id,
          brandSlug: candidate.brandSlug,
          name: candidate.name,
          category: candidate.category,
          description: candidate.description,
          cost: candidate.cost,
          price: candidate.price,
          isActive: candidate.isActive,
          createdAt: candidate.createdAt,
          updatedAt: candidate.updatedAt,
        }
      })
      .filter((item): item is ProductServiceRecord => Boolean(item))
  } catch {
    return []
  }
}

function writeAll(items: ProductServiceRecord[]) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
}

function readMappings(): PackageLineItemMapping[] {
  if (typeof window === 'undefined') return []

  const raw = window.localStorage.getItem(MAPPING_STORAGE_KEY)
  if (!raw) return []

  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []

    return parsed
      .map((item): PackageLineItemMapping | null => {
        if (!item || typeof item !== 'object') return null
        const candidate = item as Partial<PackageLineItemMapping>
        if (
          typeof candidate.id !== 'string'
          || typeof candidate.brandSlug !== 'string'
          || typeof candidate.quoteLineItemLabel !== 'string'
          || typeof candidate.templateName !== 'string'
          || typeof candidate.createdAt !== 'string'
          || typeof candidate.updatedAt !== 'string'
        ) {
          return null
        }
        if (!isBrandSlug(candidate.brandSlug)) return null
        return {
          id: candidate.id,
          brandSlug: candidate.brandSlug,
          quoteLineItemLabel: candidate.quoteLineItemLabel,
          templateName: candidate.templateName,
          createdAt: candidate.createdAt,
          updatedAt: candidate.updatedAt,
        }
      })
      .filter((item): item is PackageLineItemMapping => Boolean(item))
  } catch {
    return []
  }
}

function writeMappings(items: PackageLineItemMapping[]) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(MAPPING_STORAGE_KEY, JSON.stringify(items))
}

function normalizeMappingLabel(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, ' ')
}

function parseImportBundle(payload: unknown): ProductsServicesExportBundle {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Invalid import file format')
  }

  const candidate = payload as Partial<ProductsServicesExportBundle>
  const items = Array.isArray(candidate.items) ? candidate.items : []
  const mappings = Array.isArray(candidate.mappings) ? candidate.mappings : []

  const parsedItems = items
    .map((item) => {
      if (!item || typeof item !== 'object') return null
      const entry = item as Partial<ProductsServicesExportBundle['items'][number]>
      if (
        typeof entry.name !== 'string'
        || typeof entry.category !== 'string'
        || typeof entry.description !== 'string'
        || typeof entry.cost !== 'number'
        || typeof entry.price !== 'number'
        || typeof entry.isActive !== 'boolean'
      ) {
        return null
      }

      if (!isCategory(entry.category)) return null

      return {
        name: entry.name,
        category: entry.category,
        description: entry.description,
        cost: entry.cost,
        price: entry.price,
        isActive: entry.isActive,
      }
    })
    .filter((item): item is ProductsServicesExportBundle['items'][number] => Boolean(item))

  const parsedMappings = mappings
    .map((item) => {
      if (!item || typeof item !== 'object') return null
      const entry = item as Partial<ProductsServicesExportBundle['mappings'][number]>
      if (typeof entry.quoteLineItemLabel !== 'string' || typeof entry.templateName !== 'string') {
        return null
      }
      return {
        quoteLineItemLabel: entry.quoteLineItemLabel,
        templateName: entry.templateName,
      }
    })
    .filter((item): item is ProductsServicesExportBundle['mappings'][number] => Boolean(item))

  return {
    version: 1,
    exportedAt: typeof candidate.exportedAt === 'string' ? candidate.exportedAt : new Date().toISOString(),
    brandSlug: isBrandSlug(String(candidate.brandSlug ?? '')) ? String(candidate.brandSlug) as BrandSlug : 'amo',
    items: parsedItems,
    mappings: parsedMappings,
  }
}

function isCategory(value: string): value is ProductServiceCategory {
  return value === 'package' || value === 'service' || value === 'addon' || value === 'product'
}

function isBrandSlug(value: string): value is BrandSlug {
  return value === 'amo' || value === 'csp'
}

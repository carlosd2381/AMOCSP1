import { Document, Image, Page, StyleSheet, Text, View, pdf } from '@react-pdf/renderer'

export interface PdfBranding {
  label: string
  logoUrl?: string
  companyDetails?: {
    legalBusinessName?: string
    displayName?: string
    taxId?: string
    registrationNumber?: string
    supportEmail?: string
    supportPhone?: string
    website?: string
    addressLine1?: string
    addressLine2?: string
    city?: string
    stateProvince?: string
    postalCode?: string
    country?: string
    headerNote?: string
  }
}

export interface ProposalPdfLine {
  description: string
  quantity: number
  unitPrice: number
  lineTotal: number
}

export interface ProposalPdfTax {
  label: string
  amount: number
}

export interface ProposalPdfInput {
  proposalId: string
  updatedAt: string
  validUntil?: string | null
  currency: string
  clientName: string
  clientEmail?: string
  eventTitle?: string
  eventDate?: string | null
  lines: ProposalPdfLine[]
  taxes: ProposalPdfTax[]
  subtotal: number
  total: number
  branding: PdfBranding
}

export interface InvoicePdfLine {
  description: string
  amount: number
}

export interface InvoicePdfInput {
  invoiceNumber: string
  status: string
  issuedAt?: string | null
  dueDate?: string | null
  currency: string
  clientName: string
  clientEmail?: string
  eventTitle?: string
  lines: InvoicePdfLine[]
  total: number
  amountDue: number
  branding: PdfBranding
}

export interface ContractPdfInput {
  contractId: string
  status: string
  updatedAt: string
  signedAt?: string | null
  clientName: string
  clientEmail?: string
  eventTitle?: string
  eventDate?: string | null
  bodyHtml: string
  branding: PdfBranding
}

const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontFamily: 'Helvetica',
    fontSize: 10,
    color: '#333333',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 34,
  },
  headerLeft: {
    flexDirection: 'column',
  },
  title: {
    fontSize: 24,
    fontFamily: 'Times-Roman',
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  company: {
    fontSize: 12,
    fontWeight: 700,
    textTransform: 'uppercase',
    marginBottom: 3,
  },
  companyInfo: {
    fontSize: 9,
    color: '#666666',
    marginBottom: 2,
  },
  logoWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#f5f0eb',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  logo: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  },
  badge: {
    fontSize: 9,
    color: '#6b7280',
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  infoCol: {
    width: '45%',
  },
  infoLabel: {
    fontSize: 10,
    fontWeight: 700,
    textTransform: 'uppercase',
    color: '#4b5563',
    marginBottom: 8,
  },
  infoValue: {
    fontSize: 9,
    color: '#4b5563',
    marginBottom: 3,
  },
  infoValueStrong: {
    fontSize: 10,
    color: '#111827',
    marginBottom: 4,
    fontWeight: 700,
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#f5f0eb',
    paddingVertical: 8,
    paddingHorizontal: 6,
    marginBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#dddddd',
  },
  tableHeaderText: {
    fontSize: 9,
    color: '#555555',
    textTransform: 'uppercase',
    fontWeight: 700,
  },
  row: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#eeeeee',
    paddingVertical: 8,
    paddingHorizontal: 6,
  },
  colNo: { width: '10%', textAlign: 'center' },
  colDescProposal: { width: '55%' },
  colDesc: { width: '55%' },
  colDescInvoice: { width: '60%' },
  colQty: { width: '15%', textAlign: 'center' },
  colPrice: { width: '15%', textAlign: 'right' },
  colAmt: { width: '15%', textAlign: 'right' },
  colAmtInvoice: { width: '30%', textAlign: 'right' },
  textRight: {
    textAlign: 'right',
  },
  textCenter: {
    textAlign: 'center',
  },
  sectionSplit: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 18,
  },
  termsBox: {
    width: '55%',
    borderWidth: 1,
    borderColor: '#dddddd',
    padding: 10,
  },
  termsTitle: {
    fontSize: 9,
    fontWeight: 700,
    textTransform: 'uppercase',
    textAlign: 'center',
    backgroundColor: '#f5f0eb',
    paddingVertical: 4,
    marginBottom: 8,
  },
  termsText: {
    fontSize: 8,
    lineHeight: 1.35,
    color: '#666666',
    marginBottom: 6,
  },
  totals: {
    width: '40%',
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: '#eeeeee',
    paddingVertical: 6,
  },
  totalLabel: {
    fontSize: 9,
    fontWeight: 700,
    textTransform: 'uppercase',
  },
  totalFinal: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#f5f0eb',
    marginTop: 5,
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  signatureRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 40,
  },
  signatureBlock: {
    width: '30%',
  },
  signatureLine: {
    borderBottomWidth: 1,
    borderBottomColor: '#333333',
    marginBottom: 4,
    minHeight: 16,
  },
  signatureLabel: {
    fontSize: 9,
    color: '#666666',
  },
  thankYou: {
    marginTop: 20,
    textAlign: 'center',
    fontSize: 8,
    textTransform: 'uppercase',
    letterSpacing: 2,
    backgroundColor: '#f5f0eb',
    paddingVertical: 6,
  },
  noteBox: {
    marginTop: 18,
    borderWidth: 1,
    borderColor: '#dddddd',
    padding: 10,
    backgroundColor: '#f8fafc',
  },
  noteTitle: {
    fontSize: 9,
    fontWeight: 700,
    textTransform: 'uppercase',
    marginBottom: 6,
    color: '#374151',
  },
  noteText: {
    fontSize: 8,
    lineHeight: 1.35,
    color: '#4b5563',
    marginBottom: 4,
  },
  invoiceTotals: {
    marginTop: 20,
    width: '40%',
    alignSelf: 'flex-end',
  },
  contractBodyLine: {
    marginBottom: 6,
    lineHeight: 1.45,
    fontSize: 10,
    textAlign: 'justify',
  },
  contractSection: {
    marginBottom: 24,
  },
  contractSectionTitle: {
    fontSize: 11,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 8,
  },
  contractIntro: {
    fontSize: 9,
    color: '#4b5563',
    lineHeight: 1.4,
    marginBottom: 10,
  },
  eventMetaBox: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#f9fafb',
    padding: 12,
    marginBottom: 18,
  },
  continuationHeader: {
    fontSize: 10,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 10,
    color: '#374151',
  },
  footer: {
    position: 'absolute',
    bottom: 24,
    left: 40,
    right: 40,
    borderTopWidth: 1,
    borderTopColor: '#dddddd',
    paddingTop: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  footerText: {
    fontSize: 8,
    color: '#666666',
  },
  footerPage: {
    fontSize: 8,
    color: '#666666',
  },
})

function money(value: number, currency: string) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(value)
}

function dateText(value?: string | null) {
  if (!value) return 'N/A'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
}

function buildCompanyHeader(input: PdfBranding) {
  const details = input.companyDetails
  const displayName = details?.displayName?.trim() || details?.legalBusinessName?.trim() || input.label

  const addressParts = [
    details?.addressLine1?.trim(),
    details?.addressLine2?.trim(),
    [details?.city?.trim(), details?.stateProvince?.trim()].filter(Boolean).join(', '),
    [details?.postalCode?.trim(), details?.country?.trim()].filter(Boolean).join(' '),
  ].filter(Boolean) as string[]

  const contactParts = [details?.supportEmail?.trim(), details?.supportPhone?.trim(), details?.website?.trim()].filter(Boolean) as string[]

  const complianceParts = [
    details?.taxId?.trim() ? `Tax ID: ${details.taxId.trim()}` : null,
    details?.registrationNumber?.trim() ? `Reg #: ${details.registrationNumber.trim()}` : null,
  ].filter(Boolean) as string[]

  const note = details?.headerNote?.trim() || null

  return {
    displayName,
    infoLines: [...addressParts, ...contactParts, ...complianceParts],
    note,
  }
}

function stripHtmlToLines(html: string): string[] {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/h[1-6]>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
}

function chunkLines(lines: string[], size: number): string[][] {
  if (lines.length === 0) return [[]]
  const chunks: string[][] = []
  for (let index = 0; index < lines.length; index += size) {
    chunks.push(lines.slice(index, index + size))
  }
  return chunks
}

function paginateByUnitsWithReservedFinal<T>(
  items: T[],
  getUnits: (item: T) => number,
  firstPageUnits: number,
  middlePageUnits: number,
  finalPageUnits: number,
): T[][] {
  if (items.length === 0) return [[]]

  const pages: T[][] = []
  let current: T[] = []
  let currentUnits = 0

  for (let index = 0; index < items.length; index += 1) {
    const item = items[index]
    const itemUnits = Math.max(1, getUnits(item))
    const isFirstPage = pages.length === 0
    const capacity = isFirstPage ? firstPageUnits : middlePageUnits

    const remainingItems = items.slice(index)
    const remainingUnits = remainingItems.reduce((sum, value) => sum + Math.max(1, getUnits(value)), 0)

    if (remainingUnits <= finalPageUnits) {
      if (current.length > 0) {
        pages.push(current)
      }
      pages.push(remainingItems)
      return pages
    }

    if (current.length > 0 && currentUnits + itemUnits > capacity) {
      pages.push(current)
      current = [item]
      currentUnits = itemUnits
      continue
    }

    current.push(item)
    currentUnits += itemUnits
  }

  if (current.length > 0) {
    pages.push(current)
  }

  return pages
}

function estimateLineUnits(description: string) {
  const normalizedLength = description.trim().length
  if (normalizedLength <= 60) return 1
  if (normalizedLength <= 120) return 2
  if (normalizedLength <= 180) return 3
  return 4
}

function ProposalPdfDocument({ input }: { input: ProposalPdfInput }) {
  const companyHeader = buildCompanyHeader(input.branding)
  const linePages = paginateByUnitsWithReservedFinal(
    input.lines,
    (line) => estimateLineUnits(line.description),
    24,
    40,
    20,
  )

  return (
    <Document>
      {linePages.map((lines, pageIndex) => {
        const isFirstPage = pageIndex === 0
        const isLastPage = pageIndex === linePages.length - 1

        return (
          <Page key={`proposal-page-${pageIndex + 1}`} size="A4" style={styles.page}>
            {isFirstPage ? (
              <View style={styles.header}>
                <View style={styles.headerLeft}>
                  <Text style={styles.title}>Price Quote</Text>
                  <Text style={styles.company}>{companyHeader.displayName}</Text>
                  {companyHeader.infoLines.map((line) => (
                    <Text key={`proposal-header-${line}`} style={styles.companyInfo}>{line}</Text>
                  ))}
                  {companyHeader.note ? <Text style={styles.companyInfo}>{companyHeader.note}</Text> : null}
                  <Text style={styles.badge}>Quote #{input.proposalId.slice(0, 8).toUpperCase()}</Text>
                </View>
                <View style={styles.logoWrap}>
                  {input.branding.logoUrl ? <Image src={input.branding.logoUrl} style={styles.logo} /> : <Text style={styles.badge}>LOGO</Text>}
                </View>
              </View>
            ) : (
              <Text style={styles.continuationHeader}>Price Quote - Continued</Text>
            )}

            {isFirstPage ? (
              <View style={styles.infoRow}>
                <View style={styles.infoCol}>
                  <Text style={styles.infoLabel}>Bill To</Text>
                  <Text style={styles.infoValueStrong}>{input.clientName}</Text>
                  <Text style={styles.infoValue}>{input.clientEmail ?? 'No email'}</Text>
                  <Text style={styles.infoValue}>{input.eventTitle ?? 'Event TBD'}</Text>
                  <Text style={styles.infoValue}>{dateText(input.eventDate)}</Text>
                </View>
                <View style={styles.infoCol}>
                  <Text style={styles.infoLabel}>Quote Details</Text>
                  <Text style={styles.infoValue}>Updated: {dateText(input.updatedAt)}</Text>
                  <Text style={styles.infoValue}>Valid Until: {dateText(input.validUntil)}</Text>
                  <Text style={styles.infoValue}>Currency: {input.currency}</Text>
                </View>
              </View>
            ) : null}

            <View style={styles.tableHeader}>
              <Text style={[styles.tableHeaderText, styles.colDescProposal]}>Description</Text>
              <Text style={[styles.tableHeaderText, styles.colQty]}>Qty</Text>
              <Text style={[styles.tableHeaderText, styles.colPrice, styles.textRight]}>Price</Text>
              <Text style={[styles.tableHeaderText, styles.colAmt, styles.textRight]}>Amount</Text>
            </View>
            {lines.map((line, lineIndex) => (
              <View key={`${pageIndex + 1}-${line.description}-${lineIndex}`} style={styles.row} wrap={false}>
                <Text style={styles.colDescProposal}>{line.description}</Text>
                <Text style={styles.colQty}>{line.quantity}</Text>
                <Text style={styles.colPrice}>{money(line.unitPrice, input.currency)}</Text>
                <Text style={styles.colAmt}>{money(line.lineTotal, input.currency)}</Text>
              </View>
            ))}

            {isLastPage ? (
              <>
                <View style={styles.sectionSplit}>
                  <View style={styles.termsBox}>
                    <Text style={styles.termsTitle}>Terms & Conditions</Text>
                    <Text style={styles.termsText}>
                      This quote is an estimate based on the event details provided and is subject to the service agreement.
                    </Text>
                    <Text style={styles.termsText}>
                      Final pricing may vary if guest count, service time, location, or selected deliverables change.
                    </Text>
                    <Text style={styles.termsText}>
                      Booking is confirmed only once the agreement is signed and the required retainer is received.
                    </Text>
                  </View>

                  <View style={styles.totals}>
                    <View style={styles.totalRow}>
                      <Text style={styles.totalLabel}>Subtotal</Text>
                      <Text>{money(input.subtotal, input.currency)}</Text>
                    </View>
                    {input.taxes.map((tax) => (
                      <View key={tax.label} style={styles.totalRow}>
                        <Text style={styles.totalLabel}>{tax.label}</Text>
                        <Text>{money(tax.amount, input.currency)}</Text>
                      </View>
                    ))}
                    <View style={styles.totalFinal}>
                      <Text style={styles.totalLabel}>Amount Due</Text>
                      <Text>{money(input.total, input.currency)}</Text>
                    </View>
                  </View>
                </View>

                <Text style={styles.thankYou}>Thank you for your business</Text>
              </>
            ) : null}

            <View style={styles.footer}>
              <Text style={styles.footerText}>Quote ID {input.proposalId.slice(0, 8).toUpperCase()}</Text>
              <Text style={styles.footerPage}>Page {pageIndex + 1} of {linePages.length}</Text>
            </View>
          </Page>
        )
      })}
    </Document>
  )
}

function InvoicePdfDocument({ input }: { input: InvoicePdfInput }) {
  const companyHeader = buildCompanyHeader(input.branding)
  const linePages = paginateByUnitsWithReservedFinal(
    input.lines,
    (line) => estimateLineUnits(line.description),
    22,
    36,
    16,
  )

  return (
    <Document>
      {linePages.map((lines, pageIndex) => {
        const isFirstPage = pageIndex === 0
        const isLastPage = pageIndex === linePages.length - 1
        const lineNumberOffset = linePages.slice(0, pageIndex).reduce((sum, page) => sum + page.length, 0)

        return (
          <Page key={`invoice-page-${pageIndex + 1}`} size="A4" style={styles.page}>
            {isFirstPage ? (
              <View style={styles.header}>
                <View style={styles.headerLeft}>
                  <Text style={styles.title}>Invoice</Text>
                  <Text style={styles.company}>{companyHeader.displayName}</Text>
                  <Text style={styles.companyInfo}>Billing Statement</Text>
                  {companyHeader.infoLines.map((line) => (
                    <Text key={`invoice-header-${line}`} style={styles.companyInfo}>{line}</Text>
                  ))}
                  {companyHeader.note ? <Text style={styles.companyInfo}>{companyHeader.note}</Text> : null}
                  <Text style={styles.badge}>{input.invoiceNumber}</Text>
                </View>
                <View style={styles.logoWrap}>
                  {input.branding.logoUrl ? <Image src={input.branding.logoUrl} style={styles.logo} /> : <Text style={styles.badge}>LOGO</Text>}
                </View>
              </View>
            ) : (
              <Text style={styles.continuationHeader}>Invoice - Continued</Text>
            )}

            {isFirstPage ? (
              <View style={styles.infoRow}>
                <View style={styles.infoCol}>
                  <Text style={styles.infoLabel}>Bill To</Text>
                  <Text style={styles.infoValueStrong}>{input.clientName}</Text>
                  <Text style={styles.infoValue}>{input.clientEmail ?? 'No email'}</Text>
                  <Text style={styles.infoValue}>{input.eventTitle ?? 'Event'}</Text>
                </View>
                <View style={styles.infoCol}>
                  <Text style={styles.infoLabel}>Invoice Details</Text>
                  <Text style={styles.infoValue}>Issued: {dateText(input.issuedAt)}</Text>
                  <Text style={styles.infoValue}>Due: {dateText(input.dueDate)}</Text>
                  <Text style={styles.infoValue}>Status: {input.status}</Text>
                </View>
              </View>
            ) : null}

            <View style={styles.tableHeader}>
              <Text style={[styles.tableHeaderText, styles.colNo, styles.textCenter]}>No</Text>
              <Text style={[styles.tableHeaderText, styles.colDescInvoice]}>Description</Text>
              <Text style={[styles.tableHeaderText, styles.colAmtInvoice, styles.textRight]}>Amount</Text>
            </View>
            {lines.map((line, lineIndex) => (
              <View key={`${pageIndex + 1}-${line.description}-${lineIndex}`} style={styles.row} wrap={false}>
                <Text style={styles.colNo}>{lineNumberOffset + lineIndex + 1}</Text>
                <Text style={styles.colDescInvoice}>{line.description}</Text>
                <Text style={styles.colAmtInvoice}>{money(line.amount, input.currency)}</Text>
              </View>
            ))}

            {isLastPage ? (
              <>
                <View style={styles.invoiceTotals}>
                  <View style={styles.totalRow}>
                    <Text style={styles.totalLabel}>Total</Text>
                    <Text>{money(input.total, input.currency)}</Text>
                  </View>
                  <View style={styles.totalFinal}>
                    <Text style={styles.totalLabel}>Amount Due</Text>
                    <Text>{money(input.amountDue, input.currency)}</Text>
                  </View>
                </View>

                <View style={styles.noteBox}>
                  <Text style={styles.noteTitle}>Payment Terms</Text>
                  <Text style={styles.noteText}>Please remit payment by the due date listed above to avoid service delays.</Text>
                  <Text style={styles.noteText}>A late fee may apply to balances that remain unpaid after the due date.</Text>
                  <Text style={styles.noteText}>Questions about this invoice can be sent to the project coordinator on file.</Text>
                </View>

                <Text style={styles.thankYou}>Thank you for your business</Text>
              </>
            ) : null}

            <View style={styles.footer}>
              <Text style={styles.footerText}>{input.invoiceNumber}</Text>
              <Text style={styles.footerPage}>Page {pageIndex + 1} of {linePages.length}</Text>
            </View>
          </Page>
        )
      })}
    </Document>
  )
}

function ContractPdfDocument({ input }: { input: ContractPdfInput }) {
  const companyHeader = buildCompanyHeader(input.branding)
  const bodyLines = stripHtmlToLines(input.bodyHtml)
  const pages = chunkLines(bodyLines, 28)

  return (
    <Document>
      {pages.map((lines, pageIndex) => {
        const isFirstPage = pageIndex === 0
        const isLastPage = pageIndex === pages.length - 1

        return (
          <Page key={`contract-page-${pageIndex + 1}`} size="A4" style={styles.page}>
            {isFirstPage ? (
              <View style={styles.header}>
                <View style={styles.headerLeft}>
                  <Text style={styles.title}>Service Contract</Text>
                  <Text style={styles.company}>{companyHeader.displayName}</Text>
                  <Text style={styles.companyInfo}>Agreement</Text>
                  {companyHeader.infoLines.map((line) => (
                    <Text key={`contract-header-${line}`} style={styles.companyInfo}>{line}</Text>
                  ))}
                  {companyHeader.note ? <Text style={styles.companyInfo}>{companyHeader.note}</Text> : null}
                  <Text style={styles.badge}>Contract ID {input.contractId.slice(0, 8).toUpperCase()}</Text>
                </View>
                <View style={styles.logoWrap}>
                  {input.branding.logoUrl ? <Image src={input.branding.logoUrl} style={styles.logo} /> : <Text style={styles.badge}>LOGO</Text>}
                </View>
              </View>
            ) : (
              <Text style={styles.continuationHeader}>Service Contract - Continued</Text>
            )}

            {isFirstPage ? (
              <>
                <View style={styles.contractSection}>
                  <View style={styles.infoRow}>
                    <View style={styles.infoCol}>
                      <Text style={styles.infoLabel}>Contract Between</Text>
                      <Text style={styles.infoValueStrong}>{input.clientName}</Text>
                      <Text style={styles.infoValue}>{input.clientEmail ?? 'No email'}</Text>
                    </View>
                    <View style={styles.infoCol}>
                      <Text style={styles.infoLabel}>Service Provider</Text>
                      <Text style={styles.infoValueStrong}>{companyHeader.displayName}</Text>
                    </View>
                  </View>
                </View>

                <View style={styles.contractSection}>
                  <Text style={styles.contractSectionTitle}>Event Information</Text>
                  <View style={styles.eventMetaBox}>
                    <Text style={styles.infoValue}>Event: {input.eventTitle ?? 'Event TBD'}</Text>
                    <Text style={styles.infoValue}>Event Date: {dateText(input.eventDate)}</Text>
                    <Text style={styles.infoValue}>Updated: {dateText(input.updatedAt)}</Text>
                    <Text style={styles.infoValue}>Status: {input.status}</Text>
                    <Text style={styles.infoValue}>Signed: {dateText(input.signedAt)}</Text>
                  </View>
                </View>

                <Text style={styles.contractIntro}>
                  This agreement outlines the event services to be delivered, the payment terms, and responsibilities of both parties.
                </Text>
              </>
            ) : null}

            <View style={styles.contractSection}>
              <Text style={styles.contractSectionTitle}>Terms & Conditions</Text>
              {lines.map((line, index) => (
                <Text key={`${pageIndex + 1}-${index + 1}-${line.slice(0, 12)}`} style={styles.contractBodyLine}>{line}</Text>
              ))}
            </View>

            {isLastPage ? (
              <View style={styles.signatureRow}>
                <View style={styles.signatureBlock}>
                  <View style={styles.signatureLine}>
                    <Text>{input.clientName}</Text>
                  </View>
                  <Text style={styles.signatureLabel}>Client Signature</Text>
                </View>
                <View style={styles.signatureBlock}>
                  <View style={styles.signatureLine}>
                    <Text>{companyHeader.displayName}</Text>
                  </View>
                  <Text style={styles.signatureLabel}>Provider Signature</Text>
                </View>
                <View style={styles.signatureBlock}>
                  <View style={styles.signatureLine}>
                    <Text>{dateText(input.signedAt || input.updatedAt)}</Text>
                  </View>
                  <Text style={styles.signatureLabel}>Date</Text>
                </View>
              </View>
            ) : null}

            <View style={styles.footer}>
              <Text style={styles.footerText}>Document ID {input.contractId.slice(0, 8).toUpperCase()} • Status {input.status.toUpperCase()}</Text>
              <Text style={styles.footerPage}>Page {pageIndex + 1} of {pages.length}</Text>
            </View>
          </Page>
        )
      })}
    </Document>
  )
}

export async function createProposalPdfBlob(input: ProposalPdfInput) {
  return pdf(<ProposalPdfDocument input={input} />).toBlob()
}

export async function createInvoicePdfBlob(input: InvoicePdfInput) {
  return pdf(<InvoicePdfDocument input={input} />).toBlob()
}

export async function createContractPdfBlob(input: ContractPdfInput) {
  return pdf(<ContractPdfDocument input={input} />).toBlob()
}

export function openPdfBlob(blob: Blob) {
  const url = URL.createObjectURL(blob)
  window.open(url, '_blank', 'noopener,noreferrer')
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

export function downloadPdfBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

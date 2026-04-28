import { useNavigate } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { Card } from '@/components/ui/Card'

export function InvoiceBuilderPage() {
  const navigate = useNavigate()

  return (
    <div className="space-y-4">
      <Card
        className="p-4"
        title={<h2 className="text-xl font-semibold text-white">Invoice Builder / Sender</h2>}
      >
        <p className="text-sm text-brand-muted">
          Invoices are currently generated from accepted quotes and managed from each lead financial profile.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            className="btn-compact-primary"
            onClick={() => navigate('/quotes')}
          >
            <span>Open Quotes List</span>
            <ArrowRight size={14} />
          </button>
          <button
            type="button"
            className="btn-compact-secondary"
            onClick={() => navigate('/invoices')}
          >
            Back to Invoices List
          </button>
        </div>
      </Card>
    </div>
  )
}

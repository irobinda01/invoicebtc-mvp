'use client'

import type { InvoiceStatus, MilestoneStatus } from '@/lib/types'
import { cn } from '@/lib/ui'

const INVOICE_COLORS: Record<InvoiceStatus, string> = {
  draft: 'border-white/10 bg-white/[0.05] text-white',
  'merchant-signed': 'border-[rgba(228,177,92,0.25)] bg-[rgba(228,177,92,0.14)] text-[#f3d39b]',
  'client-signed': 'border-[rgba(109,157,247,0.28)] bg-[rgba(109,157,247,0.14)] text-[#bdd0ff]',
  'escrow-funded': 'border-[rgba(109,157,247,0.32)] bg-[rgba(109,157,247,0.16)] text-[#d7e3ff]',
  active: 'border-[rgba(67,173,139,0.28)] bg-[rgba(67,173,139,0.14)] text-[#bfe9d9]',
  matured: 'border-[rgba(214,163,74,0.28)] bg-[rgba(214,163,74,0.12)] text-[#efdaa9]',
  dispute: 'border-[rgba(200,93,99,0.32)] bg-[rgba(200,93,99,0.14)] text-[#f0bec1]',
  completed: 'border-[rgba(67,173,139,0.32)] bg-[rgba(67,173,139,0.18)] text-[#d8f8ea]',
  cancelled: 'border-white/10 bg-white/[0.04] text-[var(--text-secondary)]',
}

const INVOICE_LABELS: Record<InvoiceStatus, string> = {
  draft: 'Draft',
  'merchant-signed': 'Merchant signed',
  'client-signed': 'Client signed',
  'escrow-funded': 'Escrow funded',
  active: 'Active',
  matured: 'Matured',
  dispute: 'In dispute',
  completed: 'Completed',
  cancelled: 'Cancelled',
}

const MILESTONE_COLORS: Record<MilestoneStatus, string> = {
  pending: 'border-white/10 bg-white/[0.04] text-[var(--text-secondary)]',
  funded: 'border-[rgba(228,177,92,0.28)] bg-[rgba(228,177,92,0.14)] text-[#f3d39b]',
  submitted: 'border-[rgba(214,163,74,0.28)] bg-[rgba(214,163,74,0.12)] text-[#efdba6]',
  approved: 'border-[rgba(109,157,247,0.28)] bg-[rgba(109,157,247,0.14)] text-[#d7e3ff]',
  disputed: 'border-[rgba(200,93,99,0.32)] bg-[rgba(200,93,99,0.14)] text-[#f0bec1]',
  settled: 'border-[rgba(67,173,139,0.32)] bg-[rgba(67,173,139,0.14)] text-[#c9f2e1]',
  cancelled: 'border-white/10 bg-white/[0.04] text-[var(--text-secondary)]',
}

const MILESTONE_LABELS: Record<MilestoneStatus, string> = {
  pending: 'Pending',
  funded: 'Funded',
  submitted: 'Proof submitted',
  approved: 'Approved',
  disputed: 'Disputed',
  settled: 'Settled',
  cancelled: 'Cancelled',
}

export function StatusBadge({ status }: { status: InvoiceStatus }) {
  return (
    <span className={cn('inline-flex rounded-full border px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em]', INVOICE_COLORS[status])}>
      {INVOICE_LABELS[status]}
    </span>
  )
}

export function MilestoneStateBadge({ status }: { status: MilestoneStatus }) {
  return (
    <span className={cn('inline-flex rounded-full border px-3 py-1 text-xs font-medium', MILESTONE_COLORS[status])}>
      {MILESTONE_LABELS[status]}
    </span>
  )
}

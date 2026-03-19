'use client'

import type { InvoiceStatus, MilestoneStatus } from '@/lib/types'

const INVOICE_COLORS: Record<InvoiceStatus, string> = {
  draft: 'bg-gray-700 text-gray-200',
  'merchant-signed': 'bg-yellow-900 text-yellow-300',
  'client-signed': 'bg-yellow-800 text-yellow-200',
  'escrow-funded': 'bg-blue-900 text-blue-300',
  active: 'bg-green-900 text-green-300',
  matured: 'bg-emerald-900 text-emerald-300',
  dispute: 'bg-red-900 text-red-300',
  completed: 'bg-emerald-900 text-emerald-300',
  cancelled: 'bg-gray-800 text-gray-400',
}

const INVOICE_LABELS: Record<InvoiceStatus, string> = {
  draft: 'Draft',
  'merchant-signed': 'Partially Signed',
  'client-signed': 'Fully Signed',
  'escrow-funded': 'Escrow Funded',
  active: 'Active',
  matured: 'Matured',
  dispute: 'In Dispute',
  completed: 'Completed',
  cancelled: 'Cancelled',
}

const MILESTONE_COLORS: Record<MilestoneStatus, string> = {
  pending: 'bg-gray-700 text-gray-300',
  funded: 'bg-amber-900 text-amber-300',
  submitted: 'bg-yellow-900 text-yellow-300',
  approved: 'bg-blue-900 text-blue-300',
  disputed: 'bg-red-900 text-red-300',
  settled: 'bg-emerald-900 text-emerald-300',
  cancelled: 'bg-gray-800 text-gray-400',
}

const MILESTONE_LABELS: Record<MilestoneStatus, string> = {
  pending: 'Pending',
  funded: 'Funded',
  submitted: 'Submitted',
  approved: 'Approved',
  disputed: 'Disputed',
  settled: 'Settled',
  cancelled: 'Cancelled',
}

export function StatusBadge({ status }: { status: InvoiceStatus }) {
  return (
    <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-semibold uppercase tracking-wide ${INVOICE_COLORS[status]}`}>
      {INVOICE_LABELS[status]}
    </span>
  )
}

export function MilestoneStateBadge({ status }: { status: MilestoneStatus }) {
  return (
    <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${MILESTONE_COLORS[status]}`}>
      {MILESTONE_LABELS[status]}
    </span>
  )
}

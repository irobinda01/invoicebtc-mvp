'use client'

import type { MilestoneStatus } from '@/lib/types'
import { cn } from '@/lib/ui'

const FLOW = [
  { key: 'draft', label: 'Drafted' },
  { key: 'signed', label: 'Signed' },
  { key: 'escrow', label: 'Escrow funded' },
  { key: 'advance', label: 'LP advance' },
  { key: 'proof', label: 'Proof submitted' },
  { key: 'approval', label: 'Client approval' },
  { key: 'settlement', label: 'Settlement' },
] as const

function progressIndex(status: MilestoneStatus) {
  switch (status) {
    case 'pending':
      return 2
    case 'funded':
      return 3
    case 'submitted':
      return 4
    case 'approved':
      return 5
    case 'settled':
      return 6
    case 'disputed':
      return 4
    case 'cancelled':
      return 1
    default:
      return 0
  }
}

export function MilestoneTimeline({ status }: { status: MilestoneStatus }) {
  const activeIndex = progressIndex(status)

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-7">
      {FLOW.map((item, index) => {
        const active = index <= activeIndex
        const current = index === activeIndex
        return (
          <div key={item.key} className="flex items-center gap-3 rounded-[var(--radius-md)] border border-white/6 bg-white/[0.02] px-3 py-3">
            <div
              className={cn(
                'flex h-8 w-8 items-center justify-center rounded-full border text-xs font-semibold',
                active ? 'border-[rgba(228,177,92,0.42)] bg-[rgba(228,177,92,0.18)] text-white' : 'border-white/10 text-[var(--text-muted)]',
                current && 'shadow-[0_0_0_6px_rgba(228,177,92,0.08)]',
              )}
            >
              {index + 1}
            </div>
            <span className={cn('text-sm', active ? 'text-white' : 'text-[var(--text-muted)]')}>{item.label}</span>
          </div>
        )
      })}
    </div>
  )
}

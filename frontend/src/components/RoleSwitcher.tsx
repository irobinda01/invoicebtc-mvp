'use client'

import type { Role } from '@/lib/types'
import { cn } from '@/lib/ui'

const ROLE_COPY: Record<Role, string> = {
  merchant: 'Creating invoices and submitting milestone proof',
  client: 'Reviewing, signing, funding escrow, and approving work',
  lp: 'Providing staged liquidity and receiving settlement from escrow',
  observer: 'Viewing the workflow without taking on-chain actions',
}

export function RoleSwitcher({
  selectedRole,
  setSelectedRole,
  compact = false,
}: {
  selectedRole: Role
  setSelectedRole: (role: Role) => void
  compact?: boolean
}) {
  return (
    <div className={cn('space-y-3', compact && 'space-y-2')}>
      <div className="flex flex-wrap gap-2">
        {(['merchant', 'client', 'lp', 'observer'] as const).map((role) => (
          <button
            key={role}
            type="button"
            onClick={() => setSelectedRole(role)}
            className={cn(
              'rounded-full border px-3 py-2 text-sm font-medium capitalize transition',
              selectedRole === role
                ? 'border-[rgba(228,177,92,0.55)] bg-[rgba(228,177,92,0.14)] text-white'
                : 'border-white/10 bg-white/[0.03] text-[var(--text-secondary)] hover:border-white/20 hover:text-white',
            )}
          >
            {role}
          </button>
        ))}
      </div>
      {!compact && <p className="text-sm text-[var(--text-secondary)]">{ROLE_COPY[selectedRole]}</p>}
    </div>
  )
}

'use client'

import { explorerTxUrl } from '@/lib/config'
import { cn } from '@/lib/ui'
import type { TxStage } from '@/lib/useTxStatus'

interface Props {
  txId: string | null
  error: string | null
  loading: boolean
  /** Optional stage for richer status messages. Falls back to loading/txId/error. */
  stage?: TxStage
  label?: string
}

const STAGE_MESSAGES: Record<TxStage, { heading: string; body: string }> = {
  idle: { heading: '', body: '' },
  'awaiting-wallet': {
    heading: 'Awaiting Leather approval',
    body: 'Review the transaction details in Leather, then approve to broadcast on Stacks testnet.',
  },
  submitted: {
    heading: 'Transaction submitted',
    body: 'The transaction is in the mempool. The app is polling testnet and will update automatically once it confirms.',
  },
  confirmed: {
    heading: 'Transaction confirmed',
    body: 'The transaction is now confirmed on Stacks testnet and the UI can safely reflect the updated contract state.',
  },
  error: {
    heading: 'Transaction failed',
    body: '',
  },
}

export function TxResult({ txId, error, loading, stage, label = 'Transaction' }: Props) {
  // Derive effective stage from legacy props when stage is not explicitly provided.
  const effectiveStage: TxStage =
    stage ??
    (loading ? 'awaiting-wallet' : txId ? 'submitted' : error ? 'error' : 'idle')

  if (effectiveStage === 'idle') return null

  if (effectiveStage === 'awaiting-wallet') {
    return (
      <div className="mt-4 rounded-[var(--radius-md)] border border-[rgba(228,177,92,0.22)] bg-[rgba(228,177,92,0.08)] p-4 text-sm text-[#f1d59f]">
        <div className="flex items-center gap-3">
          <div className="h-4 w-4 flex-none rounded-full border-2 border-[var(--accent)] border-t-transparent animate-spin" />
          <div>
            <p className="font-medium text-white">{STAGE_MESSAGES['awaiting-wallet'].heading}</p>
            <p className="mt-1 text-sm text-[#ead5ac]">{STAGE_MESSAGES['awaiting-wallet'].body}</p>
          </div>
        </div>
      </div>
    )
  }

  if (effectiveStage === 'error' || error) {
    return (
      <div className="mt-4 rounded-[var(--radius-md)] border border-[rgba(200,93,99,0.34)] bg-[rgba(200,93,99,0.1)] p-4 text-sm text-[#f2c4c7]">
        <p className="font-medium text-white">{label} failed</p>
        <p className="mt-1">{error ?? 'The Leather request could not be completed.'}</p>
      </div>
    )
  }

  if (effectiveStage === 'submitted' && txId) {
    return (
      <div className="mt-4 rounded-[var(--radius-md)] border border-[rgba(67,173,139,0.34)] bg-[rgba(67,173,139,0.12)] p-4 text-sm text-[#c7f0df]">
        <p className="font-medium text-white">{label} submitted</p>
        <p className="mt-1 text-sm text-[#bfe9d9]">{STAGE_MESSAGES['submitted'].body}</p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <a
            href={explorerTxUrl(txId)}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              'inline-flex rounded-full border border-[rgba(67,173,139,0.3)] px-3 py-1.5 text-xs font-semibold text-[#d7f6ea] transition hover:bg-[rgba(67,173,139,0.12)]',
            )}
          >
            View in explorer
          </a>
          <div className="break-all font-mono text-xs text-[#a8d8c6]">{txId}</div>
        </div>
      </div>
    )
  }

  if (effectiveStage === 'confirmed' && txId) {
    return (
      <div className="mt-4 rounded-[var(--radius-md)] border border-[rgba(67,173,139,0.34)] bg-[rgba(67,173,139,0.18)] p-4 text-sm text-[#d7f6ea]">
        <p className="font-medium text-white">{label} confirmed</p>
        <p className="mt-1 text-sm text-[#c7eedf]">{STAGE_MESSAGES.confirmed.body}</p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <a
            href={explorerTxUrl(txId)}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              'inline-flex rounded-full border border-[rgba(67,173,139,0.3)] px-3 py-1.5 text-xs font-semibold text-[#e5fff3] transition hover:bg-[rgba(67,173,139,0.12)]',
            )}
          >
            View in explorer
          </a>
          <div className="break-all font-mono text-xs text-[#b7ead5]">{txId}</div>
        </div>
      </div>
    )
  }

  return null
}

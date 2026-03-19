'use client'

import { explorerTxUrl } from '@/lib/config'

interface Props {
  txId: string | null
  error: string | null
  loading: boolean
  label?: string
}

export function TxResult({ txId, error, loading, label = 'Transaction' }: Props) {
  if (loading) {
    return (
      <div className="mt-3 flex items-center gap-2 text-sm text-gray-400">
        <div className="w-4 h-4 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
        Waiting for wallet confirmation…
      </div>
    )
  }
  if (error) {
    return (
      <div className="mt-3 p-3 bg-red-950 border border-red-800 rounded text-sm text-red-300">
        Error: {error}
      </div>
    )
  }
  if (txId) {
    return (
      <div className="mt-3 p-3 bg-emerald-950 border border-emerald-700 rounded text-sm text-emerald-300">
        {label} broadcast!{' '}
        <a
          href={explorerTxUrl(txId)}
          target="_blank"
          rel="noopener noreferrer"
          className="underline text-emerald-400 hover:text-emerald-200"
        >
          View on Explorer
        </a>
        <div className="mt-1 text-xs font-mono text-emerald-600 break-all">{txId}</div>
      </div>
    )
  }
  return null
}

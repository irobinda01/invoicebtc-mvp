'use client'

import { STACKS_API_BASE } from '@/lib/config'

export type LiveTxStatus = 'pending' | 'success' | 'abort_by_response' | 'abort_by_post_condition' | 'dropped' | 'unknown'

interface HiroTxResponse {
  tx_status?: string
  tx_id?: string
}

export async function fetchLiveTxStatus(txId: string): Promise<LiveTxStatus> {
  const response = await fetch(`${STACKS_API_BASE}/extended/v1/tx/${txId}`, {
    cache: 'no-store',
  })

  if (response.status === 404) return 'pending'
  if (!response.ok) throw new Error(`Transaction lookup failed with status ${response.status}.`)

  const data = await response.json() as HiroTxResponse
  switch (data.tx_status) {
    case 'success':
      return 'success'
    case 'abort_by_response':
      return 'abort_by_response'
    case 'abort_by_post_condition':
      return 'abort_by_post_condition'
    case 'dropped_replace_by_fee':
    case 'dropped_replace_across_fork':
    case 'dropped_too_expensive':
    case 'dropped_stale_garbage_collect':
    case 'dropped_problematic':
      return 'dropped'
    case 'pending':
    default:
      return 'pending'
  }
}

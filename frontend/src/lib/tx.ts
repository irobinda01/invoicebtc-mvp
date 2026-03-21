'use client'

import { STACKS_API_BASE } from '@/lib/config'

export type LiveTxStatus =
  | { status: 'pending' }
  | { status: 'success' }
  | { status: 'abort_by_response'; repr: string | null }
  | { status: 'abort_by_post_condition' }
  | { status: 'dropped' }
  | { status: 'unknown' }

interface HiroTxResponse {
  tx_status?: string
  tx_id?: string
  tx_result?: { repr?: string }
}

export async function fetchLiveTxStatus(txId: string): Promise<LiveTxStatus> {
  const response = await fetch(`${STACKS_API_BASE}/extended/v1/tx/${txId}`, {
    cache: 'no-store',
  })

  if (response.status === 404) return { status: 'pending' }
  if (!response.ok) throw new Error(`Transaction lookup failed with status ${response.status}.`)

  const data = await response.json() as HiroTxResponse
  switch (data.tx_status) {
    case 'success':
      return { status: 'success' }
    case 'abort_by_response':
      return { status: 'abort_by_response', repr: data.tx_result?.repr ?? null }
    case 'abort_by_post_condition':
      return { status: 'abort_by_post_condition' }
    case 'dropped_replace_by_fee':
    case 'dropped_replace_across_fork':
    case 'dropped_too_expensive':
    case 'dropped_stale_garbage_collect':
    case 'dropped_problematic':
      return { status: 'dropped' }
    case 'pending':
    default:
      return { status: 'pending' }
  }
}

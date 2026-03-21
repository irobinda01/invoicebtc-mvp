'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchLiveTxStatus } from '@/lib/tx'
import { normalizeWalletError } from '@/lib/wallet/utils'

/**
 * Lifecycle stage of a Stacks transaction write.
 *
 * 'idle'            - no transaction in flight
 * 'awaiting-wallet' - request sent to Leather; wallet dialog is open
 * 'submitted'       - txid received; tx broadcast accepted by the mempool
 * 'confirmed'       - tx confirmed successfully on-chain
 * 'error'           - wallet rejected, Clarity error, or network failure
 */
export type TxStage = 'idle' | 'awaiting-wallet' | 'submitted' | 'confirmed' | 'error'

export interface TxState {
  stage: TxStage
  txId: string | null
  error: string | null
  /** True while the wallet dialog is open or while confirmation polling is active. */
  loading: boolean
}

interface TxActions {
  /** Call immediately before invoking requestContractCall. */
  start: () => void
  /** Call with the txid once the wallet returns successfully. */
  done: (txId: string, options?: { onConfirmed?: (txId: string) => void }) => void
  /** Call with a normalized error string on any failure. */
  fail: (error: string, txId?: string | null) => void
  /** Reset back to idle (e.g. to allow re-submission). */
  reset: () => void
}

export type UseTxStatus = TxState & TxActions

const IDLE: TxState = {
  stage: 'idle',
  txId: null,
  error: null,
  loading: false,
}

export function useTxStatus(): UseTxStatus {
  const [state, setState] = useState<TxState>(IDLE)
  const pollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const confirmedCallbackRef = useRef<((txId: string) => void) | null>(null)

  const clearPendingPoll = useCallback(() => {
    if (pollTimeoutRef.current) {
      clearTimeout(pollTimeoutRef.current)
      pollTimeoutRef.current = null
    }
  }, [])

  const start = useCallback(() => {
    clearPendingPoll()
    confirmedCallbackRef.current = null
    setState({ stage: 'awaiting-wallet', txId: null, error: null, loading: true })
  }, [clearPendingPoll])

  const done = useCallback((txId: string, options?: { onConfirmed?: (txId: string) => void }) => {
    clearPendingPoll()
    confirmedCallbackRef.current = options?.onConfirmed ?? null
    setState({ stage: 'submitted', txId, error: null, loading: true })
  }, [clearPendingPoll])

  const fail = useCallback((error: string, txId: string | null = null) => {
    clearPendingPoll()
    confirmedCallbackRef.current = null
    setState({ stage: 'error', txId, error, loading: false })
  }, [clearPendingPoll])

  const confirm = useCallback((txId: string) => {
    clearPendingPoll()
    setState({ stage: 'confirmed', txId, error: null, loading: false })
    confirmedCallbackRef.current?.(txId)
    confirmedCallbackRef.current = null
  }, [clearPendingPoll])

  const reset = useCallback(() => {
    clearPendingPoll()
    confirmedCallbackRef.current = null
    setState(IDLE)
  }, [clearPendingPoll])

  useEffect(() => {
    if (state.stage !== 'submitted' || !state.txId) return

    let cancelled = false

    const poll = async () => {
      try {
        const txStatus = await fetchLiveTxStatus(state.txId!)
        if (cancelled) return

        if (txStatus.status === 'success') {
          confirm(state.txId!)
          return
        }

        if (txStatus.status === 'abort_by_response') {
          const msg = txStatus.repr
            ? normalizeWalletError(txStatus.repr)
            : 'The transaction was confirmed on-chain but the contract rejected it.'
          fail(msg, state.txId)
          return
        }

        if (txStatus.status === 'abort_by_post_condition') {
          fail('The wallet safety checks blocked this transaction during confirmation.', state.txId)
          return
        }

        if (txStatus.status === 'dropped') {
          fail('The transaction was dropped before confirmation. Please retry from the app.', state.txId)
          return
        }

        pollTimeoutRef.current = setTimeout(poll, 15000)
      } catch {
        if (cancelled) return
        pollTimeoutRef.current = setTimeout(poll, 20000)
      }
    }

    pollTimeoutRef.current = setTimeout(poll, 12000)

    return () => {
      cancelled = true
      clearPendingPoll()
    }
  }, [clearPendingPoll, confirm, fail, state.stage, state.txId])

  useEffect(() => {
    return () => {
      clearPendingPoll()
    }
  }, [clearPendingPoll])

  return { ...state, start, done, fail, reset }
}

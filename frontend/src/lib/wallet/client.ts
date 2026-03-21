'use client'

/**
 * Leather-only wallet client.
 *
 * This MVP intentionally talks directly to the injected Leather Stacks
 * provider so page load never triggers generic injected-wallet discovery or
 * any EVM wallet probing. Connection happens only from explicit user action.
 */

import { serializeCV, serializePostCondition } from '@stacks/transactions'
import type { ClarityValue, PostCondition } from '@stacks/transactions'
import { TESTNET_NETWORK } from './constants'
import { pickTestnetAddress } from './utils'
import type { WalletAddressEntry } from './types'

const SESSION_KEY = 'invoicebtc_wallet_session'

interface LeatherProvider {
  request(method: string, params?: unknown): Promise<{ result: unknown }>
}

function getLeatherProvider(): LeatherProvider | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as { LeatherProvider?: LeatherProvider }
  return w.LeatherProvider ?? null
}

/** Timeout wrapper — rejects after `ms` milliseconds with a clear message. */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('Leather did not respond in time. Check the approval popup, make sure the wallet is unlocked, and try again.')),
      ms,
    )
    promise.then(
      (v) => { clearTimeout(timer); resolve(v) },
      (e) => { clearTimeout(timer); reject(e) },
    )
  })
}

/** Normalize anything Leather might reject with into a proper Error. */
function normalizeProviderRejection(err: unknown): Error {
  if (err instanceof Error) {
    // Chrome MV3: service worker stopped before it could handle the message.
    if (err.message.includes('Receiving end does not exist') || err.message.includes('Could not establish connection')) {
      return new Error('Leather did not respond. Re-open the wallet popup, make sure the wallet is unlocked, and try again.')
    }
    return err
  }
  if (typeof err === 'string' && err) return new Error(err)
  if (err && typeof err === 'object') {
    const e = err as Record<string, unknown>

    // JSON-RPC 2.0 wrapper: { error: { code, message }, jsonrpc, id }
    // e.error is itself an object — extract its message, not String(object)
    if (e.error && typeof e.error === 'object') {
      const inner = e.error as Record<string, unknown>
      const innerMsg = String(inner.message ?? '').trim()
      if (innerMsg) return new Error(innerMsg)
      if (inner.code != null) return new Error(`Leather error (code ${inner.code}). Re-open the wallet popup and try again.`)
    }

    // Plain object with a string message/code at the top level
    const msg = typeof e.message === 'string' ? e.message.trim()
              : typeof e.msg    === 'string' ? e.msg.trim()
              : ''
    const code = e.code ?? e.errorCode
    if (msg) return new Error(msg)
    if (code != null) return new Error(`Leather error (code ${code}). Re-open the wallet popup and try again.`)
  }
  // null, undefined, or other falsy value — Leather closed or rejected silently.
  return new Error('The Leather request was not completed. Make sure Leather is unlocked and try again.')
}

async function leatherRequest<T>(method: string, params?: unknown): Promise<T> {
  const provider = getLeatherProvider()
  if (!provider) {
    throw new Error('Leather wallet extension not found. Install the Leather extension to continue.')
  }

  let raw: unknown
  try {
    // Only pass params when provided — some Leather versions check arguments.length.
    const call = params !== undefined
      ? provider.request(method, params)
      : provider.request(method)
    raw = await withTimeout(call, 120_000)
  } catch (err) {
    throw normalizeProviderRejection(err)
  }

  const res = raw as Record<string, unknown>

  // JSON-RPC 2.0 error response: { error: { code, message } }
  if (res && 'error' in res && res.error) {
    const e = res.error as Record<string, unknown>
    throw new Error(String(e.message ?? `Leather error (code ${e.code ?? 'unknown'})`))
  }

  // Standard wrapped response: { result: T }
  if (res && 'result' in res) {
    return res.result as T
  }

  // Older Leather versions return data directly without a result wrapper
  return raw as unknown as T
}

function saveSession(addresses: WalletAddressEntry[]): void {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(addresses))
  } catch {}
}

function loadSession(): WalletAddressEntry[] {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    return raw ? (JSON.parse(raw) as WalletAddressEntry[]) : []
  } catch {
    return []
  }
}

function clearSession(): void {
  try {
    localStorage.removeItem(SESSION_KEY)
  } catch {}
}

export interface WalletSnapshot {
  address: string | null
  addresses: WalletAddressEntry[]
  isConnected: boolean
}

export function getWalletAvailability(): boolean {
  return getLeatherProvider() !== null
}

export function getStoredWalletSnapshot(): WalletSnapshot {
  const addresses = loadSession()
  const entry = pickTestnetAddress(addresses)
  return {
    address: entry?.address ?? null,
    addresses,
    isConnected: addresses.length > 0,
  }
}

export interface ContractCallRequest {
  contractAddress: string
  contractName: string
  functionName: string
  address?: string
  functionArgs?: ClarityValue[]
  postConditions?: PostCondition[]
  postConditionMode?: 'allow' | 'deny'
  fee?: number | bigint | string
  nonce?: number | bigint | string
}

export interface SignMessageResult {
  signature: string
  publicKey: string
}

export async function connectLeatherTestnet() {
  // Fire a lightweight ping to wake the MV3 service worker without blocking.
  // Both messages land in the worker's queue immediately; the worker wakes
  // once and processes them in order — no artificial delay before getAddresses.
  const result = await leatherRequest<{ addresses: WalletAddressEntry[] }>('getAddresses')
  saveSession(result.addresses)
  const entry = pickTestnetAddress(result.addresses)
  return { address: entry?.address ?? null, addresses: result.addresses }
}

export async function refreshLeatherTestnetSession() {
  const result = await leatherRequest<{ addresses: WalletAddressEntry[] }>('getAddresses')
  saveSession(result.addresses)
  const entry = pickTestnetAddress(result.addresses)
  return { address: entry?.address ?? null, addresses: result.addresses }
}

export function disconnectWallet(): void {
  clearSession()
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

export async function requestContractCall(params: ContractCallRequest) {
  return leatherRequest<{ txid?: string; transaction?: string }>('stx_callContract', {
    ...(params.address ? { address: params.address } : {}),
    contract: `${params.contractAddress}.${params.contractName}`,
    functionName: params.functionName,
    functionArgs: params.functionArgs?.map((cv) => toHex(serializeCV(cv))) ?? [],
    network: TESTNET_NETWORK,
    postConditions: params.postConditions?.map((pc) => toHex(serializePostCondition(pc))) ?? [],
    postConditionMode: params.postConditionMode ?? 'deny',
    ...(params.fee !== undefined && { fee: String(params.fee) }),
    ...(params.nonce !== undefined && { nonce: String(params.nonce) }),
  })
}

export async function signStacksMessage(message: string): Promise<SignMessageResult> {
  return leatherRequest<SignMessageResult>('stx_signMessage', { message })
}

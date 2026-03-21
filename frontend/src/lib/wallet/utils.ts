import { TESTNET_ADDRESS_PREFIX } from './constants'
import type { WalletAddressEntry } from './types'

// ─── Address helpers ──────────────────────────────────────────────────────────

export function isTestnetAddress(address: string | null | undefined) {
  return !!address && address.toUpperCase().startsWith(TESTNET_ADDRESS_PREFIX)
}

export function pickTestnetAddress(addresses: WalletAddressEntry[]) {
  return addresses.find((entry) => isTestnetAddress(entry.address)) ?? null
}

// ─── Error classification ─────────────────────────────────────────────────────

function extractMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message: unknown }).message)
  }
  return ''
}

export function isLeatherRejectedError(error: unknown) {
  const msg = extractMessage(error)
  return /cancel|closed|reject|denied|canceled|abort/i.test(msg)
}

export function isWrongNetworkError(error: unknown) {
  const msg = extractMessage(error)
  return /network|testnet|mainnet|unsupported chain|unsupported network/i.test(msg)
}

function isNetworkError(error: unknown) {
  const msg = extractMessage(error)
  return /fetch failed|network error|timeout|econnrefused|unreachable|socket/i.test(msg)
}

function isInsufficientFundsError(error: unknown) {
  const msg = extractMessage(error)
  return /insufficient|not enough|balance|too little/i.test(msg)
}

function isContractNotFoundError(error: unknown) {
  const msg = extractMessage(error)
  return /contract not found|missing contract|not deployed/i.test(msg)
}

// ─── Clarity error code table (invoicebtc.clar) ───────────────────────────────

const CLARITY_ERRORS: Record<number, string> = {
  100: 'Invoice or milestone not found on-chain.',
  101: 'Only the merchant can perform this action.',
  102: 'Only the client can perform this action.',
  103: 'Only a named party (merchant or client) can perform this action.',
  104: 'The invoice is not in the correct state for this action.',
  105: 'This invoice has already been signed by this party.',
  106: 'Milestone parameters are invalid — check values and counts.',
  107: 'Each milestone face value must equal its LP repayment amount.',
  108: 'The funding amount is incorrect for this invoice.',
  109: 'The escrow has already been funded.',
  110: 'The milestone is not in the correct state for this action.',
  111: 'This milestone has not been funded by a liquidity provider yet.',
  112: 'Too early — the required block height has not been reached yet. Wait for the milestone delivery deadline or maturity height to pass.',
  113: 'There is no leftover escrow balance to refund.',
  114: 'The funding deadline has already passed.',
  115: 'The deadline or maturity height value is invalid.',
  116: 'The sBTC transfer failed. Ensure the wallet has sufficient testnet sBTC.',
  117: 'The invoice cannot be closed while milestones are still unresolved.',
  118: 'Only the assigned liquidity provider can perform this action.',
}

function normalizeClarityError(code: number): string {
  return (
    CLARITY_ERRORS[code] ??
    `Contract returned error code ${code}. Check the transaction in the explorer for details.`
  )
}

function extractClarityCode(msg: string): number | null {
  // Patterns: (err u101) | err: u101 | "u101" | {err: u101}
  const match = msg.match(/\(err u(\d+)\)|\berr[:\s]+u(\d+)\b|"u(\d+)"|\{err:\s*u(\d+)\}/)
  if (!match) return null
  const raw = match[1] ?? match[2] ?? match[3] ?? match[4]
  return raw !== undefined ? parseInt(raw, 10) : null
}

// ─── Main normalizer ──────────────────────────────────────────────────────────

/**
 * Converts any wallet or contract error into a user-readable string.
 * Covers: user cancellation, wrong network, Clarity error codes, sBTC transfer
 * failures, network connectivity, and generic fallbacks.
 */
export function normalizeWalletError(error: unknown): string {
  if (isLeatherRejectedError(error)) {
    return 'The wallet request was cancelled. No transaction was submitted.'
  }
  if (isWrongNetworkError(error)) {
    return 'Leather is not set to Stacks Testnet. Switch the wallet network and try again.'
  }
  if (isContractNotFoundError(error)) {
    return 'The InvoiceBTC contract was not found at the configured address. Check that it is deployed on testnet.'
  }
  if (isInsufficientFundsError(error)) {
    return 'Insufficient sBTC balance for this transaction. Ensure your wallet has enough testnet sBTC.'
  }
  if (isNetworkError(error)) {
    return 'Unable to reach the Stacks testnet. Check your network connection and try again.'
  }

  const msg = extractMessage(error)
  const clarityCode = extractClarityCode(msg)
  if (clarityCode !== null) {
    return normalizeClarityError(clarityCode)
  }

  if (msg) return msg
  return 'The wallet request could not be completed. Please try again.'
}

/**
 * Alias kept for backward compatibility with WalletProvider imports.
 */
export const getWalletErrorMessage = normalizeWalletError

export function getWalletLabelFromProvider() {
  return 'Leather'
}

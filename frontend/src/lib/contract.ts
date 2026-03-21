// Read-only contract call helpers via Stacks API fetch.
// These do NOT require a wallet — they call the read-only endpoint directly.

import {
  STACKS_API_BASE,
  CONTRACT_ADDRESS,
  CONTRACT_NAME,
} from './config'
import { cvToJSON, hexToCV } from '@stacks/transactions'
import type { Invoice, Milestone } from './types'
import { STATUS_CODES, MILESTONE_STATUS_CODES } from './types'

const API = STACKS_API_BASE

export interface ChainInfo {
  stacksTipHeight: number
  burnBlockHeight: number
  stablePoxConsensus: string | null
  serverVersion: string | null
}

export interface InvoiceReadiness {
  canFund: boolean
  settlementEligibleMilestones: number[]
}

async function callReadOnly(
  fn: string,
  args: string[],
  sender: string = CONTRACT_ADDRESS
): Promise<unknown> {
  const url = `${API}/v2/contracts/call-read/${CONTRACT_ADDRESS}/${CONTRACT_NAME}/${fn}`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sender, arguments: args }),
  })
  if (!res.ok) throw new Error(`API error: ${res.status}`)
  const data = await res.json() as { okay?: boolean; result?: string; cause?: string }
  if (!data.okay || !data.result) {
    throw new Error(data.cause || 'Read-only call failed')
  }
  return cvToJSON(hexToCV(data.result))
}

// Encode a uint as Clarity hex for read-only call arguments
function encodeUint(n: number | bigint): string {
  // Clarity serialization: 0x01 prefix for uint, 16-byte big-endian
  const val = BigInt(n)
  const hex = val.toString(16).padStart(32, '0')
  return '0x01' + hex
}

function parseClarityValue(val: unknown): unknown {
  if (val === null || val === undefined) return null
  if (typeof val === 'object') {
    const v = val as Record<string, unknown>
    if (v.type === 'uint') return BigInt(v.value as string)
    if (v.type === 'bool') return v.value === 'true' || v.value === true
    if (v.type === 'principal') return v.value as string
    if (v.type === 'buff') return v.value as string
    if (typeof v.type === 'string' && (v.type.startsWith('(optional') || v.type === 'optional')) {
      return v.value ? parseClarityValue(v.value) : null
    }
    if (typeof v.type === 'string' && v.type.startsWith('(tuple')) {
      const result: Record<string, unknown> = {}
      for (const [k, subVal] of Object.entries(v.value as Record<string, unknown>)) {
        result[k] = parseClarityValue(subVal)
      }
      return result
    }
    if (typeof v.type === 'string' && v.type.startsWith('(response') && v.success === true) {
      return { ok: parseClarityValue(v.value) }
    }
    if (typeof v.type === 'string' && v.type.startsWith('(response') && v.success === false) {
      return { err: parseClarityValue(v.value) }
    }
  }
  return val
}

function unwrapOptionalTuple(
  raw: Record<string, unknown>,
): Record<string, { type: string; value: unknown }> | null {
  const optResult = raw as {
    type?: string
    value?: {
      type?: string
      value?: Record<string, { type: string; value: unknown }>
    } | null
  }
  if (!optResult.type || optResult.type === '(optional none)' || optResult.value === null) return null
  return optResult.value?.value ?? null
}

function parseResponseBool(raw: unknown): boolean {
  const parsed = parseClarityValue(raw)
  if (typeof parsed === 'object' && parsed && 'ok' in (parsed as Record<string, unknown>)) {
    return Boolean((parsed as { ok?: unknown }).ok)
  }
  return false
}

// Parse the decoded Clarity JSON into a typed Invoice object
function parseInvoiceResult(raw: Record<string, unknown>, id: number): Invoice | null {
  try {
    const tupleVal = unwrapOptionalTuple(raw)
    if (!tupleVal) return null

    const g = (key: string) => {
      const entry = tupleVal[key]
      if (!entry) return undefined
      if (entry.type === 'uint') return BigInt(entry.value as string)
      if (entry.type === 'bool') return entry.value === 'true' || entry.value === true
      if (entry.type === 'principal') return entry.value as string
      if (typeof entry.type === 'string' && entry.type.startsWith('(buff')) return entry.value as string
      if (typeof entry.type === 'string' && entry.type.startsWith('(optional')) {
        return entry.value ? (entry.value as { value?: string }).value ?? entry.value : null
      }
      return entry.value
    }

    const statusCode = Number(g('status') as bigint)

    return {
      id,
      merchant: g('merchant') as string,
      client: g('client') as string,
      lp: g('lp') as string | null,
      faceValue: g('face-value') as bigint,
      totalLpFunding: g('total-lp-funding') as bigint,
      totalLpAdvanced: g('total-lp-advanced') as bigint,
      status: STATUS_CODES[statusCode] ?? 'draft',
      statusCode,
      createdAt: Number(g('created-at') as bigint),
      fundingDeadline: Number(g('funding-deadline') as bigint),
      maturityHeight: Number(g('maturity-height') as bigint),
      metadataHash: g('metadata-hash') as string,
      merchantSigned: g('merchant-signed') as boolean,
      clientSigned: g('client-signed') as boolean,
      milestoneCount: Number(g('milestone-count') as bigint),
      totalEscrowed: g('total-escrowed') as bigint,
      totalSettled: g('total-settled') as bigint,
      totalRefunded: g('total-refunded') as bigint,
    }
  } catch (e) {
    console.error('parseInvoiceResult error', e, raw)
    return null
  }
}

function parseMilestoneResult(
  raw: Record<string, unknown>,
  invoiceId: number,
  milestoneId: number
): Milestone | null {
  try {
    const tupleVal = unwrapOptionalTuple(raw)
    if (!tupleVal) return null

    const g = (key: string) => {
      const entry = tupleVal[key]
      if (!entry) return undefined
      if (entry.type === 'uint') return BigInt(entry.value as string)
      if (entry.type === 'bool') return entry.value === 'true' || entry.value === true
      if (typeof entry.type === 'string' && entry.type.startsWith('(optional')) {
        return entry.value ? (entry.value as { value?: string }).value ?? entry.value : null
      }
      return entry.value
    }

    const statusCode = Number(g('state') as bigint)

    return {
      id: milestoneId,
      invoiceId,
      faceValue: g('face-value') as bigint,
      merchantPayoutAmount: g('merchant-payout-amount') as bigint,
      lpRepaymentAmount: g('lp-repayment-amount') as bigint,
      dueBlockHeight: Number(g('due-block-height') as bigint),
      proofHash: g('proof-hash') as string | null,
      status: MILESTONE_STATUS_CODES[statusCode] ?? 'pending',
      statusCode,
    }
  } catch (e) {
    console.error('parseMilestoneResult error', e, raw)
    return null
  }
}

export async function fetchInvoice(id: number): Promise<Invoice | null> {
  const raw = await callReadOnly('get-invoice', [encodeUint(id)])
  return parseInvoiceResult(raw as Record<string, unknown>, id)
}

export async function fetchMilestone(
  invoiceId: number,
  milestoneId: number
): Promise<Milestone | null> {
  const raw = await callReadOnly('get-milestone', [
    encodeUint(invoiceId),
    encodeUint(milestoneId),
  ])
  return parseMilestoneResult(raw as Record<string, unknown>, invoiceId, milestoneId)
}

export async function fetchAllMilestones(
  invoiceId: number,
  count: number
): Promise<Milestone[]> {
  const results = await Promise.all(
    Array.from({ length: count }, (_, i) => fetchMilestone(invoiceId, i + 1))
  )
  return results.filter(Boolean) as Milestone[]
}

export async function fetchNextInvoiceId(): Promise<number> {
  try {
    const raw = await callReadOnly('get-last-invoice-id', [])
    const parsed = parseClarityValue(raw)
    return typeof parsed === 'bigint' ? Number(parsed) : 0
  } catch {
    return 0
  }
}

export async function fetchChainInfo(): Promise<ChainInfo> {
  const response = await fetch(`${API}/v2/info`, { cache: 'no-store' })
  if (!response.ok) throw new Error(`Chain info error: ${response.status}`)
  const data = await response.json() as {
    stacks_tip_height?: number
    burn_block_height?: number
    stable_pox_consensus?: string
    server_version?: string
  }

  return {
    stacksTipHeight: data.stacks_tip_height ?? 0,
    burnBlockHeight: data.burn_block_height ?? 0,
    stablePoxConsensus: data.stable_pox_consensus ?? null,
    serverVersion: data.server_version ?? null,
  }
}

export async function fetchLiveInvoices(limit: number = 20): Promise<Invoice[]> {
  const lastId = await fetchNextInvoiceId()
  if (lastId < 1) return []

  const count = Math.min(lastId, Math.max(limit, 1))
  const ids = Array.from({ length: count }, (_, i) => lastId - i)
  const results = await Promise.all(ids.map(id => fetchInvoice(id).catch(() => null)))
  return results.filter(Boolean) as Invoice[]
}

export async function fetchInvoiceReadiness(
  invoiceId: number,
  milestoneCount: number,
): Promise<InvoiceReadiness> {
  const [canFund, settleResponses] = await Promise.all([
    callReadOnly('can-fund', [encodeUint(invoiceId)])
      .then(parseResponseBool)
      .catch(() => false),
    Promise.all(
      Array.from({ length: milestoneCount }, (_, index) =>
        callReadOnly('can-settle', [encodeUint(invoiceId), encodeUint(index + 1)])
          .then(parseResponseBool)
          .catch(() => false),
      ),
    ),
  ])

  return {
    canFund,
    settlementEligibleMilestones: settleResponses
      .map((isEligible, index) => (isEligible ? index + 1 : null))
      .filter((value): value is number => value !== null),
  }
}

// Pad a string to a 32-byte buffer (for metadata-hash)
export function strToBytes32(str: string): Uint8Array {
  const encoder = new TextEncoder()
  const bytes = encoder.encode(str.slice(0, 32))
  const result = new Uint8Array(32)
  result.set(bytes)
  return result
}

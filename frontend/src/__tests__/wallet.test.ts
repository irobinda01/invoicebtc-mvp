/**
 * Wallet integration tests
 *
 * Covers: availability detection, connect/disconnect, session restore,
 * address validation, network detection, error classification, and
 * the contract call plumbing used by all MVP on-chain actions.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  connectLeatherTestnet,
  disconnectWallet,
  getStoredWalletSnapshot,
  getWalletAvailability,
  requestContractCall,
  refreshLeatherTestnetSession,
} from '@/lib/wallet/client'
import {
  isLeatherRejectedError,
  isTestnetAddress,
  isWrongNetworkError,
  normalizeWalletError,
  pickTestnetAddress,
} from '@/lib/wallet/utils'
import { TESTNET_ADDRESS_PREFIX, TESTNET_NETWORK } from '@/lib/wallet/constants'
import type { WalletAddressEntry } from '@/lib/wallet/types'

const STX_ADDRESS = 'ST1YBHMDH6ESJ1DBY8MK72XER9BG9646QMCS610PE'
const BTC_ADDRESS = 'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq'

const STX_ENTRY: WalletAddressEntry = {
  symbol: 'STX',
  address: STX_ADDRESS,
  publicKey: '03abc123',
}

const BTC_ENTRY: WalletAddressEntry = {
  symbol: 'BTC',
  address: BTC_ADDRESS,
  publicKey: '03def456',
}

function makeLeatherProvider(overrides?: Partial<{ request: ReturnType<typeof vi.fn> }>) {
  return {
    request: vi.fn().mockResolvedValue({ result: { addresses: [STX_ENTRY, BTC_ENTRY] } }),
    ...overrides,
  }
}

function setLeatherProvider(provider: ReturnType<typeof makeLeatherProvider> | null) {
  Object.defineProperty(window, 'LeatherProvider', {
    value: provider,
    writable: true,
    configurable: true,
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  setLeatherProvider(makeLeatherProvider())
})

afterEach(() => {
  setLeatherProvider(null)
})

describe('isTestnetAddress', () => {
  it('returns true for ST-prefixed addresses', () => {
    expect(isTestnetAddress(STX_ADDRESS)).toBe(true)
    expect(isTestnetAddress('ST2CY5V39NHDPWSXMW9QDT3HC3GD6Q6XX4CFRK9AG')).toBe(true)
  })

  it('returns false for mainnet SP-prefixed addresses', () => {
    expect(isTestnetAddress('SP2C2YFP12AJZB4MABJBAJ55XECVS7E4PMMZ89YZR')).toBe(false)
  })

  it('returns false for nullish values', () => {
    expect(isTestnetAddress(null)).toBe(false)
    expect(isTestnetAddress(undefined)).toBe(false)
    expect(isTestnetAddress('')).toBe(false)
  })
})

describe('pickTestnetAddress', () => {
  it('picks the STX testnet address from a mixed list', () => {
    const entry = pickTestnetAddress([BTC_ENTRY, STX_ENTRY])
    expect(entry?.address).toBe(STX_ADDRESS)
  })

  it('returns null when no testnet STX address is present', () => {
    expect(pickTestnetAddress([BTC_ENTRY])).toBeNull()
    expect(pickTestnetAddress([])).toBeNull()
  })
})

describe('getWalletAvailability', () => {
  it('returns true when Leather is injected', () => {
    expect(getWalletAvailability()).toBe(true)
  })

  it('returns false when Leather is missing', () => {
    setLeatherProvider(null)
    expect(getWalletAvailability()).toBe(false)
  })
})

describe('getStoredWalletSnapshot', () => {
  it('returns an empty snapshot when session storage is empty', () => {
    const snap = getStoredWalletSnapshot()
    expect(snap.address).toBeNull()
    expect(snap.addresses).toEqual([])
    expect(snap.isConnected).toBe(false)
  })

  it('restores the cached Stacks testnet address from local session storage', () => {
    localStorage.setItem('invoicebtc_wallet_session', JSON.stringify([STX_ENTRY, BTC_ENTRY]))

    const snap = getStoredWalletSnapshot()

    expect(snap.address).toBe(STX_ADDRESS)
    expect(snap.addresses).toEqual([STX_ENTRY, BTC_ENTRY])
    expect(snap.isConnected).toBe(true)
  })

  it('returns null address when only BTC data is cached', () => {
    localStorage.setItem('invoicebtc_wallet_session', JSON.stringify([BTC_ENTRY]))

    const snap = getStoredWalletSnapshot()

    expect(snap.address).toBeNull()
    expect(snap.isConnected).toBe(true)
  })
})

describe('connectLeatherTestnet', () => {
  it('uses the permissioned Leather getAddresses flow during connect', async () => {
    const provider = makeLeatherProvider()
    setLeatherProvider(provider)

    const result = await connectLeatherTestnet()

    expect(provider.request).toHaveBeenCalledTimes(1)
    expect(provider.request).toHaveBeenCalledWith('getAddresses')
    expect(result.address).toBe(STX_ADDRESS)
    expect(result.addresses).toEqual([STX_ENTRY, BTC_ENTRY])
  })

  it('stores the session after connect without forcing reconnect on page load', async () => {
    await connectLeatherTestnet()
    const stored = JSON.parse(localStorage.getItem('invoicebtc_wallet_session') ?? '[]')
    expect(stored[0].address).toBe(STX_ADDRESS)
  })

  it('returns null address when connect succeeds without a testnet STX address', async () => {
    setLeatherProvider(
      makeLeatherProvider({
        request: vi.fn().mockResolvedValue({ result: { addresses: [BTC_ENTRY] } }),
      }),
    )

    const result = await connectLeatherTestnet()

    expect(result.address).toBeNull()
  })

  it('surfaces wallet rejection errors', async () => {
    setLeatherProvider(
      makeLeatherProvider({
        request: vi.fn().mockRejectedValue(new Error('User rejected the request')),
      }),
    )
    await expect(connectLeatherTestnet()).rejects.toThrow('User rejected')
  })
})

describe('refreshLeatherTestnetSession', () => {
  it('uses getAddresses on the current Leather session', async () => {
    const provider = makeLeatherProvider()
    setLeatherProvider(provider)

    const result = await refreshLeatherTestnetSession()

    expect(provider.request).toHaveBeenCalledWith('getAddresses')
    expect(result.address).toBe(STX_ADDRESS)
  })
})

describe('disconnectWallet', () => {
  it('clears the local Leather session state', () => {
    localStorage.setItem('invoicebtc_wallet_session', JSON.stringify([STX_ENTRY]))
    disconnectWallet()
    expect(localStorage.getItem('invoicebtc_wallet_session')).toBeNull()
  })
})

describe('requestContractCall', () => {
  const TX_RESULT = { txid: '0xabc123', transaction: '0x...' }

  beforeEach(() => {
    setLeatherProvider(
      makeLeatherProvider({
        request: vi.fn().mockResolvedValue({ result: TX_RESULT }),
      }),
    )
  })

  it('uses stx_callContract and returns the txid', async () => {
    const result = await requestContractCall({
      contractAddress: 'ST1YBHMDH6ESJ1DBY8MK72XER9BG9646QMCS610PE',
      contractName: 'invoicebtc-v4',
      functionName: 'sign-invoice-as-merchant',
      functionArgs: [],
      postConditions: [],
      postConditionMode: 'allow',
    })

    expect(result.txid).toBe('0xabc123')
  })

  it('passes the connected address and contract identifier into the Leather request', async () => {
    const provider = makeLeatherProvider({
      request: vi.fn().mockResolvedValue({ result: TX_RESULT }),
    })
    setLeatherProvider(provider)

    await requestContractCall({
      contractAddress: 'ST1YBHMDH6ESJ1DBY8MK72XER9BG9646QMCS610PE',
      contractName: 'invoicebtc-v4',
      functionName: 'fund-milestone',
      functionArgs: [],
      address: STX_ADDRESS,
    })

    const [method, params] = (provider.request as ReturnType<typeof vi.fn>).mock.calls[0]

    expect(method).toBe('stx_callContract')
    expect((params as { address: string }).address).toBe(STX_ADDRESS)
    expect((params as { contract: string }).contract).toBe(
      'ST1YBHMDH6ESJ1DBY8MK72XER9BG9646QMCS610PE.invoicebtc-v4',
    )
    expect((params as { functionName: string }).functionName).toBe('fund-milestone')
    expect((params as { network: string }).network).toBe(TESTNET_NETWORK)
  })

  it('uses allow postConditionMode when specified', async () => {
    const provider = makeLeatherProvider({
      request: vi.fn().mockResolvedValue({ result: TX_RESULT }),
    })
    setLeatherProvider(provider)

    await requestContractCall({
      contractAddress: 'ST1XXX',
      contractName: 'invoicebtc-v4',
      functionName: 'fund-milestone',
      functionArgs: [],
      postConditionMode: 'allow',
    })

    const [, params] = (provider.request as ReturnType<typeof vi.fn>).mock.calls[0]
    expect((params as { postConditionMode: string }).postConditionMode).toBe('allow')
  })
})

describe('isLeatherRejectedError', () => {
  it.each(['User cancelled', 'User rejected the request', 'Request denied', 'User closed popup', 'User aborted'])(
    'classifies "%s" as rejected',
    (msg: string) => expect(isLeatherRejectedError(new Error(msg))).toBe(true),
  )

  it('returns false for non-rejection errors', () => {
    expect(isLeatherRejectedError(new Error('Network error'))).toBe(false)
    expect(isLeatherRejectedError(new Error('Leather wallet extension not found'))).toBe(false)
  })
})

describe('isWrongNetworkError', () => {
  it.each(['Wrong network', 'unsupported chain', 'Expected testnet'])(
    'classifies "%s" as wrong network',
    (msg: string) => expect(isWrongNetworkError(new Error(msg))).toBe(true),
  )
})

describe('normalizeWalletError', () => {
  it('returns a cancel message for rejected errors', () => {
    const msg = normalizeWalletError(new Error('User cancelled'))
    expect(msg).toMatch(/cancelled/i)
  })

  it('maps Clarity error codes to human-readable messages', () => {
    expect(normalizeWalletError('(err u101)')).toMatch(/merchant/i)
    expect(normalizeWalletError('(err u116)')).toMatch(/sBTC/i)
  })

  it('returns a fallback for unknown errors', () => {
    const msg = normalizeWalletError(new Error('Something completely unknown xyz'))
    expect(typeof msg).toBe('string')
    expect(msg.length).toBeGreaterThan(0)
  })

  it('handles non-Error objects gracefully', () => {
    expect(() => normalizeWalletError(null)).not.toThrow()
    expect(() => normalizeWalletError(undefined)).not.toThrow()
    expect(() => normalizeWalletError({ code: 4001 })).not.toThrow()
  })
})

describe('role detection via connected address', () => {
  it('keeps the connected address on the ST testnet prefix used by the app', () => {
    localStorage.setItem('invoicebtc_wallet_session', JSON.stringify([BTC_ENTRY, STX_ENTRY]))

    const snap = getStoredWalletSnapshot()

    expect(TESTNET_ADDRESS_PREFIX).toBe('ST')
    expect(snap.address?.startsWith('ST')).toBe(true)
  })

  it('returns null when no STX address is available, preserving wrong-network behavior', () => {
    localStorage.setItem('invoicebtc_wallet_session', JSON.stringify([BTC_ENTRY]))

    const snap = getStoredWalletSnapshot()
    expect(snap.address).toBeNull()
  })
})

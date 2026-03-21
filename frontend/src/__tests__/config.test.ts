/**
 * Config resolution tests
 *
 * Verifies that the app resolves public testnet as the only network target,
 * contract identifiers point to the deployed testnet contract, and no
 * devnet/localhost fallback can override testnet configuration.
 *
 * In vitest's Node environment NEXT_PUBLIC_* vars are unset, so these tests
 * exercise the hardcoded defaults — the values that ship with the build when
 * .env.local is absent or empty.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ─── Test constants — the deployed testnet contract values ────────────────────

const DEPLOYED_CONTRACT_ADDRESS = 'ST1YBHMDH6ESJ1DBY8MK72XER9BG9646QMCS610PE'
const DEPLOYED_CONTRACT_NAME = 'invoicebtc-v4'
const DEPLOYED_SBTC_ADDRESS = 'ST1F7QA2MDF17S807EPA36TSS8AMEFY4KA9TVGWXT'
const TESTNET_API = 'https://api.testnet.hiro.so'
const TESTNET_EXPLORER = 'https://explorer.hiro.so/txid'
const TESTNET_EXPLORER_ADDRESS = 'https://explorer.hiro.so/address'

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function importConfig() {
  // Reset module cache so env stubs take effect for each isolated test
  vi.resetModules()
  return import('@/lib/config')
}

// ─── Default values (no env vars set) ────────────────────────────────────────

describe('config defaults — public testnet only', () => {
  beforeEach(() => {
    // Ensure no NEXT_PUBLIC_* vars are set so we test the hardcoded defaults
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('NETWORK_NAME is testnet', async () => {
    const { NETWORK_NAME } = await importConfig()
    expect(NETWORK_NAME).toBe('testnet')
  })

  it('STACKS_API_BASE defaults to public testnet Hiro API', async () => {
    const { STACKS_API_BASE } = await importConfig()
    expect(STACKS_API_BASE).toBe(TESTNET_API)
    expect(STACKS_API_BASE).not.toContain('localhost')
    expect(STACKS_API_BASE).not.toContain('devnet')
    expect(STACKS_API_BASE).not.toContain('mocknet')
    expect(STACKS_API_BASE).not.toContain('mainnet')
  })

  it('CONTRACT_ADDRESS defaults to the deployed testnet deployer', async () => {
    const { CONTRACT_ADDRESS } = await importConfig()
    expect(CONTRACT_ADDRESS).toBe(DEPLOYED_CONTRACT_ADDRESS)
    // ST-prefix confirms testnet (not SP mainnet)
    expect(CONTRACT_ADDRESS.startsWith('ST')).toBe(true)
  })

  it('CONTRACT_NAME defaults to the deployed invoicebtc-v4', async () => {
    const { CONTRACT_NAME } = await importConfig()
    expect(CONTRACT_NAME).toBe(DEPLOYED_CONTRACT_NAME)
    // Must NOT be an old version
    expect(CONTRACT_NAME).not.toBe('invoicebtc')
    expect(CONTRACT_NAME).not.toBe('invoicebtc-v1')
    expect(CONTRACT_NAME).not.toBe('invoicebtc-v2')
    expect(CONTRACT_NAME).not.toBe('invoicebtc-v3')
  })

  it('SBTC_CONTRACT_ADDRESS defaults to the testnet sBTC contract', async () => {
    const { SBTC_CONTRACT_ADDRESS } = await importConfig()
    expect(SBTC_CONTRACT_ADDRESS).toBe(DEPLOYED_SBTC_ADDRESS)
    expect(SBTC_CONTRACT_ADDRESS.startsWith('ST')).toBe(true)
  })

  it('SBTC_CONTRACT_NAME is sbtc-token', async () => {
    const { SBTC_CONTRACT_NAME } = await importConfig()
    expect(SBTC_CONTRACT_NAME).toBe('sbtc-token')
  })

  it('EXPLORER_BASE defaults to Hiro testnet explorer', async () => {
    const { EXPLORER_BASE } = await importConfig()
    expect(EXPLORER_BASE).toBe(TESTNET_EXPLORER)
    expect(EXPLORER_BASE).not.toContain('localhost')
    expect(EXPLORER_BASE).not.toContain('mainnet')
  })

  it('EXPLORER_SUFFIX is always ?chain=testnet', async () => {
    const { EXPLORER_SUFFIX } = await importConfig()
    expect(EXPLORER_SUFFIX).toBe('?chain=testnet')
  })

  it('EXPLORER_ADDRESS_BASE defaults to Hiro testnet address explorer', async () => {
    const { EXPLORER_ADDRESS_BASE } = await importConfig()
    expect(EXPLORER_ADDRESS_BASE).toBe(TESTNET_EXPLORER_ADDRESS)
  })

  it('NETWORK_LABEL identifies the network as Stacks Public Testnet', async () => {
    const { NETWORK_LABEL } = await importConfig()
    expect(NETWORK_LABEL.toLowerCase()).toContain('testnet')
  })

  it('WALLET_NETWORK_LABEL mentions testnet', async () => {
    const { WALLET_NETWORK_LABEL } = await importConfig()
    expect(WALLET_NETWORK_LABEL.toLowerCase()).toContain('testnet')
  })
})

// ─── Full contract identifiers ────────────────────────────────────────────────

describe('FULL_CONTRACT_ID and FULL_SBTC_ID', () => {
  beforeEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('FULL_CONTRACT_ID is the deployed invoicebtc-v4 principal', async () => {
    const { FULL_CONTRACT_ID } = await importConfig()
    expect(FULL_CONTRACT_ID).toBe(
      `${DEPLOYED_CONTRACT_ADDRESS}.${DEPLOYED_CONTRACT_NAME}`,
    )
  })

  it('FULL_SBTC_ID is the testnet sBTC token principal', async () => {
    const { FULL_SBTC_ID } = await importConfig()
    expect(FULL_SBTC_ID).toBe(`${DEPLOYED_SBTC_ADDRESS}.sbtc-token`)
  })
})

// ─── Explorer URL helpers ─────────────────────────────────────────────────────

describe('explorerTxUrl', () => {
  beforeEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('produces a testnet explorer URL for a txid', async () => {
    const { explorerTxUrl } = await importConfig()
    const url = explorerTxUrl('0xabc123')
    expect(url).toContain('https://explorer.hiro.so/txid/0xabc123')
    expect(url).toContain('?chain=testnet')
  })

  it('never produces a mainnet explorer URL', async () => {
    const { explorerTxUrl } = await importConfig()
    const url = explorerTxUrl('0xabc123')
    expect(url).not.toContain('mainnet')
  })
})

describe('explorerAddressUrl', () => {
  beforeEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('produces a testnet explorer address URL', async () => {
    const { explorerAddressUrl } = await importConfig()
    const url = explorerAddressUrl('ST1YBHMDH6ESJ1DBY8MK72XER9BG9646QMCS610PE')
    expect(url).toContain('https://explorer.hiro.so/address/ST1')
    expect(url).toContain('?chain=testnet')
  })
})

// ─── sBTC unit helpers ────────────────────────────────────────────────────────

describe('satsToBtc / btcToSats', () => {
  beforeEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('converts satoshis to BTC string with 8 decimals', async () => {
    const { satsToBtc } = await importConfig()
    expect(satsToBtc(100000000)).toBe('1')
    expect(satsToBtc(50000000)).toBe('0.5')
    expect(satsToBtc(1)).toBe('0.00000001')
  })

  it('converts BTC string to satoshis', async () => {
    const { btcToSats } = await importConfig()
    expect(btcToSats('1')).toBe(100000000)
    expect(btcToSats('0.5')).toBe(50000000)
    expect(btcToSats('0.00000001')).toBe(1)
  })
})

// ─── Env var overrides work correctly ────────────────────────────────────────
// Verifies that the env var wiring is functional — i.e., operators can point
// to a new contract version without a code change.

describe('env var overrides', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('NEXT_PUBLIC_CONTRACT_NAME overrides the contract name', async () => {
    vi.stubEnv('NEXT_PUBLIC_CONTRACT_NAME', 'invoicebtc-v5')
    const { CONTRACT_NAME } = await importConfig()
    expect(CONTRACT_NAME).toBe('invoicebtc-v5')
  })

  it('NEXT_PUBLIC_CONTRACT_ADDRESS overrides the contract address', async () => {
    vi.stubEnv('NEXT_PUBLIC_CONTRACT_ADDRESS', 'ST2CUSTOM000000000000000000000000000')
    const { CONTRACT_ADDRESS } = await importConfig()
    expect(CONTRACT_ADDRESS).toBe('ST2CUSTOM000000000000000000000000000')
  })

  it('NEXT_PUBLIC_STACKS_API_BASE overrides the API base', async () => {
    vi.stubEnv('NEXT_PUBLIC_STACKS_API_BASE', 'https://custom-api.example.com')
    const { STACKS_API_BASE } = await importConfig()
    expect(STACKS_API_BASE).toBe('https://custom-api.example.com')
  })

  it('NEXT_PUBLIC_SBTC_CONTRACT_ADDRESS overrides the sBTC address', async () => {
    vi.stubEnv('NEXT_PUBLIC_SBTC_CONTRACT_ADDRESS', 'ST3NEW_SBTC_ADDRESS')
    const { SBTC_CONTRACT_ADDRESS } = await importConfig()
    expect(SBTC_CONTRACT_ADDRESS).toBe('ST3NEW_SBTC_ADDRESS')
  })

  it('rejects a localhost API override and falls back to public testnet', async () => {
    vi.stubEnv('NEXT_PUBLIC_STACKS_API_BASE', 'http://localhost:3999')
    const { STACKS_API_BASE } = await importConfig()
    expect(STACKS_API_BASE).toBe(TESTNET_API)
  })

  it('rejects a mainnet contract address override and falls back to the deployed testnet contract', async () => {
    vi.stubEnv('NEXT_PUBLIC_CONTRACT_ADDRESS', 'SP2C2YFP12AJZB4MABJBAJ55XECVS7E4PMMZ89YZR')
    const { CONTRACT_ADDRESS } = await importConfig()
    expect(CONTRACT_ADDRESS).toBe(DEPLOYED_CONTRACT_ADDRESS)
  })

  it('rejects a mainnet explorer override and falls back to the testnet explorer', async () => {
    vi.stubEnv('NEXT_PUBLIC_EXPLORER_BASE', 'https://explorer.hiro.so/txid?chain=mainnet')
    const { EXPLORER_BASE } = await importConfig()
    expect(EXPLORER_BASE).toBe(TESTNET_EXPLORER)
  })
})

// ─── No devnet / localhost fallbacks ─────────────────────────────────────────

describe('no devnet or localhost fallback paths', () => {
  beforeEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('no config value defaults to localhost', async () => {
    const config = await importConfig()
    const values = Object.values(config).filter((v) => typeof v === 'string')
    for (const val of values) {
      expect(val).not.toContain('localhost')
      expect(val).not.toContain('127.0.0.1')
    }
  })

  it('no config value defaults to devnet or mocknet', async () => {
    const config = await importConfig()
    const values = Object.values(config).filter((v) => typeof v === 'string')
    for (const val of values) {
      expect(val.toLowerCase()).not.toContain('devnet')
      expect(val.toLowerCase()).not.toContain('mocknet')
    }
  })
})

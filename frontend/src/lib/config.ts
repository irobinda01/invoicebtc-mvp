// Public testnet-only frontend configuration.
// There is no devnet, mocknet, or mainnet path in this MVP.

export const NETWORK_NAME = 'testnet' as const
export const NETWORK_LABEL = 'Stacks Public Testnet'
export const WALLET_NETWORK_LABEL = 'Leather on Stacks Testnet'

const TESTNET_API_BASE = 'https://api.testnet.hiro.so'
const TESTNET_EXPLORER_BASE = 'https://explorer.hiro.so/txid'
const TESTNET_EXPLORER_ADDRESS_BASE = 'https://explorer.hiro.so/address'
const TESTNET_CONTRACT_ADDRESS = 'ST1YBHMDH6ESJ1DBY8MK72XER9BG9646QMCS610PE'
const TESTNET_CONTRACT_NAME = 'invoicebtc-v4'
const TESTNET_SBTC_CONTRACT_ADDRESS = 'ST1F7QA2MDF17S807EPA36TSS8AMEFY4KA9TVGWXT'
const TESTNET_SBTC_CONTRACT_NAME = 'sbtc-token'

function normalizeEnv(value: string | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

function isTestnetStacksAddress(value: string | null): value is string {
  return !!value && value.toUpperCase().startsWith('ST')
}

function isAllowedTestnetUrl(value: string | null): value is string {
  if (!value) return false

  const lower = value.toLowerCase()
  if (
    lower.includes('localhost') ||
    lower.includes('127.0.0.1') ||
    lower.includes('mainnet') ||
    lower.includes('devnet') ||
    lower.includes('mocknet')
  ) {
    return false
  }

  try {
    const url = new URL(value)
    return url.protocol === 'https:'
  } catch {
    return false
  }
}

function resolveTestnetUrl(envValue: string | undefined, fallback: string) {
  const normalized = normalizeEnv(envValue)
  return isAllowedTestnetUrl(normalized) ? normalized : fallback
}

function resolveTestnetAddress(envValue: string | undefined, fallback: string) {
  const normalized = normalizeEnv(envValue)
  return isTestnetStacksAddress(normalized) ? normalized : fallback
}

function resolveContractName(envValue: string | undefined, fallback: string) {
  return normalizeEnv(envValue) ?? fallback
}

export const STACKS_API_BASE = resolveTestnetUrl(
  process.env.NEXT_PUBLIC_STACKS_API_BASE,
  TESTNET_API_BASE,
)

export const CONTRACT_ADDRESS = resolveTestnetAddress(
  process.env.NEXT_PUBLIC_CONTRACT_ADDRESS,
  TESTNET_CONTRACT_ADDRESS,
)

export const CONTRACT_NAME = resolveContractName(
  process.env.NEXT_PUBLIC_CONTRACT_NAME,
  TESTNET_CONTRACT_NAME,
)

export const SBTC_CONTRACT_ADDRESS = resolveTestnetAddress(
  process.env.NEXT_PUBLIC_SBTC_CONTRACT_ADDRESS,
  TESTNET_SBTC_CONTRACT_ADDRESS,
)

export const SBTC_CONTRACT_NAME = TESTNET_SBTC_CONTRACT_NAME
export const SBTC_TOKEN_NAME = TESTNET_SBTC_CONTRACT_NAME

export const FULL_CONTRACT_ID = `${CONTRACT_ADDRESS}.${CONTRACT_NAME}`
export const FULL_SBTC_ID = `${SBTC_CONTRACT_ADDRESS}.${SBTC_CONTRACT_NAME}`

export const EXPLORER_BASE = resolveTestnetUrl(
  process.env.NEXT_PUBLIC_EXPLORER_BASE,
  TESTNET_EXPLORER_BASE,
)

export const EXPLORER_SUFFIX = '?chain=testnet'

export function explorerTxUrl(txId: string) {
  return `${EXPLORER_BASE}/${txId}${EXPLORER_SUFFIX}`
}

export const EXPLORER_ADDRESS_BASE = resolveTestnetUrl(
  process.env.NEXT_PUBLIC_EXPLORER_ADDRESS_BASE,
  TESTNET_EXPLORER_ADDRESS_BASE,
)

export function explorerAddressUrl(address: string) {
  return `${EXPLORER_ADDRESS_BASE}/${address}${EXPLORER_SUFFIX}`
}

export const SBTC_DECIMALS = 8
export const SBTC_UNIT = 10 ** SBTC_DECIMALS

export function satsToBtc(sats: number | bigint): string {
  const n = typeof sats === 'bigint' ? Number(sats) : sats
  return (n / SBTC_UNIT).toFixed(8).replace(/\.?0+$/, '') || '0'
}

export function btcToSats(btc: string): number {
  return Math.round(parseFloat(btc) * SBTC_UNIT)
}

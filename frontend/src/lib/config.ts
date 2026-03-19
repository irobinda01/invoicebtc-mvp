// Public testnet-only frontend configuration.

export const NETWORK_NAME = 'testnet' as const

// Stacks public testnet API base
export const STACKS_API_BASE =
  process.env.NEXT_PUBLIC_STACKS_API_BASE ??
  'https://api.testnet.hiro.so'

// Deployed invoicebtc contract (format: "ST1XXX...address.contract-name")
export const CONTRACT_ADDRESS =
  process.env.NEXT_PUBLIC_CONTRACT_ADDRESS ?? 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM'

export const CONTRACT_NAME =
  process.env.NEXT_PUBLIC_CONTRACT_NAME ?? 'invoicebtc'

// sBTC-compatible SIP-010 token contract on public testnet
export const SBTC_CONTRACT_ADDRESS =
  process.env.NEXT_PUBLIC_SBTC_CONTRACT_ADDRESS ?? 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM'

export const SBTC_CONTRACT_NAME =
  process.env.NEXT_PUBLIC_SBTC_CONTRACT_NAME ?? 'sbtc-token'

export const SBTC_TOKEN_NAME =
  process.env.NEXT_PUBLIC_SBTC_TOKEN_NAME ?? 'sbtc'

// Full contract identifiers
export const FULL_CONTRACT_ID = `${CONTRACT_ADDRESS}.${CONTRACT_NAME}`
export const FULL_SBTC_ID = `${SBTC_CONTRACT_ADDRESS}.${SBTC_CONTRACT_NAME}`

// Explorer base for transaction links
export const EXPLORER_BASE =
  process.env.NEXT_PUBLIC_EXPLORER_BASE ??
  'https://explorer.hiro.so/txid'

export const EXPLORER_SUFFIX = '?chain=testnet'

export function explorerTxUrl(txId: string) {
  return `${EXPLORER_BASE}/${txId}${EXPLORER_SUFFIX}`
}

// Display label for network
export const NETWORK_LABEL = 'Stacks Public Testnet'

// sBTC has 8 decimals
export const SBTC_DECIMALS = 8
export const SBTC_UNIT = Math.pow(10, SBTC_DECIMALS)

export function satsToBtc(sats: number | bigint): string {
  const n = typeof sats === 'bigint' ? Number(sats) : sats
  return (n / SBTC_UNIT).toFixed(8).replace(/\.?0+$/, '') || '0'
}

export function btcToSats(btc: string): number {
  return Math.round(parseFloat(btc) * SBTC_UNIT)
}

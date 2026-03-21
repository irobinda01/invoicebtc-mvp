// Public testnet-only frontend configuration.

export const NETWORK_NAME = 'testnet' as const

// Stacks public testnet API base
export const STACKS_API_BASE =
  process.env.NEXT_PUBLIC_STACKS_API_BASE ??
  'https://api.testnet.hiro.so'

// Deployed invoicebtc contract (format: "ST1XXX...address.contract-name")
export const CONTRACT_ADDRESS =
  process.env.NEXT_PUBLIC_CONTRACT_ADDRESS ?? 'ST1YBHMDH6ESJ1DBY8MK72XER9BG9646QMCS610PE'

export const CONTRACT_NAME =
  process.env.NEXT_PUBLIC_CONTRACT_NAME ?? 'invoicebtc-v3'

// sBTC SIP-010 token contract — address used by the deployed invoicebtc contract on testnet.
export const SBTC_CONTRACT_ADDRESS = 'ST1F7QA2MDF17S807EPA36TSS8AMEFY4KA9TVGWXT'

export const SBTC_CONTRACT_NAME = 'sbtc-token'

export const SBTC_TOKEN_NAME = 'sbtc-token'

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

export const EXPLORER_ADDRESS_BASE =
  process.env.NEXT_PUBLIC_EXPLORER_ADDRESS_BASE ??
  'https://explorer.hiro.so/address'

export function explorerAddressUrl(address: string) {
  return `${EXPLORER_ADDRESS_BASE}/${address}?chain=testnet`
}

// Display label for network
export const NETWORK_LABEL = 'Stacks Public Testnet'
export const WALLET_NETWORK_LABEL = 'Leather on Stacks Testnet'

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

export const TESTNET_NETWORK = 'testnet' as const
export const TESTNET_ADDRESS_PREFIX = 'ST'
export const LEATHER_PROVIDER_ID = 'LeatherProvider'
export const WALLET_INSTALL_URL = 'https://leather.io/install-extension'

export const WALLET_STATUS = {
  disconnected: 'disconnected',
  connecting: 'connecting',
  connected: 'connected',
  wrongNetwork: 'wrong-network',
  unavailable: 'wallet-unavailable',
  rejected: 'rejected',
  error: 'error',
} as const

export type WalletStatus = (typeof WALLET_STATUS)[keyof typeof WALLET_STATUS]

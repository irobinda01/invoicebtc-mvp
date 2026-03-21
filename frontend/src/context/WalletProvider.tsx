'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { Role } from '@/lib/types'
import {
  disconnectWallet,
  getStoredWalletSnapshot,
  getWalletAvailability,
  refreshLeatherTestnetSession,
  requestContractCall,
  connectLeatherTestnet,
  signStacksMessage,
} from '@/lib/wallet/client'
import type { ContractCallRequest, SignMessageResult } from '@/lib/wallet/client'
import { WALLET_STATUS, type WalletStatus } from '@/lib/wallet/constants'
import {
  getWalletErrorMessage,
  isLeatherRejectedError,
  isTestnetAddress,
  isWrongNetworkError,
} from '@/lib/wallet/utils'

interface WalletContextValue {
  address: string | null
  status: WalletStatus
  isConnected: boolean
  isReady: boolean
  isWrongNetwork: boolean
  isAvailable: boolean
  isBootstrapping: boolean
  connecting: boolean
  selectedRole: Role
  walletError: string | null
  walletLabel: string
  connect: () => Promise<void>
  reconnect: () => Promise<void>
  disconnect: () => void
  clearWalletError: () => void
  setSelectedRole: (role: Role) => void
  requestContractCall: (params: ContractCallRequest) => Promise<{ txid?: string; transaction?: string }>
  signMessage: (message: string) => Promise<SignMessageResult>
}

const WalletContext = createContext<WalletContextValue | null>(null)

function getInitialRole(): Role {
  if (typeof window === 'undefined') return 'observer'
  const storedRole = window.localStorage.getItem('invoicebtc_demo_role') as Role | null
  return storedRole ?? 'observer'
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const [address, setAddress] = useState<string | null>(null)
  const [status, setStatus] = useState<WalletStatus>(WALLET_STATUS.disconnected)
  const [walletError, setWalletError] = useState<string | null>(null)
  const [selectedRole, setSelectedRoleState] = useState<Role>(getInitialRole)
  const [connecting, setConnecting] = useState(false)
  const [isAvailable, setIsAvailable] = useState(false)
  const [isBootstrapping, setIsBootstrapping] = useState(true)

  const isWrongNetwork = status === WALLET_STATUS.wrongNetwork
  const isConnected = status === WALLET_STATUS.connected
  const isReady = isConnected && !isWrongNetwork

  const setSelectedRole = useCallback((role: Role) => {
    setSelectedRoleState(role)
    try {
      window.localStorage.setItem('invoicebtc_demo_role', role)
    } catch {}
  }, [])

  const syncFromSnapshot = useCallback((nextAddress: string | null, nextStatus?: WalletStatus) => {
    setAddress(nextAddress)
    setStatus(nextStatus ?? (nextAddress ? WALLET_STATUS.connected : WALLET_STATUS.disconnected))
  }, [])

  // On mount: silent, synchronous restore from @stacks/connect localStorage.
  // No wallet API call — avoids popups or latency on page refresh.
  useEffect(() => {
    const available = getWalletAvailability()
    setIsAvailable(available)

    if (!available) {
      setStatus(WALLET_STATUS.unavailable)
      setIsBootstrapping(false)
      return
    }

    const snapshot = getStoredWalletSnapshot()

    if (!snapshot.isConnected || !snapshot.address) {
      setStatus(WALLET_STATUS.disconnected)
      setIsBootstrapping(false)
      return
    }

    // Validate the persisted address is a Stacks testnet address (ST prefix).
    if (isTestnetAddress(snapshot.address)) {
      setAddress(snapshot.address)
      setStatus(WALLET_STATUS.connected)
    } else {
      setStatus(WALLET_STATUS.wrongNetwork)
      setWalletError(
        'Previously connected address is not on Stacks testnet. Switch Leather to Testnet and reconnect.',
      )
    }

    setIsBootstrapping(false)
  }, []) // intentionally empty — runs once on mount

  // reconnect() is the explicit "Re-check Leather" action.
  // It calls the wallet API to refresh addresses from the live extension state.
  const reconnect = useCallback(async () => {
    const available = getWalletAvailability()
    setIsAvailable(available)

    if (!available) {
      syncFromSnapshot(null, WALLET_STATUS.unavailable)
      return
    }

    const snapshot = getStoredWalletSnapshot()

    if (!snapshot.isConnected) {
      syncFromSnapshot(null, WALLET_STATUS.disconnected)
      return
    }

    try {
      const refreshed = await refreshLeatherTestnetSession()
      if (refreshed.address) {
        syncFromSnapshot(refreshed.address, WALLET_STATUS.connected)
        setWalletError(null)
      } else {
        syncFromSnapshot(null, WALLET_STATUS.wrongNetwork)
        setWalletError(
          'Leather is connected, but no Stacks testnet address was found. Switch Leather to Testnet.',
        )
      }
    } catch (error) {
      if (isWrongNetworkError(error)) {
        syncFromSnapshot(null, WALLET_STATUS.wrongNetwork)
      } else {
        syncFromSnapshot(
          snapshot.address && isTestnetAddress(snapshot.address) ? snapshot.address : null,
          snapshot.address ? WALLET_STATUS.wrongNetwork : WALLET_STATUS.disconnected,
        )
      }
      setWalletError(getWalletErrorMessage(error))
    }
  }, [syncFromSnapshot])

  const connect = useCallback(async () => {
    const available = getWalletAvailability()
    setIsAvailable(available)

    if (!available) {
      setStatus(WALLET_STATUS.unavailable)
      setWalletError('Leather was not detected in this browser. Install the Leather extension to continue.')
      return
    }

    setConnecting(true)
    setStatus(WALLET_STATUS.connecting)
    setWalletError(null)

    try {
      const response = await connectLeatherTestnet()
      if (!response.address) {
        setAddress(null)
        setStatus(WALLET_STATUS.wrongNetwork)
        setWalletError(
          'Leather connected, but no Stacks testnet address was returned. Switch Leather to Testnet and reconnect.',
        )
        return
      }

      setAddress(response.address)
      setStatus(WALLET_STATUS.connected)
      setWalletError(null)
    } catch (error) {
      setAddress(null)
      if (isLeatherRejectedError(error)) {
        setStatus(WALLET_STATUS.rejected)
      } else if (isWrongNetworkError(error)) {
        setStatus(WALLET_STATUS.wrongNetwork)
      } else {
        setStatus(WALLET_STATUS.error)
      }
      setWalletError(getWalletErrorMessage(error))
    } finally {
      setConnecting(false)
    }
  }, [])

  const disconnect = useCallback(() => {
    disconnectWallet()
    setAddress(null)
    setStatus(isAvailable ? WALLET_STATUS.disconnected : WALLET_STATUS.unavailable)
    setWalletError(null)
    setConnecting(false)
  }, [isAvailable])

  const guardedContractCall = useCallback(
    async (params: ContractCallRequest) => {
      if (!isAvailable) {
        throw new Error('Leather is not available in this browser.')
      }
      if (!address) {
        throw new Error('Connect Leather before submitting a transaction.')
      }
      if (!isReady) {
        throw new Error('Switch Leather to Stacks Testnet before submitting a transaction.')
      }
      return requestContractCall(params)
    },
    [address, isAvailable, isReady],
  )

  const guardedSignMessage = useCallback(
    async (message: string): Promise<SignMessageResult> => {
      if (!isAvailable) {
        throw new Error('Leather is not available in this browser.')
      }
      if (!address) {
        throw new Error('Connect Leather before signing a message.')
      }
      if (!isReady) {
        throw new Error('Switch Leather to Stacks Testnet before signing a message.')
      }
      return signStacksMessage(message)
    },
    [address, isAvailable, isReady],
  )

  const value = useMemo<WalletContextValue>(
    () => ({
      address,
      status,
      isConnected,
      isReady,
      isWrongNetwork,
      isAvailable,
      isBootstrapping,
      connecting,
      selectedRole,
      walletError,
      walletLabel: 'Leather',
      connect,
      reconnect,
      disconnect,
      clearWalletError: () => setWalletError(null),
      setSelectedRole,
      requestContractCall: guardedContractCall,
      signMessage: guardedSignMessage,
    }),
    [
      address,
      status,
      isConnected,
      isReady,
      isWrongNetwork,
      isAvailable,
      isBootstrapping,
      connecting,
      selectedRole,
      walletError,
      connect,
      reconnect,
      disconnect,
      setSelectedRole,
      guardedContractCall,
      guardedSignMessage,
    ],
  )

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>
}

export function useWalletContext() {
  const context = useContext(WalletContext)
  if (!context) {
    throw new Error('useWalletContext must be used within WalletProvider')
  }
  return context
}

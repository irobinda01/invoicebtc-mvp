'use client'

import { useState, useEffect, useCallback } from 'react'
import type { Role } from './types'

export interface WalletState {
  address: string | null
  isConnected: boolean
  connecting: boolean
  selectedRole: Role
  connect: () => void
  disconnect: () => void
  setSelectedRole: (role: Role) => void
}

// SSR-safe wallet hook using @stacks/connect
export function useWallet(): WalletState {
  const [address, setAddress] = useState<string | null>(null)
  const [connecting, setConnecting] = useState(false)
  const [selectedRole, setSelectedRoleState] = useState<Role>('observer')

  // Restore session on mount
  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const stored = localStorage.getItem('invoicebtc_wallet_address')
      if (stored) setAddress(stored)
      const storedRole = localStorage.getItem('invoicebtc_demo_role') as Role | null
      if (storedRole) setSelectedRoleState(storedRole)
    } catch { /* ignore */ }
  }, [])

  const setSelectedRole = useCallback((role: Role) => {
    setSelectedRoleState(role)
    try {
      localStorage.setItem('invoicebtc_demo_role', role)
    } catch { /* ignore */ }
  }, [])

  const connect = useCallback(async () => {
    if (typeof window === 'undefined') return
    setConnecting(true)
    try {
      const { showConnect } = await import('@stacks/connect')
      showConnect({
        appDetails: {
          name: 'InvoiceBTC',
          icon: `${window.location.origin}/favicon.ico`,
        },
        onFinish: (data) => {
          const addr = data.userSession.loadUserData().profile.stxAddress.testnet
          setAddress(addr)
          try {
            localStorage.setItem('invoicebtc_wallet_address', addr)
          } catch { /* ignore */ }
          setConnecting(false)
        },
        onCancel: () => {
          setConnecting(false)
        },
      })
    } catch (e) {
      console.error('connect error', e)
      setConnecting(false)
    }
  }, [])

  const disconnect = useCallback(() => {
    setAddress(null)
    try {
      localStorage.removeItem('invoicebtc_wallet_address')
    } catch { /* ignore */ }
  }, [])

  return {
    address,
    isConnected: !!address,
    connecting,
    selectedRole,
    connect,
    disconnect,
    setSelectedRole,
  }
}

// Build the network object for contract calls
export async function getNetwork() {
  const { StacksTestnet } = await import('@stacks/network')
  return new StacksTestnet()
}

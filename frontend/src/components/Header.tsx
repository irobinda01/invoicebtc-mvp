'use client'

import Link from 'next/link'
import { NETWORK_LABEL } from '@/lib/config'
import { useWallet } from '@/lib/useWallet'
import type { Role } from '@/lib/types'

function shortenAddr(addr: string) {
  return `${addr.slice(0, 8)}...${addr.slice(-6)}`
}

const ROLE_OPTIONS: Role[] = ['merchant', 'client', 'lp', 'observer']

export function Header() {
  const {
    address,
    isConnected,
    connect,
    disconnect,
    connecting,
    selectedRole,
    setSelectedRole,
  } = useWallet()

  return (
    <header className="border-b border-gray-800 bg-gray-950">
      <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
        <Link href="/" className="flex items-center gap-2 text-orange-500 font-bold text-lg tracking-tight">
          <span className="text-xl">BTC</span>
          <span>InvoiceBTC</span>
        </Link>

        <div className="flex items-center gap-3 flex-wrap justify-end">
          <label className="hidden md:flex items-center gap-2 text-xs text-gray-400">
            <span>Demo role</span>
            <select
              value={selectedRole}
              onChange={(e) => setSelectedRole(e.target.value as Role)}
              className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-200"
            >
              {ROLE_OPTIONS.map((role) => (
                <option key={role} value={role}>
                  {role}
                </option>
              ))}
            </select>
          </label>

          <span className="hidden sm:inline px-2 py-1 rounded text-xs bg-gray-800 text-gray-400 font-mono">
            {NETWORK_LABEL}
          </span>

          {isConnected && address ? (
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs text-gray-300 bg-gray-800 px-2 py-1 rounded select-all">
                {shortenAddr(address)}
              </span>
              <button
                onClick={disconnect}
                className="text-xs text-gray-500 hover:text-red-400 transition-colors"
              >
                Disconnect
              </button>
            </div>
          ) : (
            <button
              onClick={connect}
              disabled={connecting}
              className="px-4 py-1.5 bg-orange-500 hover:bg-orange-600 disabled:opacity-60 text-white text-sm font-semibold rounded transition-colors"
            >
              {connecting ? 'Connecting...' : 'Connect Wallet'}
            </button>
          )}
        </div>
      </div>
    </header>
  )
}

'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useWallet } from '@/lib/useWallet'
import { fetchInvoice, fetchNextInvoiceId } from '@/lib/contract'
import { NETWORK_LABEL } from '@/lib/config'

export default function HomePage() {
  const { address, isConnected, connect, connecting, selectedRole, setSelectedRole } = useWallet()
  const router = useRouter()
  const [invoiceIdInput, setInvoiceIdInput] = useState('')
  const [lookupError, setLookupError] = useState('')
  const [looking, setLooking] = useState(false)

  async function handleLookup(e: React.FormEvent) {
    e.preventDefault()
    const id = parseInt(invoiceIdInput.trim(), 10)
    if (isNaN(id) || id < 1) {
      setLookupError('Enter a valid invoice ID (number >= 1)')
      return
    }
    setLooking(true)
    setLookupError('')
    try {
      const invoice = await fetchInvoice(id)
      if (!invoice) {
        setLookupError(`Invoice #${id} not found on-chain.`)
      } else {
        router.push(`/invoices/${id}`)
      }
    } catch {
      setLookupError('Failed to fetch invoice. Check network.')
    } finally {
      setLooking(false)
    }
  }

  async function handleViewLatest() {
    setLooking(true)
    try {
      const latestId = await fetchNextInvoiceId()
      if (latestId < 1) {
        setLookupError('No invoices exist yet.')
        return
      }
      router.push(`/invoices/${latestId}`)
    } catch {
      setLookupError('Failed to fetch latest invoice.')
    } finally {
      setLooking(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="text-center mb-10">
        <div className="text-5xl font-bold text-orange-500 mb-2">sBTC</div>
        <h1 className="text-3xl font-bold text-white mb-2">InvoiceBTC</h1>
        <p className="text-gray-400 text-lg">
          Escrow-backed invoice factoring on Stacks.
          <br />
          Merchants unlock staged sBTC liquidity. LPs advance milestone by milestone.
        </p>
        <div className="mt-2 inline-flex items-center gap-2 px-3 py-1 bg-gray-800 rounded-full">
          <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
          <span className="text-xs text-gray-400">{NETWORK_LABEL}</span>
        </div>
      </div>

      {!isConnected ? (
        <div className="bg-gray-900 border border-gray-700 rounded-xl p-8 text-center mb-6">
          <h2 className="text-lg font-semibold text-white mb-2">Connect Your Wallet</h2>
          <p className="text-gray-400 text-sm mb-5">
            Use Leather or Xverse testnet wallet to act as Merchant, Client, or LP.
          </p>
          <button
            onClick={connect}
            disabled={connecting}
            className="px-6 py-3 bg-orange-500 hover:bg-orange-600 disabled:opacity-60 text-white font-bold rounded-lg transition-colors text-base"
          >
            {connecting ? 'Connecting...' : 'Connect Wallet'}
          </button>
        </div>
      ) : (
        <div className="bg-gray-900 border border-green-800 rounded-xl p-5 mb-6">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-2 h-2 rounded-full bg-green-400" />
            <span className="text-sm text-green-400 font-medium">Wallet Connected</span>
          </div>
          <div className="font-mono text-sm text-gray-300 break-all select-all">{address}</div>
          <div className="mt-3 flex items-center gap-3 flex-wrap">
            <span className="text-xs text-gray-500 uppercase tracking-wide">Selected role</span>
            <div className="flex gap-2">
              {(['merchant', 'client', 'lp', 'observer'] as const).map((role) => (
                <button
                  key={role}
                  type="button"
                  onClick={() => setSelectedRole(role)}
                  className={`px-3 py-1 rounded-full text-xs font-medium capitalize border ${
                    selectedRole === role
                      ? 'bg-orange-500 text-white border-orange-400'
                      : 'bg-gray-800 text-gray-400 border-gray-700'
                  }`}
                >
                  {role}
                </button>
              ))}
            </div>
            <span className="text-xs text-gray-500">Wallet address still controls on-chain permissions.</span>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
        <Link
          href="/invoices/new"
          className={`flex flex-col gap-1 p-5 rounded-xl border transition-colors ${
            isConnected
              ? 'bg-gray-900 border-gray-700 hover:border-orange-500 cursor-pointer'
              : 'bg-gray-900/40 border-gray-800 cursor-not-allowed opacity-50'
          }`}
          onClick={(e) => {
            if (!isConnected) e.preventDefault()
          }}
        >
          <span className="text-xl">Create</span>
          <span className="font-semibold text-white">Create Invoice</span>
          <span className="text-sm text-gray-400">Merchant creates a milestone-based invoice in sBTC</span>
        </Link>

        <div className="flex flex-col gap-3 p-5 bg-gray-900 border border-gray-700 rounded-xl">
          <div className="flex items-center gap-2">
            <span className="text-xl">View</span>
            <span className="font-semibold text-white">View Invoice</span>
          </div>
          <form onSubmit={handleLookup} className="flex gap-2">
            <input
              type="number"
              min="1"
              placeholder="Invoice ID"
              value={invoiceIdInput}
              onChange={(e) => {
                setInvoiceIdInput(e.target.value)
                setLookupError('')
              }}
              className="flex-1 px-3 py-2 bg-gray-800 border border-gray-600 rounded text-white text-sm focus:outline-none focus:border-orange-500"
            />
            <button
              type="submit"
              disabled={looking}
              className="px-4 py-2 bg-orange-500 hover:bg-orange-600 disabled:opacity-60 text-white text-sm font-semibold rounded transition-colors"
            >
              {looking ? '...' : 'Go'}
            </button>
          </form>
          <button
            onClick={handleViewLatest}
            disabled={looking}
            className="text-sm text-gray-400 hover:text-orange-400 transition-colors text-left"
          >
            View latest invoice {'->'}
          </button>
          {lookupError && <p className="text-sm text-red-400">{lookupError}</p>}
        </div>
      </div>

      <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-6">
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-4">
          Demo Flow (3 browser profiles)
        </h2>
        <ol className="space-y-2 text-sm text-gray-300">
          {[
            ['Merchant', 'Creates invoice with milestones'],
            ['Client', 'Signs the invoice on-chain'],
            ['Merchant', 'Signs the invoice on-chain'],
            ['Client', 'Deposits full escrow in sBTC'],
            ['LP', 'Funds only milestone 1 at a discount'],
            ['Merchant', 'Submits milestone completion proof'],
            ['Client', 'Confirms milestone on-chain'],
            ['LP', 'Funds the next unlocked milestone'],
            ['LP', 'At maturity, settles approved milestones from escrow'],
          ].map(([who, what], i) => (
            <li key={i} className="flex items-start gap-3">
              <span className="flex-shrink-0 w-5 h-5 rounded-full bg-gray-800 text-gray-500 text-xs flex items-center justify-center font-mono">
                {i + 1}
              </span>
              <span>
                <span className="font-medium text-white">{who}</span>
                {' - '}
                <span className="text-gray-400">{what}</span>
              </span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  )
}

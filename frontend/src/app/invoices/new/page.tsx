'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useWallet } from '@/lib/useWallet'
import { strToBytes32 } from '@/lib/contract'
import { btcToSats, satsToBtc, CONTRACT_ADDRESS, CONTRACT_NAME, NETWORK_LABEL, STACKS_API_BASE } from '@/lib/config'
import { TxResult } from '@/components/TxResult'

interface MilestoneInput {
  description: string
  faceValueBtc: string   // BTC display string
  discountPct: string    // e.g. "5" = 5%
  dueInBlocks: string    // blocks from now
}

const EMPTY_MILESTONE: MilestoneInput = {
  description: '',
  faceValueBtc: '',
  discountPct: '5',
  dueInBlocks: '144', // ~1 day
}

export default function NewInvoicePage() {
  const { address, isConnected, connect, connecting, selectedRole } = useWallet()
  const router = useRouter()

  const [clientAddress, setClientAddress] = useState('')
  const [fundingDeadlineBlocks, setFundingDeadlineBlocks] = useState('72')  // blocks from now
  const [maturityExtraBlocks, setMaturityExtraBlocks] = useState('288')     // blocks after funding deadline
  const [metadata, setMetadata] = useState('')
  const [milestones, setMilestones] = useState<MilestoneInput[]>([{ ...EMPTY_MILESTONE }])

  const [txId, setTxId] = useState<string | null>(null)
  const [txError, setTxError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  function addMilestone() {
    if (milestones.length >= 3) return // keep demo simple
    setMilestones([...milestones, { ...EMPTY_MILESTONE }])
  }

  function removeMilestone(i: number) {
    if (milestones.length === 1) return
    setMilestones(milestones.filter((_, idx) => idx !== i))
  }

  function updateMilestone(i: number, field: keyof MilestoneInput, val: string) {
    const updated = [...milestones]
    updated[i] = { ...updated[i], [field]: val }
    setMilestones(updated)
  }

  function calcMerchantPayout(faceValueBtc: string, discountPct: string): number {
    const face = btcToSats(faceValueBtc) || 0
    const disc = parseFloat(discountPct) / 100
    return Math.round(face * (1 - disc))
  }

  function totalFaceValue(): number {
    return milestones.reduce((sum, m) => sum + (btcToSats(m.faceValueBtc) || 0), 0)
  }

  function totalMerchantPayout(): number {
    return milestones.reduce((sum, m) => sum + calcMerchantPayout(m.faceValueBtc, m.discountPct), 0)
  }

  function validate(): string | null {
    if (!address) return 'Wallet not connected'
    if (!clientAddress.trim()) return 'Client address required'
    if (clientAddress.trim() === address) return 'Client cannot be same as merchant'
    for (let i = 0; i < milestones.length; i++) {
      const m = milestones[i]
      const face = btcToSats(m.faceValueBtc)
      if (!face || face <= 0) return `Milestone ${i + 1}: invalid face value`
      const disc = parseFloat(m.discountPct)
      if (isNaN(disc) || disc < 0 || disc >= 100) return `Milestone ${i + 1}: discount must be 0-99%`
      const due = parseInt(m.dueInBlocks)
      if (isNaN(due) || due < 1) return `Milestone ${i + 1}: invalid due blocks`
    }
    if (parseInt(fundingDeadlineBlocks) < 1) return 'Funding deadline must be > 0 blocks'
    return null
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const err = validate()
    if (err) { setTxError(err); return }

    setLoading(true)
    setTxError(null)
    setTxId(null)

    try {
      const {
        uintCV,
        standardPrincipalCV,
        bufferCV,
        listCV,
      } = await import('@stacks/transactions')
      const { openContractCall } = await import('@stacks/connect')
      const { getNetwork } = await import('@/lib/useWallet')

      // We need current block height to compute absolute heights.
      // Fetch from Stacks API.
      const infoRes = await fetch(`${STACKS_API_BASE}/v2/info`)
      const info = await infoRes.json() as { burn_block_height?: number; stacks_tip_height?: number }
      const currentHeight = info.stacks_tip_height ?? info.burn_block_height ?? 0

      const fundingDeadline = currentHeight + parseInt(fundingDeadlineBlocks)
      const maturityHeight = fundingDeadline + parseInt(maturityExtraBlocks)

      // Build milestone arrays
      const faceValues: ReturnType<typeof uintCV>[] = []
      const merchantPayouts: ReturnType<typeof uintCV>[] = []
      const lpRepayments: ReturnType<typeof uintCV>[] = []
      const dueHeights: ReturnType<typeof uintCV>[] = []

      let cumulativeBlocks = 0
      for (const m of milestones) {
        const face = btcToSats(m.faceValueBtc)
        const payout = calcMerchantPayout(m.faceValueBtc, m.discountPct)
        const dueBlocks = parseInt(m.dueInBlocks)
        cumulativeBlocks += dueBlocks
        // milestone due height must be <= maturity height
        const dueHeight = Math.min(currentHeight + cumulativeBlocks, maturityHeight)

        faceValues.push(uintCV(face))
        merchantPayouts.push(uintCV(payout))
        lpRepayments.push(uintCV(face)) // lp-repayment == face-value per contract rule
        dueHeights.push(uintCV(dueHeight))
      }

      const metaBytes = strToBytes32(metadata || 'InvoiceBTC MVP')
      const network = await getNetwork()

      await openContractCall({
        network,
        contractAddress: CONTRACT_ADDRESS,
        contractName: CONTRACT_NAME,
        functionName: 'create-invoice',
        functionArgs: [
          standardPrincipalCV(clientAddress.trim()),
          uintCV(totalFaceValue()),
          uintCV(fundingDeadline),
          uintCV(maturityHeight),
          bufferCV(metaBytes),
          listCV(faceValues),
          listCV(merchantPayouts),
          listCV(lpRepayments),
          listCV(dueHeights),
        ],
        postConditionMode: 1, // allow
        onFinish: (data) => {
          setTxId(data.txId)
          setLoading(false)
          // Poll for the new invoice ID and redirect
          setTimeout(() => router.push('/'), 4000)
        },
        onCancel: () => {
          setLoading(false)
          setTxError('Transaction cancelled.')
        },
      })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setTxError(msg)
      setLoading(false)
    }
  }

  if (!isConnected) {
    return (
      <div className="max-w-lg mx-auto text-center py-20">
        <p className="text-gray-400 mb-4">Connect your wallet to create an invoice.</p>
        <button
          onClick={connect}
          disabled={connecting}
          className="px-6 py-3 bg-orange-500 hover:bg-orange-600 text-white font-bold rounded-lg"
        >
          {connecting ? 'Connecting...' : 'Connect Wallet'}
        </button>
      </div>
    )
  }

  const faceTotal = totalFaceValue()
  const payoutTotal = totalMerchantPayout()

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-white mb-1">Create Invoice</h1>
      <p className="text-gray-400 text-sm mb-6">
        Merchant: <span className="font-mono text-gray-300 select-all">{address}</span>
      </p>
      <p className="text-gray-500 text-xs mb-6">
        Network: {NETWORK_LABEL} | Selected role: {selectedRole} | On-chain authority still comes from the connected wallet.
      </p>

      <form onSubmit={handleSubmit} className="space-y-6">

        {/* Parties */}
        <section className="bg-gray-900 border border-gray-700 rounded-xl p-5 space-y-4">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide">Parties</h2>

          <div>
            <label className="block text-sm text-gray-300 mb-1">Client Address *</label>
            <input
              type="text"
              required
              value={clientAddress}
              onChange={(e) => setClientAddress(e.target.value)}
              placeholder="ST2... testnet address"
              className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded text-white text-sm font-mono focus:outline-none focus:border-orange-500"
            />
            <p className="text-xs text-gray-500 mt-1">The client wallet that will sign and fund escrow.</p>
          </div>
        </section>

        {/* Terms */}
        <section className="bg-gray-900 border border-gray-700 rounded-xl p-5 space-y-4">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide">Terms</h2>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-300 mb-1">Funding Deadline</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="1"
                  value={fundingDeadlineBlocks}
                  onChange={(e) => setFundingDeadlineBlocks(e.target.value)}
                  className="w-24 px-3 py-2 bg-gray-800 border border-gray-600 rounded text-white text-sm focus:outline-none focus:border-orange-500"
                />
                <span className="text-sm text-gray-400">blocks (~{Math.round(parseInt(fundingDeadlineBlocks || '0') * 10 / 60)}h)</span>
              </div>
              <p className="text-xs text-gray-500 mt-1">LP milestone advances must start within this window after escrow is deposited.</p>
            </div>
            <div>
              <label className="block text-sm text-gray-300 mb-1">Maturity (after funding deadline)</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="1"
                  value={maturityExtraBlocks}
                  onChange={(e) => setMaturityExtraBlocks(e.target.value)}
                  className="w-24 px-3 py-2 bg-gray-800 border border-gray-600 rounded text-white text-sm focus:outline-none focus:border-orange-500"
                />
                <span className="text-sm text-gray-400">more blocks</span>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm text-gray-300 mb-1">Reference / Notes (max 32 chars)</label>
            <input
              type="text"
              maxLength={32}
              value={metadata}
              onChange={(e) => setMetadata(e.target.value)}
              placeholder="e.g. Web redesign project Q2 2025"
              className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded text-white text-sm focus:outline-none focus:border-orange-500"
            />
          </div>
        </section>

        {/* Milestones */}
        <section className="bg-gray-900 border border-gray-700 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide">Milestones</h2>
            {milestones.length < 3 && (
              <button
                type="button"
                onClick={addMilestone}
                className="text-xs text-orange-500 hover:text-orange-400 font-medium"
              >
                + Add milestone
              </button>
            )}
          </div>

          {milestones.map((m, i) => {
            const face = btcToSats(m.faceValueBtc) || 0
            const payout = calcMerchantPayout(m.faceValueBtc, m.discountPct)
            const lpProfit = face - payout

            return (
              <div key={i} className="bg-gray-800 rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-white">Milestone {i + 1}</span>
                  {milestones.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeMilestone(i)}
                      className="text-xs text-red-400 hover:text-red-300"
                    >
                      Remove
                    </button>
                  )}
                </div>

                <div>
                  <label className="block text-xs text-gray-400 mb-1">Description</label>
                  <input
                    type="text"
                    value={m.description}
                    onChange={(e) => updateMilestone(i, 'description', e.target.value)}
                    placeholder="e.g. Design mockups delivered"
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white text-sm focus:outline-none focus:border-orange-500"
                  />
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Face Value (sBTC)</label>
                    <input
                      type="number"
                      step="0.00000001"
                      min="0.00000001"
                      required
                      value={m.faceValueBtc}
                      onChange={(e) => updateMilestone(i, 'faceValueBtc', e.target.value)}
                      placeholder="0.01"
                      className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white text-sm focus:outline-none focus:border-orange-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Discount %</label>
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      max="99"
                      value={m.discountPct}
                      onChange={(e) => updateMilestone(i, 'discountPct', e.target.value)}
                      className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white text-sm focus:outline-none focus:border-orange-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Due In (blocks)</label>
                    <input
                      type="number"
                      min="1"
                      value={m.dueInBlocks}
                      onChange={(e) => updateMilestone(i, 'dueInBlocks', e.target.value)}
                      className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white text-sm focus:outline-none focus:border-orange-500"
                    />
                  </div>
                </div>

                {face > 0 && (
                  <div className="text-xs text-gray-500 flex gap-4">
                    <span>Merchant receives: <span className="text-green-400 font-mono">{satsToBtc(payout)} sBTC</span></span>
                    <span>LP earns: <span className="text-purple-400 font-mono">{satsToBtc(lpProfit)} sBTC</span></span>
                  </div>
                )}
              </div>
            )
          })}

          {/* Summary */}
          {faceTotal > 0 && (
            <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-700">
              <div className="text-xs text-gray-400 uppercase tracking-wide mb-2">Invoice Summary</div>
              <div className="grid grid-cols-3 gap-2 text-sm">
                <div>
                  <div className="text-gray-400">Client Escrows</div>
                  <div className="font-mono font-semibold text-white">{satsToBtc(faceTotal)} sBTC</div>
                </div>
                <div>
                  <div className="text-gray-400">Total LP Advances</div>
                  <div className="font-mono font-semibold text-green-400">{satsToBtc(payoutTotal)} sBTC</div>
                </div>
                <div>
                  <div className="text-gray-400">LP Profit</div>
                  <div className="font-mono font-semibold text-purple-400">{satsToBtc(faceTotal - payoutTotal)} sBTC</div>
                </div>
              </div>
            </div>
          )}
        </section>

        <TxResult txId={txId} error={txError} loading={loading} label="Create Invoice" />

        {txId && (
          <p className="text-sm text-gray-400 text-center">
            Invoice created! Redirecting to home... or{' '}
            <button
              type="button"
              onClick={() => router.push('/')}
              className="text-orange-500 underline"
            >
              go now
            </button>
          </p>
        )}

        {!txId && (
          <button
            type="submit"
            disabled={loading || !isConnected}
            className="w-full py-3 bg-orange-500 hover:bg-orange-600 disabled:opacity-60 text-white font-bold rounded-xl text-base transition-colors"
          >
            {loading ? 'Submitting...' : 'Create Invoice on Chain'}
          </button>
        )}
      </form>
    </div>
  )
}

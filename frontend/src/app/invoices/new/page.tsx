'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useWallet } from '@/lib/useWallet'
import { useTxStatus } from '@/lib/useTxStatus'
import { fetchChainInfo, fetchNextInvoiceId, strToBytes32 } from '@/lib/contract'
import { btcToSats, satsToBtc, CONTRACT_ADDRESS, CONTRACT_NAME, NETWORK_LABEL } from '@/lib/config'
import { normalizeWalletError, isTestnetAddress } from '@/lib/wallet/utils'
import { RoleSwitcher } from '@/components/RoleSwitcher'
import { TxResult } from '@/components/TxResult'
import { Button, EmptyState, Field, Input, MetricCard, PageContainer, Section, Surface } from '@/components/ui'
import { WALLET_INSTALL_URL } from '@/lib/wallet/constants'

function blocksToHuman(blocks: string): string {
  const n = parseInt(blocks)
  if (isNaN(n) || n <= 0) return ''
  const mins = n * 10
  if (mins < 60) return `≈ ${mins} min`
  const hours = mins / 60
  if (hours < 48) return `≈ ${Math.round(hours)}h`
  return `≈ ${Math.round(hours / 24)}d`
}

function BlockHint({ blocks, label }: { blocks: string; label: string }) {
  const human = blocksToHuman(blocks)
  if (!human) return null
  return (
    <div className="flex items-center gap-2">
      <span className="inline-flex items-center rounded-md border border-[rgba(228,177,92,0.22)] bg-[rgba(228,177,92,0.08)] px-2 py-0.5 text-[11px] font-semibold text-[var(--accent)]">
        {human}
      </span>
      <span className="text-xs text-[var(--text-muted)]">{label}</span>
    </div>
  )
}

interface MilestoneInput {
  description: string
  faceValueBtc: string
  discountPct: string
  dueInBlocks: string
}

const EMPTY_MILESTONE: MilestoneInput = {
  description: '',
  faceValueBtc: '',
  discountPct: '5',
  dueInBlocks: '144',
}

export default function NewInvoicePage() {
  const { address, isConnected, connect, connecting, selectedRole, setSelectedRole, requestContractCall, isReady, isWrongNetwork, isAvailable } = useWallet()
  const router = useRouter()

  const [clientAddress, setClientAddress] = useState('')
  const [fundingDeadlineBlocks, setFundingDeadlineBlocks] = useState('72')
  const [maturityExtraBlocks, setMaturityExtraBlocks] = useState('288')
  const [metadata, setMetadata] = useState('')
  const [milestones, setMilestones] = useState<MilestoneInput[]>([{ ...EMPTY_MILESTONE }])

  const tx = useTxStatus()

  function addMilestone() {
    if (milestones.length >= 3) return
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
    if (!address) return 'Wallet not connected.'
    if (!clientAddress.trim()) return 'Client address is required.'
    if (clientAddress.trim() === address) return 'Client cannot be the same address as the merchant.'
    if (!isTestnetAddress(clientAddress.trim())) return 'Client address must be a Stacks testnet address that starts with ST.'
    for (let i = 0; i < milestones.length; i++) {
      const m = milestones[i]
      const face = btcToSats(m.faceValueBtc)
      if (!face || face <= 0) return `Milestone ${i + 1}: enter a valid face value.`
      const disc = parseFloat(m.discountPct)
      if (isNaN(disc) || disc < 0 || disc >= 100) return `Milestone ${i + 1}: discount must stay between 0 and 99%.`
      const due = parseInt(m.dueInBlocks)
      if (isNaN(due) || due < 1) return `Milestone ${i + 1}: enter a valid due block count.`
    }
    if (parseInt(fundingDeadlineBlocks) < 1) return 'Funding deadline must be greater than zero.'
    return null
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const err = validate()
    if (err) {
      tx.fail(err)
      return
    }

    tx.start()

    try {
      const { uintCV, standardPrincipalCV, bufferCV, listCV } = await import('@stacks/transactions')

      const [infoRes, lastInvoiceId] = await Promise.all([
        fetchChainInfo(),
        fetchNextInvoiceId(),
      ])      
      const currentHeight = infoRes.stacksTipHeight
      if (!currentHeight) throw new Error('Could not fetch current Stacks block height. Please try again.')
      const predictedInvoiceId = lastInvoiceId + 1

      const fundingDeadline = currentHeight + parseInt(fundingDeadlineBlocks)
      const maturityHeight = fundingDeadline + parseInt(maturityExtraBlocks)

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
        const dueHeight = Math.min(currentHeight + cumulativeBlocks, maturityHeight)

        faceValues.push(uintCV(face))
        merchantPayouts.push(uintCV(payout))
        lpRepayments.push(uintCV(face))
        dueHeights.push(uintCV(dueHeight))
      }

      const metaBytes = strToBytes32(metadata || 'InvoiceBTC MVP')

      const result = await requestContractCall({
        contractAddress: CONTRACT_ADDRESS,
        contractName: CONTRACT_NAME,
        functionName: 'create-invoice',
        functionArgs: [
          standardPrincipalCV(clientAddress.trim().toUpperCase()),
          uintCV(totalFaceValue()),
          uintCV(fundingDeadline),
          uintCV(maturityHeight),
          bufferCV(metaBytes),
          listCV(faceValues),
          listCV(merchantPayouts),
          listCV(lpRepayments),
          listCV(dueHeights),
        ],
      })
      tx.done(result.txid ?? '', {
        onConfirmed: () => {
          router.push(`/invoices/${predictedInvoiceId}`)
        },
      })
    } catch (e) {
      tx.fail(normalizeWalletError(e))
    }
  }

  if (!isConnected) {
    return (
      <PageContainer>
        <Section className="pt-10">
          <EmptyState
            title="Connect Leather to create an invoice"
            description="Invoice creation is the merchant starting point. Once connected, you can define client terms, milestone amounts, discount rates, and settlement timing."
            action={
              isAvailable ? (
                <Button onClick={connect} disabled={connecting}>
                  {connecting ? 'Connecting...' : 'Connect Leather'}
                </Button>
              ) : (
                <Button href={WALLET_INSTALL_URL} variant="secondary">Install Leather</Button>
              )
            }
          />
        </Section>
      </PageContainer>
    )
  }

  const faceTotal = totalFaceValue()
  const payoutTotal = totalMerchantPayout()
  const lpProfit = faceTotal - payoutTotal

  return (
    <PageContainer>
      <Section className="pt-4 sm:pt-6">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-3xl">
            <Link href="/" className="text-sm text-[var(--text-muted)] transition hover:text-white">
              Back to overview
            </Link>
            <h1 className="mt-4 text-balance text-4xl font-semibold tracking-[-0.04em] text-white sm:text-5xl">
              Create a premium milestone invoice flow.
            </h1>
            <p className="mt-4 max-w-2xl text-lg leading-8 text-[var(--text-secondary)]">
              Define the client, reserve the total invoice value in escrow later, and structure milestone advances so Liquidity Providers fund only when each stage becomes eligible.
            </p>
          </div>
          <Surface elevated className="w-full max-w-md p-6">
            <p className="ui-eyebrow">Operator context</p>
            <p className="mt-3 text-sm leading-7 text-[var(--text-secondary)]">
              Network: {NETWORK_LABEL}
            </p>
            <p className="mt-2 break-all font-mono text-xs text-white">{address}</p>
            <div className="mt-5">
              <RoleSwitcher selectedRole={selectedRole} setSelectedRole={setSelectedRole} compact />
            </div>
            {isWrongNetwork && (
              <div className="mt-5 rounded-[var(--radius-md)] border border-[rgba(200,93,99,0.28)] bg-[rgba(200,93,99,0.1)] p-4 text-sm text-[#f2c4c7]">
                Switch Leather to Stacks Testnet before creating an invoice.
              </div>
            )}
          </Surface>
        </div>
      </Section>

      <form onSubmit={handleSubmit}>
        <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-6">
            <Surface elevated className="p-6 sm:p-8">
              <p className="ui-eyebrow">Parties</p>
              <h2 className="mt-3 text-2xl font-semibold text-white">Define who signs and funds</h2>
              <div className="mt-6 grid gap-5">
                <Field label="Merchant wallet">
                  <Input value={address ?? ''} disabled className="font-mono text-xs" />
                </Field>
                <Field label="Client wallet" hint="This wallet will sign the invoice and deposit the full escrow balance." required>
                  <Input
                    type="text"
                    value={clientAddress}
                    onChange={(e) => setClientAddress(e.target.value)}
                    placeholder="ST2... client address"
                    className="font-mono text-xs"
                  />
                </Field>
              </div>
            </Surface>

            <Surface elevated className="p-6 sm:p-8">
              <p className="ui-eyebrow">Terms</p>
              <h2 className="mt-3 text-2xl font-semibold text-white">Set the operating window</h2>
              <div className="mt-6 grid gap-5 sm:grid-cols-2">
                <Field label="Funding window (blocks)">
                  <Input
                    type="number"
                    min="1"
                    value={fundingDeadlineBlocks}
                    onChange={(e) => setFundingDeadlineBlocks(e.target.value)}
                  />
                  <BlockHint blocks={fundingDeadlineBlocks} label="for Liquidity Provider to advance funds" />
                </Field>
                <Field label="Settlement period (blocks)">
                  <Input
                    type="number"
                    min="1"
                    value={maturityExtraBlocks}
                    onChange={(e) => setMaturityExtraBlocks(e.target.value)}
                  />
                  <BlockHint blocks={maturityExtraBlocks} label="after funding closes before settlement opens" />
                </Field>
              </div>
              <div className="mt-5">
                <Field label="Reference or notes" hint="Stored as a short metadata field on-chain.">
                  <Input
                    type="text"
                    maxLength={32}
                    value={metadata}
                    onChange={(e) => setMetadata(e.target.value)}
                    placeholder="Q2 redesign delivery"
                  />
                </Field>
              </div>
            </Surface>

            <Surface elevated className="p-6 sm:p-8">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="ui-eyebrow">Milestones</p>
                  <h2 className="mt-3 text-2xl font-semibold text-white">Structure the staged funding</h2>
                </div>
                {milestones.length < 3 && (
                  <Button type="button" variant="secondary" onClick={addMilestone}>
                    Add milestone
                  </Button>
                )}
              </div>

              <div className="mt-6 space-y-4">
                {milestones.map((m, i) => {
                  const face = btcToSats(m.faceValueBtc) || 0
                  const payout = calcMerchantPayout(m.faceValueBtc, m.discountPct)

                  return (
                    <div key={i} className="rounded-[var(--radius-md)] border border-white/8 bg-white/[0.03] p-5">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm text-[var(--text-muted)]">Milestone {i + 1}</p>
                          <h3 className="mt-1 text-lg font-semibold text-white">Funding and settlement terms</h3>
                        </div>
                        {milestones.length > 1 && (
                          <Button type="button" variant="ghost" onClick={() => removeMilestone(i)} className="text-[#f0bec1] hover:text-white">
                            Remove
                          </Button>
                        )}
                      </div>

                      <div className="mt-5 space-y-5">
                        <Field label="Description" hint="Visible in the operator flow so participants understand what this milestone represents.">
                          <Input
                            type="text"
                            value={m.description}
                            onChange={(e) => updateMilestone(i, 'description', e.target.value)}
                            placeholder="Design handoff delivered"
                          />
                        </Field>
                        <div className="grid gap-5 md:grid-cols-3">
                          <Field label="Face value (sBTC)" required>
                            <Input
                              type="number"
                              step="0.00000001"
                              min="0.00000001"
                              value={m.faceValueBtc}
                              onChange={(e) => updateMilestone(i, 'faceValueBtc', e.target.value)}
                              placeholder="0.10"
                            />
                          </Field>
                          <Field label="Discount %" required>
                            <Input
                              type="number"
                              step="0.1"
                              min="0"
                              max="99"
                              value={m.discountPct}
                              onChange={(e) => updateMilestone(i, 'discountPct', e.target.value)}
                            />
                          </Field>
                          <Field label="Delivery deadline (blocks)" required>
                            <Input
                              type="number"
                              min="1"
                              value={m.dueInBlocks}
                              onChange={(e) => updateMilestone(i, 'dueInBlocks', e.target.value)}
                            />
                            <BlockHint blocks={m.dueInBlocks} label="from invoice creation" />
                          </Field>
                        </div>
                      </div>

                      {face > 0 && (
                        <div className="mt-5 grid gap-3 md:grid-cols-3">
                          <MetricCard label="Client escrows" value={`${satsToBtc(face)} sBTC`} />
                          <MetricCard label="Merchant receives" value={`${satsToBtc(payout)} sBTC`} tone="success" />
                          <MetricCard label="Liquidity Provider yield" value={`${satsToBtc(face - payout)} sBTC`} tone="accent" />
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </Surface>
          </div>

          <div className="space-y-6">
            <Surface elevated className="sticky top-24 p-6 sm:p-8">
              <p className="ui-eyebrow">Summary</p>
              <h2 className="mt-3 text-2xl font-semibold text-white">Review before broadcasting</h2>
              <div className="mt-6 grid gap-4">
                <MetricCard
                  label="Total invoice value"
                  value={`${satsToBtc(faceTotal)} sBTC`}
                  hint="The client deposits this full amount into escrow after both signatures."
                />
                <MetricCard
                  label="Total merchant advances"
                  value={`${satsToBtc(payoutTotal)} sBTC`}
                  hint="Aggregate amount Liquidity Providers deploy across funded milestones."
                  tone="success"
                />
                <MetricCard
                  label="Total Liquidity Provider yield"
                  value={`${satsToBtc(lpProfit)} sBTC`}
                  hint="Discount captured between face value and milestone advances — the LP's return."
                  tone="accent"
                />
              </div>
              <div className="mt-6 rounded-[var(--radius-md)] border border-white/8 bg-white/[0.03] p-4 text-sm text-[var(--text-secondary)]">
                <p className="font-semibold text-white">Broadcast sequence</p>
                <ol className="mt-3 space-y-2">
                  <li>1. Merchant creates the invoice on-chain.</li>
                  <li>2. Client and merchant sign the agreement.</li>
                  <li>3. Client deposits escrow before Liquidity Provider funding begins.</li>
                </ol>
              </div>

              <TxResult txId={tx.txId} error={tx.error} loading={tx.loading} stage={tx.stage} label="Invoice creation" />

              {tx.stage !== 'submitted' ? (
                <Button type="submit" disabled={tx.loading || !isConnected || !isReady} className="mt-6 w-full">
                  {tx.loading ? 'Submitting...' : 'Create invoice on-chain'}
                </Button>
              ) : (
                <div className="mt-6 rounded-[var(--radius-md)] border border-[rgba(67,173,139,0.24)] bg-[rgba(67,173,139,0.1)] p-4 text-sm text-[#c7f0df]">
                  Invoice created. Redirecting to the overview shortly.
                </div>
              )}
            </Surface>
          </div>
        </div>
      </form>
    </PageContainer>
  )
}

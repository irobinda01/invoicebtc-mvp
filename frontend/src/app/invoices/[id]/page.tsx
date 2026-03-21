'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useWallet } from '@/lib/useWallet'
import { useTxStatus } from '@/lib/useTxStatus'
import type { UseTxStatus } from '@/lib/useTxStatus'
import { fetchAllMilestones, fetchChainInfo, fetchInvoice, fetchInvoiceReadiness, strToBytes32 } from '@/lib/contract'
import {
  CONTRACT_ADDRESS,
  CONTRACT_NAME,
  NETWORK_LABEL,
  SBTC_CONTRACT_ADDRESS,
  SBTC_CONTRACT_NAME,
  SBTC_TOKEN_NAME,
  satsToBtc,
  explorerAddressUrl,
} from '@/lib/config'
import { StatusBadge, MilestoneStateBadge } from '@/components/StatusBadge'
import { TxResult } from '@/components/TxResult'
import { MilestoneTimeline } from '@/components/MilestoneTimeline'
import { RoleSwitcher } from '@/components/RoleSwitcher'
import { Button, DetailRow, EmptyState, Field, Input, MetricCard, PageContainer, Section, Surface } from '@/components/ui'
import type { Invoice, Milestone, Role } from '@/lib/types'
import { cn, formatCompactAddress } from '@/lib/ui'
import { normalizeWalletError } from '@/lib/wallet/utils'
import type { PostCondition } from '@stacks/transactions'

const ROLE_DISPLAY: Record<Role, string> = {
  merchant: 'Merchant',
  client: 'Client',
  lp: 'Liquidity Provider',
  observer: 'Observer',
}

function RoleBadge({ role }: { role: Role }) {
  const styles: Record<Role, string> = {
    merchant: 'border-[rgba(228,177,92,0.28)] bg-[rgba(228,177,92,0.14)] text-[#f3d39b]',
    client: 'border-[rgba(109,157,247,0.3)] bg-[rgba(109,157,247,0.14)] text-[#d7e3ff]',
    lp: 'border-[rgba(67,173,139,0.3)] bg-[rgba(67,173,139,0.14)] text-[#c7f0df]',
    observer: 'border-white/10 bg-white/[0.04] text-[var(--text-secondary)]',
  }
  return <span className={cn('inline-flex rounded-full border px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em]', styles[role])}>{ROLE_DISPLAY[role]}</span>
}

function ActionPanel(props: {
  title: string
  description: string
  disabled: boolean
  disabledReason: string
  tx: UseTxStatus
  children: React.ReactNode
  tone?: 'default' | 'accent'
}) {
  const { title, description, disabled, disabledReason, tx, children, tone = 'default' } = props
  return (
    <Surface className={cn('p-5 sm:p-6', tone === 'accent' && 'bg-[linear-gradient(180deg,rgba(228,177,92,0.12),rgba(15,19,28,0.96))]', disabled && 'opacity-75')} elevated>
      <h3 className="text-lg font-semibold text-white">{title}</h3>
      <p className="mt-2 text-sm leading-7 text-[var(--text-secondary)]">{description}</p>
      <div className="mt-5">{disabled ? <p className="text-sm text-[var(--text-muted)]">{disabledReason}</p> : children}</div>
      {!disabled && <TxResult txId={tx.txId} error={tx.error} loading={tx.loading} stage={tx.stage} label={title} />}
    </Surface>
  )
}

async function callContract(opts: {
  functionName: string
  functionArgs: unknown[]
  postConditions?: PostCondition[]
  postConditionMode?: 'allow' | 'deny'
  requestContractCall: (params: {
    contractAddress: string
    contractName: string
    functionName: string
    functionArgs?: any[]
    postConditions?: PostCondition[]
    postConditionMode?: 'allow' | 'deny'
  }) => Promise<{ txid?: string }>
  onFinish: (txId: string) => void
}) {
  const result = await opts.requestContractCall({
    contractAddress: CONTRACT_ADDRESS,
    contractName: CONTRACT_NAME,
    functionName: opts.functionName,
    functionArgs: opts.functionArgs as any[],
    postConditions: opts.postConditions ?? [],
    postConditionMode: opts.postConditionMode ?? 'deny',
  })
  if (!result.txid) throw new Error('Transaction submission did not return a txid.')
  opts.onFinish(result.txid)
}

function getNextStep(
  inv: Invoice,
  milestones: Milestone[],
  nextFundableMilestone: Milestone | null,
): { title: string; body: string; actor: string | null } {
  switch (inv.status) {
    case 'draft':
      return { title: 'Awaiting signatures', body: 'Both the merchant and client must sign the invoice before escrow can be deposited.', actor: null }
    case 'merchant-signed':
      return { title: 'Client signature required', body: 'The merchant has signed. The client should sign next.', actor: 'Client' }
    case 'client-signed':
      // client-signed status can mean only-client-signed OR both-signed (needs escrow)
      if (!inv.merchantSigned)
        return { title: 'Merchant signature required', body: 'The client has signed. The merchant should sign to complete the dual-signature requirement.', actor: 'Merchant' }
      return { title: 'Escrow deposit required', body: 'Both parties have signed. The client should now deposit the full invoice face value into escrow.', actor: 'Client' }
    case 'escrow-funded': {
      const n = nextFundableMilestone?.id ?? 1
      return { title: `Fund Milestone ${n}`, body: `Escrow is live. The Liquidity Provider can now advance payment for Milestone ${n} to the merchant.`, actor: 'Liquidity Provider' }
    }
    case 'active': {
      // Priority: approval > proof submission > LP funding
      const submitted = milestones.find(m => m.status === 'submitted')
      if (submitted)
        return { title: `Approve Milestone ${submitted.id}`, body: `The merchant submitted proof for Milestone ${submitted.id}. The client should review and approve it to unlock the next funding step.`, actor: 'Client' }
      const funded = milestones.find(m => m.status === 'funded')
      if (funded)
        return { title: `Submit Milestone ${funded.id} Completion`, body: `Milestone ${funded.id} has been LP-funded. The merchant should complete the work and submit a proof reference on-chain.`, actor: 'Merchant' }
      if (nextFundableMilestone)
        return { title: `Fund Milestone ${nextFundableMilestone.id}`, body: `The previous milestone was approved. The Liquidity Provider can now advance payment for Milestone ${nextFundableMilestone.id}.`, actor: 'Liquidity Provider' }
      return { title: 'All milestones progressing', body: 'All milestones are either approved or awaiting final resolution.', actor: null }
    }
    case 'matured':
      return { title: 'Settlement window is open', body: 'The invoice has reached maturity. The Liquidity Provider can settle approved milestones from escrow.', actor: 'Liquidity Provider' }
    case 'dispute':
      return { title: 'Invoice is in dispute', body: 'At least one milestone remains unresolved and needs review.', actor: null }
    case 'completed':
      return { title: 'Invoice completed', body: 'Approved milestones are settled. Any leftover escrow can now be refunded to the client.', actor: 'Client' }
    case 'cancelled':
      return { title: 'Invoice cancelled', body: 'Open milestone obligations were cancelled. Remaining escrow may still be recoverable.', actor: null }
  }
}

export default function InvoiceDetailPage() {
  const params = useParams()
  const invoiceId = parseInt(params.id as string, 10)
  const { address, selectedRole, setSelectedRole, requestContractCall, isReady, isWrongNetwork } = useWallet()

  const [invoice, setInvoice] = useState<Invoice | null>(null)
  const [milestones, setMilestones] = useState<Milestone[]>([])
  const [proofHashes, setProofHashes] = useState<Record<number, string>>({})
  const [loadingData, setLoadingData] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [currentBlock, setCurrentBlock] = useState(0)
  const [pendingConfirmation, setPendingConfirmation] = useState(false)
  const [settlementEligibleMilestones, setSettlementEligibleMilestones] = useState<number[]>([])
  const [lastUpdated, setLastUpdated] = useState('')

  const merchantSign = useTxStatus()
  const clientSign = useTxStatus()
  const fundEscrow = useTxStatus()
  const fundMilestone = useTxStatus()
  const submitMilestone = useTxStatus()
  const approveMilestone = useTxStatus()
  const settleMilestone = useTxStatus()
  const openDispute = useTxStatus()
  const cancelInvoice = useTxStatus()
  const closeInvoice = useTxStatus()
  const refundLeftover = useTxStatus()

  const refresh = useCallback(async () => {
    try {
      setLoadingData(true)
      const [inv, chainInfo] = await Promise.all([fetchInvoice(invoiceId), fetchChainInfo().catch(() => null)])
      if (!inv) {
        setPendingConfirmation(true)
        return
      }
      setPendingConfirmation(false)
      const [milestoneRows, readiness] = await Promise.all([
        fetchAllMilestones(invoiceId, inv.milestoneCount),
        fetchInvoiceReadiness(invoiceId, inv.milestoneCount).catch(() => ({
          canFund: false,
          settlementEligibleMilestones: [],
        })),
      ])
      setInvoice(inv)
      setMilestones(milestoneRows)
      setSettlementEligibleMilestones(readiness.settlementEligibleMilestones)
      setCurrentBlock(chainInfo?.stacksTipHeight ?? chainInfo?.burnBlockHeight ?? 0)
      setLastUpdated(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }))
      setLoadError('')
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Failed to load invoice.')
    } finally {
      setLoadingData(false)
    }
  }, [invoiceId])

  useEffect(() => {
    refresh()
  }, [refresh])

  // Auto-poll only while awaiting initial on-chain confirmation.
  useEffect(() => {
    if (!pendingConfirmation) return
    const interval = setInterval(refresh, 15_000)
    return () => clearInterval(interval)
  }, [pendingConfirmation, refresh])

  const role: Role = useMemo(() => {
    if (!address || !invoice) return 'observer'
    const addr = address.toUpperCase()
    if (addr === invoice.merchant?.toUpperCase()) return 'merchant'
    if (addr === invoice.client?.toUpperCase()) return 'client'
    if (invoice.lp && addr === invoice.lp.toUpperCase()) return 'lp'
    return 'observer'
  }, [address, invoice])

  // Ref so the auto-settle effect (before early returns) can call the function defined later
  const doSettleMilestonesRef = useRef<(() => Promise<void>) | null>(null)

  // When all milestones are approved and the LP wallet is connected, automatically settle
  useEffect(() => {
    if (!invoice?.lp || role !== 'lp') return
    if (!milestones.length || settlementEligibleMilestones.length === 0) return
    if (settleMilestone.loading || settleMilestone.txId) return
    const allApproved = milestones.every(m => m.status === 'approved' || m.status === 'settled')
    if (!allApproved) return
    doSettleMilestonesRef.current?.()
  }, [milestones, settlementEligibleMilestones, invoice, role, settleMilestone.loading, settleMilestone.txId])

  if (loadingData) {
    return (
      <PageContainer>
        <Section className="pt-10">
          <EmptyState title="Loading invoice" description="The dashboard is pulling the latest on-chain invoice and milestone state." />
        </Section>
      </PageContainer>
    )
  }

  if (pendingConfirmation) {
    return (
      <PageContainer>
        <Section className="pt-10">
          <EmptyState
            title="Awaiting on-chain confirmation"
            description={`Invoice #${invoiceId} has been submitted and is pending confirmation. Stacks testnet blocks are mined approximately every 10 minutes. This page will refresh automatically.`}
            action={<Button onClick={refresh}>Check now</Button>}
          />
          <div className="mt-4 flex items-center justify-center gap-2 text-xs text-[var(--text-muted)]">
            <span className="h-2 w-2 animate-pulse rounded-full bg-[var(--accent)]" />
            Checking every 30 seconds
          </div>
        </Section>
      </PageContainer>
    )
  }

  if (!invoice || loadError) {
    return (
      <PageContainer>
        <Section className="pt-10">
          <EmptyState title="Invoice unavailable" description={loadError || 'This invoice could not be loaded.'} action={<Button href="/">Return home</Button>} />
        </Section>
      </PageContainer>
    )
  }

  const inv = invoice
  // Derived locally from invoice state — independent of the deployed contract's can-fund read-only
  const canFundLive = ['escrow-funded', 'active'].includes(inv.status) && inv.totalEscrowed >= inv.faceValue
  const isMerchant = role === 'merchant'
  const isClient = role === 'client'
  const isLp = role === 'lp'
  const isParty = isMerchant || isClient
  // Allow an observer who selected LP role to act as LP when no LP is designated yet
  const canActAsLp = isLp || (selectedRole === 'lp' && !inv.lp && !isParty)
  // For display: promote an eligible observer-as-LP to show LP role badge/hints
  const effectiveRole: Role = (canActAsLp && !isLp) ? 'lp' : role
  // Roles the wallet may NOT select for this invoice
  const disabledRoles: Role[] = isParty
    ? ['lp']
    : (!isLp && !!inv.lp)
      ? ['lp']
      : []

  const nextFundableMilestone =
    milestones.find((milestone, index) => {
      if (!['escrow-funded', 'active'].includes(inv.status)) return false
      if (milestone.status !== 'pending') return false
      if (index === 0) return true
      return milestones[index - 1]?.status === 'approved' || milestones[index - 1]?.status === 'settled'
    }) ?? null

  const availableActions = [
    isMerchant && !inv.merchantSigned && ['draft', 'client-signed', 'merchant-signed'].includes(inv.status) ? 'Merchant sign invoice' : null,
    isClient && !inv.clientSigned && ['draft', 'merchant-signed', 'client-signed'].includes(inv.status) ? 'Client sign invoice' : null,
    isClient && inv.merchantSigned && inv.clientSigned && ['merchant-signed', 'client-signed'].includes(inv.status) ? 'Deposit full escrow' : null,
    canActAsLp && nextFundableMilestone ? `Fund milestone ${nextFundableMilestone.id}` : null,
    ...milestones.flatMap((milestone) => [
      isMerchant && milestone.status === 'funded' ? `Submit completion for milestone ${milestone.id}` : null,
      isClient && milestone.status === 'submitted' ? `Approve milestone ${milestone.id}` : null,
    ]),
    canActAsLp && !!inv.lp && settlementEligibleMilestones.length > 0 ? 'Settle approved milestones' : null,
  ].filter(Boolean) as string[]
  const leftoverAmount = inv.totalEscrowed - inv.totalSettled - inv.totalRefunded
  const nextStep = getNextStep(inv, milestones, nextFundableMilestone)

  // Timing display — Stacks produces ~1 block per 10 minutes
  const BLOCKS_PER_HOUR = 6
  const BLOCKS_PER_DAY = 144
  const showFundingWindow = !['escrow-funded', 'active', 'matured', 'dispute', 'completed', 'cancelled'].includes(inv.status) && currentBlock > 0 && inv.fundingDeadline > 0
  const fundingBlocksLeft = showFundingWindow ? inv.fundingDeadline - currentBlock : null
  const fundingHoursLeft = fundingBlocksLeft !== null ? Math.max(0, Math.round(fundingBlocksLeft / BLOCKS_PER_HOUR)) : null
  const fundingWindowClosed = fundingBlocksLeft !== null && fundingBlocksLeft <= 0
  const showSettlementPeriod = ['escrow-funded', 'active', 'matured', 'dispute', 'completed'].includes(inv.status) && currentBlock > 0 && inv.maturityHeight > 0 && inv.fundingDeadline > 0
  const settlementTotalBlocks = showSettlementPeriod ? inv.maturityHeight - inv.fundingDeadline : null
  const settlementBlocksLeft = showSettlementPeriod ? inv.maturityHeight - currentBlock : null
  const settlementOpen = settlementBlocksLeft !== null && settlementBlocksLeft <= 0
  const settlementDaysLeft = settlementBlocksLeft !== null && settlementBlocksLeft > 0 ? Math.floor(settlementBlocksLeft / BLOCKS_PER_DAY) : null
  const settlementHoursLeft = settlementBlocksLeft !== null && settlementBlocksLeft > 0 ? Math.floor((settlementBlocksLeft % BLOCKS_PER_DAY) / BLOCKS_PER_HOUR) : null
  const settlementMinsLeft = settlementBlocksLeft !== null && settlementBlocksLeft > 0 ? (settlementBlocksLeft % BLOCKS_PER_HOUR) * 10 : null
  const settlementTotalDays = settlementTotalBlocks !== null ? Math.max(1, Math.round(settlementTotalBlocks / BLOCKS_PER_DAY)) : null
  const settlementEstimatedDate = settlementTotalBlocks !== null
    ? new Date(Date.now() + (settlementBlocksLeft ?? 0) * 10 * 60 * 1000).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
    : null

  async function doMerchantSign() {
    const { uintCV } = await import('@stacks/transactions')
    merchantSign.start()
    try {
      await callContract({ functionName: 'merchant-sign-invoice', functionArgs: [uintCV(invoiceId)], postConditionMode: 'allow', requestContractCall, onFinish: (txId) => { merchantSign.done(txId, { onConfirmed: refresh }) } })
    } catch (error) {
      merchantSign.fail(normalizeWalletError(error))
    }
  }

  async function doClientSign() {
    const { uintCV } = await import('@stacks/transactions')
    clientSign.start()
    try {
      await callContract({ functionName: 'client-sign-invoice', functionArgs: [uintCV(invoiceId)], postConditionMode: 'allow', requestContractCall, onFinish: (txId) => { clientSign.done(txId, { onConfirmed: refresh }) } })
    } catch (error) {
      clientSign.fail(normalizeWalletError(error))
    }
  }

  async function doFundEscrow() {
    const { createAssetInfo, FungibleConditionCode, makeStandardFungiblePostCondition, uintCV } = await import('@stacks/transactions')
    fundEscrow.start()
    try {
      const postCondition = makeStandardFungiblePostCondition(address!, FungibleConditionCode.Equal, inv.faceValue, createAssetInfo(SBTC_CONTRACT_ADDRESS, SBTC_CONTRACT_NAME, SBTC_TOKEN_NAME))
      await callContract({ functionName: 'fund-escrow', functionArgs: [uintCV(invoiceId), uintCV(inv.faceValue)], postConditions: [postCondition], requestContractCall, onFinish: (txId) => { fundEscrow.done(txId, { onConfirmed: refresh }) } })
    } catch (error) {
      fundEscrow.fail(normalizeWalletError(error))
    }
  }

  async function doFundMilestone(milestone: Milestone) {
    const { uintCV } = await import('@stacks/transactions')
    fundMilestone.start()
    try {
      await callContract({ functionName: 'fund-milestone', functionArgs: [uintCV(invoiceId), uintCV(milestone.id)], postConditions: [], postConditionMode: 'allow', requestContractCall, onFinish: (txId) => { fundMilestone.done(txId, { onConfirmed: refresh }) } })
    } catch (error) {
      fundMilestone.fail(normalizeWalletError(error))
    }
  }

  async function doSubmitCompletion(milestoneId: number) {
    const proof = (proofHashes[milestoneId] ?? '').trim()
    if (!proof) {
      submitMilestone.fail('Enter a proof reference before submitting. This is stored permanently on-chain.')
      return
    }
    const { bufferCV, uintCV } = await import('@stacks/transactions')
    submitMilestone.start()
    try {
      await callContract({ functionName: 'submit-milestone', functionArgs: [uintCV(invoiceId), uintCV(milestoneId), bufferCV(strToBytes32(proof))], postConditionMode: 'allow', requestContractCall, onFinish: (txId) => { submitMilestone.done(txId, { onConfirmed: refresh }) } })
    } catch (error) {
      submitMilestone.fail(normalizeWalletError(error))
    }
  }

  async function doConfirmMilestone(milestoneId: number) {
    const { uintCV } = await import('@stacks/transactions')
    approveMilestone.start()
    try {
      await callContract({ functionName: 'approve-milestone', functionArgs: [uintCV(invoiceId), uintCV(milestoneId)], postConditionMode: 'allow', requestContractCall, onFinish: (txId) => { approveMilestone.done(txId, { onConfirmed: refresh }) } })
    } catch (error) {
      approveMilestone.fail(normalizeWalletError(error))
    }
  }

  async function doSettleMilestones() {
    const { createAssetInfo, FungibleConditionCode, makeContractFungiblePostCondition, uintCV } = await import('@stacks/transactions')
    settleMilestone.start()
    try {
      const approvedRepayment = milestones.reduce((sum, milestone) => (milestone.status === 'approved' ? sum + milestone.lpRepaymentAmount : sum), BigInt(0))
      const postCondition = approvedRepayment > BigInt(0) ? makeContractFungiblePostCondition(CONTRACT_ADDRESS, CONTRACT_NAME, FungibleConditionCode.Equal, approvedRepayment, createAssetInfo(SBTC_CONTRACT_ADDRESS, SBTC_CONTRACT_NAME, SBTC_TOKEN_NAME)) : null
      await callContract({ functionName: 'settle-milestone', functionArgs: [uintCV(invoiceId), uintCV(1)], postConditions: postCondition ? [postCondition] : [], requestContractCall, onFinish: (txId) => { settleMilestone.done(txId, { onConfirmed: refresh }) } })
    } catch (error) {
      settleMilestone.fail(normalizeWalletError(error))
    }
  }
  doSettleMilestonesRef.current = doSettleMilestones

  async function doOpenDispute(milestoneId: number) {
    const { uintCV } = await import('@stacks/transactions')
    openDispute.start()
    try {
      await callContract({ functionName: 'open-dispute', functionArgs: [uintCV(invoiceId), uintCV(milestoneId)], postConditionMode: 'allow', requestContractCall, onFinish: (txId) => { openDispute.done(txId, { onConfirmed: refresh }) } })
    } catch (error) {
      openDispute.fail(normalizeWalletError(error))
    }
  }

  async function doCancelInvoice() {
    const { uintCV } = await import('@stacks/transactions')
    cancelInvoice.start()
    try {
      await callContract({ functionName: 'cancel-invoice', functionArgs: [uintCV(invoiceId)], postConditionMode: 'allow', requestContractCall, onFinish: (txId) => { cancelInvoice.done(txId, { onConfirmed: refresh }) } })
    } catch (error) {
      cancelInvoice.fail(normalizeWalletError(error))
    }
  }

  async function doCloseInvoice() {
    const { uintCV } = await import('@stacks/transactions')
    closeInvoice.start()
    try {
      await callContract({ functionName: 'close-invoice', functionArgs: [uintCV(invoiceId)], postConditionMode: 'allow', requestContractCall, onFinish: (txId) => { closeInvoice.done(txId, { onConfirmed: refresh }) } })
    } catch (error) {
      closeInvoice.fail(normalizeWalletError(error))
    }
  }

  async function doRefundLeftover() {
    const { createAssetInfo, FungibleConditionCode, makeContractFungiblePostCondition, uintCV } = await import('@stacks/transactions')
    refundLeftover.start()
    try {
      const postCondition = makeContractFungiblePostCondition(CONTRACT_ADDRESS, CONTRACT_NAME, FungibleConditionCode.Equal, leftoverAmount, createAssetInfo(SBTC_CONTRACT_ADDRESS, SBTC_CONTRACT_NAME, SBTC_TOKEN_NAME))
      await callContract({ functionName: 'refund-leftover', functionArgs: [uintCV(invoiceId)], postConditions: leftoverAmount > BigInt(0) ? [postCondition] : [], requestContractCall, onFinish: (txId) => { refundLeftover.done(txId, { onConfirmed: refresh }) } })
    } catch (error) {
      refundLeftover.fail(normalizeWalletError(error))
    }
  }

  return (
    <PageContainer>
      <Section className="pt-4 sm:pt-6">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
          <div className="max-w-3xl">
            <Link href="/" className="text-sm text-[var(--text-muted)] transition hover:text-white">Back to overview</Link>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <StatusBadge status={inv.status} />
              <RoleBadge role={effectiveRole} />
            </div>
            <h1 className="mt-5 text-balance text-4xl font-semibold tracking-[-0.04em] text-white sm:text-5xl">Invoice #{invoiceId}</h1>
            <p className="mt-4 max-w-2xl text-lg leading-8 text-[var(--text-secondary)]">
              Review the live escrow state, milestone progression, and the next required action without digging through raw contract data.
            </p>
            {(showFundingWindow || showSettlementPeriod) && (
              <div className="mt-5 flex flex-wrap gap-3">
                {showFundingWindow && fundingHoursLeft !== null && (
                  <div className="flex items-center gap-2.5 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm">
                    <span className="h-1.5 w-1.5 flex-none rounded-full bg-[var(--accent)]" />
                    <span className="text-[var(--text-muted)]">Funding window</span>
                    {/* MVP: deadline is informational only — funding remains open */}
                    <span className="font-medium text-white">{fundingWindowClosed ? 'Open · MVP' : `${fundingHoursLeft}h remaining`}</span>
                  </div>
                )}
                {showSettlementPeriod && (
                  <div className="flex items-center gap-2.5 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm">
                    <span className={cn('h-1.5 w-1.5 flex-none rounded-full', settlementOpen ? 'bg-[var(--success)]' : 'bg-[var(--accent)]')} />
                    <span className="text-[var(--text-muted)]">LP settlement</span>
                    <span className="font-medium text-white">
                      {settlementOpen
                        ? `Open now · ${settlementEstimatedDate} · ${settlementTotalDays}d window`
                        : `${settlementDaysLeft}d ${settlementHoursLeft}h ${settlementMinsLeft}m remaining · ${settlementEstimatedDate} · ${settlementTotalDays}d window`}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>

          <Surface elevated className="w-full max-w-md p-6">
            <p className="ui-eyebrow">Operator view</p>
            <div className="mt-4 space-y-3">
              {/* Connected wallet with explorer link */}
              <div className="rounded-[var(--radius-md)] border border-white/8 bg-white/[0.03] p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-[var(--text-muted)]">Connected Leather account</p>
                {address ? (
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <p className="break-all font-mono text-xs text-white">{address}</p>
                    <a
                      href={explorerAddressUrl(address)}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="View in Stacks Explorer"
                      className="flex-none rounded border border-white/10 px-2 py-1 text-[10px] text-[var(--text-muted)] transition hover:border-white/20 hover:text-white"
                    >
                      Explorer ↗
                    </a>
                  </div>
                ) : (
                  <p className="mt-2 text-sm text-[var(--text-muted)]">Not connected</p>
                )}
              </div>

              {/* Role match hint */}
              <div className={cn(
                'rounded-[var(--radius-md)] border p-4',
                effectiveRole === 'merchant'
                  ? 'border-[rgba(228,177,92,0.28)] bg-[rgba(228,177,92,0.08)]'
                  : effectiveRole === 'client'
                    ? 'border-[rgba(109,157,247,0.28)] bg-[rgba(109,157,247,0.08)]'
                    : effectiveRole === 'lp'
                      ? 'border-[rgba(67,173,139,0.28)] bg-[rgba(67,173,139,0.08)]'
                      : 'border-white/8 bg-white/[0.03]',
              )}>
                <p className="text-xs uppercase tracking-[0.18em] text-[var(--text-muted)]">Your role</p>
                <p className="mt-2 text-sm text-white">{ROLE_DISPLAY[effectiveRole]}</p>
                {effectiveRole !== 'observer' ? (
                  <p className="mt-1 text-xs text-[#a8d8c6]">
                    {role === effectiveRole
                      ? `Wallet matches invoice ${role} — on-chain actions are unlocked.`
                      : 'No LP assigned yet. Select LP role to fund this invoice and become the Liquidity Provider.'}
                  </p>
                ) : address ? (
                  <div className="mt-1 space-y-1.5 text-xs text-[var(--text-muted)]">
                    {inv.lp
                      ? <p>This invoice already has an assigned LP. Only that LP can fund remaining milestones.</p>
                      : isParty
                        ? <p>Wallet is {role} on this invoice — LP role is reserved for a third-party wallet.</p>
                        : <p>Select LP role above to fund this invoice as Liquidity Provider.</p>}
                    <p>Expected addresses:</p>
                    <p className="break-all font-mono text-white/60">Merchant: {inv.merchant}</p>
                    <p className="break-all font-mono text-white/60">Client: {inv.client}</p>
                    {inv.lp && <p className="break-all font-mono text-white/60">LP: {inv.lp}</p>}
                  </div>
                ) : (
                  <p className="mt-1 text-xs text-[var(--text-muted)]">
                    Connect Leather to see your role on this invoice.
                  </p>
                )}
              </div>

              {/* Network */}
              <div className="rounded-[var(--radius-md)] border border-white/8 bg-white/[0.03] p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-[var(--text-muted)]">Network</p>
                <p className="mt-2 flex items-center gap-1.5 text-sm text-white">
                  <span className="h-1.5 w-1.5 rounded-full bg-[var(--success)]" />
                  {NETWORK_LABEL}
                </p>
                <div className="mt-3 grid gap-2 text-xs text-[var(--text-secondary)]">
                  <p>Current block: {currentBlock > 0 ? currentBlock : 'Syncing'}</p>
                  <p>Last refresh: {lastUpdated || 'Waiting for first successful read'}</p>
                  <p>Funding eligibility: {canFundLive ? 'Open' : 'Not yet open'}</p>
                </div>
              </div>
            </div>
            <div className="mt-5">
              <RoleSwitcher selectedRole={selectedRole} setSelectedRole={setSelectedRole} disabledRoles={disabledRoles} compact />
            </div>
            {isWrongNetwork && (
              <div className="mt-5 rounded-[var(--radius-md)] border border-[rgba(200,93,99,0.28)] bg-[rgba(200,93,99,0.1)] p-4 text-sm text-[#f2c4c7]">
                Switch Leather to Stacks Testnet before signing, funding, approving, settling, or closing this invoice.
              </div>
            )}
            <Button variant="secondary" onClick={refresh} className="mt-5 w-full">Refresh invoice state</Button>
          </Surface>
        </div>
      </Section>

      <Section className="py-0">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="Invoice amount" value={`${satsToBtc(inv.faceValue)} sBTC`} hint="Reserved by the client once escrow is funded." tone="accent" />
          <MetricCard label="Escrow balance" value={`${satsToBtc(inv.totalEscrowed)} sBTC`} hint={inv.totalEscrowed > BigInt(0) ? 'Escrow has been funded.' : 'Escrow has not been funded yet.'} />
          <MetricCard label="Capital advanced" value={`${satsToBtc(inv.totalLpAdvanced)} sBTC`} hint={`${satsToBtc(inv.totalLpFunding)} sBTC total discounted funding capacity`} tone="success" />
          <MetricCard label="Settled to Liquidity Provider" value={`${satsToBtc(inv.totalSettled)} sBTC`} hint={`${satsToBtc(leftoverAmount > BigInt(0) ? leftoverAmount : BigInt(0))} sBTC currently remains`} />
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="Live block" value={currentBlock > 0 ? `#${currentBlock}` : 'Syncing'} hint="Pulled from Stacks testnet." />
          <MetricCard label="Funding gate" value={canFundLive ? 'Open' : 'Closed'} hint="Derived from invoice status and escrow balance." />
          <MetricCard label="Settlement ready" value={settlementEligibleMilestones.length > 0 ? `${settlementEligibleMilestones.length} milestone${settlementEligibleMilestones.length === 1 ? '' : 's'}` : 'None'} hint="Live eligibility from the contract." />
          <MetricCard label="Last sync" value={lastUpdated || 'Waiting'} hint="This page refreshes automatically while open." />
        </div>
      </Section>

      <Section className="pb-0">
        <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
          <Surface elevated className="p-6 sm:p-8">
            <p className="ui-eyebrow">Next action</p>
            <h2 className="mt-3 text-2xl font-semibold text-white">{nextStep.title}</h2>
            <p className="mt-3 text-base leading-7 text-[var(--text-secondary)]">{nextStep.body}</p>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <div className="rounded-[var(--radius-md)] border border-white/8 bg-white/[0.03] p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-[var(--text-muted)]">Required from</p>
                <p className="mt-2 text-sm font-medium text-white">{nextStep.actor ?? '—'}</p>
                {availableActions.length > 0 ? (
                  <p className="mt-2 text-xs text-[var(--text-secondary)]">Your action: {availableActions[0]}</p>
                ) : (
                  <p className="mt-2 text-xs text-[var(--text-muted)]">No action required from the connected Leather account right now.</p>
                )}
                {settlementEligibleMilestones.length > 0 && (
                  <p className="mt-2 text-xs text-[var(--text-secondary)]">
                    Settlement open for milestone {settlementEligibleMilestones.join(', ')}.
                  </p>
                )}
              </div>
              <div className="rounded-[var(--radius-md)] border border-white/8 bg-white/[0.03] p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-[var(--text-muted)]">Your role</p>
                <p className="mt-2 text-sm text-white">{ROLE_DISPLAY[effectiveRole]}</p>
                {currentBlock > 0 && (
                  <p className="mt-1 text-xs text-[var(--text-muted)]">Current block: {currentBlock}</p>
                )}
              </div>
            </div>
            {canActAsLp && nextFundableMilestone && canFundLive && (
              <div className="mt-5 border-t border-white/8 pt-5">
                <p className="mb-3 text-sm text-[var(--text-secondary)]">
                  You are the eligible Liquidity Provider for this invoice. Advance{' '}
                  <span className="font-medium text-white">{satsToBtc(nextFundableMilestone.merchantPayoutAmount)} sBTC</span>{' '}
                  to the merchant now — after the merchant submits proof and the client approves,{' '}
                  {nextFundableMilestone.id < milestones.length ? `Milestone ${nextFundableMilestone.id + 1}` : 'settlement'} becomes available.
                </p>
                <Button onClick={() => doFundMilestone(nextFundableMilestone)} disabled={fundMilestone.loading || !isReady}>
                  {fundMilestone.loading ? 'Funding...' : `Fund Milestone ${nextFundableMilestone.id}`}
                </Button>
                <TxResult txId={fundMilestone.txId} error={fundMilestone.error} loading={fundMilestone.loading} stage={fundMilestone.stage} label={`Fund Milestone ${nextFundableMilestone.id}`} />
              </div>
            )}
          </Surface>

          <Surface elevated className="p-6 sm:p-8">
            <p className="ui-eyebrow">Parties</p>
            <div className="mt-5">
              <DetailRow label="Merchant" value={formatCompactAddress(inv.merchant, 10, 8)} mono />
              <DetailRow label="Client" value={formatCompactAddress(inv.client, 10, 8)} mono />
              <DetailRow label="Liquidity Provider" value={inv.lp ? formatCompactAddress(inv.lp, 10, 8) : 'Unassigned'} mono />
              <DetailRow label="Funding reference deadline" value={`Block ${inv.fundingDeadline} (informational)`} />
              <DetailRow label="Settlement opens at" value={`Block ${inv.maturityHeight}`} />
              <DetailRow label="Metadata" value={inv.metadataHash || 'Not provided'} mono />
            </div>
          </Surface>
        </div>
      </Section>

      <Section eyebrow="Progress" title="Milestone funding sequence" description="The LP advances payment for each milestone in order. A milestone unlocks only after the previous one is funded, the merchant submits proof, and the client approves.">
        <Surface elevated className="p-6 sm:p-8">
          {milestones.length === 0 ? (
            <p className="text-sm text-[var(--text-secondary)]">Milestones will appear here once the invoice is confirmed on-chain.</p>
          ) : (
            <div className="space-y-2">
              {milestones.map((m) => {
                const isCurrent = nextFundableMilestone?.id === m.id
                const isDone = m.status === 'approved' || m.status === 'settled'
                const isInProgress = m.status === 'funded' || m.status === 'submitted'
                const stateLabel =
                  isDone ? 'Complete'
                  : m.status === 'funded' ? 'Awaiting merchant proof'
                  : m.status === 'submitted' ? 'Awaiting client approval'
                  : m.status === 'cancelled' ? 'Cancelled'
                  : isCurrent ? 'Ready to fund'
                  : 'Locked'
                return (
                  <div
                    key={m.id}
                    className={cn(
                      'flex items-center gap-4 rounded-[var(--radius-md)] border px-5 py-4',
                      isDone
                        ? 'border-[rgba(67,173,139,0.25)] bg-[rgba(67,173,139,0.06)]'
                        : isCurrent
                          ? 'border-[rgba(228,177,92,0.28)] bg-[rgba(228,177,92,0.07)]'
                          : 'border-white/8 bg-white/[0.02]',
                    )}
                  >
                    <div className={cn(
                      'flex h-7 w-7 flex-none items-center justify-center rounded-full text-xs font-bold',
                      isDone ? 'bg-[var(--success)] text-black'
                        : isCurrent ? 'bg-[var(--accent)] text-black'
                        : isInProgress ? 'bg-white/20 text-white'
                        : 'bg-white/8 text-[var(--text-muted)]',
                    )}>
                      {isDone ? '✓' : m.id}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span className="text-sm font-semibold text-white">Milestone {m.id}</span>
                        <MilestoneStateBadge status={m.status} />
                        {isCurrent && !isDone && (
                          <span className="text-xs font-medium text-[var(--accent)]">← next to fund</span>
                        )}
                      </div>
                      <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                        {satsToBtc(m.merchantPayoutAmount)} sBTC LP advance · {satsToBtc(m.faceValue)} sBTC face value
                      </p>
                    </div>
                    <span className={cn(
                      'shrink-0 text-xs',
                      isDone ? 'text-[var(--success)]'
                        : isInProgress ? 'text-[var(--text-secondary)]'
                        : isCurrent ? 'text-[var(--accent)]'
                        : 'text-[var(--text-muted)]',
                    )}>
                      {stateLabel}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </Surface>
      </Section>

      <Section eyebrow="Milestones" title="Milestone progression and operator actions" description="Each milestone is shown with its funding economics, current state, and any action that the current wallet can perform.">
        <div className="space-y-5">
          {milestones.map((milestone, milestoneIndex) => {
            const isNextFundable = nextFundableMilestone?.id === milestone.id
            const canFundThis = canActAsLp && isNextFundable && canFundLive
            const canSubmit = isMerchant && milestone.status === 'funded'
            const canApprove = isClient && milestone.status === 'submitted'
            const canDispute = isParty
              && ['escrow-funded', 'active'].includes(inv.status)
              && ['funded', 'submitted'].includes(milestone.status)
              && (currentBlock === 0 || currentBlock > milestone.dueBlockHeight)
            // Locked state: invoice is ready for LP funding but this milestone isn't next
            const prevMilestone = milestoneIndex > 0 ? milestones[milestoneIndex - 1] : null
            const isLpEligibleStatus = ['escrow-funded', 'active'].includes(inv.status)
            const isLocked = isLpEligibleStatus && milestone.status === 'pending' && !isNextFundable
            const lockedReason = isLocked && prevMilestone
              ? prevMilestone.status === 'pending'
                ? `Milestone ${prevMilestone.id} must be funded first`
                : prevMilestone.status === 'funded'
                  ? `Waiting for merchant to submit proof on Milestone ${prevMilestone.id}`
                  : prevMilestone.status === 'submitted'
                    ? `Waiting for client to approve Milestone ${prevMilestone.id}`
                    : null
              : null

            return (
              <Surface key={milestone.id} elevated className="p-6 sm:p-8">
                <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                  <div className="max-w-3xl">
                    <div className="flex flex-wrap items-center gap-3">
                      <h3 className="text-2xl font-semibold text-white">Milestone {milestone.id}</h3>
                      <MilestoneStateBadge status={milestone.status} />
                      {isNextFundable && <span className="rounded-full border border-[rgba(228,177,92,0.28)] bg-[rgba(228,177,92,0.14)] px-3 py-1 text-xs font-medium text-[#f3d39b]">Next — {satsToBtc(milestone.merchantPayoutAmount)} sBTC LP advance</span>}
                    </div>
                    <p className="mt-3 text-sm leading-7 text-[var(--text-secondary)]">Delivery due by block {milestone.dueBlockHeight}. Milestones are funded sequentially — each one unlocks only after the previous is approved.</p>
                    {lockedReason && (
                      <p className="mt-2 text-xs text-[var(--text-muted)]">Locked — {lockedReason}.</p>
                    )}
                  </div>
                  <div className="grid w-full gap-3 sm:grid-cols-3 lg:max-w-xl">
                    <MetricCard label="Face value" value={`${satsToBtc(milestone.faceValue)} sBTC`} />
                    <MetricCard label="Liquidity Provider advance" value={`${satsToBtc(milestone.merchantPayoutAmount)} sBTC`} tone="success" />
                    <MetricCard label="Repayment from escrow" value={`${satsToBtc(milestone.lpRepaymentAmount)} sBTC`} tone="accent" />
                  </div>
                </div>

                <div className="mt-6">
                  <MilestoneTimeline status={milestone.status} />
                </div>

                {milestone.proofHash && (
                  <div className="mt-6 rounded-[var(--radius-md)] border border-white/8 bg-white/[0.03] p-4">
                    <p className="text-xs uppercase tracking-[0.18em] text-[var(--text-muted)]">Submitted proof reference</p>
                    <p className="mt-2 break-all font-mono text-xs text-white">{milestone.proofHash}</p>
                  </div>
                )}

                {(canFundThis || canSubmit || canApprove || canDispute) && (
                  <div className="mt-6 grid gap-4 lg:grid-cols-2">
                    {canFundThis && (
                      <ActionPanel title={`Fund Milestone ${milestone.id}`} description={`Advance ${satsToBtc(milestone.merchantPayoutAmount)} sBTC to the merchant now. After the merchant submits proof and the client approves, ${milestone.id < milestones.length ? `Milestone ${milestone.id + 1}` : 'settlement'} becomes available.`} disabled={false} disabledReason="" tx={fundMilestone} tone="accent">
                        <Button onClick={() => doFundMilestone(milestone)} disabled={fundMilestone.loading || !isReady}>{fundMilestone.loading ? 'Funding...' : `Fund Milestone ${milestone.id}`}</Button>
                      </ActionPanel>
                    )}
                    {canSubmit && (
                      <ActionPanel title="Submit completion proof" description="The merchant records a short proof reference for the completed milestone." disabled={false} disabledReason="" tx={submitMilestone}>
                        <div className="space-y-4">
                          <Field label="Proof reference" hint="Short hash or document reference, stored on-chain.">
                            <Input type="text" maxLength={32} value={proofHashes[milestone.id] ?? ''} onChange={(e) => setProofHashes({ ...proofHashes, [milestone.id]: e.target.value })} placeholder={`proof-${milestone.id}`} />
                          </Field>
                          <Button onClick={() => doSubmitCompletion(milestone.id)} disabled={submitMilestone.loading || !isReady}>{submitMilestone.loading ? 'Submitting...' : 'Submit proof'}</Button>
                        </div>
                      </ActionPanel>
                    )}
                    {canApprove && (
                      <ActionPanel title="Approve milestone" description="The client confirms the milestone so settlement can proceed from escrow." disabled={false} disabledReason="" tx={approveMilestone}>
                        <Button onClick={() => doConfirmMilestone(milestone.id)} disabled={approveMilestone.loading || !isReady}>{approveMilestone.loading ? 'Approving...' : 'Approve milestone'}</Button>
                      </ActionPanel>
                    )}
                    {canDispute && (
                      <ActionPanel title="Open dispute" description="Either party can flag the milestone if proof or approval should not proceed as-is." disabled={false} disabledReason="" tx={openDispute}>
                        <Button onClick={() => doOpenDispute(milestone.id)} disabled={openDispute.loading || !isReady} variant="danger">{openDispute.loading ? 'Opening...' : 'Open dispute'}</Button>
                      </ActionPanel>
                    )}
                  </div>
                )}
              </Surface>
            )
          })}
        </div>
      </Section>

      <Section eyebrow="Actions" title="Invoice-wide controls" description="These actions affect the overall invoice lifecycle rather than a single milestone.">
        <div className="grid gap-4 lg:grid-cols-2">
          <ActionPanel title="Merchant sign invoice" description="The merchant confirms the invoice terms on-chain." disabled={!(isMerchant && !inv.merchantSigned && ['draft', 'client-signed', 'merchant-signed'].includes(inv.status))} disabledReason="Only the merchant can sign while merchant signature is still missing." tx={merchantSign}>
            <Button onClick={doMerchantSign} disabled={merchantSign.loading || !isReady}>{merchantSign.loading ? 'Signing...' : 'Sign as merchant'}</Button>
          </ActionPanel>
          <ActionPanel title="Client sign invoice" description="The client records acceptance of the invoice before escrow funding." disabled={!(isClient && !inv.clientSigned && ['draft', 'merchant-signed', 'client-signed'].includes(inv.status))} disabledReason="Only the client can sign while client signature is still missing." tx={clientSign}>
            <Button onClick={doClientSign} disabled={clientSign.loading || !isReady}>{clientSign.loading ? 'Signing...' : 'Sign as client'}</Button>
          </ActionPanel>
          <ActionPanel title="Deposit full escrow" description={`The client deposits the full face value of ${satsToBtc(inv.faceValue)} sBTC to reserve settlement capital.`} disabled={!(isClient && inv.merchantSigned && inv.clientSigned && ['merchant-signed', 'client-signed'].includes(inv.status))} disabledReason="Escrow becomes available only after both parties have signed." tx={fundEscrow} tone="accent">
            <Button onClick={doFundEscrow} disabled={fundEscrow.loading || !isReady}>{fundEscrow.loading ? 'Depositing...' : 'Deposit escrow'}</Button>
          </ActionPanel>
          <ActionPanel title={nextFundableMilestone ? `Fund Milestone ${nextFundableMilestone.id}` : 'Fund next milestone'} description={nextFundableMilestone ? `Advance ${satsToBtc(nextFundableMilestone.merchantPayoutAmount)} sBTC to the merchant as Liquidity Provider. After the merchant submits proof and the client approves, ${nextFundableMilestone.id < milestones.length ? `Milestone ${nextFundableMilestone.id + 1}` : 'settlement'} becomes available.` : 'No milestone is currently eligible for LP funding.'} disabled={!(canActAsLp && !!nextFundableMilestone && canFundLive)} disabledReason={!canActAsLp ? 'Select the LP role above, or connect the designated LP wallet.' : !canFundLive ? 'Funding gate is not open — check that escrow has been fully deposited.' : 'No milestone is ready to fund right now.'} tx={fundMilestone} tone="accent">
            <Button onClick={() => nextFundableMilestone && doFundMilestone(nextFundableMilestone)} disabled={fundMilestone.loading || !isReady}>{fundMilestone.loading ? 'Funding...' : `Fund Milestone ${nextFundableMilestone?.id}`}</Button>
          </ActionPanel>
          <ActionPanel title="Settle approved milestones" description="At maturity, the Liquidity Provider can settle approved milestones from escrow once the deployed contract marks them as ready." disabled={!(canActAsLp && !!inv.lp && settlementEligibleMilestones.length > 0)} disabledReason="Only the assigned Liquidity Provider can settle after the contract exposes at least one live settlement-eligible milestone." tx={settleMilestone}>
            <Button onClick={doSettleMilestones} disabled={settleMilestone.loading || settlementEligibleMilestones.length === 0 || !isReady}>{settleMilestone.loading ? 'Settling...' : 'Settle approved milestones'}</Button>
          </ActionPanel>
          <ActionPanel title="Close invoice" description="The merchant or client can close the invoice once all milestones are resolved." disabled={!(isParty && !['completed', 'cancelled'].includes(inv.status))} disabledReason="Only the merchant or client can close the invoice, and all milestones must be fully resolved first." tx={closeInvoice}>
            <Button onClick={doCloseInvoice} disabled={closeInvoice.loading || !isReady} variant="secondary">{closeInvoice.loading ? 'Closing...' : 'Close invoice'}</Button>
          </ActionPanel>
          <ActionPanel title="Refund leftover escrow" description={`After closure, the client can recover ${satsToBtc(leftoverAmount > BigInt(0) ? leftoverAmount : BigInt(0))} sBTC if any remains.`} disabled={!(isClient && ['completed', 'cancelled'].includes(inv.status) && leftoverAmount > BigInt(0))} disabledReason="Refund becomes available to the client only after completion or cancellation with a remaining balance." tx={refundLeftover}>
            <Button onClick={doRefundLeftover} disabled={refundLeftover.loading || !isReady} variant="secondary">{refundLeftover.loading ? 'Refunding...' : 'Refund leftover'}</Button>
          </ActionPanel>
          <ActionPanel title="Cancel invoice" description="Either party can cancel an open invoice and mark unresolved milestones accordingly." disabled={!(isParty && !['completed', 'cancelled'].includes(inv.status))} disabledReason="Only the merchant or client can cancel while the invoice remains open." tx={cancelInvoice}>
            <Button onClick={doCancelInvoice} disabled={cancelInvoice.loading || !isReady} variant="danger">{cancelInvoice.loading ? 'Cancelling...' : 'Cancel invoice'}</Button>
          </ActionPanel>
        </div>
      </Section>
    </PageContainer>
  )
}

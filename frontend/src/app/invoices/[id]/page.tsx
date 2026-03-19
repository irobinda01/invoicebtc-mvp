'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useWallet } from '@/lib/useWallet'
import { fetchAllMilestones, fetchInvoice, strToBytes32 } from '@/lib/contract'
import {
  CONTRACT_ADDRESS,
  CONTRACT_NAME,
  NETWORK_LABEL,
  SBTC_CONTRACT_ADDRESS,
  SBTC_CONTRACT_NAME,
  SBTC_TOKEN_NAME,
  satsToBtc,
} from '@/lib/config'
import { StatusBadge, MilestoneStateBadge } from '@/components/StatusBadge'
import { TxResult } from '@/components/TxResult'
import type { Invoice, Milestone, Role } from '@/lib/types'

interface ActionState {
  loading: boolean
  txId: string | null
  error: string | null
}

function useActionState() {
  const [state, setState] = useState<ActionState>({ loading: false, txId: null, error: null })
  return {
    ...state,
    start: () => setState({ loading: true, txId: null, error: null }),
    done: (txId: string) => setState({ loading: false, txId, error: null }),
    fail: (error: string) => setState({ loading: false, txId: null, error }),
  }
}

function shortenAddr(addr: string | null) {
  if (!addr) return '-'
  return `${addr.slice(0, 10)}...${addr.slice(-6)}`
}

function RoleBadge({ role }: { role: Role }) {
  const styles: Record<Role, string> = {
    merchant: 'bg-orange-900 text-orange-300',
    client: 'bg-blue-900 text-blue-300',
    lp: 'bg-emerald-900 text-emerald-300',
    observer: 'bg-gray-800 text-gray-400',
  }
  return <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-semibold uppercase tracking-wide ${styles[role]}`}>{role}</span>
}

function ActionCard(props: {
  title: string
  description: string
  disabled: boolean
  disabledReason: string
  loading: boolean
  txId: string | null
  error: string | null
  children: React.ReactNode
}) {
  const { title, description, disabled, disabledReason, loading, txId, error, children } = props
  return (
    <div className={`bg-gray-900 border rounded-xl p-5 ${disabled ? 'border-gray-800 opacity-60' : 'border-gray-700'}`}>
      <h3 className="font-semibold text-white">{title}</h3>
      <p className="text-xs text-gray-400 mt-1 mb-3">{description}</p>
      {disabled ? <p className="text-xs text-yellow-600 italic">{disabledReason}</p> : children}
      {!disabled && <TxResult txId={txId} error={error} loading={loading} />}
    </div>
  )
}

async function callContract(opts: {
  functionName: string
  functionArgs: unknown[]
  postConditions?: unknown[]
  postConditionMode?: number
  onFinish: (txId: string) => void
  onCancel: () => void
}) {
  const { openContractCall } = await import('@stacks/connect')
  const { getNetwork } = await import('@/lib/useWallet')
  const network = await getNetwork()
  await openContractCall({
    network,
    contractAddress: CONTRACT_ADDRESS,
    contractName: CONTRACT_NAME,
    functionName: opts.functionName,
    functionArgs: opts.functionArgs as never[],
    postConditions: (opts.postConditions ?? []) as never[],
    postConditionMode: opts.postConditionMode ?? 2,
    onFinish: (data: { txId: string }) => opts.onFinish(data.txId),
    onCancel: opts.onCancel,
  })
}

export default function InvoiceDetailPage() {
  const params = useParams()
  const invoiceId = parseInt(params.id as string, 10)
  const { address, selectedRole, setSelectedRole } = useWallet()

  const [invoice, setInvoice] = useState<Invoice | null>(null)
  const [milestones, setMilestones] = useState<Milestone[]>([])
  const [proofHashes, setProofHashes] = useState<Record<number, string>>({})
  const [loadingData, setLoadingData] = useState(true)
  const [loadError, setLoadError] = useState('')

  const merchantSign = useActionState()
  const clientSign = useActionState()
  const fundEscrow = useActionState()
  const fundMilestone = useActionState()
  const submitMilestone = useActionState()
  const approveMilestone = useActionState()
  const settleMilestone = useActionState()
  const openDispute = useActionState()
  const cancelInvoice = useActionState()
  const closeInvoice = useActionState()
  const refundLeftover = useActionState()

  const refresh = useCallback(async () => {
    try {
      setLoadingData(true)
      const inv = await fetchInvoice(invoiceId)
      if (!inv) {
        setLoadError(`Invoice #${invoiceId} not found.`)
        return
      }
      setInvoice(inv)
      setMilestones(await fetchAllMilestones(invoiceId, inv.milestoneCount))
      setLoadError('')
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Failed to load invoice')
    } finally {
      setLoadingData(false)
    }
  }, [invoiceId])

  useEffect(() => { refresh() }, [refresh])

  const role: Role = useMemo(() => {
    if (!address || !invoice) return 'observer'
    if (address === invoice.merchant) return 'merchant'
    if (address === invoice.client) return 'client'
    if (invoice.lp && address === invoice.lp) return 'lp'
    return 'observer'
  }, [address, invoice])

  if (loadingData) return <div className="py-20 text-center text-gray-400">Loading invoice...</div>
  if (!invoice || loadError) {
    return (
      <div className="py-20 text-center">
        <p className="text-red-400 mb-4">{loadError || 'Invoice not found.'}</p>
        <Link href="/" className="text-orange-500 underline">Back to home</Link>
      </div>
    )
  }

  const inv = invoice
  const isMerchant = role === 'merchant'
  const isClient = role === 'client'
  const isLp = role === 'lp'
  const isParty = isMerchant || isClient

  const nextFundableMilestone = milestones.find((milestone, index) => {
    if (!['escrow-funded', 'active'].includes(inv.status)) return false
    if (milestone.status !== 'pending') return false
    if (index === 0) return true
    return milestones[index - 1]?.status === 'approved' || milestones[index - 1]?.status === 'settled'
  }) ?? null

  const availableActions = [
    isMerchant && !inv.merchantSigned && ['draft', 'client-signed', 'merchant-signed'].includes(inv.status) ? 'Merchant sign invoice' : null,
    isClient && !inv.clientSigned && ['draft', 'merchant-signed', 'client-signed'].includes(inv.status) ? 'Client sign invoice' : null,
    isClient && inv.merchantSigned && inv.clientSigned && ['merchant-signed', 'client-signed'].includes(inv.status) ? 'Deposit full escrow' : null,
    (!isParty && (inv.lp ? isLp : true) && nextFundableMilestone) ? `Fund milestone ${nextFundableMilestone.id}` : null,
    ...milestones.flatMap((milestone) => [
      isMerchant && milestone.status === 'funded' ? `Submit completion for milestone ${milestone.id}` : null,
      isClient && milestone.status === 'submitted' ? `Confirm milestone ${milestone.id}` : null,
    ]),
    isLp && !!inv.lp && inv.totalSettled < inv.faceValue ? 'Settle approved milestones / trigger dispute at maturity' : null,
  ].filter(Boolean) as string[]

  async function tokenArg() {
    const { contractPrincipalCV } = await import('@stacks/transactions')
    return contractPrincipalCV(SBTC_CONTRACT_ADDRESS, SBTC_CONTRACT_NAME)
  }

  async function doMerchantSign() {
    const { uintCV } = await import('@stacks/transactions')
    merchantSign.start()
    try {
      await callContract({ functionName: 'merchant-sign-invoice', functionArgs: [uintCV(invoiceId)], postConditionMode: 1, onFinish: (txId) => { merchantSign.done(txId); setTimeout(refresh, 3000) }, onCancel: () => merchantSign.fail('Cancelled') })
    } catch (error) {
      merchantSign.fail(error instanceof Error ? error.message : String(error))
    }
  }

  async function doClientSign() {
    const { uintCV } = await import('@stacks/transactions')
    clientSign.start()
    try {
      await callContract({ functionName: 'client-sign-invoice', functionArgs: [uintCV(invoiceId)], postConditionMode: 1, onFinish: (txId) => { clientSign.done(txId); setTimeout(refresh, 3000) }, onCancel: () => clientSign.fail('Cancelled') })
    } catch (error) {
      clientSign.fail(error instanceof Error ? error.message : String(error))
    }
  }

  async function doFundEscrow() {
    const { createAssetInfo, FungibleConditionCode, makeStandardFungiblePostCondition, uintCV } = await import('@stacks/transactions')
    fundEscrow.start()
    try {
      const postCondition = makeStandardFungiblePostCondition(address!, FungibleConditionCode.Equal, inv.faceValue, createAssetInfo(SBTC_CONTRACT_ADDRESS, SBTC_CONTRACT_NAME, SBTC_TOKEN_NAME))
      await callContract({ functionName: 'fund-escrow', functionArgs: [await tokenArg(), uintCV(invoiceId), uintCV(inv.faceValue)], postConditions: [postCondition], onFinish: (txId) => { fundEscrow.done(txId); setTimeout(refresh, 3000) }, onCancel: () => fundEscrow.fail('Cancelled') })
    } catch (error) {
      fundEscrow.fail(error instanceof Error ? error.message : String(error))
    }
  }

  async function doFundMilestone(milestone: Milestone) {
    const { createAssetInfo, FungibleConditionCode, makeStandardFungiblePostCondition, uintCV } = await import('@stacks/transactions')
    fundMilestone.start()
    try {
      const postCondition = makeStandardFungiblePostCondition(address!, FungibleConditionCode.Equal, milestone.merchantPayoutAmount, createAssetInfo(SBTC_CONTRACT_ADDRESS, SBTC_CONTRACT_NAME, SBTC_TOKEN_NAME))
      await callContract({ functionName: 'fund-milestone', functionArgs: [await tokenArg(), uintCV(invoiceId), uintCV(milestone.id)], postConditions: [postCondition], onFinish: (txId) => { fundMilestone.done(txId); setTimeout(refresh, 3000) }, onCancel: () => fundMilestone.fail('Cancelled') })
    } catch (error) {
      fundMilestone.fail(error instanceof Error ? error.message : String(error))
    }
  }

  async function doSubmitCompletion(milestoneId: number) {
    const { bufferCV, uintCV } = await import('@stacks/transactions')
    submitMilestone.start()
    try {
      const proof = proofHashes[milestoneId] || `proof-${milestoneId}`
      await callContract({ functionName: 'submit-milestone', functionArgs: [uintCV(invoiceId), uintCV(milestoneId), bufferCV(strToBytes32(proof))], postConditionMode: 1, onFinish: (txId) => { submitMilestone.done(txId); setTimeout(refresh, 3000) }, onCancel: () => submitMilestone.fail('Cancelled') })
    } catch (error) {
      submitMilestone.fail(error instanceof Error ? error.message : String(error))
    }
  }

  async function doConfirmMilestone(milestoneId: number) {
    const { uintCV } = await import('@stacks/transactions')
    approveMilestone.start()
    try {
      await callContract({ functionName: 'approve-milestone', functionArgs: [uintCV(invoiceId), uintCV(milestoneId)], postConditionMode: 1, onFinish: (txId) => { approveMilestone.done(txId); setTimeout(refresh, 3000) }, onCancel: () => approveMilestone.fail('Cancelled') })
    } catch (error) {
      approveMilestone.fail(error instanceof Error ? error.message : String(error))
    }
  }

  async function doSettleMilestones() {
    const { createAssetInfo, FungibleConditionCode, makeContractFungiblePostCondition, uintCV } = await import('@stacks/transactions')
    settleMilestone.start()
    try {
      const approvedRepayment = milestones.reduce((sum, milestone) => milestone.status === 'approved' ? sum + milestone.lpRepaymentAmount : sum, BigInt(0))
      const postCondition = approvedRepayment > BigInt(0)
        ? makeContractFungiblePostCondition(CONTRACT_ADDRESS, CONTRACT_NAME, FungibleConditionCode.Equal, approvedRepayment, createAssetInfo(SBTC_CONTRACT_ADDRESS, SBTC_CONTRACT_NAME, SBTC_TOKEN_NAME))
        : null
      await callContract({
        functionName: 'settle-milestone',
        functionArgs: [await tokenArg(), uintCV(invoiceId), uintCV(1)],
        postConditions: postCondition ? [postCondition] : [],
        onFinish: (txId) => { settleMilestone.done(txId); setTimeout(refresh, 3000) },
        onCancel: () => settleMilestone.fail('Cancelled'),
      })
    } catch (error) {
      settleMilestone.fail(error instanceof Error ? error.message : String(error))
    }
  }

  async function doOpenDispute(milestoneId: number) {
    const { uintCV } = await import('@stacks/transactions')
    openDispute.start()
    try {
      await callContract({ functionName: 'open-dispute', functionArgs: [uintCV(invoiceId), uintCV(milestoneId)], postConditionMode: 1, onFinish: (txId) => { openDispute.done(txId); setTimeout(refresh, 3000) }, onCancel: () => openDispute.fail('Cancelled') })
    } catch (error) {
      openDispute.fail(error instanceof Error ? error.message : String(error))
    }
  }

  async function doCancelInvoice() {
    const { uintCV } = await import('@stacks/transactions')
    cancelInvoice.start()
    try {
      await callContract({ functionName: 'cancel-invoice', functionArgs: [uintCV(invoiceId)], postConditionMode: 1, onFinish: (txId) => { cancelInvoice.done(txId); setTimeout(refresh, 3000) }, onCancel: () => cancelInvoice.fail('Cancelled') })
    } catch (error) {
      cancelInvoice.fail(error instanceof Error ? error.message : String(error))
    }
  }

  async function doCloseInvoice() {
    const { uintCV } = await import('@stacks/transactions')
    closeInvoice.start()
    try {
      await callContract({ functionName: 'close-invoice', functionArgs: [uintCV(invoiceId)], postConditionMode: 1, onFinish: (txId) => { closeInvoice.done(txId); setTimeout(refresh, 3000) }, onCancel: () => closeInvoice.fail('Cancelled') })
    } catch (error) {
      closeInvoice.fail(error instanceof Error ? error.message : String(error))
    }
  }

  async function doRefundLeftover() {
    const { createAssetInfo, FungibleConditionCode, makeContractFungiblePostCondition, uintCV } = await import('@stacks/transactions')
    refundLeftover.start()
    try {
      const leftoverAmount = inv.totalEscrowed - inv.totalSettled - inv.totalRefunded
      const postCondition = makeContractFungiblePostCondition(CONTRACT_ADDRESS, CONTRACT_NAME, FungibleConditionCode.Equal, leftoverAmount, createAssetInfo(SBTC_CONTRACT_ADDRESS, SBTC_CONTRACT_NAME, SBTC_TOKEN_NAME))
      await callContract({ functionName: 'refund-leftover', functionArgs: [await tokenArg(), uintCV(invoiceId)], postConditions: leftoverAmount > BigInt(0) ? [postCondition] : [], onFinish: (txId) => { refundLeftover.done(txId); setTimeout(refresh, 3000) }, onCancel: () => refundLeftover.fail('Cancelled') })
    } catch (error) {
      refundLeftover.fail(error instanceof Error ? error.message : String(error))
    }
  }

  const leftoverAmount = inv.totalEscrowed - inv.totalSettled - inv.totalRefunded

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <Link href="/" className="text-sm text-gray-500 hover:text-gray-300">Back to home</Link>
          <h1 className="text-2xl font-bold text-white mt-1">Invoice #{invoiceId}</h1>
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <StatusBadge status={inv.status} />
            <RoleBadge role={role} />
          </div>
        </div>
        <div className="text-right text-xs text-gray-500">
          <div>{NETWORK_LABEL}</div>
          <div className="font-mono text-gray-400">{shortenAddr(address)}</div>
          <button onClick={refresh} className="text-orange-500 hover:text-orange-400 mt-2">Refresh</button>
        </div>
      </div>

      <div className="bg-gray-900 border border-gray-700 rounded-xl p-5 space-y-4">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-xs text-gray-500 uppercase tracking-wide">Selected role</span>
          <div className="flex gap-2">
            {(['merchant', 'client', 'lp', 'observer'] as const).map((demoRole) => (
              <button key={demoRole} type="button" onClick={() => setSelectedRole(demoRole)} className={`px-3 py-1 rounded-full text-xs font-medium capitalize border ${selectedRole === demoRole ? 'bg-orange-500 text-white border-orange-400' : 'bg-gray-800 text-gray-400 border-gray-700'}`}>
                {demoRole}
              </button>
            ))}
          </div>
          <span className="text-xs text-gray-500">Authority is still derived from the connected wallet and on-chain invoice roles.</span>
        </div>

        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
          <div><dt className="text-gray-500 text-xs">Merchant</dt><dd className="font-mono text-gray-200 break-all">{inv.merchant}</dd></div>
          <div><dt className="text-gray-500 text-xs">Client</dt><dd className="font-mono text-gray-200 break-all">{inv.client}</dd></div>
          <div><dt className="text-gray-500 text-xs">LP</dt><dd className="font-mono text-gray-200 break-all">{inv.lp ?? '(unassigned)'}</dd></div>
          <div><dt className="text-gray-500 text-xs">Face value</dt><dd className="font-mono text-white">{satsToBtc(inv.faceValue)} sBTC</dd></div>
          <div><dt className="text-gray-500 text-xs">Total LP discounted advance</dt><dd className="font-mono text-green-400">{satsToBtc(inv.totalLpFunding)} sBTC</dd></div>
          <div><dt className="text-gray-500 text-xs">LP advanced so far</dt><dd className="font-mono text-emerald-400">{satsToBtc(inv.totalLpAdvanced)} sBTC</dd></div>
          <div><dt className="text-gray-500 text-xs">Escrowed</dt><dd className="font-mono text-blue-400">{satsToBtc(inv.totalEscrowed)} sBTC</dd></div>
          <div><dt className="text-gray-500 text-xs">Settled to LP</dt><dd className="font-mono text-purple-400">{satsToBtc(inv.totalSettled)} sBTC</dd></div>
          <div><dt className="text-gray-500 text-xs">Funding deadline</dt><dd className="text-gray-300">Block {inv.fundingDeadline}</dd></div>
          <div><dt className="text-gray-500 text-xs">Maturity</dt><dd className="text-gray-300">Block {inv.maturityHeight}</dd></div>
        </dl>
      </div>

      <div className="bg-gray-900 border border-gray-700 rounded-xl p-5">
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-4">Available Actions</h2>
        {availableActions.length > 0 ? (
          <ul className="space-y-2 text-sm text-gray-300">
            {availableActions.map((action) => (
              <li key={action} className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-orange-500" />
                <span>{action}</span>
              </li>
            ))}
          </ul>
        ) : <p className="text-sm text-gray-500">No valid on-chain actions are available for this wallet right now.</p>}
      </div>

      <div className="bg-gray-900 border border-gray-700 rounded-xl p-5">
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-4">Milestones</h2>
        <div className="space-y-4">
          {milestones.map((milestone) => {
            const isNextFundable = nextFundableMilestone?.id === milestone.id
            const canFundThis = (!isParty && (inv.lp ? isLp : true) && isNextFundable && ['escrow-funded', 'active'].includes(inv.status))
            const canSubmit = isMerchant && milestone.status === 'funded'
            const canApprove = isClient && milestone.status === 'submitted'
            const canDispute = isParty && ['funded', 'submitted'].includes(milestone.status)

            return (
              <div key={milestone.id} className="bg-gray-800 rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <h3 className="font-semibold text-white">Milestone {milestone.id}</h3>
                    <p className="text-xs text-gray-500">Due at block {milestone.dueBlockHeight}</p>
                  </div>
                  <MilestoneStateBadge status={milestone.status} />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
                  <div><p className="text-gray-500 text-xs">Face value</p><p className="font-mono text-white">{satsToBtc(milestone.faceValue)} sBTC</p></div>
                  <div><p className="text-gray-500 text-xs">Discounted LP advance</p><p className="font-mono text-green-400">{satsToBtc(milestone.merchantPayoutAmount)} sBTC</p></div>
                  <div><p className="text-gray-500 text-xs">LP repayment from escrow</p><p className="font-mono text-emerald-400">{satsToBtc(milestone.lpRepaymentAmount)} sBTC</p></div>
                </div>

                <div className="text-xs text-gray-500">
                  {isNextFundable ? 'This is the next unlocked milestone for LP funding.' : 'This milestone stays locked until the previous milestone is client-confirmed.'}
                </div>

                {milestone.proofHash && <p className="font-mono text-xs text-gray-400 break-all">{milestone.proofHash}</p>}

                {canFundThis && (
                  <div>
                    <button onClick={() => doFundMilestone(milestone)} disabled={fundMilestone.loading} className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 disabled:opacity-60 text-white text-sm font-semibold rounded">
                      {fundMilestone.loading ? 'Funding...' : `Fund milestone ${milestone.id}`}
                    </button>
                    <p className="text-xs text-gray-500 mt-2">LP funding is staged. Only this next milestone can be funded right now.</p>
                    <TxResult txId={fundMilestone.txId} error={fundMilestone.error} loading={false} />
                  </div>
                )}

                {canSubmit && (
                  <div className="space-y-2">
                    <input type="text" maxLength={32} value={proofHashes[milestone.id] ?? ''} onChange={(e) => setProofHashes({ ...proofHashes, [milestone.id]: e.target.value })} placeholder="Proof hash or document reference" className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white text-sm focus:outline-none focus:border-orange-500" />
                    <button onClick={() => doSubmitCompletion(milestone.id)} disabled={submitMilestone.loading} className="px-4 py-2 bg-orange-500 hover:bg-orange-600 disabled:opacity-60 text-white text-sm font-semibold rounded">
                      {submitMilestone.loading ? 'Submitting...' : 'Submit completion'}
                    </button>
                    <TxResult txId={submitMilestone.txId} error={submitMilestone.error} loading={false} />
                  </div>
                )}

                {canApprove && (
                  <div>
                    <button onClick={() => doConfirmMilestone(milestone.id)} disabled={approveMilestone.loading} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-semibold rounded">
                      {approveMilestone.loading ? 'Confirming...' : 'Confirm milestone'}
                    </button>
                    <TxResult txId={approveMilestone.txId} error={approveMilestone.error} loading={false} />
                  </div>
                )}

                {canDispute && (
                  <div>
                    <button onClick={() => doOpenDispute(milestone.id)} disabled={openDispute.loading} className="px-4 py-2 bg-red-700 hover:bg-red-800 disabled:opacity-60 text-white text-sm font-semibold rounded">
                      {openDispute.loading ? 'Opening...' : 'Open dispute'}
                    </button>
                    <TxResult txId={openDispute.txId} error={openDispute.error} loading={false} />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ActionCard title="Merchant Sign" description="Merchant signs the invoice on-chain. Terms are locked once signing starts." disabled={!(isMerchant && !inv.merchantSigned && ['draft', 'client-signed', 'merchant-signed'].includes(inv.status))} disabledReason="Only the merchant can sign while the invoice is still unsigned." loading={merchantSign.loading} txId={merchantSign.txId} error={merchantSign.error}>
          <button onClick={doMerchantSign} disabled={merchantSign.loading} className="px-4 py-2 bg-orange-500 hover:bg-orange-600 disabled:opacity-60 text-white text-sm font-semibold rounded">Sign as merchant</button>
        </ActionCard>

        <ActionCard title="Client Sign" description="Client signs the invoice on-chain." disabled={!(isClient && !inv.clientSigned && ['draft', 'merchant-signed', 'client-signed'].includes(inv.status))} disabledReason="Only the client can sign while the invoice is still unsigned." loading={clientSign.loading} txId={clientSign.txId} error={clientSign.error}>
          <button onClick={doClientSign} disabled={clientSign.loading} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-semibold rounded">Sign as client</button>
        </ActionCard>

        <ActionCard title="Deposit Escrow" description={`Client deposits the full face value of ${satsToBtc(inv.faceValue)} sBTC before any LP funding starts.`} disabled={!(isClient && inv.merchantSigned && inv.clientSigned && ['merchant-signed', 'client-signed'].includes(inv.status))} disabledReason="The client deposits escrow only after both signatures are recorded." loading={fundEscrow.loading} txId={fundEscrow.txId} error={fundEscrow.error}>
          <button onClick={doFundEscrow} disabled={fundEscrow.loading} className="px-4 py-2 bg-blue-700 hover:bg-blue-800 disabled:opacity-60 text-white text-sm font-semibold rounded">Deposit full escrow</button>
        </ActionCard>

        <ActionCard title="Settle Approved Milestones" description="At maturity, the LP can claim repayment for approved milestones only. Unapproved milestones move the invoice into dispute." disabled={!(isLp && !!inv.lp && inv.totalSettled < inv.faceValue)} disabledReason="Only the funded LP can trigger maturity settlement." loading={settleMilestone.loading} txId={settleMilestone.txId} error={settleMilestone.error}>
          <button onClick={doSettleMilestones} disabled={settleMilestone.loading || milestones.length === 0} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-sm font-semibold rounded">Settle approved milestones / trigger dispute</button>
        </ActionCard>

        <ActionCard title="Close Invoice" description="Close once every milestone is settled, disputed, or cancelled." disabled={!(isParty && ['active', 'matured', 'dispute'].includes(inv.status))} disabledReason="Only the merchant or client can close a resolved or disputed invoice." loading={closeInvoice.loading} txId={closeInvoice.txId} error={closeInvoice.error}>
          <button onClick={doCloseInvoice} disabled={closeInvoice.loading} className="px-4 py-2 bg-gray-600 hover:bg-gray-500 disabled:opacity-60 text-white text-sm font-semibold rounded">Close invoice</button>
        </ActionCard>

        <ActionCard title="Refund Leftover" description={`Client can recover ${satsToBtc(leftoverAmount > BigInt(0) ? leftoverAmount : BigInt(0))} sBTC after close.`} disabled={!(isClient && ['completed', 'cancelled'].includes(inv.status) && leftoverAmount > BigInt(0))} disabledReason="Leftover escrow can only be refunded to the client after the invoice is closed." loading={refundLeftover.loading} txId={refundLeftover.txId} error={refundLeftover.error}>
          <button onClick={doRefundLeftover} disabled={refundLeftover.loading} className="px-4 py-2 bg-indigo-700 hover:bg-indigo-800 disabled:opacity-60 text-white text-sm font-semibold rounded">Refund leftover</button>
        </ActionCard>

        <ActionCard title="Cancel Invoice" description="Marks unresolved milestones cancelled." disabled={!(isParty && !['completed', 'cancelled'].includes(inv.status))} disabledReason="Only the merchant or client can cancel an open invoice." loading={cancelInvoice.loading} txId={cancelInvoice.txId} error={cancelInvoice.error}>
          <button onClick={doCancelInvoice} disabled={cancelInvoice.loading} className="px-4 py-2 bg-red-800 hover:bg-red-900 disabled:opacity-60 text-white text-sm font-semibold rounded">Cancel invoice</button>
        </ActionCard>
      </div>

      <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-5">
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Next Step</h2>
        <p className="text-sm text-gray-300">
          {inv.status === 'draft' && 'Client signs first, then the merchant signs.'}
          {inv.status === 'merchant-signed' && 'Client should sign next.'}
          {inv.status === 'client-signed' && 'Client should now deposit the full escrow before LP funding starts.'}
          {inv.status === 'escrow-funded' && `LP can now fund milestone ${nextFundableMilestone?.id ?? 1}.`}
          {inv.status === 'active' && 'LP funding is sequential: fund the next unlocked milestone, merchant submits proof, client confirms, then the next milestone unlocks.'}
          {inv.status === 'matured' && 'The invoice has reached maturity. The LP can settle approved milestones from escrow.'}
          {inv.status === 'dispute' && 'The invoice is in dispute because at least one milestone remained unresolved.'}
          {inv.status === 'completed' && 'Invoice complete. Client may refund leftover escrow if any remains.'}
          {inv.status === 'cancelled' && 'Invoice cancelled. Client may refund leftover escrow if any remains.'}
        </p>
      </div>
    </div>
  )
}

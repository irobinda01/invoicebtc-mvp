'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useWallet } from '@/lib/useWallet'
import { fetchChainInfo, fetchInvoice, fetchLiveInvoices, fetchNextInvoiceId } from '@/lib/contract'
import { CONTRACT_ADDRESS, CONTRACT_NAME, NETWORK_LABEL, satsToBtc } from '@/lib/config'
import { RoleSwitcher } from '@/components/RoleSwitcher'
import { StatusBadge } from '@/components/StatusBadge'
import { Button, EmptyState, Field, Input, MetricCard, PageContainer, Section, Surface } from '@/components/ui'
import { cn, formatCompactAddress } from '@/lib/ui'
import { WALLET_INSTALL_URL } from '@/lib/wallet/constants'
import type { Invoice } from '@/lib/types'

const HOW_IT_WORKS = [
  'Merchant creates an invoice with milestone-by-milestone settlement terms.',
  'Client reviews and signs the agreement, then funds the full escrow balance.',
  'Liquidity Provider advances capital one milestone at a time at the agreed discount.',
  'Merchant submits proof, client approves completion, and escrow repays the Liquidity Provider.',
]

const ROLES = [
  {
    name: 'Merchant',
    description: 'Create invoices, define milestones, and submit completion proof as work is delivered.',
  },
  {
    name: 'Client',
    description: 'Review terms, sign the invoice, deposit escrow, and approve completed milestones.',
  },
  {
    name: 'Liquidity Provider',
    description: 'Fund milestones sequentially and receive repayment from escrow after client approval.',
  },
]

const TRUST_POINTS = [
  'Escrow-backed settlement keeps repayment capital reserved from the start.',
  'Sequential milestone funding reduces capital exposure for LPs.',
  'Role-aware screens make the next required action obvious for every participant.',
]

export default function HomePage() {
  const { address, isConnected, connect, connecting, selectedRole, setSelectedRole, isAvailable, isWrongNetwork } = useWallet()
  const router = useRouter()
  const [invoiceIdInput, setInvoiceIdInput] = useState('')
  const [lookupError, setLookupError] = useState('')
  const [looking, setLooking] = useState(false)

  // Live invoice list from chain
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [loadingInvoices, setLoadingInvoices] = useState(true)
  const [invoiceListError, setInvoiceListError] = useState('')
  const [chainTip, setChainTip] = useState(0)
  const [lastUpdated, setLastUpdated] = useState('')

  async function loadInvoices() {
    setLoadingInvoices(true)
    setInvoiceListError('')
    try {
      const [chainInfo, liveInvoices] = await Promise.all([
        fetchChainInfo(),
        fetchLiveInvoices(20),
      ])
      setChainTip(chainInfo.stacksTipHeight || chainInfo.burnBlockHeight)
      setInvoices(liveInvoices)
      setLastUpdated(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }))
    } catch {
      setInvoiceListError('Unable to load invoices from chain. Check your connection.')
    } finally {
      setLoadingInvoices(false)
    }
  }

  useEffect(() => {
    loadInvoices()
    const interval = setInterval(loadInvoices, 30_000)
    return () => clearInterval(interval)
  }, [])

  async function handleLookup(e: React.FormEvent) {
    e.preventDefault()
    const id = parseInt(invoiceIdInput.trim(), 10)
    if (isNaN(id) || id < 1) {
      setLookupError('Enter a valid invoice ID starting from 1.')
      return
    }

    setLooking(true)
    setLookupError('')
    try {
      const invoice = await fetchInvoice(id)
      if (!invoice) {
        setLookupError(`Invoice #${id} was not found on-chain.`)
      } else {
        router.push(`/invoices/${id}`)
      }
    } catch {
      setLookupError('Invoice lookup failed. Please confirm the network connection and try again.')
    } finally {
      setLooking(false)
    }
  }

  async function handleViewLatest() {
    setLooking(true)
    setLookupError('')
    try {
      const latestId = await fetchNextInvoiceId()
      if (latestId < 1) {
        setLookupError('No invoices have been created yet.')
        return
      }
      router.push(`/invoices/${latestId}`)
    } catch {
      setLookupError('Unable to fetch the latest invoice right now.')
    } finally {
      setLooking(false)
    }
  }

  return (
    <PageContainer>
      <Section className="pt-6 sm:pt-10">
        <div className="grid items-start gap-8 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-[32px] border border-[rgba(228,177,92,0.18)] bg-[linear-gradient(180deg,rgba(228,177,92,0.12),rgba(15,19,28,0.96))] p-7 shadow-[var(--shadow-soft)] sm:p-10">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-[var(--text-secondary)]">
              <span className="h-2 w-2 rounded-full bg-[var(--success)]" />
              {NETWORK_LABEL}
            </div>
            <h1 className="mt-6 max-w-3xl text-balance text-4xl font-semibold tracking-[-0.045em] text-white sm:text-5xl lg:text-6xl">
              Milestone invoice liquidity that feels trustworthy from the first click.
            </h1>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-[var(--text-secondary)]">
              InvoiceBTC helps merchants unlock sBTC liquidity without giving clients or LPs a confusing crypto-first experience.
              Every screen explains the current state, the next action, and who needs to act.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button href="/invoices/new" className="sm:min-w-[180px]">
                Create invoice
              </Button>
              <Button variant="secondary" onClick={handleViewLatest} disabled={looking} className="sm:min-w-[180px]">
                View latest invoice
              </Button>
            </div>
            <div className="mt-10 grid gap-4 sm:grid-cols-3">
              <MetricCard
                label="Settlement model"
                value="Escrow-backed"
                hint="Client funds the full invoice once signatures are complete."
              />
              <MetricCard
                label="Funding rhythm"
                value="Milestone by milestone"
                hint="LPs only deploy capital as each stage unlocks."
              />
              <MetricCard
                label="User clarity"
                value="Role-aware"
                hint="Merchant, client, and LP each see what happens next."
              />
            </div>
            <div className="mt-6 grid gap-4 sm:grid-cols-3">
              <MetricCard
                label="Testnet block"
                value={chainTip > 0 ? `#${chainTip}` : 'Syncing'}
                hint="Pulled live from the deployed testnet environment."
                tone="success"
              />
              <Surface elevated className="relative overflow-hidden border-[rgba(228,177,92,0.22)] bg-[linear-gradient(180deg,rgba(228,177,92,0.14),rgba(15,19,28,0.98))] p-5 sm:p-6">
                <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[rgba(228,177,92,0.5)] to-transparent" />

                <div className="space-y-4">
                  <div className="space-y-2">
                    <p className="text-sm text-[var(--text-muted)]">Deployed contract</p>
                    <div className="inline-flex rounded-full border border-[rgba(228,177,92,0.24)] bg-[rgba(228,177,92,0.1)] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#f3d39b]">
                      Live on testnet
                    </div>
                  </div>

                  <div className="rounded-[20px] border border-white/10 bg-[rgba(7,10,16,0.52)] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--accent)]">
                      {CONTRACT_NAME}
                    </p>
                    <div className="mt-3 rounded-[14px] border border-white/8 bg-black/20 px-3 py-3">
                      <p className="font-mono text-[12px] leading-6 text-white [overflow-wrap:anywhere]">
                        {CONTRACT_ADDRESS}
                      </p>
                    </div>
                  </div>

                  <div className="rounded-[16px] border border-white/8 bg-white/[0.03] px-4 py-3">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--text-muted)]">
                      Compact view
                    </p>
                    <p className="mt-2 rounded-[12px] border border-white/8 bg-black/20 px-3 py-2 font-mono text-[11px] leading-5 text-white [overflow-wrap:anywhere]">
                      {formatCompactAddress(CONTRACT_ADDRESS, 10, 8)}
                    </p>
                  </div>

                  <div className="rounded-[16px] border border-white/8 bg-white/[0.03] px-4 py-3">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--text-muted)]">
                      Network
                    </p>
                    <p className="mt-2 text-xs font-medium text-[var(--accent)]">
                      Stacks testnet
                    </p>
                  </div>
                </div>
              </Surface>
              <MetricCard
                label="Registry refresh"
                value={lastUpdated || 'Waiting'}
                hint="Updates automatically every 30 seconds."
              />
            </div>
            {isWrongNetwork && (
              <div className="mt-6 rounded-[var(--radius-md)] border border-[rgba(200,93,99,0.28)] bg-[rgba(200,93,99,0.1)] p-4 text-sm text-[#f2c4c7]">
                Leather is connected on the wrong network. Switch the wallet to Stacks Testnet before any signature or transaction step.
              </div>
            )}
          </div>

          <div className="space-y-5">
            <Surface elevated className="p-6 sm:p-7">
              {isConnected && address ? (
                <>
                  <p className="ui-eyebrow">Leather connected</p>
                  <h2 className="mt-3 text-2xl font-semibold text-white">Ready to operate as {selectedRole}</h2>
                  <p className="mt-3 break-all font-mono text-sm text-[var(--text-secondary)]">{address}</p>
                  <div className="mt-6">
                    <RoleSwitcher selectedRole={selectedRole} setSelectedRole={setSelectedRole} />
                  </div>
                  <div className="mt-6 rounded-[var(--radius-md)] border border-white/8 bg-white/[0.03] p-4 text-sm text-[var(--text-secondary)]">
                    Connected Leather account
                    <div className="mt-1 font-mono text-xs text-white">{formatCompactAddress(address, 10, 8)}</div>
                  </div>
                </>
              ) : (
                <EmptyState
                  title="Connect Leather when you are ready"
                  description={
                    isAvailable
                      ? 'You can still explore the product structure first. Wallet connection only becomes necessary when you want to sign, fund, approve, or settle on-chain.'
                      : 'Leather is not installed in this browser yet. Install Leather, switch it to Stacks Testnet, and then connect for the live testnet demo flow.'
                  }
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
              )}
            </Surface>

            <Surface elevated className="p-6 sm:p-7">
              <p className="ui-eyebrow">Find an invoice</p>
              <h2 className="mt-3 text-2xl font-semibold text-white">Open an existing workflow</h2>
              <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">
                Jump directly into an invoice to review escrow state, milestone progress, and the next required on-chain action.
              </p>
              <form onSubmit={handleLookup} className="mt-6 space-y-4">
                <Field label="Invoice ID">
                  <Input
                    type="number"
                    min="1"
                    placeholder="e.g. 1"
                    value={invoiceIdInput}
                    onChange={(e) => {
                      setInvoiceIdInput(e.target.value)
                      setLookupError('')
                    }}
                  />
                </Field>
                <div className="flex flex-col gap-3 sm:flex-row">
                  <Button type="submit" disabled={looking} className="sm:min-w-[140px]">
                    {looking ? 'Opening...' : 'Open invoice'}
                  </Button>
                  <Button type="button" variant="ghost" onClick={handleViewLatest} disabled={looking}>
                    Open latest
                  </Button>
                </div>
                {lookupError && <p className="text-sm text-[#f0bec1]">{lookupError}</p>}
              </form>
            </Surface>
          </div>
        </div>
      </Section>

      <Section eyebrow="On-chain invoices" title="Live invoice registry">
        <Surface elevated className="overflow-hidden p-0">
          <div className="flex items-center justify-between gap-4 border-b border-white/[0.055] px-6 py-4">
            <p className="text-sm text-[var(--text-secondary)]">
              {loadingInvoices ? 'Fetching from Stacks testnet…' : invoices.length > 0 ? `${invoices.length} invoice${invoices.length !== 1 ? 's' : ''} found on-chain` : 'No invoices on-chain yet'}
            </p>
            <div className="flex items-center gap-3">
              {lastUpdated && <span className="text-[11px] text-[var(--text-muted)]">Updated {lastUpdated}</span>}
              <button
                type="button"
                onClick={loadInvoices}
                disabled={loadingInvoices}
                className="flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-[11px] font-medium text-[var(--text-muted)] transition hover:border-white/15 hover:text-white disabled:opacity-40"
              >
                <svg width="11" height="11" viewBox="0 0 12 12" fill="none" className={cn(loadingInvoices && 'animate-spin')}>
                  <path d="M10 6A4 4 0 1 1 6 2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                  <path d="M10 2v4H6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Refresh
              </button>
            </div>
          </div>

          {invoiceListError && (
            <p className="px-6 py-4 text-sm text-[#f0bec1]">{invoiceListError}</p>
          )}

          {!loadingInvoices && invoices.length === 0 && !invoiceListError && (
            <div className="px-6 py-10 text-center text-sm text-[var(--text-muted)]">
              No invoices have been created yet.{' '}
              <Link href="/invoices/new" className="text-[var(--accent)] hover:underline">Create the first one →</Link>
            </div>
          )}

          {invoices.length > 0 && (
            <div className="divide-y divide-white/[0.045]">
              {/* Header row */}
              <div className="grid grid-cols-[2rem_1fr_1fr_1fr_6rem_5.5rem] gap-4 px-6 py-2.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--text-muted)]">
                <span>#</span>
                <span>Merchant</span>
                <span>Client</span>
                <span>Face value</span>
                <span>Status</span>
                <span />
              </div>
              {invoices.map((inv) => (
                <div
                  key={inv.id}
                  className="grid grid-cols-[2rem_1fr_1fr_1fr_6rem_5.5rem] items-center gap-4 px-6 py-3.5 transition hover:bg-white/[0.02]"
                >
                  <span className="text-sm font-semibold text-[var(--text-muted)]">{inv.id}</span>
                  <span className="font-mono text-xs text-white">{formatCompactAddress(inv.merchant, 8, 6)}</span>
                  <span className="font-mono text-xs text-white">{formatCompactAddress(inv.client, 8, 6)}</span>
                  <span className="text-sm text-white">{satsToBtc(inv.faceValue)} sBTC</span>
                  <StatusBadge status={inv.status} />
                  <Link
                    href={`/invoices/${inv.id}`}
                    className="flex items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-[11px] font-medium text-[var(--text-muted)] transition hover:border-[rgba(228,177,92,0.3)] hover:text-[var(--accent)]"
                  >
                    Open →
                  </Link>
                </div>
              ))}
            </div>
          )}

          {loadingInvoices && (
            <div className="space-y-px">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="grid grid-cols-[2rem_1fr_1fr_1fr_6rem_5.5rem] items-center gap-4 px-6 py-3.5">
                  {Array.from({ length: 6 }).map((_, j) => (
                    <div key={j} className="h-3 animate-pulse rounded-full bg-white/[0.05]" />
                  ))}
                </div>
              ))}
            </div>
          )}
        </Surface>
      </Section>

      <Section
        eyebrow="How it works"
        title="A clean financing flow for milestone-based work"
        description="The product keeps the operational flow simple even though the underlying settlement logic is on-chain."
      >
        <div className="grid gap-4 lg:grid-cols-4">
          {HOW_IT_WORKS.map((step, index) => (
            <Surface key={step} elevated className="p-6">
              <div className="flex h-10 w-10 items-center justify-center rounded-full border border-[rgba(228,177,92,0.28)] bg-[rgba(228,177,92,0.12)] text-sm font-semibold text-white">
                {index + 1}
              </div>
              <p className="mt-5 text-base leading-7 text-[var(--text-secondary)]">{step}</p>
            </Surface>
          ))}
        </div>
      </Section>

      <Section
        eyebrow="Roles"
        title="Designed for three distinct participants"
        description="Each participant sees a cleaner explanation of what they own, what has happened, and what should happen next."
      >
        <div className="grid gap-4 md:grid-cols-3">
          {ROLES.map((role) => (
            <Surface key={role.name} elevated className="p-6 sm:p-7">
              <h3 className="text-xl font-semibold text-white">{role.name}</h3>
              <p className="mt-4 text-sm leading-7 text-[var(--text-secondary)]">{role.description}</p>
            </Surface>
          ))}
        </div>
      </Section>

      <Section
        eyebrow="Funding model"
        title="Escrow reserves the capital, milestones release the liquidity"
        description="InvoiceBTC separates certainty from timing: the client reserves the full amount once, and the LP deploys capital only when each milestone becomes eligible."
      >
        <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
          <Surface elevated className="p-6 sm:p-8">
            <div className="grid gap-4 sm:grid-cols-2">
              <MetricCard
                label="Invoice amount"
                value="Visible first"
                hint="The total contract value is always shown before lower-level data."
                tone="accent"
              />
              <MetricCard
                label="Escrow status"
                value="Always explicit"
                hint="Users immediately know whether capital is reserved, advancing, or ready to settle."
              />
              <MetricCard
                label="Milestone state"
                value="Sequential"
                hint="Only the next eligible milestone invites LP funding, keeping the flow understandable."
              />
              <MetricCard
                label="Next action"
                value="Role assigned"
                hint="The UI explains which participant must act next and why."
                tone="success"
              />
            </div>
          </Surface>
          <Surface elevated className="p-6 sm:p-8">
            <p className="ui-eyebrow">Why it feels safer</p>
            <div className="mt-5 space-y-4">
              {TRUST_POINTS.map((point) => (
                <div key={point} className="flex gap-3">
                  <div className="mt-2 h-2.5 w-2.5 rounded-full bg-[var(--accent)]" />
                  <p className="text-sm leading-7 text-[var(--text-secondary)]">{point}</p>
                </div>
              ))}
            </div>
          </Surface>
        </div>
      </Section>

      <Section
        eyebrow="Ready to try it"
        title="Move from hero page to live workflow in one step"
        description="Start a new invoice or open an existing one without forcing wallet connection before the user understands the product."
      >
        <Surface elevated className="flex flex-col gap-5 p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8">
          <div>
            <h3 className="text-2xl font-semibold text-white">Launch the operating flow</h3>
            <p className="mt-2 max-w-2xl text-sm leading-7 text-[var(--text-secondary)]">
              The redesigned app prioritizes amount, escrow state, milestones, and next actions before technical detail.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button href="/invoices/new">Create invoice</Button>
            <Button variant="secondary" onClick={handleViewLatest} disabled={looking}>
              View latest invoice
            </Button>
          </div>
        </Surface>
      </Section>
    </PageContainer>
  )
}

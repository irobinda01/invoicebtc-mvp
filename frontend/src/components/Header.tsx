'use client'

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { explorerAddressUrl } from '@/lib/config'
import { useWallet } from '@/lib/useWallet'
import type { Role } from '@/lib/types'
import { PageContainer } from '@/components/ui'
import { cn, formatCompactAddress } from '@/lib/ui'
import { WALLET_INSTALL_URL, WALLET_STATUS } from '@/lib/wallet/constants'

// ─── Role palette ─────────────────────────────────────────────────────────────

const ROLE_DOT: Record<string, string> = {
  merchant: 'bg-[var(--accent)]',
  client:   'bg-[var(--info)]',
  lp:       'bg-[var(--success)]',
  observer: 'bg-white/25',
}

const ROLE_OPTIONS: Role[] = ['merchant', 'client', 'lp', 'observer']

// ─── Primitives ───────────────────────────────────────────────────────────────

function VRule() {
  return <div className="h-4 w-px shrink-0 bg-white/[0.09]" />
}

function useCopy(text: string) {
  const [copied, setCopied] = useState(false)
  function copy() {
    navigator.clipboard.writeText(text).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return { copied, copy }
}

// ─── Logo ─────────────────────────────────────────────────────────────────────

function Logo() {
  return (
    <Link href="/" className="flex shrink-0 items-center gap-2.5">
      {/* Mark */}
      <div className="relative flex h-[34px] w-[34px] items-center justify-center rounded-[10px] border border-[rgba(228,177,92,0.3)] bg-[linear-gradient(145deg,rgba(228,177,92,0.16),rgba(228,177,92,0.03))]">
        <div className="absolute inset-0 rounded-[10px] shadow-[inset_0_1px_0_rgba(228,177,92,0.18),inset_0_-1px_0_rgba(0,0,0,0.2)]" />
        <span className="relative text-[11px] font-bold tracking-wide text-[var(--accent)]">IB</span>
      </div>
      {/* Wordmark */}
      <div className="flex flex-col gap-0.5">
        <span className="text-[12px] font-semibold uppercase tracking-[0.26em] text-[var(--accent)] leading-none">
          InvoiceBTC
        </span>
        <span className="hidden text-[10px] leading-none text-[var(--text-muted)] sm:block">
          Stacks testnet
        </span>
      </div>
    </Link>
  )
}

// ─── Nav links ────────────────────────────────────────────────────────────────

function NavLinks() {
  const pathname = usePathname()
  const links = [
    { href: '/',             label: 'Overview'       },
    { href: '/invoices/new', label: 'Create invoice' },
  ]

  return (
    <nav className="hidden items-center gap-0.5 lg:flex">
      {links.map((link) => {
        const active = pathname === link.href
        return (
          <Link
            key={link.href}
            href={link.href}
            className={cn(
              'relative rounded-lg px-3 py-1.5 text-[13px] transition-colors',
              active
                ? 'text-white'
                : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]',
            )}
          >
            {link.label}
            {active && (
              <span className="absolute bottom-0.5 left-1/2 h-px w-3 -translate-x-1/2 rounded-full bg-[var(--accent)] opacity-70" />
            )}
          </Link>
        )
      })}
    </nav>
  )
}

// ─── Network badge ────────────────────────────────────────────────────────────

function NetworkBadge() {
  return (
    <div className="hidden items-center gap-1.5 rounded-full border border-white/[0.07] bg-white/[0.03] px-2.5 py-[5px] text-[11px] font-medium text-[var(--text-muted)] sm:flex">
      <span className="h-[7px] w-[7px] rounded-full bg-[var(--success)] shadow-[0_0_8px_rgba(67,173,139,0.7)]" />
      Testnet
    </div>
  )
}

// ─── Role chip ────────────────────────────────────────────────────────────────

function RoleChip() {
  const { selectedRole, setSelectedRole } = useWallet()

  return (
    <div className="hidden items-center gap-1.5 rounded-full border border-white/[0.07] bg-white/[0.03] pl-2.5 pr-2 py-[5px] text-[11px] sm:flex">
      <span className={cn('h-[7px] w-[7px] shrink-0 rounded-full', ROLE_DOT[selectedRole] ?? 'bg-white/20')} />
      <select
        value={selectedRole}
        onChange={(e) => setSelectedRole(e.target.value as Role)}
        className="appearance-none bg-transparent font-medium capitalize text-[var(--text-muted)] outline-none transition-colors cursor-pointer hover:text-white"
        style={{ fontSize: 11 }}
      >
        {ROLE_OPTIONS.map((r) => (
          <option key={r} value={r} className="bg-[#10141c] capitalize text-white">
            {r.toUpperCase()}
          </option>
        ))}
      </select>
      {/* Chevron */}
      <svg width="9" height="9" viewBox="0 0 10 10" fill="none" className="shrink-0 text-[var(--text-muted)]" aria-hidden>
        <path d="M2.5 3.75L5 6.25L7.5 3.75" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  )
}

// ─── Wallet chip + dropdown ───────────────────────────────────────────────────

function WalletChip() {
  const {
    address, isConnected, isBootstrapping,
    connecting, connect, disconnect,
    isAvailable, status,
  } = useWallet()

  const [open, setOpen] = useState(false)
  const { copied, copy } = useCopy(address ?? '')
  const ref = useRef<HTMLDivElement>(null)

  // Close on outside click
  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  // ── Bootstrapping skeleton ──
  if (isBootstrapping) {
    return (
      <div className="flex h-[30px] w-28 items-center gap-2 rounded-full border border-white/[0.07] bg-white/[0.03] px-3">
        <span className="h-[7px] w-[7px] animate-pulse rounded-full bg-white/10" />
        <span className="h-2 flex-1 animate-pulse rounded-full bg-white/[0.06]" />
      </div>
    )
  }

  // ── Connected — pill + dropdown ──
  if (isConnected && address) {
    return (
      <div ref={ref} className="relative">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className={cn(
            'flex h-[30px] items-center gap-1.5 rounded-full border px-3 font-mono text-[11px] transition',
            open
              ? 'border-[rgba(228,177,92,0.45)] bg-[rgba(228,177,92,0.1)] text-white'
              : status === WALLET_STATUS.wrongNetwork
                ? 'border-[rgba(200,93,99,0.45)] bg-[rgba(200,93,99,0.1)] text-[#f0bec1]'
                : 'border-white/[0.09] bg-white/[0.04] text-[var(--text-secondary)] hover:border-white/20 hover:text-white',
          )}
        >
          <span className={cn(
            'h-[7px] w-[7px] shrink-0 rounded-full shadow-[0_0_6px_currentColor]',
            status === WALLET_STATUS.connected    ? 'bg-[var(--success)] shadow-[rgba(67,173,139,0.7)]'  :
            status === WALLET_STATUS.wrongNetwork ? 'bg-[var(--danger)]  shadow-[rgba(200,93,99,0.7)]'   :
            'bg-white/25 shadow-transparent',
          )} />
          {formatCompactAddress(address, 6, 4)}
          <svg
            width="9" height="9" viewBox="0 0 10 10" fill="none" aria-hidden
            className={cn('shrink-0 text-current opacity-60 transition-transform', open && 'rotate-180')}
          >
            <path d="M2.5 3.75L5 6.25L7.5 3.75" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        {/* ── Dropdown ── */}
        {open && (
          <div className="absolute right-0 top-[calc(100%+10px)] z-50 w-[260px] overflow-hidden rounded-2xl border border-white/[0.1] bg-[rgba(14,18,26,0.98)] shadow-[0_32px_80px_rgba(0,0,0,0.65)] backdrop-blur-2xl">
            {/* Address */}
            <div className="p-4 pb-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--text-muted)]">
                Connected wallet
              </p>
              <p className="mt-2 break-all font-mono text-[11px] leading-[1.7] text-white">
                {address}
              </p>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => copy()}
                  className={cn(
                    'flex flex-1 items-center justify-center gap-1.5 rounded-xl border py-[7px] text-[11px] font-medium transition',
                    copied
                      ? 'border-[rgba(67,173,139,0.4)] bg-[rgba(67,173,139,0.12)] text-[#a8d8c6]'
                      : 'border-white/[0.08] bg-white/[0.04] text-[var(--text-muted)] hover:border-white/15 hover:text-white',
                  )}
                >
                  {copied ? (
                    <>
                      <svg width="11" height="11" viewBox="0 0 12 12" fill="none"><path d="M2 6l2.5 2.5L10 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                      Copied
                    </>
                  ) : (
                    <>
                      <svg width="11" height="11" viewBox="0 0 12 12" fill="none"><rect x="4" y="1" width="7" height="8" rx="1" stroke="currentColor" strokeWidth="1.2" /><path d="M1 4h2v7h5v-1" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" /></svg>
                      Copy
                    </>
                  )}
                </button>
                <a
                  href={explorerAddressUrl(address)}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setOpen(false)}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-white/[0.08] bg-white/[0.04] py-[7px] text-[11px] font-medium text-[var(--text-muted)] transition hover:border-white/15 hover:text-white"
                >
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M1.5 8.5l7-7M8.5 8.5V1.5H1.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  Explorer
                </a>
              </div>
            </div>

            {/* Disconnect */}
            <div className="border-t border-white/[0.06]">
              <button
                type="button"
                onClick={() => { disconnect(); setOpen(false) }}
                className="flex w-full items-center gap-2 px-4 py-[10px] text-[11px] font-medium text-[var(--text-muted)] transition hover:bg-white/[0.04] hover:text-[#f0bec1]"
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M5 1.5H2.5a1 1 0 00-1 1v7a1 1 0 001 1H5M8 8.5l3-3-3-3M5 5.5h6" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Disconnect
              </button>
            </div>
          </div>
        )}
      </div>
    )
  }

  // ── Wallet not installed ──
  if (!isAvailable) {
    return (
      <a
        href={WALLET_INSTALL_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="flex h-[30px] items-center rounded-full border border-white/[0.09] bg-white/[0.04] px-4 text-[11px] font-medium text-[var(--text-muted)] transition hover:border-white/20 hover:text-white"
      >
        Install Leather
      </a>
    )
  }

  // ── Disconnected / connecting ──
  return (
    <button
      type="button"
      onClick={connect}
      disabled={connecting}
      className="flex h-[30px] items-center gap-1.5 rounded-full border border-[rgba(228,177,92,0.38)] bg-[rgba(228,177,92,0.1)] px-4 text-[11px] font-semibold text-[var(--accent)] transition hover:bg-[rgba(228,177,92,0.18)] disabled:cursor-not-allowed disabled:opacity-50"
    >
      {connecting ? (
        <>
          <span className="h-2.5 w-2.5 animate-spin rounded-full border-[1.5px] border-[var(--accent)] border-t-transparent" />
          Connecting
        </>
      ) : 'Connect Leather'}
    </button>
  )
}

// ─── Warning strip ────────────────────────────────────────────────────────────

function WarningStrip() {
  const { isWrongNetwork, isAvailable, isBootstrapping, reconnect } = useWallet()

  if (isBootstrapping || (isAvailable && !isWrongNetwork)) return null

  const message = !isAvailable
    ? 'Leather was not detected. Install the extension and switch to Stacks Testnet.'
    : 'Leather is on the wrong network. Switch to Stacks Testnet to submit transactions.'

  return (
    <div className="border-t border-[rgba(228,177,92,0.1)] bg-[rgba(228,177,92,0.055)]">
      <PageContainer>
        <div className="flex items-center justify-between gap-4 py-2">
          <div className="flex items-center gap-2 text-[11px] text-[#ddc98f]">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="shrink-0">
              <path d="M6 1.5L10.5 9.5H1.5L6 1.5Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
              <path d="M6 5v2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
              <circle cx="6" cy="8.5" r="0.5" fill="currentColor" />
            </svg>
            {message}
          </div>
          {isWrongNetwork && (
            <button
              type="button"
              onClick={reconnect}
              className="shrink-0 rounded-lg border border-[rgba(228,177,92,0.28)] bg-[rgba(228,177,92,0.1)] px-3 py-[4px] text-[10px] font-semibold text-[var(--accent)] transition hover:bg-[rgba(228,177,92,0.18)]"
            >
              Re-check
            </button>
          )}
        </div>
      </PageContainer>
    </div>
  )
}

// ─── Header ───────────────────────────────────────────────────────────────────

export function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-white/[0.055] bg-[rgba(11,13,18,0.94)] backdrop-blur-2xl">
      <PageContainer>
        <div className="flex h-16 items-center gap-4">
          <Logo />

          {/* Nav — desktop only */}
          <div className="pl-1">
            <NavLinks />
          </div>

          <div className="flex-1" />

          {/* Controls group */}
          <div className="flex items-center gap-2.5">
            <NetworkBadge />
            <VRule />
            <RoleChip />
            <VRule />
            <WalletChip />
          </div>
        </div>
      </PageContainer>

      {/* Persistent warning — only when wallet is missing or wrong network */}
      <WarningStrip />
    </header>
  )
}

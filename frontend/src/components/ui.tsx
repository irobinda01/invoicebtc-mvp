'use client'

import Link from 'next/link'
import type { ReactNode } from 'react'
import { cn } from '@/lib/ui'

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="relative min-h-screen overflow-x-clip bg-[var(--bg)] text-[var(--text-primary)]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(228,177,92,0.12),_transparent_28%),radial-gradient(circle_at_80%_20%,_rgba(90,140,255,0.08),_transparent_24%)]" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/25 to-transparent" />
      <div className="relative">{children}</div>
    </div>
  )
}

export function PageContainer({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('mx-auto w-full max-w-7xl px-5 sm:px-6 lg:px-8', className)}>{children}</div>
}

export function Section({
  children,
  className,
  eyebrow,
  title,
  description,
}: {
  children: ReactNode
  className?: string
  eyebrow?: string
  title?: string
  description?: string
}) {
  return (
    <section className={cn('py-12 sm:py-16', className)}>
      {(eyebrow || title || description) && (
        <div className="mb-8 max-w-3xl">
          {eyebrow && <p className="ui-eyebrow">{eyebrow}</p>}
          {title && <h2 className="mt-3 text-balance text-3xl font-semibold tracking-[-0.03em] text-white sm:text-4xl">{title}</h2>}
          {description && <p className="mt-4 text-base leading-7 text-[var(--text-secondary)] sm:text-lg">{description}</p>}
        </div>
      )}
      {children}
    </section>
  )
}

export function Surface({
  children,
  className,
  elevated = false,
}: {
  children: ReactNode
  className?: string
  elevated?: boolean
}) {
  return (
    <div
      className={cn(
        'rounded-[var(--radius-lg)] border border-[var(--border-strong)] bg-[var(--surface)]',
        elevated && 'shadow-[var(--shadow-soft)]',
        className,
      )}
    >
      {children}
    </div>
  )
}

export function MetricCard({
  label,
  value,
  hint,
  tone = 'default',
}: {
  label: string
  value: ReactNode
  hint?: ReactNode
  tone?: 'default' | 'accent' | 'success'
}) {
  return (
    <Surface
      className={cn(
        'p-5 sm:p-6',
        tone === 'accent' && 'bg-[linear-gradient(180deg,rgba(228,177,92,0.14),rgba(15,19,28,0.96))]',
        tone === 'success' && 'bg-[linear-gradient(180deg,rgba(67,173,139,0.12),rgba(15,19,28,0.96))]',
      )}
    >
      <p className="text-sm text-[var(--text-muted)]">{label}</p>
      <div className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-white sm:text-3xl">{value}</div>
      {hint && <div className="mt-3 text-sm text-[var(--text-secondary)]">{hint}</div>}
    </Surface>
  )
}

export function Button({
  children,
  className,
  variant = 'primary',
  href,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode
  className?: string
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  href?: string
}) {
  const classes = cn(
    'inline-flex min-h-11 items-center justify-center rounded-[var(--radius-md)] px-4 py-2.5 text-sm font-semibold transition duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)] disabled:cursor-not-allowed disabled:opacity-50',
    variant === 'primary' && 'bg-[var(--accent)] text-[var(--accent-contrast)] shadow-[0_18px_44px_rgba(228,177,92,0.24)] hover:bg-[var(--accent-strong)]',
    variant === 'secondary' && 'border border-white/12 bg-white/[0.05] text-white hover:bg-white/[0.08]',
    variant === 'ghost' && 'text-[var(--text-secondary)] hover:bg-white/[0.05] hover:text-white',
    variant === 'danger' && 'bg-[var(--danger)] text-white hover:bg-[#d34a50]',
    className,
  )

  if (href) {
    return (
      <Link href={href} className={classes}>
        {children}
      </Link>
    )
  }

  return (
    <button className={classes} {...props}>
      {children}
    </button>
  )
}

export function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string
  hint?: string
  required?: boolean
  children: ReactNode
}) {
  return (
    <label className="block space-y-2">
      <span className="flex items-center gap-2 text-sm font-medium text-white">
        {label}
        {required && <span className="text-[var(--accent)]">*</span>}
      </span>
      {children}
      {hint && <span className="block text-sm text-[var(--text-muted)]">{hint}</span>}
    </label>
  )
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cn(
        'w-full rounded-[var(--radius-md)] border border-[var(--border-strong)] bg-[var(--surface-2)] px-4 py-3 text-sm text-white placeholder:text-[var(--text-muted)] transition focus:border-[var(--accent)] focus:outline-none focus:ring-4 focus:ring-[rgba(228,177,92,0.14)]',
        props.className,
      )}
    />
  )
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={cn(
        'w-full rounded-[var(--radius-md)] border border-[var(--border-strong)] bg-[var(--surface-2)] px-4 py-3 text-sm text-white transition focus:border-[var(--accent)] focus:outline-none focus:ring-4 focus:ring-[rgba(228,177,92,0.14)]',
        props.className,
      )}
    />
  )
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string
  description: string
  action?: ReactNode
}) {
  return (
    <Surface className="p-8 text-center sm:p-10">
      <div className="mx-auto max-w-md">
        <div className="mx-auto h-12 w-12 rounded-full border border-white/10 bg-white/[0.04]" />
        <h3 className="mt-5 text-xl font-semibold text-white">{title}</h3>
        <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">{description}</p>
        {action && <div className="mt-6 flex justify-center">{action}</div>}
      </div>
    </Surface>
  )
}

export function DetailRow({
  label,
  value,
  mono = false,
}: {
  label: string
  value: ReactNode
  mono?: boolean
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-white/6 py-3 last:border-b-0 last:pb-0 first:pt-0">
      <dt className="text-sm text-[var(--text-muted)]">{label}</dt>
      <dd className={cn('text-right text-sm text-white', mono && 'font-mono text-[13px]')}>{value}</dd>
    </div>
  )
}

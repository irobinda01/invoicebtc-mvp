/**
 * Invoice role resolution and LP access control — logic tests.
 *
 * Plain Node assertions, no test-runner dependency required.
 * Run with:  cd frontend && npx ts-node src/lib/__tests__/invoiceRole.test.ts
 *
 * Each section maps to a contract or frontend rule.
 */

import assert from 'node:assert/strict'
import type { Role } from '../types'

// ─── Helpers mirroring page.tsx / contract logic ─────────────────────────────

type InvoiceParties = { merchant: string; client: string; lp: string | null }

function resolveRole(address: string | null, inv: InvoiceParties): Role {
  if (!address) return 'observer'
  const a = address.toUpperCase()
  if (a === inv.merchant?.toUpperCase()) return 'merchant'
  if (a === inv.client?.toUpperCase()) return 'client'
  if (inv.lp && a === inv.lp.toUpperCase()) return 'lp'
  return 'observer'
}

function canActAsLp(opts: { role: Role; selectedRole: Role; lpAddress: string | null }): boolean {
  const isLp = opts.role === 'lp'
  const isParty = opts.role === 'merchant' || opts.role === 'client'
  return isLp || (opts.selectedRole === 'lp' && !opts.lpAddress && !isParty)
}

function resolveDisabledRoles(opts: { role: Role; lpAddress: string | null }): Role[] {
  const isLp = opts.role === 'lp'
  const isParty = opts.role === 'merchant' || opts.role === 'client'
  if (isParty) return ['lp']
  if (!isLp && opts.lpAddress) return ['lp']
  return []
}

/** Mirrors canFundThis from page.tsx */
function canFundThis(opts: { canActAsLp: boolean; isNextFundable: boolean; canFundLive: boolean }): boolean {
  return opts.canActAsLp && opts.isNextFundable && opts.canFundLive
}

/** Mirrors the funding window pill label from page.tsx */
function fundingWindowLabel(opts: { fundingWindowClosed: boolean; fundingHoursLeft: number }): string {
  return opts.fundingWindowClosed ? 'Open · MVP' : `${opts.fundingHoursLeft}h remaining`
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const A = 'ST1MERCHANT000000000000000000000000000001'
const B = 'ST2CLIENT0000000000000000000000000000002'
const C = 'ST3LP000000000000000000000000000000000003'
const D = 'ST4OBSERVER00000000000000000000000000004'

function inv(overrides: Partial<InvoiceParties> = {}): InvoiceParties {
  return { merchant: A, client: B, lp: null, ...overrides }
}

let passed = 0
let failed = 0

function run(label: string, fn: () => void) {
  try {
    fn()
    console.log(`  ✓  ${label}`)
    passed++
  } catch (e) {
    console.error(`  ✗  ${label}`)
    console.error(`     ${(e as Error).message}`)
    failed++
  }
}

// ─── Role resolution ──────────────────────────────────────────────────────────

console.log('\nRole resolution — per-invoice')
run('merchant wallet → merchant role', () => assert.equal(resolveRole(A, inv()), 'merchant'))
run('client wallet → client role',     () => assert.equal(resolveRole(B, inv()), 'client'))
run('assigned LP wallet → lp role',    () => assert.equal(resolveRole(C, inv({ lp: C })), 'lp'))
run('unrelated wallet, no LP → observer', () => assert.equal(resolveRole(D, inv()), 'observer'))
run('unrelated wallet, LP already set → observer', () => assert.equal(resolveRole(D, inv({ lp: C })), 'observer'))
run('null address → observer',         () => assert.equal(resolveRole(null, inv()), 'observer'))
run('case-insensitive merchant match', () => assert.equal(resolveRole(A.toLowerCase(), inv()), 'merchant'))
run('case-insensitive client match',   () => assert.equal(resolveRole(B.toLowerCase(), inv()), 'client'))
run('case-insensitive lp match',       () => assert.equal(resolveRole(C.toLowerCase(), inv({ lp: C })), 'lp'))

// ─── canActAsLp ───────────────────────────────────────────────────────────────

console.log('\ncanActAsLp')
run('assigned LP can act as LP',                         () => assert.equal(canActAsLp({ role: 'lp', selectedRole: 'observer', lpAddress: C }), true))
run('observer + LP role selected + no LP → can fund',    () => assert.equal(canActAsLp({ role: 'observer', selectedRole: 'lp', lpAddress: null }), true))
run('observer + LP role selected + LP exists → blocked', () => assert.equal(canActAsLp({ role: 'observer', selectedRole: 'lp', lpAddress: C }), false))
run('merchant cannot act as LP',                         () => assert.equal(canActAsLp({ role: 'merchant', selectedRole: 'lp', lpAddress: null }), false))
run('client cannot act as LP',                           () => assert.equal(canActAsLp({ role: 'client', selectedRole: 'lp', lpAddress: null }), false))
run('observer without LP role selected → cannot fund',   () => assert.equal(canActAsLp({ role: 'observer', selectedRole: 'observer', lpAddress: null }), false))

// ─── disabledRoles ────────────────────────────────────────────────────────────

console.log('\nresolveDisabledRoles')
run('merchant: LP role disabled',                         () => assert(resolveDisabledRoles({ role: 'merchant', lpAddress: null }).includes('lp')))
run('client: LP role disabled',                           () => assert(resolveDisabledRoles({ role: 'client', lpAddress: null }).includes('lp')))
run('observer + LP already assigned: LP role disabled',   () => assert(resolveDisabledRoles({ role: 'observer', lpAddress: C }).includes('lp')))
run('observer + no LP: LP role enabled',                  () => assert(!resolveDisabledRoles({ role: 'observer', lpAddress: null }).includes('lp')))
run('assigned LP: no roles disabled',                     () => assert.equal(resolveDisabledRoles({ role: 'lp', lpAddress: C }).length, 0))

// ─── MVP: funding windows do not block funding ────────────────────────────────
//
// Mirrors the contract change: can-fund and fund-milestone no longer assert
// (<= stacks-block-height funding-deadline). canFundLive is derived from
// can-fund, which now returns true regardless of deadline for eligible invoices.

console.log('\nMVP funding windows — deadline does not block funding')

run('eligible invoice fundable after deadline (canFundLive=true)', () =>
  assert.equal(canFundThis({ canActAsLp: true, isNextFundable: true, canFundLive: true }), true))

run('observer-as-LP can fund after deadline', () => {
  const role = resolveRole(C, inv())
  assert.equal(canFundThis({ canActAsLp: canActAsLp({ role, selectedRole: 'lp', lpAddress: null }), isNextFundable: true, canFundLive: true }), true)
})

run('escrow missing still blocks (canFundLive=false)', () =>
  assert.equal(canFundThis({ canActAsLp: true, isNextFundable: true, canFundLive: false }), false))

run('wrong milestone still blocks', () =>
  assert.equal(canFundThis({ canActAsLp: true, isNextFundable: false, canFundLive: true }), false))

run('LP exclusivity blocks second LP even after deadline', () => {
  const role = resolveRole(D, inv({ lp: C }))
  assert.equal(canFundThis({ canActAsLp: canActAsLp({ role, selectedRole: 'lp', lpAddress: C }), isNextFundable: true, canFundLive: true }), false)
})

run('merchant cannot fund own invoice after deadline', () => {
  const role = resolveRole(A, inv())
  assert.equal(canFundThis({ canActAsLp: canActAsLp({ role, selectedRole: 'lp', lpAddress: null }), isNextFundable: true, canFundLive: true }), false)
})

run('client cannot fund own invoice after deadline', () => {
  const role = resolveRole(B, inv())
  assert.equal(canFundThis({ canActAsLp: canActAsLp({ role, selectedRole: 'lp', lpAddress: null }), isNextFundable: true, canFundLive: true }), false)
})

run('pill shows "Open · MVP" when deadline passed (not "Closed")', () =>
  assert.equal(fundingWindowLabel({ fundingWindowClosed: true, fundingHoursLeft: 0 }), 'Open · MVP'))

run('pill shows remaining hours when deadline not yet passed', () =>
  assert.equal(fundingWindowLabel({ fundingWindowClosed: false, fundingHoursLeft: 12 }), '12h remaining'))

// ─── Cross-invoice role independence ─────────────────────────────────────────

console.log('\nCross-invoice role independence')

const invoiceA = inv({ merchant: A, client: B })
const invoiceB = inv({ merchant: B, client: D })
const invoiceC = inv({ merchant: D, client: B, lp: A })

run('wallet A is merchant on invoice A',    () => assert.equal(resolveRole(A, invoiceA), 'merchant'))
run('wallet A is LP on invoice C',          () => assert.equal(resolveRole(A, invoiceC), 'lp'))
run('wallet B is client on A, merchant on B', () => {
  assert.equal(resolveRole(B, invoiceA), 'client')
  assert.equal(resolveRole(B, invoiceB), 'merchant')
})
run('wallet A as merchant on A cannot also act as LP on A', () => {
  const role = resolveRole(A, invoiceA)
  assert.equal(canActAsLp({ role, selectedRole: 'lp', lpAddress: null }), false)
})

// ─── Milestone-aware getNextStep logic ───────────────────────────────────────
//
// These tests verify the milestone-by-milestone funding flow from page.tsx.
// They use the same helper logic that getNextStep / nextFundableMilestone use.

type MilestoneStatus = 'pending' | 'funded' | 'submitted' | 'approved' | 'settled' | 'cancelled'
type InvoiceStatus = 'draft' | 'merchant-signed' | 'client-signed' | 'escrow-funded' | 'active' | 'matured' | 'dispute' | 'completed' | 'cancelled'

interface MockMilestone { id: number; status: MilestoneStatus }
interface MockInvoice {
  status: InvoiceStatus
  merchantSigned: boolean
  clientSigned: boolean
  lp: string | null
}

/** Mirrors nextFundableMilestone from page.tsx */
function nextFundable(inv: MockInvoice, milestones: MockMilestone[]): MockMilestone | null {
  return milestones.find((m, i) => {
    if (!['escrow-funded', 'active'].includes(inv.status)) return false
    if (m.status !== 'pending') return false
    if (i === 0) return true
    const prev = milestones[i - 1]
    return prev?.status === 'approved' || prev?.status === 'settled'
  }) ?? null
}

/** Mirrors getNextStep actor from page.tsx */
function stepActor(inv: MockInvoice, milestones: MockMilestone[], nfm: MockMilestone | null): string | null {
  switch (inv.status) {
    case 'draft': return null
    case 'merchant-signed': return 'Client'
    case 'client-signed': return !inv.merchantSigned ? 'Merchant' : 'Client'
    case 'escrow-funded': return 'Liquidity Provider'
    case 'active': {
      const submitted = milestones.find(m => m.status === 'submitted')
      if (submitted) return 'Client'
      const funded = milestones.find(m => m.status === 'funded')
      if (funded) return 'Merchant'
      if (nfm) return 'Liquidity Provider'
      return null
    }
    case 'matured': return 'Liquidity Provider'
    case 'completed': return 'Client'
    default: return null
  }
}

/** Mirrors lockedReason from page.tsx milestone map */
function lockedReason(inv: MockInvoice, milestones: MockMilestone[], milestone: MockMilestone): string | null {
  const index = milestones.findIndex(m => m.id === milestone.id)
  const prev = index > 0 ? milestones[index - 1] : null
  const isLpEligible = ['escrow-funded', 'active'].includes(inv.status)
  const nfm = nextFundable(inv, milestones)
  const isLocked = isLpEligible && milestone.status === 'pending' && nfm?.id !== milestone.id
  if (!isLocked || !prev) return null
  if (prev.status === 'pending') return `Milestone ${prev.id} must be funded first`
  if (prev.status === 'funded') return `Waiting for merchant to submit proof on Milestone ${prev.id}`
  if (prev.status === 'submitted') return `Waiting for client to approve Milestone ${prev.id}`
  return null
}

function ms(id: number, status: MilestoneStatus): MockMilestone { return { id, status } }
function invoice(status: InvoiceStatus, extra: Partial<MockInvoice> = {}): MockInvoice {
  return { status, merchantSigned: true, clientSigned: true, lp: null, ...extra }
}

console.log('\nMilestone-aware getNextStep actor')

run('draft → no actor', () =>
  assert.equal(stepActor(invoice('draft'), [], null), null))

run('merchant-signed → Client must sign', () =>
  assert.equal(stepActor(invoice('merchant-signed'), [], null), 'Client'))

run('client-signed, merchant not yet signed → Merchant', () =>
  assert.equal(stepActor(invoice('client-signed', { merchantSigned: false }), [], null), 'Merchant'))

run('client-signed, both signed → Client must deposit escrow', () =>
  assert.equal(stepActor(invoice('client-signed', { merchantSigned: true }), [], null), 'Client'))

run('escrow-funded → LP must fund milestone 1', () => {
  const ms1 = ms(1, 'pending')
  const nfm = nextFundable(invoice('escrow-funded'), [ms1])
  assert.equal(stepActor(invoice('escrow-funded'), [ms1], nfm), 'Liquidity Provider')
})

run('active, milestone funded → Merchant must submit proof', () => {
  const milestones = [ms(1, 'funded'), ms(2, 'pending')]
  const inv2 = invoice('active', { lp: C })
  const nfm = nextFundable(inv2, milestones)
  assert.equal(stepActor(inv2, milestones, nfm), 'Merchant')
})

run('active, milestone submitted → Client must approve', () => {
  const milestones = [ms(1, 'submitted'), ms(2, 'pending')]
  const inv2 = invoice('active', { lp: C })
  const nfm = nextFundable(inv2, milestones)
  assert.equal(stepActor(inv2, milestones, nfm), 'Client')
})

run('active, milestone 1 approved → LP funds milestone 2', () => {
  const milestones = [ms(1, 'approved'), ms(2, 'pending')]
  const inv2 = invoice('active', { lp: C })
  const nfm = nextFundable(inv2, milestones)
  assert.equal(stepActor(inv2, milestones, nfm), 'Liquidity Provider')
})

console.log('\nnextFundableMilestone sequential logic')

run('milestone 1 is next when all pending', () => {
  const milestones = [ms(1, 'pending'), ms(2, 'pending'), ms(3, 'pending')]
  assert.equal(nextFundable(invoice('escrow-funded'), milestones)?.id, 1)
})

run('milestone 2 is next only after milestone 1 is approved', () => {
  const milestones = [ms(1, 'approved'), ms(2, 'pending'), ms(3, 'pending')]
  assert.equal(nextFundable(invoice('active', { lp: C }), milestones)?.id, 2)
})

run('milestone 2 NOT available when milestone 1 is only funded (not approved)', () => {
  const milestones = [ms(1, 'funded'), ms(2, 'pending'), ms(3, 'pending')]
  // milestone 1 is funded but not approved, so milestone 2 should not be next
  assert.equal(nextFundable(invoice('active', { lp: C }), milestones), null)
})

run('milestone 2 NOT available when milestone 1 proof is submitted (awaiting approval)', () => {
  const milestones = [ms(1, 'submitted'), ms(2, 'pending'), ms(3, 'pending')]
  assert.equal(nextFundable(invoice('active', { lp: C }), milestones), null)
})

run('milestone 3 is next after milestones 1 and 2 are approved', () => {
  const milestones = [ms(1, 'approved'), ms(2, 'approved'), ms(3, 'pending')]
  assert.equal(nextFundable(invoice('active', { lp: C }), milestones)?.id, 3)
})

run('no next milestone when invoice is not in escrow-funded/active status', () => {
  const milestones = [ms(1, 'pending')]
  assert.equal(nextFundable(invoice('client-signed'), milestones), null)
})

console.log('\nLocked reason display')

run('milestone 2 locked when milestone 1 is pending', () => {
  const milestones = [ms(1, 'pending'), ms(2, 'pending')]
  const reason = lockedReason(invoice('escrow-funded'), milestones, milestones[1])
  assert.equal(reason, 'Milestone 1 must be funded first')
})

run('milestone 2 locked with "awaiting proof" when milestone 1 is funded', () => {
  const milestones = [ms(1, 'funded'), ms(2, 'pending')]
  const reason = lockedReason(invoice('active', { lp: C }), milestones, milestones[1])
  assert.equal(reason, 'Waiting for merchant to submit proof on Milestone 1')
})

run('milestone 2 locked with "awaiting approval" when milestone 1 is submitted', () => {
  const milestones = [ms(1, 'submitted'), ms(2, 'pending')]
  const reason = lockedReason(invoice('active', { lp: C }), milestones, milestones[1])
  assert.equal(reason, 'Waiting for client to approve Milestone 1')
})

run('milestone 1 has no locked reason (it is the first)', () => {
  const milestones = [ms(1, 'pending'), ms(2, 'pending')]
  assert.equal(lockedReason(invoice('escrow-funded'), milestones, milestones[0]), null)
})

run('approved milestone has no locked reason', () => {
  const milestones = [ms(1, 'approved'), ms(2, 'pending')]
  assert.equal(lockedReason(invoice('active', { lp: C }), milestones, milestones[0]), null)
})

// ─── LP funding button visibility ─────────────────────────────────────────────

console.log('\nLP funding button visibility')

/** Mirrors the canActAsLp && nextFundableMilestone && canFundLive gate */
function showsFundButton(opts: {
  canActAsLp: boolean
  nextFundableMilestone: { id: number } | null
  canFundLive: boolean
}): boolean {
  return opts.canActAsLp && !!opts.nextFundableMilestone && opts.canFundLive
}

run('fund button visible for eligible LP with fundable milestone and open gate', () => {
  assert.equal(showsFundButton({ canActAsLp: true, nextFundableMilestone: { id: 1 }, canFundLive: true }), true)
})

run('fund button hidden when canActAsLp is false', () => {
  assert.equal(showsFundButton({ canActAsLp: false, nextFundableMilestone: { id: 1 }, canFundLive: true }), false)
})

run('fund button hidden when no fundable milestone', () => {
  assert.equal(showsFundButton({ canActAsLp: true, nextFundableMilestone: null, canFundLive: true }), false)
})

run('fund button hidden when canFundLive is false', () => {
  assert.equal(showsFundButton({ canActAsLp: true, nextFundableMilestone: { id: 1 }, canFundLive: false }), false)
})

run('fund button hidden for merchant even with open gate', () => {
  const role = resolveRole(A, { merchant: A, client: B, lp: null })
  const cap = canActAsLp({ role, selectedRole: role, lpAddress: null })
  assert.equal(showsFundButton({ canActAsLp: cap, nextFundableMilestone: { id: 1 }, canFundLive: true }), false)
})

run('fund button visible for observer-as-LP when no LP assigned', () => {
  const role = resolveRole(D, { merchant: A, client: B, lp: null })
  const cap = canActAsLp({ role, selectedRole: 'lp', lpAddress: null })
  assert.equal(showsFundButton({ canActAsLp: cap, nextFundableMilestone: { id: 1 }, canFundLive: true }), true)
})

run('fund button hidden for observer-as-LP when LP already assigned to someone else', () => {
  const role = resolveRole(D, { merchant: A, client: B, lp: C })
  const cap = canActAsLp({ role, selectedRole: 'lp', lpAddress: C })
  assert.equal(showsFundButton({ canActAsLp: cap, nextFundableMilestone: { id: 1 }, canFundLive: true }), false)
})

// ─── Summary ──────────────────────────────────────────────────────────────────

console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed\n`)
if (failed > 0) process.exit(1)

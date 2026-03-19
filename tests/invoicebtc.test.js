import { describe, expect, it } from 'vitest'
import { Cl } from '@stacks/transactions'

const ERR_INVALID_STATE = Cl.uint(104)
const ERR_INVALID_MILESTONE_STATE = Cl.uint(110)

function accounts() {
  const all = simnet.getAccounts()
  return {
    deployer: all.get('deployer'),
    merchant: all.get('wallet_1'),
    client: all.get('wallet_2'),
    lp: all.get('wallet_3'),
  }
}

function tokenPrincipal() {
  const { deployer } = accounts()
  return Cl.contractPrincipal(deployer, 'mock-sbtc')
}

function milestoneKey(invoiceId, milestoneId) {
  return Cl.tuple({
    'invoice-id': Cl.uint(invoiceId),
    'milestone-id': Cl.uint(milestoneId),
  })
}

function mint(amount, recipient) {
  const { deployer } = accounts()
  return simnet.callPublicFn('mock-sbtc', 'mint', [Cl.uint(amount), Cl.principal(recipient)], deployer)
}

function createInvoice() {
  const { merchant, client } = accounts()
  return simnet.callPublicFn(
    'invoicebtc',
    'create-invoice',
    [
      Cl.principal(client),
      Cl.uint(1_000_000),
      Cl.uint(500),
      Cl.uint(1_000),
      Cl.bufferFromAscii('milestone-demo'),
      Cl.list([Cl.uint(600_000), Cl.uint(400_000)]),
      Cl.list([Cl.uint(540_000), Cl.uint(360_000)]),
      Cl.list([Cl.uint(600_000), Cl.uint(400_000)]),
      Cl.list([Cl.uint(300), Cl.uint(600)]),
    ],
    merchant,
  )
}

function signInvoice() {
  const { merchant, client } = accounts()
  expect(simnet.callPublicFn('invoicebtc', 'client-sign-invoice', [Cl.uint(1)], client).result).toBeOk(Cl.bool(true))
  expect(simnet.callPublicFn('invoicebtc', 'merchant-sign-invoice', [Cl.uint(1)], merchant).result).toBeOk(Cl.bool(true))
}

function depositEscrow() {
  const { client } = accounts()
  expect(mint(1_000_000, client).result).toBeOk(Cl.bool(true))
  expect(
    simnet.callPublicFn('invoicebtc', 'fund-escrow', [tokenPrincipal(), Cl.uint(1), Cl.uint(1_000_000)], client).result,
  ).toBeOk(Cl.bool(true))
}

function fundMilestone(milestoneId) {
  const { lp } = accounts()
  return simnet.callPublicFn('invoicebtc', 'fund-milestone', [tokenPrincipal(), Cl.uint(1), Cl.uint(milestoneId)], lp)
}

function submitMilestone(milestoneId, proof = 'proof-m1') {
  const { merchant } = accounts()
  return simnet.callPublicFn(
    'invoicebtc',
    'submit-milestone',
    [Cl.uint(1), Cl.uint(milestoneId), Cl.bufferFromAscii(proof)],
    merchant,
  )
}

function approveMilestone(milestoneId) {
  const { client } = accounts()
  return simnet.callPublicFn('invoicebtc', 'approve-milestone', [Cl.uint(1), Cl.uint(milestoneId)], client)
}

describe('invoicebtc staged LP funding', () => {
  it('cannot fund any milestone before both signatures', () => {
    const { lp } = accounts()

    expect(createInvoice().result).toBeOk(Cl.uint(1))
    expect(mint(900_000, lp).result).toBeOk(Cl.bool(true))

    const result = simnet.callPublicFn(
      'invoicebtc',
      'fund-milestone',
      [tokenPrincipal(), Cl.uint(1), Cl.uint(1)],
      lp,
    )

    expect(result.result).toBeErr(ERR_INVALID_STATE)
  })

  it('cannot fund any milestone before client escrow deposit', () => {
    const { lp } = accounts()

    expect(createInvoice().result).toBeOk(Cl.uint(1))
    signInvoice()
    expect(mint(900_000, lp).result).toBeOk(Cl.bool(true))

    const result = fundMilestone(1)

    expect(result.result).toBeErr(ERR_INVALID_STATE)
  })

  it('can fund first milestone after signatures and escrow', () => {
    const { lp } = accounts()

    expect(createInvoice().result).toBeOk(Cl.uint(1))
    signInvoice()
    depositEscrow()
    expect(mint(900_000, lp).result).toBeOk(Cl.bool(true))

    const result = fundMilestone(1)

    expect(result.result).toBeOk(Cl.uint(540_000))
  })

  it('cannot fund second milestone before first milestone completion submission', () => {
    const { lp } = accounts()

    expect(createInvoice().result).toBeOk(Cl.uint(1))
    signInvoice()
    depositEscrow()
    expect(mint(900_000, lp).result).toBeOk(Cl.bool(true))
    expect(fundMilestone(1).result).toBeOk(Cl.uint(540_000))

    const result = fundMilestone(2)

    expect(result.result).toBeErr(ERR_INVALID_STATE)
  })

  it('cannot fund second milestone before first milestone client confirmation', () => {
    const { lp } = accounts()

    expect(createInvoice().result).toBeOk(Cl.uint(1))
    signInvoice()
    depositEscrow()
    expect(mint(900_000, lp).result).toBeOk(Cl.bool(true))
    expect(fundMilestone(1).result).toBeOk(Cl.uint(540_000))
    expect(submitMilestone(1).result).toBeOk(Cl.bool(true))

    const result = fundMilestone(2)

    expect(result.result).toBeErr(ERR_INVALID_STATE)
  })

  it('merchant cannot submit completion for unfunded milestone', () => {
    expect(createInvoice().result).toBeOk(Cl.uint(1))
    signInvoice()
    depositEscrow()

    const result = submitMilestone(1)

    expect(result.result).toBeErr(ERR_INVALID_MILESTONE_STATE)
  })

  it('client cannot confirm before merchant completion submission', () => {
    const { lp } = accounts()

    expect(createInvoice().result).toBeOk(Cl.uint(1))
    signInvoice()
    depositEscrow()
    expect(mint(900_000, lp).result).toBeOk(Cl.bool(true))
    expect(fundMilestone(1).result).toBeOk(Cl.uint(540_000))

    const result = approveMilestone(1)

    expect(result.result).toBeErr(ERR_INVALID_MILESTONE_STATE)
  })

  it('stores the proof hash after merchant submission', () => {
    const { lp } = accounts()

    expect(createInvoice().result).toBeOk(Cl.uint(1))
    signInvoice()
    depositEscrow()
    expect(mint(900_000, lp).result).toBeOk(Cl.bool(true))
    expect(fundMilestone(1).result).toBeOk(Cl.uint(540_000))
    expect(submitMilestone(1, 'proof-m1').result).toBeOk(Cl.bool(true))

    const milestone = simnet.getMapEntry('invoicebtc', 'milestones', milestoneKey(1, 1))
    const printed = Cl.prettyPrint(milestone)

    expect(printed).toContain('0x70726f6f662d6d31')
    expect(printed).toContain('u2')
  })

  it('runs the full staged sequence across multiple milestones', () => {
    const { lp } = accounts()

    expect(createInvoice().result).toBeOk(Cl.uint(1))
    signInvoice()
    depositEscrow()
    expect(mint(900_000, lp).result).toBeOk(Cl.bool(true))

    expect(fundMilestone(1).result).toBeOk(Cl.uint(540_000))
    expect(submitMilestone(1, 'proof-1').result).toBeOk(Cl.bool(true))
    expect(approveMilestone(1).result).toBeOk(Cl.bool(true))

    expect(fundMilestone(2).result).toBeOk(Cl.uint(360_000))
    expect(submitMilestone(2, 'proof-2').result).toBeOk(Cl.bool(true))
    expect(approveMilestone(2).result).toBeOk(Cl.bool(true))

    const invoice = simnet.getMapEntry('invoicebtc', 'invoices', Cl.uint(1))
    const secondMilestone = simnet.getMapEntry('invoicebtc', 'milestones', milestoneKey(1, 2))

    expect(Cl.prettyPrint(invoice)).toContain('u900000')
    expect(Cl.prettyPrint(secondMilestone)).toContain('u3')
  })

  it('blocks duplicate funding, duplicate submission, and duplicate confirmation', () => {
    const { lp } = accounts()

    expect(createInvoice().result).toBeOk(Cl.uint(1))
    signInvoice()
    depositEscrow()
    expect(mint(900_000, lp).result).toBeOk(Cl.bool(true))

    expect(fundMilestone(1).result).toBeOk(Cl.uint(540_000))
    expect(fundMilestone(1).result).toBeErr(ERR_INVALID_MILESTONE_STATE)

    expect(submitMilestone(1).result).toBeOk(Cl.bool(true))
    expect(submitMilestone(1).result).toBeErr(ERR_INVALID_MILESTONE_STATE)

    expect(approveMilestone(1).result).toBeOk(Cl.bool(true))
    expect(approveMilestone(1).result).toBeErr(ERR_INVALID_MILESTONE_STATE)
  })
})

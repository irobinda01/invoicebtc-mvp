import { describe, expect, it } from "vitest";
import { Cl } from "@stacks/transactions";

const accounts = simnet.getAccounts();
const deployer = accounts.get("deployer")!;
const merchant = accounts.get("wallet_1")!;
const client = accounts.get("wallet_2")!;
const lp = accounts.get("wallet_3")!;
const otherLp = accounts.get("wallet_4")!;

const ERR_INVALID_STATE = Cl.uint(104);
const ERR_INVALID_TOTAL = Cl.uint(107);
const ERR_INVALID_FUNDING = Cl.uint(108);
const ERR_INVALID_MILESTONE_STATE = Cl.uint(110);
const ERR_TOO_EARLY = Cl.uint(112);
const ERR_CLOSE_BLOCKED = Cl.uint(117);

function createInvoice(args?: {
  due1?: number;
  due2?: number;
  faceValues?: [number, number];
  merchantPayouts?: [number, number];
  repayments?: [number, number];
}) {
  const current = simnet.blockHeight;
  const faceValues = args?.faceValues ?? [60, 40];
  const merchantPayouts = args?.merchantPayouts ?? [55, 35];
  const repayments = args?.repayments ?? [60, 40];
  const due1 = args?.due1 ?? current + 10;
  const due2 = args?.due2 ?? current + 20;

  const receipt = simnet.callPublicFn(
    "invoicebtc",
    "create-invoice",
    [
      Cl.principal(client),
      Cl.uint(faceValues[0] + faceValues[1]),
      Cl.uint(current + 20),
      Cl.uint(current + 40),
      Cl.bufferFromAscii("invoice-001"),
      Cl.list(faceValues.map((value) => Cl.uint(value))),
      Cl.list(merchantPayouts.map((value) => Cl.uint(value))),
      Cl.list(repayments.map((value) => Cl.uint(value))),
      Cl.list([Cl.uint(due1), Cl.uint(due2)]),
    ],
    merchant
  );

  return { receipt, due1, due2 };
}

function mintSbtc(amount: number, recipient: string) {
  return simnet.callPublicFn(
    "mock-sbtc",
    "mint",
    [Cl.uint(amount), Cl.principal(recipient)],
    deployer
  );
}

function signInvoice() {
  expect(simnet.callPublicFn("invoicebtc", "merchant-sign-invoice", [Cl.uint(1)], merchant).result).toBeOk(
    Cl.bool(true)
  );
  expect(simnet.callPublicFn("invoicebtc", "client-sign-invoice", [Cl.uint(1)], client).result).toBeOk(
    Cl.bool(true)
  );
}

function fundEscrowAndLp() {
  expect(mintSbtc(100, client).result).toBeOk(Cl.bool(true));
  expect(mintSbtc(90, lp).result).toBeOk(Cl.bool(true));
  expect(simnet.callPublicFn("invoicebtc", "fund-escrow", [Cl.uint(1), Cl.uint(100)], client).result).toBeOk(
    Cl.bool(true)
  );
  expect(simnet.callPublicFn("invoicebtc", "fund-invoice", [Cl.uint(1), Cl.uint(90)], lp).result).toBeOk(
    Cl.bool(true)
  );
}

function getBalance(owner: string) {
  return simnet.callReadOnlyFn("mock-sbtc", "get-balance", [Cl.principal(owner)], owner).result;
}

describe("InvoiceBTC lifecycle", () => {
  it("creates a valid invoice with milestone storage", () => {
    const create = createInvoice();
    expect(create.receipt.result).toBeOk(Cl.uint(1));

    const summary = simnet.callReadOnlyFn("invoicebtc", "get-invoice-summary", [Cl.uint(1)], merchant);
    expect(summary.result).toBeSome(
      Cl.tuple({
        "invoice-id": Cl.uint(1),
        status: Cl.uint(0),
        merchant: Cl.principal(merchant),
        client: Cl.principal(client),
        lp: Cl.none(),
        "face-value": Cl.uint(100),
        "total-lp-funding": Cl.uint(90),
        "total-escrowed": Cl.uint(0),
        "total-settled": Cl.uint(0),
        "total-refunded": Cl.uint(0),
        "milestone-count": Cl.uint(2),
      })
    );

    const milestone = simnet.callReadOnlyFn("invoicebtc", "get-milestone", [Cl.uint(1), Cl.uint(1)], merchant);
    expect(milestone.result).toBeSome(
      Cl.tuple({
        "face-value": Cl.uint(60),
        "merchant-payout-amount": Cl.uint(55),
        "lp-repayment-amount": Cl.uint(60),
        "due-block-height": Cl.uint(create.due1),
        "proof-hash": Cl.none(),
        state: Cl.uint(0),
      })
    );
  });

  it("rejects invalid milestone totals", () => {
    const create = createInvoice({ faceValues: [60, 30] });
    expect(create.receipt.result).toBeErr(ERR_INVALID_TOTAL);
  });

  it("records the merchant signature", () => {
    expect(createInvoice().receipt.result).toBeOk(Cl.uint(1));
    expect(simnet.callPublicFn("invoicebtc", "merchant-sign-invoice", [Cl.uint(1)], merchant).result).toBeOk(
      Cl.bool(true)
    );

    const summary = simnet.callReadOnlyFn("invoicebtc", "get-invoice-summary", [Cl.uint(1)], merchant);
    expect(summary.result).toBeSome(
      Cl.tuple({
        "invoice-id": Cl.uint(1),
        status: Cl.uint(1),
        merchant: Cl.principal(merchant),
        client: Cl.principal(client),
        lp: Cl.none(),
        "face-value": Cl.uint(100),
        "total-lp-funding": Cl.uint(90),
        "total-escrowed": Cl.uint(0),
        "total-settled": Cl.uint(0),
        "total-refunded": Cl.uint(0),
        "milestone-count": Cl.uint(2),
      })
    );
  });

  it("records the client signature", () => {
    expect(createInvoice().receipt.result).toBeOk(Cl.uint(1));
    expect(simnet.callPublicFn("invoicebtc", "merchant-sign-invoice", [Cl.uint(1)], merchant).result).toBeOk(
      Cl.bool(true)
    );
    expect(simnet.callPublicFn("invoicebtc", "client-sign-invoice", [Cl.uint(1)], client).result).toBeOk(
      Cl.bool(true)
    );

    const summary = simnet.callReadOnlyFn("invoicebtc", "get-invoice-summary", [Cl.uint(1)], client);
    expect(summary.result).toBeSome(
      Cl.tuple({
        "invoice-id": Cl.uint(1),
        status: Cl.uint(2),
        merchant: Cl.principal(merchant),
        client: Cl.principal(client),
        lp: Cl.none(),
        "face-value": Cl.uint(100),
        "total-lp-funding": Cl.uint(90),
        "total-escrowed": Cl.uint(0),
        "total-settled": Cl.uint(0),
        "total-refunded": Cl.uint(0),
        "milestone-count": Cl.uint(2),
      })
    );
  });

  it("blocks escrow funding before both signatures", () => {
    expect(createInvoice().receipt.result).toBeOk(Cl.uint(1));
    expect(mintSbtc(100, client).result).toBeOk(Cl.bool(true));
    expect(simnet.callPublicFn("invoicebtc", "merchant-sign-invoice", [Cl.uint(1)], merchant).result).toBeOk(
      Cl.bool(true)
    );

    const fundEscrow = simnet.callPublicFn("invoicebtc", "fund-escrow", [Cl.uint(1), Cl.uint(100)], client);
    expect(fundEscrow.result).toBeErr(ERR_INVALID_STATE);
  });

  it("requires escrow to equal the full face value", () => {
    expect(createInvoice().receipt.result).toBeOk(Cl.uint(1));
    signInvoice();
    expect(mintSbtc(100, client).result).toBeOk(Cl.bool(true));

    const fundEscrow = simnet.callPublicFn("invoicebtc", "fund-escrow", [Cl.uint(1), Cl.uint(99)], client);
    expect(fundEscrow.result).toBeErr(ERR_INVALID_FUNDING);
  });

  it("allows LP funding only once", () => {
    expect(createInvoice().receipt.result).toBeOk(Cl.uint(1));
    signInvoice();
    fundEscrowAndLp();
    expect(mintSbtc(90, otherLp).result).toBeOk(Cl.bool(true));

    const secondFunding = simnet.callPublicFn("invoicebtc", "fund-invoice", [Cl.uint(1), Cl.uint(90)], otherLp);
    expect(secondFunding.result).toBeErr(ERR_INVALID_STATE);
  });

  it("blocks milestone settlement before approval", () => {
    expect(createInvoice().receipt.result).toBeOk(Cl.uint(1));
    signInvoice();
    fundEscrowAndLp();
    expect(
      simnet.callPublicFn(
        "invoicebtc",
        "submit-milestone",
        [Cl.uint(1), Cl.uint(1), Cl.bufferFromAscii("proof-1")],
        merchant
      ).result
    ).toBeOk(Cl.bool(true));

    const settle = simnet.callPublicFn("invoicebtc", "settle-milestone", [Cl.uint(1), Cl.uint(1)], merchant);
    expect(settle.result).toBeErr(ERR_INVALID_MILESTONE_STATE);
  });

  it("repays the LP from escrow after approval", () => {
    expect(createInvoice().receipt.result).toBeOk(Cl.uint(1));
    signInvoice();
    fundEscrowAndLp();
    expect(
      simnet.callPublicFn(
        "invoicebtc",
        "submit-milestone",
        [Cl.uint(1), Cl.uint(1), Cl.bufferFromAscii("proof-1")],
        merchant
      ).result
    ).toBeOk(Cl.bool(true));
    expect(simnet.callPublicFn("invoicebtc", "approve-milestone", [Cl.uint(1), Cl.uint(1)], client).result).toBeOk(
      Cl.bool(true)
    );

    const settle = simnet.callPublicFn("invoicebtc", "settle-milestone", [Cl.uint(1), Cl.uint(1)], merchant);
    expect(settle.result).toBeOk(Cl.uint(60));
    expect(getBalance(lp)).toBeOk(Cl.uint(60));
    expect(getBalance(merchant)).toBeOk(Cl.uint(90));
    expect(getBalance(client)).toBeOk(Cl.uint(0));

    const summary = simnet.callReadOnlyFn("invoicebtc", "get-invoice-summary", [Cl.uint(1)], merchant);
    expect(summary.result).toBeSome(
      Cl.tuple({
        "invoice-id": Cl.uint(1),
        status: Cl.uint(5),
        merchant: Cl.principal(merchant),
        client: Cl.principal(client),
        lp: Cl.some(Cl.principal(lp)),
        "face-value": Cl.uint(100),
        "total-lp-funding": Cl.uint(90),
        "total-escrowed": Cl.uint(100),
        "total-settled": Cl.uint(60),
        "total-refunded": Cl.uint(0),
        "milestone-count": Cl.uint(2),
      })
    );
  });

  it("opens a dispute when a milestone passes due uncompleted", () => {
    expect(createInvoice({ due1: simnet.blockHeight + 2, due2: simnet.blockHeight + 20 }).receipt.result).toBeOk(Cl.uint(1));
    signInvoice();
    fundEscrowAndLp();

    const dispute = simnet.callPublicFn("invoicebtc", "open-dispute", [Cl.uint(1), Cl.uint(1)], client);
    expect(dispute.result).toBeOk(Cl.bool(true));

    const summary = simnet.callReadOnlyFn("invoicebtc", "get-invoice-summary", [Cl.uint(1)], client);
    expect(summary.result).toBeSome(
      Cl.tuple({
        "invoice-id": Cl.uint(1),
        status: Cl.uint(6),
        merchant: Cl.principal(merchant),
        client: Cl.principal(client),
        lp: Cl.some(Cl.principal(lp)),
        "face-value": Cl.uint(100),
        "total-lp-funding": Cl.uint(90),
        "total-escrowed": Cl.uint(100),
        "total-settled": Cl.uint(0),
        "total-refunded": Cl.uint(0),
        "milestone-count": Cl.uint(2),
      })
    );
  });

  it("refunds leftover escrow after cancellation", () => {
    expect(createInvoice().receipt.result).toBeOk(Cl.uint(1));
    signInvoice();
    fundEscrowAndLp();
    expect(
      simnet.callPublicFn(
        "invoicebtc",
        "submit-milestone",
        [Cl.uint(1), Cl.uint(1), Cl.bufferFromAscii("proof-1")],
        merchant
      ).result
    ).toBeOk(Cl.bool(true));
    expect(simnet.callPublicFn("invoicebtc", "approve-milestone", [Cl.uint(1), Cl.uint(1)], client).result).toBeOk(
      Cl.bool(true)
    );
    expect(simnet.callPublicFn("invoicebtc", "settle-milestone", [Cl.uint(1), Cl.uint(1)], merchant).result).toBeOk(
      Cl.uint(60)
    );
    expect(simnet.callPublicFn("invoicebtc", "cancel-invoice", [Cl.uint(1)], client).result).toBeOk(Cl.bool(true));
    expect(simnet.callPublicFn("invoicebtc", "close-invoice", [Cl.uint(1)], client).result).toBeOk(Cl.bool(true));

    const refund = simnet.callPublicFn("invoicebtc", "refund-leftover", [Cl.uint(1)], client);
    expect(refund.result).toBeOk(Cl.uint(40));
    expect(getBalance(client)).toBeOk(Cl.uint(40));
  });

  it("allows closing only when all milestones are resolved", () => {
    expect(createInvoice().receipt.result).toBeOk(Cl.uint(1));
    signInvoice();
    fundEscrowAndLp();
    expect(
      simnet.callPublicFn(
        "invoicebtc",
        "submit-milestone",
        [Cl.uint(1), Cl.uint(1), Cl.bufferFromAscii("proof-1")],
        merchant
      ).result
    ).toBeOk(Cl.bool(true));
    expect(simnet.callPublicFn("invoicebtc", "approve-milestone", [Cl.uint(1), Cl.uint(1)], client).result).toBeOk(
      Cl.bool(true)
    );
    expect(simnet.callPublicFn("invoicebtc", "settle-milestone", [Cl.uint(1), Cl.uint(1)], merchant).result).toBeOk(
      Cl.uint(60)
    );

    const blockedClose = simnet.callPublicFn("invoicebtc", "close-invoice", [Cl.uint(1)], client);
    expect(blockedClose.result).toBeErr(ERR_CLOSE_BLOCKED);

    expect(simnet.callPublicFn("invoicebtc", "cancel-invoice", [Cl.uint(1)], client).result).toBeOk(Cl.bool(true));
    expect(simnet.callPublicFn("invoicebtc", "close-invoice", [Cl.uint(1)], client).result).toBeOk(Cl.bool(true));
  });

  it("does not allow disputes before a milestone is overdue", () => {
    expect(createInvoice().receipt.result).toBeOk(Cl.uint(1));
    signInvoice();
    fundEscrowAndLp();

    const dispute = simnet.callPublicFn("invoicebtc", "open-dispute", [Cl.uint(1), Cl.uint(1)], client);
    expect(dispute.result).toBeErr(ERR_TOO_EARLY);
  });
});

# InvoiceBTC

InvoiceBTC is an sBTC-native invoice factoring protocol built on Stacks that helps freelancers, exporters, and merchants unlock immediate liquidity from signed unpaid invoices. Instead of waiting 30-90 days for payment, a merchant can create a milestone-based invoice, have it signed on-chain by both the merchant and client, and secure the full invoice value in escrow using sBTC. A liquidity provider can then fund that specific invoice at a discount, giving the merchant upfront working capital while earning yield from escrow-backed future repayment.

The protocol is designed to keep the full lifecycle Bitcoin-native end to end. Invoice creation, approval, escrow funding, LP funding, milestone settlement, repayment, dispute handling, and leftover fund routing all happen around sBTC on Stacks. This creates a new Bitcoin DeFi use case focused on real commercial activity rather than simple transfers or speculative trading.

For the MVP, InvoiceBTC implements a single-invoice direct-funding model: one merchant, one client, one invoice, and one liquidity provider. Each invoice is broken into milestones with pre-defined payout and repayment logic, allowing capital to flow in a structured and transparent way while reducing default risk through upfront client escrow.

## Why this matters

Millions of freelancers, exporters, and small merchants face cash-flow problems because invoices are paid late. InvoiceBTC turns those locked future payments into usable working capital today, while also creating a secured yield opportunity for liquidity providers. On Stacks, this shows how sBTC can power practical Bitcoin-native financial infrastructure for real-world commerce.

## Core MVP flow

1. Merchant creates a milestone-based invoice in sBTC.
2. Merchant signs the invoice on-chain.
3. Client signs the invoice on-chain.
4. Client locks the full invoice face value in escrow.
5. A liquidity provider funds that specific invoice at a discount.
6. As milestones are completed, repayment flows from client escrow to the LP.
7. Leftover or cancelled amounts are returned according to protocol rules.
8. If a milestone is incomplete at due time, the invoice enters dispute state.

## MVP contract layout

- `contracts/invoicebtc.clar`: invoice lifecycle, milestone workflow, escrow accounting, LP funding, settlement, disputes, cancellation, refunds, and closeout
- `contracts/mock-sbtc.clar`: minimal SIP-010-style token used for local testing
- `contracts/sip-010-trait.clar`: minimal token trait interface

## Invoice lifecycle

Invoice state machine:
- `draft`: invoice has been created
- `merchant-signed`: merchant has signed
- `client-signed`: client has signed or both parties are now ready for escrow
- `escrow-funded`: client has escrowed the full face value
- `funded-by-lp`: one LP has funded the merchant at the agreed discount
- `active`: milestone completion and settlement are in progress
- `dispute`: an overdue unresolved milestone has been disputed
- `completed`: all milestones were resolved and the full face value was settled to the LP
- `cancelled`: the invoice was cancelled or closed with unresolved value returned to the client

Milestone state machine:
- `pending`: waiting for merchant completion
- `merchant-requested`: merchant submitted proof for review
- `approved`: client approved the milestone
- `repaid-to-lp`: escrow released the milestone repayment amount to the LP
- `disputed`: the milestone missed its deadline and was disputed
- `cancelled`: the milestone was cancelled during invoice cancellation or closeout

## Escrow flow

1. The merchant creates the invoice and milestone schedule.
2. Merchant and client sign with separate on-chain calls.
3. The client escrows the full invoice face value into the contract.
4. One LP funds the merchant with the precomputed discounted amount.
5. The contract keeps explicit accounting for total escrowed, settled, and refunded balances.

## Milestone settlement

1. The merchant submits milestone proof.
2. The client approves the milestone.
3. Anyone can settle an approved milestone.
4. Settlement transfers the milestone repayment amount from contract escrow to the LP.
5. Cancelled or unresolved value remains in escrow until `refund-leftover` returns it to the client after closeout.

## Current status

InvoiceBTC is currently being developed as an MVP focused on:
- on-chain invoice approval
- escrow-backed repayment
- milestone-based settlement
- single-invoice direct funding
- sBTC-native working capital flows on Stacks

## Test coverage

The Clarinet test suite covers:
- valid invoice creation
- invalid milestone totals
- merchant and client signing
- escrow gating and full-face-value enforcement
- one-time LP funding
- milestone approval before settlement
- LP repayment from escrow
- overdue milestone disputes
- leftover refunds after cancellation
- close restrictions until all milestones are resolved

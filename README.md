# InvoiceBTC 

InvoiceBTC is an sBTC-native invoice factoring protocol built on Stacks that helps freelancers, exporters, and merchants unlock immediate liquidity from signed unpaid invoices. Instead of waiting 30–90 days for payment, a merchant can create a milestone-based invoice, have it signed on-chain by both the merchant and client, and secure the full invoice value in escrow using sBTC. A liquidity provider can then fund that specific invoice at a discount, giving the merchant upfront working capital while earning yield from escrow-backed future repayment.

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

## Current status

InvoiceBTC is currently being developed as an MVP focused on:
- on-chain invoice approval
- escrow-backed repayment
- milestone-based settlement
- single-invoice direct funding
- sBTC-native working capital flows on Stacks

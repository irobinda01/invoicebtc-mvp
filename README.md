# InvoiceBTC MVP

Escrow-backed, milestone-based invoice factoring on Stacks public testnet using the standard public testnet sBTC token only.

## Current MVP Scope

This repo currently implements:

- on-chain invoice creation with milestone allocations
- merchant/client on-chain signing
- full client escrow deposit before any LP funding
- milestone-by-milestone LP funding
- merchant milestone completion submission with proof hash
- client milestone confirmation on-chain
- maturity-time LP repayment from escrow for approved milestones only
- dispute transition for unresolved milestones
- close and leftover refund flows
- a public-testnet frontend wired to real contract calls and read-only calls

This repo does not currently implement:

- pooled liquidity
- multiple LPs per invoice
- arbitration beyond a blocking dispute state
- automatic invoice editing after creation
- a bundled public-testnet sBTC token contract in this repo
- a bundled local contract test harness

## Contracts In This Repo

- `contracts/invoicebtc.clar`
  Main invoice factoring contract.
- `contracts/sip-010-trait.clar`
  Trait interface aligned with the standard testnet sBTC SIP-010 transfer call used by `invoicebtc`.

## Architecture Summary

- `contracts/invoicebtc.clar` stores invoice roles, milestones, escrow accounting, LP funding progress, settlement totals, and refund totals.
- `frontend/` is a Next.js app that connects testnet wallets, reads invoice data from the Stacks API, derives real permissions from connected wallet addresses, and submits contract calls with post conditions on token-moving transactions.
- the repo is configured for public testnet deployment and runtime, not for local simnet/devnet testing

## Contract Storage Design

`invoices` map stores:

- `merchant`
- `client`
- `lp`
- `face-value`
- `total-lp-funding`
- `status`
- `created-at`
- `funding-deadline`
- `maturity-height`
- `metadata-hash`
- `merchant-signed`
- `client-signed`
- `milestone-count`
- `total-lp-advanced`
- `total-escrowed`
- `total-settled`
- `total-refunded`

`milestones` map stores:

- `face-value`
- `merchant-payout-amount`
- `lp-repayment-amount`
- `due-block-height`
- `proof-hash`
- `state`

## Contract Functions

Public functions:

- `create-invoice`
  Creates the invoice and milestone records. Milestone face values and LP repayment totals must match the invoice face value.
- `merchant-sign-invoice`
  Merchant signs on-chain.
- `client-sign-invoice`
  Client signs on-chain.
- `fund-escrow`
  Client deposits the full invoice face value into contract escrow.
- `fund-milestone`
  LP funds exactly one milestone's discounted advance amount to the merchant.
- `submit-milestone`
  Merchant submits completion proof for a funded milestone.
- `approve-milestone`
  Client confirms a submitted milestone and unlocks the next milestone.
- `settle-milestone`
  At invoice maturity, the funded LP claims repayment from escrow for all approved and unsettled milestones. Unresolved milestones are pushed into dispute.
- `open-dispute`
  Merchant or client can open dispute on an overdue funded/submitted milestone.
- `cancel-invoice`
  Marks unresolved milestones cancelled and moves invoice to cancelled.
- `close-invoice`
  Closes only after all milestones are resolved. The invoice becomes `completed` only if the full face value was settled, otherwise `cancelled`.
- `refund-leftover`
  After close, the client can recover leftover escrow not already settled or refunded.

Read-only functions:

- `get-invoice`
- `get-milestone`
- `get-invoice-summary`
- `get-last-invoice-id`
- `can-fund`
- `can-settle`

## Actual State Model

Invoice statuses defined in the contract:

- `draft`
- `merchant-signed`
- `client-signed`
- `escrow-funded`
- `active`
- `matured`
- `dispute`
- `completed`
- `cancelled`

Current note on `matured`:

- `matured` is defined in the contract and frontend types, but the current contract logic does not actively transition invoices into `matured`.
- In the current MVP, an invoice typically moves from `escrow-funded` to `active`, then later to `dispute`, `completed`, or `cancelled`.

Milestone statuses used by the contract:

- `pending`
- `funded`
- `completion-submitted`
- `approved`
- `disputed`
- `settled`
- `cancelled`

## Actual Funding And Settlement Flow

1. Merchant creates an invoice with:
   - client address
   - invoice face value
   - funding deadline
   - maturity height
   - milestone face values
   - milestone discounted LP advance amounts
   - milestone due heights
2. Client signs on-chain.
3. Merchant signs on-chain.
4. Client deposits the full invoice face value into escrow with `fund-escrow`.
5. LP funds milestone 1 only with `fund-milestone`.
6. Merchant submits milestone 1 completion proof with `submit-milestone`.
7. Client confirms milestone 1 with `approve-milestone`.
8. Milestone 2 becomes eligible for LP funding.
9. The same pattern repeats milestone by milestone.
10. At invoice maturity, the funded LP calls `settle-milestone`.
11. The contract repays the LP from escrow only for milestones that are approved and not yet settled.
12. Any unresolved milestones are moved into dispute during settlement.
13. After all milestones are resolved, merchant or client can close the invoice.
14. After close, the client can withdraw leftover escrow with `refund-leftover`.

## Validation And Enforcement In The Current Contract

- only the merchant can sign as merchant or submit milestone completion
- only the client can sign as client, deposit escrow, approve milestones, or refund leftover escrow
- only the funded LP can settle
- before the first milestone is funded, any non-party wallet can become the LP by funding it
- full escrow must be deposited before any milestone funding starts
- milestone funding is sequential
- a later milestone cannot be funded until the previous milestone is approved or settled
- merchant cannot submit completion for an unfunded milestone
- client cannot confirm before merchant submission
- duplicate funding, duplicate submission, and duplicate confirmation are blocked
- proof hash is stored on-chain in the milestone record

## Frontend Structure

- `frontend/src/app/page.tsx`
  Wallet connect, demo role switcher, invoice lookup, and high-level demo flow.
- `frontend/src/app/invoices/new/page.tsx`
  Merchant invoice creation screen.
- `frontend/src/app/invoices/[id]/page.tsx`
  Invoice detail view with role-aware milestone actions.
- `frontend/src/lib/useWallet.ts`
  Wallet session and demo role preference.
- `frontend/src/lib/contract.ts`
  Read-only Stacks API helpers and result parsing.
- `frontend/src/lib/types.ts`
  Frontend types and status-code mappings.
- `frontend/src/components/StatusBadge.tsx`
  Invoice and milestone badges.
- `frontend/src/components/TxResult.tsx`
  Transaction result and explorer link component.

## Wallet And Role Logic

- The role switcher is for demo organization only.
- Real authority comes from the connected wallet address.
- The frontend compares the connected wallet against the invoice `merchant`, `client`, and `lp` principals read from chain.
- The UI only enables valid actions for that connected wallet.
- Before an LP is assigned, a non-party wallet can fund the first milestone and become the LP for the invoice.

## Public Testnet Runtime Configuration

The frontend runtime is public-testnet only.

Set these values in `frontend/.env.local`:

```bash
NEXT_PUBLIC_STACKS_API_BASE=https://api.testnet.hiro.so
NEXT_PUBLIC_CONTRACT_ADDRESS=ST1YBHMDH6ESJ1DBY8MK72XER9BG9646QMCS610PE
NEXT_PUBLIC_CONTRACT_NAME=invoicebtc-v4
NEXT_PUBLIC_EXPLORER_BASE=https://explorer.hiro.so/txid
NEXT_PUBLIC_EXPLORER_ADDRESS_BASE=https://explorer.hiro.so/address
```

Current deployed public testnet contract:

- `ST1YBHMDH6ESJ1DBY8MK72XER9BG9646QMCS610PE.invoicebtc-v4`

This repo is hardwired to the standard public testnet sBTC token principal:

- `ST1F7QA2MDF17S807EPA36TSS8AMEFY4KA9TVGWXT.sbtc-token`

Use `settings/Testnet.toml` and `DEPLOYMENT_CHECKLIST.md` for public testnet deployment and demo prep.

## Local Tooling

- Node.js `22.14.0` is pinned in `.nvmrc`.
- Clarinet `3.x` is required for the official sBTC requirement flow used by this repo.
- The contract source references Clarinet's canonical `SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token` requirement, and the generated testnet deployment plan remaps it to `ST1F7QA2MDF17S807EPA36TSS8AMEFY4KA9TVGWXT.sbtc-token`.

## How To Run

Frontend:

```bash
cd frontend
npm install
cp .env.local.example .env.local
npm run dev
```

Production build:

```bash
cd frontend
npm run build
```

## 3 Browser Profile Demo

- Profile 1: Merchant wallet
- Profile 2: Client wallet
- Profile 3: LP wallet

Demo sequence:

1. Merchant creates an invoice with milestones.
2. Client signs.
3. Merchant signs.
4. Client deposits full escrow.
5. LP funds milestone 1.
6. Merchant submits proof for milestone 1.
7. Client confirms milestone 1.
8. LP funds the next unlocked milestone.
9. Repeat until maturity.
10. LP settles approved milestones from escrow.
11. If any milestones remain unresolved at settlement, the invoice moves into dispute for those unresolved portions.

## Public-Testnet-Only Note

- the app is configured only for Stacks public testnet runtime
- the repo no longer includes local simnet/devnet contract test artifacts
- the frontend and contract are fixed to the standard public testnet sBTC contract principal `ST1F7QA2MDF17S807EPA36TSS8AMEFY4KA9TVGWXT.sbtc-token`

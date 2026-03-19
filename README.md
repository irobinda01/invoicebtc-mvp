# InvoiceBTC MVP

Escrow-backed, milestone-based invoice factoring on Stacks public testnet using a SIP-010 sBTC integration path.

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
- a local Clarinet/Vitest contract test harness

This repo does not currently implement:

- pooled liquidity
- multiple LPs per invoice
- arbitration beyond a blocking dispute state
- automatic invoice editing after creation
- a live public-testnet sBTC token contract in this repo

## Contracts In This Repo

- `contracts/invoicebtc.clar`
  Main invoice factoring contract.
- `contracts/sip-010-trait.clar`
  Trait interface used by `invoicebtc` for SIP-010 token interaction.
- `contracts/mock-sbtc.clar`
  Local test-only SIP-010 token used by the contract test suite. It is not part of the public testnet runtime flow.

## Architecture Summary

- `contracts/invoicebtc.clar` stores invoice roles, milestones, escrow accounting, LP funding progress, settlement totals, and refund totals.
- `frontend/` is a Next.js app that connects testnet wallets, reads invoice data from the Stacks API, derives real permissions from connected wallet addresses, and submits contract calls with post conditions on token-moving transactions.
- `tests/invoicebtc.test.js` verifies the staged milestone funding sequence in Clarinet simnet.

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
  Creates the invoice and all milestone records. The milestone face values must sum to the invoice face value, and milestone LP repayments must also sum to the invoice face value.
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
  At invoice maturity, the funded LP claims repayment from escrow for all currently approved and unsettled milestones. Any unresolved milestones are pushed into dispute.
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
  Returns whether the invoice is in a fundable state and still within the funding deadline. It does not validate a specific milestone.
- `can-settle`
  Returns whether settlement is generally allowed for the invoice and milestone combination at the current block height.

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
NEXT_PUBLIC_CONTRACT_ADDRESS=ST1YOURTESTNETADDRESS
NEXT_PUBLIC_CONTRACT_NAME=invoicebtc
NEXT_PUBLIC_SBTC_CONTRACT_ADDRESS=ST1YOURTESTNETTOKENADDRESS
NEXT_PUBLIC_SBTC_CONTRACT_NAME=sbtc-token
NEXT_PUBLIC_SBTC_TOKEN_NAME=sbtc
NEXT_PUBLIC_EXPLORER_BASE=https://explorer.hiro.so/txid
```

Use `settings/Testnet.toml` and `DEPLOYMENT_CHECKLIST.md` for public testnet deployment and demo prep.

## Local Test Harness

Even though the app runtime is public-testnet only, the repo now includes local contract test artifacts again:

- `contracts/mock-sbtc.clar`
- `settings/Devnet.toml`
- `deployments/default.simnet-plan.yaml`
- `vitest.config.js`
- `tests/invoicebtc.test.js`

These exist only to support local contract verification. They are not used by the public testnet frontend runtime.

## How To Run

Frontend:

```bash
cd frontend
npm install
cp .env.local.example .env.local
npm run dev
```

Contract tests:

```bash
npm install
npm test
```

## Current Test Coverage

`tests/invoicebtc.test.js` currently covers:

1. cannot fund any milestone before both signatures
2. cannot fund any milestone before client escrow deposit
3. can fund first milestone after signatures and escrow
4. cannot fund second milestone before first milestone completion submission
5. cannot fund second milestone before first milestone client confirmation
6. merchant cannot submit completion for unfunded milestone
7. client cannot confirm before merchant completion submission
8. proof hash is stored correctly
9. full staged sequence works across multiple milestones
10. duplicate funding, submission, and confirmation are blocked

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

## Migration Notes

- LP funding is now milestone-by-milestone instead of one upfront discounted invoice funding call.
- Invoice storage now tracks `total-lp-advanced`.
- The invoice detail UI now renders milestone-stage LP funding, merchant submission, and client confirmation actions.
- The repo includes local-only Clarinet test support again, while the frontend runtime remains public-testnet only.

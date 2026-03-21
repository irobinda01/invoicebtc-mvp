# Public Testnet Deployment Checklist

Use this checklist before demo day or before sharing the repo with someone who will deploy it.

## 1. Wallet and Funding

- Use a dedicated Stacks public testnet deployer wallet.
- Confirm the deployer wallet has enough testnet STX for contract deployment fees.
- Confirm you also have three separate public testnet wallets ready for Merchant, Client, and LP demo profiles.

## 2. Contract Review

- Verify [`contracts/invoicebtc.clar`](/c:/Users/HP/Desktop/invoicebtc-mvp/contracts/invoicebtc.clar) is the contract you intend to deploy.
- Verify [`contracts/sip-010-trait.clar`](/c:/Users/HP/Desktop/invoicebtc-mvp/contracts/sip-010-trait.clar) matches the standard testnet sBTC transfer call used by the contract.
- Confirm the fixed sBTC token principal is `ST1F7QA2MDF17S807EPA36TSS8AMEFY4KA9TVGWXT.sbtc-token`.

## 3. Clarinet Testnet Config

- Review [`Clarinet.toml`](/c:/Users/HP/Desktop/invoicebtc-mvp/Clarinet.toml).
- Review [`settings/Testnet.toml`](/c:/Users/HP/Desktop/invoicebtc-mvp/settings/Testnet.toml).
- Use Clarinet `3.x`.
- Confirm the generated deployment plan remaps the canonical `SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token` requirement to `ST1F7QA2MDF17S807EPA36TSS8AMEFY4KA9TVGWXT.sbtc-token` for testnet.
- Confirm the testnet RPC endpoint is reachable.

## 4. Deploy Contracts

From the repo root:

```bash
clarinet check
clarinet deployments generate --testnet --manual-cost
clarinet deployments apply --testnet
```

After deployment:

- Record the deployed contract address.
- Confirm the deployed contract name is `invoicebtc`.
- Verify the contract appears on the Stacks testnet explorer.

## 5. Frontend Environment

Create `frontend/.env.local` from [`frontend/.env.local.example`](/c:/Users/HP/Desktop/invoicebtc-mvp/frontend/.env.local.example) and set:

```bash
NEXT_PUBLIC_STACKS_API_BASE=https://api.testnet.hiro.so
NEXT_PUBLIC_CONTRACT_ADDRESS=ST1YBHMDH6ESJ1DBY8MK72XER9BG9646QMCS610PE
NEXT_PUBLIC_CONTRACT_NAME=invoicebtc
NEXT_PUBLIC_EXPLORER_BASE=https://explorer.hiro.so/txid
```

## 6. Frontend Verification

From `frontend/`:

```bash
npm install
npm run build
npm run dev
```

Then verify:

- The app shows `Stacks Public Testnet`.
- Wallet connect resolves to a testnet address.
- Invoice detail pages display connected wallet, selected role, detected role, invoice status, and available actions.
- Token-moving actions show transaction feedback and explorer links.

## 7. Demo Dry Run

Use three browser profiles:

- Profile 1: Merchant
- Profile 2: Client
- Profile 3: LP

Dry-run the happy path:

1. Merchant creates invoice.
2. Client signs.
3. Merchant signs.
4. Client deposits escrow.
5. LP funds invoice.
6. Merchant submits milestone.
7. Client approves milestone.
8. LP settles milestone.
9. Client closes invoice and refunds leftover if applicable.

## 8. Final Pre-Demo Check

- Clear stale browser sessions if wallet identities look wrong.
- Confirm `.env.local` points to testnet, not placeholder values.
- Confirm the app and contract are both targeting `ST1F7QA2MDF17S807EPA36TSS8AMEFY4KA9TVGWXT.sbtc-token`.
- Confirm the explorer links open the testnet explorer.
- Confirm the three wallet profiles each have the balances needed for the demo.

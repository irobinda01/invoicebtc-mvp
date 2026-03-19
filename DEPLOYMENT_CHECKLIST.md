# Public Testnet Deployment Checklist

Use this checklist before demo day or before sharing the repo with someone who will deploy it.

## 1. Wallet and Funding

- Use a dedicated Stacks public testnet deployer wallet.
- Confirm the deployer wallet has enough testnet STX for contract deployment fees.
- Confirm you also have three separate public testnet wallets ready for Merchant, Client, and LP demo profiles.

## 2. Contract Review

- Verify [`contracts/invoicebtc.clar`](/c:/Users/HP/Desktop/invoicebtc-mvp/contracts/invoicebtc.clar) is the contract you intend to deploy.
- Verify [`contracts/sip-010-trait.clar`](/c:/Users/HP/Desktop/invoicebtc-mvp/contracts/sip-010-trait.clar) matches the SIP-010 transfer and balance calls your token integration expects.
- Confirm the token contract you will use on testnet is SIP-010 compatible and available at the address you plan to configure in the frontend.

## 3. Clarinet Testnet Config

- Review [`Clarinet.toml`](/c:/Users/HP/Desktop/invoicebtc-mvp/Clarinet.toml).
- Review [`settings/Testnet.toml`](/c:/Users/HP/Desktop/invoicebtc-mvp/settings/Testnet.toml).
- Confirm the testnet RPC endpoint is reachable.

## 4. Deploy Contracts

From the repo root:

```bash
clarinet check
clarinet deployments generate --testnet
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
NEXT_PUBLIC_CONTRACT_ADDRESS=ST1YOURDEPLOYERADDRESS
NEXT_PUBLIC_CONTRACT_NAME=invoicebtc
NEXT_PUBLIC_SBTC_CONTRACT_ADDRESS=ST1YOURTOKENADDRESS
NEXT_PUBLIC_SBTC_CONTRACT_NAME=YOUR_SBTC_TOKEN_CONTRACT
NEXT_PUBLIC_SBTC_TOKEN_NAME=sbtc
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
- Confirm the token contract address is correct.
- Confirm the explorer links open the testnet explorer.
- Confirm the three wallet profiles each have the balances needed for the demo.

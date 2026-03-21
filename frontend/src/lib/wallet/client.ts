'use client'

import {
  connect,
  disconnect,
  getLocalStorage,
  isConnected,
  isStacksWalletInstalled,
  request,
} from '@stacks/connect'
import { serializeCV, serializePostCondition } from '@stacks/transactions'
import type { ClarityValue, PostCondition } from '@stacks/transactions'
import { TESTNET_NETWORK } from './constants'
import { getConnectOptions, getStoredTestnetAddress, pickTestnetAddress } from './utils'
import type { WalletAddressEntry } from './types'

// ─── Wallet snapshot (from @stacks/connect localStorage) ─────────────────────

export interface WalletSnapshot {
  address: string | null
  addresses: WalletAddressEntry[]
  isConnected: boolean
}

// ─── Contract call parameters ─────────────────────────────────────────────────

export interface ContractCallRequest {
  contractAddress: string
  contractName: string
  functionName: string
  functionArgs?: ClarityValue[]
  postConditions?: PostCondition[]
  postConditionMode?: 'allow' | 'deny'
  fee?: number | bigint | string
  nonce?: number | bigint | string
}

// ─── Message signing result ───────────────────────────────────────────────────

export interface SignMessageResult {
  signature: string
  publicKey: string
}

// ─── Availability & session ───────────────────────────────────────────────────

export function getWalletAvailability(): boolean {
  return isStacksWalletInstalled()
}

export function getStoredWalletSnapshot(): WalletSnapshot {
  const storage = getLocalStorage()
  return {
    address: getStoredTestnetAddress(),
    addresses: (storage?.addresses.stx ?? []) as WalletAddressEntry[],
    isConnected: isConnected(),
  }
}

// ─── Connect / disconnect ─────────────────────────────────────────────────────

export async function connectLeatherTestnet() {
  const response = await connect({
    ...getConnectOptions(),
    forceWalletSelect: true,
    network: TESTNET_NETWORK,
  })

  const entry = pickTestnetAddress(response.addresses)
  return {
    address: entry?.address ?? null,
    addresses: response.addresses,
  }
}

/** Explicit refresh — calls the wallet API to get the latest addresses. */
export async function refreshLeatherTestnetSession() {
  const response = await request(getConnectOptions(), 'stx_getAddresses', {
    network: TESTNET_NETWORK,
  })

  const entry = pickTestnetAddress(response.addresses)
  return {
    address: entry?.address ?? null,
    addresses: response.addresses,
  }
}

export function disconnectWallet() {
  disconnect()
}

// ─── Contract calls ───────────────────────────────────────────────────────────

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

function cvToHex(cv: ClarityValue): string {
  return toHex(serializeCV(cv))
}

function pcToHex(pc: PostCondition): string {
  return toHex(serializePostCondition(pc))
}

export async function requestContractCall(params: ContractCallRequest) {
  return request(getConnectOptions(), 'stx_callContract', {
    contract: `${params.contractAddress}.${params.contractName}`,
    functionName: params.functionName,
    functionArgs: params.functionArgs?.map(cvToHex) ?? [],
    network: TESTNET_NETWORK,
    postConditions: params.postConditions?.map(pcToHex) ?? [],
    postConditionMode: params.postConditionMode,
    fee: params.fee,
    nonce: params.nonce,
  })
}

// ─── Message signing ──────────────────────────────────────────────────────────

/**
 * Asks the connected Leather wallet to sign an arbitrary UTF-8 message
 * using the Stacks testnet account. Returns the hex signature and the
 * signer's public key for off-chain or on-chain verification.
 */
export async function signStacksMessage(message: string): Promise<SignMessageResult> {
  const response = await request(getConnectOptions(), 'stx_signMessage', {
    message,
  })
  return {
    // @stacks/connect types the response shape — cast for safety
    signature: (response as unknown as SignMessageResult).signature,
    publicKey: (response as unknown as SignMessageResult).publicKey,
  }
}

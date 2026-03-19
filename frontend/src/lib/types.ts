// TypeScript types mirroring the on-chain Clarity data structures.

export type InvoiceStatus =
  | 'draft'              // 0
  | 'merchant-signed'    // 1
  | 'client-signed'      // 2
  | 'escrow-funded'      // 3
  | 'active'             // 4
  | 'matured'            // 5
  | 'dispute'            // 6
  | 'completed'          // 7
  | 'cancelled'          // 8

export const STATUS_CODES: Record<number, InvoiceStatus> = {
  0: 'draft',
  1: 'merchant-signed',
  2: 'client-signed',
  3: 'escrow-funded',
  4: 'active',
  5: 'matured',
  6: 'dispute',
  7: 'completed',
  8: 'cancelled',
}

export type MilestoneStatus =
  | 'pending'             // 0
  | 'funded'              // 1
  | 'submitted'           // 2
  | 'approved'            // 3
  | 'disputed'            // 4
  | 'settled'             // 5
  | 'cancelled'           // 6

export const MILESTONE_STATUS_CODES: Record<number, MilestoneStatus> = {
  0: 'pending',
  1: 'funded',
  2: 'submitted',
  3: 'approved',
  4: 'disputed',
  5: 'settled',
  6: 'cancelled',
}

export type Role = 'merchant' | 'client' | 'lp' | 'observer'

export interface Invoice {
  id: number
  merchant: string
  client: string
  lp: string | null
  faceValue: bigint
  totalLpFunding: bigint
  totalLpAdvanced: bigint
  status: InvoiceStatus
  statusCode: number
  createdAt: number
  fundingDeadline: number
  maturityHeight: number
  metadataHash: string
  merchantSigned: boolean
  clientSigned: boolean
  milestoneCount: number
  totalEscrowed: bigint
  totalSettled: bigint
  totalRefunded: bigint
}

export interface Milestone {
  id: number
  invoiceId: number
  faceValue: bigint
  merchantPayoutAmount: bigint
  lpRepaymentAmount: bigint
  dueBlockHeight: number
  proofHash: string | null
  status: MilestoneStatus
  statusCode: number
}

export interface TxResult {
  txId: string
  success: boolean
  error?: string
}

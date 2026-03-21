import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { WalletProvider, useWalletContext } from '@/context/WalletProvider'

const mockClient = vi.hoisted(() => ({
  disconnectWallet: vi.fn(),
  getStoredWalletSnapshot: vi.fn(),
  getWalletAvailability: vi.fn(),
  refreshLeatherTestnetSession: vi.fn(),
  requestContractCall: vi.fn(),
  connectLeatherTestnet: vi.fn(),
  signStacksMessage: vi.fn(),
}))

vi.mock('@/lib/wallet/client', () => mockClient)

function WalletHarness() {
  const wallet = useWalletContext()

  return (
    <div>
      <span data-testid="address">{wallet.address ?? 'none'}</span>
      <button
        type="button"
        onClick={() =>
          void wallet.requestContractCall({
            contractAddress: 'ST1TEST',
            contractName: 'invoicebtc-v4',
            functionName: 'fund-milestone',
            functionArgs: [],
          })
        }
      >
        Call contract
      </button>
    </div>
  )
}

describe('WalletProvider', () => {
  beforeEach(() => {
    mockClient.getWalletAvailability.mockReturnValue(true)
    mockClient.getStoredWalletSnapshot.mockReturnValue({
      address: 'ST1YBHMDH6ESJ1DBY8MK72XER9BG9646QMCS610PE',
      addresses: [{ address: 'ST1YBHMDH6ESJ1DBY8MK72XER9BG9646QMCS610PE' }],
      isConnected: true,
    })
    mockClient.requestContractCall.mockResolvedValue({ txid: '0xabc123' })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('exposes the connected address to the app and forwards it into contract calls', async () => {
    render(
      <WalletProvider>
        <WalletHarness />
      </WalletProvider>,
    )

    // Bootstrap is deferred by requestAnimationFrame — wait for the address to appear.
    await waitFor(() =>
      expect(screen.getByTestId('address')).toHaveTextContent('ST1YBHMDH6ESJ1DBY8MK72XER9BG9646QMCS610PE'),
    )
    expect(mockClient.connectLeatherTestnet).not.toHaveBeenCalled()
    expect(mockClient.refreshLeatherTestnetSession).not.toHaveBeenCalled()

    screen.getByRole('button', { name: 'Call contract' }).click()

    await waitFor(() => {
      expect(mockClient.requestContractCall).toHaveBeenCalledWith({
        contractAddress: 'ST1TEST',
        contractName: 'invoicebtc-v4',
        functionName: 'fund-milestone',
        functionArgs: [],
        address: 'ST1YBHMDH6ESJ1DBY8MK72XER9BG9646QMCS610PE',
      })
    })
  })
})

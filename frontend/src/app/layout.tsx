import type { Metadata } from 'next'
import './globals.css'
import { Header } from '@/components/Header'
import { AppShell, PageContainer } from '@/components/ui'
import { WalletProvider } from '@/lib/useWallet'

export const metadata: Metadata = {
  title: 'InvoiceBTC - Milestone-Based sBTC Invoice Liquidity',
  description:
    'Escrow-backed invoice factoring on Stacks with staged milestone funding, client approval, and LP settlement.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){var MM_ID='chrome-extension://nkbihfbeogaeaoehlefnkodbefgpgknn/';function isMetaMaskNoise(value){try{var text=String(value&&value.message||value||'');var stack=String(value&&value.stack||'');return text.indexOf('Failed to connect to MetaMask')>-1||text.indexOf('MetaMask extension not found')>-1||stack.indexOf(MM_ID)>-1;}catch(_){return false;}}window.addEventListener('error',function(e){if(isMetaMaskNoise(e.error)||isMetaMaskNoise(e.message)||String(e.filename||'').indexOf(MM_ID)>-1){e.preventDefault();e.stopImmediatePropagation();}},true);window.addEventListener('unhandledrejection',function(e){if(isMetaMaskNoise(e.reason)){e.preventDefault();e.stopImmediatePropagation();}},true);})();`,
          }}
        />
      </head>
      <body suppressHydrationWarning>
        <WalletProvider>
          <AppShell>
            <Header />
            <main className="pb-20 pt-8 sm:pt-10">{children}</main>
            <footer className="border-t border-white/6 py-10">
              <PageContainer className="flex flex-col gap-4 text-sm text-[var(--text-muted)] sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-semibold text-[var(--text-secondary)]">InvoiceBTC</p>
                  <p className="mt-1 max-w-xl">
                    Milestone-based invoice factoring with escrow-backed settlement, cleaner wallet UX,
                    and clearer decision states for merchants, clients, and Liquidity Providers.
                  </p>
                </div>
                <div className="text-sm sm:text-right">
                  <p>Stacks Public Testnet</p>
                  <p className="mt-1">Built for premium fintech-grade Web3 demos and real operator workflows.</p>
                </div>
              </PageContainer>
            </footer>
          </AppShell>
        </WalletProvider>
      </body>
    </html>
  )
}

import type { Metadata } from 'next'
import './globals.css'
import { Header } from '@/components/Header'

export const metadata: Metadata = {
  title: 'InvoiceBTC — sBTC Invoice Factoring',
  description: 'Escrow-backed milestone invoices with instant sBTC liquidity on Stacks',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-gray-950 text-gray-100">
        <Header />
        <main className="max-w-5xl mx-auto px-4 py-8">{children}</main>
        <footer className="max-w-5xl mx-auto px-4 py-6 mt-8 border-t border-gray-800 text-xs text-gray-600 text-center">
          InvoiceBTC MVP — Stacks Hackathon 2025 — Powered by sBTC
        </footer>
      </body>
    </html>
  )
}

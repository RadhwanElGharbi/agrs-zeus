import type { Metadata } from 'next'
import { Inter, Cinzel } from 'next/font/google'
import './globals.css'
import { ProjectProvider } from '@/lib/context/ProjectContext'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' })
const cinzel = Cinzel({ subsets: ['latin'], variable: '--font-cinzel' })

export const metadata: Metadata = {
  title: 'Artemis Global Research Solutions',
  description: 'AI-powered Oil & Gas optimization',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className="dark" style={{ height: '100%' }}>
      <body className={`${inter.variable} ${cinzel.variable} font-sans`} style={{ height: '100%', margin: 0, padding: 0 }}>
        <ProjectProvider>
          {children}
        </ProjectProvider>
      </body>
    </html>
  )
}

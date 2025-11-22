import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { ProjectProvider } from '@/lib/context/ProjectContext'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'AGRS ZEUS - Enterprise Geospatial Platform',
  description: 'AI-powered pipeline routing and geospatial analysis',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className="dark" style={{ height: '100%' }}>
      <body className={inter.className} style={{ height: '100%', margin: 0, padding: 0 }}>
        <ProjectProvider>
          {children}
        </ProjectProvider>
      </body>
    </html>
  )
}

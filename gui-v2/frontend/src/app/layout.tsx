import type { Metadata } from 'next'
import { Inter, Cinzel } from 'next/font/google'
import './globals.css'
import { ProjectProvider } from '@/lib/context/ProjectContext'
import { AuthProvider } from '@/lib/context/AuthContext'
import { OnboardingProvider } from '@/lib/context/OnboardingContext'
import { MapViewProvider } from '@/lib/context/MapViewContext'
import { AuthGuard } from '@/components/auth/AuthGuard'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' })
const cinzel = Cinzel({ subsets: ['latin'], variable: '--font-cinzel' })

export const metadata: Metadata = {
  title: 'AGRS ZEUS - AI Infrastructure Intelligence',
  description: 'AI-powered Oil & Gas infrastructure optimization platform',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className="dark" style={{ height: '100%' }}>
      <body className={`${inter.variable} ${cinzel.variable} font-sans`} style={{ height: '100%', margin: 0, padding: 0 }}>
        <AuthProvider>
          <AuthGuard>
            <ProjectProvider>
              <OnboardingProvider>
                <MapViewProvider>{children}</MapViewProvider>
              </OnboardingProvider>
            </ProjectProvider>
          </AuthGuard>
        </AuthProvider>
      </body>
    </html>
  )
}

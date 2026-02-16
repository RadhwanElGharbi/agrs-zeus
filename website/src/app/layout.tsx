import type { Metadata } from 'next'
import { Inter, JetBrains_Mono, Space_Grotesk } from 'next/font/google'
import './globals.css'

// Typography system:
// - Body/UI: Inter (clean, modern, highly legible)
// - Headings/Display: Space Grotesk (technical, precise)
// - Accents/Telemetry: JetBrains Mono (engineering/terminal vibe)
const inter = Inter({ subsets: ['latin'], variable: '--font-sans' })
const spaceGrotesk = Space_Grotesk({ subsets: ['latin'], variable: '--font-display' })
const jetbrainsMono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono' })

export const metadata: Metadata = {
  title: 'AGRS - AI Infrastructure Intelligence',
  description: 'ZEUS by AGRS. AI route optimization for pipeline and network infrastructure.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className="dark" style={{ height: '100%' }}>
      <body
        className={`${inter.variable} ${spaceGrotesk.variable} ${jetbrainsMono.variable} font-sans antialiased`}
        style={{ height: '100%', margin: 0, padding: 0 }}
      >
        {children}
      </body>
    </html>
  )
}

'use client'

import { useEffect, useRef } from 'react'
import Link from 'next/link'

export default function PrivacyPolicyPage() {
  const glowRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = glowRef.current
    if (!el) return
    let lastClientX = window.innerWidth / 2, lastClientY = window.innerHeight / 2, raf = 0
    const clamp01 = (v: number) => Math.min(1, Math.max(0, v))
    const update = () => { raf = 0; const doc = document.documentElement, pageHeight = Math.max(1, doc.scrollHeight), pageY = window.scrollY + lastClientY, t = clamp01(pageY / pageHeight), hue = 10 + t * 200; el.style.setProperty('--glow-x', `${lastClientX}px`); el.style.setProperty('--glow-y', `${pageY}px`); el.style.setProperty('--glow-h', `${hue}`) }
    const schedule = () => { if (raf) return; raf = window.requestAnimationFrame(update) }
    const onMove = (e: PointerEvent) => { lastClientX = e.clientX; lastClientY = e.clientY; schedule() }
    window.addEventListener('pointermove', onMove, { passive: true })
    window.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', schedule, { passive: true })
    update()
    return () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('scroll', schedule); window.removeEventListener('resize', schedule); if (raf) window.cancelAnimationFrame(raf) }
  }, [])

  return (
    <main className="relative min-h-screen bg-black text-white selection:bg-primary/30 overflow-hidden">
      <div className="absolute inset-0 pointer-events-none bg-[linear-gradient(to_right,rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.035)_1px,transparent_1px)] bg-[size:48px_48px] opacity-40" />
      <div ref={glowRef} className="absolute inset-0 pointer-events-none" style={{ '--glow-x': '50vw', '--glow-y': '50vh', '--glow-h': '20', background: 'radial-gradient(circle 820px at var(--glow-x) var(--glow-y), hsl(var(--glow-h) 90% 60% / 0.18) 0%, hsl(calc(var(--glow-h) + 28) 90% 60% / 0.14) 22%, hsl(calc(var(--glow-h) + 120) 90% 60% / 0.12) 44%, transparent 72%)' } as any} />
      <div className="relative container mx-auto px-4 py-16 max-w-4xl">
        <div className="mb-10"><Link href="/" className="text-gray-400 hover:text-white transition-colors text-sm">← Back to Home</Link></div>
        <article className="prose prose-invert prose-zinc max-w-none">
          <h1>Privacy Policy</h1>
          <p><strong>Artemis Global Research Solutions Inc.</strong> ("AGRS", "we", "us", "our") respects your privacy. This Privacy Policy explains how we collect, use, and protect information when you visit <strong>agrsglobal.com</strong> (the "Website").</p>
          <p><strong>Last updated:</strong> 2026-01-06</p>
          <h2>Information We Collect</h2>
          <h3>Information you provide</h3>
          <p>If you contact us, you may provide information such as your email address and any details you include in your message.</p>
          <h3>Information collected automatically</h3>
          <p>When you use the Website, we may automatically collect limited technical information such as your IP address, device and browser type, pages visited, referring/exit pages, and approximate location derived from IP.</p>
          <h3>Cookies and similar technologies</h3>
          <p>The Website may use cookies or similar technologies for essential functionality and to understand Website performance.</p>
          <h2>How We Use Information</h2>
          <ul><li>To operate, maintain, and secure the Website.</li><li>To respond to inquiries and communicate with you.</li><li>To monitor performance and improve user experience.</li><li>To comply with legal obligations.</li></ul>
          <h2>How We Share Information</h2>
          <p>We do not sell your personal information. We may share information with service providers, for legal/safety requirements, or in business transfers.</p>
          <h2>Data Retention</h2>
          <p>We retain information only for as long as necessary to fulfill the purposes described in this Policy.</p>
          <h2>Security</h2>
          <p>We use reasonable administrative, technical, and organizational safeguards designed to protect information.</p>
          <h2>International Visitors</h2>
          <p>AGRS is based in Canada. If you access the Website from outside Canada, your information may be processed in Canada or other jurisdictions.</p>
          <h2>Your Choices</h2>
          <ul><li>You can disable cookies in your browser settings.</li><li>You can contact us to request access, correction, or deletion of information where applicable.</li></ul>
          <h2>Children's Privacy</h2>
          <p>The Website is not intended for children under 13.</p>
          <h2>Changes to This Policy</h2>
          <p>We may update this Privacy Policy from time to time.</p>
          <h2>Contact Us</h2>
          <p>If you have questions about this Privacy Policy, contact us at <a href="mailto:radwan@agrsglobal.com">radwan@agrsglobal.com</a>.</p>
        </article>
      </div>
    </main>
  )
}

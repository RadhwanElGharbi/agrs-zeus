import { TopNav } from '@/components/landing/TopNav'
import { Hero } from '@/components/landing/Hero'
import { Vision } from '@/components/landing/Vision'
import { Engineering } from '@/components/landing/Engineering'
import { Capabilities } from '@/components/landing/Capabilities'
import { About } from '@/components/landing/About'
import { Footer } from '@/components/landing/Footer'
import { WireframeBackground } from '@/components/landing/WireframeBackground'

export default function LandingPage() {
  return (
    <main className="bg-black min-h-screen text-white selection:bg-primary/30 relative">
      <div className="fixed inset-0 z-0 pointer-events-none">
        <WireframeBackground />
      </div>
      <div className="relative z-10">
        <TopNav />
        <Hero />
        <Vision />
        <Engineering />
        <Capabilities />
        <About />
        <Footer />
      </div>
    </main>
  )
}














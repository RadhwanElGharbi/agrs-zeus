import Link from 'next/link'

export const TopNav = () => {
  return (
    <header className="fixed top-0 left-0 right-0 z-30 border-b border-white/10 bg-black/40 backdrop-blur-md">
      <div className="container mx-auto px-4 h-14 flex items-center justify-between gap-4">
        {/* Simplified Logo - Icon only for clean enterprise look */}
        <Link href="/" className="flex items-center gap-2 group hover:opacity-80 transition-opacity">
          <img src="/agrs-logo.svg" alt="AGRS" className="h-6 w-auto object-contain invert brightness-0 filter" style={{ filter: 'brightness(0) invert(1)' }} />
        </Link>

        <nav className="hidden md:flex items-center gap-8 text-xs font-mono uppercase tracking-widest text-white/70">
          <a href="#zeus" className="hover:text-white transition-colors">
            ZEUS
          </a>
          <a href="#about" className="hover:text-white transition-colors">
            Mission
          </a>
          <Link href="/careers" className="hover:text-white transition-colors">
            Careers
          </Link>
        </nav>

        <div className="flex items-center gap-3">
          <Link
            href="/contact"
            className="inline-flex items-center justify-center h-8 px-5 border border-white/20 bg-white/5 hover:bg-white text-white hover:text-black transition-all text-[10px] font-mono uppercase tracking-widest"
          >
            Contact Sales
          </Link>
        </div>
      </div>
    </header>
  )
}



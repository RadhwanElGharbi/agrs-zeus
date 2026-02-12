'use client'

import Link from 'next/link'

export const Footer = () => {
  return (
    <footer className="bg-black border-t border-white/10 py-12">
      <div className="container mx-auto px-4 flex flex-col md:flex-row justify-between items-center gap-6">
        <div className="text-gray-500 text-sm">
          &copy; {new Date().getFullYear()} Artemis Global Research Solutions Inc. All rights reserved.
        </div>
        
        <div className="flex gap-8">
          <Link href="/contact" className="text-gray-500 hover:text-white transition-colors text-sm">
            Contact
          </Link>
          <Link href="/privacy-policy" className="text-gray-500 hover:text-white transition-colors text-sm">
            Privacy Policy
          </Link>
        </div>
      </div>
    </footer>
  )
}


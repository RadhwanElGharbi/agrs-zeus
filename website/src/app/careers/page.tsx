'use client'

import { useEffect, useState, useRef } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

type Step = 'email' | 'welcome' | 'name' | 'department' | 'github' | 'linkedin' | 'why_intro' | 'why' | 'special_intro' | 'special' | 'submit' | 'goodbye'

const WATERLOO_DOMAIN = '@uwaterloo.ca'

export default function CareersPage() {
  const router = useRouter()
  const [step, setStep] = useState<Step>('email')
  const [email, setEmail] = useState('')
  const [fullName, setFullName] = useState('')
  const [department, setDepartment] = useState('')
  const [github, setGithub] = useState('')
  const [linkedin, setLinkedin] = useState('')
  const [whyArtemis, setWhyArtemis] = useState('')
  const [whatMakesSpecial, setWhatMakesSpecial] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  const emailRef = useRef<HTMLInputElement>(null)
  const nameRef = useRef<HTMLInputElement>(null)
  const githubRef = useRef<HTMLInputElement>(null)
  const linkedinRef = useRef<HTMLInputElement>(null)
  const whyRef = useRef<HTMLTextAreaElement>(null)
  const specialRef = useRef<HTMLTextAreaElement>(null)

  // Use a map to store preloaded audio instances
  const audioRefs = useRef<Record<string, HTMLAudioElement>>({})

  useEffect(() => {
    // Preload sounds on mount
    const sounds = ['approved', 'notaccessible', 'back', 'next']
    sounds.forEach(sound => {
      const audio = new Audio(`/sounds/${sound.toUpperCase()}.wav`)
      audio.volume = 0.5
      audio.preload = 'auto'
      audio.load()
      audioRefs.current[sound] = audio
    })
  }, [])

  const playSound = (sound: 'approved' | 'notaccessible' | 'back' | 'next') => {
    const audio = audioRefs.current[sound]
    if (audio) {
      audio.currentTime = 0
      audio.play().catch(e => console.error('Audio play error:', e))
    } else {
      // Fallback
      const audio = new Audio(`/sounds/${sound.toUpperCase()}.wav`)
      audio.volume = 0.5
      audio.play().catch(e => console.error('Audio play error:', e))
    }
  }

  useEffect(() => {
    const focusMap: Partial<Record<Step, React.RefObject<HTMLElement>>> = { email: emailRef, name: nameRef, github: githubRef, linkedin: linkedinRef, why: whyRef, special: specialRef }
    if (step === 'why_intro') { setTimeout(() => setStep('why'), 3000); return }
    if (step === 'special_intro') { setTimeout(() => setStep('special'), 3141); return }
    const timer = setTimeout(() => { focusMap[step]?.current?.focus() }, 100)
    return () => clearTimeout(timer)
  }, [step])

  const goBack = () => {
    playSound('back')
    const backMap: Partial<Record<Step, Step>> = { name: 'email', department: 'name', github: 'department', linkedin: 'github', why: 'linkedin', special: 'why', submit: 'special' }
    if (backMap[step]) setStep(backMap[step]!)
  }

  const handleEmailSubmit = () => {
    if (!email.trim().endsWith(WATERLOO_DOMAIN)) {
      playSound('notaccessible')
      setErrorMsg('You do not meet the minimum requirements to apply')
      return
    }
    playSound('approved')
    setErrorMsg('')
    setStep('welcome')
    setTimeout(() => setStep('name'), 4000)
  }

  const handleNameSubmit = () => {
    if (fullName.trim().length >= 2) {
      playSound('next')
      setStep('department')
    }
  }

  const handleDepartmentSelect = (dept: string) => {
    playSound('next')
    setDepartment(dept)
    setStep('github')
  }

  const handleGithubSubmit = () => {
    if (github.trim().toLowerCase().includes('github.com') && github.trim().length > 10) {
      playSound('next')
      setStep('linkedin')
    }
  }

  const handleLinkedinSubmit = () => {
    if (linkedin.trim().toLowerCase().includes('linkedin.com') && linkedin.trim().length > 12) {
      playSound('next')
      setStep('why_intro')
    }
  }

  const handleWhySubmit = () => {
    if (whyArtemis.trim().length > 10) {
      playSound('next')
      setStep('special_intro')
    }
  }

  const handleSpecialSubmit = () => {
    if (whatMakesSpecial.trim().length > 10) {
      playSound('next')
      setStep('submit')
    }
  }

  const handleFinalSubmit = async () => {
    playSound('approved')
    if (isSubmitting) return
    setIsSubmitting(true); setErrorMsg('')
    try {
      const res = await fetch('/api/careers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, fullName, department, github, linkedin, whyArtemis, whatMakesSpecial }) })
      if (!res.ok) throw new Error('Failed')
      setStep('goodbye'); setTimeout(() => router.push('/'), 5000)
    } catch { setIsSubmitting(false); setErrorMsg('Failed to submit application. Please try again.') }
  }

  const getBackgroundColor = () => step === 'email' ? 'rgba(220,38,38,0.14)' : step === 'goodbye' ? 'rgba(34,197,94,0.14)' : 'rgba(234, 179, 8, 0.14)'
  const transitionConfig = { duration: 0.8, ease: 'easeOut' }

  return (
    <main className="relative min-h-screen bg-black text-white selection:bg-primary/30 overflow-hidden flex items-center justify-center px-4">
      <div className="absolute inset-0 pointer-events-none bg-[linear-gradient(to_right,rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.035)_1px,transparent_1px)] bg-[size:48px_48px] opacity-40" />
      <motion.div className="absolute inset-0 pointer-events-none" animate={{ background: `radial-gradient(circle at center, ${getBackgroundColor()} 0%, transparent 80%)` }} transition={{ duration: 2.0, ease: 'easeInOut' }} />
      <Link href="/" className="absolute top-8 left-6 text-gray-400 hover:text-white transition-colors text-sm">← Back</Link>
      <div className="relative z-10 w-full max-w-md">
        <AnimatePresence mode="wait">
          {step === 'email' && (<motion.div key="email" initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -15 }} transition={transitionConfig} className="space-y-4"><input ref={emailRef} value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleEmailSubmit()} placeholder="Enter Email" className="w-full bg-transparent text-white text-xl border-b border-white/20 focus:border-red-500 py-3 outline-none transition-colors" />{errorMsg && <p className="text-red-500 text-sm font-mono mt-2">{errorMsg}</p>}<div className="flex justify-end"><button onClick={handleEmailSubmit} className="text-sm font-mono uppercase tracking-widest text-white/60 hover:text-white transition-colors">Next →</button></div></motion.div>)}
          {step === 'welcome' && (<motion.div key="welcome" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.8 }} className="text-center"><h2 className="text-3xl md:text-4xl font-serif text-white">Welcome.</h2></motion.div>)}
          {step === 'name' && (<motion.div key="name" initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -15 }} transition={transitionConfig} className="space-y-4"><label className="text-xs font-mono uppercase text-yellow-500 tracking-widest">Full Name</label><input ref={nameRef} value={fullName} onChange={(e) => setFullName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleNameSubmit()} className="w-full bg-transparent text-white text-xl border-b border-white/20 focus:border-yellow-500 py-3 outline-none transition-colors" /><div className="flex justify-between items-center"><button onClick={goBack} className="text-sm font-mono uppercase tracking-widest text-white/40 hover:text-white transition-colors">← Back</button><button onClick={handleNameSubmit} disabled={fullName.trim().length < 2} className={`text-sm font-mono uppercase tracking-widest transition-colors ${fullName.trim().length >= 2 ? 'text-white/60 hover:text-white' : 'text-white/20 cursor-not-allowed'}`}>Next →</button></div></motion.div>)}
          {step === 'department' && (<motion.div key="dept" initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -15 }} transition={transitionConfig} className="space-y-6"><label className="text-xs font-mono uppercase text-yellow-500 tracking-widest">Desired Department</label><div className="space-y-3">{['Software', 'Robotics', 'Research'].map((dept) => (<button key={dept} onClick={() => handleDepartmentSelect(dept)} className="w-full text-left px-4 py-3 border border-white/10 hover:border-yellow-500/50 hover:bg-white/5 transition-all text-white font-mono text-sm">{dept}</button>))}</div><div className="flex justify-start"><button onClick={goBack} className="text-sm font-mono uppercase tracking-widest text-white/40 hover:text-white transition-colors">← Back</button></div></motion.div>)}
          {step === 'github' && (<motion.div key="github" initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -15 }} transition={transitionConfig} className="space-y-4"><label className="text-xs font-mono uppercase text-yellow-500 tracking-widest">GitHub Profile</label><input ref={githubRef} value={github} onChange={(e) => setGithub(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleGithubSubmit()} placeholder="Enter Github Profile" className="w-full bg-transparent text-white text-xl border-b border-white/20 focus:border-yellow-500 py-3 outline-none transition-colors" /><div className="flex justify-between items-center"><button onClick={goBack} className="text-sm font-mono uppercase tracking-widest text-white/40 hover:text-white transition-colors">← Back</button><button onClick={handleGithubSubmit} disabled={!github.trim().toLowerCase().includes('github.com')} className={`text-sm font-mono uppercase tracking-widest transition-colors ${github.trim().toLowerCase().includes('github.com') ? 'text-white/60 hover:text-white' : 'text-white/20 cursor-not-allowed'}`}>Next →</button></div></motion.div>)}
          {step === 'linkedin' && (<motion.div key="linkedin" initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -15 }} transition={transitionConfig} className="space-y-4"><label className="text-xs font-mono uppercase text-yellow-500 tracking-widest">LinkedIn Profile</label><input ref={linkedinRef} value={linkedin} onChange={(e) => setLinkedin(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleLinkedinSubmit()} placeholder="Enter Linkedin Profile" className="w-full bg-transparent text-white text-xl border-b border-white/20 focus:border-yellow-500 py-3 outline-none transition-colors" /><div className="flex justify-between items-center"><button onClick={goBack} className="text-sm font-mono uppercase tracking-widest text-white/40 hover:text-white transition-colors">← Back</button><button onClick={handleLinkedinSubmit} disabled={!linkedin.trim().toLowerCase().includes('linkedin.com')} className={`text-sm font-mono uppercase tracking-widest transition-colors ${linkedin.trim().toLowerCase().includes('linkedin.com') ? 'text-white/60 hover:text-white' : 'text-white/20 cursor-not-allowed'}`}>Next →</button></div></motion.div>)}
          {step === 'why_intro' && (<motion.div key="why_intro" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.8 }} className="text-center"><h2 className="text-3xl md:text-4xl font-serif text-white">Why Artemis?</h2></motion.div>)}
          {step === 'why' && (<motion.div key="why" initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -15 }} transition={transitionConfig} className="space-y-4"><label className="text-xs font-mono uppercase text-yellow-500 tracking-widest">Why Artemis?</label><textarea ref={whyRef} value={whyArtemis} onChange={(e) => setWhyArtemis(e.target.value)} rows={4} className="w-full bg-transparent text-white text-lg border-b border-white/20 focus:border-yellow-500 py-3 outline-none resize-none transition-colors" /><div className="flex justify-between items-center"><button onClick={goBack} className="text-sm font-mono uppercase tracking-widest text-white/40 hover:text-white transition-colors">← Back</button><button onClick={handleWhySubmit} disabled={whyArtemis.trim().length <= 10} className={`text-sm font-mono uppercase tracking-widest transition-colors ${whyArtemis.trim().length > 10 ? 'text-white/60 hover:text-white' : 'text-white/20 cursor-not-allowed'}`}>Next →</button></div></motion.div>)}
          {step === 'special_intro' && (<motion.div key="special_intro" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.8 }} className="text-center"><h2 className="text-3xl md:text-4xl font-serif text-white">What makes you special?</h2></motion.div>)}
          {step === 'special' && (<motion.div key="special" initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -15 }} transition={transitionConfig} className="space-y-4"><label className="text-xs font-mono uppercase text-yellow-500 tracking-widest">What makes you special?</label><textarea ref={specialRef} value={whatMakesSpecial} onChange={(e) => setWhatMakesSpecial(e.target.value)} rows={4} className="w-full bg-transparent text-white text-lg border-b border-white/20 focus:border-yellow-500 py-3 outline-none resize-none transition-colors" /><div className="flex justify-between items-center"><button onClick={goBack} className="text-sm font-mono uppercase tracking-widest text-white/40 hover:text-white transition-colors">← Back</button><button onClick={handleSpecialSubmit} disabled={whatMakesSpecial.trim().length <= 10} className={`text-sm font-mono uppercase tracking-widest transition-colors ${whatMakesSpecial.trim().length > 10 ? 'text-white/60 hover:text-white' : 'text-white/20 cursor-not-allowed'}`}>Next →</button></div></motion.div>)}
          {step === 'submit' && (<motion.div key="submit" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 1.05 }} transition={transitionConfig} className="space-y-6"><div className="flex justify-center"><button onClick={handleFinalSubmit} disabled={isSubmitting} className="px-12 py-4 bg-white text-black font-bold font-mono text-sm uppercase tracking-widest hover:bg-white/90 transition-all">{isSubmitting ? 'Processing...' : 'Submit Application'}</button></div>{errorMsg && <p className="text-center text-red-500 text-sm font-mono">{errorMsg}</p>}<div className="flex justify-center"><button onClick={goBack} className="text-sm font-mono uppercase tracking-widest text-white/40 hover:text-white transition-colors">← Back to details</button></div></motion.div>)}
          {step === 'goodbye' && (<motion.div key="goodbye" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 1.5 }} className="text-center"><h2 className="text-4xl md:text-5xl font-serif text-white">Goodbye.</h2></motion.div>)}
        </AnimatePresence>
      </div>
    </main>
  )
}

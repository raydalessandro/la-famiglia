'use client'

import { useState, useEffect, useRef, KeyboardEvent } from 'react'
import { useRouter } from 'next/navigation'
import { MemberPublic } from '@/types/database'
// Members loaded via /api/auth/members (server-side, works from any device)
import { Avatar } from '@/components/ui/Avatar'

// SPEC_GAP: login needs a public member list but GET /api/members requires auth.
// We query Supabase directly for read-only public fields only.

export default function LoginPage() {
  const [members, setMembers] = useState<MemberPublic[]>([])
  const [selectedMember, setSelectedMember] = useState<MemberPublic | null>(null)
  const [pin, setPin] = useState<string[]>(['', '', '', ''])
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const router = useRouter()
  const pinRefs = [
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
  ]

  useEffect(() => {
    fetch('/api/setup')
      .then((r) => r.json())
      .then((result) => {
        if (!result.data?.setup_completed) {
          router.replace('/setup')
          return
        }
        // Fetch members via public API route (works from any device)
        fetch('/api/auth/members')
          .then((r) => r.json())
          .then((result) => {
            setMembers((result.data ?? []) as MemberPublic[])
            setIsLoading(false)
          })
      })
      .catch(() => setIsLoading(false))
  }, [router])

  // Focus first PIN box when member is selected
  useEffect(() => {
    if (selectedMember) {
      setTimeout(() => pinRefs[0].current?.focus(), 50)
    }
  }, [selectedMember]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleSelectMember = (member: MemberPublic) => {
    setSelectedMember(member)
    setPin(['', '', '', ''])
    setError('')
  }

  const handleBack = () => {
    setSelectedMember(null)
    setPin(['', '', '', ''])
    setError('')
  }

  const submitLogin = async (fullPin: string) => {
    if (!selectedMember) return
    setIsSubmitting(true)
    setError('')
    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ member_id: selectedMember.id, pin: fullPin }),
      })
      const result = await res.json()
      if (result.error) {
        setError(result.error)
        setPin(['', '', '', ''])
        setTimeout(() => pinRefs[0].current?.focus(), 50)
      } else {
        router.replace('/feed')
      }
    } catch {
      setError('Errore di rete. Riprova.')
      setPin(['', '', '', ''])
      setTimeout(() => pinRefs[0].current?.focus(), 50)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handlePinChange = (index: number, value: string) => {
    // Accept only single digit
    const digit = value.replace(/\D/g, '').slice(-1)
    const next = [...pin]
    next[index] = digit

    setPin(next)
    setError('')

    if (digit && index < 3) {
      pinRefs[index + 1].current?.focus()
    }

    if (digit && index === 3) {
      const fullPin = next.join('')
      if (fullPin.length === 4) {
        submitLogin(fullPin)
      }
    }
  }

  const handlePinKeyDown = (index: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      if (pin[index]) {
        const next = [...pin]
        next[index] = ''
        setPin(next)
      } else if (index > 0) {
        pinRefs[index - 1].current?.focus()
        const next = [...pin]
        next[index - 1] = ''
        setPin(next)
      }
    } else if (e.key === 'ArrowLeft' && index > 0) {
      pinRefs[index - 1].current?.focus()
    } else if (e.key === 'ArrowRight' && index < 3) {
      pinRefs[index + 1].current?.focus()
    } else if (e.key === 'Enter') {
      const fullPin = pin.join('')
      if (fullPin.length === 4) submitLogin(fullPin)
    }
  }

  // --- Loading state ---
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#1a1a2e]">
        <div className="animate-spin h-10 w-10 border-2 border-[#E8A838] border-t-transparent rounded-full" />
      </div>
    )
  }

  // --- PIN entry screen ---
  if (selectedMember) {
    const pinFilled = pin.filter(Boolean).length
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-[#1a1a2e] px-6">
        {/* Back button */}
        <button
          onClick={handleBack}
          className="absolute top-6 left-6 flex items-center gap-2 text-white/60 hover:text-white transition-colors text-sm"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 5l-7 7 7 7" />
          </svg>
          Indietro
        </button>

        {/* Member info */}
        <div className="flex flex-col items-center gap-3 mb-10">
          <Avatar
            emoji={selectedMember.avatar_emoji}
            url={selectedMember.avatar_url}
            name={selectedMember.name}
            size="lg"
            color={selectedMember.color}
          />
          <p className="text-xl font-semibold text-white">{selectedMember.name}</p>
          <p className="text-sm text-white/50">{selectedMember.family_role}</p>
        </div>

        {/* Instruction */}
        <p className="text-white/70 text-sm mb-6">Inserisci il tuo PIN</p>

        {/* PIN boxes */}
        <div className="flex gap-4 mb-6">
          {pin.map((digit, i) => (
            <input
              key={i}
              ref={pinRefs[i]}
              type="password"
              inputMode="numeric"
              maxLength={1}
              value={digit}
              onChange={(e) => handlePinChange(i, e.target.value)}
              onKeyDown={(e) => handlePinKeyDown(i, e)}
              disabled={isSubmitting}
              className={`
                h-14 w-14 text-center text-2xl font-bold rounded-xl border-2 bg-white/5 text-white
                outline-none transition-all
                ${digit ? 'border-[#E8A838]' : 'border-white/20'}
                focus:border-[#E8A838] focus:bg-white/10
                disabled:opacity-50
              `}
              aria-label={`Cifra PIN ${i + 1}`}
            />
          ))}
        </div>

        {/* Dots progress indicator */}
        <div className="flex gap-2 mb-8">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className={`h-2 w-2 rounded-full transition-all ${
                i < pinFilled ? 'bg-[#E8A838] scale-110' : 'bg-white/20'
              }`}
            />
          ))}
        </div>

        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 bg-red-500/15 border border-red-500/30 text-red-300 text-sm px-4 py-3 rounded-xl mb-4 max-w-xs text-center">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
              <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            {error}
          </div>
        )}

        {/* Submitting spinner */}
        {isSubmitting && (
          <div className="animate-spin h-6 w-6 border-2 border-[#E8A838] border-t-transparent rounded-full" />
        )}
      </div>
    )
  }

  // --- Member selection grid ---
  return (
    <div className="flex flex-col items-center min-h-screen bg-[#1a1a2e] px-6 py-12">
      {/* Header */}
      <div className="mb-10 text-center">
        <div className="text-5xl mb-4">🏠</div>
        <h1 className="text-3xl font-bold text-white tracking-tight">La Famiglia</h1>
        <p className="text-white/50 mt-2 text-sm">Chi sei?</p>
      </div>

      {members.length === 0 ? (
        <div className="text-white/40 text-sm mt-8">Nessun membro trovato.</div>
      ) : (
        <div className="grid grid-cols-2 gap-4 w-full max-w-sm">
          {members.map((member) => (
            <button
              key={member.id}
              onClick={() => handleSelectMember(member)}
              className="flex flex-col items-center gap-3 bg-white/5 hover:bg-white/10 active:scale-95 border border-white/10 hover:border-[#E8A838]/50 rounded-2xl px-4 py-6 transition-all duration-150"
            >
              <Avatar
                emoji={member.avatar_emoji}
                url={member.avatar_url}
                name={member.name}
                size="lg"
                color={member.color}
              />
              <div className="text-center">
                <p className="text-white font-semibold text-sm leading-tight">{member.name}</p>
                <p className="text-white/40 text-xs mt-0.5">{member.family_role}</p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

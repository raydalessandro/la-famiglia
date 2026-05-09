'use client'

import { useState, useEffect, useRef, KeyboardEvent } from 'react'
import { useRouter } from 'next/navigation'

const AVATAR_EMOJIS = [
  '👤', '👶', '🧒', '👦', '👧', '🧑', '👱', '👨', '🧔', '👩',
  '🧓', '👴', '👵', '🦸', '🦹', '🧙', '🧝', '🐶', '🐱', '🦁',
  '🐯', '🦊', '🐻', '🐼', '🐨', '🐸', '🦋', '🌟', '⭐', '🌈',
]

const FAMILY_ROLES = [
  'Papà', 'Mamma', 'Figlio', 'Figlia', 'Nonno', 'Nonna',
  'Zio', 'Zia', 'Cugino', 'Cugina', 'Membro',
]

const ACCENT = '#E8A838'

export default function SetupPage() {
  const [name, setName] = useState('')
  const [pin, setPin] = useState<string[]>(['', '', '', ''])
  const [emoji, setEmoji] = useState('👤')
  const [familyRole, setFamilyRole] = useState('')
  const [customRole, setCustomRole] = useState('')
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [step, setStep] = useState<1 | 2>(1)
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
        if (result.data?.setup_completed) {
          router.replace('/login')
        } else {
          setIsLoading(false)
        }
      })
      .catch(() => setIsLoading(false))
  }, [router])

  const handlePinChange = (index: number, value: string) => {
    const digit = value.replace(/\D/g, '').slice(-1)
    const next = [...pin]
    next[index] = digit
    setPin(next)
    setFieldErrors((prev) => ({ ...prev, pin: '' }))

    if (digit && index < 3) {
      pinRefs[index + 1].current?.focus()
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
    }
  }

  const validateStep1 = (): boolean => {
    const errors: Record<string, string> = {}
    if (!name.trim()) errors.name = 'Il nome è obbligatorio'
    const fullPin = pin.join('')
    if (fullPin.length !== 4) errors.pin = 'Il PIN deve essere di 4 cifre'
    setFieldErrors(errors)
    return Object.keys(errors).length === 0
  }

  const handleNextStep = () => {
    if (validateStep1()) setStep(2)
  }

  const handleSetup = async () => {
    setError('')
    const effectiveRole = familyRole === '__custom__' ? customRole.trim() : familyRole
    const fieldErrs: Record<string, string> = {}
    if (!effectiveRole) fieldErrs.role = 'Il ruolo è obbligatorio'
    if (Object.keys(fieldErrs).length > 0) {
      setFieldErrors(fieldErrs)
      return
    }

    const fullPin = pin.join('')
    setIsSubmitting(true)

    try {
      const res = await fetch('/api/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          pin: fullPin,
          avatar_emoji: emoji,
          family_role: effectiveRole || 'Membro',
        }),
      })
      const result = await res.json()
      if (result.error) {
        setError(result.error)
      } else {
        router.replace('/feed')
      }
    } catch {
      setError('Errore di rete. Riprova.')
    } finally {
      setIsSubmitting(false)
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

  return (
    <div className="min-h-screen bg-[#1a1a2e] flex flex-col items-center px-6 py-12">
      {/* Logo / title */}
      <div className="mb-8 text-center">
        <div className="text-5xl mb-3">🏠</div>
        <h1 className="text-3xl font-bold text-white tracking-tight">Benvenuto!</h1>
        <p className="text-white/50 mt-2 text-sm leading-relaxed max-w-xs mx-auto">
          Configura il tuo profilo per iniziare a usare La Famiglia.
        </p>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-2 mb-8">
        <div className={`h-2 w-8 rounded-full transition-all ${step === 1 ? 'bg-[#E8A838]' : 'bg-[#E8A838]/40'}`} />
        <div className={`h-2 w-8 rounded-full transition-all ${step === 2 ? 'bg-[#E8A838]' : 'bg-white/20'}`} />
      </div>

      {/* --- Step 1: Name + PIN --- */}
      {step === 1 && (
        <div className="w-full max-w-sm flex flex-col gap-6">
          {/* Emoji preview */}
          <div className="flex justify-center">
            <div
              className="h-20 w-20 rounded-full flex items-center justify-center text-4xl shadow-lg"
              style={{ backgroundColor: ACCENT }}
            >
              {emoji}
            </div>
          </div>

          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-white/70 mb-1.5">
              Il tuo nome <span className="text-[#E8A838]">*</span>
            </label>
            <input
              type="text"
              placeholder="Es. Marco"
              value={name}
              onChange={(e) => {
                setName(e.target.value)
                setFieldErrors((prev) => ({ ...prev, name: '' }))
              }}
              maxLength={40}
              className={`
                w-full bg-white/5 border rounded-xl px-4 py-3 text-white placeholder-white/30
                outline-none transition-all text-sm
                ${fieldErrors.name ? 'border-red-400 focus:border-red-400' : 'border-white/20 focus:border-[#E8A838]'}
              `}
            />
            {fieldErrors.name && (
              <p className="text-red-400 text-xs mt-1">{fieldErrors.name}</p>
            )}
          </div>

          {/* PIN */}
          <div>
            <label className="block text-sm font-medium text-white/70 mb-1.5">
              PIN a 4 cifre <span className="text-[#E8A838]">*</span>
            </label>
            <div className="flex gap-3">
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
                  className={`
                    h-12 w-12 text-center text-xl font-bold rounded-xl border-2 bg-white/5 text-white
                    outline-none transition-all
                    ${digit ? 'border-[#E8A838]' : fieldErrors.pin ? 'border-red-400' : 'border-white/20'}
                    focus:border-[#E8A838] focus:bg-white/10
                  `}
                  aria-label={`Cifra PIN ${i + 1}`}
                />
              ))}
            </div>
            {fieldErrors.pin && (
              <p className="text-red-400 text-xs mt-1">{fieldErrors.pin}</p>
            )}
            <p className="text-white/30 text-xs mt-1.5">
              Ricordalo bene — ti servirà per accedere.
            </p>
          </div>

          {/* Next button */}
          <button
            onClick={handleNextStep}
            className="w-full py-3.5 rounded-xl font-semibold text-[#1a1a2e] transition-all active:scale-95"
            style={{ backgroundColor: ACCENT }}
          >
            Avanti
          </button>
        </div>
      )}

      {/* --- Step 2: Emoji + Role --- */}
      {step === 2 && (
        <div className="w-full max-w-sm flex flex-col gap-6">
          {/* Back */}
          <button
            onClick={() => setStep(1)}
            className="flex items-center gap-1 text-white/50 hover:text-white text-sm self-start transition-colors"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5M12 5l-7 7 7 7" />
            </svg>
            Indietro
          </button>

          {/* Emoji picker */}
          <div>
            <label className="block text-sm font-medium text-white/70 mb-2">
              Avatar emoji
            </label>
            <div className="grid grid-cols-6 gap-2 bg-white/5 border border-white/10 rounded-2xl p-3">
              {AVATAR_EMOJIS.map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => setEmoji(e)}
                  className={`
                    h-11 w-11 flex items-center justify-center text-2xl rounded-xl transition-all
                    ${emoji === e
                      ? 'ring-2 ring-[#E8A838] bg-[#E8A838]/20 scale-110'
                      : 'hover:bg-white/10 active:scale-95'
                    }
                  `}
                  aria-label={e}
                  aria-pressed={emoji === e}
                >
                  {e}
                </button>
              ))}
            </div>
          </div>

          {/* Family role */}
          <div>
            <label className="block text-sm font-medium text-white/70 mb-2">
              Ruolo in famiglia <span className="text-[#E8A838]">*</span>
            </label>
            <div className="flex flex-wrap gap-2">
              {FAMILY_ROLES.map((role) => (
                <button
                  key={role}
                  type="button"
                  onClick={() => {
                    setFamilyRole(role)
                    setFieldErrors((prev) => ({ ...prev, role: '' }))
                  }}
                  className={`
                    px-4 py-2 rounded-full text-sm font-medium border transition-all
                    ${familyRole === role
                      ? 'border-[#E8A838] bg-[#E8A838]/20 text-[#E8A838]'
                      : 'border-white/20 text-white/70 hover:border-white/40 hover:text-white'
                    }
                  `}
                >
                  {role}
                </button>
              ))}
              <button
                type="button"
                onClick={() => {
                  setFamilyRole('__custom__')
                  setFieldErrors((prev) => ({ ...prev, role: '' }))
                }}
                className={`
                  px-4 py-2 rounded-full text-sm font-medium border transition-all
                  ${familyRole === '__custom__'
                    ? 'border-[#E8A838] bg-[#E8A838]/20 text-[#E8A838]'
                    : 'border-white/20 text-white/70 hover:border-white/40 hover:text-white'
                  }
                `}
              >
                Altro...
              </button>
            </div>

            {familyRole === '__custom__' && (
              <input
                type="text"
                placeholder="Es. Cane di casa"
                value={customRole}
                onChange={(e) => {
                  setCustomRole(e.target.value)
                  setFieldErrors((prev) => ({ ...prev, role: '' }))
                }}
                maxLength={30}
                autoFocus
                className="mt-3 w-full bg-white/5 border border-white/20 focus:border-[#E8A838] rounded-xl px-4 py-2.5 text-white placeholder-white/30 outline-none text-sm transition-all"
              />
            )}

            {fieldErrors.role && (
              <p className="text-red-400 text-xs mt-1.5">{fieldErrors.role}</p>
            )}
          </div>

          {/* Summary */}
          <div className="flex items-center gap-4 bg-white/5 border border-white/10 rounded-2xl px-4 py-3">
            <div
              className="h-14 w-14 rounded-full flex items-center justify-center text-2xl shrink-0"
              style={{ backgroundColor: ACCENT }}
            >
              {emoji}
            </div>
            <div>
              <p className="text-white font-semibold">{name || '—'}</p>
              <p className="text-white/40 text-sm">
                {familyRole === '__custom__' ? customRole || '—' : familyRole || '—'}
              </p>
            </div>
          </div>

          {/* General error */}
          {error && (
            <div className="flex items-center gap-2 bg-red-500/15 border border-red-500/30 text-red-300 text-sm px-4 py-3 rounded-xl">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              {error}
            </div>
          )}

          {/* Submit button */}
          <button
            onClick={handleSetup}
            disabled={isSubmitting}
            className="w-full py-3.5 rounded-xl font-semibold text-[#1a1a2e] transition-all active:scale-95 disabled:opacity-60 flex items-center justify-center gap-2"
            style={{ backgroundColor: ACCENT }}
          >
            {isSubmitting ? (
              <>
                <div className="animate-spin h-4 w-4 border-2 border-[#1a1a2e] border-t-transparent rounded-full" />
                Creazione in corso...
              </>
            ) : (
              'Inizia'
            )}
          </button>
        </div>
      )}
    </div>
  )
}

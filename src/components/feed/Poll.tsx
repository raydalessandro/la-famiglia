'use client'

import { PostPollWithResults } from '@/types/database'

/**
 * Sondaggio inline di un post. Barre proporzionali, tap su opzione per
 * votare/cambiare voto.
 *
 * Comportamento per modalità:
 *   • single-choice → tap su opzione = sostituisce il voto precedente.
 *   • multi-choice  → tap su opzione = toggla quel voto (aggiunge/rimuove).
 *
 * Stato chiuso (closes_at < now): barre mostrate, tap disabilitato.
 *
 * La percentuale è calcolata su total_votes anche in multi-choice; in
 * multi-choice il total può superare il numero di membri (è la somma
 * dei voti, non dei votanti).
 */
export function Poll({
  poll,
  onVote,
  onRetract,
}: {
  poll: PostPollWithResults
  onVote: (optionId: string) => void
  onRetract: (optionId: string | null) => void
}) {
  const closed = poll.is_closed
  const total = poll.total_votes

  return (
    <div className="mx-4 mb-3 bg-surface-sunken rounded-card border border-white/10 p-4 flex flex-col gap-3">
      <p className="text-white text-body font-medium">{poll.question}</p>

      <div className="flex flex-col gap-2">
        {poll.options.map((opt) => {
          const pct = total > 0 ? Math.round((opt.vote_count / total) * 100) : 0
          const showResults = poll.options.some((o) => o.voted_by_me) || closed

          const handleClick = () => {
            if (closed) return
            if (poll.multi_choice) {
              // Multi: toggla questo voto.
              if (opt.voted_by_me) onRetract(opt.id)
              else onVote(opt.id)
            } else {
              // Single: sostituisce il voto precedente. Idempotente sul lato server.
              if (opt.voted_by_me) onRetract(null)
              else onVote(opt.id)
            }
          }

          const baseLabel = opt.voted_by_me
            ? `Togli voto da "${opt.label}"`
            : `Vota "${opt.label}"`

          return (
            <button
              key={opt.id}
              type="button"
              onClick={handleClick}
              disabled={closed}
              aria-pressed={opt.voted_by_me}
              aria-label={baseLabel}
              className={`relative w-full min-h-touch rounded-xl overflow-hidden border transition-colors text-left ${
                opt.voted_by_me
                  ? 'border-accent/60 ring-1 ring-accent/40'
                  : 'border-white/10 hover:border-white/30'
              } ${closed ? 'cursor-default opacity-90' : 'active:scale-[0.99]'}`}
            >
              {/* Barra proporzionale di sfondo. Visibile solo dopo voto o a sondaggio chiuso. */}
              {showResults && (
                <div
                  className={`absolute inset-y-0 left-0 transition-all duration-300 ${
                    opt.voted_by_me ? 'bg-accent/25' : 'bg-white/10'
                  }`}
                  style={{ width: `${pct}%` }}
                  aria-hidden="true"
                />
              )}

              <div className="relative flex items-center justify-between gap-3 px-4 py-2.5">
                <span className="flex items-center gap-2 min-w-0 text-white text-body">
                  {opt.voted_by_me && (
                    <svg
                      className="w-4 h-4 shrink-0 text-accent"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={3}
                      aria-hidden="true"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                  <span className="truncate">{opt.label}</span>
                </span>
                {showResults && (
                  <span className="shrink-0 text-caption text-white/70 tabular-nums">
                    {pct}% · {opt.vote_count}
                  </span>
                )}
              </div>
            </button>
          )
        })}
      </div>

      <p className="text-caption text-white/50">
        {total === 0 ? 'Nessun voto' : total === 1 ? '1 voto' : `${total} voti`}
        {poll.multi_choice && !closed && <span> · puoi scegliere più opzioni</span>}
        {closed && <span> · sondaggio chiuso</span>}
        {!closed && poll.closes_at && (
          <span>
            {' '}
            · chiude il{' '}
            {new Date(poll.closes_at).toLocaleDateString('it-IT', {
              day: 'numeric',
              month: 'short',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </span>
        )}
      </p>
    </div>
  )
}

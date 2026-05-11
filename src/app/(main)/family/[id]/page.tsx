'use client'

import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useMembers } from '@/hooks/useMembers'
import { usePosts } from '@/hooks/usePosts'
import { useAuth } from '@/hooks/useAuth'
import {
  Avatar,
  Button,
  EmptyState,
  Header,
  Skeleton,
} from '@/components/ui'

function formatMonthYear(dateStr: string | null | undefined): string | null {
  if (!dateStr) return null
  const d = new Date(dateStr)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString('it-IT', { month: 'long', year: 'numeric' })
}

export default function ProfilePage() {
  const params = useParams()
  const memberId = params.id as string
  const router = useRouter()

  const { getMember, isLoading: membersLoading } = useMembers()
  const { member: me } = useAuth()
  const { posts, total, isLoading: postsLoading, hasMore, loadMore } = usePosts(memberId)

  const profile = getMember(memberId)
  const isOwnProfile = me?.id === memberId

  if (membersLoading) {
    return (
      <div className="flex h-dvh flex-col bg-surface">
        <Header title="" showBack />
        <div className="flex-1 flex items-center justify-center">
          <Skeleton className="h-24 w-24 rounded-full" />
        </div>
      </div>
    )
  }

  if (!profile) {
    return (
      <div className="flex min-h-dvh flex-col bg-surface">
        <Header title="" showBack />
        <EmptyState
          icon="🔍"
          title="Membro non trovato"
          description="Forse il link è vecchio o il profilo è stato rimosso."
          action={<Button variant="ghost" onClick={() => router.back()}>Torna indietro</Button>}
        />
      </div>
    )
  }

  // Joined-since label uses members.created_at when present (column has
  // existed since 001_initial). Falls back gracefully if it's missing.
  const joined = formatMonthYear((profile as unknown as { created_at?: string }).created_at)

  return (
    <div className="min-h-dvh bg-surface text-white">
      <Header
        title={profile.name}
        showBack
        rightAction={
          isOwnProfile ? (
            <Link
              href="/settings"
              className="flex h-9 w-9 items-center justify-center rounded-full text-white/60 hover:text-white hover:bg-white/10 transition-colors active:scale-95"
              aria-label="Impostazioni"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </Link>
          ) : undefined
        }
      />

      {/* Profile hero */}
      <div className="px-6 pt-6 pb-5 flex flex-col items-center gap-4 border-b border-white/10">
        <Avatar
          emoji={profile.avatar_emoji}
          url={profile.avatar_url}
          name={profile.name}
          size="xl"
          color={profile.color}
          ringed
        />

        <div className="text-center">
          <h2 className="text-2xl font-bold text-white">{profile.name}</h2>
          {profile.family_role && (
            <p
              className="text-body font-medium mt-1"
              style={{ color: profile.color || '#E8A838' }}
            >
              {profile.family_role}
            </p>
          )}
          {profile.is_admin && (
            <span className="inline-block mt-2 rounded-full bg-purple-500/20 px-3 py-0.5 text-xs font-semibold text-purple-300">
              Amministratore
            </span>
          )}
        </div>

        {profile.bio && (
          <p className="text-white/70 text-body text-center leading-relaxed max-w-xs">
            {profile.bio}
          </p>
        )}

        {/* Stat row — keeps to two truthful, never-stale numbers. */}
        <div className="flex items-center gap-6 mt-1">
          <div className="text-center">
            <p className="text-2xl font-bold text-white tabular-nums leading-none">{total}</p>
            <p className="text-white/50 text-caption mt-0.5">
              {total === 1 ? 'post' : 'post'}
            </p>
          </div>
          {joined && (
            <div className="text-center">
              <p className="text-body font-semibold text-white capitalize leading-none">{joined}</p>
              <p className="text-white/50 text-caption mt-0.5">in famiglia da</p>
            </div>
          )}
        </div>

        {isOwnProfile && (
          <Link
            href="/settings"
            className="mt-1 rounded-full border border-accent/40 px-5 py-2 text-body font-semibold text-accent hover:bg-accent/10 transition-colors active:scale-95"
          >
            Impostazioni
          </Link>
        )}
      </div>

      {/* Posts grid */}
      <div className="px-4 pt-5 pb-24">
        <h3 className="text-caption font-semibold text-white/50 uppercase tracking-wide mb-3">
          Post
        </h3>

        {postsLoading ? (
          <div className="grid grid-cols-3 gap-1">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="aspect-square rounded-card" />
            ))}
          </div>
        ) : posts.length === 0 ? (
          <EmptyState
            icon="📝"
            title={isOwnProfile ? 'Non hai ancora pubblicato' : 'Nessun post ancora'}
            description={
              isOwnProfile
                ? 'Condividi una foto, una storia o una ricetta sulla bacheca.'
                : `Quando ${profile.name.split(' ')[0]} pubblicherà qualcosa apparirà qui.`
            }
            action={isOwnProfile ? <Button onClick={() => router.push('/feed')}>Vai alla bacheca</Button> : undefined}
          />
        ) : (
          <>
            {/* Instagram-style 3-column square grid: each cell taps through
             * to the single-post page. Image-first thumbnails when the post
             * has photos, text-only card otherwise. */}
            <div className="grid grid-cols-3 gap-1">
              {posts.map((post) => (
                <Link
                  key={post.id}
                  href={`/feed/${post.id}`}
                  className="relative aspect-square rounded-card overflow-hidden bg-surface-raised border border-white/5 active:scale-[0.97] transition-transform"
                  aria-label={post.text ? `Apri post: ${post.text.slice(0, 40)}` : 'Apri post'}
                >
                  {post.images.length > 0 ? (
                    <>
                      <img
                        src={post.images[0].image_url}
                        alt=""
                        className="absolute inset-0 w-full h-full object-cover"
                        loading="lazy"
                      />
                      {post.images.length > 1 && (
                        // Stack badge top-right when there's more than one
                        // image, like Instagram. Cheap visual cue.
                        <span className="absolute top-1.5 right-1.5 bg-black/55 text-white text-[10px] font-medium rounded-full px-1.5 py-0.5">
                          ▣ {post.images.length}
                        </span>
                      )}
                    </>
                  ) : (
                    <div className="absolute inset-0 p-2 flex flex-col">
                      <p className="text-white/85 text-[13px] leading-snug line-clamp-5 flex-1">
                        {post.text || '—'}
                      </p>
                      <span className="text-white/40 text-[10px] mt-1">
                        {new Date(post.created_at).toLocaleDateString('it-IT', {
                          day: 'numeric',
                          month: 'short',
                        })}
                      </span>
                    </div>
                  )}
                </Link>
              ))}
            </div>

            {hasMore && (
              <div className="mt-4 flex justify-center">
                <Button variant="ghost" onClick={loadMore}>Carica altri</Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

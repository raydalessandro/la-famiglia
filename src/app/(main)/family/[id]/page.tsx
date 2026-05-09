'use client'

import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useMembers } from '@/hooks/useMembers'
import { usePosts } from '@/hooks/usePosts'
import { useAuth } from '@/hooks/useAuth'
import { Avatar, Header } from '@/components/ui'

export default function ProfilePage() {
  const params = useParams()
  const memberId = params.id as string
  const router = useRouter()

  const { getMember, isLoading: membersLoading } = useMembers()
  const { member: me } = useAuth()
  const { posts, isLoading: postsLoading, hasMore, loadMore } = usePosts(memberId)

  const profile = getMember(memberId)
  const isOwnProfile = me?.id === memberId

  if (membersLoading) {
    return (
      <div className="flex h-dvh items-center justify-center bg-[#1a1a2e]">
        <div className="h-8 w-8 rounded-full border-2 border-[#E8A838] border-t-transparent animate-spin" />
      </div>
    )
  }

  if (!profile) {
    return (
      <div className="flex h-dvh flex-col items-center justify-center bg-[#1a1a2e] gap-4">
        <span className="text-5xl">🔍</span>
        <p className="text-white/50 text-sm">Membro non trovato</p>
        <button
          onClick={() => router.back()}
          className="text-[#E8A838] text-sm underline"
        >
          Torna indietro
        </button>
      </div>
    )
  }

  return (
    <div className="min-h-dvh bg-[#1a1a2e] text-white">
      <Header
        title={profile.name}
        showBack
        rightAction={
          isOwnProfile ? (
            <Link
              href="/settings"
              className="flex h-9 w-9 items-center justify-center rounded-full text-white/60 hover:text-white hover:bg-white/10 transition-colors"
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
          size="lg"
          color={profile.color}
        />

        <div className="text-center">
          <h2 className="text-2xl font-bold text-white">{profile.name}</h2>
          {profile.family_role && (
            <p className="text-[#E8A838] text-sm font-medium mt-1">{profile.family_role}</p>
          )}
          {profile.is_admin && (
            <span className="inline-block mt-2 rounded-full bg-purple-500/20 px-3 py-0.5 text-xs font-semibold text-purple-300">
              Amministratore
            </span>
          )}
        </div>

        {profile.bio && (
          <p className="text-white/60 text-sm text-center leading-relaxed max-w-xs">
            {profile.bio}
          </p>
        )}

        {isOwnProfile && (
          <Link
            href="/settings"
            className="mt-1 rounded-full border border-[#E8A838]/40 px-5 py-2 text-sm font-semibold text-[#E8A838] hover:bg-[#E8A838]/10 transition-colors active:scale-95"
          >
            Impostazioni
          </Link>
        )}
      </div>

      {/* Posts grid */}
      <div className="px-4 pt-5 pb-24">
        <h3 className="text-sm font-semibold text-white/50 uppercase tracking-wide mb-3">
          Post
        </h3>

        {postsLoading ? (
          <div className="grid grid-cols-2 gap-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-36 rounded-xl bg-white/5 animate-pulse" />
            ))}
          </div>
        ) : posts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <span className="text-4xl">📝</span>
            <p className="text-white/40 text-sm">
              {isOwnProfile ? 'Non hai ancora pubblicato nulla' : 'Nessun post ancora'}
            </p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2">
              {posts.map((post) => (
                <div
                  key={post.id}
                  className="rounded-xl bg-white/5 p-3 flex flex-col gap-2 min-h-[120px]"
                >
                  {/* Post image preview */}
                  {post.images.length > 0 && (
                    <div className="w-full h-24 rounded-lg overflow-hidden">
                      <img
                        src={post.images[0].image_url}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    </div>
                  )}

                  {/* Post text */}
                  <p className="text-xs text-white/80 leading-relaxed line-clamp-3 flex-1">
                    {post.text}
                  </p>

                  {/* Post meta */}
                  <div className="flex items-center gap-2 text-white/30 text-[10px]">
                    <span>
                      {new Date(post.created_at).toLocaleDateString('it-IT', {
                        day: 'numeric',
                        month: 'short',
                      })}
                    </span>
                    {post.likes.length > 0 && (
                      <>
                        <span>·</span>
                        <span>❤ {post.likes.length}</span>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {hasMore && (
              <div className="mt-4 flex justify-center">
                <button
                  onClick={loadMore}
                  className="rounded-full border border-white/20 px-5 py-2 text-sm text-white/60 hover:text-white hover:border-white/40 transition-colors"
                >
                  Carica altri
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

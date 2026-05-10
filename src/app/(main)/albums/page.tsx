'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAlbums } from '@/hooks/useAlbums'
import { useAuth } from '@/hooks/useAuth'
import { BottomSheet, Button, Skeleton } from '@/components/ui'

export default function AlbumsPage() {
  const router = useRouter()
  useAuth()
  const { albums, isLoading, createAlbum } = useAlbums()

  const [sheetOpen, setSheetOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')

  const handleCreate = async () => {
    const name = newName.trim()
    if (!name) { setError('Inserisci un nome per l\'album'); return }
    setCreating(true)
    setError('')
    const id = await createAlbum(name)
    setCreating(false)
    if (id) {
      setNewName('')
      setSheetOpen(false)
      router.push(`/albums/${id}`)
    } else {
      setError('Errore nella creazione dell\'album. Riprova.')
    }
  }

  return (
    <div className="min-h-dvh bg-[#1a1a2e] text-white">
      {/* Header */}
      <div className="sticky top-0 z-10 border-b border-white/10 bg-[#1a1a2e] px-4 py-4">
        <h1 className="text-xl font-bold text-[#E8A838]">Album</h1>
        <p className="text-sm text-white/50 mt-0.5">
          {albums.length} {albums.length === 1 ? 'album' : 'album'}
        </p>
      </div>

      <div className="px-4 pt-4 pb-28">
        {isLoading ? (
          <div className="grid grid-cols-2 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-44 rounded-card" />
            ))}
          </div>
        ) : albums.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 gap-4">
            <span className="text-5xl">🖼️</span>
            <div className="text-center">
              <p className="text-white/60 font-medium">Nessun album ancora</p>
              <p className="text-white/30 text-sm mt-1">Crea il primo album di famiglia</p>
            </div>
            <button
              onClick={() => setSheetOpen(true)}
              className="mt-2 rounded-full bg-[#E8A838] px-6 py-2.5 text-sm font-semibold text-[#1a1a2e] active:scale-95 transition-transform"
            >
              Crea album
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {albums.map((album) => (
              <Link
                key={album.id}
                href={`/albums/${album.id}`}
                className="group relative flex flex-col rounded-card bg-surface-raised border border-white/5 overflow-hidden transition-all active:scale-95 hover:bg-surface-high"
              >
                {/* Cover image */}
                <div className="h-32 w-full bg-white/5 overflow-hidden">
                  {album.cover_image_url ? (
                    <img
                      src={album.cover_image_url}
                      alt={album.name}
                      className="h-full w-full object-cover transition-transform group-hover:scale-105"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center">
                      <span className="text-4xl opacity-30">🖼️</span>
                    </div>
                  )}
                </div>

                {/* Album info */}
                <div className="p-3">
                  <p className="font-semibold text-white text-sm leading-tight truncate">{album.name}</p>
                  <p className="text-xs text-white/40 mt-0.5">
                    {album.photo_count ?? 0} {(album.photo_count ?? 0) === 1 ? 'foto' : 'foto'}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* FAB */}
      {albums.length > 0 && (
        <button
          onClick={() => setSheetOpen(true)}
          className="fixed bottom-24 right-5 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-[#E8A838] text-[#1a1a2e] shadow-lg shadow-[#E8A838]/30 active:scale-95 transition-transform"
          aria-label="Crea album"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
      )}

      {/* Create album sheet */}
      <BottomSheet
        isOpen={sheetOpen}
        onClose={() => { setSheetOpen(false); setNewName(''); setError('') }}
        title="Nuovo album"
      >
        <div className="flex flex-col gap-4 pt-2">
          <div>
            <label className="block text-xs font-semibold text-white/50 uppercase tracking-wide mb-2">
              Nome album
            </label>
            <input
              type="text"
              value={newName}
              onChange={(e) => { setNewName(e.target.value); setError('') }}
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
              placeholder="es. Vacanze Estate 2025"
              autoFocus
              className="w-full rounded-xl bg-white/10 px-4 py-3 text-sm text-white placeholder-white/30 outline-none focus:ring-2 focus:ring-[#E8A838]"
            />
            {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
          </div>

          <Button
            onClick={handleCreate}
            disabled={!newName.trim()}
            loading={creating}
            fullWidth
          >
            {creating ? 'Creazione…' : 'Crea album'}
          </Button>
        </div>
      </BottomSheet>
    </div>
  )
}

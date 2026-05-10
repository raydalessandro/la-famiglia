'use client'

import { useCallback, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import { useAlbums, useAlbumPhotos } from '@/hooks/useAlbums'
import { useAuth } from '@/hooks/useAuth'
import { Header, BottomSheet, Button } from '@/components/ui'
import { compressImage } from '@/lib/storage'
import { AlbumPhoto } from '@/types/database'

export default function AlbumDetailPage() {
  const params = useParams()
  const albumId = params.id as string

  useAuth()
  const { albums } = useAlbums()
  const { photos, isLoading, uploadPhoto, deletePhoto } = useAlbumPhotos(albumId)

  const album = albums.find((a) => a.id === albumId)

  const [fullscreen, setFullscreen] = useState<AlbumPhoto | null>(null)
  const [uploadSheet, setUploadSheet] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const [caption, setCaption] = useState('')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [longPressTimer, setLongPressTimer] = useState<ReturnType<typeof setTimeout> | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadError('')
    const compressed = await compressImage(file)
    setSelectedFile(compressed)
    const url = URL.createObjectURL(compressed)
    setPreviewUrl(url)
    setUploadSheet(true)
  }

  const handleUpload = async () => {
    if (!selectedFile) return
    setUploading(true)
    setUploadError('')
    const ok = await uploadPhoto(selectedFile, caption.trim() || undefined)
    setUploading(false)
    if (ok) {
      setUploadSheet(false)
      setSelectedFile(null)
      setCaption('')
      if (previewUrl) { URL.revokeObjectURL(previewUrl); setPreviewUrl(null) }
    } else {
      setUploadError('Errore durante il caricamento. Riprova.')
    }
  }

  const handleDelete = async (photoId: string) => {
    setDeleting(photoId)
    await deletePhoto(photoId)
    setDeleting(null)
    if (fullscreen?.id === photoId) setFullscreen(null)
  }

  const handleLongPressStart = useCallback((photo: AlbumPhoto) => {
    const t = setTimeout(() => setFullscreen(photo), 500)
    setLongPressTimer(t)
  }, [])

  const handleLongPressEnd = useCallback(() => {
    if (longPressTimer) { clearTimeout(longPressTimer); setLongPressTimer(null) }
  }, [longPressTimer])

  const closeUploadSheet = () => {
    setUploadSheet(false)
    setSelectedFile(null)
    setCaption('')
    setUploadError('')
    if (previewUrl) { URL.revokeObjectURL(previewUrl); setPreviewUrl(null) }
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  // Split photos into two columns for masonry-like layout
  const leftCol: AlbumPhoto[] = []
  const rightCol: AlbumPhoto[] = []
  photos.forEach((p, i) => (i % 2 === 0 ? leftCol : rightCol).push(p))

  return (
    <div className="min-h-dvh bg-[#1a1a2e] text-white">
      <Header title={album?.name ?? 'Album'} showBack />

      <div className="px-3 pt-4 pb-28">
        {isLoading ? (
          <div className="flex items-center justify-center py-24">
            <div className="h-8 w-8 rounded-full border-2 border-[#E8A838] border-t-transparent animate-spin" />
          </div>
        ) : photos.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 gap-4">
            <span className="text-5xl">📷</span>
            <div className="text-center">
              <p className="text-white/60 font-medium">Nessuna foto ancora</p>
              <p className="text-white/30 text-sm mt-1">Aggiungi la prima foto all&apos;album</p>
            </div>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="mt-2 rounded-full bg-[#E8A838] px-6 py-2.5 text-sm font-semibold text-[#1a1a2e] active:scale-95 transition-transform"
            >
              Aggiungi foto
            </button>
          </div>
        ) : (
          /* Masonry 2-col grid */
          <div className="flex gap-2">
            {[leftCol, rightCol].map((col, ci) => (
              <div key={ci} className="flex flex-1 flex-col gap-2">
                {col.map((photo) => (
                  <button
                    key={photo.id}
                    className="relative w-full rounded-xl overflow-hidden group"
                    onClick={() => setFullscreen(photo)}
                    onTouchStart={() => handleLongPressStart(photo)}
                    onTouchEnd={handleLongPressEnd}
                    onTouchCancel={handleLongPressEnd}
                    aria-label="Apri foto"
                  >
                    <img
                      src={photo.image_url}
                      alt={photo.caption}
                      className="w-full object-cover"
                      style={{ minHeight: '100px' }}
                    />
                    {/* Hover overlay */}
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors" />
                  </button>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* FAB upload */}
      {photos.length > 0 && (
        <button
          onClick={() => fileInputRef.current?.click()}
          className="fixed bottom-24 right-5 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-[#E8A838] text-[#1a1a2e] shadow-lg shadow-[#E8A838]/30 active:scale-95 transition-transform"
          aria-label="Aggiungi foto"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
      )}

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={handleFileChange}
      />

      {/* Upload bottom sheet */}
      <BottomSheet isOpen={uploadSheet} onClose={closeUploadSheet} title="Aggiungi foto">
        <div className="flex flex-col gap-4 pt-2">
          {/* Preview */}
          {previewUrl && (
            <div className="w-full h-52 rounded-xl overflow-hidden bg-white/5">
              <img src={previewUrl} alt="Anteprima" className="w-full h-full object-contain" />
            </div>
          )}

          {/* Caption */}
          <div>
            <label className="block text-xs font-semibold text-white/50 uppercase tracking-wide mb-2">
              Didascalia (opzionale)
            </label>
            <input
              type="text"
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder="Aggiungi una descrizione…"
              className="w-full rounded-xl bg-white/10 px-4 py-3 text-sm text-white placeholder-white/30 outline-none focus:ring-2 focus:ring-[#E8A838]"
            />
          </div>

          {uploadError && <p className="text-xs text-red-400">{uploadError}</p>}

          <Button
            onClick={handleUpload}
            disabled={!selectedFile}
            loading={uploading}
            fullWidth
          >
            {uploading ? 'Caricamento…' : 'Carica foto'}
          </Button>
        </div>
      </BottomSheet>

      {/* Fullscreen overlay */}
      {fullscreen && (
        <div
          className="fixed inset-0 z-50 flex flex-col bg-black"
          onClick={() => setFullscreen(null)}
        >
          {/* Top bar */}
          <div
            className="flex items-center justify-between px-4 pt-safe pt-4 pb-3 bg-gradient-to-b from-black/70 to-transparent"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setFullscreen(null)}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white"
              aria-label="Chiudi"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>

            <button
              onClick={() => handleDelete(fullscreen.id)}
              disabled={deleting === fullscreen.id}
              className="flex h-10 items-center gap-1.5 rounded-full bg-red-500/20 px-3 text-sm font-medium text-red-400 disabled:opacity-50"
              aria-label="Elimina foto"
            >
              {deleting === fullscreen.id ? (
                <div className="h-4 w-4 rounded-full border-2 border-red-400 border-t-transparent animate-spin" />
              ) : (
                <>
                  <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6l-1 14H6L5 6" />
                    <path d="M10 11v6M14 11v6" />
                    <path d="M9 6V4h6v2" />
                  </svg>
                  Elimina
                </>
              )}
            </button>
          </div>

          {/* Photo */}
          <div className="flex flex-1 items-center justify-center px-2" onClick={(e) => e.stopPropagation()}>
            <img
              src={fullscreen.image_url}
              alt={fullscreen.caption ?? ''}
              className="max-h-full max-w-full object-contain rounded-lg"
            />
          </div>

          {/* Caption */}
          {fullscreen.caption.length > 0 && (
            <div
              className="px-4 pb-safe pb-6 pt-3 bg-gradient-to-t from-black/70 to-transparent"
              onClick={(e) => e.stopPropagation()}
            >
              <p className="text-sm text-white/80 text-center">{fullscreen.caption}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

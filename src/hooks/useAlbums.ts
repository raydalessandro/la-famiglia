'use client'

import { useState, useEffect, useCallback } from 'react'
import { AlbumWithDetails, AlbumPhoto, ApiResponse } from '@/types/database'

// ─── useAlbums ────────────────────────────────────────────────────────────────

type UseAlbumsReturn = {
  albums: AlbumWithDetails[]
  isLoading: boolean
  error: string | null
  createAlbum: (name: string) => Promise<string | null>
  deleteAlbum: (id: string) => Promise<boolean>
  refetch: () => Promise<void>
}

export function useAlbums(): UseAlbumsReturn {
  const [albums, setAlbums] = useState<AlbumWithDetails[]>([])
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)

  const fetchAlbums = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/albums')
      const result: ApiResponse<AlbumWithDetails[]> = await res.json()
      if (result.error) {
        setError(result.error)
      } else {
        setAlbums(result.data ?? [])
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to fetch albums')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchAlbums()
  }, [fetchAlbums])

  const createAlbum = useCallback(async (name: string): Promise<string | null> => {
    try {
      const res = await fetch('/api/albums', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      if (!res.ok) return null
      const result: ApiResponse<AlbumWithDetails> = await res.json()
      if (result.data) {
        await fetchAlbums()
        return result.data.id
      }
      return null
    } catch {
      return null
    }
  }, [fetchAlbums])

  const deleteAlbum = useCallback(async (id: string): Promise<boolean> => {
    try {
      const res = await fetch(`/api/albums/${id}`, { method: 'DELETE' })
      if (res.ok) {
        setAlbums((prev) => prev.filter((a) => a.id !== id))
        return true
      }
      return false
    } catch {
      return false
    }
  }, [])

  return { albums, isLoading, error, createAlbum, deleteAlbum, refetch: fetchAlbums }
}

// ─── useAlbumPhotos ───────────────────────────────────────────────────────────

type UseAlbumPhotosReturn = {
  photos: AlbumPhoto[]
  isLoading: boolean
  error: string | null
  uploadPhoto: (file: File, caption?: string) => Promise<boolean>
  deletePhoto: (photoId: string) => Promise<boolean>
  refetch: () => Promise<void>
}

export function useAlbumPhotos(albumId: string): UseAlbumPhotosReturn {
  const [photos, setPhotos] = useState<AlbumPhoto[]>([])
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)

  const fetchPhotos = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/albums/${albumId}/photos`)
      const result: ApiResponse<AlbumPhoto[]> = await res.json()
      if (result.error) {
        setError(result.error)
      } else {
        setPhotos(result.data ?? [])
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to fetch photos')
    } finally {
      setIsLoading(false)
    }
  }, [albumId])

  useEffect(() => {
    fetchPhotos()
  }, [fetchPhotos])

  const uploadPhoto = useCallback(async (file: File, caption?: string): Promise<boolean> => {
    try {
      const formData = new FormData()
      formData.append('image', file)
      if (caption) formData.append('caption', caption)
      const res = await fetch(`/api/albums/${albumId}/photos`, {
        method: 'POST',
        body: formData,
      })
      if (res.ok) { await fetchPhotos(); return true }
      return false
    } catch {
      return false
    }
  }, [albumId, fetchPhotos])

  const deletePhoto = useCallback(async (photoId: string): Promise<boolean> => {
    try {
      const res = await fetch(`/api/albums/${albumId}/photos/${photoId}`, { method: 'DELETE' })
      if (res.ok) {
        setPhotos((prev) => prev.filter((p) => p.id !== photoId))
        return true
      }
      return false
    } catch {
      return false
    }
  }, [albumId])

  return { photos, isLoading, error, uploadPhoto, deletePhoto, refetch: fetchPhotos }
}

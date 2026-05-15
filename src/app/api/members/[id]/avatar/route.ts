import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, toSelfMember } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase/client'
import { uploadImage, BUCKETS, ALLOWED_TYPES, MAX_IMAGE_SIZE } from '@/lib/storage'

type RouteContext = { params: Promise<{ id: string }> }

// POST /api/members/:id/avatar (self or admin) → ApiResponse<MemberSelf>
// Body: multipart/form-data con campo `file` (image/jpeg | png | webp).
// Side-effects:
//   1. Cleanup best-effort delle versioni precedenti dell'avatar sotto
//      altre estensioni (membro che passa da .webp a .jpg, ecc.).
//   2. Upload su bucket `avatars` a path `${memberId}.${ext}` (upsert).
//   3. UPDATE members.avatar_url = `${publicUrl}?v=${ts}`. Il query
//      string forza il browser / service worker a invalidare la cache
//      anche se Supabase Storage lo ignora server-side (la URL canonica
//      e` la stessa).
export async function POST(req: NextRequest, { params }: RouteContext) {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth

  const { id } = await params

  if (auth.id !== id && !auth.is_admin) {
    return NextResponse.json({ data: null, error: 'Accesso negato' }, { status: 403 })
  }

  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return NextResponse.json(
      { data: null, error: 'Body non valido (atteso multipart/form-data)' },
      { status: 400 },
    )
  }

  const file = formData.get('file')
  if (!(file instanceof File)) {
    return NextResponse.json({ data: null, error: 'Campo `file` mancante' }, { status: 400 })
  }
  if (file.size > MAX_IMAGE_SIZE) {
    return NextResponse.json(
      { data: null, error: 'File troppo grande (max 5MB).' },
      { status: 400 },
    )
  }
  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json(
      { data: null, error: 'Tipo file non supportato. Usa JPEG, PNG o WebP.' },
      { status: 400 },
    )
  }

  const ext = file.type === 'image/webp' ? 'webp' : file.type === 'image/jpeg' ? 'jpg' : 'png'
  const path = `${id}.${ext}`

  const db = createServerClient()

  // Best-effort cleanup: rimuoviamo le altre estensioni per evitare
  // orfani quando il membro cambia il tipo di file (es. iOS Safari che
  // fallback a JPEG dopo aver caricato un WebP).
  const oldPaths = ['webp', 'jpg', 'png'].filter((e) => e !== ext).map((e) => `${id}.${e}`)
  await db.storage.from(BUCKETS.avatars).remove(oldPaths)

  let publicUrl: string
  try {
    publicUrl = await uploadImage(BUCKETS.avatars, file, path)
  } catch (e) {
    return NextResponse.json(
      { data: null, error: e instanceof Error ? e.message : 'Upload fallito' },
      { status: 500 },
    )
  }

  const urlWithBust = `${publicUrl}?v=${Date.now()}`

  const { data: updated, error: updateErr } = await db
    .from('members')
    .update({ avatar_url: urlWithBust })
    .eq('id', id)
    .select('*')
    .single()

  if (updateErr || !updated) {
    return NextResponse.json(
      { data: null, error: updateErr?.message ?? 'Aggiornamento profilo fallito' },
      { status: 500 },
    )
  }

  return NextResponse.json({ data: toSelfMember(updated), error: null })
}

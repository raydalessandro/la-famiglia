import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase/client'
import { uploadImage } from '@/lib/storage'
import { buildPostWithDetails } from '@/lib/posts'

// GET /api/posts?page=1&per_page=10&author_id=xxx → PaginatedResponse<PostWithDetails>
export async function GET(req: NextRequest) {
  const member = await requireAuth()

  if (member instanceof NextResponse) return member

  const { searchParams } = new URL(req.url)
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10))
  const per_page = Math.max(1, parseInt(searchParams.get('per_page') ?? '10', 10))
  const author_id = searchParams.get('author_id') ?? undefined

  const db = createServerClient()

  // Count query
  let countQuery = db
    .from('posts')
    .select('*', { count: 'exact', head: true })

  if (author_id) {
    countQuery = countQuery.eq('author_id', author_id)
  }

  const { count, error: countError } = await countQuery

  if (countError) {
    return NextResponse.json({ data: [], total: 0, page, per_page, has_more: false, error: countError.message }, { status: 500 })
  }

  const total = count ?? 0
  const from = (page - 1) * per_page
  const to = from + per_page - 1

  // Data query
  let dataQuery = db
    .from('posts')
    .select('*')
    .order('created_at', { ascending: false })
    .range(from, to)

  if (author_id) {
    dataQuery = dataQuery.eq('author_id', author_id)
  }

  const { data: posts, error: dataError } = await dataQuery

  if (dataError) {
    return NextResponse.json({ data: [], total: 0, page, per_page, has_more: false, error: dataError.message }, { status: 500 })
  }

  const postsWithDetails = await Promise.all(
    (posts ?? []).map((post) => buildPostWithDetails(post, member))
  )

  return NextResponse.json({
    data: postsWithDetails,
    total,
    page,
    per_page,
    has_more: from + (posts?.length ?? 0) < total,
    error: null,
  })
}

// POST /api/posts (FormData: text, post_type, images[]) → 201 ApiResponse<PostWithDetails>
export async function POST(req: NextRequest) {
  const member = await requireAuth()

  if (member instanceof NextResponse) return member

  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return NextResponse.json({ data: null, error: 'FormData non valido' }, { status: 400 })
  }

  const text = (formData.get('text') as string | null)?.trim() ?? ''
  const post_type = (formData.get('post_type') as string | null) ?? 'normal'
  const imageFiles = formData.getAll('images') as File[]

  if (!text) {
    return NextResponse.json({ data: null, error: 'Il testo è obbligatorio' }, { status: 400 })
  }

  const validPostTypes = ['normal', 'recipe', 'story']
  if (!validPostTypes.includes(post_type)) {
    return NextResponse.json({ data: null, error: 'Tipo post non valido' }, { status: 400 })
  }

  const db = createServerClient()

  // Insert post
  const { data: post, error: postError } = await db
    .from('posts')
    .insert({
      author_id: member.id,
      text,
      post_type,
    })
    .select('*')
    .single()

  if (postError || !post) {
    return NextResponse.json({ data: null, error: postError?.message ?? 'Errore creazione post' }, { status: 500 })
  }

  // Upload images and insert post_images records
  if (imageFiles.length > 0) {
    for (let i = 0; i < imageFiles.length; i++) {
      const file = imageFiles[i]
      if (!file || file.size === 0) continue

      try {
        const imageUrl = await uploadImage('posts', file, `${post.id}/${i}`)
        await db.from('post_images').insert({
          post_id: post.id,
          image_url: imageUrl,
          sort_order: i,
        })
      } catch (err: unknown) {
        console.error(`Error uploading image ${i} for post ${post.id}:`, err)
      }
    }
  }

  const postWithDetails = await buildPostWithDetails(post, member)

  return NextResponse.json({ data: postWithDetails, error: null }, { status: 201 })
}

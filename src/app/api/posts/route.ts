import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase/client'
import { uploadImage } from '@/lib/storage'
import { buildPostWithDetails } from '@/lib/posts'
import { emit } from '@/lib/notification-events'
import { parseMentions, insertMentions } from '@/lib/mentions'
import type { CreatePollInput, Member } from '@/types/database'

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

// POST /api/posts (FormData: text, post_type, images[], poll?) → 201 ApiResponse<PostWithDetails>
//
// Campo `poll` opzionale come JSON string:
//   { question: string, options: string[], multi_choice?: boolean, closes_at?: ISO string }
// Validazione: question 1-200 char, 2-4 opzioni non vuote (max 100 char ciascuna),
// closes_at se presente deve essere nel futuro.
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
  const imageFiles = (formData.getAll('images') as File[]).filter((f) => f && f.size > 0)
  const pollRaw = formData.get('poll') as string | null

  // Almeno uno tra testo / foto / sondaggio deve essere presente: la
  // `question` del sondaggio fa da contenuto del post quando il testo è
  // vuoto (caso "WhatsApp-style": Quando ci vediamo? — Sabato / Domenica).
  if (!text && imageFiles.length === 0 && !pollRaw) {
    return NextResponse.json(
      { data: null, error: 'Aggiungi un testo, una foto o un sondaggio' },
      { status: 400 },
    )
  }

  const validPostTypes = ['normal', 'recipe', 'story']
  if (!validPostTypes.includes(post_type)) {
    return NextResponse.json({ data: null, error: 'Tipo post non valido' }, { status: 400 })
  }

  let pollInput: CreatePollInput | null = null
  if (pollRaw) {
    const parsed = parsePollInput(pollRaw)
    if ('error' in parsed) {
      return NextResponse.json({ data: null, error: parsed.error }, { status: 400 })
    }
    pollInput = parsed.value
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

  // Insert poll + options (best-effort: se fallisce il post resta senza sondaggio)
  if (pollInput) {
    const { data: poll, error: pollError } = await db
      .from('post_polls')
      .insert({
        post_id: post.id,
        question: pollInput.question,
        multi_choice: pollInput.multi_choice ?? false,
        closes_at: pollInput.closes_at ?? null,
      })
      .select('id')
      .single()

    if (pollError || !poll) {
      console.error(`Error creating poll for post ${post.id}:`, pollError)
    } else {
      const optionRows = pollInput.options.map((label, index) => ({
        poll_id: poll.id,
        label,
        sort_order: index,
      }))
      const { error: optionsError } = await db.from('post_poll_options').insert(optionRows)
      if (optionsError) {
        console.error(`Error creating poll options for post ${post.id}:`, optionsError)
      }
    }
  }

  const postWithDetails = await buildPostWithDetails(post, member)

  // Notifica tutta la famiglia del nuovo post (l'autore viene escluso
  // dentro la definition del catalog).
  emit('new_post', {
    sender: { id: member.id, name: member.name },
    post: { id: post.id, text, post_type },
  }).catch((err) => console.error('emit new_post failed:', err))

  // Parse + persistenza delle @menzioni nel testo del post. La push
  // notification al menzionato è SEPARATA da quella "new_post"
  // generale: chi è menzionato riceve due banner (uno per il post,
  // uno per la mention) — è il pattern WhatsApp di group + reply.
  // Fire-and-forget: il client non aspetta la creazione delle
  // mention prima di vedere il post pubblicato.
  void (async () => {
    try {
      const { data: members } = await db
        .from('members')
        .select('id, name')
        .eq('is_active', true)
      const parsed = parseMentions(text, (members ?? []) as Pick<Member, 'id' | 'name'>[], {
        excludeAuthorId: member.id,
      })
      const inserted = await insertMentions(parsed, { type: 'post', id: post.id }, member.id)
      for (const m of inserted) {
        await emit('mention', {
          author: { id: member.id, name: member.name },
          mentionedId: m.mentioned_id,
          source: {
            type: 'post',
            link: `/feed/${post.id}`,
            preview: snippet(text),
          },
        }).catch((err) => console.error('emit mention (post) failed:', err))
      }
    } catch (err) {
      console.error('[posts] mention pipeline failed:', err)
    }
  })()

  return NextResponse.json({ data: postWithDetails, error: null }, { status: 201 })
}

// Snippet usato come body delle push di mention. Limite ~100 char
// con ellipsis, niente trim aggressivo che taglia in mezzo a una
// parola (cosmetico ma migliora la lettura sul banner).
function snippet(text: string, max = 100): string {
  if (text.length <= max) return text
  const cut = text.slice(0, max)
  const lastSpace = cut.lastIndexOf(' ')
  return (lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut) + '…'
}

type PollParseResult = { value: CreatePollInput } | { error: string }

function parsePollInput(raw: string): PollParseResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { error: 'Sondaggio non valido' }
  }

  if (!parsed || typeof parsed !== 'object') {
    return { error: 'Sondaggio non valido' }
  }

  const obj = parsed as Record<string, unknown>
  const question = typeof obj.question === 'string' ? obj.question.trim() : ''
  if (!question) return { error: 'La domanda del sondaggio è obbligatoria' }
  if (question.length > 200) return { error: 'La domanda è troppo lunga (max 200 caratteri)' }

  if (!Array.isArray(obj.options)) {
    return { error: 'Le opzioni del sondaggio sono obbligatorie' }
  }

  const options = obj.options
    .map((o) => (typeof o === 'string' ? o.trim() : ''))
    .filter((o) => o.length > 0)

  if (options.length < 2) return { error: 'Servono almeno 2 opzioni' }
  if (options.length > 4) return { error: 'Massimo 4 opzioni' }
  if (options.some((o) => o.length > 100)) {
    return { error: 'Ogni opzione può avere al massimo 100 caratteri' }
  }
  const lowered = options.map((o) => o.toLowerCase())
  if (new Set(lowered).size !== lowered.length) {
    return { error: 'Le opzioni devono essere diverse tra loro' }
  }

  const multi_choice = obj.multi_choice === true

  let closes_at: string | null = null
  if (typeof obj.closes_at === 'string' && obj.closes_at.length > 0) {
    const t = Date.parse(obj.closes_at)
    if (Number.isNaN(t)) return { error: 'Data di chiusura non valida' }
    if (t <= Date.now()) return { error: 'La chiusura deve essere nel futuro' }
    closes_at = new Date(t).toISOString()
  }

  return { value: { question, options, multi_choice, closes_at } }
}

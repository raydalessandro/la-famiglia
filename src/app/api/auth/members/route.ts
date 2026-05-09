import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/client'

// GET /api/auth/members — PUBLIC endpoint for login page member list
// Returns only public-safe fields (no pin_hash, no notification config)
// Under /api/auth/ so middleware lets it through (PUBLIC_PATHS includes '/api/auth')
export async function GET() {
  const db = createServerClient()
  const { data, error } = await db
    .from('members')
    .select('id, name, avatar_emoji, avatar_url, family_role, bio, is_admin, is_active, color')
    .eq('is_active', true)
    .order('name')

  if (error) {
    return NextResponse.json({ data: null, error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data: data ?? [], error: null })
}

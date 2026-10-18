import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code')
  const next = request.nextUrl.searchParams.get('next')
  const destination = next?.startsWith('/') && !next.startsWith('//') ? next : '/dashboard'
  const supabase = await createSupabaseServerClient()

  if (!supabase || !code) {
    return NextResponse.redirect(new URL('/setup', request.url))
  }

  const { error } = await supabase.auth.exchangeCodeForSession(code)
  if (error) {
    return NextResponse.redirect(new URL('/login?error=verification', request.url))
  }

  return NextResponse.redirect(new URL(destination, request.url))
}

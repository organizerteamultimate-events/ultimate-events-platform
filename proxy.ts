import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { getSupabaseConfig } from '@/lib/supabase/config'

export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname
  const isAdminLogin = path === '/admin/login'
  const requiresAuth = path.startsWith('/dashboard') || (path.startsWith('/admin') && !isAdminLogin)
  const config = getSupabaseConfig()
  if (!config) {
    return requiresAuth
      ? NextResponse.redirect(new URL('/setup?error=supabase-not-configured', request.url))
      : NextResponse.next({ request })
  }

  let response = NextResponse.next({ request })
  const supabase = createServerClient(config.url, config.key, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value)
        }
        response = NextResponse.next({ request })
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options)
        }
      },
    },
  })

  const { data, error } = await supabase.auth.getUser()

  if (path.startsWith('/dashboard') && (error || !data.user)) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('next', path)
    return NextResponse.redirect(loginUrl)
  }

  if (path.startsWith('/admin') && !isAdminLogin) {
    if (error || !data.user) {
      return NextResponse.redirect(new URL('/admin/login', request.url))
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', data.user.id)
      .maybeSingle()

    if (profileError || profile?.role !== 'admin') {
      return NextResponse.redirect(new URL('/admin/login?error=unauthorized', request.url))
    }
  }

  return response
}

export const config = {
  matcher: ['/dashboard/:path*', '/admin/:path*'],
}

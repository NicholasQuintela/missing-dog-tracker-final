import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"

function getPublicKey() {
  return process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
}

export async function createClient() {
  const cookieStore = await cookies()
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const publicKey = getPublicKey()

  if (!url || !publicKey) throw new Error("Supabase public environment variables are not configured.")

  return createServerClient(url, publicKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          )
        } catch {
          // called from a Server Component; safe to ignore
        }
      },
    },
  })
}

import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabaseClient } from '@/lib/supabase'
import type { Database } from '@/lib/database.types'
import { isBrandSlug } from '@/lib/brandGuards'
import { useBranding } from './BrandingContext'
import { type BrandSlug } from '@/types'

interface AuthUser {
  id: string
  fullName: string
  email: string
  role: 'admin' | 'producer' | 'client'
  brandSlug?: BrandSlug
  brandUuid?: string | null
}

interface AuthContextValue {
  user: AuthUser | null
  isLoading: boolean
  isAuthenticated: boolean
  signIn: (input: { email: string; brandId?: BrandSlug }) => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

type ProfileRow = Database['public']['Tables']['profiles']['Row']

export function AuthProvider({ children }: PropsWithChildren) {
  const { switchBrand } = useBranding()
  const [user, setUser] = useState<AuthUser | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const resolveBrandSlug = useCallback(
    async (brandUuid: string | null | undefined): Promise<BrandSlug | undefined> => {
      if (!brandUuid) return undefined
      const { data, error } = await supabaseClient
        .from('brands')
        .select('slug')
        .eq('id', brandUuid)
        .maybeSingle()

      if (error) {
        console.error('Failed to fetch brand slug', error)
        return undefined
      }

      if (data?.slug && isBrandSlug(data.slug)) {
        switchBrand(data.slug)
        return data.slug
      }

      return undefined
    },
    [switchBrand],
  )

  const hydrateUser = useCallback(
    async (sessionUser: Session['user'] | null) => {
      if (!sessionUser) {
        setUser(null)
        setIsLoading(false)
        return
      }

      let profile: ProfileRow | null = null
      const { data: profileRow, error: profileError } = await supabaseClient
        .from('profiles')
        .select('id, full_name, email, role, avatar_url, brand_id, created_at, updated_at')
        .eq('id', sessionUser.id)
        .maybeSingle()

      if (profileError) {
        console.error('Unable to load profile', profileError)
      } else {
        profile = profileRow
      }

      const brandSlug = await resolveBrandSlug(profile?.brand_id ?? null)

      setUser({
        id: sessionUser.id,
        fullName: profile?.full_name ?? (sessionUser.user_metadata.full_name as string | undefined) ?? sessionUser.email ?? 'Member',
        email: profile?.email ?? sessionUser.email ?? 'unknown@amo.mx',
        role: (profile?.role as AuthUser['role']) ?? 'producer',
        brandSlug,
        brandUuid: profile?.brand_id ?? null,
      })
      setIsLoading(false)
    },
    [resolveBrandSlug],
  )

  useEffect(() => {
    let isMounted = true

    supabaseClient.auth.getSession().then(({ data }) => {
      if (!isMounted) return
      void hydrateUser(data.session?.user ?? null)
    })

    const {
      data: { subscription },
    } = supabaseClient.auth.onAuthStateChange((_event, session) => {
      void hydrateUser(session?.user ?? null)
    })

    return () => {
      isMounted = false
      subscription.unsubscribe()
    }
  }, [hydrateUser])

  const signIn = useCallback(
    async ({ email, brandId }: { email: string; brandId?: BrandSlug }) => {
      if (brandId) {
        switchBrand(brandId)
      }

      const emailRedirectTo = typeof window !== 'undefined' ? `${window.location.origin}` : undefined
      const { error } = await supabaseClient.auth.signInWithOtp({
        email,
        options: emailRedirectTo
          ? {
              emailRedirectTo,
            }
          : undefined,
      })

      if (error) {
        throw error
      }
    },
    [switchBrand],
  )

  const signOut = useCallback(async () => {
    const { error } = await supabaseClient.auth.signOut()
    if (error) {
      throw error
    }
    setUser(null)
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isLoading,
      isAuthenticated: Boolean(user),
      signIn,
      signOut,
    }),
    [user, isLoading, signIn, signOut],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return ctx
}

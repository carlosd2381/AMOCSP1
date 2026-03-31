const getEnv = (key: string, fallback = '') => {
  const value = import.meta.env[key as keyof ImportMetaEnv]
  if (value === undefined || value === null || value === '') {
    return fallback
  }
  return value
}

export const env = {
  supabaseUrl: getEnv('VITE_SUPABASE_URL'),
  supabaseAnonKey: getEnv('VITE_SUPABASE_ANON_KEY'),
  stripePublicKey: getEnv('VITE_STRIPE_PUBLIC_KEY'),
  googleMapsKey: getEnv('VITE_GOOGLE_MAPS_KEY'),
}

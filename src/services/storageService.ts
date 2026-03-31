import { supabaseClient } from '@/lib/supabase'

export async function generateSignedUrl(path: string) {
  const { data, error } = await supabaseClient.storage.from('media').createSignedUrl(path, 60 * 60)
  if (error) {
    throw error
  }
  return data.signedUrl
}

export async function listGallery(folder: string) {
  const { data, error } = await supabaseClient.storage.from('media').list(folder, {
    limit: 50,
    sortBy: { column: 'name', order: 'asc' },
  })
  if (error) {
    throw error
  }
  return data
}

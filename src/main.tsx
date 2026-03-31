import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { BrandingProvider } from '@/contexts/BrandingContext'
import { AuthProvider } from '@/contexts/AuthContext'
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClient } from '@/lib/queryClient'
import { Toaster } from 'react-hot-toast'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrandingProvider>
      <AuthProvider>
        <QueryClientProvider client={queryClient}>
          <App />
          <Toaster position="top-right" toastOptions={{ duration: 4000 }} />
        </QueryClientProvider>
      </AuthProvider>
    </BrandingProvider>
  </StrictMode>,
)

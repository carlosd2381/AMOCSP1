import { Suspense } from 'react'
import { AppRouter } from '@/routes/AppRouter'

function App() {
  return (
    <Suspense fallback={<div className="p-10 text-center text-brand-muted">Loading workspace…</div>}>
      <AppRouter />
    </Suspense>
  )
}

export default App

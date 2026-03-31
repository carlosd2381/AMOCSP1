import { Outlet } from 'react-router-dom'
import { SidebarNav } from '@/components/layout/SidebarNav'
import { TopBar } from '@/components/layout/TopBar'

export function AdminSidebarLayout() {
  return (
    <div className="grid min-h-screen grid-cols-1 gap-3 bg-surface px-2 py-2 text-white lg:grid-cols-[260px_minmax(0,1fr)] lg:px-3 lg:py-3 xl:grid-cols-[280px_minmax(0,1fr)] xl:px-3">
      <SidebarNav />
      <div className="flex flex-col gap-6">
        <TopBar />
        <main className="flex flex-1 flex-col gap-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

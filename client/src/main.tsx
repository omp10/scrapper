import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SessionProvider } from './session.tsx'
import { RequireAuth, RequireAdmin, RedirectIfAuthed, NotFound } from './routes.tsx'
import Layout from './Layout.tsx'
import SearchPage from './pages/SearchPage.tsx'
import LeadsPage from './pages/LeadsPage.tsx'
import DashboardPage from './pages/DashboardPage.tsx'
import AdminPage from './pages/AdminPage.tsx'
import LoginPage from './pages/LoginPage.tsx'
import RegisterPage from './pages/RegisterPage.tsx'
import './index.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Every refetch of a search costs money. Never refetch one on its own.
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <SessionProvider>
          <Routes>
            {/* Public — a signed-in user gets bounced back out of these. */}
            <Route element={<RedirectIfAuthed />}>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/register" element={<RegisterPage />} />
            </Route>

            {/* Everything below needs a session. */}
            <Route element={<RequireAuth />}>
              <Route element={<Layout />}>
                <Route path="/" element={<Navigate to="/search" replace />} />
                {/* One page, two renderings — the URL says which. */}
                <Route path="/search" element={<SearchPage view="list" />} />
                <Route path="/map" element={<SearchPage view="map" />} />
                <Route path="/leads" element={<LeadsPage />} />
                <Route path="/dashboard" element={<DashboardPage />} />

                <Route element={<RequireAdmin />}>
                  <Route path="/admin" element={<AdminPage />} />
                </Route>
              </Route>
            </Route>

            <Route path="*" element={<NotFound />} />
          </Routes>
        </SessionProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
)

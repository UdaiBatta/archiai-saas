import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom'

import Dashboard from './pages/Dashboard'
import ProjectPage from './pages/Project'
import Landing from './pages/Landing'
import Login from './pages/Login'
import PricingPage from './pages/Pricing'
import CheckoutPage from './pages/Checkout'
import Register from './pages/Register'
import SharedProjectPage from './pages/SharedProject'
import WorkspacePage from './pages/Workspace'
import WorkspacesPage from './pages/Workspaces'
import { useAuthStore } from './store/authStore'

function ProtectedRoute() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  return isAuthenticated ? <Outlet /> : <Navigate to="/login" replace />
}

function PublicOnlyRoute() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  return isAuthenticated ? <Navigate to="/dashboard" replace /> : <Outlet />
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/pricing" element={<PricingPage />} />
        <Route path="/checkout" element={<CheckoutPage />} />
        <Route path="/share/:token" element={<SharedProjectPage />} />
        <Route element={<PublicOnlyRoute />}>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
        </Route>
        <Route element={<ProtectedRoute />}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/projects/:id" element={<ProjectPage />} />
          <Route path="/workspaces" element={<WorkspacesPage />} />
          <Route path="/workspaces/:id" element={<WorkspacePage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

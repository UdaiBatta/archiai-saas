import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import PricingPage from './index'

function LocationProbe() {
  const location = useLocation()
  return <div>at:{location.pathname + location.search}</div>
}

function renderPricing() {
  return render(
    <MemoryRouter initialEntries={['/pricing']}>
      <Routes>
        <Route path="/pricing" element={<PricingPage />} />
        <Route path="/register" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('Pricing page', () => {
  it('renders all four plans, saying plainly which can be started today', () => {
    renderPricing()

    expect(screen.getByRole('heading', { name: 'Plans & Pricing' })).toBeInTheDocument()
    for (const plan of ['Starter', 'Pro', 'Team', 'Enterprise']) {
      expect(screen.getByRole('heading', { name: plan })).toBeInTheDocument()
    }
    expect(screen.getByText(/aren’t on sale yet/)).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Coming soon' })).toHaveLength(3)
    expect(screen.queryByText(/demo checkout/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: '2D Plan' })).not.toBeInTheDocument()
  })

  it('switches prices between monthly and annual billing', async () => {
    renderPricing()
    const user = userEvent.setup()

    // The amount and its period are styled apart: "$29" + "/mo".
    expect(screen.getByText('$29')).toBeInTheDocument()
    expect(screen.getAllByText('/mo').length).toBeGreaterThan(0)
    await user.click(screen.getByRole('tab', { name: /annual/i }))
    expect(screen.getByText('$290')).toBeInTheDocument()
    expect(screen.queryByText('$29')).not.toBeInTheDocument()
    expect(screen.queryByText('/mo')).not.toBeInTheDocument()
  })

  it('starts the free plan by sending you to sign-up', async () => {
    renderPricing()
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: 'Start free' }))

    expect(screen.getByText('at:/register')).toBeInTheDocument()
  })

  it('renders the comparison table', () => {
    renderPricing()

    expect(screen.getByRole('table')).toBeInTheDocument()
    expect(screen.getByText('Team workspaces & roles')).toBeInTheDocument()
  })
})

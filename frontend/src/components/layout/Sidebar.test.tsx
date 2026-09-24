import { describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { render, screen } from '@testing-library/react'

import { Sidebar } from './Sidebar'

describe('Sidebar', () => {
  it('links only to sections that exist', () => {
    render(
      <MemoryRouter>
        <Sidebar onLogout={vi.fn()} />
      </MemoryRouter>,
    )

    expect(screen.getAllByRole('link').map((link) => link.getAttribute('href'))).toEqual([
      '/dashboard',
      '/workspaces',
    ])
  })
})

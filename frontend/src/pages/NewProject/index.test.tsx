import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import projectService from '../../services/project.service'
import { QUICK_STARTS } from '../../constants/quickStarts'
import NewProjectPage, { titleFromBrief } from './index'

vi.mock('../../services/project.service', () => ({ default: { create: vi.fn() } }))
vi.mock('../../hooks/useAuth', () => ({ useAuth: () => ({ logOut: vi.fn(), user: { name: 'Test' } }) }))

function Arrived() {
  const location = useLocation()
  return <p>at:{location.pathname} brief:{(location.state as { initialPrompt?: string } | null)?.initialPrompt}</p>
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/projects/new']}>
      <Routes>
        <Route path="/projects/new" element={<NewProjectPage />} />
        <Route path="/projects/:id" element={<Arrived />} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => vi.mocked(projectService.create).mockReset())

describe('New project page', () => {
  it('asks for a brief instead of creating an empty project', async () => {
    renderPage()
    await userEvent.setup().click(screen.getByRole('button', { name: 'Review brief' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Write a brief first')
    expect(projectService.create).not.toHaveBeenCalled()
  })

  it('creates the project from the brief and hands the brief to the project page', async () => {
    vi.mocked(projectService.create).mockResolvedValue({ id: 'p9' } as never)
    renderPage()
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /3BHK house/ }))
    await user.click(screen.getByRole('button', { name: 'Review brief' }))

    const brief = QUICK_STARTS[1].brief
    expect(projectService.create).toHaveBeenCalledWith({ title: titleFromBrief(brief) })
    expect(await screen.findByText(`at:/projects/p9 brief:${brief}`)).toBeInTheDocument()
  })
})

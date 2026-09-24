import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { CommandBar } from './CommandBar'

describe('CommandBar recovery state', () => {
  it('keeps the brief visible and retries a failed local-AI request', async () => {
    const onSubmit = vi.fn()
    const user = userEvent.setup()

    render(
      <CommandBar
        showParams={false}
        setShowParams={vi.fn()}
        plotWidthM=""
        setPlotWidthM={vi.fn()}
        floorsOverride=""
        setFloorsOverride={vi.fn()}
        orientation=""
        setOrientation={vi.fn()}
        prompt="A two-storey house on a 20m x 18m plot"
        setPrompt={vi.fn()}
        generating={false}
        generateError="The AI provider took too long to respond. Please try again."
        onSubmit={onSubmit}
      />,
    )

    expect(screen.getByRole('alert')).toHaveTextContent(
      'The AI provider took too long to respond. Please try again.',
    )
    expect(screen.getByLabelText('Layout prompt')).toHaveValue(
      'A two-storey house on a 20m x 18m plot',
    )

    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(onSubmit).toHaveBeenCalledTimes(1)
  })
})

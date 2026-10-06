import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { HoursSlider, formatClock } from './matte-hours-slider'

describe('HoursSlider', () => {
  it('keeps a single time inside the shaded window', () => {
    const onChange = vi.fn()
    render(<HoursSlider label="Sun" value={[10]} onChange={onChange} window={[6, 18]} step={0.25} thumbLabels={['Time of day']} />)
    expect(screen.getByRole('group', { name: 'Sun' })).toHaveTextContent('10:00')
    fireEvent.change(screen.getByLabelText('Time of day'), { target: { value: '21' } })
    expect(onChange).toHaveBeenLastCalledWith([18])
  })

  it('keeps a window ordered when a thumb passes the other', () => {
    const onChange = vi.fn()
    render(<HoursSlider label="Window" value={[9, 12]} onChange={onChange} thumbLabels={['Start', 'End']} />)
    fireEvent.change(screen.getByLabelText('Start'), { target: { value: '15' } })
    expect(onChange).toHaveBeenLastCalledWith([15, 15])
  })

  it('formats hours as a clock', () => {
    expect(formatClock(6.5)).toBe('06:30')
  })
})

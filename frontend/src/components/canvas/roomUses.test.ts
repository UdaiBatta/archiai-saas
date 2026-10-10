import { describe, expect, it } from 'vitest'
import { isDefaultLabel, roomUseLabel } from './roomUses'

describe('room uses', () => {
  it('labels known and unknown uses', () => {
    expect(roomUseLabel('living_room')).toBe('Living room')
    expect(roomUseLabel('room')).toBe('Room')
    expect(roomUseLabel('guest_bedroom')).toBe('Guest bedroom')
  })

  it('tells app-given names from typed ones', () => {
    expect(isDefaultLabel('Room', 'room')).toBe(true)
    expect(isDefaultLabel('Kitchen 2', 'kitchen')).toBe(true)
    expect(isDefaultLabel('Big kitchen', 'kitchen')).toBe(false)
  })
})

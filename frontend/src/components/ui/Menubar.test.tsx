import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { Menubar, MenubarItem, MenubarMenu, MenubarRadioGroup, MenubarSubmenu } from './Menubar'

describe('Menubar', () => {
  it('runs items, including a radio choice inside a submenu', async () => {
    const onNew = vi.fn()
    const onPick = vi.fn()
    render(
      <Menubar>
        <MenubarMenu label="File">
          <MenubarItem onClick={onNew}>New project</MenubarItem>
          <MenubarSubmenu label="Layout options">
            <MenubarRadioGroup value={0} onChange={onPick} options={[{ value: 0, label: 'Option 1' }, { value: 1, label: 'Option 2' }]} />
          </MenubarSubmenu>
        </MenubarMenu>
      </Menubar>,
    )
    const user = userEvent.setup()
    await user.click(screen.getByRole('menuitem', { name: 'File' }))
    await user.click(await screen.findByRole('menuitem', { name: 'New project' }))
    expect(onNew).toHaveBeenCalledOnce()

    await user.click(screen.getByRole('menuitem', { name: 'File' }))
    // Submenus are opened from the keyboard here: jsdom can't run the
    // hover logic that opens them on pointer (the real browser can).
    ;(await screen.findByRole('menuitem', { name: 'Layout options' })).focus()
    await user.keyboard('{ArrowRight}')
    await user.click(await screen.findByRole('menuitemradio', { name: 'Option 2' }))
    expect(onPick).toHaveBeenCalledWith(1)
  })
})

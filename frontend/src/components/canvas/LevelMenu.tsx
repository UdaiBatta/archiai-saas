import { useState } from 'react'
import { useCanvasStore } from '../../store/canvasStore'
import { useEscapeToClose } from '../../hooks/useEscapeToClose'

export function LevelMenu() {
  const [open, setOpen] = useState(false)
  useEscapeToClose(open, () => setOpen(false))
  const floors = useCanvasStore((s) => s.floors)
  const selectedFloor = useCanvasStore((s) => s.selectedFloor)
  const setSelectedFloor = useCanvasStore((s) => s.setSelectedFloor)
  const addFloorAbove = useCanvasStore((s) => s.addFloorAbove)
  const addFloorBelow = useCanvasStore((s) => s.addFloorBelow)
  const removeFloor = useCanvasStore((s) => s.removeFloor)

  const activeFloor = floors.find((f) => f.level === selectedFloor)
  const activeName = selectedFloor === 'all' ? 'All Floors' : activeFloor?.name ?? 'Level'
  const canDelete = floors.length > 1

  const orderedFloors = [...floors].sort((a, b) => b.level - a.level)

  return (
    <div className="relative">
      {open && (
        <div
          className="fixed inset-0 z-30"
          onClick={() => setOpen(false)}
          aria-hidden="true"
        />
      )}
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className={`flex items-center gap-1.5 rounded-lg border border-ink/10 px-2.5 py-1.5 text-ink transition-colors ${
          open ? 'bg-graphite-800/95' : 'bg-graphite-800/70 hover:bg-graphite-800/90'
        }`}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="text-accent-bright" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="4" width="18" height="6" rx="1" />
          <rect x="3" y="14" width="18" height="6" rx="1" />
        </svg>
        <span className="max-w-12 truncate text-xs font-semibold sm:max-w-32">{activeName}</span>
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-muted-light">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div className="absolute left-0 top-10 z-40 w-48 rounded-2xl border border-ink/10 bg-graphite-800 p-1.5 shadow-2xl">
          <button
            type="button"
            onClick={() => {
              addFloorAbove()
              setOpen(false)
            }}
            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm font-medium text-ink hover:bg-ink/10"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
            Upper level
          </button>

          <button
            type="button"
            onClick={() => setSelectedFloor('all')}
            className={`flex w-full items-center gap-1.5 rounded-lg px-2.5 py-2 text-left text-sm ${
              selectedFloor === 'all' ? 'bg-ink/10 font-semibold' : 'font-medium hover:bg-ink/5'
            }`}
          >
            <span className="flex w-4 flex-shrink-0 justify-center">
              {selectedFloor === 'all' && (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="text-accent-bright" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 6L9 17l-5-5" />
                </svg>
              )}
            </span>
            All Floors
          </button>

          {orderedFloors.map((floor) => (
            <button
              key={floor.id}
              type="button"
              onClick={() => {
                setSelectedFloor(floor.level)
                setOpen(false)
              }}
              className={`flex w-full items-center gap-1.5 rounded-lg px-2.5 py-2 text-left text-sm ${
                selectedFloor === floor.level ? 'bg-ink/10 font-semibold' : 'font-medium hover:bg-ink/5'
              }`}
            >
              <span className="flex w-4 flex-shrink-0 justify-center">
                {selectedFloor === floor.level && (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="text-accent-bright" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                )}
              </span>
              {floor.name}
            </button>
          ))}

          <button
            type="button"
            onClick={() => {
              addFloorBelow()
              setOpen(false)
            }}
            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm font-medium text-ink hover:bg-ink/10"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
            Lower level
          </button>

          <div className="my-1 h-px bg-ink/10" />

          <button
            type="button"
            disabled={!canDelete}
            onClick={() => {
              if (typeof selectedFloor === 'number') removeFloor(selectedFloor)
              setOpen(false)
            }}
            className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm font-medium ${
              canDelete ? 'text-danger hover:bg-danger/10' : 'cursor-default text-ink/25'
            }`}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 0 1-4 0v-.1A1.6 1.6 0 0 0 7 19.4a1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0-1.1-2.7H1a2 2 0 0 1 0-4h.1A1.6 1.6 0 0 0 2.6 7a1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H7a1.6 1.6 0 0 0 1-1.5V1a2 2 0 0 1 4 0v.1a1.6 1.6 0 0 0 2.7 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V7a1.6 1.6 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z" />
            </svg>
            {canDelete ? 'Delete this level' : 'Edit levels'}
          </button>
        </div>
      )}
    </div>
  )
}

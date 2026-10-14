import type { ReactNode } from 'react'

import { EXAMPLE } from '../../constants/examplePlan'
import { ExamplePlanDrawing } from './ExamplePlanDrawing'

/** The landing's panel: dark tile, hairline ring, ember glow from below. */
export const panelClass =
  'rounded-2xl bg-graphite-950 ring-1 ring-ink/10 shadow-[inset_0_-20px_80px_-20px_rgba(255,59,31,0.12)]'

/**
 * "What you get" as a bento grid. Every tile's graphic is built from the
 * real product: the massing readout, the example plan and its rules.
 * Hovering a tile lifts its graphic; text sits on a blurred panel below it.
 */
function BentoCard({
  eyebrow,
  title,
  description,
  graphic,
  className = '',
}: {
  eyebrow: string
  title: string
  description: string
  graphic: ReactNode
  className?: string
}) {
  return (
    <article
      className={`group relative flex flex-col overflow-hidden ${panelClass} transition-shadow hover:ring-ember/40 ${className}`}
    >
      <div className="relative h-56 shrink-0 overflow-hidden" aria-hidden="true">
        <div className="absolute inset-0 transition-transform duration-500 ease-out group-hover:-translate-y-1 group-hover:scale-[1.03] motion-reduce:transition-none">
          {graphic}
        </div>
        <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-graphite-950 to-transparent" />
      </div>
      <div className="relative z-10 -mt-8 flex-1 bg-graphite-950/70 p-6 backdrop-blur-xl">
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-ember">{eyebrow}</p>
        <h3 className="mt-1.5 text-lg font-bold tracking-tight text-ink">{title}</h3>
        <p className="mt-2 text-sm leading-relaxed text-muted">{description}</p>
      </div>
    </article>
  )
}

const chip = 'rounded-full border border-ink/15 bg-ink/5 px-2.5 py-1 font-mono text-[11px] text-graphite-100'

function MassingGraphic() {
  // Three stacked masses in axonometric, coloured by floor use, with the zoning readout.
  // Isometric box standing on its front corner (x, y): w runs right, d runs left, h up.
  const block = (x: number, y: number, w: number, d: number, h: number, top: string, side: string, key: string) => {
    const rx = w * 0.866, ry = -w / 2, lx = -d * 0.866, ly = -d / 2
    const pts = (p: number[][]) => p.map(([px, py]) => `${x + px},${y + py}`).join(' ')
    return (
      <g key={key}>
        <polygon points={pts([[0, 0], [rx, ry], [rx, ry - h], [0, -h]])} className={side} />
        <polygon points={pts([[0, 0], [lx, ly], [lx, ly - h], [0, -h]])} className="fill-graphite-800" />
        <polygon points={pts([[0, -h], [rx, ry - h], [rx + lx, ry + ly - h], [lx, ly - h]])} className={top} />
      </g>
    )
  }
  return (
    <div className="flex h-full items-center gap-4 px-6">
      <svg viewBox="0 -30 200 170" className="h-full w-1/2">
        {block(150, 92, 40, 30, 30, 'fill-graphite-600', 'fill-graphite-700', 'neighbour')}
        {block(80, 112, 60, 45, 20, 'fill-ember/60', 'fill-ember/35', 'retail')}
        {block(80, 92, 60, 45, 62, 'fill-graphite-100', 'fill-graphite-300', 'homes')}
      </svg>
      <ul className="flex flex-1 flex-col gap-1.5 font-mono text-[11px]">
        {[['FAR', '1.82 / 2.00', true], ['Height', '27 / 30 m', true], ['Coverage', '54 / 50 %', false]].map(([k, v, ok]) => (
          <li key={k as string} className={`flex justify-between rounded-md px-2 py-1 ${ok ? 'bg-ink/5 text-graphite-100' : 'bg-danger/10 text-danger'}`}>
            <span>{k}</span><span>{v}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function AssistantGraphic() {
  return (
    <div className="flex h-full flex-col justify-center gap-2 px-6 text-[12px]">
      <p className="self-end rounded-xl bg-graphite-800 px-3 py-2 text-graphite-100">Make the kitchen brighter</p>
      <div className="rounded-xl border border-ember/30 bg-graphite-900 px-3 py-2 text-graphite-100">
        <p>Swap kitchen and dining so the kitchen gets the east window.</p>
        <p className="mt-1 font-mono text-[10px] text-ok">✓ passes every rule</p>
      </div>
      <div className="flex gap-1.5">
        {['Preview', 'Apply', 'Undo'].map((c) => <span key={c} className={chip}>{c}</span>)}
      </div>
    </div>
  )
}

function ChecksGraphic() {
  const checks: [string, boolean][] = [
    ['Balcony opens off the living room', true],
    ['Every room reachable from the entrance', true],
    ['Balcony only through a bedroom', false],
    ['Kitchen kept away from the bathrooms', true],
  ]
  return (
    <ul className="flex h-full flex-col justify-center gap-2 px-6 text-[13px]">
      {checks.map(([label, ok]) => (
        <li key={label} className={`flex items-center gap-2 rounded-lg px-3 py-1.5 ${ok ? 'bg-ok/10 text-graphite-100' : 'bg-danger/10 text-danger line-through decoration-danger/60'}`}>
          <span className={ok ? 'text-ok' : 'text-danger'}>{ok ? '✓' : '✕'}</span>
          {label}
          {!ok && <span className="ml-auto font-mono text-[10px] no-underline">rejected</span>}
        </li>
      ))}
    </ul>
  )
}

function ConnectionsGraphic() {
  const pair = (kind: 'wall' | 'door' | 'open', x: number) => (
    <g transform={`translate(${x} 20)`}>
      <rect x="0" y="0" width="54" height="80" rx="3" className="fill-graphite-800" />
      <rect x="54" y="0" width="54" height="80" rx="3" className="fill-graphite-750" />
      {kind === 'wall' && <line x1="54" y1="0" x2="54" y2="80" className="stroke-graphite-200" strokeWidth="4" />}
      {kind === 'door' && (
        <>
          <line x1="54" y1="0" x2="54" y2="28" className="stroke-graphite-200" strokeWidth="4" />
          <line x1="54" y1="50" x2="54" y2="80" className="stroke-graphite-200" strokeWidth="4" />
          <line x1="54" y1="28" x2="54" y2="50" className="stroke-ember" strokeWidth="4" />
        </>
      )}
      {kind === 'open' && <line x1="54" y1="0" x2="54" y2="80" className="stroke-graphite-400" strokeWidth="1.5" strokeDasharray="4 4" />}
      <text x="54" y="100" textAnchor="middle" className="fill-graphite-200 font-mono text-[11px] uppercase">{kind}</text>
    </g>
  )
  return (
    <svg viewBox="0 0 400 130" className="h-full w-full px-4">
      {pair('wall', 16)}
      {pair('door', 146)}
      {pair('open', 276)}
    </svg>
  )
}

function GraphGraphic() {
  const nodes = [
    { id: 'Entry', x: 30, y: 65 },
    { id: 'Living', x: 110, y: 40 },
    { id: 'Kitchen', x: 110, y: 95 },
    { id: 'Corridor', x: 195, y: 65 },
    { id: 'Bedroom', x: 280, y: 35 },
    { id: 'Master', x: 280, y: 95 },
    { id: 'Bath', x: 360, y: 95 },
  ]
  const at = Object.fromEntries(nodes.map((n) => [n.id, n]))
  const edges: [string, string, 'door' | 'open'][] = [
    ['Entry', 'Living', 'open'], ['Living', 'Kitchen', 'open'], ['Living', 'Corridor', 'open'],
    ['Corridor', 'Bedroom', 'door'], ['Corridor', 'Master', 'door'], ['Master', 'Bath', 'door'],
  ]
  return (
    <svg viewBox="0 0 400 130" className="h-full w-full px-4">
      {edges.map(([a, b, kind]) => (
        <line key={a + b} x1={at[a].x} y1={at[a].y} x2={at[b].x} y2={at[b].y}
          className={kind === 'open' ? 'stroke-ember' : 'stroke-graphite-200'} strokeWidth={kind === 'open' ? 3 : 1.5} />
      ))}
      {nodes.map((n) => (
        <g key={n.id}>
          <circle cx={n.x} cy={n.y} r="16" className="fill-graphite-850 stroke-graphite-400" />
          <text x={n.x} y={n.y + 30} textAnchor="middle" className="fill-graphite-200 text-[10px]">{n.id}</text>
        </g>
      ))}
    </svg>
  )
}

function ModelGraphic() {
  return (
    <div className="flex h-full items-center justify-center [perspective:900px]">
      <div className="w-40 [transform:rotateX(55deg)_rotateZ(-38deg)] drop-shadow-[0_24px_24px_rgba(0,0,0,0.6)]">
        <ExamplePlanDrawing plan={EXAMPLE.plan} compact />
      </div>
    </div>
  )
}

function VersionsGraphic() {
  const rows = [
    ['v3', 'Kitchen opened to dining', 'Named'],
    ['v2', 'Auto-saved draft', 'Draft'],
    ['v1', 'Option A: one slab', 'Option'],
  ]
  return (
    <div className="flex h-full flex-col justify-center gap-2 px-6">
      {rows.map(([v, label, kind]) => (
        <div key={v} className="flex items-center gap-3 rounded-lg border border-ink/10 bg-graphite-900 px-3 py-2 text-[12px]">
          <span className="font-mono text-ember">{v}</span>
          <span className="text-graphite-100">{label}</span>
          <span className="ml-auto font-mono text-[10px] text-muted-light">{kind}</span>
        </div>
      ))}
      <div className="flex gap-1.5 pt-1">
        {['DXF', 'IFC', 'PDF', 'Share link'].map((c) => <span key={c} className={chip}>{c}</span>)}
      </div>
    </div>
  )
}

export function FeatureBento() {
  return (
    <div className="mt-10 grid grid-cols-1 gap-4 lg:grid-cols-6">
      <BentoCard
        className="lg:col-span-3"
        eyebrow="Site & massing"
        title="Shape it against the zoning"
        description="Setbacks, height, coverage and FAR live on the site. Push floors, give each one a use, see the neighbours, and compare options side by side."
        graphic={<MassingGraphic />}
      />
      <BentoCard
        className="lg:col-span-3"
        eyebrow="Checks"
        title="Checked as you draw"
        description="A broken “must connect”, an unreachable room or a bathroom only reachable through a bedroom is flagged the moment it happens."
        graphic={<ChecksGraphic />}
      />
      <BentoCard
        className="lg:col-span-2"
        eyebrow="Connections"
        title="Wall, door or open"
        description="Choose how any two rooms meet, and slide a door along its wall. Your choices survive every edit."
        graphic={<ConnectionsGraphic />}
      />
      <BentoCard
        className="lg:col-span-2"
        eyebrow="Access"
        title="Access graph and zoning"
        description="How you walk from the entrance to every room, and how each zone is entered, updated on every change."
        graphic={<GraphGraphic />}
      />
      <BentoCard
        className="lg:col-span-2"
        eyebrow="2D + 3D"
        title="One plan, both views"
        description="Real walls with door openings in 3D; open-plan areas read as one continuous space."
        graphic={<ModelGraphic />}
      />
      <BentoCard
        className="lg:col-span-3"
        eyebrow="History"
        title="Versions, sharing and CAD export"
        description="Auto-save, named versions and design options. DXF for AutoCAD and IFC for Revit, plus PDF and read-only share links."
        graphic={<VersionsGraphic />}
      />
      <BentoCard
        className="lg:col-span-3"
        eyebrow="AI, when asked"
        title="A second opinion, not a starting point"
        description="Ask the assistant to review a plan, explain a rule or suggest a change. Nothing moves until you preview and apply it, and every change is one undo."
        graphic={<AssistantGraphic />}
      />
    </div>
  )
}

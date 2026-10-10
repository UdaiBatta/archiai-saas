import type { ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { WebsiteNavbar, useStartDesigningTarget } from '../../components/website/WebsiteNavbar'
import { WebsiteFooter } from '../../components/website/WebsiteFooter'
import { AsciiField } from '../../components/website/AsciiField'
import { ExamplePlanDrawing } from '../../components/website/ExamplePlanDrawing'
import { FeatureBento, panelClass } from '../../components/website/FeatureBento'
import { PricingCard } from '../../components/website/PricingCard'
import { EXAMPLE } from '../../constants/examplePlan'
import { PLANS } from '../../constants/plans'
import { useHashScroll } from '../../hooks/useHashScroll'

// The real sequence a project goes through, in order. You draw; AI comes last.
const STEPS = [
  {
    title: 'Set the site',
    description: 'Draw the plot or import it (GeoJSON, DXF), load the buildings around it, and set setbacks, height and FAR.',
  },
  {
    title: 'Shape the massing',
    description: 'Push and pull masses, give each floor a use, and compare design options against the zoning limits.',
  },
  {
    title: 'Plan every floor',
    description: 'Fill floors with homes, draw rooms, walls, doors, windows and furniture. Every edit is checked as you make it.',
  },
  {
    title: 'Ask AI to improve it',
    description: 'When you want a second opinion: a review, a fix for a broken rule, or an edit you preview, apply and can undo.',
  },
]

/** A card of real checks floating over the hero's dot field. */
function FloatingCard({ className, label, lines, footer }: { className: string; label: string; lines: string[]; footer?: string }) {
  return (
    <div className={`absolute w-64 motion-safe:animate-float ${className}`}>
      <div className="rounded-2xl border border-ink/15 border-l-2 border-l-ember bg-graphite-950/85 p-4 shadow-[0_20px_50px_rgba(0,0,0,0.6)] backdrop-blur-sm">
        <p className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.16em] text-ember-soft">
          <span className="h-1.5 w-1.5 rounded-full bg-ember" />
          {label}
        </p>
        <ul className="mt-3 space-y-1.5 text-[13px] font-medium text-graphite-100">
          {lines.map((line) => (
            <li key={line} className="flex gap-2">
              <span className="text-ok">✓</span>
              {line}
            </li>
          ))}
        </ul>
        {footer && <p className="mt-3 border-t border-ink/10 pt-2 font-mono text-[11px] text-graphite-200">{footer}</p>}
      </div>
    </div>
  )
}

function SectionHead({ eyebrow, title, lead }: { eyebrow: string; title: string; lead?: string }) {
  return (
    <div>
      <p className="font-mono text-xs uppercase tracking-[0.2em] text-ember">{eyebrow}</p>
      <h2 className="mt-3 text-4xl font-black uppercase leading-none tracking-tight text-ink sm:text-5xl" style={{ fontStretch: '125%' }}>
        {title}
      </h2>
      {lead && <p className="mt-3 max-w-2xl text-sm text-muted">{lead}</p>}
    </div>
  )
}

/** One stage of the example, hung off the timeline's ember line. */
function ExampleStep({ n, title, children }: { n: string; title: string; children: ReactNode }) {
  return (
    <li className="relative pl-12">
      <span className="absolute left-0 top-4 grid h-9 w-9 place-items-center rounded-full bg-night font-mono text-[11px] text-ember ring-1 ring-ember/50">
        {n}
      </span>
      <div className={`p-5 ${panelClass}`}>
        <h3 className="mb-3 text-sm font-bold text-ink">{title}</h3>
        {children}
      </div>
    </li>
  )
}

const RULE_BADGE: Record<string, string> = {
  'Must connect': 'bg-ember text-graphite-950',
  'Prefer nearby': 'text-ember-soft ring-1 ring-ember-soft/50',
  'Keep apart': 'text-graphite-100 ring-1 ring-ink/25',
}

const CHECKS = [
  'Every required room and count is present',
  'Every “must connect” is met',
  'Every room is reachable from the entrance',
  'No room is reachable only through a bedroom',
  'No overlaps, rooms at least their minimum size',
]

const rules = EXAMPLE.understood.filter((line) => /^(Must connect|Prefer nearby|Keep apart)/.test(line))
const program = EXAMPLE.understood.filter((line) => !rules.includes(line))

export default function Landing() {
  const navigate = useNavigate()
  const startTarget = useStartDesigningTarget()
  useHashScroll()

  return (
    <div className="min-h-screen bg-night text-ink">
      <WebsiteNavbar />

      <main>
        {/* Hero */}
        {/* Pulled up under the see-through navbar so the field runs to the top. */}
        <section className="relative isolate -mt-16 overflow-hidden border-b border-ink/10 pt-16">
          <AsciiField className="absolute inset-0 -z-10 opacity-20 lg:opacity-40" />
          <div
            aria-hidden="true"
            className="absolute inset-0 -z-10 bg-[linear-gradient(to_right,rgba(245,245,246,0.05)_1px,transparent_1px),linear-gradient(to_bottom,rgba(245,245,246,0.05)_1px,transparent_1px)] bg-[size:4rem_4rem]"
          />
          <div className="relative mx-auto flex min-h-[min(calc(100svh-7rem),44rem)] w-full max-w-6xl flex-col justify-center px-4 py-16 sm:px-6">
            <p className="font-mono text-xs uppercase tracking-[0.2em] text-ember-soft">
              Site → massing → plans → AutoCAD &amp; Revit
            </p>
            <h1
              className="mt-5 max-w-[680px] font-black uppercase leading-[0.95] tracking-tight text-ink"
              style={{ fontStretch: '125%', fontSize: 'clamp(2.25rem, 5.2vw, 4.75rem)' }}
            >
              <span className="block">Design it. </span>
              <span className="block text-ember">We check it.</span>
            </h1>
            <p className="mt-6 max-w-[560px] text-base leading-relaxed text-graphite-100">
              Draw a site, shape the massing, plan every floor, and export DXF and IFC files
              that open in AutoCAD and Revit, with every rule checked as you work. AI helps
              when you ask.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
              <Link
                to={startTarget}
                className="rounded-full bg-ember px-6 py-3 text-center text-sm font-bold text-graphite-950 shadow-[0_10px_40px_rgba(255,59,31,0.45)] transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/60"
              >
                Start designing free
              </Link>
              <Link
                to="/#example"
                className="rounded-full text-center border border-ink/30 bg-graphite-950/40 px-6 py-3 text-sm font-semibold text-ink backdrop-blur transition-colors hover:bg-ink/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/60"
              >
                See a real example
              </Link>
            </div>
            <p className="mt-3 text-xs text-muted-light">No credit card required.</p>

            {/* Real checks from the example, floating over the field. */}
            <div className="pointer-events-none absolute inset-0 hidden lg:block" aria-hidden="true">
              <FloatingCard
                className="right-[2%] top-[18%] rotate-[3deg]"
                label="Plan checked"
                lines={['Balcony opens off the living room', 'Master bath attached', 'Kitchen kept away from baths']}
                footer={`Quality score ${EXAMPLE.score}/100`}
              />
              <FloatingCard
                className="bottom-[14%] right-[14%] -rotate-[2deg] [animation-delay:1.5s]"
                label="Assistant, when asked"
                lines={['Move the study next to the living room', 'Still passes every rule', 'One step to undo']}
                footer="Preview · Apply"
              />
            </div>

          </div>
        </section>

        {/* What's in it, at a glance */}
        <section aria-label="In the product" className="border-b border-ink/10">
          <ul className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-5 font-mono text-[11px] uppercase tracking-[0.14em] text-graphite-200 sm:px-6">
            {['3D editor', 'Rule checking', 'DXF · IFC · GLB · OBJ export', 'Undoable AI edits'].map((item) => (
              <li key={item} className="flex items-center gap-2">
                <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-ember" />
                {item}
              </li>
            ))}
          </ul>
        </section>

        {/* How it works */}
        <section id="how-it-works" className="scroll-mt-20">
          <div className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6">
            <SectionHead eyebrow="Four steps" title="How it works" />
            <ol className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {STEPS.map((step, index) => (
                <li key={step.title} className={`flex flex-col gap-2 p-5 ${panelClass}`}>
                  <span className="font-mono text-xs tracking-[0.2em] text-ember">0{index + 1}</span>
                  <h3 className="mt-2 text-base font-bold text-ink">{step.title}</h3>
                  <p className="text-sm leading-relaxed text-muted">{step.description}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* The example, in full */}
        <section id="example" className="scroll-mt-20 border-t border-ink/5">
          <div className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6">
            <SectionHead
              eyebrow="A real example"
              title="A plan, and what it's checked for"
              lead="A real ArchiAI plan, not a mock-up, with the rules it's held to on every edit. Hover a room for its size."
            />
            <div className="mt-10 grid items-start gap-6 lg:grid-cols-[1.15fr_1fr]">
              {/* The drawing, as a sheet */}
              <div className={`overflow-hidden ${panelClass}`}>
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ink/10 px-5 py-3 font-mono text-[11px] uppercase tracking-[0.14em] text-muted-light">
                  <span><span className="text-ember">A-101</span> · Ground floor plan</span>
                  <span>Plot 12 × 15 m · entry east</span>
                </div>
                <div className="m-5 rounded-xl bg-night bg-[linear-gradient(to_right,rgba(255,59,31,0.07)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,59,31,0.07)_1px,transparent_1px)] bg-[size:1.5rem_1.5rem] p-4 ring-1 ring-ink/10">
                  <ExamplePlanDrawing plan={EXAMPLE.plan} />
                </div>
                <ul className="flex flex-wrap gap-x-4 gap-y-2 border-t border-ink/10 px-5 py-3 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-light">
                  <li className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-ember/40" />Living</li>
                  <li className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-ember-soft/30" />Service</li>
                  <li className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-ink/15" />Private</li>
                  <li className="flex items-center gap-1.5"><span className="h-0.5 w-3 bg-ember" />Door</li>
                  <li className="flex items-center gap-1.5"><span className="h-1 w-3 border-y border-ink/70 bg-night" />Window</li>
                  <li className="flex items-center gap-1.5"><span className="w-3 border-t border-dashed border-ember-soft" />Open</li>
                </ul>
              </div>

              {/* What happened to it, in order */}
              <ol className="relative flex flex-col gap-4 before:absolute before:bottom-8 before:left-[1.1rem] before:top-8 before:w-px before:bg-gradient-to-b before:from-ember/70 before:via-ember/25 before:to-transparent">
                <ExampleStep n="01" title="The requirements">
                  <ul className="flex flex-wrap gap-1.5">
                    {program.map((line) => (
                      <li key={line} className="rounded-full border border-ink/15 bg-ink/5 px-2.5 py-1 text-[12px] text-graphite-100">{line}</li>
                    ))}
                  </ul>
                </ExampleStep>
                <ExampleStep n="02" title="Rules between rooms">
                  <ul className="flex flex-col gap-2">
                    {rules.map((line) => {
                      const [kind, pair] = line.split(': ')
                      return (
                        <li key={line} className="flex items-center gap-3 text-[13px] text-graphite-100">
                          <span className={`w-28 shrink-0 rounded-full px-2 py-0.5 text-center font-mono text-[10px] uppercase tracking-wide ${RULE_BADGE[kind] ?? ''}`}>{kind}</span>
                          {pair}
                        </li>
                      )
                    })}
                  </ul>
                </ExampleStep>
                <ExampleStep n="03" title="Checked on every edit">
                  <ul className="flex flex-col gap-1.5 text-[13px] text-graphite-100">
                    {CHECKS.map((check) => (
                      <li key={check} className="flex gap-2">
                        <span aria-hidden="true" className="text-ember">✓</span>
                        <span>{check}</span>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-4 flex items-baseline gap-2 border-t border-ink/10 pt-3">
                    <span className="text-4xl font-black leading-none text-ink" style={{ fontStretch: '125%' }}>{EXAMPLE.score}</span>
                    <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted-light">/100 quality score · passed all</span>
                  </p>
                </ExampleStep>
              </ol>
            </div>
          </div>
        </section>

        {/* Features */}
        <section id="features" className="scroll-mt-20 border-t border-ink/5">
          <div className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6">
            <SectionHead eyebrow="In the app today" title="What you get" />
            <FeatureBento />
          </div>
        </section>

        {/* Pricing preview */}
        <section className="border-t border-ink/5">
          <div className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <SectionHead eyebrow="Start free" title="Pricing" lead="Start on Starter for free. Paid plans are not on sale yet." />
              <Link to="/pricing" className="font-mono text-xs uppercase tracking-[0.14em] text-ember-soft underline-offset-4 hover:text-ember hover:underline">
                Compare plans →
              </Link>
            </div>
            <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {PLANS.map((plan) => (
                <PricingCard
                  key={plan.id}
                  plan={plan}
                  cycle="monthly"
                  compact
                  onSelect={() => navigate(startTarget)}
                />
              ))}
            </div>
          </div>
        </section>

        {/* Final CTA: the sunset glow again, rising from the bottom edge */}
        <section className="relative isolate overflow-hidden border-t border-ink/5">
          <div aria-hidden="true" className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_60%_80%_at_50%_110%,rgba(255,59,31,0.35),rgba(122,26,12,0.15)_45%,transparent_75%)]" />
          <div className="mx-auto flex w-full max-w-6xl flex-col items-center gap-5 px-4 py-24 text-center sm:px-6">
            <h2
              className="font-black uppercase leading-[0.95] tracking-tight text-ink [text-wrap:balance]"
              style={{ fontStretch: '125%', fontSize: 'clamp(2rem, 5vw, 3.75rem)' }}
            >
              Start with <span className="text-ember">your own site</span>
            </h2>
            <p className="max-w-md text-sm text-graphite-100">
              Draw a plot or import one and shape it in 3D. The AI is there when you ask for it, never before.
            </p>
            <Link
              to={startTarget}
              className="mt-2 rounded-full bg-ember px-7 py-3.5 text-sm font-bold text-graphite-950 shadow-[0_10px_40px_rgba(255,59,31,0.45)] transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/60"
            >
              Start designing free
            </Link>
          </div>
        </section>
      </main>

      <WebsiteFooter />
    </div>
  )
}

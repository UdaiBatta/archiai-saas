import { Link, useNavigate } from 'react-router-dom'

import { WebsiteNavbar, useStartDesigningTarget } from '../../components/website/WebsiteNavbar'
import { WebsiteFooter } from '../../components/website/WebsiteFooter'
import { AsciiField } from '../../components/website/AsciiField'
import { ExamplePlanDrawing } from '../../components/website/ExamplePlanDrawing'
import { FeatureCard } from '../../components/website/FeatureCard'
import { PricingCard } from '../../components/website/PricingCard'
import { EXAMPLE } from '../../constants/examplePlan'
import { PLANS } from '../../constants/plans'
import { useHashScroll } from '../../hooks/useHashScroll'

// The real sequence a project goes through, in order.
const STEPS = [
  {
    title: 'Write the brief',
    description: 'Plot size, facing, rooms, and how they should relate, in plain language.',
  },
  {
    title: 'Check what was understood',
    description: 'Every room, count and rule is read back before anything is drawn. Fix it or add to it.',
  },
  {
    title: 'Get a checked plan',
    description: 'The plan must meet every “must connect”, keep every room reachable, and respect privacy.',
  },
  {
    title: 'Shape it in 2D and 3D',
    description: 'Move rooms, choose wall, door or opening between them, and save versions as you go.',
  },
]

const FEATURES = [
  {
    title: 'Your brief, read back to you',
    description: 'Rooms, counts, must-connect and keep-apart rules are shown for review before a plan is drawn.',
    icon: <path d="M4 5h16M4 10h16M4 15h10M16 18l2 2 4-4" />,
  },
  {
    title: 'Plans checked against the brief',
    description: 'A broken “must connect”, an unreachable room or a bathroom only reachable through a bedroom is never shown as valid.',
    icon: (
      <>
        <path d="M12 3l7 3v5c0 4.5-3 8.5-7 10-4-1.5-7-5.5-7-10V6z" />
        <path d="M9 12l2 2 4-4" />
      </>
    ),
  },
  {
    title: 'Walls, doors and openings you choose',
    description: 'Between any two rooms: a solid wall, a door you can slide along it, or open plan. Edits stay put.',
    icon: <path d="M4 20V4h16v16M4 12h7M15 12h5M11 12a4 4 0 0 1 4-4" />,
  },
  {
    title: 'Access graph and zoning',
    description: 'See how you walk from the entrance to every room, and how each zone is entered, updated on every change.',
    icon: (
      <>
        <circle cx="5" cy="12" r="2" />
        <circle cx="19" cy="6" r="2" />
        <circle cx="19" cy="18" r="2" />
        <path d="M7 12h5l5-5M12 12l5 5" />
      </>
    ),
  },
  {
    title: '2D plan and 3D model',
    description: 'One plan in both views: real walls with door openings in 3D, and open-plan areas that read as one space.',
    icon: <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9zM12 12l8-4.5M12 12v9M12 12L4 7.5" />,
  },
  {
    title: 'Versions, sharing and export',
    description: 'Named versions and auto-saved drafts, PNG and PDF export, read-only share links, and team workspaces.',
    icon: <path d="M12 3v12M7 10l5 5 5-5M5 21h14" />,
  },
]

/** A hand-drawn arrow accent. */
function HandArrow({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" className={className} fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M90 12 C 80 60 58 82 36 62 C 18 44 38 22 58 32 C 76 42 68 72 46 84" />
      <path d="M62 80 L46 84 L50 68" />
    </svg>
  )
}

const rules = EXAMPLE.understood.filter((line) => /^(Must connect|Prefer nearby|Keep apart)/.test(line))
const program = EXAMPLE.understood.filter((line) => !rules.includes(line))

export default function Landing() {
  const navigate = useNavigate()
  const startTarget = useStartDesigningTarget()
  useHashScroll()

  return (
    <div className="min-h-screen bg-surface text-ink">
      <WebsiteNavbar />

      <main>
        {/* Hero */}
        <section className="relative isolate overflow-hidden border-b border-ink/10">
          <AsciiField className="absolute inset-0 -z-10" />
          <div
            aria-hidden="true"
            className="absolute inset-0 -z-10 bg-[linear-gradient(to_right,rgba(245,245,246,0.05)_1px,transparent_1px),linear-gradient(to_bottom,rgba(245,245,246,0.05)_1px,transparent_1px)] bg-[size:4rem_4rem]"
          />
          <div className="relative mx-auto flex min-h-[min(calc(100svh-3.5rem),56rem)] w-full max-w-6xl flex-col justify-center px-4 py-16 sm:px-6">
            <p className="font-mono text-xs uppercase tracking-[0.2em] text-ember-soft">
              Brief → checked floor plan
            </p>
            <h1
              className="mt-6 font-black uppercase leading-[0.88] tracking-tight text-ink"
              style={{ fontStretch: '125%', fontSize: 'clamp(2.6rem, 7.6vw, 7rem)' }}
            >
              <span className="block text-ember [text-shadow:4px_4px_0_theme(colors.ember.deep),8px_8px_0_rgba(122,26,12,0.55)]">Write the </span>
              <span className="block pl-[8%] [text-shadow:4px_4px_0_theme(colors.ember.deep),8px_8px_0_rgba(122,26,12,0.55)]">brief. </span>
              <span className="block pl-[22%] [text-shadow:4px_4px_0_theme(colors.ember.deep),8px_8px_0_rgba(122,26,12,0.55)]">Get the plan.</span>
            </h1>
            <p className="mt-8 max-w-md text-base leading-relaxed text-graphite-100">
              ArchiAI reads your brief back to you, lays out the rooms, and checks the plan
              against every rule you gave before you see it. Then you shape it in 2D and 3D.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                to={startTarget}
                className="rounded-full bg-ember px-6 py-3 text-sm font-bold text-ink shadow-[0_10px_40px_rgba(255,59,31,0.45)] transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/60"
              >
                Start designing — free
              </Link>
              <Link
                to="/#example"
                className="rounded-full border border-ink/30 bg-graphite-950/40 px-6 py-3 text-sm font-semibold text-ink backdrop-blur transition-colors hover:bg-ink/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/60"
              >
                See a real example
              </Link>
            </div>

            {/* Real checks from the example, floating over the field. */}
            <div className="pointer-events-none absolute inset-0 hidden lg:block" aria-hidden="true">
              <div className="absolute right-[3%] top-[16%] w-56 rotate-[8deg] motion-safe:animate-float">
                <div className="rounded-3xl border border-ink/25 bg-ink/10 p-5 shadow-2xl backdrop-blur-md">
                  <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-ember-soft">Brief understood</p>
                  <ul className="mt-3 space-y-1.5 text-sm font-semibold text-ink">
                    <li>✓ 3 bedrooms · 2 bathrooms</li>
                    <li>✓ 1 dining · 1 pooja room</li>
                    <li>✓ 12 × 15 m · faces east</li>
                  </ul>
                </div>
              </div>
              <div className="absolute bottom-[14%] right-[20%] w-60 -rotate-[6deg] motion-safe:animate-float [animation-delay:1.5s]">
                <div className="rounded-3xl border border-ink/25 bg-ink/10 p-5 shadow-2xl backdrop-blur-md">
                  <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-ember-soft">Plan checked</p>
                  <ul className="mt-3 space-y-1.5 text-sm font-semibold text-ink">
                    <li>✓ Balcony ↔ living room</li>
                    <li>✓ Master bath attached</li>
                    <li>✓ Kitchen away from baths</li>
                  </ul>
                  <p className="mt-3 font-mono text-[11px] text-graphite-200">score {EXAMPLE.score}/100</p>
                </div>
              </div>
              <HandArrow className="absolute bottom-[30%] right-[40%] h-20 w-20 -rotate-[70deg] text-ember" />
            </div>

            <Link
              to={startTarget}
              aria-label="Start designing — free"
              className="absolute bottom-8 right-6 hidden h-32 w-32 sm:block lg:bottom-12 lg:right-10"
            >
              <span className="relative flex h-full w-full rotate-12 items-center justify-center rounded-full bg-ember shadow-[0_12px_40px_rgba(255,59,31,0.5)] transition-transform hover:scale-105">
                <svg viewBox="0 0 100 100" className="absolute inset-1 motion-safe:animate-spin-slow" aria-hidden="true">
                  <path id="badge-ring" d="M 50,50 m -37,0 a 37,37 0 1,1 74,0 a 37,37 0 1,1 -74,0" fill="none" />
                  <text className="fill-ink text-[11px] font-black uppercase">
                    <textPath href="#badge-ring" textLength="228" lengthAdjust="spacing">Start designing • free • </textPath>
                  </text>
                </svg>
                <svg viewBox="0 0 24 24" className="h-9 w-9 text-ink" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M7 17L17 7M17 7H8M17 7v9" />
                </svg>
              </span>
            </Link>
          </div>
        </section>

        {/* How it works */}
        <section id="how-it-works" className="scroll-mt-20 border-y border-ink/5 bg-graphite-850">
          <div className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6">
            <p className="font-mono text-xs uppercase tracking-[0.2em] text-ember">Four steps</p>
            <h2 className="mt-2 text-3xl font-black text-ink" style={{ fontStretch: '115%' }}>How it works</h2>
            <ol className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {STEPS.map((step, index) => (
                <li key={step.title} className="flex flex-col gap-2 rounded-2xl border border-ink/10 bg-graphite-800/70 p-5">
                  <span className="font-black text-4xl leading-none text-ember/80" style={{ fontStretch: '125%' }}>{index + 1}</span>
                  <h3 className="text-sm font-semibold text-ink">{step.title}</h3>
                  <p className="text-sm leading-relaxed text-muted">{step.description}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* The example, in full */}
        <section id="example" className="mx-auto w-full max-w-6xl scroll-mt-20 px-4 py-16 sm:px-6">
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-ember">A real example</p>
          <h2 className="mt-2 text-3xl font-black text-ink" style={{ fontStretch: '115%' }}>One brief, start to finish</h2>
          <p className="mt-2 max-w-2xl text-sm text-muted">
            Real output from ArchiAI for this brief, not a mock-up. Hover a room for its size.
          </p>
          <div className="mt-8 grid items-start gap-6 lg:grid-cols-[1.1fr_1fr]">
            <div className="rounded-3xl border border-ink/10 bg-graphite-850 p-5">
              <p className="text-[13px] leading-relaxed text-muted">
                <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-ember-soft">Brief · </span>
                “{EXAMPLE.brief}”
              </p>
              <div className="mt-4 rounded-2xl bg-graphite-900 p-3">
                <ExamplePlanDrawing plan={EXAMPLE.plan} />
              </div>
            </div>
          <div className="grid gap-4">
            <div className="rounded-2xl border border-ink/10 bg-graphite-800/70 p-5">
              <h3 className="text-sm font-semibold text-ink">1 · What was understood</h3>
              <ul className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 text-[13px] text-muted">
                {program.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </div>
            <div className="rounded-2xl border border-ink/10 bg-graphite-800/70 p-5">
              <h3 className="text-sm font-semibold text-ink">2 · Rules from the brief</h3>
              <ul className="mt-3 flex flex-col gap-1.5 text-[13px] text-muted">
                {rules.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </div>
            <div className="rounded-2xl border border-ink/10 bg-graphite-800/70 p-5">
              <h3 className="text-sm font-semibold text-ink">3 · What the plan was checked for</h3>
              <ul className="mt-3 flex flex-col gap-1.5 text-[13px] text-muted">
                {[
                  'Every room and count from the brief is present',
                  'Every “must connect” is met',
                  'Every room is reachable from the entrance',
                  'No room is reachable only through a bedroom',
                  'No overlaps, rooms at least their minimum size',
                ].map((check) => (
                  <li key={check} className="flex gap-2">
                    <span aria-hidden="true" className="text-ok">✓</span>
                    <span>{check}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 font-mono text-[11px] text-muted-light">
                Passed all · quality score {EXAMPLE.score}/100
              </p>
            </div>
          </div>
          </div>
        </section>

        {/* Features */}
        <section id="features" className="scroll-mt-20 border-y border-ink/5 bg-graphite-850">
          <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6">
            <p className="font-mono text-xs uppercase tracking-[0.2em] text-ember">In the app today</p>
            <h2 className="mt-2 text-3xl font-black text-ink" style={{ fontStretch: '115%' }}>What you get</h2>
            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map((feature) => (
                <FeatureCard key={feature.title} {...feature} />
              ))}
            </div>
          </div>
        </section>

        {/* Pricing preview */}
        <section className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="font-mono text-xs uppercase tracking-[0.2em] text-ember">Start free</p>
              <h2 className="mt-2 text-3xl font-black text-ink" style={{ fontStretch: '115%' }}>Pricing</h2>
              <p className="mt-2 text-sm text-muted">Start on Starter for free. Paid plans are not on sale yet.</p>
            </div>
            <Link to="/pricing" className="text-sm font-semibold text-ink underline-offset-4 hover:underline">
              Compare plans →
            </Link>
          </div>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
        </section>

        {/* Final CTA */}
        <section className="border-t border-ink/5 bg-graphite-850">
          <div className="mx-auto flex w-full max-w-6xl flex-col items-center gap-4 px-4 py-14 text-center sm:px-6">
            <h2 className="text-3xl font-black text-ink" style={{ fontStretch: '115%' }}>Try it with your own brief</h2>
            <p className="max-w-md text-sm text-muted">
              Describe a plot and the rooms you need. You’ll see what was understood before any plan is drawn.
            </p>
            <Link
              to={startTarget}
              className="mt-2 rounded-full bg-ember px-6 py-3 text-sm font-bold text-ink shadow-[0_10px_40px_rgba(255,59,31,0.4)] transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/60"
            >
              Start designing — free
            </Link>
          </div>
        </section>
      </main>

      <WebsiteFooter />
    </div>
  )
}

import { Link, useNavigate } from 'react-router-dom'

import { WebsiteNavbar, useStartDesigningTarget } from '../../components/website/WebsiteNavbar'
import { WebsiteFooter } from '../../components/website/WebsiteFooter'
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
        <section className="mx-auto grid w-full max-w-6xl items-center gap-12 px-4 pb-16 pt-12 sm:px-6 lg:grid-cols-[1fr_1.1fr] lg:pt-20">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.14em] text-muted-light">
              Brief → checked floor plan
            </p>
            <h1 className="mt-4 text-4xl font-extrabold leading-[1.1] tracking-tight text-ink [text-wrap:balance] sm:text-5xl">
              Write the brief. Get a plan that follows it.
            </h1>
            <p className="mt-5 max-w-lg text-base leading-relaxed text-muted">
              ArchiAI reads your brief back to you, lays out the rooms, and checks the plan
              against every rule you gave before you see it. Then you edit it in 2D and 3D.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                to={startTarget}
                className="rounded-lg bg-ink px-5 py-2.5 text-sm font-semibold text-graphite-900 transition-colors hover:bg-graphite-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/40"
              >
                Start designing — free
              </Link>
              <Link
                to="/#example"
                className="rounded-lg border border-ink/15 px-5 py-2.5 text-sm font-semibold text-ink transition-colors hover:bg-ink/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/40"
              >
                See a real example
              </Link>
            </div>
            <p className="mt-4 text-xs text-muted-light">Free to start · No card needed</p>
          </div>

          <div className="rounded-2xl border border-ink/10 bg-graphite-850 p-4 shadow-[0_24px_60px_rgba(0,0,0,0.35)] sm:p-5">
            <p className="text-[13px] leading-relaxed text-muted">
              <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-muted-light">Brief · </span>
              “{EXAMPLE.brief}”
            </p>
            <div className="mt-4 rounded-xl bg-graphite-900 p-3">
              <ExamplePlanDrawing plan={EXAMPLE.plan} />
            </div>
          </div>
        </section>

        {/* How it works */}
        <section id="how-it-works" className="scroll-mt-20 border-y border-ink/5 bg-graphite-850">
          <div className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6">
            <h2 className="text-2xl font-bold text-ink">How it works</h2>
            <ol className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {STEPS.map((step, index) => (
                <li key={step.title} className="flex flex-col gap-2 rounded-2xl border border-ink/10 bg-graphite-800/70 p-5">
                  <span className="font-mono text-xs text-accent-bright">Step {index + 1}</span>
                  <h3 className="text-sm font-semibold text-ink">{step.title}</h3>
                  <p className="text-sm leading-relaxed text-muted">{step.description}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* The example, in full */}
        <section id="example" className="mx-auto w-full max-w-6xl scroll-mt-20 px-4 py-16 sm:px-6">
          <h2 className="text-2xl font-bold text-ink">The example above, step by step</h2>
          <p className="mt-2 max-w-2xl text-sm text-muted">
            This is real output from ArchiAI for the brief shown, not a mock-up.
          </p>
          <div className="mt-8 grid gap-6 lg:grid-cols-3">
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
        </section>

        {/* Features */}
        <section id="features" className="scroll-mt-20 border-y border-ink/5 bg-graphite-850">
          <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6">
            <h2 className="text-2xl font-bold text-ink">What you get</h2>
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
              <h2 className="text-2xl font-bold text-ink">Pricing</h2>
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
            <h2 className="text-2xl font-bold text-ink">Try it with your own brief</h2>
            <p className="max-w-md text-sm text-muted">
              Describe a plot and the rooms you need. You’ll see what was understood before any plan is drawn.
            </p>
            <Link
              to={startTarget}
              className="mt-2 rounded-lg bg-ink px-5 py-2.5 text-sm font-semibold text-graphite-900 hover:bg-graphite-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/40"
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

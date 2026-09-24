import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'

import { WebsiteNavbar, useStartDesigningTarget } from '../../components/website/WebsiteNavbar'
import { WebsiteFooter } from '../../components/website/WebsiteFooter'
import { PricingCard } from '../../components/website/PricingCard'
import {
  PLANS,
  type BillingCycle,
  type PlanDefinition,
} from '../../constants/plans'
import { useHashScroll } from '../../hooks/useHashScroll'

interface ComparisonRow {
  label: string
  values: [string, string, string, string]
}

const COMPARISON_ROWS: ComparisonRow[] = [
  { label: 'Projects', values: ['3', 'Unlimited', 'Unlimited', 'Unlimited'] },
  { label: '2D plan editor', values: ['✓', '✓', '✓', '✓'] },
  { label: '3D editing', values: ['Basic view', 'Advanced', 'Advanced', 'Advanced'] },
  { label: 'Zoning & access graph views', values: ['—', '✓', '✓', '✓'] },
  { label: 'Version history', values: ['—', '✓', '✓', '✓'] },
  { label: 'Team workspaces & roles', values: ['—', '—', '✓', '✓'] },
  { label: 'Activity & audit logs', values: ['—', '—', '✓', '✓'] },
  { label: 'Exports', values: ['PNG', 'PNG + PDF', 'PNG + PDF', 'PNG + PDF'] },
  { label: 'Support', values: ['Community', 'Priority', 'Priority', 'Dedicated'] },
]

export default function PricingPage() {
  const navigate = useNavigate()
  const startTarget = useStartDesigningTarget()
  useHashScroll()
  const [searchParams] = useSearchParams()
  const [cycle, setCycle] = useState<BillingCycle>('monthly')
  const preselected = searchParams.get('plan')

  // Only plans you can actually start on are clickable (see PricingCard).
  const handleSelect = (plan: PlanDefinition) => {
    if (plan.available) navigate(startTarget)
  }

  return (
    <div className="min-h-screen bg-surface text-ink">
      <WebsiteNavbar />

      <main className="mx-auto w-full max-w-6xl px-4 pb-20 pt-12 sm:px-6">
        <div className="text-center">
          <h1 className="text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">
            Plans &amp; Pricing
          </h1>
          <p className="mt-3 text-sm text-muted sm:text-base">
            Start free on Starter. Paid plans are listed so you can see what’s coming; they aren’t on sale yet.
          </p>

          {/* Billing cycle toggle */}
          <div
            role="tablist"
            aria-label="Billing cycle"
            className="mt-7 inline-flex items-center gap-0.5 rounded-lg border border-ink/10 bg-graphite-800 p-1"
          >
            {(['monthly', 'annual'] as const).map((option) => (
              <button
                key={option}
                type="button"
                role="tab"
                aria-selected={cycle === option}
                onClick={() => setCycle(option)}
                className={`rounded-md px-4 py-1.5 text-sm font-semibold capitalize transition-colors ${
                  cycle === option
                    ? 'bg-ink text-graphite-900'
                    : 'text-muted hover:text-ink'
                }`}
              >
                {option}
                {option === 'annual' && (
                  <span className={`ml-1.5 text-[10px] font-medium ${cycle === 'annual' ? 'text-graphite-600' : 'text-ok'}`}>
                    2 months free
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Plan cards */}
        <div className="mt-12 grid items-stretch gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {PLANS.map((plan) => (
            <div
              key={plan.id}
              id={plan.id === 'enterprise' ? 'enterprise' : undefined}
              className={`scroll-mt-24 rounded-2xl ${
                preselected === plan.id ? 'ring-2 ring-ink/40' : ''
              }`}
            >
              <PricingCard plan={plan} cycle={cycle} onSelect={handleSelect} />
            </div>
          ))}
        </div>


        {/* Comparison table */}
        <section className="mt-14">
          <h2 className="text-xl font-bold text-ink">Compare plans</h2>
          <div className="mt-5 overflow-x-auto rounded-2xl border border-ink/10">
            <table className="w-full min-w-[640px] border-collapse text-sm">
              <thead>
                <tr className="bg-graphite-800 text-left">
                  <th className="px-4 py-3 font-semibold text-muted">Feature</th>
                  {PLANS.map((plan) => (
                    <th
                      key={plan.id}
                      className={`px-4 py-3 font-semibold text-ink ${
                        plan.highlighted ? 'bg-ink/5' : ''
                      }`}
                    >
                      {plan.name}
                      {plan.highlighted && (
                        <span className="ml-1.5 align-middle text-[9px] font-bold uppercase tracking-wide text-muted-light">
                          Popular
                        </span>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/5">
                {COMPARISON_ROWS.map((row) => (
                  <tr key={row.label} className="bg-graphite-850/60 transition-colors hover:bg-graphite-800/80">
                    <td className="px-4 py-2.5 text-muted">{row.label}</td>
                    {row.values.map((value, index) => (
                      <td
                        key={PLANS[index].id}
                        className={`px-4 py-2.5 ${value === '—' ? 'text-muted-light' : 'text-ink'} ${
                          PLANS[index].highlighted ? 'bg-ink/5' : ''
                        }`}
                      >
                        {value}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </main>

      <WebsiteFooter />
    </div>
  )
}

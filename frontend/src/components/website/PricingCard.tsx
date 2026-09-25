import { formatPlanPrice, type BillingCycle, type PlanDefinition } from '../../constants/plans'
import { panelClass } from './FeatureBento'

interface PricingCardProps {
  plan: PlanDefinition
  cycle: BillingCycle
  compact?: boolean
  onSelect: (plan: PlanDefinition) => void
}

export function PricingCard({ plan, cycle, compact = false, onSelect }: PricingCardProps) {
  const price = formatPlanPrice(plan, cycle)
  const [amount, per] = price.split('/')

  return (
    <div
      className={`relative flex h-full flex-col p-6 ${panelClass} ${
        plan.highlighted ? 'ring-ember/60 shadow-[0_24px_80px_-24px_rgba(255,59,31,0.45),inset_0_-20px_80px_-20px_rgba(255,59,31,0.2)]' : ''
      }`}
    >
      {plan.highlighted && (
        <span className="absolute -top-2.5 left-5 rounded-full bg-ember px-2.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-graphite-950">
          Most popular
        </span>
      )}
      <h3 className="font-mono text-[11px] uppercase tracking-[0.18em] text-ember">{plan.name}</h3>
      <p className="mt-1 text-xs text-muted-light">{plan.tagline}</p>
      <p className="mt-4 flex items-baseline gap-1 text-ink">
        <span className="text-4xl font-black leading-none" style={{ fontStretch: '125%' }}>{amount}</span>
        {per && <span className="font-mono text-xs text-muted-light">/{per}</span>}
        {per && cycle === 'annual' && (
          <span className="ml-1.5 text-[11px] font-medium text-ok">2 months free</span>
        )}
      </p>
      <ul className={`mt-5 flex flex-col gap-2 border-t border-ink/10 pt-5 ${compact ? '' : 'flex-1'}`}>
        {(compact ? plan.features.slice(0, 4) : plan.features).map((feature) => (
          <li key={feature} className="flex items-start gap-2 text-[13px] text-graphite-100">
            <span aria-hidden="true" className="text-ember">✓</span>
            {feature}
          </li>
        ))}
      </ul>
      <button
        type="button"
        disabled={!plan.available}
        onClick={() => onSelect(plan)}
        className={`mt-6 w-full rounded-full px-3 py-2.5 text-sm font-bold transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/50 disabled:cursor-not-allowed ${
          plan.available
            ? 'bg-ember text-graphite-950 shadow-[0_8px_28px_rgba(255,59,31,0.35)] hover:-translate-y-px'
            : 'border border-dashed border-ink/20 font-mono text-xs font-medium uppercase tracking-[0.14em] text-muted-light'
        }`}
      >
        {plan.available ? plan.cta : 'Coming soon'}
      </button>
    </div>
  )
}

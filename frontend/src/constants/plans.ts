// Pricing catalogue for the marketing pages. Only Starter can be used today;
// paid plans are listed but not on sale until payments are connected
// (backend: /api/billing). Features listed are ones the app actually has.

export type BillingCycle = 'monthly' | 'annual'

export interface PlanDefinition {
  id: string
  name: string
  tagline: string
  /** Monthly price in USD; null = custom/contact sales. */
  priceMonthly: number | null
  /** Annual price in USD (billed yearly); null = custom/contact sales. */
  priceAnnual: number | null
  features: string[]
  highlighted?: boolean
  cta: string
  /** Can someone start on this plan today? */
  available: boolean
}

export const PLANS: PlanDefinition[] = [
  {
    id: 'starter',
    name: 'Starter',
    tagline: 'For trying out ArchiAI',
    priceMonthly: 0,
    priceAnnual: 0,
    features: [
      '3 projects',
      '2D floor plan editor',
      'Basic 3D view',
      'Standard room blocks',
      'PNG export',
      'Community support',
    ],
    cta: 'Start free',
    available: true,
  },
  {
    id: 'pro',
    name: 'Pro',
    tagline: 'For professional designers',
    priceMonthly: 29,
    priceAnnual: 290,
    features: [
      'Unlimited projects',
      'Advanced 3D editing',
      'Zoning & access graph views',
      'Version history',
      'PNG + PDF exports',
      'Priority support',
    ],
    highlighted: true,
    cta: 'Start Pro trial',
    available: false,
  },
  {
    id: 'team',
    name: 'Team',
    tagline: 'For studios and firms',
    priceMonthly: 79,
    priceAnnual: 790,
    features: [
      'Everything in Pro',
      'Team workspaces',
      'Role-based access',
      'Activity & audit logs',
      '5 seats included',
    ],
    cta: 'Start Team trial',
    available: false,
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    tagline: 'For large organizations',
    priceMonthly: null,
    priceAnnual: null,
    features: [
      'Everything in Team',
      'More seats',
      'Dedicated support',
      'Onboarding & training',
    ],
    cta: 'Contact sales',
    available: false,
  },
]

export function planById(planId: string | null | undefined) {
  return PLANS.find((plan) => plan.id === planId) ?? null
}

export function planPrice(plan: PlanDefinition, cycle: BillingCycle) {
  return cycle === 'annual' ? plan.priceAnnual : plan.priceMonthly
}

/** "$29/mo", "$290/yr", "Free", or "Custom". */
export function formatPlanPrice(plan: PlanDefinition, cycle: BillingCycle) {
  const price = planPrice(plan, cycle)
  if (price === null) return 'Custom'
  if (price === 0) return 'Free'
  return `$${price}/${cycle === 'annual' ? 'yr' : 'mo'}`
}

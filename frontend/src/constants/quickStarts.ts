import { EXAMPLE } from './examplePlan'

export interface QuickStart {
  label: string
  brief: string
}

// Example briefs the planner actually handles: homes, using its room types
// (bedrooms, bathrooms, kitchen, living, dining, pooja, study, balcony,
// utility, parking) and a plot size and facing it can check.
export const QUICK_STARTS: QuickStart[] = [
  {
    label: '2BHK flat',
    brief: 'North-facing 2BHK apartment on a 9 x 12 m plot. Master bedroom with an attached bathroom, one more bedroom, a common bathroom, a kitchen next to the dining area, a living room and a balcony off the living room.',
  },
  { label: '3BHK house', brief: EXAMPLE.brief },
  {
    label: '4BHK villa',
    brief: 'South-facing 4BHK villa on a 15 x 18 m plot. Four bedrooms, each with its own bathroom, a study, a kitchen with a utility room, dining and living, a balcony, and parking at the front.',
  },
  {
    label: 'Two-floor duplex',
    brief: 'West-facing duplex on a 12 x 15 m plot over two floors. Ground floor: living, dining, kitchen, a guest bedroom and a bathroom. First floor: master bedroom with an attached bathroom, two bedrooms, a common bathroom and a balcony.',
  },
]

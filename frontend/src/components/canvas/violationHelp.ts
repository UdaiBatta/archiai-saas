/**
 * Plain-language help for the rule engine's hard violations: why a rule
 * exists and what to do about it. Codes are the stable API of
 * backend/app/services/quality/hard_constraints.py.
 */
export interface ViolationHelp {
  why: string
  fix: string
}

const HELP: Record<string, ViolationHelp> = {
  no_daylight: {
    why: 'Bedrooms, living rooms and kitchens need an outside wall for a window: daylight and fresh air are a basic habitability requirement.',
    fix: 'Move the room to the building edge, or swap it with a room that does not need a window (bathroom, store, corridor).',
  },
  outdoor_room_inland: {
    why: 'A balcony, terrace or courtyard only works against the outside of the house; boxed in by rooms it gets no light or air.',
    fix: 'Move it to an outside edge, ideally off the living room.',
  },
  entry_inland: {
    why: 'The entrance needs an outside wall for the front door, ideally on the street side.',
    fix: 'Move the entry or foyer to the street-facing edge.',
  },
  walk_through_room: {
    why: 'Reaching a room only through a bedroom (or another private room) costs privacy and makes the house awkward to use.',
    fix: 'Give the room its own door off a corridor or the living area; a corridor strip often solves it.',
  },
  through_room_access: {
    why: 'The only way to this room is through a private room (someone else’s bedroom), which costs privacy.',
    fix: 'Give it a door from a corridor, hall or living area, or move it next to circulation.',
  },
  unreachable: {
    why: 'Every room must be reachable from the entrance through doors or open connections.',
    fix: 'Add a door to a neighbouring room or corridor, or move the room next to circulation.',
  },
  garage_access: {
    why: 'A garage should not open straight into living spaces (fumes, noise), and needs a way in from the entry, a utility room or outside.',
    fix: 'Put the garage on the street edge, next to the entry or a utility room, and close any door into living rooms or bedrooms.',
  },
  unmet_must_connection: {
    why: 'The brief asked for these two rooms to connect directly.',
    fix: 'Make them share a wall with a door or an open connection (Room program › select the room › Connections).',
  },
  overlap: {
    why: 'Two rooms occupy the same floor area.',
    fix: 'Move or resize one of them until they only share an edge.',
  },
  out_of_bounds: {
    why: 'Part of the room is past the plot line, which planning rules do not allow.',
    fix: 'Move it back inside the plot, or shrink it. Overhangs past the building but inside the plot are fine.',
  },
  below_min_size: {
    why: 'The room is smaller than the minimum usable size for its type.',
    fix: 'Resize it, or take area from an oversized neighbour.',
  },
  missing_requested_room: {
    why: 'The brief asked for a room that is not in the plan.',
    fix: 'Add it back (Room program › + Add a room) or regenerate the layout.',
  },
  staircase_alignment: {
    why: 'A staircase must line up between the floors it connects.',
    fix: 'Place the stair in the same position on every floor.',
  },
}

const FALLBACK: ViolationHelp = {
  why: 'This breaks one of the layout rules the plan is checked against.',
  fix: 'Adjust the rooms named here, or regenerate the layout.',
}

export const violationHelp = (code: string): ViolationHelp => HELP[code] ?? FALLBACK

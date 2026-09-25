// A real ArchiAI result, not a mock-up: the brief below run through
// extraction, program reconciliation and the layout engine (best of 64
// candidates, no hard violations). Regenerate it from the backend if the
// engine changes; see docs/ARCHITECTURE.md.
import type { LayoutPlan } from '../types/contracts'

export interface ExamplePlan {
  brief: string
  understood: string[]
  score: number
  plan: Pick<LayoutPlan, 'plot' | 'rooms' | 'walls' | 'doors' | 'footprint'>
}

export const EXAMPLE: ExamplePlan = {
  "brief": "East-facing 3BHK house on a 12 x 15 m plot. Master bedroom with an attached bathroom, two more bedrooms sharing a common bathroom, a small pooja room, and an open kitchen that flows into the dining and living area. Add a balcony off the living room. Keep the kitchen away from the bathrooms.",
  "understood": [
    "Building: House",
    "1 floor",
    "1 balcony",
    "2 bathrooms",
    "2 bedrooms",
    "1 dining",
    "1 kitchen",
    "1 living room",
    "1 master bedroom",
    "1 pooja room",
    "Plot: 12 × 15 m",
    "Entry faces east",
    "Must connect: balcony ↔ living room",
    "Must connect: master bedroom ↔ bathroom",
    "Prefer nearby: bedroom ↔ bathroom",
    "Prefer nearby: kitchen ↔ dining room",
    "Prefer nearby: kitchen ↔ living room",
    "Keep apart: kitchen ↔ bathroom"
  ],
  "score": 96,
  "plan": {
    "plot": {
      "width_m": 12.0,
      "depth_m": 15.0,
      "facing": "east",
      "boundary": null
    },
    "rooms": [
      {
        "id": "r5",
        "type": "kitchen",
        "label": "Kitchen",
        "x": 8.37,
        "y": 0.362,
        "w": 3.283,
        "h": 4.535,
        "rotation": 0,
        "vertices": null,
        "floor": 0
      },
      {
        "id": "r7",
        "type": "balcony",
        "label": "Balcony",
        "x": 6.729,
        "y": 0.362,
        "w": 1.641,
        "h": 4.535,
        "rotation": 0,
        "vertices": null,
        "floor": 0
      },
      {
        "id": "r6",
        "type": "living_room",
        "label": "Living Room",
        "x": 6.729,
        "y": 4.897,
        "w": 4.924,
        "h": 5.375,
        "rotation": 0,
        "vertices": null,
        "floor": 0
      },
      {
        "id": "r10",
        "type": "dining",
        "label": "Dining",
        "x": 6.729,
        "y": 10.272,
        "w": 4.924,
        "h": 3.167,
        "rotation": 0,
        "vertices": null,
        "floor": 0
      },
      {
        "id": "r11",
        "type": "entry",
        "label": "Entry",
        "x": 6.729,
        "y": 13.439,
        "w": 4.924,
        "h": 1.2,
        "rotation": 0,
        "vertices": null,
        "floor": 0
      },
      {
        "id": "r12",
        "type": "corridor",
        "label": "Corridor",
        "x": 5.423,
        "y": 0.362,
        "w": 1.306,
        "h": 14.277,
        "rotation": 0,
        "vertices": null,
        "floor": 0
      },
      {
        "id": "r1",
        "type": "master_bedroom",
        "label": "Master Bedroom",
        "x": 0.231,
        "y": 0.362,
        "w": 5.192,
        "h": 3.99,
        "rotation": 0,
        "vertices": null,
        "floor": 0
      },
      {
        "id": "r8",
        "type": "bathroom",
        "label": "Bathroom 1",
        "x": 0.231,
        "y": 4.352,
        "w": 2.596,
        "h": 1.868,
        "rotation": 0,
        "vertices": null,
        "floor": 0
      },
      {
        "id": "r9",
        "type": "bathroom",
        "label": "Bathroom 2",
        "x": 2.827,
        "y": 4.352,
        "w": 2.596,
        "h": 1.868,
        "rotation": 0,
        "vertices": null,
        "floor": 0
      },
      {
        "id": "r2",
        "type": "bedroom",
        "label": "Bedroom 1",
        "x": 0.231,
        "y": 6.22,
        "w": 5.192,
        "h": 3.552,
        "rotation": 0,
        "vertices": null,
        "floor": 0
      },
      {
        "id": "r3",
        "type": "bedroom",
        "label": "Bedroom 2",
        "x": 0.231,
        "y": 9.772,
        "w": 5.192,
        "h": 3.552,
        "rotation": 0,
        "vertices": null,
        "floor": 0
      },
      {
        "id": "r4",
        "type": "pooja_room",
        "label": "Pooja Room",
        "x": 0.231,
        "y": 13.324,
        "w": 5.192,
        "h": 1.315,
        "rotation": 0,
        "vertices": null,
        "floor": 0
      }
    ],
    "walls": [
      {
        "id": "w1",
        "x1": 8.37,
        "y1": 0.362,
        "x2": 8.37,
        "y2": 4.897,
        "thickness": 0.115,
        "floor": 0,
        "kind": "wall",
        "rooms": [
          "r5",
          "r7"
        ]
      },
      {
        "id": "w2",
        "x1": 8.37,
        "y1": 4.897,
        "x2": 11.653,
        "y2": 4.897,
        "thickness": 0.115,
        "floor": 0,
        "kind": "open",
        "rooms": [
          "r5",
          "r6"
        ]
      },
      {
        "id": "w3",
        "x1": 6.729,
        "y1": 4.897,
        "x2": 8.37,
        "y2": 4.897,
        "thickness": 0.115,
        "floor": 0,
        "kind": "wall",
        "rooms": [
          "r7",
          "r6"
        ]
      },
      {
        "id": "w4",
        "x1": 6.729,
        "y1": 0.362,
        "x2": 6.729,
        "y2": 4.897,
        "thickness": 0.115,
        "floor": 0,
        "kind": "wall",
        "rooms": [
          "r7",
          "r12"
        ]
      },
      {
        "id": "w5",
        "x1": 6.729,
        "y1": 10.272,
        "x2": 11.653,
        "y2": 10.272,
        "thickness": 0.115,
        "floor": 0,
        "kind": "open",
        "rooms": [
          "r6",
          "r10"
        ]
      },
      {
        "id": "w6",
        "x1": 6.729,
        "y1": 4.897,
        "x2": 6.729,
        "y2": 10.272,
        "thickness": 0.115,
        "floor": 0,
        "kind": "open",
        "rooms": [
          "r6",
          "r12"
        ]
      },
      {
        "id": "w7",
        "x1": 6.729,
        "y1": 13.439,
        "x2": 11.653,
        "y2": 13.439,
        "thickness": 0.115,
        "floor": 0,
        "kind": "open",
        "rooms": [
          "r10",
          "r11"
        ]
      },
      {
        "id": "w8",
        "x1": 6.729,
        "y1": 10.272,
        "x2": 6.729,
        "y2": 13.439,
        "thickness": 0.115,
        "floor": 0,
        "kind": "open",
        "rooms": [
          "r10",
          "r12"
        ]
      },
      {
        "id": "w9",
        "x1": 6.729,
        "y1": 13.439,
        "x2": 6.729,
        "y2": 14.639,
        "thickness": 0.115,
        "floor": 0,
        "kind": "open",
        "rooms": [
          "r11",
          "r12"
        ]
      },
      {
        "id": "w10",
        "x1": 5.423,
        "y1": 0.362,
        "x2": 5.423,
        "y2": 4.352,
        "thickness": 0.115,
        "floor": 0,
        "kind": "wall",
        "rooms": [
          "r12",
          "r1"
        ]
      },
      {
        "id": "w11",
        "x1": 5.423,
        "y1": 4.352,
        "x2": 5.423,
        "y2": 6.22,
        "thickness": 0.115,
        "floor": 0,
        "kind": "wall",
        "rooms": [
          "r12",
          "r9"
        ]
      },
      {
        "id": "w12",
        "x1": 5.423,
        "y1": 6.22,
        "x2": 5.423,
        "y2": 9.772,
        "thickness": 0.115,
        "floor": 0,
        "kind": "wall",
        "rooms": [
          "r12",
          "r2"
        ]
      },
      {
        "id": "w13",
        "x1": 5.423,
        "y1": 9.772,
        "x2": 5.423,
        "y2": 13.324,
        "thickness": 0.115,
        "floor": 0,
        "kind": "wall",
        "rooms": [
          "r12",
          "r3"
        ]
      },
      {
        "id": "w14",
        "x1": 5.423,
        "y1": 13.324,
        "x2": 5.423,
        "y2": 14.639,
        "thickness": 0.115,
        "floor": 0,
        "kind": "wall",
        "rooms": [
          "r12",
          "r4"
        ]
      },
      {
        "id": "w15",
        "x1": 0.231,
        "y1": 4.352,
        "x2": 2.827,
        "y2": 4.352,
        "thickness": 0.115,
        "floor": 0,
        "kind": "wall",
        "rooms": [
          "r1",
          "r8"
        ]
      },
      {
        "id": "w16",
        "x1": 2.827,
        "y1": 4.352,
        "x2": 5.423,
        "y2": 4.352,
        "thickness": 0.115,
        "floor": 0,
        "kind": "wall",
        "rooms": [
          "r1",
          "r9"
        ]
      },
      {
        "id": "w17",
        "x1": 2.827,
        "y1": 4.352,
        "x2": 2.827,
        "y2": 6.22,
        "thickness": 0.115,
        "floor": 0,
        "kind": "wall",
        "rooms": [
          "r8",
          "r9"
        ]
      },
      {
        "id": "w18",
        "x1": 0.231,
        "y1": 6.22,
        "x2": 2.827,
        "y2": 6.22,
        "thickness": 0.115,
        "floor": 0,
        "kind": "wall",
        "rooms": [
          "r8",
          "r2"
        ]
      },
      {
        "id": "w19",
        "x1": 2.827,
        "y1": 6.22,
        "x2": 5.423,
        "y2": 6.22,
        "thickness": 0.115,
        "floor": 0,
        "kind": "wall",
        "rooms": [
          "r9",
          "r2"
        ]
      },
      {
        "id": "w20",
        "x1": 0.231,
        "y1": 9.772,
        "x2": 5.423,
        "y2": 9.772,
        "thickness": 0.115,
        "floor": 0,
        "kind": "wall",
        "rooms": [
          "r2",
          "r3"
        ]
      },
      {
        "id": "w21",
        "x1": 0.231,
        "y1": 13.324,
        "x2": 5.423,
        "y2": 13.324,
        "thickness": 0.115,
        "floor": 0,
        "kind": "wall",
        "rooms": [
          "r3",
          "r4"
        ]
      },
      {
        "id": "w22",
        "x1": 11.653,
        "y1": 0.362,
        "x2": 11.653,
        "y2": 4.897,
        "thickness": 0.115,
        "floor": 0,
        "kind": "wall"
      },
      {
        "id": "w23",
        "x1": 8.37,
        "y1": 0.362,
        "x2": 11.653,
        "y2": 0.362,
        "thickness": 0.115,
        "floor": 0,
        "kind": "wall"
      },
      {
        "id": "w24",
        "x1": 6.729,
        "y1": 0.362,
        "x2": 8.37,
        "y2": 0.362,
        "thickness": 0.115,
        "floor": 0,
        "kind": "wall"
      },
      {
        "id": "w25",
        "x1": 11.653,
        "y1": 4.897,
        "x2": 11.653,
        "y2": 10.272,
        "thickness": 0.115,
        "floor": 0,
        "kind": "wall"
      },
      {
        "id": "w26",
        "x1": 11.653,
        "y1": 10.272,
        "x2": 11.653,
        "y2": 13.439,
        "thickness": 0.115,
        "floor": 0,
        "kind": "wall"
      },
      {
        "id": "w27",
        "x1": 11.653,
        "y1": 13.439,
        "x2": 11.653,
        "y2": 14.639,
        "thickness": 0.115,
        "floor": 0,
        "kind": "wall"
      },
      {
        "id": "w28",
        "x1": 6.729,
        "y1": 14.639,
        "x2": 11.653,
        "y2": 14.639,
        "thickness": 0.115,
        "floor": 0,
        "kind": "wall"
      },
      {
        "id": "w29",
        "x1": 5.423,
        "y1": 0.362,
        "x2": 6.729,
        "y2": 0.362,
        "thickness": 0.115,
        "floor": 0,
        "kind": "wall"
      },
      {
        "id": "w30",
        "x1": 5.423,
        "y1": 14.639,
        "x2": 6.729,
        "y2": 14.639,
        "thickness": 0.115,
        "floor": 0,
        "kind": "wall"
      },
      {
        "id": "w31",
        "x1": 0.231,
        "y1": 0.362,
        "x2": 0.231,
        "y2": 4.352,
        "thickness": 0.115,
        "floor": 0,
        "kind": "wall"
      },
      {
        "id": "w32",
        "x1": 0.231,
        "y1": 0.362,
        "x2": 5.423,
        "y2": 0.362,
        "thickness": 0.115,
        "floor": 0,
        "kind": "wall"
      },
      {
        "id": "w33",
        "x1": 0.231,
        "y1": 4.352,
        "x2": 0.231,
        "y2": 6.22,
        "thickness": 0.115,
        "floor": 0,
        "kind": "wall"
      },
      {
        "id": "w34",
        "x1": 0.231,
        "y1": 6.22,
        "x2": 0.231,
        "y2": 9.772,
        "thickness": 0.115,
        "floor": 0,
        "kind": "wall"
      },
      {
        "id": "w35",
        "x1": 0.231,
        "y1": 9.772,
        "x2": 0.231,
        "y2": 13.324,
        "thickness": 0.115,
        "floor": 0,
        "kind": "wall"
      },
      {
        "id": "w36",
        "x1": 0.231,
        "y1": 13.324,
        "x2": 0.231,
        "y2": 14.639,
        "thickness": 0.115,
        "floor": 0,
        "kind": "wall"
      },
      {
        "id": "w37",
        "x1": 0.231,
        "y1": 14.639,
        "x2": 5.423,
        "y2": 14.639,
        "thickness": 0.115,
        "floor": 0,
        "kind": "wall"
      }
    ],
    "doors": [
      {
        "id": "d1",
        "wall_ref": "w3",
        "offset": 0.37,
        "width": 0.9,
        "floor": 0
      },
      {
        "id": "d2",
        "wall_ref": "w15",
        "offset": 0.848,
        "width": 0.9,
        "floor": 0
      },
      {
        "id": "d3",
        "wall_ref": "w4",
        "offset": 1.818,
        "width": 0.9,
        "floor": 0
      },
      {
        "id": "d4",
        "wall_ref": "w10",
        "offset": 1.545,
        "width": 0.9,
        "floor": 0
      },
      {
        "id": "d5",
        "wall_ref": "w12",
        "offset": 1.326,
        "width": 0.9,
        "floor": 0
      },
      {
        "id": "d6",
        "wall_ref": "w13",
        "offset": 1.326,
        "width": 0.9,
        "floor": 0
      },
      {
        "id": "d7",
        "wall_ref": "w14",
        "offset": 0.207,
        "width": 0.9,
        "floor": 0
      },
      {
        "id": "d8",
        "wall_ref": "w11",
        "offset": 0.484,
        "width": 0.9,
        "floor": 0
      },
      {
        "id": "d9",
        "wall_ref": "w27",
        "offset": 0.15,
        "width": 0.9,
        "floor": 0
      }
    ],
    "footprint": {
      "x": 0.231,
      "y": 0.362,
      "w": 11.422,
      "h": 14.277
    }
  }
}

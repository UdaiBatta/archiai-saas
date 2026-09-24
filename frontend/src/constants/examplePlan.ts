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
  "score": 100,
  "plan": {
    "plot": {
      "width_m": 12.0,
      "depth_m": 15.0,
      "facing": "east",
      "boundary": null
    },
    "footprint": {
      "x": 0.721,
      "y": 1.126,
      "w": 10.198,
      "h": 12.748
    },
    "rooms": [
      {
        "id": "r7",
        "type": "balcony",
        "label": "Balcony",
        "x": 6.515,
        "y": 1.126,
        "w": 4.404,
        "h": 1.35,
        "rotation": 0
      },
      {
        "id": "r6",
        "type": "living_room",
        "label": "Living Room",
        "x": 6.515,
        "y": 2.476,
        "w": 4.404,
        "h": 4.799,
        "rotation": 0
      },
      {
        "id": "r5",
        "type": "kitchen",
        "label": "Kitchen",
        "x": 7.715,
        "y": 7.275,
        "w": 3.204,
        "h": 3.599,
        "rotation": 0
      },
      {
        "id": "r11",
        "type": "entry",
        "label": "Entry",
        "x": 6.515,
        "y": 7.275,
        "w": 1.2,
        "h": 3.599,
        "rotation": 0
      },
      {
        "id": "r10",
        "type": "dining",
        "label": "Dining",
        "x": 6.515,
        "y": 10.874,
        "w": 4.404,
        "h": 3.0,
        "rotation": 0
      },
      {
        "id": "r12",
        "type": "corridor",
        "label": "Corridor",
        "x": 5.307,
        "y": 1.126,
        "w": 1.208,
        "h": 12.748,
        "rotation": 0
      },
      {
        "id": "r1",
        "type": "master_bedroom",
        "label": "Master Bedroom",
        "x": 0.721,
        "y": 1.126,
        "w": 4.586,
        "h": 3.527,
        "rotation": 0
      },
      {
        "id": "r8",
        "type": "bathroom",
        "label": "Bathroom 1",
        "x": 0.721,
        "y": 4.653,
        "w": 2.293,
        "h": 1.621,
        "rotation": 0
      },
      {
        "id": "r9",
        "type": "bathroom",
        "label": "Bathroom 2",
        "x": 3.014,
        "y": 4.653,
        "w": 2.293,
        "h": 1.621,
        "rotation": 0
      },
      {
        "id": "r3",
        "type": "bedroom",
        "label": "Bedroom 2",
        "x": 0.721,
        "y": 6.274,
        "w": 4.586,
        "h": 3.181,
        "rotation": 0
      },
      {
        "id": "r4",
        "type": "pooja_room",
        "label": "Pooja Room",
        "x": 0.721,
        "y": 9.455,
        "w": 4.586,
        "h": 1.238,
        "rotation": 0
      },
      {
        "id": "r2",
        "type": "bedroom",
        "label": "Bedroom 1",
        "x": 0.721,
        "y": 10.693,
        "w": 4.586,
        "h": 3.181,
        "rotation": 0
      }
    ],
    "walls": [
      {
        "id": "w1",
        "x1": 6.515,
        "y1": 2.476,
        "x2": 10.919,
        "y2": 2.476,
        "kind": "wall",
        "rooms": [
          "r7",
          "r6"
        ],
        "thickness": 0.115
      },
      {
        "id": "w2",
        "x1": 6.515,
        "y1": 1.126,
        "x2": 6.515,
        "y2": 2.476,
        "kind": "wall",
        "rooms": [
          "r7",
          "r12"
        ],
        "thickness": 0.115
      },
      {
        "id": "w3",
        "x1": 7.715,
        "y1": 7.275,
        "x2": 10.919,
        "y2": 7.275,
        "kind": "open",
        "rooms": [
          "r6",
          "r5"
        ],
        "thickness": 0.115
      },
      {
        "id": "w4",
        "x1": 6.515,
        "y1": 7.275,
        "x2": 7.715,
        "y2": 7.275,
        "kind": "open",
        "rooms": [
          "r6",
          "r11"
        ],
        "thickness": 0.115
      },
      {
        "id": "w5",
        "x1": 6.515,
        "y1": 2.476,
        "x2": 6.515,
        "y2": 7.275,
        "kind": "open",
        "rooms": [
          "r6",
          "r12"
        ],
        "thickness": 0.115
      },
      {
        "id": "w6",
        "x1": 7.715,
        "y1": 7.275,
        "x2": 7.715,
        "y2": 10.874,
        "kind": "open",
        "rooms": [
          "r5",
          "r11"
        ],
        "thickness": 0.115
      },
      {
        "id": "w7",
        "x1": 7.715,
        "y1": 10.874,
        "x2": 10.919,
        "y2": 10.874,
        "kind": "open",
        "rooms": [
          "r5",
          "r10"
        ],
        "thickness": 0.115
      },
      {
        "id": "w8",
        "x1": 6.515,
        "y1": 10.874,
        "x2": 7.715,
        "y2": 10.874,
        "kind": "open",
        "rooms": [
          "r11",
          "r10"
        ],
        "thickness": 0.115
      },
      {
        "id": "w9",
        "x1": 6.515,
        "y1": 7.275,
        "x2": 6.515,
        "y2": 10.874,
        "kind": "open",
        "rooms": [
          "r11",
          "r12"
        ],
        "thickness": 0.115
      },
      {
        "id": "w10",
        "x1": 6.515,
        "y1": 10.874,
        "x2": 6.515,
        "y2": 13.874,
        "kind": "open",
        "rooms": [
          "r10",
          "r12"
        ],
        "thickness": 0.115
      },
      {
        "id": "w11",
        "x1": 5.307,
        "y1": 1.126,
        "x2": 5.307,
        "y2": 4.653,
        "kind": "wall",
        "rooms": [
          "r12",
          "r1"
        ],
        "thickness": 0.115
      },
      {
        "id": "w12",
        "x1": 5.307,
        "y1": 4.653,
        "x2": 5.307,
        "y2": 6.274,
        "kind": "wall",
        "rooms": [
          "r12",
          "r9"
        ],
        "thickness": 0.115
      },
      {
        "id": "w13",
        "x1": 5.307,
        "y1": 6.274,
        "x2": 5.307,
        "y2": 9.455,
        "kind": "wall",
        "rooms": [
          "r12",
          "r3"
        ],
        "thickness": 0.115
      },
      {
        "id": "w14",
        "x1": 5.307,
        "y1": 9.455,
        "x2": 5.307,
        "y2": 10.693,
        "kind": "wall",
        "rooms": [
          "r12",
          "r4"
        ],
        "thickness": 0.115
      },
      {
        "id": "w15",
        "x1": 5.307,
        "y1": 10.693,
        "x2": 5.307,
        "y2": 13.874,
        "kind": "wall",
        "rooms": [
          "r12",
          "r2"
        ],
        "thickness": 0.115
      },
      {
        "id": "w16",
        "x1": 0.721,
        "y1": 4.653,
        "x2": 3.014,
        "y2": 4.653,
        "kind": "wall",
        "rooms": [
          "r1",
          "r8"
        ],
        "thickness": 0.115
      },
      {
        "id": "w17",
        "x1": 3.014,
        "y1": 4.653,
        "x2": 5.307,
        "y2": 4.653,
        "kind": "wall",
        "rooms": [
          "r1",
          "r9"
        ],
        "thickness": 0.115
      },
      {
        "id": "w18",
        "x1": 3.014,
        "y1": 4.653,
        "x2": 3.014,
        "y2": 6.274,
        "kind": "wall",
        "rooms": [
          "r8",
          "r9"
        ],
        "thickness": 0.115
      },
      {
        "id": "w19",
        "x1": 0.721,
        "y1": 6.274,
        "x2": 3.014,
        "y2": 6.274,
        "kind": "wall",
        "rooms": [
          "r8",
          "r3"
        ],
        "thickness": 0.115
      },
      {
        "id": "w20",
        "x1": 3.014,
        "y1": 6.274,
        "x2": 5.307,
        "y2": 6.274,
        "kind": "wall",
        "rooms": [
          "r9",
          "r3"
        ],
        "thickness": 0.115
      },
      {
        "id": "w21",
        "x1": 0.721,
        "y1": 9.455,
        "x2": 5.307,
        "y2": 9.455,
        "kind": "wall",
        "rooms": [
          "r3",
          "r4"
        ],
        "thickness": 0.115
      },
      {
        "id": "w22",
        "x1": 0.721,
        "y1": 10.693,
        "x2": 5.307,
        "y2": 10.693,
        "kind": "wall",
        "rooms": [
          "r4",
          "r2"
        ],
        "thickness": 0.115
      },
      {
        "id": "w23",
        "x1": 10.919,
        "y1": 1.126,
        "x2": 10.919,
        "y2": 2.476,
        "kind": "wall",
        "thickness": 0.115
      },
      {
        "id": "w24",
        "x1": 6.515,
        "y1": 1.126,
        "x2": 10.919,
        "y2": 1.126,
        "kind": "wall",
        "thickness": 0.115
      },
      {
        "id": "w25",
        "x1": 10.919,
        "y1": 2.476,
        "x2": 10.919,
        "y2": 7.275,
        "kind": "wall",
        "thickness": 0.115
      },
      {
        "id": "w26",
        "x1": 10.919,
        "y1": 7.275,
        "x2": 10.919,
        "y2": 10.874,
        "kind": "wall",
        "thickness": 0.115
      },
      {
        "id": "w27",
        "x1": 10.919,
        "y1": 10.874,
        "x2": 10.919,
        "y2": 13.874,
        "kind": "wall",
        "thickness": 0.115
      },
      {
        "id": "w28",
        "x1": 6.515,
        "y1": 13.874,
        "x2": 10.919,
        "y2": 13.874,
        "kind": "wall",
        "thickness": 0.115
      },
      {
        "id": "w29",
        "x1": 5.307,
        "y1": 1.126,
        "x2": 6.515,
        "y2": 1.126,
        "kind": "wall",
        "thickness": 0.115
      },
      {
        "id": "w30",
        "x1": 5.307,
        "y1": 13.874,
        "x2": 6.515,
        "y2": 13.874,
        "kind": "wall",
        "thickness": 0.115
      },
      {
        "id": "w31",
        "x1": 0.721,
        "y1": 1.126,
        "x2": 0.721,
        "y2": 4.653,
        "kind": "wall",
        "thickness": 0.115
      },
      {
        "id": "w32",
        "x1": 0.721,
        "y1": 1.126,
        "x2": 5.307,
        "y2": 1.126,
        "kind": "wall",
        "thickness": 0.115
      },
      {
        "id": "w33",
        "x1": 0.721,
        "y1": 4.653,
        "x2": 0.721,
        "y2": 6.274,
        "kind": "wall",
        "thickness": 0.115
      },
      {
        "id": "w34",
        "x1": 0.721,
        "y1": 6.274,
        "x2": 0.721,
        "y2": 9.455,
        "kind": "wall",
        "thickness": 0.115
      },
      {
        "id": "w35",
        "x1": 0.721,
        "y1": 9.455,
        "x2": 0.721,
        "y2": 10.693,
        "kind": "wall",
        "thickness": 0.115
      },
      {
        "id": "w36",
        "x1": 0.721,
        "y1": 10.693,
        "x2": 0.721,
        "y2": 13.874,
        "kind": "wall",
        "thickness": 0.115
      },
      {
        "id": "w37",
        "x1": 0.721,
        "y1": 13.874,
        "x2": 5.307,
        "y2": 13.874,
        "kind": "wall",
        "thickness": 0.115
      }
    ],
    "doors": [
      {
        "id": "d1",
        "wall_ref": "w16",
        "offset": 0.697,
        "width": 0.9
      },
      {
        "id": "d2",
        "wall_ref": "w1",
        "offset": 1.752,
        "width": 0.9
      },
      {
        "id": "d3",
        "wall_ref": "w12",
        "offset": 0.36,
        "width": 0.9
      },
      {
        "id": "d4",
        "wall_ref": "w11",
        "offset": 1.314,
        "width": 0.9
      },
      {
        "id": "d5",
        "wall_ref": "w15",
        "offset": 1.14,
        "width": 0.9
      },
      {
        "id": "d6",
        "wall_ref": "w13",
        "offset": 1.141,
        "width": 0.9
      },
      {
        "id": "d7",
        "wall_ref": "w14",
        "offset": 0.169,
        "width": 0.9
      },
      {
        "id": "d8",
        "wall_ref": "w25",
        "offset": 1.949,
        "width": 0.9
      }
    ]
  }
}

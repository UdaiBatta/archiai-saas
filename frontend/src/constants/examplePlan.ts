// A real ArchiAI result, not a mock-up: the brief below run through
// extraction, program reconciliation and the layout engine (best of 64
// candidates, no hard violations). Regenerate it from the backend if the
// engine changes; see docs/ARCHITECTURE.md.
import type { LayoutPlan } from '../types/contracts'

export interface ExamplePlan {
  brief: string
  understood: string[]
  score: number
  plan: Pick<LayoutPlan, 'plot' | 'rooms' | 'walls' | 'doors' | 'windows' | 'footprint'>
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
        "id": "r11",
        "type": "entry",
        "label": "Entry",
        "x": 9.157,
        "y": 1.126,
        "w": 1.762,
        "h": 2.25,
        "rotation": 0,
        "vertices": null,
        "floor": 0
      },
      {
        "id": "r7",
        "type": "balcony",
        "label": "Balcony",
        "x": 6.515,
        "y": 1.126,
        "w": 2.642,
        "h": 2.25,
        "rotation": 0,
        "vertices": null,
        "floor": 0
      },
      {
        "id": "r6",
        "type": "living_room",
        "label": "Living Room",
        "x": 6.515,
        "y": 3.376,
        "w": 4.404,
        "h": 4.799,
        "rotation": 0,
        "vertices": null,
        "floor": 0
      },
      {
        "id": "r10",
        "type": "dining",
        "label": "Dining",
        "x": 6.515,
        "y": 8.175,
        "w": 4.404,
        "h": 2.999,
        "rotation": 0,
        "vertices": null,
        "floor": 0
      },
      {
        "id": "r5",
        "type": "kitchen",
        "label": "Kitchen",
        "x": 6.515,
        "y": 11.174,
        "w": 4.404,
        "h": 2.7,
        "rotation": 0,
        "vertices": null,
        "floor": 0
      },
      {
        "id": "r12",
        "type": "corridor",
        "label": "Corridor",
        "x": 5.307,
        "y": 1.126,
        "w": 1.208,
        "h": 12.748,
        "rotation": 0,
        "vertices": null,
        "floor": 0
      },
      {
        "id": "r4",
        "type": "pooja_room",
        "label": "Pooja Room",
        "x": 0.721,
        "y": 1.126,
        "w": 4.586,
        "h": 1.238,
        "rotation": 0,
        "vertices": null,
        "floor": 0
      },
      {
        "id": "r3",
        "type": "bedroom",
        "label": "Bedroom 2",
        "x": 0.721,
        "y": 2.364,
        "w": 4.586,
        "h": 3.181,
        "rotation": 0,
        "vertices": null,
        "floor": 0
      },
      {
        "id": "r1",
        "type": "master_bedroom",
        "label": "Master Bedroom",
        "x": 0.721,
        "y": 5.545,
        "w": 4.586,
        "h": 3.527,
        "rotation": 0,
        "vertices": null,
        "floor": 0
      },
      {
        "id": "r8",
        "type": "bathroom",
        "label": "Bathroom 1",
        "x": 0.721,
        "y": 9.072,
        "w": 2.293,
        "h": 1.621,
        "rotation": 0,
        "vertices": null,
        "floor": 0
      },
      {
        "id": "r9",
        "type": "bathroom",
        "label": "Bathroom 2",
        "x": 3.014,
        "y": 9.072,
        "w": 2.293,
        "h": 1.621,
        "rotation": 0,
        "vertices": null,
        "floor": 0
      },
      {
        "id": "r2",
        "type": "bedroom",
        "label": "Bedroom 1",
        "x": 0.721,
        "y": 10.693,
        "w": 4.586,
        "h": 3.181,
        "rotation": 0,
        "vertices": null,
        "floor": 0
      }
    ],
    "walls": [
      {
        "id": "w1",
        "x1": 9.157,
        "y1": 1.126,
        "x2": 9.157,
        "y2": 3.376,
        "thickness": 0.115,
        "floor": 0,
        "kind": "wall",
        "rooms": [
          "r11",
          "r7"
        ]
      },
      {
        "id": "w2",
        "x1": 9.157,
        "y1": 3.376,
        "x2": 10.919,
        "y2": 3.376,
        "thickness": 0.115,
        "floor": 0,
        "kind": "open",
        "rooms": [
          "r11",
          "r6"
        ]
      },
      {
        "id": "w3",
        "x1": 6.515,
        "y1": 3.376,
        "x2": 9.157,
        "y2": 3.376,
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
        "x1": 6.515,
        "y1": 1.126,
        "x2": 6.515,
        "y2": 3.376,
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
        "x1": 6.515,
        "y1": 8.175,
        "x2": 10.919,
        "y2": 8.175,
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
        "x1": 6.515,
        "y1": 3.376,
        "x2": 6.515,
        "y2": 8.175,
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
        "x1": 6.515,
        "y1": 11.174,
        "x2": 10.919,
        "y2": 11.174,
        "thickness": 0.115,
        "floor": 0,
        "kind": "open",
        "rooms": [
          "r10",
          "r5"
        ]
      },
      {
        "id": "w8",
        "x1": 6.515,
        "y1": 8.175,
        "x2": 6.515,
        "y2": 11.174,
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
        "x1": 6.515,
        "y1": 11.174,
        "x2": 6.515,
        "y2": 13.874,
        "thickness": 0.115,
        "floor": 0,
        "kind": "open",
        "rooms": [
          "r5",
          "r12"
        ]
      },
      {
        "id": "w10",
        "x1": 5.307,
        "y1": 1.126,
        "x2": 5.307,
        "y2": 2.364,
        "thickness": 0.115,
        "floor": 0,
        "kind": "wall",
        "rooms": [
          "r12",
          "r4"
        ]
      },
      {
        "id": "w11",
        "x1": 5.307,
        "y1": 2.364,
        "x2": 5.307,
        "y2": 5.545,
        "thickness": 0.115,
        "floor": 0,
        "kind": "wall",
        "rooms": [
          "r12",
          "r3"
        ]
      },
      {
        "id": "w12",
        "x1": 5.307,
        "y1": 5.545,
        "x2": 5.307,
        "y2": 9.072,
        "thickness": 0.115,
        "floor": 0,
        "kind": "wall",
        "rooms": [
          "r12",
          "r1"
        ]
      },
      {
        "id": "w13",
        "x1": 5.307,
        "y1": 9.072,
        "x2": 5.307,
        "y2": 10.693,
        "thickness": 0.115,
        "floor": 0,
        "kind": "wall",
        "rooms": [
          "r12",
          "r9"
        ]
      },
      {
        "id": "w14",
        "x1": 5.307,
        "y1": 10.693,
        "x2": 5.307,
        "y2": 13.874,
        "thickness": 0.115,
        "floor": 0,
        "kind": "wall",
        "rooms": [
          "r12",
          "r2"
        ]
      },
      {
        "id": "w15",
        "x1": 0.721,
        "y1": 2.364,
        "x2": 5.307,
        "y2": 2.364,
        "thickness": 0.115,
        "floor": 0,
        "kind": "wall",
        "rooms": [
          "r4",
          "r3"
        ]
      },
      {
        "id": "w16",
        "x1": 0.721,
        "y1": 5.545,
        "x2": 5.307,
        "y2": 5.545,
        "thickness": 0.115,
        "floor": 0,
        "kind": "wall",
        "rooms": [
          "r3",
          "r1"
        ]
      },
      {
        "id": "w17",
        "x1": 0.721,
        "y1": 9.072,
        "x2": 3.014,
        "y2": 9.072,
        "thickness": 0.115,
        "floor": 0,
        "kind": "wall",
        "rooms": [
          "r1",
          "r8"
        ]
      },
      {
        "id": "w18",
        "x1": 3.014,
        "y1": 9.072,
        "x2": 5.307,
        "y2": 9.072,
        "thickness": 0.115,
        "floor": 0,
        "kind": "wall",
        "rooms": [
          "r1",
          "r9"
        ]
      },
      {
        "id": "w19",
        "x1": 3.014,
        "y1": 9.072,
        "x2": 3.014,
        "y2": 10.693,
        "thickness": 0.115,
        "floor": 0,
        "kind": "wall",
        "rooms": [
          "r8",
          "r9"
        ]
      },
      {
        "id": "w20",
        "x1": 0.721,
        "y1": 10.693,
        "x2": 3.014,
        "y2": 10.693,
        "thickness": 0.115,
        "floor": 0,
        "kind": "wall",
        "rooms": [
          "r8",
          "r2"
        ]
      },
      {
        "id": "w21",
        "x1": 3.014,
        "y1": 10.693,
        "x2": 5.307,
        "y2": 10.693,
        "thickness": 0.115,
        "floor": 0,
        "kind": "wall",
        "rooms": [
          "r9",
          "r2"
        ]
      },
      {
        "id": "w22",
        "x1": 10.919,
        "y1": 1.126,
        "x2": 10.919,
        "y2": 3.376,
        "thickness": 0.115,
        "floor": 0,
        "kind": "wall"
      },
      {
        "id": "w23",
        "x1": 9.157,
        "y1": 1.126,
        "x2": 10.919,
        "y2": 1.126,
        "thickness": 0.115,
        "floor": 0,
        "kind": "wall"
      },
      {
        "id": "w24",
        "x1": 6.515,
        "y1": 1.126,
        "x2": 9.157,
        "y2": 1.126,
        "thickness": 0.115,
        "floor": 0,
        "kind": "wall"
      },
      {
        "id": "w25",
        "x1": 10.919,
        "y1": 3.376,
        "x2": 10.919,
        "y2": 8.175,
        "thickness": 0.115,
        "floor": 0,
        "kind": "wall"
      },
      {
        "id": "w26",
        "x1": 10.919,
        "y1": 8.175,
        "x2": 10.919,
        "y2": 11.174,
        "thickness": 0.115,
        "floor": 0,
        "kind": "wall"
      },
      {
        "id": "w27",
        "x1": 10.919,
        "y1": 11.174,
        "x2": 10.919,
        "y2": 13.874,
        "thickness": 0.115,
        "floor": 0,
        "kind": "wall"
      },
      {
        "id": "w28",
        "x1": 6.515,
        "y1": 13.874,
        "x2": 10.919,
        "y2": 13.874,
        "thickness": 0.115,
        "floor": 0,
        "kind": "wall"
      },
      {
        "id": "w29",
        "x1": 5.307,
        "y1": 1.126,
        "x2": 6.515,
        "y2": 1.126,
        "thickness": 0.115,
        "floor": 0,
        "kind": "wall"
      },
      {
        "id": "w30",
        "x1": 5.307,
        "y1": 13.874,
        "x2": 6.515,
        "y2": 13.874,
        "thickness": 0.115,
        "floor": 0,
        "kind": "wall"
      },
      {
        "id": "w31",
        "x1": 0.721,
        "y1": 1.126,
        "x2": 0.721,
        "y2": 2.364,
        "thickness": 0.115,
        "floor": 0,
        "kind": "wall"
      },
      {
        "id": "w32",
        "x1": 0.721,
        "y1": 1.126,
        "x2": 5.307,
        "y2": 1.126,
        "thickness": 0.115,
        "floor": 0,
        "kind": "wall"
      },
      {
        "id": "w33",
        "x1": 0.721,
        "y1": 2.364,
        "x2": 0.721,
        "y2": 5.545,
        "thickness": 0.115,
        "floor": 0,
        "kind": "wall"
      },
      {
        "id": "w34",
        "x1": 0.721,
        "y1": 5.545,
        "x2": 0.721,
        "y2": 9.072,
        "thickness": 0.115,
        "floor": 0,
        "kind": "wall"
      },
      {
        "id": "w35",
        "x1": 0.721,
        "y1": 9.072,
        "x2": 0.721,
        "y2": 10.693,
        "thickness": 0.115,
        "floor": 0,
        "kind": "wall"
      },
      {
        "id": "w36",
        "x1": 0.721,
        "y1": 10.693,
        "x2": 0.721,
        "y2": 13.874,
        "thickness": 0.115,
        "floor": 0,
        "kind": "wall"
      },
      {
        "id": "w37",
        "x1": 0.721,
        "y1": 13.874,
        "x2": 5.307,
        "y2": 13.874,
        "thickness": 0.115,
        "floor": 0,
        "kind": "wall"
      }
    ],
    "doors": [
      {
        "id": "d1",
        "wall_ref": "w3",
        "offset": 0.871,
        "width": 0.9,
        "floor": 0
      },
      {
        "id": "d2",
        "wall_ref": "w17",
        "offset": 0.697,
        "width": 0.9,
        "floor": 0
      },
      {
        "id": "d3",
        "wall_ref": "w4",
        "offset": 0.675,
        "width": 0.9,
        "floor": 0
      },
      {
        "id": "d4",
        "wall_ref": "w12",
        "offset": 1.314,
        "width": 0.9,
        "floor": 0
      },
      {
        "id": "d5",
        "wall_ref": "w14",
        "offset": 1.14,
        "width": 0.9,
        "floor": 0
      },
      {
        "id": "d6",
        "wall_ref": "w11",
        "offset": 1.14,
        "width": 0.9,
        "floor": 0
      },
      {
        "id": "d7",
        "wall_ref": "w10",
        "offset": 0.169,
        "width": 0.9,
        "floor": 0
      },
      {
        "id": "d8",
        "wall_ref": "w13",
        "offset": 0.361,
        "width": 0.9,
        "floor": 0
      },
      {
        "id": "d9",
        "wall_ref": "w22",
        "offset": 0.675,
        "width": 0.9,
        "floor": 0
      }
    ],
    "windows": [
      {
        "id": "win1",
        "wall_ref": "w25",
        "offset": 1.5,
        "width": 1.8,
        "floor": 0
      },
      {
        "id": "win2",
        "wall_ref": "w26",
        "offset": 0.749,
        "width": 1.5,
        "floor": 0
      },
      {
        "id": "win3",
        "wall_ref": "w28",
        "offset": 1.602,
        "width": 1.2,
        "floor": 0
      },
      {
        "id": "win4",
        "wall_ref": "w33",
        "offset": 0.84,
        "width": 1.5,
        "floor": 0
      },
      {
        "id": "win5",
        "wall_ref": "w34",
        "offset": 1.014,
        "width": 1.5,
        "floor": 0
      },
      {
        "id": "win6",
        "wall_ref": "w35",
        "offset": 0.511,
        "width": 0.6,
        "floor": 0
      },
      {
        "id": "win7",
        "wall_ref": "w37",
        "offset": 1.543,
        "width": 1.5,
        "floor": 0
      }
    ],
    "footprint": {
      "x": 0.721,
      "y": 1.126,
      "w": 10.198,
      "h": 12.748
    }
  }
}

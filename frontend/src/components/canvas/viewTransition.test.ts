import * as THREE from 'three'
import { describe, expect, it } from 'vitest'

import { TRANSITION_MS, burstAmount, explodeOffset, poseOf, progressAt, smoother, swingFrame, type CameraPose } from './viewTransition'

const center = { x: 0, z: 0 }

describe('the 3D <-> Top burst', () => {
  it('starts and ends with every room at home', () => {
    for (const room of [{ x: 0, z: 0 }, { x: 6, z: 2 }, { x: -3, z: -4 }]) {
      for (const t of [0, 1]) for (const v of explodeOffset(room, center, 12, t)) expect(v).toBeCloseTo(0, 9)
    }
  })

  it('pushes a room away from the centre and up while the camera swings, outer rooms further', () => {
    const [dx, dy, dz] = explodeOffset({ x: 4, z: 0 }, center, 12, 0.5)
    expect(dx).toBeGreaterThan(0)
    expect(dz).toBeCloseTo(0)
    expect(dy).toBeGreaterThan(0)
    expect(explodeOffset({ x: 6, z: 0 }, center, 12, 0.5)[0]).toBeGreaterThan(explodeOffset({ x: 2, z: 0 }, center, 12, 0.5)[0])
  })

  it('holds fully apart through the middle and moves smoothly at the ends', () => {
    expect(burstAmount(0.4)).toBe(1)
    expect(burstAmount(0.6)).toBe(1)
    expect(burstAmount(0.01)).toBeLessThan(0.01)
    expect(smoother(0)).toBe(0)
    expect(smoother(1)).toBe(1)
    expect(smoother(0.5)).toBeCloseTo(0.5)
  })

  it('runs for its fixed time, clamped', () => {
    expect(progressAt(1000, 1000 + TRANSITION_MS / 2)).toBeCloseTo(0.5)
    expect(progressAt(1000, 1000 + TRANSITION_MS * 2)).toBe(1)
    expect(progressAt(1000, 900)).toBe(0)
  })
})

describe('the camera swing', () => {
  const ortho = new THREE.OrthographicCamera(-500, 500, 400, -400, 0.1, 2000)
  ortho.position.set(30, 30, 30)
  ortho.zoom = 40
  const axo = poseOf(ortho, new THREE.Vector3(0, 0, 0), 800)
  const top: CameraPose = { target: new THREE.Vector3(2, 0, 1), direction: new THREE.Vector3(0, 1, 0.0005).normalize(), height: 24, fov: null }

  it('reads an orthographic camera as the world height it shows', () => {
    expect(axo.height).toBeCloseTo(20)
    expect(axo.fov).toBeNull()
  })

  it('starts on the first view and lands on the second', () => {
    const start = swingFrame(axo, top, 0)
    expect(start.position.clone().normalize().angleTo(axo.direction)).toBeCloseTo(0, 5)
    const end = swingFrame(axo, top, 1)
    const along = end.position.clone().sub(top.target).normalize()
    expect(along.angleTo(top.direction)).toBeCloseTo(0, 5)
    // The same world height in frame at the end as the plan will show.
    const shown = 2 * end.position.distanceTo(top.target) * Math.tan(THREE.MathUtils.degToRad(end.fov) / 2)
    expect(shown).toBeCloseTo(top.height)
  })

  it('lands turned exactly as the plan camera is (north up), with no spin at the end', () => {
    const plan = new THREE.PerspectiveCamera()
    plan.position.copy(top.target).addScaledVector(top.direction, 10)
    plan.lookAt(top.target)
    const screenUp = (q: THREE.Quaternion) => new THREE.Vector3(0, 1, 0).applyQuaternion(q)
    expect(screenUp(swingFrame(axo, top, 1).quaternion).angleTo(screenUp(plan.quaternion))).toBeCloseTo(0, 4)
    // Just before landing it is already nearly there (the old version spun ~45 degrees here).
    expect(screenUp(swingFrame(axo, top, 0.95).quaternion).angleTo(screenUp(plan.quaternion))).toBeLessThan(0.05)
  })

  it('opens the lens mid-swing, so the plan visibly tips up in perspective', () => {
    expect(swingFrame(axo, top, 0.5).fov).toBeGreaterThan(swingFrame(axo, top, 0).fov + 20)
  })
})

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { violationHelp } from './violationHelp'

describe('violationHelp', () => {
  it('explains every hard-rule code the backend can emit', () => {
    const source = readFileSync(resolve(__dirname, '../../../../backend/app/services/quality/hard_constraints.py'), 'utf8')
    const codes = [...new Set([...source.matchAll(/code="([a-z_]+)"/g)].map((m) => m[1]))]
    expect(codes.length).toBeGreaterThan(10)
    const fallback = violationHelp('__none__')
    for (const code of codes) expect(violationHelp(code), code).not.toBe(fallback)
  })
})

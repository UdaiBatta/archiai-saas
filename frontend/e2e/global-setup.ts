import { randomBytes } from 'node:crypto'
import { chromium, type FullConfig } from '@playwright/test'

/**
 * One test account per run (registration is rate limited to 5 per minute per
 * IP, so tests share it). It is created through the API and signed in through
 * the real login form; the session is saved for every test to reuse.
 */
export default async function globalSetup(config: FullConfig) {
  const { baseURL, channel, launchOptions } = config.projects[0].use
  const run = randomBytes(4).toString('hex')
  const email = `e2e-${run}@example.com`
  const password = `pw-${randomBytes(9).toString('hex')}`

  const registered = await fetch('http://localhost:8001/api/auth/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'E2E Tester', email, password }),
  })
  if (!registered.ok) throw new Error(`E2E registration failed: ${registered.status} ${await registered.text()}`)

  const browser = await chromium.launch({ channel, ...launchOptions })
  const page = await browser.newPage({ baseURL })
  await page.goto('/login')
  await page.getByLabel(/email/i).fill(email)
  await page.getByLabel(/password/i).fill(password)
  await page.getByRole('button', { name: /log in|sign in/i }).click()
  await page.waitForURL('**/projects')
  await page.context().storageState({ path: 'e2e/.auth/user.json' })
  await browser.close()
}

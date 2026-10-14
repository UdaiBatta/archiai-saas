/**
 * A tiny OpenAI-compatible server standing in for the real LLM during E2E
 * runs, so the app, backend and database under test are real but the model is
 * deterministic. It answers the two calls the backend makes:
 *
 *   GET  /v1/models            model discovery
 *   POST /v1/chat/completions  one JSON object per request
 *
 * It reads the real assistant system prompt (the rooms table it lists), so a
 * change to that prompt's format fails an E2E test instead of passing against
 * a stale mock. Supported instructions:
 *
 *   "Rename the <type or label> to <new name>"  -> one rename_room command
 *   anything else                               -> one explain command
 */
import { createServer } from 'node:http'

const PORT = Number(process.env.E2E_LLM_PORT || 4010)
const NO_ARGS = { room_id: null, a: null, b: null, w: null, h: null, dx: null, dy: null, label: null, kind: null, add: null, remove: null, text: null }

function roomsFrom(system) {
  // "Rooms (id | type | label | floor | x, y | w x h):" then one row per room.
  const start = system.indexOf('Rooms (id | type | label')
  if (start < 0) return []
  return system
    .slice(system.indexOf('\n', start) + 1)
    .split('\n')
    .map((line) => line.split('|').map((part) => part.trim()))
    .filter((cells) => cells.length >= 3 && cells[0] && !cells[0].startsWith('Quality'))
    .map(([id, type, label]) => ({ id, type, label }))
}

function answer(system, instruction) {
  const rename = /^rename the (.+?) to (.+)$/i.exec(instruction.trim())
  if (rename) {
    const wanted = rename[1].toLowerCase().replace(/ /g, '_')
    const room = roomsFrom(system).find((r) => r.type === wanted || r.label.toLowerCase() === rename[1].toLowerCase())
    if (room) {
      return { summary: `Rename ${room.label} to ${rename[2]}.`, commands: [{ ...NO_ARGS, op: 'rename_room', room_id: room.id, label: rename[2] }] }
    }
  }
  return { summary: 'This is a question.', commands: [{ ...NO_ARGS, op: 'explain', text: 'The fake model has nothing to add.' }] }
}

const server = createServer((req, res) => {
  const send = (status, body) => {
    res.writeHead(status, { 'content-type': 'application/json' })
    res.end(JSON.stringify(body))
  }
  if (req.method === 'GET' && req.url === '/v1/models') return send(200, { data: [{ id: 'e2e-fake-model' }] })
  if (req.method === 'GET' && req.url === '/health') return send(200, { ok: true })
  if (req.method === 'POST' && req.url === '/v1/chat/completions') {
    let raw = ''
    req.on('data', (chunk) => (raw += chunk))
    req.on('end', () => {
      const { messages = [] } = JSON.parse(raw || '{}')
      const system = messages.find((m) => m.role === 'system')?.content ?? ''
      const user = messages.find((m) => m.role === 'user')?.content ?? ''
      send(200, { choices: [{ message: { role: 'assistant', content: JSON.stringify(answer(system, user)) } }] })
    })
    return
  }
  send(404, { error: 'not found' })
})

server.listen(PORT, '127.0.0.1', () => console.log(`fake LLM on http://127.0.0.1:${PORT}`))

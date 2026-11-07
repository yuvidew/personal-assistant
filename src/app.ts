import { Hono } from 'hono'
import { tasks, runs } from '@trigger.dev/sdk'
import type { testAiText } from './trigger/test-ai.js'

const app = new Hono()

app.get('/', (c) => {
  return c.json({
    "message" : "Hello hone + Railway"
  })
})

app.get('/marco', (c) => c.text('polo'))

// TEMPORARY public test route: runs AI text generation via a Trigger.dev task.
// Remove this route (and src/trigger/test-ai.ts) when done testing.
app.get('/test/ai', async (c) => {
  const prompt = c.req.query('prompt') ?? 'Write a one-sentence fun fact about space.'
  try {
    const handle = await tasks.trigger<typeof testAiText>('test-ai-text', { prompt })
    const run = await runs.poll(handle, { pollIntervalMs: 1000 })
    if (run.status !== 'COMPLETED') {
      return c.json({ error: `Run ${run.status}`, runId: run.id }, 502)
    }
    return c.json({ runId: run.id, prompt, text: run.output?.text })
  } catch (err) {
    console.error('test/ai failed', err)
    return c.json({ error: 'Failed to generate text' }, 500)
  }
})

export default app

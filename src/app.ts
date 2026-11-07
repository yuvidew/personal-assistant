import { Hono } from 'hono'
import { timingSafeEqual } from 'node:crypto'
import { generateText } from 'ai'
import { model } from './ai.js'
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

type TelegramUpdate = {
  update_id: number
  message?: {
    message_id: number
    chat: { id: number }
    text?: string
  }
}

const safeEqual = (a: string, b: string) => {
  const ab = Buffer.from(a)
  const bb = Buffer.from(b)
  return ab.length === bb.length && timingSafeEqual(ab, bb)
}

const telegram = (method: string, body: unknown) =>
  fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })

// Telegram webhook: replies with an AI-generated response
app.post('/telegram/webhook', async (c) => {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET
  const header = c.req.header('X-Telegram-Bot-Api-Secret-Token') ?? ''
  if (!secret || !safeEqual(header, secret)) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  const update = await c.req.json<TelegramUpdate>()
  const msg = update.message
  if (msg) {
    let text = "I can only read text messages for now."
    if (msg.text) {
      try {
        const result = await generateText({
          model,
          system: 'You are a helpful personal assistant on Telegram. Keep replies concise.',
          prompt: msg.text
        })
        // Telegram caps messages at 4096 characters
        text = result.text.slice(0, 4096) || '...'
      } catch (err) {
        console.error('AI generation failed', err)
        text = 'Sorry, something went wrong. Please try again.'
      }
    }
    const res = await telegram('sendMessage', { chat_id: msg.chat.id, text })
    if (!res.ok) console.error('Telegram API error', res.status, await res.text())
  }

  // Always 200 so Telegram doesn't retry
  return c.json({ ok: true })
})

export default app

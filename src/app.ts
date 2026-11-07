import { Hono } from 'hono'
import { timingSafeEqual } from 'node:crypto'

const app = new Hono()

app.get('/', (c) => {
  return c.json({
    "message" : "Hello hone + Railway"
  })
})

app.get('/marco', (c) => c.text('polo'))

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

// Telegram webhook: echoes back whatever the user sent
app.post('/telegram/webhook', async (c) => {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET
  const header = c.req.header('X-Telegram-Bot-Api-Secret-Token') ?? ''
  if (!secret || !safeEqual(header, secret)) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  const update = await c.req.json<TelegramUpdate>()
  const msg = update.message
  if (msg) {
    // Text -> sendMessage; anything else (photo, sticker, voice...) -> copyMessage
    const res = msg.text
      ? await telegram('sendMessage', { chat_id: msg.chat.id, text: msg.text })
      : await telegram('copyMessage', {
          chat_id: msg.chat.id,
          from_chat_id: msg.chat.id,
          message_id: msg.message_id
        })
    if (!res.ok) console.error('Telegram API error', res.status, await res.text())
  }

  // Always 200 so Telegram doesn't retry
  return c.json({ ok: true })
})

export default app

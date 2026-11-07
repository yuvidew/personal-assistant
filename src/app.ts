import { Hono } from 'hono'

const app = new Hono()

app.get('/', (c) => {
  return c.json({
    "message" : "Hello hone + Railway"
  })
})

app.get('/marco', (c) => c.text('polo'))

export default app

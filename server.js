import express from 'express'
import cors from 'cors'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const app = express()

app.use(cors())
app.use(express.json())
app.use(express.static(join(__dirname, 'public')))

// ── Database ──────────────────────────────────────────────────────────────────
const defaultData = () => ({
  customers: [],
  services: [
    { id: 1, name: 'Mobile repairs',  price: 350, pts: 350 },
    { id: 2, name: 'Basic repairs',   price: 250, pts: 250 },
    { id: 3, name: 'Repair kit',      price: 375, pts: 375 },
    { id: 4, name: 'Core services',   price: 250, pts: 250 },
    { id: 5, name: 'Labor charge',    price: 100, pts: 0 },
    { id: 6, name: 'Cleaning kit',    price: 75,  pts: 75  },
    { id: 7, name: 'Duct tape',       price: 75,  pts: 75  },
  ],
  rewards: [
    { id: 1, name: 'Free cleaning kit',     pts: 300,  tier: 'Bronze', discount: 100 },
    { id: 2, name: '10% off next service',  pts: 500,  tier: 'Silver', discount: 10  },
    { id: 3, name: 'Free labor charge',     pts: 1000, tier: 'Gold',   discount: 100 },
  ],
  history: [],
  nextId: { customers: 1, services: 8, rewards: 4, history: 1 }
})

// In-memory fallback when KV env vars are not set (local dev — data resets on restart)
let memDb = null

async function getData() {
  if (process.env.KV_REST_API_URL) {
    const { kv } = await import('@vercel/kv')
    return (await kv.get('bennys_db')) ?? defaultData()
  }
  return memDb ?? (memDb = defaultData())
}

async function saveData(data) {
  if (process.env.KV_REST_API_URL) {
    const { kv } = await import('@vercel/kv')
    await kv.set('bennys_db', data)
  } else {
    memDb = data
  }
}

function nextId(data, type) {
  const id = data.nextId[type]
  data.nextId[type]++
  return id
}

// ── Auth ──────────────────────────────────────────────────────────────────────
const USERS = {
  admin: { password: 'benny2024', role: 'admin' },
  emp:   { password: 'shop123',   role: 'employee' }
}

app.post('/api/login', (req, res) => {
  const { username, password } = req.body
  const user = USERS[username]
  if (!user || user.password !== password)
    return res.status(401).json({ error: 'Invalid credentials' })
  res.json({ role: user.role, username })
})

// ── Customers ─────────────────────────────────────────────────────────────────
app.get('/api/customers', async (req, res) => {
  const data = await getData()
  res.json(data.customers)
})

app.get('/api/customers/phone/:phone', async (req, res) => {
  const data = await getData()
  const phone = req.params.phone.replace(/\D/g, '')
  const c = data.customers.find(c => c.phone === phone)
  if (!c) return res.status(404).json({ error: 'Not found' })
  res.json(c)
})

app.post('/api/customers', async (req, res) => {
  const data = await getData()
  const { first, last, phone, vehicle } = req.body
  const clean = phone?.replace(/\D/g, '')
  if (!first || !clean) return res.status(400).json({ error: 'Name and phone required' })
  if (data.customers.find(c => c.phone === clean))
    return res.status(409).json({ error: 'Phone already registered' })
  const customer = { id: nextId(data, 'customers'), first, last: last || '', phone: clean, vehicle: vehicle || '', points: 0, createdAt: new Date().toISOString() }
  data.customers.push(customer)
  await saveData(data)
  res.json(customer)
})

app.patch('/api/customers/:id/points', async (req, res) => {
  const data = await getData()
  const c = data.customers.find(c => c.id === Number(req.params.id))
  if (!c) return res.status(404).json({ error: 'Not found' })
  c.points = Math.max(0, c.points + (req.body.delta || 0))
  await saveData(data)
  res.json(c)
})

// ── Services ──────────────────────────────────────────────────────────────────
app.get('/api/services', async (req, res) => {
  const data = await getData()
  res.json(data.services)
})

app.post('/api/services', async (req, res) => {
  const data = await getData()
  const { name, price, pts } = req.body
  if (!name || price == null || pts == null) return res.status(400).json({ error: 'All fields required' })
  const svc = { id: nextId(data, 'services'), name, price: Number(price), pts: Number(pts) }
  data.services.push(svc)
  await saveData(data)
  res.json(svc)
})

app.delete('/api/services/:id', async (req, res) => {
  const data = await getData()
  const idx = data.services.findIndex(s => s.id === Number(req.params.id))
  if (idx === -1) return res.status(404).json({ error: 'Not found' })
  data.services.splice(idx, 1)
  await saveData(data)
  res.json({ ok: true })
})

// ── Rewards ───────────────────────────────────────────────────────────────────
app.get('/api/rewards', async (req, res) => {
  const data = await getData()
  res.json(data.rewards)
})

app.post('/api/rewards', async (req, res) => {
  const data = await getData()
  const { name, pts, tier, discount } = req.body
  if (!name || pts == null) return res.status(400).json({ error: 'Name and points required' })
  const r = { id: nextId(data, 'rewards'), name, pts: Number(pts), tier: tier || 'All', discount: Number(discount) || 0 }
  data.rewards.push(r)
  await saveData(data)
  res.json(r)
})

app.delete('/api/rewards/:id', async (req, res) => {
  const data = await getData()
  const idx = data.rewards.findIndex(r => r.id === Number(req.params.id))
  if (idx === -1) return res.status(404).json({ error: 'Not found' })
  data.rewards.splice(idx, 1)
  await saveData(data)
  res.json({ ok: true })
})

// ── Orders / History ──────────────────────────────────────────────────────────
app.post('/api/orders', async (req, res) => {
  const data = await getData()
  const { customerId, serviceIds } = req.body
  const c = data.customers.find(c => c.id === Number(customerId))
  if (!c) return res.status(404).json({ error: 'Customer not found' })

  const svcs = serviceIds.map(id => data.services.find(s => s.id === id)).filter(Boolean)
  if (!svcs.length) return res.status(400).json({ error: 'No valid services' })

  const totalPrice = svcs.reduce((a, s) => a + s.price, 0)
  const totalPts   = svcs.reduce((a, s) => a + s.pts, 0)

  c.points += totalPts

  const entry = {
    id: nextId(data, 'history'),
    customerId: c.id,
    customerName: `${c.first} ${c.last}`,
    services: svcs.map(s => s.name).join(', '),
    total: totalPrice,
    pts: totalPts,
    date: new Date().toISOString()
  }
  data.history.push(entry)
  await saveData(data)
  res.json({ customer: c, order: entry })
})

app.get('/api/history', async (req, res) => {
  const data = await getData()
  res.json(data.history.slice().reverse())
})

// ── Stats ─────────────────────────────────────────────────────────────────────
app.get('/api/stats', async (req, res) => {
  const data = await getData()
  const today = new Date().toDateString()
  res.json({
    totalMembers: data.customers.length,
    totalPoints:  data.customers.reduce((a, c) => a + c.points, 0),
    ordersToday:  data.history.filter(h => new Date(h.date).toDateString() === today).length,
    revenueToday: data.history
      .filter(h => new Date(h.date).toDateString() === today)
      .reduce((a, h) => a + h.total, 0)
  })
})

// Listen locally; Vercel imports this file and uses the exported app instead
if (process.env.NODE_ENV !== 'production') {
  const PORT = 3000
  app.listen(PORT, () => {
    console.log(`\n Benny's Motor Works Rewards`)
    console.log(`   Running at http://localhost:${PORT}\n`)
  })
}

export default app

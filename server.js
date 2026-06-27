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
    { id: 1, name: 'Mobile repairs',     price: 35000 },
    { id: 2, name: 'Basic repairs',      price: 25000 },
    { id: 3, name: 'Repair kit',         price: 3750  },
    { id: 4, name: 'Core services',      price: 25000 },
    { id: 5, name: 'Labor charge',       price: 10000 },
    { id: 6, name: 'Cleaning kit',       price: 750   },
    { id: 7, name: 'Duct tape',          price: 750   },
    { id: 8, name: 'Custom paint job',   price: 20000 },
    { id: 9, name: 'Full cosmetics pkg', price: 50000 },
  ],
  rewards: [
    { id: 1, name: '$5k shop credit off purchase', pts: 10, tier: 'All',    note: 'Min. $15k qualifying purchase. 1 per invoice. Cannot combine w/ other discounts.' },
    { id: 2, name: '10 free repair kits',           pts: 5,  tier: 'Bronze', note: 'Applied as free items on next visit.' },
    { id: 3, name: 'Full cosmetics pkg (1 car)',    pts: 20, tier: 'Silver', note: "One car's worth of cosmetics on next visit." },
  ],
  history: [],
  nextId: { customers: 1, services: 10, rewards: 4, history: 1 }
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
  const customer = {
    id: nextId(data, 'customers'), first, last: last || '', phone: clean,
    vehicle: vehicle || '', points: 0, lifetimeSpend: 0, lifetimePoints: 0,
    createdAt: new Date().toISOString()
  }
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

// Award bonus points (referral, event attendance, etc.)
app.post('/api/customers/:id/bonus', async (req, res) => {
  const data = await getData()
  const c = data.customers.find(c => c.id === Number(req.params.id))
  if (!c) return res.status(404).json({ error: 'Not found' })
  const { pts, reason } = req.body
  if (!pts || !reason) return res.status(400).json({ error: 'pts and reason required' })
  const amount = Number(pts)
  c.points += amount
  c.lifetimePoints = (c.lifetimePoints || 0) + amount
  const entry = {
    id: nextId(data, 'history'),
    type: 'bonus',
    customerId: c.id,
    customerName: `${c.first} ${c.last}`,
    services: reason,
    total: 0,
    pts: amount,
    date: new Date().toISOString()
  }
  data.history.push(entry)
  await saveData(data)
  res.json({ customer: c, entry })
})

// Redeem a reward (deducts points, logs redemption)
app.post('/api/customers/:id/redeem', async (req, res) => {
  const data = await getData()
  const c = data.customers.find(c => c.id === Number(req.params.id))
  if (!c) return res.status(404).json({ error: 'Not found' })
  const { rewardId } = req.body
  const reward = data.rewards.find(r => r.id === Number(rewardId))
  if (!reward) return res.status(404).json({ error: 'Reward not found' })
  if (c.points < reward.pts) return res.status(400).json({ error: 'Insufficient points' })
  c.points -= reward.pts
  const entry = {
    id: nextId(data, 'history'),
    type: 'redeem',
    customerId: c.id,
    customerName: `${c.first} ${c.last}`,
    services: `Redeemed: ${reward.name}`,
    total: 0,
    pts: -reward.pts,
    date: new Date().toISOString()
  }
  data.history.push(entry)
  await saveData(data)
  res.json({ customer: c, entry })
})

// ── Services ──────────────────────────────────────────────────────────────────
app.get('/api/services', async (req, res) => {
  const data = await getData()
  res.json(data.services)
})

app.post('/api/services', async (req, res) => {
  const data = await getData()
  const { name, price } = req.body
  if (!name || price == null) return res.status(400).json({ error: 'Name and price required' })
  const svc = { id: nextId(data, 'services'), name, price: Number(price) }
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
  const { name, pts, tier, note } = req.body
  if (!name || pts == null) return res.status(400).json({ error: 'Name and points required' })
  const r = { id: nextId(data, 'rewards'), name, pts: Number(pts), tier: tier || 'All', note: note || '' }
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
  // 1 point per $10,000 spent — points awarded after payment received
  const earnedPts = Math.floor(totalPrice / 10000)

  c.points += earnedPts
  c.lifetimeSpend = (c.lifetimeSpend || 0) + totalPrice
  c.lifetimePoints = (c.lifetimePoints || 0) + earnedPts

  const entry = {
    id: nextId(data, 'history'),
    type: 'order',
    customerId: c.id,
    customerName: `${c.first} ${c.last}`,
    services: svcs.map(s => s.name).join(', '),
    total: totalPrice,
    pts: earnedPts,
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
  const todayOrders = data.history.filter(h => new Date(h.date).toDateString() === today && (h.type === 'order' || !h.type))
  res.json({
    totalMembers: data.customers.length,
    totalPoints:  data.customers.reduce((a, c) => a + c.points, 0),
    ordersToday:  todayOrders.length,
    revenueToday: todayOrders.reduce((a, h) => a + h.total, 0)
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

import express from 'express'
import cors from 'cors'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { Low, JSONFile } from 'lowdb'

const __dirname = dirname(fileURLToPath(import.meta.url))
const app = express()
const PORT = 3000

app.use(cors())
app.use(express.json())
app.use(express.static(join(__dirname, 'public')))

// ── Database setup ────────────────────────────────────────────────────────────
const file = join(__dirname, 'db.json')
const adapter = new JSONFile(file)
const db = new Low(adapter, {
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

await db.read()

function save() { return db.write() }
function nextId(type) {
  const id = db.data.nextId[type]
  db.data.nextId[type]++
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
app.get('/api/customers', (req, res) => {
  res.json(db.data.customers)
})

app.get('/api/customers/phone/:phone', (req, res) => {
  const phone = req.params.phone.replace(/\D/g, '')
  const c = db.data.customers.find(c => c.phone === phone)
  if (!c) return res.status(404).json({ error: 'Not found' })
  res.json(c)
})

app.post('/api/customers', async (req, res) => {
  const { first, last, phone, vehicle } = req.body
  const clean = phone?.replace(/\D/g, '')
  if (!first || !clean) return res.status(400).json({ error: 'Name and phone required' })
  if (db.data.customers.find(c => c.phone === clean))
    return res.status(409).json({ error: 'Phone already registered' })
  const customer = { id: nextId('customers'), first, last: last || '', phone: clean, vehicle: vehicle || '', points: 0, createdAt: new Date().toISOString() }
  db.data.customers.push(customer)
  await save()
  res.json(customer)
})

app.patch('/api/customers/:id/points', async (req, res) => {
  const c = db.data.customers.find(c => c.id === Number(req.params.id))
  if (!c) return res.status(404).json({ error: 'Not found' })
  c.points = Math.max(0, c.points + (req.body.delta || 0))
  await save()
  res.json(c)
})

// ── Services ──────────────────────────────────────────────────────────────────
app.get('/api/services', (req, res) => {
  res.json(db.data.services)
})

app.post('/api/services', async (req, res) => {
  const { name, price, pts } = req.body
  if (!name || price == null || pts == null) return res.status(400).json({ error: 'All fields required' })
  const svc = { id: nextId('services'), name, price: Number(price), pts: Number(pts) }
  db.data.services.push(svc)
  await save()
  res.json(svc)
})

app.delete('/api/services/:id', async (req, res) => {
  const idx = db.data.services.findIndex(s => s.id === Number(req.params.id))
  if (idx === -1) return res.status(404).json({ error: 'Not found' })
  db.data.services.splice(idx, 1)
  await save()
  res.json({ ok: true })
})

// ── Rewards ───────────────────────────────────────────────────────────────────
app.get('/api/rewards', (req, res) => {
  res.json(db.data.rewards)
})

app.post('/api/rewards', async (req, res) => {
  const { name, pts, tier, discount } = req.body
  if (!name || pts == null) return res.status(400).json({ error: 'Name and points required' })
  const r = { id: nextId('rewards'), name, pts: Number(pts), tier: tier || 'All', discount: Number(discount) || 0 }
  db.data.rewards.push(r)
  await save()
  res.json(r)
})

app.delete('/api/rewards/:id', async (req, res) => {
  const idx = db.data.rewards.findIndex(r => r.id === Number(req.params.id))
  if (idx === -1) return res.status(404).json({ error: 'Not found' })
  db.data.rewards.splice(idx, 1)
  await save()
  res.json({ ok: true })
})

// ── Orders / History ──────────────────────────────────────────────────────────
app.post('/api/orders', async (req, res) => {
  const { customerId, serviceIds } = req.body
  const c = db.data.customers.find(c => c.id === Number(customerId))
  if (!c) return res.status(404).json({ error: 'Customer not found' })

  const svcs = serviceIds.map(id => db.data.services.find(s => s.id === id)).filter(Boolean)
  if (!svcs.length) return res.status(400).json({ error: 'No valid services' })

  const totalPrice = svcs.reduce((a, s) => a + s.price, 0)
  const totalPts   = svcs.reduce((a, s) => a + s.pts, 0)

  c.points += totalPts

  const entry = {
    id: nextId('history'),
    customerId: c.id,
    customerName: `${c.first} ${c.last}`,
    services: svcs.map(s => s.name).join(', '),
    total: totalPrice,
    pts: totalPts,
    date: new Date().toISOString()
  }
  db.data.history.push(entry)
  await save()
  res.json({ customer: c, order: entry })
})

app.get('/api/history', (req, res) => {
  res.json(db.data.history.slice().reverse())
})

// ── Stats ─────────────────────────────────────────────────────────────────────
app.get('/api/stats', (req, res) => {
  const today = new Date().toDateString()
  res.json({
    totalMembers: db.data.customers.length,
    totalPoints:  db.data.customers.reduce((a, c) => a + c.points, 0),
    ordersToday:  db.data.history.filter(h => new Date(h.date).toDateString() === today).length,
    revenueToday: db.data.history
      .filter(h => new Date(h.date).toDateString() === today)
      .reduce((a, h) => a + h.total, 0)
  })
})

app.listen(PORT, () => {
  console.log(`\n🔧 Benny's Motor Works Rewards`)
  console.log(`   Running at http://localhost:${PORT}\n`)
})

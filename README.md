# Benny's Original Motor Works — Rewards System

## Requirements
- **Node.js 18+** — download at https://nodejs.org

## Setup

```bash
# 1. Install dependencies
npm install

# 2. Start the server
npm start
```

Then open your browser to: **http://localhost:3000**

---

## Login credentials

| Role     | Username | Password   |
|----------|----------|------------|
| Admin    | admin    | benny2024  |
| Employee | emp      | shop123    |

---

## How it works

- **Database**: All data is saved to `db.json` in the project folder. It's a plain JSON file — you can open it in any text editor to view or back up data.
- **Data persists** between server restarts. Nothing is lost when you stop and restart.
- **First run**: The database is seeded with Benny's default services and 3 starter rewards automatically.

---

## Features

### Admin panel
- Dashboard with live stats (members, orders today, revenue, total points)
- Full customer list with points and tier
- Add / remove services and their point values
- Configure reward tiers (Bronze / Silver / Gold)
- Add custom rewards with point thresholds
- Full transaction history

### Employee panel
- Look up customer by phone number instantly
- Register new customers on the spot (phone required)
- Select services for an order — points awarded automatically
- Customer card shows current points, tier, and progress bar

---

## Default services (from Benny's menu)

| Service        | Price  | Points |
|----------------|--------|--------|
| Mobile repairs | $350   | 350    |
| Basic repairs  | $250   | 250    |
| Repair kit     | $375   | 375    |
| Core services  | $250   | 250    |
| Labor charge   | $100   | 100    |
| Cleaning kit   | $75    | 75     |
| Duct tape      | $75    | 75     |

## Reward tiers

| Tier   | Points      | Discount  |
|--------|-------------|-----------|
| Bronze | 0 – 499     | 5% off labor |
| Silver | 500 – 999   | 10% off labor |
| Gold   | 1000+       | 15% off labor |

---

## Changing passwords

Open `server.js` and find this section near the top:

```js
const USERS = {
  admin: { password: 'benny2024', role: 'admin' },
  emp:   { password: 'shop123',   role: 'employee' }
}
```

Change the passwords there and restart the server.

---

## File structure

```
bennys-rewards/
├── server.js        ← Backend API (Express + lowdb)
├── db.json          ← Database (auto-created on first run)
├── package.json
├── public/
│   └── index.html   ← Full frontend (all-in-one)
└── README.md
```

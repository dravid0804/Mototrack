# ⚙ RevTrack — Production Vehicle Service Tracker

Full-stack production backend for RevTrack — the vehicle maintenance tracking platform with automatic **WhatsApp** and **Email** alerts.

---

## Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 20 + Express 4 |
| Database | PostgreSQL 16 |
| Auth | JWT (bcrypt password hashing) |
| WhatsApp | Twilio WhatsApp Business API |
| Email | Nodemailer (SMTP — Gmail / SendGrid / SES) |
| Scheduler | node-cron (daily checks + monthly digest) |
| Logging | Winston |
| Deployment | Docker + Docker Compose |

---

## Project Structure

```
revtrack/
├── backend/
│   ├── src/
│   │   ├── config/
│   │   │   ├── database.js          # PostgreSQL connection pool
│   │   │   └── logger.js            # Winston logger
│   │   ├── controllers/
│   │   │   ├── authController.js    # Register / Login / Profile
│   │   │   ├── vehicleController.js # CRUD + health check
│   │   │   ├── serviceController.js # Log service + upcoming
│   │   │   └── notificationController.js
│   │   ├── middleware/
│   │   │   ├── auth.js              # JWT guard
│   │   │   └── errorHandler.js
│   │   ├── routes/
│   │   │   └── index.js             # All API routes
│   │   ├── services/
│   │   │   ├── whatsappService.js   # Twilio WhatsApp sender
│   │   │   ├── emailService.js      # Nodemailer HTML email sender
│   │   │   └── notificationService.js # Orchestrator
│   │   ├── jobs/
│   │   │   └── scheduler.js         # Daily + monthly cron jobs
│   │   ├── utils/
│   │   │   ├── migrate.js           # Run DB migrations
│   │   │   └── seed.js              # Seed service catalogue
│   │   └── server.js                # Express app entry point
│   ├── .env.example
│   ├── package.json
│   └── Dockerfile
├── docker-compose.yml
└── README.md
```

---

## Quick Start (Local)

### 1. Prerequisites
- Node.js 20+
- PostgreSQL 16 running locally (or use Docker below)
- Twilio account with WhatsApp sandbox enabled
- Gmail / SendGrid / SES for email

### 2. Install dependencies
```bash
cd backend
npm install
```

### 3. Configure environment
```bash
cp .env.example .env
# Edit .env and fill in all values
```

### 4. Run database migrations
```bash
npm run migrate
```

### 5. Seed the service catalogue (30+ services for cars & bikes)
```bash
npm run seed
```

### 6. Start the server
```bash
npm run dev       # development with hot-reload
npm start         # production
```

### 7. Start the scheduler (separate process)
```bash
npm run scheduler
# Or trigger immediately for testing:
node src/jobs/scheduler.js --now
```

---

## Docker (Recommended for Production)

```bash
# Copy and fill in your .env values
cp backend/.env.example .env

# Start everything (DB + API + Scheduler)
docker-compose up -d

# Run migrations + seed inside the container
docker exec revtrack_api node src/utils/migrate.js
docker exec revtrack_api node src/utils/seed.js

# View logs
docker-compose logs -f api

# With pgAdmin database UI
docker-compose --profile dev up -d
# Open: http://localhost:5050  (admin@revtrack.local / admin)
```

---

## API Reference

### Auth

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/auth/register` | Create account |
| POST | `/api/auth/login` | Login, returns JWT |
| GET | `/api/auth/me` | Get current user |
| PATCH | `/api/auth/profile` | Update profile + notification prefs |

**Register body:**
```json
{
  "first_name": "Arjun",
  "last_name": "Kumar",
  "email": "arjun@example.com",
  "phone": "+919876543210",
  "password": "securepassword",
  "notify_whatsapp": true,
  "notify_email": true
}
```

---

### Vehicles

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/vehicles` | List all my vehicles |
| POST | `/api/vehicles` | Add a vehicle |
| GET | `/api/vehicles/:id` | Get vehicle details |
| PATCH | `/api/vehicles/:id` | Update odometer / details |
| DELETE | `/api/vehicles/:id` | Remove (soft delete) |
| GET | `/api/vehicles/:id/health` | Full service health report |

**Add vehicle body:**
```json
{
  "type": "bike",
  "make": "Honda",
  "model": "CB500X",
  "year": 2021,
  "fuel_type": "petrol",
  "registration": "MH-12-AB-5678",
  "current_km": 32500,
  "engine_cc": "471cc",
  "transmission": "6-speed manual"
}
```

**Health response includes per-service status:**
```json
{
  "vehicle": { ... },
  "services": [
    {
      "service_name": "Engine Oil Change",
      "status": "overdue",
      "kmLeft": -500,
      "nextDueKm": 32000,
      "pct": 108,
      "spec": "10W-30 mineral",
      "qty": "2.1 L"
    }
  ]
}
```

---

### Service Records

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/services` | List all service history |
| GET | `/api/services?vehicle_id=...` | Filter by vehicle |
| POST | `/api/services` | Log a completed service |
| DELETE | `/api/services/:id` | Delete a record |
| GET | `/api/services/upcoming` | All overdue/warning services |

**Log service body:**
```json
{
  "vehicle_id": "uuid-here",
  "catalogue_id": "uuid-here",
  "service_name": "Engine Oil Change",
  "done_at": "2025-03-14",
  "done_km": 32500,
  "spec_used": "10W-30 Castrol",
  "qty_used": "2.1L",
  "cost": 850,
  "workshop": "Hero Service Center, Chennai"
}
```

> Logging a service automatically sends a WhatsApp + Email completion confirmation.

---

### Notifications

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/notifications` | All notification history |
| GET | `/api/notifications?channel=whatsapp` | Filter by channel |
| GET | `/api/notifications?type=overdue` | Filter by type |
| GET | `/api/notifications/stats` | Sent/failed counts by channel |

---

### Catalogue

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/catalogue?type=bike` | Get services for vehicle type |
| GET | `/api/catalogue?type=car&fuel_type=diesel` | Diesel car services |

---

## Alert System

### How it works

The scheduler runs every day at **8:00 AM IST** and checks every vehicle for every service:

```
For each user → each vehicle → each service:
  1. Calculate km/days remaining until next service
  2. Determine alert level:
     - OVERDUE  → km_left < 0  OR days_left < 0
     - URGENT   → km_left ≤ 300  OR days_left ≤ 3
     - WARNING  → km_left ≤ 800  OR days_left ≤ 7
  3. Check deduplication (skip if same alert sent in last 20 hours)
  4. Send via enabled channels (WhatsApp + Email)
  5. Log delivery in notification_log table
```

### Alert types

| Type | Trigger | Channels |
|---|---|---|
| `warning` | 7 days / ~800 km before due | WhatsApp + Email |
| `urgent` | 3 days / ~300 km before due | WhatsApp + Email |
| `overdue` | Past due date/km | WhatsApp + Email (immediate) |
| `completion` | Service logged by user | WhatsApp + Email |
| `digest` | 1st of every month | Email only |

### WhatsApp Setup (Twilio)

1. Create account at [twilio.com](https://twilio.com)
2. Go to **Messaging → Try WhatsApp** and join the sandbox
3. Copy your `Account SID`, `Auth Token`, and sandbox number
4. Users send `join <sandbox-keyword>` to your Twilio number to opt in
5. For production: apply for WhatsApp Business API approval

### Email Setup (Gmail)

1. Enable 2FA on your Google account
2. Go to **Google Account → Security → App Passwords**
3. Create an app password for "Mail"
4. Use that password as `SMTP_PASS` in your `.env`

### Email Setup (SendGrid — Recommended for Production)

```env
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_USER=apikey
SMTP_PASS=SG.your_sendgrid_api_key
```

---

## Database Schema

```
users                     ← accounts + notification prefs
vehicles                  ← cars and bikes per user
service_catalogue         ← master list of 30+ services with intervals
vehicle_service_config    ← per-vehicle overrides of catalogue defaults
service_records           ← completed service history
notification_log          ← every WhatsApp/Email sent, with delivery status
```

---

## Connecting the Frontend

In the RevTrack frontend, replace mock data calls with real API calls:

```javascript
// Login
const res = await fetch('http://localhost:5000/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password })
});
const { token, user } = await res.json();
localStorage.setItem('token', token);

// Authenticated request
const vehicles = await fetch('http://localhost:5000/api/vehicles', {
  headers: { 'Authorization': `Bearer ${token}` }
}).then(r => r.json());
```

---

## Production Checklist

- [ ] Change `JWT_SECRET` to a strong random string (32+ chars)
- [ ] Set `NODE_ENV=production`
- [ ] Use a managed PostgreSQL (AWS RDS, Supabase, Neon, Railway)
- [ ] Use SendGrid or AWS SES instead of Gmail for high-volume email
- [ ] Apply for Twilio WhatsApp Business API (remove sandbox limit)
- [ ] Set up SSL/TLS (nginx reverse proxy + Let's Encrypt)
- [ ] Configure log rotation (winston-daily-rotate-file)
- [ ] Set up database backups (pg_dump cron)
- [ ] Add monitoring (UptimeRobot, Sentry for errors)

---

## License
MIT — built with RevTrack

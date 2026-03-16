#!/bin/bash
# setup.sh — RevTrack quick start script
set -e

echo ""
echo "⚙  RevTrack — Setup Script"
echo "─────────────────────────────────────"

# 1. Check Node
if ! command -v node &> /dev/null; then
  echo "❌  Node.js not found. Install from https://nodejs.org (v20+)"
  exit 1
fi
echo "✓  Node.js $(node -v)"

# 2. Check Postgres
if ! command -v psql &> /dev/null; then
  echo "⚠   PostgreSQL CLI not found — make sure your DB is running"
fi

# 3. Install dependencies
echo ""
echo "📦  Installing backend dependencies..."
cd backend && npm install && cd ..

# 4. Create .env if missing
if [ ! -f backend/.env ]; then
  cp backend/.env.example backend/.env
  echo ""
  echo "📋  Created backend/.env from template."
  echo "    ➜  Edit backend/.env and fill in your:"
  echo "       - DB credentials"
  echo "       - Twilio Account SID, Auth Token, WhatsApp number"
  echo "       - SMTP credentials (Gmail App Password or SendGrid key)"
  echo ""
  read -p "Press Enter once you've filled in backend/.env to continue..."
fi

# 5. Run migrations
echo ""
echo "🗄   Running database migrations..."
cd backend && node src/utils/migrate.js && cd ..

# 6. Seed catalogue
echo ""
echo "🌱  Seeding service catalogue (30+ services)..."
cd backend && node src/utils/seed.js && cd ..

echo ""
echo "✅  Setup complete!"
echo ""
echo "Start the server:    cd backend && npm start"
echo "Dev with hot-reload: cd backend && npm run dev"
echo "Open frontend:       open frontend/index.html"
echo ""
echo "Default API:  http://localhost:5000"
echo "Health check: http://localhost:5000/health"
echo ""

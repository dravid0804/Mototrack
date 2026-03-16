@echo off
echo.
echo  ⚙  RevTrack — Windows Setup
echo  ─────────────────────────────────────
echo.

:: 1. Copy .env
if not exist .env (
    copy .env.example .env
    echo  ✓  Created .env from template
    echo.
    echo  ► Now open backend\.env in Notepad and fill in:
    echo      - DB_HOST, DB_USER, DB_PASSWORD, DB_NAME
    echo      - TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM
    echo      - SMTP_HOST, SMTP_USER, SMTP_PASS, EMAIL_FROM
    echo.
    pause
) else (
    echo  ✓  .env already exists
)

:: 2. Install dependencies
echo  📦  Installing dependencies...
call npm install
if %errorlevel% neq 0 ( echo ❌ npm install failed & pause & exit /b )

:: 3. Migrate database
echo.
echo  🗄   Running database migrations...
call node src/utils/migrate.js
if %errorlevel% neq 0 ( echo ❌ Migration failed - check your DB credentials in .env & pause & exit /b )

:: 4. Seed catalogue
echo.
echo  🌱  Seeding service catalogue...
call node src/utils/seed.js
if %errorlevel% neq 0 ( echo ❌ Seed failed & pause & exit /b )

echo.
echo  ✅  Setup complete!
echo.
echo  Start server:  npm run dev
echo  API running:   http://localhost:5000
echo  Health check:  http://localhost:5000/health
echo.
pause

# 🚀 Lor Mentor Server Startup Guide

Complete guide for starting all required servers for the Lor Mentor application on Windows.

> **💡 Quick Tip:** Keep this file open while developing - it contains solutions to common issues!

## 📋 Prerequisites

Before starting servers, ensure you have:
- ✅ Node.js v18+ installed
- ✅ PostgreSQL 18 installed and initialized
- ✅ Redis 5.0+ installed (version warning is safe to ignore)
- ✅ Dependencies installed: `npm install` (run from project root)
- ✅ API built: `npm run build --workspace=apps/api`
- ✅ Environment files configured (see section below)

---

## 🔧 Environment Setup (First Time Only)

### Check if you have the required `.env` files:

**Root `.env`** (optional - for workspace-level configs)
```bash
# Location: C:\Users\berek\Desktop\Lor-mentor\lor-mentor\.env
```

**API `.env`** (required)
```bash
# Location: C:\Users\berek\Desktop\Lor-mentor\lor-mentor\apps\api\.env
DATABASE_URL="postgresql://postgres:YOUR_PASSWORD@localhost:5432/lor_mentor"
JWT_SECRET="your-super-secret-jwt-key-change-in-production"
JWT_REFRESH_SECRET="your-super-secret-refresh-key-change-in-production"
REDIS_HOST="localhost"
REDIS_PORT="6379"
NODE_ENV="development"

# Optional AI/OpenAI settings
OPENAI_API_KEY="your-openai-key"
```

**Frontend `.env.local`** (required)
```bash
# Location: C:\Users\berek\Desktop\Lor-mentor\lor-mentor\apps\web\.env.local
NEXT_PUBLIC_API_URL="http://localhost:4000/api/v1"
```

### First-time database setup:
```powershell
cd C:\Users\berek\Desktop\Lor-mentor\lor-mentor\apps\api

# Apply migrations
npx prisma migrate deploy

# Seed database (creates programs, departments, super admin)
node dist/prisma/seed.js
```

**Default Super Admin Credentials:**
- Email: `superadmin@lorcan.edu.et`
- Password: (check seed file or set your own)

---

## 🎯 Quick Start - All Servers

### Start All 5 Servers (Step-by-Step)

Open **5 separate PowerShell/Terminal windows** and run these commands **in order**:

---

#### 🗄️ Window 1 - PostgreSQL Database
```powershell
# Start as Windows Service (recommended - run as Administrator)
Start-Service -Name "postgresql-x64-18"

# Verify it started successfully
& "C:\Program Files\PostgreSQL\18\bin\pg_isready.exe" -U postgres
```
**Expected output:** `:5432 - accepting connections`

**Alternative (if service fails):**
```powershell
& "C:\Program Files\PostgreSQL\18\bin\pg_ctl.exe" start -D "C:\Program Files\PostgreSQL\18\data"
```

---

#### 🔴 Window 2 - Redis Cache Server
```powershell
# Start Redis WITHOUT disk persistence (recommended for development)
& "C:\Program Files\Redis\redis-server.exe" --port 6379 --save ""
```
**Expected output:** Redis ASCII art logo + `Ready to accept connections tcp`

**Why `--save ""`?** Disables disk snapshots to avoid permission errors. Data stays in memory.

**Leave this window open** - Redis logs appear here

**Note:** Redis version 5.0.14.1 warning is safe to ignore - app works fine with it.

---

#### 🔧 Window 3 - Backend API (NestJS)
```powershell
# Navigate to API folder
cd C:\Users\berek\Desktop\Lor-mentor\lor-mentor\apps\api

# Start the API server
node --max-old-space-size=512 dist/src/main
```
**Expected output:** 
```
✅ Database connected
╔══════════════════════════════════════╗
║   Lor Mentor API is running          ║
║   http://localhost:4000/api/v1      ║
╚══════════════════════════════════════╝
```

**Note:** If you get `Cannot find module` error, rebuild first:
```powershell
npm run build
node --max-old-space-size=512 dist/src/main
```

---

#### 🎨 Window 4 - Frontend Web App (Next.js)
```powershell
# Navigate to web folder
cd C:\Users\berek\Desktop\Lor-mentor\lor-mentor\apps\web

# Start Next.js development server
npx next dev
```

**Alternative (if npx doesn't work):**
```powershell
node --max-old-space-size=512 ../../node_modules/next/dist/bin/next dev
```

**Expected output:**
```
▲ Next.js 16.2.11 (Turbopack)
- Local:         http://localhost:3000
✓ Ready in 2.8s
```

---

#### 💾 Window 5 - Prisma Studio (Database GUI) - OPTIONAL
```powershell
# Navigate to API folder
cd C:\Users\berek\Desktop\Lor-mentor\lor-mentor\apps\api

# Start Prisma Studio
npx prisma studio
```
**Expected output:** 
```
Prisma Studio is running at: http://localhost:51212
```

**Leave all 5 windows open while developing!**

---

## ✅ Verification - Check Everything Works

### Method 1: Check Ports (Fastest)
```powershell
# Check all 5 ports are listening
Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object {$_.LocalPort -in @(3000,4000,5432,6379,51212)} | Select-Object LocalPort,State | Sort-Object LocalPort
```

**Expected output:**
```
LocalPort  State
---------  -----
     3000 Listen  ← Frontend (Next.js)
     4000 Listen  ← API (NestJS)
     5432 Listen  ← PostgreSQL
     6379 Listen  ← Redis
    51212 Listen  ← Prisma Studio (optional)
```

### Method 2: Test Each URL

Open these URLs in your browser:

| Service | URL | Expected Response |
|---------|-----|-------------------|
| **Frontend** | http://localhost:3000 | Lor Mentor login page |
| **API Health** | http://localhost:4000/api/v1/health | `{"status":"ok","app":"Lor Mentor API"...}` |
| **Prisma Studio** | http://localhost:51212 | Database GUI (if started) |

### Method 3: PowerShell Test
```powershell
# Test API
Invoke-WebRequest -Uri http://localhost:4000/api/v1/health -UseBasicParsing

# Test Frontend
Invoke-WebRequest -Uri http://localhost:3000 -Method Head -UseBasicParsing
```

### ✅ All Good? 
If all 5 ports are listening and URLs respond, **you're ready to develop!** 🎉

---

## 🛑 Stopping All Servers

When you're done developing or need to restart:

```powershell
# Stop all Node processes (API, Frontend, Prisma Studio)
Get-Process -Name node -ErrorAction SilentlyContinue | Stop-Process -Force

# Stop Redis (if started manually)
Get-Process -Name redis-server -ErrorAction SilentlyContinue | Stop-Process -Force

# Stop PostgreSQL (as service)
Stop-Service -Name "postgresql-x64-18" -ErrorAction SilentlyContinue

# Or kill specific ports
Get-Process -Id (Get-NetTCPConnection -LocalPort 4000 -ErrorAction SilentlyContinue).OwningProcess | Stop-Process -Force  # API
Get-Process -Id (Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue).OwningProcess | Stop-Process -Force  # Frontend
```

---

## 🐛 Common Errors & Troubleshooting

### 1. ❌ Port Already in Use

**Error:** `EADDRINUSE: address already in use`

**Solution:** Kill the process using the port

```powershell
# Find and kill process on specific port (example: 4000)
$conn = Get-NetTCPConnection -LocalPort 4000 -ErrorAction SilentlyContinue
if ($conn) {
    $proc = Get-Process -Id $conn.OwningProcess
    Write-Host "Killing process: $($proc.Name) (PID: $($proc.Id))"
    Stop-Process -Id $proc.Id -Force
}
```

For common ports:
```powershell
# API (4000)
Get-Process -Id (Get-NetTCPConnection -LocalPort 4000 -ErrorAction SilentlyContinue).OwningProcess | Stop-Process -Force

# Frontend (3000)
Get-Process -Id (Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue).OwningProcess | Stop-Process -Force

# Redis (6379)
Get-Process -Id (Get-NetTCPConnection -LocalPort 6379 -ErrorAction SilentlyContinue).OwningProcess | Stop-Process -Force
```

---

### 2. ❌ PostgreSQL Won't Start

**Error:** `pg_ctl: no response from server`

**Solution A:** Start as Windows Service (Recommended)
```powershell
# Run as Administrator
Start-Service -Name "postgresql-x64-18"

# Wait 5 seconds
Start-Sleep -Seconds 5

# Verify
& "C:\Program Files\PostgreSQL\18\bin\pg_isready.exe" -U postgres
```

**Solution B:** Check if already running
```powershell
Get-Process -Name postgres -ErrorAction SilentlyContinue
```

**Solution C:** Check logs for errors
```powershell
# View PostgreSQL log file
Get-Content "C:\Program Files\PostgreSQL\18\data\logfile" -Tail 50
```

---

### 3. ❌ Redis Connection Error / Disk Write Error

**Error 1:** `bind: An operation was attempted on something that is not a socket`  
**Error 2:** `MISCONF Redis is configured to save RDB snapshots, but it is currently not able to persist on disk`

**Root Cause:** Redis is trying to save data to disk but either:
- Port 6379 is already in use (Error 1)
- Redis doesn't have disk write permissions (Error 2)

**Solution A:** Start Redis without disk persistence (recommended for development)
```powershell
# Kill existing Redis (may need Administrator)
Get-Process -Name redis-server -ErrorAction SilentlyContinue | Stop-Process -Force

# Start Redis without disk saves (fixes MISCONF error)
& "C:\Program Files\Redis\redis-server.exe" --port 6379 --save ""
```

**Solution B:** If you need Redis persistence
```powershell
# Run Redis as Administrator or give write permissions to Redis folder
# Then start normally:
& "C:\Program Files\Redis\redis-server.exe" --port 6379
```

**Note:** The `--save ""` flag disables disk snapshots. This is fine for development since:
- Data persists in memory while Redis is running
- You can always re-seed the database if Redis crashes
- Avoids permission issues on Windows

---

### 4. ❌ API Build Errors

**Error:** `Cannot find module './app.service'` or build failures

**Solution:** Clean rebuild
```powershell
cd C:\Users\berek\Desktop\Lor-mentor\lor-mentor\apps\api

# Remove old build
Remove-Item -Recurse -Force dist -ErrorAction SilentlyContinue

# Rebuild
npm run build

# Start
node --max-old-space-size=512 dist/src/main
```

---

### 5. ❌ Database Connection Errors

**Error:** `Error: P1001: Can't reach database server`

**Checklist:**
1. ✅ PostgreSQL is running: `& "C:\Program Files\PostgreSQL\18\bin\pg_isready.exe" -U postgres`
2. ✅ Database exists: `lor_mentor`
3. ✅ Credentials in `.env` files match PostgreSQL config
4. ✅ Migrations applied: `npx prisma migrate deploy`

**Solution:** Apply migrations
```powershell
cd C:\Users\berek\Desktop\Lor-mentor\lor-mentor\apps\api
npx prisma migrate deploy
```

---

### 6. ❌ Prisma Studio Connection Error

**Error:** Prisma Studio can't connect

**Solution:** Ensure PostgreSQL is running first
```powershell
# Check PostgreSQL
& "C:\Program Files\PostgreSQL\18\bin\pg_isready.exe" -U postgres

# If running, restart Prisma Studio
cd C:\Users\berek\Desktop\Lor-mentor\lor-mentor\apps\api
npx prisma studio
```

---

### 7. ❌ Frontend Build/Start Errors

**Error:** `Error: Cannot find module` or Next.js errors

**Solution A:** Clear Next.js cache
```powershell
cd C:\Users\berek\Desktop\Lor-mentor\lor-mentor\apps\web

# Remove cache
Remove-Item -Recurse -Force .next -ErrorAction SilentlyContinue

# Restart
node --max-old-space-size=512 ../../node_modules/next/dist/bin/next dev
```

**Solution B:** Reinstall dependencies
```powershell
cd C:\Users\berek\Desktop\Lor-mentor\lor-mentor
npm install
```

---

### 8. ❌ Memory Errors / Out of Memory

**Error:** `JavaScript heap out of memory`

**Solution:** The `--max-old-space-size=512` flag is already set to limit memory usage to 512MB. If you still get errors:

```powershell
# Increase memory limit (if system has enough RAM)
node --max-old-space-size=1024 dist/src/main  # API
node --max-old-space-size=1024 ../../node_modules/next/dist/bin/next dev  # Frontend
```

---

## 🔍 Diagnostic Commands

### Check What's Running
```powershell
# All Node processes
Get-Process -Name node -ErrorAction SilentlyContinue

# All required services
Get-Process -Name redis-server,postgres,node -ErrorAction SilentlyContinue | Select-Object ProcessName,Id,StartTime

# All listening ports
Get-NetTCPConnection -State Listen | Select-Object LocalPort,State,@{Name="Process";Expression={(Get-Process -Id $_.OwningProcess -ErrorAction SilentlyContinue).ProcessName}}
```

### Stop All Servers
```powershell
# Stop Node servers
Get-Process -Name node -ErrorAction SilentlyContinue | Stop-Process -Force

# Stop Redis
Get-Process -Name redis-server -ErrorAction SilentlyContinue | Stop-Process -Force

# Stop PostgreSQL (service)
Stop-Service -Name "postgresql-x64-18" -ErrorAction SilentlyContinue
```

---

## 📝 Development Workflow

### Daily Workflow
1. **Start servers** (PostgreSQL + Redis stay running)
2. **Code changes:**
   - Frontend: Auto-reloads (Turbopack)
   - API: Rebuild → Restart
3. **Stop servers** when done

### After API Code Changes
```powershell
# Stop API
Get-Process -Id (Get-NetTCPConnection -LocalPort 4000 -ErrorAction SilentlyContinue).OwningProcess | Stop-Process -Force

# Rebuild
cd C:\Users\berek\Desktop\Lor-mentor\lor-mentor\apps\api
npm run build

# Restart
node --max-old-space-size=512 dist/src/main
```

### After Database Schema Changes
```powershell
cd C:\Users\berek\Desktop\Lor-mentor\lor-mentor\apps\api

# Create migration
npx prisma migrate dev --name your_migration_name

# Apply to database
npx prisma migrate deploy

# Restart API
```

### Viewing Logs
- **API logs:** Terminal running `node dist/src/main`
- **Frontend logs:** Terminal running `next dev`
- **Database logs:** Check Prisma Studio or API console logs
- **Redis logs:** Redis terminal (if started manually)

---

## 🎯 Complete Startup Checklist

Before starting development:

- [ ] PostgreSQL running: `pg_isready -U postgres` → `:5432 - accepting connections`
- [ ] Redis running: Port 6379 listening
- [ ] API built: `apps/api/dist/` folder exists
- [ ] Migrations applied: `npx prisma migrate deploy`
- [ ] Database seeded: Run `node dist/prisma/seed.js` (once)
- [ ] API running: http://localhost:4000/api/v1/health returns `{"status":"ok"}`
- [ ] Frontend running: http://localhost:3000 loads
- [ ] Prisma Studio (optional): http://localhost:51212 opens

---

## 💡 Tips

1. **Keep servers in separate terminals** - Easier to see logs and troubleshoot
2. **Watch API logs** - They show debug information like `[CoursesService]` logs
3. **Use Prisma Studio** - Quick way to inspect/edit database records
4. **Restart servers after code changes:**
   - API: Rebuild (`npm run build`) then restart
   - Frontend: Turbopack auto-reloads (no restart needed)
5. **Check browser console** - Frontend errors show here
6. **Redis warning is safe** - The "Use Redis 6.2.0+" warning is non-critical

---

## 🆘 Still Having Issues?

1. **Read the error message carefully** - It usually tells you what's wrong
2. **Check logs:**
   - API: Terminal running `node dist/src/main`
   - Frontend: Terminal running `next dev`
   - PostgreSQL: `C:\Program Files\PostgreSQL\18\data\logfile`
3. **Verify ports:** `Get-NetTCPConnection -State Listen`
4. **Kill all and restart:** Follow "Stop All Servers" section above
5. **Check environment files:** Ensure `.env` files have correct values

---

## 🚀 Performance Tips

1. **Memory Management:**
   - `--max-old-space-size=512` limits memory to 512MB
   - Increase if needed: `--max-old-space-size=1024`

2. **Keep PostgreSQL & Redis Running:**
   - Start once as Windows services
   - They persist across development sessions
   - No need to restart unless system reboots

3. **Fast Restart After Code Changes:**
   - Frontend: Auto-reloads (no action needed)
   - API: Quick rebuild (`npm run build`) + restart

4. **Database Inspection:**
   - Use Prisma Studio for quick edits
   - Much faster than writing SQL queries

5. **Multiple Projects:**
   - Change ports in `.env` files if running multiple projects
   - Example: Use 4001, 4002 for other APIs

---

## 📞 Support & Resources

- **Documentation:** `README.md` in project root
- **API Docs:** http://localhost:4000/api/v1 (when running)
- **Database Schema:** `apps/api/prisma/schema.prisma`
- **Environment Variables:** See `.env.example` files

### Useful Commands Reference

```powershell
# Check what's running
Get-Process -Name node,redis-server,postgres -ErrorAction SilentlyContinue

# Check all listening ports
Get-NetTCPConnection -State Listen | Select-Object LocalPort,State

# Kill all Node processes
Get-Process -Name node | Stop-Process -Force

# View last 50 lines of API logs (if logged to file)
Get-Content apps/api/api.log -Tail 50 -Wait

# Rebuild everything
npm run build

# Clean install (if packages are corrupted)
Remove-Item -Recurse -Force node_modules
npm install
```

---

**Last Updated:** October 12, 2026  
**Project:** Lor Mentor Medical Education Platform  
**Version:** 1.0  

> **💚 Happy Developing!** If you encounter issues not covered here, check the API/Frontend logs first - they usually tell you exactly what's wrong.

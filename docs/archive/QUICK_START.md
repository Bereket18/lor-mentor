# ⚡ Quick Start Guide

## Start Development (Copy & Paste)

Open **4 separate terminals** and run these commands:

### Terminal 1 - PostgreSQL
```powershell
Start-Service postgresql-x64-18
```

### Terminal 2 - Redis
```powershell
& "C:\Program Files\Redis\redis-server.exe" --port 6379 --stop-writes-on-bgsave-error no --save ""
```

### Terminal 3 - API
```powershell
cd C:\Users\berek\Desktop\Lor-mentor\lor-mentor\apps\api
node --max-old-space-size=512 dist/src/main
```

### Terminal 4 - Frontend
```powershell
cd C:\Users\berek\Desktop\Lor-mentor\lor-mentor\apps\web
node --max-old-space-size=512 ../../node_modules/next/dist/bin/next dev
```

### Terminal 5 (Optional) - Database GUI
```powershell
cd C:\Users\berek\Desktop\Lor-mentor\lor-mentor\apps\api
npx prisma studio
```

---

## ✅ Verify Everything Works

Open these URLs:
- **Frontend:** http://localhost:3000
- **API Health:** http://localhost:4000/api/v1/health
- **Prisma Studio:** http://localhost:51212 (if started)

---

## 🛑 Stop All Servers

```powershell
# Kill all Node servers
Get-Process -Name node | Stop-Process -Force

# Stop PostgreSQL
Stop-Service postgresql-x64-18
```

---

## 🐛 Common Issues

### Port Already in Use
```powershell
# Kill specific port (example: 4000)
Get-Process -Id (Get-NetTCPConnection -LocalPort 4000).OwningProcess | Stop-Process -Force
```

### API Won't Start
```powershell
# Rebuild
cd C:\Users\berek\Desktop\Lor-mentor\lor-mentor\apps\api
npm run build
```

### Database Connection Error
```powershell
# Check PostgreSQL is running
& "C:\Program Files\PostgreSQL\18\bin\pg_isready.exe" -U postgres

# Apply migrations if needed
cd C:\Users\berek\Desktop\Lor-mentor\lor-mentor\apps\api
npx prisma migrate deploy
```

---

**For detailed troubleshooting, see `SERVER_STARTUP.md`**

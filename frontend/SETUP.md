# Getting Started — Pantheon Dashboard

## Starting Services

The dashboard connects to **Hephaestus** (Sandbox API) via WebSocket. You need to start the backend services first.

### Local Development (With Docker)

```bash
# From project root
cd sandbox
python main.py
```

This starts the Hephaestus service on `http://localhost:9000`

### Local Development (Without Docker)

If running Python locally:

```bash
cd /Users/sairamen/projects/pantheon
uv sync
uv run python sandbox/main.py
```

Verify the service is running:

```bash
curl http://localhost:9000/sandbox/health
# Should return: {"status": "healthy"}
```

## Frontend Configuration

### .env.local

The frontend needs to know where to find Hephaestus:

```bash
# frontend/.env.local
NEXT_PUBLIC_SANDBOX_URL=http://localhost:9000
```

Available ports:
- **localhost:9000** — default (Docker or local Python)
- **localhost:8000** — if running on alternate port
- **https://domain.com** — production

### Start Frontend

```bash
cd frontend
npm install
npm run dev
```

Open: http://localhost:3000/dashboard

The dashboard will:
1. Show **Offline** (amber) if Hephaestus isn't running ← This is normal
2. Show **Connected** (green) once Hephaestus starts
3. Auto-reconnect with exponential backoff every 2-10 seconds

## Testing the Connection

### Manual Test

```bash
# In browser DevTools console
fetch('http://localhost:9000/sandbox/health')
  .then(r => r.json())
  .then(console.log)
```

### Check WebSocket URL

The dashboard converts:
- `http://localhost:9000` → `ws://localhost:9000/ws`
- `https://domain.com` → `wss://domain.com/ws`

Watch the browser console for:
```
[Pantheon WS] Configured to connect to: ws://localhost:9000/ws
[Pantheon WS] Attempting connection to ws://localhost:9000/ws...
[Pantheon WS] ✓ Connected to ws://localhost:9000/ws
```

## Debugging Connection Issues

### Issue: "Waiting for Hephaestus..."

**Cause**: Service not running or wrong URL in `.env.local`

**Fix**:
1. Check `.env.local` has correct `NEXT_PUBLIC_SANDBOX_URL`
2. Verify service is running: `curl http://localhost:9000/sandbox/health`
3. Restart frontend: `npm run dev`

### Issue: CORS Errors

**Cause**: Hephaestus not configured for WebSocket CORS

**Fix**:
Ensure `sandbox/main.py` has:
```python
@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.subscribe(websocket)
```

### Issue: Connection Timeout

**Cause**: Firewall or network issue

**Fix**:
1. Ensure no firewall blocking port 9000
2. Use `localhost` not `127.0.0.1` on some systems
3. Check shared network if on VPN

## Next Steps

1. **Start Hephaestus**:
   ```bash
   uv run python sandbox/main.py
   ```

2. **Verify health**:
   ```bash
   curl http://localhost:9000/sandbox/health
   ```

3. **Start Frontend**:
   ```bash
   cd frontend && npm run dev
   ```

4. **Confirm Connection**: Check dashboard shows "Connected" (green) in top right

5. **Test Analysis**:
   - Submit a malware sample via Hermes (Telegram) or directly to Hephaestus
   - Watch agents execute in parallel
   - Monitor real-time events in the dashboard

## Architecture

```
┌─────────────────────┐
│   Next.js Frontend  │
│   (ProfessionalDashboard)
└─────────┬───────────┘
          │ WebSocket /ws
          ├─ http://localhost:9000
          └─ Automatic reconnect on failure (2s, 4s, 6s, 8s, 10s)
┌─────────┴───────────┐
│  Hephaestus (FastAPI)
│  - EventBus pub/sub
│  - Docker sandbox lifecycle
│  - Job orchestration
└─────────────────────┘
```

## Advanced: Development Without Live Service

If you want to test the UI without Hephaestus running, you can manually inject events:

```javascript
// Browser console
const { getEventStore } = await import('/src/lib/event-store.ts');
const store = getEventStore();

store.addEvent({
  type: 'AGENT_ACTIVATED',
  timestamp: new Date().toISOString(),
  agent: 'hades',
  payload: { step: 'dynamic_analysis' }
});
```

But for real testing, **always start Hephaestus first**.

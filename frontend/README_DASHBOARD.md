# Pantheon Frontend — Real-Time Malware Analysis Dashboard

Ultra-detailed, professional visualization of the agent swarm analyzing malware in real-time.

## Features

### 🎯 Live Agent Pipeline
- **Visual workflow**: Zeus → Athena → Hades → Apollo → Ares
- **Status indicators**: Idle (⚪), Active (🔴), Complete (✅), Error (❌)
- **Event counts**: Track which agents have processed the most events

### 📊 System Overview
- **Active agents**: Count of agents currently running
- **Completed analyses**: Number of finished agent tasks
- **Total events**: Real-time event stream from the swarm
- **IOC count**: Indicators of Compromise discovered

### 🔴 Live Event Feed
- **Real-time stream**: All PantheonEvents from EventBus
- **Event types**: AGENT_ACTIVATED, TOOL_CALLED, STAGE_UNLOCKED, IOC_DISCOVERED, HANDOFF, etc.
- **Expandable payloads**: Click to see detailed event data
- **Timestamps**: Formatted "X seconds ago" for easy scanning
- **Color-coded**: Event types color-coded for quick identification

### ⚔️ Attack Chain Reconstruction
- **Stages discovered**: Displays each discovered attack stage as it's unlocked
- **Stage metadata**: Label, description, icon, and timestamp
- **Connection visualization**: Visual flow showing progression through attack chain

### 🚨 IOC Tracker (Indicators of Compromise)
- **Type filtering**: Filter by severity (Critical, High, Medium, Low)
- **All IOC types supported**: IPs, domains, file paths, registry keys, URLs, hashes
- **Severity breakdown**: Quick stats showing distribution

### 📱 Responsive Design
- **Desktop**: 3-column layout (Graph, Attack Chain + IOCs, Event Feed)
- **Tablet/Mobile**: 1-column responsive stack
- **Dark theme**: Optimized for security operations centers

## Architecture

### Event Store (`src/lib/event-store.ts`)
Centralized, reactive state management:
- Tracks agent status (idle, active, complete, error)
- Maintains event history
- Discovers attack stages
- Collects IOCs
- Provides subscription API for components

### WebSocket Client (`src/lib/pantheon-ws.ts`)
Connects to Hephaestus EventBus:
- Automatic reconnection with exponential backoff
- Parses incoming PantheonEvent messages
- Dispatches to EventStore
- Error handling and logging

### Dashboard Components

**UltraDashboard.tsx** — Main container
- Header with connection status
- QuickStats cards
- AgentCard grid 
- 3-column layout (AgentGraph, Attack Chain + IOCs, Event Feed)

**AgentGraph.tsx** — Pipeline visualization
- SVG-based agent flow diagram
- State indicators and event counts
- Color-coded agents

**EventFeed.tsx** — Real-time event stream
- Scrollable event list (latest first)
- Event icons and colors
- Expandable payload details
- Job ID tracking

**AttackChain.tsx** — Attack stage timeline
- Vertical flow of discovered stages
- Icons and descriptions
- Timestamps

**IOCTracker.tsx** — Indicator management
- Severity filter buttons
- IOC type icons
- Context and source attribution
- Summary statistics

## Setup

### Prerequisites
- Node.js 18+
- Next.js 16.2+
- Tailwind CSS 4+

### Installation

```bash
cd frontend
npm install
# or
pnpm install
```

### Environment

Copy `.env.example` to `.env.local`:

```bash
cp .env.example .env.local
```

Edit `.env.local`:

```
NEXT_PUBLIC_SANDBOX_URL=http://localhost:9000
```

For production, point to your Hephaestus service:
```
NEXT_PUBLIC_SANDBOX_URL=https://pantheon.mycompany.com
```

### Development

```bash
npm run dev
```

Open [http://localhost:3000/dashboard](http://localhost:3000/dashboard)

### Build

```bash
npm run build
npm start
```

## Event Stream

The dashboard subscribes to `GET /ws` on the Hephaestus service (Sandbox API).

Events are PantheonEvent objects with:
- `type`: EventType (AGENT_ACTIVATED, TOOL_CALLED, STAGE_UNLOCKED, IOC_DISCOVERED, etc.)
- `timestamp`: ISO 8601 string
- `agent`: Agent name (zeus, athena, hades, apollo, ares, hermes, artemis, hephaestus)
- `tool`: Tool name (if tool event)
- `job_id`: Unique job ID (for tracking through pipeline)
- `payload`: Event-specific data

## Customization

### Colors
Update agent colors in `UltraDashboard.tsx`:

```tsx
const agentColors = {
  zeus: { bg: 'bg-amber-500/10', text: 'text-amber-400', border: 'border-amber-500/30' },
  // ...
};
```

### Event Icons
Update in `EventFeed.tsx`:

```tsx
const getEventIcon = (type: string) => {
  switch (type) {
    case 'AGENT_ACTIVATED': return '🚀';
    // ...
  }
};
```

### Layout
Adjust the 3-column grid in `UltraDashboard.tsx`:

```tsx
<div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
  {/* Left: Agent Graph */}
  <div className="lg:col-span-1">
  {/* Middle: Attack Chain & IOCs */}
  <div className="lg:col-span-1">
  {/* Right: Event Feed */}
  <div className="lg:col-span-1">
</div>
```

## Performance

- **Event deduplication**: EventStore uses timestamp + index as key
- **Subscription optimization**: Components subscribe only to store changes, not re-render on every event
- **Scroll performance**: Event feed has max-height with overflow-y-auto for efficient rendering
- **WebSocket backpressure**: Reconnection with exponential backoff prevents flood

## Troubleshooting

### WebSocket Connection Failed
- Check NEXT_PUBLIC_SANDBOX_URL is correctly set
- Verify Hephaestus service is running (`http://localhost:9000/sandbox/health`)
- Check CORS headers if using different domain

### Events Not Appearing
- Open browser DevTools → Network tab
- Check WebSocket connection (`WS` filter)
- Look for errors in console

### Dashboard Looks Broken
- Clear browser cache: Ctrl+Shift+Delete (Cmd+Shift+Delete on Mac)
- Ensure Tailwind CSS is built: `npm run build`
- Check that all environment variables are set

## Performance Monitoring

Get real-time stats:

```typescript
const store = getEventStore();
const stats = store.getStatistics();
console.log(stats);
// {
//   total_events: 142,
//   agents_active: 2,
//   agents_complete: 3,
//   agents_idle: 3,
//   total_iocs: 8,
//   critical_iocs: 2,
//   stages_discovered: 3
// }
```

## Future Enhancements

- [ ] Process tree visualization (expandable hierarchy)
- [ ] Network graph showing C2 connections
- [ ] IOC export (CSV, JSON, STIX format)
- [ ] Job history/replay
- [ ] Custom event filters
- [ ] Dark/light theme toggle
- [ ] Multi-job dashboard (side-by-side comparison)

## License

Part of Pantheon — HackUSF 2026

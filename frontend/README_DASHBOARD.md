# Pantheon Dashboard — Professional Real-Time Analysis Visualizer

Minimal, elegant visualization of parallel malware analysis agents working simultaneously.

## Design Philosophy

**No "cyber colors"** — This is data, not decoration. The dashboard uses:
- **Slate grays & whites** for primary hierarchy
- **Single accent colors** (teal for active, emerald for complete, red for critical)
- **Clean typography** with clear visual distinction
- **No glowing effects, pulsing, or gratuitous animations**
- **Information-first layout** — every pixel serves readability

Think Bloomberg Terminal, not movie hacker aesthetics.

## Architecture: Parallel Agents

Unlike sequential pipelines, **agents execute in parallel**:

```
Job (Zeus coordinates)
├─ Athena (Triage) — runs simultaneously
├─ Hades (Analysis) — runs simultaneously  
├─ Apollo (Enrichment) — runs simultaneously
└─ Ares (Remediation) — runs simultaneously
```

Agents don't wait for each other. Analysis happens concurrently, and events stream in real-time as agents complete their work.

## Features

### 📋 Left Sidebar
- **Job Overview**: Current job ID, status, creation time, event count
- **IOC Indicators**: Severity-filtered list (Critical, High, Medium, Low) with counts

### 🎯 Main Panel: Parallel Agent Execution
- **Quick Stats**: Active agents, completed tasks, total events
- **Agent Grid**: 2×3 view of all agents (Zeus, Athena, Hades, Apollo, Ares, Hermes)
  - Each card shows: agent name, role, current task, event count
  - Status indicators: ▶ (active), ✓ (complete), ✕ (error), – (idle)
  - Subtle background colors indicate state (no neon)

### 🔄 Activity Stream
- **Real-time event log** (newest first)
- **Expandable event details** — click to see payload
- **Simple icon labels** — no color-coding, just clarity
- **Relative timestamps** — "5s ago", "2m ago"

## Layout

```
┌─────────────────────────────────────────────────┐
│ Pantheon Analysis  [Connected]                  │
└─────────────────────────────────────────────────┘
┌──────────────┐  ┌──────────────────────────────┐
│ Job Overview │  │ Quick Stats (3 cards)        │
├──────────────┤  ├──────────────────────────────┤
│ Job ID       │  │ Parallel Agent Grid (2×3)    │
│ Status       │  │ ├─ Zeus (Orchestrator)       │
│ Created      │  │ ├─ Athena (Triage)           │
│ Events       │  │ ├─ Hades (Analysis)          │
├──────────────┤  │ ├─ Apollo (Enrichment)       │
│ IOCs         │  │ ├─ Ares (Remediation)        │
│ [5 Critical] │  │ └─ Hermes (Telegram)         │
│ [2 High]     │  ├──────────────────────────────┤
│ [3 Medium]   │  │ Activity Stream              │
│             │  │ ▶ Agent Started [athena]     │
│ Indicators  │  │ ⚙ Tool Invoked [sandbox]     │
│ ─────────── │  │ ▶ Agent Started [hades]      │
│ 1.2.3.4:445 │  │ ... (expandable)              │
│ evil.com    │  │                              │
│ [registry]  │  │                              │
└──────────────┘  └──────────────────────────────┘
```

On mobile: single column, all sections stack vertically.

## Components

### ProfessionalDashboard.tsx (Main Container)
- Manages EventStore lifecycle and WebSocket connection
- Renders: Header, left sidebar (Job + IOCs), main panel (Stats + Agents + Activity)
- Responsive grid layout (1 col mobile, 4 col desktop)

### JobOverview.tsx (Job Details)
- Shows current job metadata
- Status: PENDING, ANALYZING, COMPLETE, ERROR
- Real-time event count

### AgentGrid.tsx (Parallel Execution View)
- 2×3 grid of agent cards
- Icons: ▶ Zap (Zeus), 👁️ Eye (Athena), 🚨 Siren (Hades), ☀️ Sun (Apollo), 🛡️ Shield (Ares)
- State colors: teal (active), emerald (complete), red (error), slate (idle)
- Shows current task for each agent

### ActivityStream.tsx (Event Log)
- Scrollable, reversed chronological order (newest first)
- Event icons: ▶ started, ✓ completed, ⚙ tool, → handoff, ⚠ ioc, × error
- Click to expand event payload (JSON)
- Relative timestamps

### IOCPanel.tsx (Indicators Sidebar)
- Summary stats: Total, Critical count
- Filter tabs: All, Critical, High, Medium, Low
- Lists IOCs with severity badge and context
- Max height with scrolling

## Setup

### Prerequisites
- Node.js 18+
- Next.js 16.2+
- Tailwind CSS 4+

### Installation

```bash
cd frontend
npm install
```

### Environment

Copy `.env.example` to `.env.local`:

```bash
cp .env.example .env.local
```

Edit with your Hephaestus sandbox URL:

```
NEXT_PUBLIC_SANDBOX_URL=http://localhost:9000
```

For production:

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

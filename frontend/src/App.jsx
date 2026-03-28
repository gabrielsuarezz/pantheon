import React from "react";

const activity = [
  {
    time: "09:14",
    title: "Sample ingested",
    detail: "Hephaestus staged the payload in a sealed container."
  },
  {
    time: "09:15",
    title: "Deobfuscation",
    detail: "Athena isolated JavaScript string arrays and decoded 214 tokens."
  },
  {
    time: "09:16",
    title: "Behavioral capture",
    detail: "Artemis recorded simulated WScript calls and registry writes."
  },
  {
    time: "09:18",
    title: "IOC extraction",
    detail: "Apollo detected 6 domains, 2 IPs, and 3 persistence keys."
  },
  {
    time: "09:20",
    title: "Containment plan",
    detail: "Ares prepared host isolation and network block steps."
  }
];

export default function App() {
  return (
    <div className="app">
      <header className="topbar">
        <div>
          <p className="eyebrow">Pantheon</p>
          <h1>Agentic Malware Intelligence</h1>
        </div>
        <div className="topbar-actions">
          <button className="btn ghost">Archive Case</button>
          <button className="btn">Escalate Response</button>
        </div>
      </header>

      <section className="grid">
        <div className="card threat">
          <div className="threat-header">
            <p className="label">Threat Overview</p>
            <span className="status critical">High Risk</span>
          </div>
          <div className="threat-score">
            <div>
              <p className="score">92%</p>
              <p className="score-sub">Confidence score</p>
            </div>
            <div className="meta">
              <div>
                <p className="label">Family</p>
                <p className="value">Oblique Druid</p>
              </div>
              <div>
                <p className="label">Vector</p>
                <p className="value">Trojanized installer</p>
              </div>
              <div>
                <p className="label">Target</p>
                <p className="value">Windows endpoints</p>
              </div>
            </div>
          </div>
          <div className="threat-footer">
            <div className="pill">C2 Active</div>
            <div className="pill">Persistence Attempted</div>
            <div className="pill">Credential Access</div>
          </div>
        </div>

        <div className="card agent-state">
          <div className="card-header">
            <p className="label">Active Agents</p>
            <span className="status live">Live</span>
          </div>
          <div className="agent-list">
            <div className="agent-row">
              <div>
                <p className="agent">Zeus</p>
                <p className="agent-desc">Orchestration in progress</p>
              </div>
              <span className="agent-state-pill">Coordinating</span>
            </div>
            <div className="agent-row">
              <div>
                <p className="agent">Hades</p>
                <p className="agent-desc">Dynamic analysis at 68%</p>
              </div>
              <span className="agent-state-pill active">Analyzing</span>
            </div>
            <div className="agent-row">
              <div>
                <p className="agent">Apollo</p>
                <p className="agent-desc">IOC enrichment queued</p>
              </div>
              <span className="agent-state-pill">Queued</span>
            </div>
          </div>
          <div className="input-wrap">
            <input placeholder="Send a directive to Zeus" />
            <button className="btn small">Dispatch</button>
          </div>
        </div>

        <div className="card feed">
          <div className="card-header">
            <p className="label">Agentic Activity Feed</p>
            <span className="label subtle">Last 12 minutes</span>
          </div>
          <div className="timeline">
            {activity.map((item) => (
              <div key={item.title} className="timeline-item">
                <div className="dot" />
                <div>
                  <div className="timeline-header">
                    <p className="timeline-title">{item.title}</p>
                    <span className="timeline-time">{item.time}</span>
                  </div>
                  <p className="timeline-detail">{item.detail}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="card graph">
          <div className="card-header">
            <p className="label">Malware Detonation Graph</p>
            <span className="label subtle">Simplified runtime map</span>
          </div>
          <div className="graph-wrap">
            <svg viewBox="0 0 520 240" role="img" aria-label="Detonation graph">
              <path
                d="M60 120 C140 40, 220 40, 300 110"
                fill="none"
                stroke="rgba(194, 101, 42, 0.5)"
                strokeWidth="2"
              />
              <path
                d="M300 110 C360 160, 430 170, 480 120"
                fill="none"
                stroke="rgba(140, 60, 60, 0.45)"
                strokeWidth="2"
              />
              <circle cx="60" cy="120" r="16" fill="#c2652a" />
              <circle cx="190" cy="70" r="12" fill="#c2652a" opacity="0.85" />
              <circle cx="300" cy="110" r="18" fill="#8c3c3c" opacity="0.9" />
              <circle cx="410" cy="150" r="12" fill="#c2652a" opacity="0.7" />
              <circle cx="480" cy="120" r="14" fill="#8c3c3c" opacity="0.8" />
              <text x="52" y="155">Ingress</text>
              <text x="165" y="45">Decode</text>
              <text x="275" y="145">Registry</text>
              <text x="388" y="185">Dropper</text>
              <text x="455" y="95">Beacon</text>
            </svg>
          </div>
          <div className="graph-legend">
            <div className="legend-item">
              <span className="legend-dot sienna" />
              <span>Execution pivot</span>
            </div>
            <div className="legend-item">
              <span className="legend-dot rose" />
              <span>Critical node</span>
            </div>
          </div>
        </div>

        <div className="card ioc">
          <div className="card-header">
            <p className="label">Key Indicators</p>
            <span className="label subtle">Curated sample</span>
          </div>
          <div className="ioc-grid">
            <div>
              <p className="label">Suspicious Domains</p>
              <p className="mono">veil-halo.net</p>
              <p className="mono">mirror-castle.io</p>
              <p className="mono">blackwell-portal.cc</p>
            </div>
            <div>
              <p className="label">Dropped Files</p>
              <p className="mono">C:\\ProgramData\\System\\wmi.dll</p>
              <p className="mono">C:\\Users\\Public\\svc.exe</p>
            </div>
            <div>
              <p className="label">Registry Keys</p>
              <p className="mono">HKCU\\Software\\Microsoft\\Run\\L0g1n</p>
              <p className="mono">HKLM\\SYSTEM\\ControlSet\\Services\\WMI</p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

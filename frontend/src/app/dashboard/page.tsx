import React from "react";
import Link from "next/link";
import { ArrowLeft, ShieldAlert, Cpu, Activity, Zap, Terminal, Database } from "lucide-react";

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

export default function DashboardPage() {
  return (
    <div className="p-6 md:p-12 lg:p-16 max-w-[1400px] mx-auto w-full">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12">
        <div>
          <div className="flex items-center gap-4 mb-2">
            <Link href="/" className="text-muted hover:text-ink transition-colors flex items-center gap-1 text-sm font-semibold">
              <ArrowLeft className="w-4 h-4" /> Home
            </Link>
            <p className="tracking-[0.3em] text-[0.7rem] uppercase text-muted font-bold">Pantheon</p>
          </div>
          <h1 className="font-serif text-3xl md:text-5xl tracking-tight text-ink font-bold">Agentic Malware Intelligence</h1>
        </div>
        <div className="flex gap-3 w-full md:w-auto">
          <button className="flex-1 md:flex-none border border-border-subtle text-sienna hover:bg-sienna/5 px-5 py-2.5 rounded-lg font-semibold text-sm transition-colors">
            Archive Case
          </button>
          <button className="flex-1 md:flex-none bg-sienna hover:bg-[#a35322] text-white px-5 py-2.5 rounded-lg font-semibold text-sm shadow-warm transition-transform active:scale-95">
            Escalate Response
          </button>
        </div>
      </header>

      <section className="grid grid-cols-1 block md:grid-cols-12 gap-6">
        {/* Threat Overview */}
        <div className="col-span-1 md:col-span-7 bg-card border border-border-subtle rounded-2xl p-8 shadow-warm flex flex-col justify-between">
          <div className="flex items-center justify-between mb-8">
            <p className="text-xs tracking-widest uppercase text-muted font-bold flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-rose" /> Threat Overview
            </p>
            <span className="text-xs px-3 py-1.5 rounded-full border border-rose/30 bg-rose/10 text-rose font-bold">
              High Risk
            </span>
          </div>
          
          <div className="flex flex-col sm:flex-row justify-between gap-6 items-start lg:items-center">
            <div>
              <p className="font-serif text-[clamp(2.8rem,4vw,4rem)] text-ink leading-none tracking-tight font-bold mb-1">92%</p>
              <p className="text-muted text-sm font-medium">Confidence score</p>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 w-full max-w-lg">
              <div>
                <p className="text-xs tracking-widest uppercase text-muted font-bold mb-1">Family</p>
                <p className="font-semibold text-ink">Oblique Druid</p>
              </div>
              <div>
                <p className="text-xs tracking-widest uppercase text-muted font-bold mb-1">Vector</p>
                <p className="font-semibold text-ink">Trojanized ISO</p>
              </div>
              <div>
                <p className="text-xs tracking-widest uppercase text-muted font-bold mb-1">Target</p>
                <p className="font-semibold text-ink">Windows Host</p>
              </div>
            </div>
          </div>
          
          <div className="flex gap-3 flex-wrap mt-8">
            <div className="bg-sienna/10 text-sienna px-3 py-2 rounded-full font-bold text-xs">C2 Active</div>
            <div className="bg-sienna/10 text-sienna px-3 py-2 rounded-full font-bold text-xs">Persistence Attempted</div>
            <div className="bg-sienna/10 text-sienna px-3 py-2 rounded-full font-bold text-xs">Credential Access</div>
          </div>
        </div>

        {/* Active Agents */}
        <div className="col-span-1 md:col-span-5 bg-card border border-border-subtle rounded-2xl p-8 shadow-warm flex flex-col justify-between">
          <div className="flex items-center justify-between mb-8">
            <p className="text-xs tracking-widest uppercase text-muted font-bold flex items-center gap-2">
              <Cpu className="w-4 h-4 text-sienna" /> Active Agents
            </p>
            <span className="text-xs px-3 py-1.5 rounded-full border border-sienna/30 bg-sienna/10 text-sienna font-bold flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-sienna animate-pulse"></span>
              Live Pipeline
            </span>
          </div>
          
          <div className="flex flex-col gap-5 flex-1 justify-center">
            <div className="flex justify-between items-center group">
              <div className="flex gap-3 items-center">
                <div className="w-10 h-10 rounded-lg bg-linen border border-border-subtle flex items-center justify-center group-hover:bg-white transition-colors">
                  <Terminal className="w-5 h-5 text-ink" />
                </div>
                <div>
                  <p className="font-bold text-ink">Zeus</p>
                  <p className="text-muted text-xs">Orchestration in progress</p>
                </div>
              </div>
              <span className="text-[0.65rem] border border-border-subtle text-muted px-2.5 py-1 rounded-full uppercase font-bold tracking-widest">Coordinating</span>
            </div>
            
            <div className="flex justify-between items-center group">
              <div className="flex gap-3 items-center">
                <div className="w-10 h-10 rounded-lg bg-white border border-border-subtle shadow-sm flex items-center justify-center text-rose relative overflow-hidden">
                  <Activity className="w-5 h-5 relative z-10" />
                  <div className="absolute inset-0 bg-rose/10 -z-0"></div>
                </div>
                <div>
                  <p className="font-bold text-ink">Hades</p>
                  <p className="text-muted text-xs">Dynamic analysis at 68%</p>
                </div>
              </div>
              <span className="text-[0.65rem] border border-rose/30 bg-rose/10 text-rose px-2.5 py-1 rounded-full uppercase font-bold tracking-widest relative">
                <span className="absolute -left-1 -top-1 w-2 h-2 bg-rose rounded-full animate-ping opacity-50"></span>
                <span className="absolute -left-1 -top-1 w-2 h-2 bg-rose rounded-full"></span>
                Analyzing
              </span>
            </div>
            
            <div className="flex justify-between items-center group">
              <div className="flex gap-3 items-center">
                <div className="w-10 h-10 rounded-lg bg-linen border border-border-subtle flex items-center justify-center transition-colors">
                  <Activity className="w-5 h-5 text-muted" />
                </div>
                <div>
                  <p className="font-bold text-ink opacity-70">Apollo</p>
                  <p className="text-muted text-xs opacity-70">IOC enrichment queued</p>
                </div>
              </div>
              <span className="text-[0.65rem] border border-border-subtle text-muted px-2.5 py-1 rounded-full uppercase font-bold tracking-widest opacity-60">Queued</span>
            </div>
          </div>
          
          <div className="flex gap-3 mt-8">
            <input 
              type="text" 
              placeholder="Send a directive to Zeus..." 
              className="flex-1 border border-border-subtle rounded-lg px-4 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-sienna/40 focus:border-sienna transition-shadow"
            />
            <button className="bg-ink hover:bg-[#2a221d] text-white px-4 py-2 rounded-lg font-semibold text-sm transition-transform active:scale-95 whitespace-nowrap">
              Dispatch
            </button>
          </div>
        </div>

        {/* Activity Feed */}
        <div className="col-span-1 md:col-span-7 bg-card border border-border-subtle rounded-2xl p-8 shadow-warm">
          <div className="flex items-center justify-between mb-8">
            <p className="text-xs tracking-widest uppercase text-muted font-bold flex items-center gap-2">
              <Zap className="w-4 h-4 text-sienna" /> Agentic Activity Feed
            </p>
            <span className="text-xs text-muted font-medium">Last 12 minutes</span>
          </div>
          
          <div className="relative border-l border-border-subtle ml-3 space-y-8 pb-4">
            {activity.map((item, idx) => (
              <div key={idx} className="relative pl-6">
                <div className={`absolute -left-[5px] top-1 w-2.5 h-2.5 rounded-full ring-4 ring-card ${idx === activity.length - 1 ? 'bg-sienna animate-pulse' : 'bg-muted/40'}`}></div>
                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-baseline gap-1 mb-1">
                  <p className="font-bold text-ink shrink-0">{item.title}</p>
                  <p className="text-xs font-mono text-muted">{item.time}</p>
                </div>
                <p className="text-sm text-muted leading-relaxed">{item.detail}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Detonation Graph Placeholder */}
        <div className="col-span-1 md:col-span-5 bg-card border border-border-subtle rounded-2xl p-8 shadow-warm flex flex-col">
          <div className="flex items-center justify-between mb-8">
            <p className="text-xs tracking-widest uppercase text-muted font-bold flex items-center gap-2">
              <Activity className="w-4 h-4 text-ink" /> Malware Detonation Map
            </p>
            <span className="text-xs text-muted font-medium">Simplified runtime</span>
          </div>
          
          <div className="flex-1 bg-white border border-border-subtle rounded-xl p-6 min-h-[220px] relative flex flex-col justify-end overflow-hidden">
             {/* The SVG from App.jsx nicely styled */}
             <svg className="absolute inset-0 w-full h-full object-cover opacity-80" viewBox="0 0 520 240" role="img" aria-label="Detonation graph">
              <path d="M60 120 C140 40, 220 40, 300 110" fill="none" stroke="rgba(194, 101, 42, 0.4)" strokeWidth="3" strokeDasharray="4 4"/>
              <path d="M300 110 C360 160, 430 170, 480 120" fill="none" stroke="rgba(140, 60, 60, 0.45)" strokeWidth="3" />
              <circle cx="60" cy="120" r="14" fill="#6b5e55" opacity="0.5"/>
              <circle cx="190" cy="70" r="10" fill="#c2652a" opacity="0.6" />
              <circle cx="300" cy="110" r="16" fill="#8c3c3c" opacity="0.9" />
              <circle cx="410" cy="150" r="10" fill="#c2652a" opacity="0.6" />
              <circle cx="480" cy="120" r="12" fill="#8c3c3c" opacity="0.8" />
              
              <text x="52" y="155" fill="#6b5e55" fontSize="12" fontFamily="var(--font-mono)">Ingress</text>
              <text x="165" y="45" fill="#c2652a" fontSize="12" fontFamily="var(--font-mono)">Decode</text>
              <text x="275" y="145" fill="#8c3c3c" fontSize="14" fontWeight="bold" fontFamily="var(--font-mono)">Registry</text>
              <text x="388" y="185" fill="#c2652a" fontSize="12" fontFamily="var(--font-mono)">Dropper</text>
              <text x="455" y="95" fill="#8c3c3c" fontSize="12" fontFamily="var(--font-mono)">Beacon</text>
            </svg>
          </div>
          
          <div className="flex gap-6 mt-6 pt-6 border-t border-border-subtle">
            <div className="flex items-center gap-2 text-xs font-semibold text-muted tracking-wider uppercase">
              <span className="w-2.5 h-2.5 rounded-full bg-sienna"></span> Execution pivot
            </div>
            <div className="flex items-center gap-2 text-xs font-semibold text-muted tracking-wider uppercase">
              <span className="w-2.5 h-2.5 rounded-full bg-rose"></span> Critical node
            </div>
          </div>
        </div>

        {/* Key Indicators of Compromise */}
        <div className="col-span-1 md:col-span-12 bg-card border border-border-subtle rounded-2xl p-8 shadow-warm">
          <div className="flex items-center justify-between mb-8">
            <p className="text-xs tracking-widest uppercase text-muted font-bold flex items-center gap-2">
              <Database className="w-4 h-4 text-ink" /> Key Indicators
            </p>
            <span className="text-xs text-muted font-medium">Curated sample</span>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-12">
            <div>
              <p className="text-xs font-bold text-ink uppercase tracking-wider mb-4 border-b border-border-subtle pb-2">Suspicious Domains</p>
              <ul className="space-y-3 font-mono text-sm text-ink/80">
                <li className="flex items-center gap-2"><span className="text-rose">●</span> veil-halo.net</li>
                <li className="flex items-center gap-2"><span className="text-rose">●</span> mirror-castle.io</li>
                <li className="flex items-center gap-2"><span className="text-rose opacity-50">●</span> blackwell-portal.cc</li>
              </ul>
            </div>
            
            <div>
              <p className="text-xs font-bold text-ink uppercase tracking-wider mb-4 border-b border-border-subtle pb-2">Dropped Files</p>
              <ul className="space-y-3 font-mono text-sm text-ink/80">
                <li className="flex items-center gap-2"><span className="text-sienna">●</span> C:\ProgramData\System\wmi.dll</li>
                <li className="flex items-center gap-2"><span className="text-sienna">●</span> C:\Users\Public\svc.exe</li>
              </ul>
            </div>
            
            <div>
              <p className="text-xs font-bold text-ink uppercase tracking-wider mb-4 border-b border-border-subtle pb-2">Registry Keys</p>
              <ul className="space-y-3 font-mono text-sm text-ink/80">
                <li className="break-all flex items-start gap-2"><span className="text-rose mt-1 min-w-[10px]">●</span> HKCU\Software\Microsoft\Run\L0g1n</li>
                <li className="break-all flex items-start gap-2"><span className="text-rose mt-1 min-w-[10px]">●</span> HKLM\SYSTEM\ControlSet\Services\WMI</li>
              </ul>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

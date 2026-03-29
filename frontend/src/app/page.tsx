import Link from "next/link";
import { Shield, Cpu, Activity, Zap, Database } from "lucide-react";

// ─── Greek Design Components ──────────────────────────────────────────────────

function LaurelWreath({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 220 80" className={className} fill="none" aria-hidden="true">
      {/* Left branch */}
      {[0,1,2,3,4,5].map((i) => {
        const x = 20 + i * 14;
        const y = 40 - Math.sin(i * 0.55) * 16;
        const angle = -40 + i * 10;
        return (
          <ellipse
            key={`l${i}`}
            cx={x} cy={y}
            rx="9" ry="5"
            transform={`rotate(${angle} ${x} ${y})`}
            fill="url(#leafGold)"
            opacity={0.75 + i * 0.04}
          />
        );
      })}
      {/* Right branch (mirrored) */}
      {[0,1,2,3,4,5].map((i) => {
        const x = 200 - i * 14;
        const y = 40 - Math.sin(i * 0.55) * 16;
        const angle = 40 - i * 10;
        return (
          <ellipse
            key={`r${i}`}
            cx={x} cy={y}
            rx="9" ry="5"
            transform={`rotate(${angle} ${x} ${y})`}
            fill="url(#leafGold)"
            opacity={0.75 + i * 0.04}
          />
        );
      })}
      {/* Stems */}
      <path d="M20 40 Q60 32 108 42" stroke="#C9A227" strokeWidth="1.5" opacity="0.5" fill="none"/>
      <path d="M200 40 Q160 32 112 42" stroke="#C9A227" strokeWidth="1.5" opacity="0.5" fill="none"/>
      {/* Center knot */}
      <circle cx="110" cy="42" r="5" fill="url(#leafGold)" opacity="0.9"/>
      <defs>
        <linearGradient id="leafGold" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#9A7A10"/>
          <stop offset="50%" stopColor="#F0D060"/>
          <stop offset="100%" stopColor="#C9A227"/>
        </linearGradient>
      </defs>
    </svg>
  );
}

function GreekKeyBorder({ className = "" }: { className?: string }) {
  // Meander/Greek key repeating pattern as SVG
  const unit = 12;
  const pattern = `M0,${unit} L0,0 L${unit*3},0 L${unit*3},${unit*2} L${unit},${unit*2} L${unit},${unit} L${unit*2},${unit} L${unit*2},${unit} `;
  return (
    <svg viewBox="0 0 360 24" className={className} aria-hidden="true" preserveAspectRatio="xMidYMid meet">
      <defs>
        <pattern id="meander" x="0" y="0" width="48" height="24" patternUnits="userSpaceOnUse">
          <path
            d="M0,20 L0,4 L12,4 L12,16 L8,16 L8,8 L20,8 L20,20 L32,20 L32,4 L44,4 L44,20 L48,20"
            fill="none"
            stroke="url(#goldGrad)"
            strokeWidth="1.8"
            strokeLinecap="square"
          />
        </pattern>
        <linearGradient id="goldGrad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#9A7A10" stopOpacity="0.6"/>
          <stop offset="50%" stopColor="#F0D060" stopOpacity="0.9"/>
          <stop offset="100%" stopColor="#9A7A10" stopOpacity="0.6"/>
        </linearGradient>
      </defs>
      <rect width="360" height="24" fill="url(#meander)"/>
    </svg>
  );
}

function GreekColumn({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 60 280" className={className} fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="colGrad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#E8E0CC"/>
          <stop offset="30%" stopColor="#F5F0E8"/>
          <stop offset="60%" stopColor="#FAF7F0"/>
          <stop offset="100%" stopColor="#E0D8C4"/>
        </linearGradient>
        <linearGradient id="colGoldTop" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#9A7A10" stopOpacity="0.7"/>
          <stop offset="50%" stopColor="#F0D060" stopOpacity="0.9"/>
          <stop offset="100%" stopColor="#9A7A10" stopOpacity="0.7"/>
        </linearGradient>
      </defs>
      {/* Capital (top) */}
      <rect x="2" y="0" width="56" height="8" rx="1" fill="url(#colGoldTop)" opacity="0.85"/>
      <rect x="8" y="8" width="44" height="6" rx="1" fill="url(#colGoldTop)" opacity="0.7"/>
      {/* Shaft with fluting */}
      <rect x="14" y="14" width="32" height="240" rx="2" fill="url(#colGrad)" opacity="0.5"/>
      {[16,21,26,31,36,41].map((x, i) => (
        <line key={i} x1={x} y1="14" x2={x} y2="254" stroke="rgba(180,160,100,0.25)" strokeWidth="1"/>
      ))}
      {/* Base */}
      <rect x="8" y="254" width="44" height="8" rx="1" fill="url(#colGoldTop)" opacity="0.7"/>
      <rect x="2" y="262" width="56" height="10" rx="1" fill="url(#colGoldTop)" opacity="0.85"/>
    </svg>
  );
}

function StarField() {
  const stars = [
    {x:5,y:8,d:1.4,delay:0},{x:12,y:22,d:0.9,delay:0.8},{x:18,y:5,d:1.1,delay:1.5},
    {x:25,y:35,d:0.8,delay:0.3},{x:31,y:12,d:1.3,delay:2.1},{x:38,y:28,d:0.7,delay:0.6},
    {x:44,y:8,d:1.0,delay:1.2},{x:51,y:42,d:1.5,delay:0.4},{x:57,y:18,d:0.8,delay:1.8},
    {x:63,y:5,d:1.2,delay:0.9},{x:70,y:33,d:0.7,delay:2.4},{x:76,y:14,d:1.1,delay:0.2},
    {x:82,y:46,d:0.9,delay:1.6},{x:88,y:9,d:1.4,delay:0.7},{x:93,y:28,d:0.8,delay:1.1},
    {x:8,y:55,d:0.7,delay:2.0},{x:20,y:62,d:1.0,delay:0.5},{x:35,y:70,d:1.2,delay:1.3},
    {x:48,y:58,d:0.8,delay:2.2},{x:60,y:75,d:1.1,delay:0.8},{x:72,y:60,d:0.9,delay:1.7},
    {x:85,y:72,d:1.3,delay:0.1},{x:95,y:55,d:0.7,delay:2.5},
  ];
  return (
    <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 100 80" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      {stars.map((s, i) => (
        <circle
          key={i}
          cx={s.x} cy={s.y} r={s.d * 0.4}
          fill="#C9A227"
          style={{ animation: `twinkle ${2.5 + s.delay}s ease-in-out infinite`, animationDelay: `${s.delay}s` }}
        />
      ))}
      {/* Constellation lines */}
      <line x1="5" y1="8" x2="18" y2="5" stroke="#C9A227" strokeWidth="0.15" opacity="0.25"/>
      <line x1="18" y1="5" x2="31" y2="12" stroke="#C9A227" strokeWidth="0.15" opacity="0.25"/>
      <line x1="63" y1="5" x2="76" y2="14" stroke="#C9A227" strokeWidth="0.15" opacity="0.25"/>
      <line x1="76" y1="14" x2="88" y2="9" stroke="#C9A227" strokeWidth="0.15" opacity="0.25"/>
      <line x1="44" y1="8" x2="57" y2="18" stroke="#C9A227" strokeWidth="0.15" opacity="0.20"/>
    </svg>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function LandingPage() {
  return (
    <main className="flex flex-col min-h-screen bg-linen text-ink relative overflow-hidden">
      {/* Marble texture background layers */}
      <div className="absolute inset-0 -z-20"
        style={{
          background: "radial-gradient(ellipse at 15% 20%, rgba(240,208,96,0.06) 0%, transparent 55%), radial-gradient(ellipse at 85% 80%, rgba(201,162,39,0.04) 0%, transparent 55%), linear-gradient(160deg, #FDFCF7 0%, #FAF8EE 50%, #F5F0E0 100%)"
        }}
      />
      {/* Subtle marble veins */}
      <div className="absolute inset-0 -z-19 pointer-events-none opacity-40"
        style={{
          backgroundImage: "repeating-linear-gradient(108deg, transparent 0px, transparent 60px, rgba(201,162,39,0.025) 60px, rgba(201,162,39,0.025) 61px), repeating-linear-gradient(-12deg, transparent 0px, transparent 90px, rgba(201,162,39,0.015) 90px, rgba(201,162,39,0.015) 91px)"
        }}
      />

      {/* Column silhouettes — left */}
      <div className="absolute left-0 bottom-0 h-[420px] w-[80px] pointer-events-none opacity-20 -z-10 hidden lg:block" style={{ animation: "column-glow 6s ease-in-out infinite" }}>
        <GreekColumn className="h-full w-full" />
      </div>
      {/* Column silhouettes — right */}
      <div className="absolute right-0 bottom-0 h-[420px] w-[80px] pointer-events-none opacity-20 -z-10 hidden lg:block" style={{ animation: "column-glow 6s ease-in-out infinite 1s" }}>
        <GreekColumn className="h-full w-full" />
      </div>

      {/* Navbar */}
      <header className="flex items-center justify-between px-8 py-5 max-w-7xl mx-auto w-full z-10 relative">
        <div className="flex items-center gap-2.5">
          <Shield className="w-5 h-5" style={{ color: "#C9A227" }} />
          <span className="font-serif text-xl font-bold tracking-tight text-ink">Pantheon</span>
        </div>

        {/* Greek key border under nav */}
        <div className="absolute bottom-0 left-8 right-8 h-[12px] opacity-50">
          <GreekKeyBorder className="w-full h-full" />
        </div>

        <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-muted">
          <Link href="#features" className="hover:text-ink transition-colors">Platform</Link>
          <Link href="#agents" className="hover:text-ink transition-colors">The Agents</Link>
          <Link href="/olympus" className="hover:text-ink transition-colors">Live Map</Link>
          <Link href="/trace" className="hover:text-ink transition-colors">ADK Trace</Link>
        </nav>

        <div>
          <Link
            href="/dashboard"
            className="text-white px-5 py-2.5 rounded-lg font-semibold text-sm transition-transform active:scale-95"
            style={{
              background: "linear-gradient(135deg, #9A7A10, #C9A227, #F0D060, #C9A227)",
              backgroundSize: "200% auto",
              boxShadow: "0 2px 16px rgba(201,162,39,0.35)"
            }}
          >
            Launch Dashboard
          </Link>
        </div>
      </header>

      {/* Hero Section */}
      <section className="flex-1 flex flex-col items-center justify-center text-center px-4 max-w-5xl mx-auto mt-8 mb-20 z-10 relative">
        {/* Star field background */}
        <div className="absolute inset-0 -z-10">
          <StarField />
        </div>

        {/* Status pill */}
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border mb-8"
          style={{ borderColor: "rgba(201,162,39,0.4)", backgroundColor: "rgba(201,162,39,0.06)", backdropFilter: "blur(6px)" }}>
          <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: "#C9A227" }}></span>
          <span className="text-xs font-semibold tracking-wider uppercase" style={{ color: "#9A7A10" }}>System Active</span>
        </div>

        {/* Laurel wreath above headline */}
        <div className="mb-4" style={{ animation: "float 7s ease-in-out infinite" }}>
          <LaurelWreath className="w-[220px] h-auto mx-auto opacity-85" />
        </div>

        <h1 className="font-serif text-5xl md:text-7xl lg:text-8xl leading-[1.05] tracking-tight font-medium mb-6">
          <span className="gold-text">Autonomous Intelligence</span>
          <br className="hidden md:block"/>
          <span className="text-ink"> for Advanced Threats.</span>
        </h1>

        <p className="text-lg md:text-xl text-muted max-w-2xl mx-auto mb-10 leading-relaxed font-light">
          Pantheon orchestrates a swarm of specialized AI agents to detonate, analyze, and remediate malware in real-time. Uncover the unknown without writing a single script.
        </p>

        {/* Greek key divider */}
        <div className="w-full max-w-md mb-10 opacity-60">
          <GreekKeyBorder className="w-full h-[20px]" />
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-4">
          <Link
            href="/dashboard"
            className="text-ink px-8 py-4 rounded-xl font-semibold transition-all flex items-center gap-2"
            style={{
              background: "linear-gradient(135deg, #9A7A10, #C9A227, #F0D060)",
              color: "#1a1208",
              boxShadow: "0 4px 24px rgba(201,162,39,0.4)",
            }}
          >
            Enter Mission Control
            <Zap className="w-4 h-4" />
          </Link>
          <Link
            href="#agents"
            className="text-ink border px-8 py-4 rounded-xl font-semibold transition-all"
            style={{
              backgroundColor: "rgba(255,255,255,0.7)",
              borderColor: "rgba(201,162,39,0.4)",
              backdropFilter: "blur(6px)"
            }}
          >
            Meet the Swarm
          </Link>
        </div>
      </section>

      {/* Bottom greek key border before agents section */}
      <div className="w-full px-0 opacity-70 z-10">
        <GreekKeyBorder className="w-full h-[20px]" />
      </div>

      {/* Agents Spotlight */}
      <section id="agents" className="py-24 relative z-10"
        style={{ background: "linear-gradient(180deg, rgba(201,162,39,0.04) 0%, rgba(255,255,255,0.8) 100%)" }}>
        {/* Top greek key border */}
        <div className="max-w-7xl mx-auto px-8">
          <div className="mb-16 flex flex-col items-start gap-3">
            <LaurelWreath className="w-[140px] h-auto opacity-75" />
            <h2 className="font-serif text-3xl md:text-4xl font-medium text-ink">The Pantheon Swarm</h2>
            <p className="text-muted max-w-xl">Five hyper-specialized agents executing discrete pipelines—from ingestion to zero-trust containment.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* Zeus */}
            <div className="bg-white rounded-2xl p-8 border transition-all duration-300 group hover:shadow-[0_4px_32px_rgba(201,162,39,0.2)]"
              style={{ borderColor: "rgba(201,162,39,0.2)", boxShadow: "0 2px 16px rgba(201,162,39,0.06)" }}>
              <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-6 transition-all duration-300 group-hover:scale-110"
                style={{ background: "rgba(201,162,39,0.1)", border: "1px solid rgba(201,162,39,0.3)" }}>
                <Activity className="w-6 h-6" style={{ color: "#C9A227" }} />
              </div>
              <h3 className="font-serif text-2xl font-bold mb-2 text-ink">Zeus</h3>
              <p className="text-sm font-semibold uppercase tracking-wider mb-4 gold-text">Root Orchestrator</p>
              <p className="text-muted text-sm leading-relaxed">
                The master node. Routes inbound samples to appropriate agents, monitors execution state, and compiles the final intelligence brief.
              </p>
            </div>

            {/* Hephaestus */}
            <div className="bg-white rounded-2xl p-8 border transition-all duration-300 group hover:shadow-[0_4px_32px_rgba(201,162,39,0.2)]"
              style={{ borderColor: "rgba(201,162,39,0.2)", boxShadow: "0 2px 16px rgba(201,162,39,0.06)" }}>
              <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-6 transition-all duration-300 group-hover:scale-110"
                style={{ background: "rgba(201,162,39,0.1)", border: "1px solid rgba(201,162,39,0.3)" }}>
                <Database className="w-6 h-6" style={{ color: "#C9A227" }} />
              </div>
              <h3 className="font-serif text-2xl font-bold mb-2 text-ink">Hephaestus</h3>
              <p className="text-sm font-semibold uppercase tracking-wider mb-4 gold-text">Sandbox Forge</p>
              <p className="text-muted text-sm leading-relaxed">
                Constructs isolated Docker containers on-the-fly. Executes malware inside airtight environments to capture behaviors securely.
              </p>
            </div>

            {/* Athena */}
            <div className="bg-white rounded-2xl p-8 border transition-all duration-300 group hover:shadow-[0_4px_32px_rgba(201,162,39,0.2)]"
              style={{ borderColor: "rgba(201,162,39,0.2)", boxShadow: "0 2px 16px rgba(201,162,39,0.06)" }}>
              <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-6 transition-all duration-300 group-hover:scale-110"
                style={{ background: "rgba(201,162,39,0.1)", border: "1px solid rgba(201,162,39,0.3)" }}>
                <Cpu className="w-6 h-6" style={{ color: "#C9A227" }} />
              </div>
              <h3 className="font-serif text-2xl font-bold mb-2 text-ink">Athena</h3>
              <p className="text-sm font-semibold uppercase tracking-wider mb-4 gold-text">Static Analyst</p>
              <p className="text-muted text-sm leading-relaxed">
                Surgically dissects raw code. Deobfuscates JavaScript arrays, untangles string packing, and extracts hardcoded configurations instantaneously.
              </p>
            </div>

            {/* Hades */}
            <div className="bg-white rounded-2xl p-8 border transition-all duration-300 group hover:shadow-[0_4px_32px_rgba(139,0,0,0.15)]"
              style={{ borderColor: "rgba(201,162,39,0.2)", boxShadow: "0 2px 16px rgba(201,162,39,0.06)" }}>
              <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-6 transition-all duration-300 group-hover:scale-110"
                style={{ background: "rgba(139,0,0,0.08)", border: "1px solid rgba(139,0,0,0.25)" }}>
                <Shield className="w-6 h-6" style={{ color: "#8B0000" }} />
              </div>
              <h3 className="font-serif text-2xl font-bold mb-2 text-ink">Hades</h3>
              <p className="text-sm font-semibold uppercase tracking-wider mb-4" style={{ color: "#8B0000" }}>Dynamic Execution</p>
              <p className="text-muted text-sm leading-relaxed">
                The underworld observer. Monitors process hooks, intercepts WScript calls, and maps registry modifications in real-time execution.
              </p>
            </div>

            {/* Apollo + Ares */}
            <div className="bg-white rounded-2xl p-8 border transition-all duration-300 group hover:shadow-[0_4px_32px_rgba(201,162,39,0.2)] lg:col-span-2"
              style={{ borderColor: "rgba(201,162,39,0.2)", boxShadow: "0 2px 16px rgba(201,162,39,0.06)" }}>
              <h3 className="font-serif text-2xl font-bold mb-2 text-ink">Apollo & Ares</h3>
              <p className="text-sm font-semibold uppercase tracking-wider mb-4 gold-text">Enrichment & Containment</p>
              <p className="text-muted text-sm leading-relaxed max-w-2xl">
                Apollo extracts high-fidelity Indicators of Compromise (Domains, IPs, Mutexes) while Ares synthesizes immediate incident response playbooks to isolate affected hosts and sever C2 communications.
              </p>
            </div>
          </div>
        </div>

        {/* Bottom greek key */}
        <div className="mt-24 opacity-60">
          <GreekKeyBorder className="w-full h-[20px]" />
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 text-center text-muted text-sm relative z-10"
        style={{ borderTop: "1px solid rgba(201,162,39,0.2)" }}>
        <div className="flex flex-col items-center gap-2">
          <LaurelWreath className="w-[100px] h-auto opacity-50" />
          <p>Built for HackUSF 2026. Powered by Google Gemini & Cerebras.</p>
        </div>
      </footer>
    </main>
  );
}

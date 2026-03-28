import Link from "next/link";
import { Shield, Cpu, Activity, Zap, Database } from "lucide-react";

export default function LandingPage() {
  return (
    <main className="flex flex-col min-h-screen bg-linen text-ink relative overflow-hidden">
      {/* Background Decorative Elements */}
      <div className="absolute top-0 right-0 w-[800px] h-[800px] bg-gradient-to-bl from-[#fff5ea] to-transparent rounded-full blur-[100px] -z-10 opacity-70 translate-x-1/3 -translate-y-1/3"></div>
      <div className="absolute bottom-0 left-0 w-[600px] h-[600px] bg-gradient-to-tr from-[#f4ebd9] to-transparent rounded-full blur-[80px] -z-10 opacity-60 -translate-x-1/2 translate-y-1/2"></div>
      
      {/* Navbar */}
      <header className="flex items-center justify-between px-8 py-6 max-w-7xl mx-auto w-full z-10">
        <div className="flex items-center gap-2">
          <Shield className="text-sienna w-6 h-6" />
          <span className="font-serif text-xl font-bold tracking-tight text-ink">Pantheon</span>
        </div>
        <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-muted">
          <Link href="#features" className="hover:text-ink transition-colors">Platform</Link>
          <Link href="#agents" className="hover:text-ink transition-colors">The Agents</Link>
          <Link href="#architecture" className="hover:text-ink transition-colors">Architecture</Link>
        </nav>
        <div>
          <Link 
            href="/dashboard"
            className="bg-sienna hover:bg-[#a35322] text-white px-5 py-2.5 rounded-lg font-semibold text-sm shadow-warm transition-transform active:scale-95"
          >
            Launch Dashboard
          </Link>
        </div>
      </header>

      {/* Hero Section */}
      <section className="flex-1 flex flex-col items-center justify-center text-center px-4 max-w-5xl mx-auto mt-16 mb-24 z-10">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-border-subtle bg-white/50 backdrop-blur-sm mb-8">
          <span className="w-2 h-2 rounded-full bg-sienna animate-pulse"></span>
          <span className="text-xs font-semibold tracking-wider uppercase text-sienna">System Active</span>
        </div>
        
        <h1 className="font-serif text-5xl md:text-7xl lg:text-8xl leading-[1.05] tracking-tight font-medium text-ink mb-6">
          Autonomous Intelligence for <br className="hidden md:block"/> Advanced Threats.
        </h1>
        
        <p className="text-lg md:text-xl text-muted max-w-2xl mx-auto mb-10 leading-relaxed font-light">
          Pantheon orchestrates a swarm of specialized AI agents to detonate, analyze, and remediate malware in real-time. Uncover the unknown without writing a single script.
        </p>
        
        <div className="flex flex-col sm:flex-row items-center gap-4">
          <Link 
            href="/dashboard"
            className="bg-ink hover:bg-[#2a221d] text-white px-8 py-4 rounded-xl font-semibold shadow-warm transition-all hover:shadow-lg flex items-center gap-2"
          >
            Enter Mission Control
            <Zap className="w-4 h-4" />
          </Link>
          <Link 
            href="#agents"
            className="bg-white/60 hover:bg-white text-ink border border-border-subtle px-8 py-4 rounded-xl font-semibold transition-all backdrop-blur-sm"
          >
            Meet the Swarm
          </Link>
        </div>
      </section>

      {/* Agents Spotlight */}
      <section id="agents" className="py-24 bg-card/50 border-t border-border-subtle relative z-10">
        <div className="max-w-7xl mx-auto px-8">
          <div className="mb-16">
            <h2 className="font-serif text-3xl md:text-4xl font-medium text-ink mb-4">The Pantheon Swarm</h2>
            <p className="text-muted max-w-xl">Five hyper-specialized agents executing discrete pipelines—from ingestion to zero-trust containment.</p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* Zeus */}
            <div className="bg-white rounded-2xl p-8 border border-border-subtle shadow-warm hover:border-sienna/30 transition-colors group">
              <div className="w-12 h-12 bg-linen rounded-xl flex items-center justify-center text-sienna mb-6 group-hover:bg-sienna group-hover:text-white transition-colors">
                <Activity className="w-6 h-6" />
              </div>
              <h3 className="font-serif text-2xl font-bold mb-2">Zeus</h3>
              <p className="text-sm font-semibold text-sienna uppercase tracking-wider mb-4">Root Orchestrator</p>
              <p className="text-muted text-sm leading-relaxed">
                The master node. Routes inbound samples to appropriate agents, monitors execution state, and compiles the final intelligence brief.
              </p>
            </div>
            
            {/* Hephaestus */}
            <div className="bg-white rounded-2xl p-8 border border-border-subtle shadow-warm hover:border-sienna/30 transition-colors group">
              <div className="w-12 h-12 bg-linen rounded-xl flex items-center justify-center text-sienna mb-6 group-hover:bg-sienna group-hover:text-white transition-colors">
                <Database className="w-6 h-6" />
              </div>
              <h3 className="font-serif text-2xl font-bold mb-2">Hephaestus</h3>
              <p className="text-sm font-semibold text-sienna uppercase tracking-wider mb-4">Sandbox Forge</p>
              <p className="text-muted text-sm leading-relaxed">
                Constructs isolated Docker containers on-the-fly. Executes malware inside airtight environments to capture behaviors securely.
              </p>
            </div>

            {/* Athena */}
            <div className="bg-white rounded-2xl p-8 border border-border-subtle shadow-warm hover:border-sienna/30 transition-colors group">
              <div className="w-12 h-12 bg-linen rounded-xl flex items-center justify-center text-sienna mb-6 group-hover:bg-sienna group-hover:text-white transition-colors">
                <Cpu className="w-6 h-6" />
              </div>
              <h3 className="font-serif text-2xl font-bold mb-2">Athena</h3>
              <p className="text-sm font-semibold text-sienna uppercase tracking-wider mb-4">Static Analyst</p>
              <p className="text-muted text-sm leading-relaxed">
                Surgically dissects raw code. Deobfuscates JavaScript arrays, untangles string packing, and extracts hardcoded configurations instantaneously.
              </p>
            </div>
            
            {/* Hades */}
            <div className="bg-white rounded-2xl p-8 border border-border-subtle shadow-warm hover:border-sienna/30 transition-colors group">
              <div className="w-12 h-12 bg-linen rounded-xl flex items-center justify-center text-rose mb-6 group-hover:bg-rose group-hover:text-white transition-colors">
                <Shield className="w-6 h-6" />
              </div>
              <h3 className="font-serif text-2xl font-bold mb-2">Hades</h3>
              <p className="text-sm font-semibold text-rose uppercase tracking-wider mb-4">Dynamic Execution</p>
              <p className="text-muted text-sm leading-relaxed">
                The underworld observer. Monitors process hooks, intercepts WScript calls, and maps registry modifications in real-time execution.
              </p>
            </div>

            {/* Apollo */}
            <div className="bg-white rounded-2xl p-8 border border-border-subtle shadow-warm hover:border-sienna/30 transition-colors group lg:col-span-2">
              <h3 className="font-serif text-2xl font-bold mb-2">Apollo & Ares</h3>
              <p className="text-sm font-semibold text-sienna uppercase tracking-wider mb-4">Enrichment & Containment</p>
              <p className="text-muted text-sm leading-relaxed max-w-2xl">
                Apollo extracts high-fidelity Indicators of Compromise (Domains, IPs, Mutexes) while Ares synthesizes immediate incident response playbooks to isolate affected hosts and sever C2 communications.
              </p>
            </div>
          </div>
        </div>
      </section>
      
      {/* Footer */}
      <footer className="border-t border-border-subtle py-8 text-center text-muted text-sm">
        <p>Built for HackUSF 2026. Powered by Google Gemini & Cerebras.</p>
      </footer>
    </main>
  );
}

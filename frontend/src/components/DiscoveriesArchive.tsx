'use client';

import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Sparkles } from 'lucide-react';

const TOTAL_REVEAL_MS = 100_000;

type FetchState = 'loading' | 'ready' | 'error';

function splitIntoChunks(markdown: string): string[] {
  const chunks = markdown
    .split(/\n\s*\n/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

  const executiveSummaryChunks = chunks.filter((part) =>
    /(^|\n)#{1,6}\s*Executive Summary\b/i.test(part),
  );
  const nonExecutiveChunks = chunks.filter(
    (part) => !/(^|\n)#{1,6}\s*Executive Summary\b/i.test(part),
  );

  return [...nonExecutiveChunks, ...executiveSummaryChunks];
}

interface DiscoveriesArchiveProps {
  demoStarted: boolean;
}

export default function DiscoveriesArchive({ demoStarted }: DiscoveriesArchiveProps) {
  const [fetchState, setFetchState] = useState<FetchState>('loading');
  const [markdown, setMarkdown] = useState('');
  const [elapsedMs, setElapsedMs] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function loadDiscoveries() {
      try {
        const response = await fetch('/api/malware-discoveries', { cache: 'no-store' });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const body = (await response.json()) as { content?: string };
        if (!cancelled) {
          setMarkdown(body.content ?? '');
          setFetchState('ready');
        }
      } catch {
        if (!cancelled) {
          setFetchState('error');
        }
      }
    }

    loadDiscoveries();

    return () => {
      cancelled = true;
    };
  }, []);

  const chunks = useMemo(() => splitIntoChunks(markdown), [markdown]);
  const hasChunks = chunks.length > 0;
  const perChunkDurationMs = hasChunks ? TOTAL_REVEAL_MS / chunks.length : TOTAL_REVEAL_MS;

  useEffect(() => {
    if (fetchState !== 'ready' || !hasChunks || !demoStarted) {
      return;
    }

    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      const elapsed = Math.min(Date.now() - startedAt, TOTAL_REVEAL_MS);
      setElapsedMs(elapsed);

      if (elapsed >= TOTAL_REVEAL_MS) {
        window.clearInterval(timer);
      }
    }, 120);

    return () => {
      window.clearInterval(timer);
    };
  }, [fetchState, hasChunks, demoStarted]);

  const revealedChunkCount = hasChunks && demoStarted
    ? Math.min(chunks.length, Math.floor((elapsedMs / TOTAL_REVEAL_MS) * chunks.length) + 1)
    : 0;

  const activeChunkIndex = hasChunks && demoStarted
    ? Math.min(chunks.length - 1, Math.floor(elapsedMs / perChunkDurationMs))
    : -1;

  const chunkPhase = hasChunks ? (elapsedMs % perChunkDurationMs) / perChunkDurationMs : 0;
  const showTransientChunk = chunkPhase < 0.75;

  const generatedMarkdown = hasChunks
    ? chunks.slice(0, revealedChunkCount).join('\n\n')
    : '';

  const progressPct = hasChunks ? Math.min(100, (revealedChunkCount / chunks.length) * 100) : 0;

  if (fetchState === 'loading') {
    return (
      <div className="h-full p-6">
        <div className="glass-panel h-full rounded-2xl border border-gold/20 p-8 flex items-center justify-center">
          <div className="text-sm uppercase tracking-[0.18em] text-gold-dark/70">Loading discoveries...</div>
        </div>
      </div>
    );
  }

  if (fetchState === 'error' || !hasChunks) {
    return (
      <div className="h-full p-6">
        <div className="glass-panel h-full rounded-2xl border border-rose/30 p-8 flex items-center justify-center">
          <div className="text-sm text-rose font-semibold">Unable to load MALWARE/discoveries.md</div>
        </div>
      </div>
    );
  }

  if (!demoStarted) {
    return (
      <div className="h-full p-6">
        <div className="glass-panel h-full rounded-2xl border border-gold/20 p-8 flex items-center justify-center">
          <div className="text-center">
            <div className="text-[11px] uppercase tracking-[0.18em] text-gold-dark/70">Discoveries Standby</div>
            <div className="mt-3 font-serif text-2xl text-ink">Start the demo to begin generation</div>
            <p className="mt-2 text-sm text-muted">The 100-second chunk reveal starts only after the demo is triggered.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full p-6 overflow-hidden">
      <div className="grid h-full grid-cols-1 gap-4 lg:grid-cols-[360px_minmax(0,1fr)]">
        <section className="glass-panel rounded-2xl border border-gold/20 p-5 flex flex-col min-h-0">
          <div className="flex items-center gap-2 text-gold-dark">
            <Sparkles size={16} className="animate-pulse" />
            <h2 className="font-serif text-base font-bold tracking-wide">Agent Thought Stream</h2>
          </div>
          <p className="mt-2 text-xs text-muted leading-relaxed">
            Segments appear and fade as the analysis narrative composes itself over 100 seconds.
          </p>

          <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-gold/10">
            <motion.div
              className="h-full rounded-full bg-gradient-to-r from-gold-dark via-gold to-gold-light"
              animate={{ width: `${progressPct}%` }}
              transition={{ ease: 'linear', duration: 0.2 }}
            />
          </div>

          <div className="mt-2 text-[11px] tracking-[0.16em] uppercase text-gold-dark/70">
            {revealedChunkCount} / {chunks.length} chunks rendered
          </div>

          <div className="mt-4 flex-1 rounded-xl border border-gold/15 bg-white/60 p-4 overflow-hidden relative">
            <AnimatePresence mode="wait">
              {showTransientChunk && activeChunkIndex >= 0 && activeChunkIndex < chunks.length ? (
                <motion.div
                  key={`${activeChunkIndex}-${chunks[activeChunkIndex]?.slice(0, 20)}`}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.5, ease: 'easeOut' }}
                  className="absolute inset-4 overflow-y-auto"
                >
                  <p className="text-[13px] leading-6 text-ink/90 whitespace-pre-wrap">
                    {chunks[activeChunkIndex]}
                  </p>
                </motion.div>
              ) : (
                <motion.div
                  key="blank"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute inset-4 flex items-center justify-center"
                >
                  <span className="text-xs uppercase tracking-[0.18em] text-gold-dark/50">Processing next chunk...</span>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </section>

        <section className="glass-panel rounded-2xl border border-gold/20 p-6 min-h-0 overflow-hidden flex flex-col">
          <div className="flex items-end justify-between border-b border-gold/15 pb-4">
            <div>
              <h1 className="font-serif text-2xl text-ink tracking-tight">Malware Discoveries Ledger</h1>
              <p className="mt-1 text-sm text-muted">Live rendering of MALWARE/discoveries.md</p>
            </div>
            <div className="text-[11px] uppercase tracking-[0.18em] text-gold-dark/70">
              Scribe cycle: {Math.min(100, Math.round((elapsedMs / TOTAL_REVEAL_MS) * 100))}%
            </div>
          </div>

          <div className="mt-4 min-h-0 overflow-y-auto pr-2">
            <article className="space-y-4 text-[15px] leading-7 text-ink/95">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  h1: ({ children }) => <h1 className="font-serif text-3xl text-ink mb-3">{children}</h1>,
                  h2: ({ children }) => <h2 className="font-serif text-2xl text-ink mt-8 mb-3 border-b border-gold/20 pb-2">{children}</h2>,
                  h3: ({ children }) => <h3 className="font-serif text-xl text-ink mt-6 mb-2">{children}</h3>,
                  p: ({ children }) => <p className="text-[15px] leading-7 text-ink/90">{children}</p>,
                  ul: ({ children }) => <ul className="list-disc pl-6 space-y-2 marker:text-gold-dark">{children}</ul>,
                  ol: ({ children }) => <ol className="list-decimal pl-6 space-y-2 marker:text-gold-dark">{children}</ol>,
                  li: ({ children }) => <li className="text-[15px] leading-7">{children}</li>,
                  blockquote: ({ children }) => (
                    <blockquote className="border-l-4 border-gold/50 bg-gold/5 px-4 py-3 rounded-r-lg text-ink/85">
                      {children}
                    </blockquote>
                  ),
                  code: ({ className, children }) => {
                    const isBlock = Boolean(className);
                    return isBlock ? (
                      <code className="block bg-ink/95 text-linen rounded-lg px-4 py-3 text-xs overflow-x-auto font-mono leading-6">
                        {children}
                      </code>
                    ) : (
                      <code className="rounded bg-gold/15 px-1.5 py-0.5 text-[0.9em] text-ink font-mono">{children}</code>
                    );
                  },
                  table: ({ children }) => (
                    <div className="overflow-x-auto rounded-lg border border-gold/20">
                      <table className="w-full text-sm">{children}</table>
                    </div>
                  ),
                  thead: ({ children }) => <thead className="bg-gold/10">{children}</thead>,
                  th: ({ children }) => <th className="text-left px-3 py-2 border-b border-gold/20 font-semibold">{children}</th>,
                  td: ({ children }) => <td className="px-3 py-2 border-b border-gold/10 align-top">{children}</td>,
                  hr: () => <hr className="my-8 border-gold/20" />,
                }}
              >
                {generatedMarkdown}
              </ReactMarkdown>
            </article>
          </div>
        </section>
      </div>
    </div>
  );
}

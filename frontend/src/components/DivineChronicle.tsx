'use client';

import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Zap,
  Target,
  Activity,
  AlertTriangle,
  ShieldCheck,
  Send,
  Radio,
} from 'lucide-react';
import { EventStore, PantheonEvent } from '@/lib/event-store';

const EVENT_ICONS: Record<string, React.ReactNode> = {
  agent_activated: <Zap className="w-3 h-3 text-amber-400" />,
  agent_completed: <ShieldCheck className="w-3 h-3 text-green-400" />,
  tool_called: <Activity className="w-3 h-3 text-blue-400" />,
  handoff: <Send className="w-3 h-3 text-purple-400" />,
  ioc_discovered: <Target className="w-3 h-3 text-red-400" />,
  error: <AlertTriangle className="w-3 h-3 text-rose-500" />,
};

export default function DivineChronicle({ store }: { store: EventStore }) {
  const [events, setEvents] = useState<PantheonEvent[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const updateEvents = () => {
      setEvents(store.getRecentEvents(100));
    };

    updateEvents();
    const unsubscribe = store.subscribe(updateEvents);
    return () => unsubscribe();
  }, [store]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [events]);

  return (
    <div className="flex flex-col h-full glass-panel rounded-2xl overflow-hidden border-gold/20 shadow-warm bg-white/40">
      <div className="px-6 py-4 border-b border-gold/10 bg-white/20 flex items-center justify-between shrink-0">
        <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-gold-dark flex items-center gap-2">
          <Activity className="w-4 h-4" />
          Event Log
        </h2>
        <span className="text-[10px] font-medium text-muted/60">
          {events.length} entries recorded
        </span>
      </div>

      <div 
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-4 py-2 scrollbar-hide space-y-1"
      >
        <AnimatePresence initial={false}>
          {events.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center gap-4 text-muted/40">
              <div className="w-12 h-12 rounded-full border border-dashed border-gold/30 flex items-center justify-center">
                <Radio className="w-5 h-5 opacity-40" />
              </div>
              <p className="text-[10px] uppercase tracking-widest font-medium">No events yet</p>
            </div>
          ) : (
            events.map((event, i) => (
              <motion.div
                key={event.id || i}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                className="group flex items-start gap-4 p-2.5 rounded-xl hover:bg-gold/5 transition-colors border border-transparent hover:border-gold/10"
              >
                <div className="mt-1.5 shrink-0">
                  {EVENT_ICONS[event.type.toLowerCase()] || <Activity className="w-3 h-3 text-slate-400" />}
                </div>
                
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-0.5">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-gold-dark">
                      {event.agent || 'SYSTEM'}
                    </span>
                    <span className="text-[9px] font-medium text-muted/40 font-mono">
                      {new Date(event.timestamp).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </span>
                  </div>
                  
                  <p className="text-[11px] text-ink/70 leading-relaxed truncate group-hover:whitespace-normal">
                    {event.type === 'TOOL_CALLED' && `Invoking: ${event.tool}`}
                    {event.type === 'IOC_DISCOVERED' && `Extracted ${event.payload.ioc_type as string}: ${event.payload.value as string}`}
                    {event.type === 'HANDOFF' && `A2A Handshake: Dispatched ${event.payload.to as string}`}
                    {event.type === 'AGENT_ACTIVATED' && (event.payload.message as string)}
                    {event.type === 'ERROR' && ((event.payload.error as string) || (event.payload.message as string))}
                    {!['TOOL_CALLED', 'IOC_DISCOVERED', 'HANDOFF', 'AGENT_ACTIVATED', 'ERROR'].includes(event.type) && ((event.payload.message as string) || event.type)}
                  </p>
                </div>
              </motion.div>
            ))
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

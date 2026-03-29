'use client';

import { useEffect, useState } from 'react';
import { type EventStore } from '@/lib/event-store';
import { FileText, Calendar, AlertCircle } from 'lucide-react';

interface Job {
  id: string;
  status: string;
  createdAt: string;
  eventCount: number;
  sampleName: string;
}

export default function JobOverview({ store }: { store: EventStore }) {
  const [job, setJob] = useState<Job | null>(null);

  useEffect(() => {
    const unsubscribe = store.subscribe(() => {
      const current = store.getCurrentJob();
      if (current) {
        setJob({
          id: current.job_id,
          status: current.status,
          createdAt: new Date(current.created_at).toLocaleString(),
          eventCount: store.getRecentEvents().length,
          sampleName: current.sample_name,
        });
      }
    });
    return unsubscribe;
  }, [store]);

  if (!job) {
    return (
      <div className="glass-panel rounded-2xl p-6 border-gold/10">
        <p className="text-[10px] font-bold uppercase tracking-widest text-gold-dark/40">Job Overview</p>
        <p className="text-xs text-muted mt-4 italic">No active job</p>
      </div>
    );
  }

  const statusColors = {
    PENDING: 'bg-gold/10 text-gold-dark border-gold/20',
    ANALYZING: 'bg-amber-100/50 text-amber-700 border-amber-200',
    COMPLETE: 'bg-green-100/50 text-green-700 border-green-200',
    ERROR: 'bg-red-100/50 text-red-700 border-red-200',
  };

  const color = statusColors[job.status as keyof typeof statusColors] || statusColors.PENDING;

  return (
    <div className="glass-panel rounded-2xl p-6 border-gold/10 space-y-6">
      <div>
        <h3 className="text-[10px] font-bold uppercase tracking-widest text-gold-dark/60">
          Current Job
        </h3>
      </div>

      <div className="space-y-4">
        <div>
          <label className="text-[9px] font-bold text-gold-dark/40 uppercase tracking-wider block mb-1">
            Sample
          </label>
          <p className="text-sm font-serif font-bold text-ink">
            {job.sampleName || 'Unknown Sample'}
          </p>
        </div>

        <div>
          <label className="text-[9px] font-bold text-gold-dark/40 uppercase tracking-wider block mb-1">
            Status
          </label>
          <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${color}`}>
            {job.status}
          </span>
        </div>

        <div className="pt-2 grid grid-cols-2 gap-4 border-t border-gold/5">
          <div>
            <label className="text-[9px] font-bold text-gold-dark/40 uppercase tracking-wider block mb-1">
              Events
            </label>
            <p className="text-sm font-bold text-ink">{job.eventCount}</p>
          </div>
          <div>
            <label className="text-[9px] font-bold text-gold-dark/40 uppercase tracking-wider block mb-1">
              Job ID
            </label>
            <p className="text-[10px] font-mono text-gold-dark truncate" title={job.id}>{job.id.slice(0, 8)}...</p>
          </div>
        </div>
      </div>
    </div>
  );
}

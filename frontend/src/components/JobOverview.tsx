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
      <div className="border border-slate-800 rounded-lg p-4 bg-slate-900/30">
        <p className="text-xs text-slate-500">No active job</p>
      </div>
    );
  }

  const statusColors = {
    PENDING: 'bg-slate-500/10 text-slate-400',
    ANALYZING: 'bg-teal-500/10 text-teal-300',
    COMPLETE: 'bg-emerald-500/10 text-emerald-300',
    ERROR: 'bg-red-500/10 text-red-300',
  };

  const color = statusColors[job.status as keyof typeof statusColors] || statusColors.PENDING;

  return (
    <div className="border border-slate-800 rounded-lg p-4 bg-slate-900/30 space-y-4">
      <div>
        <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-3">
          Job Overview
        </h3>
      </div>

      <div className="space-y-3">
        <div>
          <label className="text-xs text-slate-500 uppercase tracking-wider block mb-1">
            Job ID
          </label>
          <code className="text-sm font-mono text-slate-200 break-all">
            {job.id}
          </code>
        </div>

        <div>
          <label className="text-xs text-slate-500 uppercase tracking-wider block mb-1">
            Status
          </label>
          <span className={`inline-block px-2 py-1 rounded text-xs font-medium ${color}`}>
            {job.status}
          </span>
        </div>

        <div>
          <label className="text-xs text-slate-500 uppercase tracking-wider block mb-1">
            Created
          </label>
          <p className="text-sm text-slate-300">{job.createdAt}</p>
        </div>

        <div>
          <label className="text-xs text-slate-500 uppercase tracking-wider block mb-1">
            Events Emitted
          </label>
          <p className="text-sm text-slate-300">{job.eventCount}</p>
        </div>
      </div>
    </div>
  );
}

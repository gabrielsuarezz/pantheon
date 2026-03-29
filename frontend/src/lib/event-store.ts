/**
 * Event Store — Zustand-like state management for Pantheon events
 * Holds: activeAgents, eventFeed, attackChainStages, processTree, IOCs
 */

export type EventType = 
  | "AGENT_ACTIVATED"
  | "AGENT_COMPLETED"
  | "TOOL_CALLED"
  | "TOOL_RESULT"
  | "STAGE_UNLOCKED"
  | "IOC_DISCOVERED"
  | "PROCESS_EVENT"
  | "NETWORK_EVENT"
  | "HANDOFF"
  | "ERROR";

export type AgentName = "zeus" | "athena" | "hades" | "apollo" | "ares" | "hermes" | "artemis" | "hephaestus";

export interface PantheonEvent {
  type: EventType;
  timestamp: string;
  agent?: AgentName;
  tool?: string;
  job_id?: string;
  payload: Record<string, unknown>;
}

export interface AgentStatus {
  name: AgentName;
  state: "idle" | "active" | "complete" | "error";
  current_task?: string;
  last_event_time?: string;
  event_count: number;
}

export interface AttackStage {
  stage_id: string;
  label: string;
  description: string;
  icon: string;
  discovered_at?: string;
}

export interface IOCEntry {
  type: "ip" | "domain" | "file_hash" | "file_path" | "registry_key" | "url";
  value: string;
  severity: "low" | "medium" | "high" | "critical";
  source: string;
  discovered_at: string;
  context?: string;
}

export interface ProcessNode {
  id: string;
  name: string;
  parent_id?: string;
  event_type: "file_write" | "registry_write" | "process_spawn" | "dns_query" | "http_request";
  details: Record<string, unknown>;
}

export interface JobState {
  job_id: string;
  status: "pending" | "routing" | "analyzing" | "enriching" | "planning" | "complete" | "failed";
  sample_name: string;
  created_at: string;
  agents_completed: AgentName[];
  current_agent?: AgentName;
}

export class EventStore {
  private agents: Map<AgentName, AgentStatus> = new Map();
  private events: PantheonEvent[] = [];
  private stages: Map<string, AttackStage> = new Map();
  private iocs: Map<string, IOCEntry> = new Map();
  private processes: Map<string, ProcessNode> = new Map();
  private currentJob: JobState | null = null;
  private subscribers: Set<() => void> = new Set();

  constructor() {
    this.initializeAgents();
  }

  private initializeAgents() {
    const agents: AgentName[] = ["zeus", "athena", "hades", "apollo", "ares", "hermes", "artemis", "hephaestus"];
    agents.forEach((name) => {
      this.agents.set(name, {
        name,
        state: "idle",
        event_count: 0,
      });
    });
  }

  addEvent(event: PantheonEvent) {
    const eventWithTime = {
      ...event,
      timestamp: event.timestamp || new Date().toISOString(),
    };
    this.events.push(eventWithTime);

    // Update agent status
    if (event.agent) {
      const agent = this.agents.get(event.agent)!;
      agent.event_count++;
      agent.last_event_time = eventWithTime.timestamp;

      if (event.type === "AGENT_ACTIVATED") {
        agent.state = "active";
        agent.current_task = event.payload.step as string;
      } else if (event.type === "AGENT_COMPLETED") {
        agent.state = "complete";
      } else if (event.type === "ERROR") {
        agent.state = "error";
      }
    }

    // Handle stage discovery
    if (event.type === "STAGE_UNLOCKED") {
      const stage_id = event.payload.stage_id as string;
      this.stages.set(stage_id, {
        stage_id,
        label: event.payload.label as string,
        description: event.payload.description as string,
        icon: event.payload.icon as string,
        discovered_at: eventWithTime.timestamp,
      });
    }

    // Handle IOC discovery
    if (event.type === "IOC_DISCOVERED") {
      const ioc_value = event.payload.value as string;
      this.iocs.set(ioc_value, {
        type: event.payload.ioc_type as IOCEntry["type"],
        value: ioc_value,
        severity: event.payload.severity as IOCEntry["severity"],
        source: event.agent || "unknown",
        discovered_at: eventWithTime.timestamp,
        context: event.payload.context as string,
      });
    }

    // Handle process events
    if (event.type === "PROCESS_EVENT") {
      const process_id = event.payload.id as string;
      this.processes.set(process_id, {
        id: process_id,
        name: event.payload.name as string,
        parent_id: event.payload.parent_id as string,
        event_type: event.payload.event_type as ProcessNode["event_type"],
        details: event.payload.details as Record<string, unknown>,
      });
    }

    this.notify();
  }

  startJob(job_id: string, sample_name: string) {
    this.currentJob = {
      job_id,
      status: "pending",
      sample_name,
      created_at: new Date().toISOString(),
      agents_completed: [],
    };
    this.notify();
  }

  updateJobStatus(status: JobState["status"], current_agent?: AgentName) {
    if (this.currentJob) {
      this.currentJob.status = status;
      this.currentJob.current_agent = current_agent;
      this.notify();
    }
  }

  completeAgent(agent: AgentName) {
    if (this.currentJob && !this.currentJob.agents_completed.includes(agent)) {
      this.currentJob.agents_completed.push(agent);
      this.notify();
    }
  }

  getAgents(): AgentStatus[] {
    return Array.from(this.agents.values());
  }

  getRecentEvents(limit: number = 50): PantheonEvent[] {
    return this.events.slice(-limit);
  }

  getAttackChain(): AttackStage[] {
    return Array.from(this.stages.values()).sort(
      (a, b) => (a.discovered_at || "").localeCompare(b.discovered_at || "")
    );
  }

  getIOCs(): IOCEntry[] {
    return Array.from(this.iocs.values()).sort((a, b) => b.discovered_at.localeCompare(a.discovered_at));
  }

  getIOCsBySeverity(severity: IOCEntry["severity"]): IOCEntry[] {
    return this.getIOCs().filter((ioc) => ioc.severity === severity);
  }

  getProcessTree(): ProcessNode[] {
    return Array.from(this.processes.values());
  }

  getCurrentJob(): JobState | null {
    return this.currentJob;
  }

  getStatistics() {
    const agents = this.getAgents();
    const iocs = this.getIOCs();

    return {
      total_events: this.events.length,
      agents_active: agents.filter((a) => a.state === "active").length,
      agents_complete: agents.filter((a) => a.state === "complete").length,
      agents_idle: agents.filter((a) => a.state === "idle").length,
      total_iocs: iocs.length,
      critical_iocs: iocs.filter((i) => i.severity === "critical").length,
      stages_discovered: this.stages.size,
    };
  }

  subscribe(callback: () => void): () => void {
    this.subscribers.add(callback);
    return () => this.subscribers.delete(callback);
  }

  private notify() {
    this.subscribers.forEach((cb) => cb());
  }

  reset() {
    this.agents.clear();
    this.events = [];
    this.stages.clear();
    this.iocs.clear();
    this.processes.clear();
    this.currentJob = null;
    this.initializeAgents();
    this.notify();
  }
}

// Singleton instance
let store: EventStore | null = null;

export function getEventStore(): EventStore {
  if (!store) {
    store = new EventStore();
  }
  return store;
}

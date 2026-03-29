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
  | "TELEMETRY"
  | "THOUGHT"
  | "AGENT_COMMAND"
  | "ERROR";

export type AgentName = "zeus" | "athena" | "hades" | "apollo" | "ares" | "hermes" | "artemis" | "hephaestus" | "muse";

export interface PantheonEvent {
  id: string;
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
  last_thought?: string;
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

export type Statistics = {
  total_events: number;
  agents_active: number;
  agents_complete: number;
  agents_idle: number;
  total_iocs: number;
  critical_iocs: number;
  stages_discovered: number;
};

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

export interface TelemetryEntry {
  timestamp: string;
  agent: string;
  command?: string;
  output: string;
  stream: "stdin" | "stdout" | "stderr";
}

export class EventStore {
  private agents: Map<AgentName, AgentStatus> = new Map();
  private events: PantheonEvent[] = [];
  private stages: Map<string, AttackStage> = new Map();
  private iocs: Map<string, IOCEntry> = new Map();
  private processes: Map<string, ProcessNode> = new Map();
  private currentJob: JobState | null = null;
  private telemetry: TelemetryEntry[] = [];
  private handoffs: any[] = [];
  private subscribers: Set<() => void> = new Set();

  constructor() {
    this.initializeAgents();
  }

  private initializeAgents() {
    const agents: AgentName[] = ["zeus", "athena", "hades", "apollo", "ares", "hermes", "artemis", "hephaestus", "muse"];
    agents.forEach((name) => {
      this.agents.set(name, {
        name,
        state: "idle",
        event_count: 0,
      });
    });
  }

  addEvent(event: any) {
    // Normalize event from backend (handles 'ts' -> 'timestamp' and casing)
    const normalizedEvent: PantheonEvent = {
      ...event,
      id: event.id || Math.random().toString(36).substring(7),
      type: (event.type || "TELEMETRY").toUpperCase() as EventType,
      timestamp: event.timestamp || event.ts || new Date().toISOString(),
      agent: event.agent?.toLowerCase() as AgentName,
    };

    this.events.push(normalizedEvent);

    // Update agent status
    if (normalizedEvent.agent) {
      let agent = this.agents.get(normalizedEvent.agent);
      if (!agent) {
        agent = { name: normalizedEvent.agent, state: "idle", event_count: 0 };
        this.agents.set(normalizedEvent.agent, agent);
      }
      agent.event_count++;
      agent.last_event_time = normalizedEvent.timestamp;

      if (normalizedEvent.type === "AGENT_ACTIVATED") {
        agent.state = "active";
        agent.current_task = normalizedEvent.payload.step as string;
      } else if (normalizedEvent.type === "AGENT_COMPLETED") {
        agent.state = "complete";
      } else if (normalizedEvent.type === "ERROR") {
        agent.state = "error";
      }
    }

    // Handle stage discovery
    if (normalizedEvent.type === "STAGE_UNLOCKED") {
      const stage_id = normalizedEvent.payload.stage_id as string;
      this.stages.set(stage_id, {
        stage_id,
        label: normalizedEvent.payload.label as string,
        description: normalizedEvent.payload.description as string,
        icon: normalizedEvent.payload.icon as string,
        discovered_at: normalizedEvent.timestamp,
      });
    }

    // Handle IOC discovery
    if (normalizedEvent.type === "IOC_DISCOVERED") {
      const ioc_value = normalizedEvent.payload.value as string;
      this.iocs.set(ioc_value, {
        type: normalizedEvent.payload.ioc_type as IOCEntry["type"],
        value: ioc_value,
        severity: normalizedEvent.payload.severity as IOCEntry["severity"],
        source: normalizedEvent.agent || "unknown",
        discovered_at: normalizedEvent.timestamp,
        context: normalizedEvent.payload.context as string,
      });
    }

    // Handle process events
    if (normalizedEvent.type === "PROCESS_EVENT") {
      const process_id = normalizedEvent.payload.id as string;
      this.processes.set(process_id, {
        id: process_id,
        name: normalizedEvent.payload.name as string,
        parent_id: normalizedEvent.payload.parent_id as string,
        event_type: normalizedEvent.payload.event_type as ProcessNode["event_type"],
        details: normalizedEvent.payload.details as Record<string, unknown>,
      });
    }

    // Terminal stream mirrors all events, with richer payloads for TELEMETRY.
    this.appendTelemetry(normalizedEvent);

    // Handle thoughts
    if (normalizedEvent.type === "THOUGHT") {
      const agentObj = this.agents.get(normalizedEvent.agent!);
      if (agentObj) agentObj.last_thought = normalizedEvent.payload.thought as string;
    }

    // Handle handoffs for the graph
    if (normalizedEvent.type === "HANDOFF") {
      this.handoffs.push({
        from: normalizedEvent.payload.from as AgentName,
        to: normalizedEvent.payload.to as AgentName,
        timestamp: normalizedEvent.timestamp,
      });
      if (this.handoffs.length > 50) this.handoffs.shift();
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

  getTelemetry() {
    return this.telemetry.filter(
      (entry) => !this.isHeartbeatTelemetry(entry.command, entry.output)
    );
  }

  getHandoffs() {
    return [...this.handoffs];
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

  private appendTelemetry(event: PantheonEvent) {
    const payload = event.payload || {};

    if (event.type === "TELEMETRY") {
      const message = (payload.output as string) || (payload.message as string) || "";
      if (this.isHeartbeatTelemetry(payload.command as string | undefined, message)) {
        return;
      }
      const stream = payload.stream as "stdin" | "stdout" | "stderr" | undefined;
      this.pushTelemetry({
        timestamp: event.timestamp,
        agent: event.agent || "system",
        command: payload.command as string | undefined,
        output: message,
        stream: stream || ((payload.level as string) === "error" ? "stderr" : "stdout"),
      });
      return;
    }

    const summary = this.describeEvent(event);
    this.pushTelemetry({
      timestamp: event.timestamp,
      agent: event.agent || "system",
      command: summary.command,
      output: summary.output,
      stream: summary.stream,
    });
  }

  private isHeartbeatTelemetry(command: string | undefined, output: string): boolean {
    const normalizedCommand = (command || "").trim().toLowerCase();
    const normalizedOutput = output.trim().toLowerCase();
    return normalizedCommand === "heartbeat" || normalizedOutput === "heartbeat: hephaestus alive";
  }

  private describeEvent(event: PantheonEvent): {
    command?: string;
    output: string;
    stream: "stdin" | "stdout" | "stderr";
  } {
    const payloadText = Object.keys(event.payload || {}).length
      ? JSON.stringify(event.payload)
      : "";

    switch (event.type) {
      case "TOOL_CALLED":
        return {
          command: `tool:${event.tool || "unknown"}`,
          output: payloadText || `${event.agent || "system"} called ${event.tool || "tool"}`,
          stream: "stdin",
        };
      case "TOOL_RESULT":
        return {
          command: `result:${event.tool || "unknown"}`,
          output: payloadText || `${event.agent || "system"} completed ${event.tool || "tool"}`,
          stream: "stdout",
        };
      case "ERROR":
        return {
          command: `${event.agent || "system"}:error`,
          output: payloadText || "error event received",
          stream: "stderr",
        };
      default:
        return {
          command: `${event.agent || "system"}:${event.type.toLowerCase()}`,
          output: payloadText || event.type,
          stream: "stdout",
        };
    }
  }

  private pushTelemetry(entry: TelemetryEntry) {
    if (this.telemetry.length === 0 || this.telemetry.length % 10 === 0) {
      console.log(`[EventStore] Pushed telemetry entry (total: ${this.telemetry.length + 1}). Sample:`, entry);
    }
    this.telemetry.push(entry);
    if (this.telemetry.length > 500) {
      this.telemetry.shift();
    }
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

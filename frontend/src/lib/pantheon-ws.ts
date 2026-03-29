/**
 * WebSocket Client — Connects to Hephaestus EventBus at /ws
 * Receives PantheonEvent stream and dispatches to EventStore
 */

import { EventStore, PantheonEvent } from "./event-store";

export class PantheonWebSocket {
  private url: string;
  private fallbackUrl: string | null = null;
  private ws: WebSocket | null = null;
  private store: EventStore;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 2000; // ms
  private handlers: Map<string, (event: PantheonEvent) => void> = new Map();
  private sandboxUrl: string;

  private resolveBaseUrl(configuredUrl: string): URL {
    const fallback = typeof window !== "undefined"
      ? new URL(window.location.origin)
      : new URL("http://localhost:9000");

    try {
      const configured = new URL(configuredUrl);

      // We explicitly trust the configured URL from environment parameters
      return configured;
    } catch {
      return fallback;
    }
  }

  constructor(sandboxUrl: string, store: EventStore) {
    this.sandboxUrl = sandboxUrl;
    // Convert HTTP URL to WebSocket URL
    const url = this.resolveBaseUrl(sandboxUrl);
    this.url = `${url.protocol === "https:" ? "wss:" : "ws:"}//${url.host}/ws`;

    if (typeof window !== "undefined") {
      const originWs = `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}/ws`;
      if (originWs !== this.url) {
        this.fallbackUrl = originWs;
      }
    }

    this.store = store;
    console.log(`[Pantheon WS] Configured to connect to: ${this.url}`);
    if (this.fallbackUrl) {
      console.log(`[Pantheon WS] Fallback endpoint: ${this.fallbackUrl}`);
    }
  }

  connect(): Promise<void> {
    const candidates = [this.url];
    
    // If we're using localhost, also try 127.0.0.1 as a candidate to bypass IPv6/IPv4 resolution issues
    if (this.url.includes("localhost")) {
      candidates.push(this.url.replace("localhost", "127.0.0.1"));
    }
    
    if (this.fallbackUrl && !candidates.includes(this.fallbackUrl)) {
      candidates.push(this.fallbackUrl);
    }

    return new Promise((resolve, reject) => {
      const tryConnect = (index: number) => {
        if (index >= candidates.length) {
          const details = candidates.join(", ");
          const error = new Error(
            `WebSocket connection failed for all endpoints: ${details}. Check NEXT_PUBLIC_SANDBOX_URL, nginx /ws proxy, and firewall rules.`
          );
          this.store.addEvent({
            type: "error",
            agent: "hephaestus",
            payload: { message: error.message },
          });
          reject(error);
          return;
        }

        const targetUrl = candidates[index];
        this.openSocket(targetUrl)
          .then(resolve)
          .catch((error) => {
            console.error(`[Pantheon WS] Candidate failed (${targetUrl}):`, error);
            tryConnect(index + 1);
          });
      };

      tryConnect(0);
    });
  }

  private openSocket(targetUrl: string): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        console.log(`[Pantheon WS] Attempting connection to ${targetUrl}...`);
        this.ws = new WebSocket(targetUrl);

        // Set a timeout to detect failed connections (no error event fires for unreachable hosts)
        const connectionTimeout = setTimeout(() => {
          if (this.ws && this.ws.readyState === WebSocket.CONNECTING) {
            this.ws.close();
            reject(
              new Error(
                `WebSocket connection timeout. Is Hephaestus running at ${targetUrl}? ` +
                `Check: NEXT_PUBLIC_SANDBOX_URL in .env.local`
              )
            );
          }
        }, 5000);

        this.ws.onopen = () => {
          clearTimeout(connectionTimeout);
          this.url = targetUrl;
          console.log(`[Pantheon WS] ✓ Connected to ${targetUrl}`);
          this.reconnectAttempts = 0;
          resolve();
        };

        this.ws.onmessage = (event) => {
          try {
            console.log("[Pantheon WS] Received event:", event.data);
            const message = JSON.parse(event.data) as PantheonEvent;
            this.handleMessage(message);
          } catch (error) {
            console.error("[Pantheon WS] Failed to parse message:", error, event.data);
          }
        };

        this.ws.onerror = (error) => {
          clearTimeout(connectionTimeout);
          
          // WebSocket error events are notoriously opaque in the browser ("Error: error")
          // We provide as much context as possible based on common failure modes.
          let detail = "Check if Hephaestus is running and the port is open.";
          if (targetUrl.includes(":9000")) {
            detail = "Hephaestus (port 9000) might be blocked or not running in Docker.";
          }
          
          const errorMsg = `WebSocket connection failed to ${targetUrl}. ${detail} ` +
            `(Error: ${error instanceof Event ? error.type : String(error)})`;
            
          console.error("[Pantheon WS]", errorMsg);
          reject(new Error(errorMsg));
        };

        this.ws.onclose = () => {
          clearTimeout(connectionTimeout);
          console.log("[Pantheon WS] Disconnected, attempting reconnect...");
          this.attemptReconnect();
        };
      } catch (error) {
        reject(error);
      }
    });
  }

  private attemptReconnect() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      const delay = this.reconnectDelay * this.reconnectAttempts;
      console.log(
        `[Pantheon WS] Reconnect attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${delay}ms...`
      );
      setTimeout(() => {
        this.connect().catch((error) => {
          console.error(`[Pantheon WS] Reconnect attempt ${this.reconnectAttempts} failed:`, error);
        });
      }, delay);
    } else {
      console.error(
        `[Pantheon WS] Max reconnection attempts reached. Is Hephaestus running at ${this.sandboxUrl}? ` +
        `Check NEXT_PUBLIC_SANDBOX_URL in .env.local`
      );
    }
  }

  private handleMessage(event: PantheonEvent) {
    // Add to event store
    this.store.addEvent(event);

    // Call registered handlers
    const handlers = this.handlers.get(event.type) || [];
    if (Array.isArray(handlers)) {
      // If a handler was registered before we switched to Map<string, Function>
      // This shouldn't happen, but let's be safe
    } else if (handlers) {
      handlers(event);
    }

    // Dispatch to generic handler
    const genericHandler = this.handlers.get("*");
    if (genericHandler) {
      genericHandler(event);
    }
  }

  on(eventType: string, handler: (event: PantheonEvent) => void) {
    this.handlers.set(eventType, handler);
  }

  off(eventType: string) {
    this.handlers.delete(eventType);
  }

  close() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}

// Singleton instance
let client: PantheonWebSocket | null = null;

export function initWS(sandboxUrl: string, store: EventStore): PantheonWebSocket {
  if (!client) {
    client = new PantheonWebSocket(sandboxUrl, store);
  }
  return client;
}

export function getWSClient(): PantheonWebSocket | null {
  return client;
}

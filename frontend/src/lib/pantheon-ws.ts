/**
 * WebSocket Client — Connects to Hephaestus EventBus at /ws
 * Receives PantheonEvent stream and dispatches to EventStore
 */

import { EventStore, PantheonEvent } from "./event-store";

export class PantheonWebSocket {
  private url: string;
  private ws: WebSocket | null = null;
  private store: EventStore;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 2000; // ms
  private handlers: Map<string, (event: PantheonEvent) => void> = new Map();
  private sandboxUrl: string;

  constructor(sandboxUrl: string, store: EventStore) {
    this.sandboxUrl = sandboxUrl;
    // Convert HTTP URL to WebSocket URL
    const url = new URL(sandboxUrl);
    this.url = `${url.protocol === "https:" ? "wss:" : "ws:"}//${url.host}/ws`;
    this.store = store;
    console.log(`[Pantheon WS] Configured to connect to: ${this.url}`);
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        console.log(`[Pantheon WS] Attempting connection to ${this.url}...`);
        this.ws = new WebSocket(this.url);

        // Set a timeout to detect failed connections (no error event fires for unreachable hosts)
        const connectionTimeout = setTimeout(() => {
          if (this.ws && this.ws.readyState === WebSocket.CONNECTING) {
            this.ws.close();
            reject(
              new Error(
                `WebSocket connection timeout. Is Hephaestus running at ${this.sandboxUrl}? ` +
                `Check: NEXT_PUBLIC_SANDBOX_URL in .env.local`
              )
            );
          }
        }, 5000);

        this.ws.onopen = () => {
          clearTimeout(connectionTimeout);
          console.log(`[Pantheon WS] ✓ Connected to ${this.url}`);
          this.reconnectAttempts = 0;
          resolve();
        };

        this.ws.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data) as PantheonEvent;
            this.handleMessage(message);
          } catch (error) {
            console.error("[Pantheon WS] Failed to parse message:", error);
          }
        };

        this.ws.onerror = (error) => {
          clearTimeout(connectionTimeout);
          const errorMsg = `WebSocket connection failed to ${this.url}. ` +
            `Ensure Hephaestus is running and NEXT_PUBLIC_SANDBOX_URL is correct. ` +
            `Error: ${error instanceof Event ? error.type : String(error)}`;
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

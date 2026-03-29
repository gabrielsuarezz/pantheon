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

  constructor(sandboxUrl: string, store: EventStore) {
    // Convert HTTP URL to WebSocket URL
    const url = new URL(sandboxUrl);
    this.url = `${url.protocol === "https:" ? "wss:" : "ws:"}//${url.host}/ws`;
    this.store = store;
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.url);

        this.ws.onopen = () => {
          console.log(`[Pantheon WS] Connected to ${this.url}`);
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
          console.error("[Pantheon WS] WebSocket error:", error);
          reject(error);
        };

        this.ws.onclose = () => {
          console.log("[Pantheon WS] Disconnected");
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
      console.log(
        `[Pantheon WS] Attempting reconnect ${this.reconnectAttempts}/${this.maxReconnectAttempts}...`
      );
      setTimeout(() => {
        this.connect().catch((error) => {
          console.error("[Pantheon WS] Reconnect failed:", error);
        });
      }, this.reconnectDelay * this.reconnectAttempts);
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

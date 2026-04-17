"use client";

/**
 * Global store for connector/pipeline alerts.
 * Any component can push alerts; the persistent banner reads them.
 * Uses a simple pub-sub pattern (no React context needed).
 */

export interface ConnectorAlert {
  id: string;
  nodeName: string;
  message: string;
  timestamp: number;
}

type Listener = () => void;

let alerts: ConnectorAlert[] = [];
const listeners: Set<Listener> = new Set();

function emit() {
  listeners.forEach((l) => l());
}

/** Push a new connector alert (deduplicated by nodeName). */
export function pushConnectorAlert(nodeName: string, message: string) {
  // Replace existing alert for the same node
  alerts = alerts.filter((a) => a.nodeName !== nodeName);
  alerts.push({
    id: `${nodeName}-${Date.now()}`,
    nodeName,
    message,
    timestamp: Date.now(),
  });
  emit();
}

/** Dismiss a single alert by id. */
export function dismissConnectorAlert(id: string) {
  alerts = alerts.filter((a) => a.id !== id);
  emit();
}

/** Dismiss all alerts. */
export function dismissAllConnectorAlerts() {
  alerts = [];
  emit();
}

/** Get current alerts (snapshot). */
export function getConnectorAlerts(): ConnectorAlert[] {
  return alerts;
}

/** React hook — subscribes to alert changes. */
import { useSyncExternalStore } from "react";

// Stable empty array for SSR — must be the SAME reference every call to avoid infinite loop
const EMPTY: ConnectorAlert[] = [];

export function useConnectorAlerts(): ConnectorAlert[] {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => alerts,
    () => EMPTY
  );
}

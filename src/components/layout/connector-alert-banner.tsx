"use client";

import { useConnectorAlerts, dismissConnectorAlert, dismissAllConnectorAlerts } from "@/hooks/use-connector-alerts";
import { AlertTriangle, X, Database } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export function ConnectorAlertBanner() {
  const alerts = useConnectorAlerts();

  if (alerts.length === 0) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-[200] pointer-events-none">
      <div className="mx-auto max-w-screen-xl px-4 pt-2 flex flex-col gap-1 pointer-events-auto">
        {alerts.map((alert) => (
          <div
            key={alert.id}
            className="flex items-center gap-3 px-4 py-2.5 rounded-lg shadow-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/80 dark:border-amber-700 text-amber-900 dark:text-amber-200 text-sm animate-in slide-in-from-top-2 duration-300"
          >
            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
            <Database className="h-3.5 w-3.5 shrink-0 text-amber-500 dark:text-amber-400" />
            <span className="flex-1 min-w-0">
              <strong className="font-semibold">{alert.nodeName}:</strong>{" "}
              <span className="text-amber-800 dark:text-amber-300">{alert.message}</span>
            </span>
            <Link
              href="/settings"
              className="text-xs font-medium text-amber-700 dark:text-amber-300 hover:underline whitespace-nowrap"
            >
              Connettori
            </Link>
            <button
              onClick={() => dismissConnectorAlert(alert.id)}
              className="p-0.5 rounded hover:bg-amber-200 dark:hover:bg-amber-800 transition-colors"
              aria-label="Chiudi avviso"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
        {alerts.length > 1 && (
          <button
            onClick={dismissAllConnectorAlerts}
            className="self-end text-xs text-amber-600 dark:text-amber-400 hover:underline mr-1 mb-1"
          >
            Chiudi tutti ({alerts.length})
          </button>
        )}
      </div>
    </div>
  );
}

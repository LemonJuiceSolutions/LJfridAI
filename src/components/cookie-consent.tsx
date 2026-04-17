'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

interface CookieConsentData {
  essential: boolean;
  analytics: boolean;
  marketing: boolean;
  accepted: string;
  policyVersion: string;
  recordId?: string;
}

const STORAGE_KEY = 'cookie-consent-accepted';
const ANON_KEY = 'consent-anon-id';
// Bump when the cookie text or set of purposes changes — re-prompts users.
const POLICY_VERSION = '1.0';

function getAnonymousId(): string {
  try {
    let id = localStorage.getItem(ANON_KEY);
    if (!id) {
      id =
        typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID()
          : `anon-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
      localStorage.setItem(ANON_KEY, id);
    }
    return id;
  } catch {
    return `anon-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }
}

export function CookieConsent() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) { setVisible(true); return; }
      const parsed = JSON.parse(raw) as Partial<CookieConsentData>;
      // Re-prompt if the policy version was bumped since last consent.
      if (parsed?.policyVersion !== POLICY_VERSION) setVisible(true);
    } catch {
      setVisible(true);
    }
  }, []);

  async function accept(analytics: boolean, marketing = false) {
    const anonymousId = getAnonymousId();
    const payload = {
      essential: true,
      analytics,
      marketing,
      anonymousId,
      policyVersion: POLICY_VERSION,
    };

    let recordId: string | undefined;
    try {
      const res = await fetch('/api/consent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        credentials: 'same-origin',
      });
      if (res.ok) {
        const json = await res.json().catch(() => null);
        recordId = json?.id;
      }
    } catch {
      // Network failure — UI still hides; server retry happens on next page load.
    }

    const data: CookieConsentData = {
      essential: true,
      analytics,
      marketing,
      accepted: new Date().toISOString(),
      policyVersion: POLICY_VERSION,
      recordId,
    };
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch {}
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-zinc-900 text-zinc-100 px-4 py-4 md:px-8 md:py-5 shadow-lg">
      <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-start sm:items-center gap-4">
        <p className="text-sm flex-1">
          Questo sito utilizza cookie tecnici necessari al funzionamento. Puoi
          scegliere se accettare anche i cookie analitici.{' '}
          <Link href="/privacy" className="underline underline-offset-2 hover:text-zinc-300">
            Leggi la privacy policy
          </Link>
        </p>
        <div className="flex gap-3 shrink-0">
          <Button
            variant="outline"
            size="sm"
            className="border-zinc-600 text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100"
            onClick={() => accept(false)}
          >
            Solo essenziali
          </Button>
          <Button
            size="sm"
            onClick={() => accept(true)}
          >
            Accetta tutti
          </Button>
        </div>
      </div>
    </div>
  );
}

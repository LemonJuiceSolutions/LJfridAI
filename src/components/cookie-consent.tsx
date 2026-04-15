'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

interface CookieConsentData {
  essential: boolean;
  analytics: boolean;
  accepted: string;
}

const STORAGE_KEY = 'cookie-consent-accepted';

export default function CookieConsent() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) {
        setVisible(true);
      }
    } catch {
      // localStorage not available
    }
  }, []);

  function accept(analytics: boolean) {
    const data: CookieConsentData = {
      essential: true,
      analytics,
      accepted: new Date().toISOString(),
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      // localStorage not available
    }
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

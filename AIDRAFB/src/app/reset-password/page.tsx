'use client';

import Link from 'next/link';
import { AidraIcon } from '@/components/icons/aidra-icon';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import React, { useState } from 'react';
import { useAuth } from '@/firebase';
import { initiatePasswordReset } from '@/firebase/non-blocking-login';
import { Loader2 } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

export default function ResetPasswordPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const auth = useAuth();

  const handlePasswordReset = async () => {
    setError(null);
    setMessage(null);
    setLoading(true);
    if (!email) {
      setError("Per favore, inserisci il tuo indirizzo email.");
      setLoading(false);
      return;
    }
    try {
      await initiatePasswordReset(auth, email);
      setMessage("Se un account con questa email esiste, ti abbiamo inviato le istruzioni per reimpostare la password. Controlla la tua casella di posta (anche lo spam).");
    } catch (err: any) {
      console.error("Password Reset Error:", err);
      // For security reasons, a generic message is often better than confirming if an email exists.
      setError("Impossibile inviare l'email di reset in questo momento. Riprova più tardi.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-100 dark:bg-gray-900 p-4">
      <Card className="mx-auto max-w-sm w-full">
        <CardHeader className="space-y-1 text-center">
          <div className="inline-flex items-center justify-center gap-2 mb-4">
            <AidraIcon className="h-8 w-8 text-primary" />
            <CardTitle className="text-3xl font-bold">AIDRA</CardTitle>
          </div>
          <CardTitle className='text-2xl'>Reimposta la tua password</CardTitle>
          <CardDescription>
            Inserisci la tua email per ricevere un link di reset.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {error && (
                <Alert variant="destructive">
                    <AlertTitle>Errore</AlertTitle>
                    <AlertDescription>{error}</AlertDescription>
                </Alert>
            )}
             {message && (
                <Alert>
                    <AlertTitle>Controlla la tua Email</AlertTitle>
                    <AlertDescription>{message}</AlertDescription>
                </Alert>
            )}

            <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                    id="email"
                    type="email"
                    placeholder="m@example.com"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                />
            </div>
            <Button type="submit" className="w-full" onClick={handlePasswordReset} disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Invia Link di Reset
            </Button>
            
            <div className="mt-4 text-center text-sm">
                Tornare al{' '}
                <Link href="/login" className="underline">
                    Login
                </Link>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

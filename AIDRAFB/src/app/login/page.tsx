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
import { Checkbox } from '@/components/ui/checkbox';
import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth, useUser } from '@/firebase';
import {
  initiateEmailSignUp,
  initiateEmailSignIn,
  initiatePasswordReset,
} from '@/firebase/non-blocking-login';
import { Loader2 } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { onAuthStateChanged, Auth } from 'firebase/auth';

type View = 'login' | 'signup';

export default function LoginPage() {
  const [view, setView] = useState<View>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const auth = useAuth();
  const { user, isUserLoading } = useUser();
  const router = useRouter();

  useEffect(() => {
    if (user && !isUserLoading) {
      router.push('/dashboard');
    }
  }, [user, isUserLoading, router]);

  const handleLogin = async () => {
    setError(null);
    setMessage(null);
    setLoading(true);
    if (!email || !password) {
        setError("Per favore, inserisci email e password.");
        setLoading(false);
        return;
    }
    try {
      await initiateEmailSignIn(auth, email, password);
      // onAuthStateChanged will handle redirect
    } catch (err: any) {
        if (err.code === 'auth/invalid-credential' || err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password') {
            setError('Credenziali non valide. Controlla email e password.');
        } else {
            setError(err.message || 'Si è verificato un errore durante il login.');
        }
    } finally {
        setLoading(false);
    }
  };

  const handleSignUp = async () => {
    setError(null);
    setMessage(null);
    setLoading(true);
    if (!firstName || !lastName || !email || !password) {
        setError("Per favore, compila tutti i campi.");
        setLoading(false);
        return;
    }
    if (!agreedToTerms) {
      setError(
        'Devi accettare i Termini di Servizio e la Privacy Policy per registrarti.'
      );
      setLoading(false);
      return;
    }
     try {
      await initiateEmailSignUp(auth, email, password, firstName, lastName);
      // onAuthStateChanged will handle redirect
    } catch (err: any) {
      if (err.code === 'auth/email-already-in-use') {
            setError('Questo indirizzo email è già in uso.');
        } else if (err.code === 'auth/weak-password') {
            setError('La password è troppo debole. Deve essere di almeno 6 caratteri.');
        }
        else {
            setError(err.message || 'Si è verificato un errore durante la registrazione.');
        }
    } finally {
      setLoading(false);
    }
  };


  if (isUserLoading || user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-100 dark:bg-gray-900">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  const renderContent = () => {
    if (view === 'signup') {
        return (
            <>
                <div className="flex gap-4">
                  <div className="space-y-2 flex-1">
                    <Label htmlFor="firstName">Nome</Label>
                    <Input
                      id="firstName"
                      placeholder="Mario"
                      required
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2 flex-1">
                    <Label htmlFor="lastName">Cognome</Label>
                    <Input
                      id="lastName"
                      placeholder="Rossi"
                      required
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                    />
                  </div>
                </div>
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
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
                <div className="items-top flex space-x-2">
                 <Checkbox id="terms1" checked={agreedToTerms} onCheckedChange={(checked) => setAgreedToTerms(checked as boolean)} />
                    <div className="grid gap-1.5 leading-none">
                        <label
                        htmlFor="terms1"
                        className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                        >
                        Accetta i termini e le condizioni
                        </label>
                        <p className="text-sm text-muted-foreground">
                        Accetti i nostri{' '}
                        <Link href="#" className="underline" prefetch={false}>
                            Termini di Servizio
                        </Link>{' '}
                        e la nostra{' '}
                        <Link href="#" className="underline" prefetch={false}>
                            Privacy Policy
                        </Link>
                        .
                        </p>
                    </div>
                </div>
                <Button type="submit" className="w-full" onClick={handleSignUp} disabled={loading}>
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Registrati
                </Button>
            </>
        )
    }

    return ( // Login view
        <>
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
            <div className="space-y-2">
              <div className="flex items-center">
                <Label htmlFor="password">Password</Label>
                <Link
                    href="/reset-password"
                    className="ml-auto inline-block text-sm underline"
                  >
                    Password dimenticata?
                  </Link>
              </div>
              <Input
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <Button
              type="submit"
              className="w-full"
              onClick={handleLogin}
              disabled={loading}
            >
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Login
            </Button>
        </>
    );
  }

  const getTitle = () => {
    switch(view) {
        case 'login': return 'Accedi al tuo account';
        case 'signup': return 'Crea un nuovo account';
    }
  }

  const getDescription = () => {
    switch(view) {
        case 'login': return 'Inserisci la tua email per accedere al tuo account';
        case 'signup': return 'Crea un nuovo account per iniziare';
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-100 dark:bg-gray-900 p-4">
      <Card className="mx-auto max-w-sm w-full">
        <CardHeader className="space-y-1 text-center">
          <div className="inline-flex items-center justify-center gap-2 mb-4">
            <AidraIcon className="h-8 w-8 text-primary" />
            <CardTitle className="text-3xl font-bold">AIDRA</CardTitle>
          </div>
          <CardTitle className='text-2xl'>{getTitle()}</CardTitle>
          <CardDescription>
            {getDescription()}
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
                    <AlertTitle>Successo</AlertTitle>
                    <AlertDescription>{message}</AlertDescription>
                </Alert>
            )}

            {renderContent()}

            <div className="mt-4 text-center text-sm">
                {view === 'login' && (
                     <>Non hai un account? <Button variant="link" className="pl-1" onClick={() => { setView('signup'); setError(null); setMessage(null)}}>Registrati</Button></>
                )}
                 {view === 'signup' && (
                     <>Hai già un account? <Button variant="link" className="pl-1" onClick={() => { setView('login'); setError(null); setMessage(null)}}>Accedi</Button></>
                )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

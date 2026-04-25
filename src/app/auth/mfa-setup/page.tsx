'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Mail, ShieldCheck } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export default function MfaSetupPage() {
    const { data: session, status } = useSession();
    const router = useRouter();
    const { toast } = useToast();
    const [isLoading, setIsLoading] = useState(false);
    const [qrUri, setQrUri] = useState('');
    const [secret, setSecret] = useState('');
    const [verifyCode, setVerifyCode] = useState('');
    const [setupDone, setSetupDone] = useState(false);
    const [isEmailing, setIsEmailing] = useState(false);

    useEffect(() => {
        if (status === 'unauthenticated') {
            router.push('/auth/signin');
        }
    }, [status, router]);

    // Generate TOTP secret on mount
    useEffect(() => {
        if (status !== 'authenticated') return;
        fetch('/api/auth/mfa/setup', { method: 'POST' })
            .then(res => res.json())
            .then(data => {
                if (data.secret && data.uri) {
                    setSecret(data.secret);
                    setQrUri(data.uri);
                }
            })
            .catch(() => {
                toast({ variant: 'destructive', title: 'Errore', description: 'Impossibile generare il secret MFA' });
            });
    }, [status, toast]);

    const qrImageUrl = qrUri
        ? `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(qrUri)}`
        : '';

    const handleSendEmail = async () => {
        setIsEmailing(true);
        try {
            const res = await fetch('/api/auth/mfa/email-qr', { method: 'POST' });
            const data = await res.json();
            if (res.ok && data.success) {
                toast({
                    title: 'Email inviata',
                    description: `QR code inviato a ${session?.user?.email}. Controlla la posta (anche lo spam).`,
                });
            } else {
                toast({
                    variant: 'destructive',
                    title: 'Errore invio email',
                    description: data.error || 'Impossibile inviare l\'email',
                });
            }
        } catch {
            toast({ variant: 'destructive', title: 'Errore', description: 'Errore di rete durante l\'invio email' });
        } finally {
            setIsEmailing(false);
        }
    };

    const handleVerify = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);

        try {
            const res = await fetch('/api/auth/mfa/verify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token: verifyCode }),
            });
            const data = await res.json();

            if (data.success) {
                setSetupDone(true);
                toast({ title: 'MFA Attivato', description: 'Autenticazione a due fattori configurata con successo.' });
            } else {
                toast({ variant: 'destructive', title: 'Errore', description: data.error || 'Codice non valido' });
            }
        } catch {
            toast({ variant: 'destructive', title: 'Errore', description: 'Errore durante la verifica' });
        } finally {
            setIsLoading(false);
        }
    };

    if (status === 'loading') {
        return (
            <div className="flex min-h-screen items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin" />
            </div>
        );
    }

    if (setupDone) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-violet-950 via-indigo-950 to-slate-950 p-4">
                <Card className="w-full max-w-md">
                    <CardHeader className="text-center">
                        <div className="flex justify-center mb-4">
                            <ShieldCheck className="h-16 w-16 text-green-500" />
                        </div>
                        <CardTitle>MFA Configurato!</CardTitle>
                        <CardDescription>
                            L&apos;autenticazione a due fattori è attiva. Da ora in poi dovrai inserire il codice ad ogni accesso.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Button className="w-full" onClick={() => { router.push('/auth/signin'); }}>
                            Vai al Login
                        </Button>
                    </CardContent>
                </Card>
            </div>
        );
    }

    return (
        <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-violet-950 via-indigo-950 to-slate-950 p-4">
            <Card className="w-full max-w-md">
                <CardHeader className="text-center">
                    <CardTitle>Configura Autenticazione a Due Fattori</CardTitle>
                    <CardDescription>
                        Scansiona il QR code con la tua app di autenticazione (Google Authenticator, Authy, ecc.)
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    {qrImageUrl ? (
                        <div className="flex flex-col items-center gap-4">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={qrImageUrl} alt="QR Code MFA" width={250} height={250} className="rounded-lg border" />
                            <details className="text-xs text-muted-foreground w-full">
                                <summary className="cursor-pointer hover:text-foreground">
                                    Non riesci a scansionare? Inserisci manualmente
                                </summary>
                                <code className="mt-2 block break-all rounded bg-muted p-2 text-xs">
                                    {secret}
                                </code>
                            </details>
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="w-full"
                                onClick={handleSendEmail}
                                disabled={isEmailing || !qrUri}
                            >
                                {isEmailing
                                    ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    : <Mail className="mr-2 h-4 w-4" />}
                                Invia QR via email ({session?.user?.email})
                            </Button>
                        </div>
                    ) : (
                        <div className="flex justify-center">
                            <Loader2 className="h-8 w-8 animate-spin" />
                        </div>
                    )}

                    <form onSubmit={handleVerify} className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="verifyCode">Codice di Verifica</Label>
                            <Input
                                id="verifyCode"
                                type="text"
                                inputMode="numeric"
                                autoComplete="one-time-code"
                                placeholder="123456"
                                maxLength={6}
                                value={verifyCode}
                                onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, ''))}
                                disabled={isLoading}
                                required
                            />
                            <p className="text-xs text-muted-foreground">
                                Inserisci il codice a 6 cifre per verificare la configurazione
                            </p>
                        </div>
                        <Button type="submit" className="w-full" disabled={isLoading || verifyCode.length !== 6}>
                            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Verifica e Attiva MFA
                        </Button>
                    </form>
                </CardContent>
            </Card>
        </div>
    );
}

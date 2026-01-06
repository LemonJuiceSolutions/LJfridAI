'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';
import Image from 'next/image';
import { useToast } from '@/hooks/use-toast';

export default function SignInPage() {
    const router = useRouter();
    const { toast } = useToast();
    const [isLoading, setIsLoading] = useState(false);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);

        try {
            const result = await signIn('credentials', {
                email,
                password,
                redirect: false,
            });

            if (result?.error) {
                toast({
                    variant: 'destructive',
                    title: 'Errore di Autenticazione',
                    description: result.error,
                });
            } else {
                router.push('/');
                router.refresh();
            }
        } catch (error) {
            toast({
                variant: 'destructive',
                title: 'Errore',
                description: 'Si è verificato un errore durante il login.',
            });
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-violet-950 via-indigo-950 to-slate-950 p-4">
            <Card className="w-full max-w-md">
                <CardHeader className="space-y-4 text-center">
                    <div className="flex justify-center">
                        <div className="h-24 w-24 relative shrink-0">
                            <Image src="/logo-custom.png" alt="Logo" fill className="object-contain" sizes="96px" priority unoptimized />
                        </div>
                    </div>
                    <CardTitle className="text-2xl">FridAI</CardTitle>
                    <CardDescription>
                        Accedi al tuo account per gestire le regole decisionali
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="email">Email</Label>
                            <Input
                                id="email"
                                type="email"
                                placeholder="nome@azienda.com"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                disabled={isLoading}
                                required
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="password">Password</Label>
                            <Input
                                id="password"
                                type="password"
                                placeholder="••••••••"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                disabled={isLoading}
                                required
                            />
                        </div>
                        <Button
                            type="submit"
                            className="w-full"
                            disabled={isLoading}
                        >
                            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Accedi
                        </Button>

                        <div className="text-center text-sm">
                            <span className="text-muted-foreground">Non hai un account? </span>
                            <Link href="/auth/signup" className="text-primary hover:underline">
                                Registrati
                            </Link>
                        </div>
                    </form>
                </CardContent>
            </Card>
        </div>
    );
}

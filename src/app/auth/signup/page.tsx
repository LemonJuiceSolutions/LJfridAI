'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, BrainCircuit } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import Link from 'next/link';

export default function SignUpPage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const token = searchParams.get('token');
    const { toast } = useToast();
    const [isLoading, setIsLoading] = useState(false);
    const [formData, setFormData] = useState({
        name: '',
        email: '',
        password: '',
        confirmPassword: '',
        companyName: '',
        departmentName: '',
    });

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (formData.password !== formData.confirmPassword) {
            toast({
                variant: 'destructive',
                title: 'Errore',
                description: 'Le password non coincidono',
            });
            return;
        }

        if (formData.password.length < 6) {
            toast({
                variant: 'destructive',
                title: 'Errore',
                description: 'La password deve essere di almeno 6 caratteri',
            });
            return;
        }

        setIsLoading(true);

        try {
            const response = await fetch('/api/auth/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: formData.name,
                    email: formData.email,
                    password: formData.password,
                    companyName: token ? undefined : formData.companyName,
                    departmentName: token ? undefined : formData.departmentName,
                    token: token || undefined
                }),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Errore durante la registrazione');
            }

            toast({
                title: 'Registrazione completata!',
                description: 'Ora puoi effettuare il login',
            });

            router.push('/auth/signin');
        } catch (error: any) {
            toast({
                variant: 'destructive',
                title: 'Errore di Registrazione',
                description: error.message,
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
                        <div className="rounded-full bg-primary/10 p-3">
                            <BrainCircuit className="h-12 w-12 text-primary" />
                        </div>
                    </div>
                    <CardTitle className="text-2xl">{token ? 'Unisciti al Team' : 'Crea Account'}</CardTitle>
                    <CardDescription>
                        {token ? 'Completa la registrazione per accedere all\'azienda.' : 'Registrati per iniziare a creare regole decisionali'}
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="name">Nome Completo</Label>
                            <Input
                                id="name"
                                type="text"
                                placeholder="Mario Rossi"
                                value={formData.name}
                                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                disabled={isLoading}
                                required
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="email">Email</Label>
                            <Input
                                id="email"
                                type="email"
                                placeholder="nome@azienda.com"
                                value={formData.email}
                                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                disabled={isLoading}
                                required
                            />
                        </div>

                        {!token && (
                            <div className="space-y-2">
                                <Label htmlFor="companyName">Nome Azienda</Label>
                                <Input
                                    id="companyName"
                                    type="text"
                                    placeholder="La mia azienda"
                                    value={formData.companyName}
                                    onChange={(e) => setFormData({ ...formData, companyName: e.target.value })}
                                    disabled={isLoading}
                                    required={!token}
                                />
                            </div>
                        )}

                        {!token && (
                            <div className="space-y-2">
                                <Label htmlFor="departmentName">Reparto</Label>
                                <Input
                                    id="departmentName"
                                    type="text"
                                    placeholder="IT"
                                    value={formData.departmentName}
                                    onChange={(e) => setFormData({ ...formData, departmentName: e.target.value })}
                                    disabled={isLoading}
                                    required={!token}
                                />
                            </div>
                        )}

                        <div className="space-y-2">
                            <Label htmlFor="password">Password</Label>
                            <Input
                                id="password"
                                type="password"
                                placeholder="••••••••"
                                value={formData.password}
                                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                                disabled={isLoading}
                                required
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="confirmPassword">Conferma Password</Label>
                            <Input
                                id="confirmPassword"
                                type="password"
                                placeholder="••••••••"
                                value={formData.confirmPassword}
                                onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
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
                            Registrati
                        </Button>

                        <div className="text-center text-sm">
                            <span className="text-muted-foreground">Hai già un account? </span>
                            <Link href="/auth/signin" className="text-primary hover:underline">
                                Accedi
                            </Link>
                        </div>
                    </form>
                </CardContent>
            </Card>
        </div>
    );
}

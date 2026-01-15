"use client";

import * as z from "zod";
import { useForm } from "react-hook-form";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";

import { resetPassword } from "@/actions/reset-password";
import { Input } from "@/components/ui/input";
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@/components/ui/form";
import { CardWrapper } from "@/components/auth/card-wrapper";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

const ResetSchema = z.object({
    email: z.string().email({
        message: "Email non valida",
    }),
    // Optional fields for ephemeral SMTP config
    smtpHost: z.string().optional(),
    smtpUser: z.string().optional(),
    smtpPass: z.string().optional(),
    smtpPort: z.string().optional(),
});

export const ResetForm = () => {
    const router = useRouter();
    const [error, setError] = useState<string | undefined>("");
    const [success, setSuccess] = useState<string | undefined>("");
    const [showSmtpConfig, setShowSmtpConfig] = useState(false);
    const [isPending, startTransition] = useTransition();

    const form = useForm<z.infer<typeof ResetSchema>>({
        resolver: zodResolver(ResetSchema),
        defaultValues: {
            email: "",
        },
    });

    const onSubmit = (values: z.infer<typeof ResetSchema>) => {
        setError("");
        setSuccess("");
        // Do not reset showSmtpConfig here to allow retry with SMTP data

        startTransition(() => {
            resetPassword(values)
                .then((data) => {
                    if (data?.missingSmtp) {
                        setShowSmtpConfig(true);
                        setError(data.error || "Server non configurato per l'invio email. Inserisci un SMTP temporaneo.");
                        return;
                    }

                    setError(data?.error);
                    setSuccess(data?.success);
                    // @ts-ignore
                    if (data?.token) {
                        //router.push(`/auth/new-password?token=${data.token}`);
                    }
                });
        });
    };

    return (
        <CardWrapper
            headerLabel="Password dimenticata?"
            backButtonLabel="Torna al login"
            backButtonHref="/auth/signin"
        >
            <Form {...form}>
                <form
                    onSubmit={form.handleSubmit(onSubmit)}
                    className="space-y-6"
                >
                    <div className="space-y-4">
                        <FormField
                            control={form.control}
                            name="email"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Email</FormLabel>
                                    <FormControl>
                                        <Input
                                            {...field}
                                            disabled={isPending}
                                            placeholder="nome@esempio.com"
                                            type="email"
                                        />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        {showSmtpConfig && (
                            <div className="rounded-md border p-4 space-y-4 bg-muted/50 border-orange-200">
                                <div className="text-sm font-medium text-orange-600 mb-2">
                                    Configurazione SMTP Richiesta (Temporanea)
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                    <FormField
                                        control={form.control}
                                        name="smtpHost"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel className="text-xs">Host</FormLabel>
                                                <FormControl>
                                                    <Input {...field} disabled={isPending} placeholder="smtp.gmail.com" className="h-8" />
                                                </FormControl>
                                            </FormItem>
                                        )}
                                    />
                                    <FormField
                                        control={form.control}
                                        name="smtpPort"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel className="text-xs">Porta</FormLabel>
                                                <FormControl>
                                                    <Input {...field} disabled={isPending} placeholder="587" className="h-8" />
                                                </FormControl>
                                            </FormItem>
                                        )}
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                    <FormField
                                        control={form.control}
                                        name="smtpUser"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel className="text-xs">Utente</FormLabel>
                                                <FormControl>
                                                    <Input {...field} disabled={isPending} placeholder="email@gmail.com" className="h-8" />
                                                </FormControl>
                                            </FormItem>
                                        )}
                                    />
                                    <FormField
                                        control={form.control}
                                        name="smtpPass"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel className="text-xs">Password / App Pwd</FormLabel>
                                                <FormControl>
                                                    <Input {...field} disabled={isPending} type="password" placeholder="****" className="h-8" />
                                                </FormControl>
                                            </FormItem>
                                        )}
                                    />
                                </div>
                            </div>
                        )}
                    </div>
                    {error && (
                        <Alert variant="destructive">
                            <AlertTitle>Errore</AlertTitle>
                            <AlertDescription>{error}</AlertDescription>
                        </Alert>
                    )}
                    {success && (
                        <Alert className="bg-emerald-500/15 text-emerald-500 border-emerald-500/20">
                            <AlertTitle>Successo</AlertTitle>
                            <AlertDescription>{success}</AlertDescription>
                        </Alert>
                    )}
                    <Button
                        disabled={isPending}
                        type="submit"
                        className="w-full"
                    >
                        {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Invia email di reset
                    </Button>
                </form>
            </Form>
        </CardWrapper>
    );
};

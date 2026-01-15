"use client";

import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import Image from "next/image";

interface CardWrapperProps {
    children: React.ReactNode;
    headerLabel: string;
    backButtonLabel: string;
    backButtonHref: string;
    showSocial?: boolean;
}

export const CardWrapper = ({
    children,
    headerLabel,
    backButtonLabel,
    backButtonHref,
    showSocial,
}: CardWrapperProps) => {
    return (
        <Card className="w-[400px] shadow-md">
            <CardHeader>
                <div className="w-full flex flex-col gap-y-4 items-center justify-center">
                    <div className="h-20 w-20 relative shrink-0">
                        <Image src="/logo-custom.png" alt="Logo" fill className="object-contain" sizes="80px" priority unoptimized />
                    </div>
                    <h1 className="text-3xl font-semibold">FridAI</h1>
                    <p className="text-muted-foreground text-sm">{headerLabel}</p>
                </div>
            </CardHeader>
            <CardContent>{children}</CardContent>
            <CardFooter>
                <Button variant="link" className="font-normal w-full" size="sm" asChild>
                    <Link href={backButtonHref}>{backButtonLabel}</Link>
                </Button>
            </CardFooter>
        </Card>
    );
};

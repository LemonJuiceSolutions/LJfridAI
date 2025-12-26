'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession, signOut } from 'next-auth/react';
import {
    Home,
    PlusCircle,
    Bot,
    Database,
    Settings,
    Cloud,
    BrainCircuit,
    ChevronRight,
    LayoutDashboard,
    LogOut
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

const navItems = [
    { name: 'Regole', href: '/', icon: LayoutDashboard },
    { name: 'detAI', href: '/detai', icon: BrainCircuit },
    { name: 'Chatbot Diagnostico', href: '/chatbot', icon: Bot },
    { name: 'Variabili', href: '/variables', icon: Database },
] as const;

export function SidebarNav() {
    const pathname = usePathname();
    const { data: session } = useSession();

    return (
        <aside className="fixed left-0 top-0 z-40 h-screen w-56 border-r border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-950">
            <div className="flex h-full flex-col">
                {/* Logo */}
                <div className="flex h-14 items-center border-b border-slate-100 dark:border-zinc-800 px-4">
                    <Link href="/" className="flex items-center gap-2.5">
                        <div className="h-7 w-7 rounded-md bg-violet-600 flex items-center justify-center">
                            <BrainCircuit className="h-4 w-4 text-white" />
                        </div>
                        <span className="text-slate-900 dark:text-white text-sm font-semibold tracking-tight">Like AI Said</span>
                    </Link>
                </div>

                {/* Nav Items */}
                <ScrollArea className="flex-1 px-3 py-3">
                    <nav className="space-y-0.5">
                        {navItems.map((item) => {
                            const isActive = pathname === item.href;
                            return (
                                <Link
                                    key={item.name}
                                    href={item.href}
                                    className={cn(
                                        "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] font-medium transition-colors",
                                        isActive
                                            ? "bg-violet-50 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300"
                                            : "text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-zinc-900 hover:text-slate-900 dark:hover:text-white"
                                    )}
                                >
                                    <item.icon className={cn(
                                        "h-4 w-4",
                                        isActive ? "text-violet-600 dark:text-violet-400" : "text-slate-400 dark:text-slate-500"
                                    )} />
                                    <span>{item.name}</span>
                                </Link>
                            );
                        })}
                    </nav>
                </ScrollArea>

                {/* Footer */}
                <div className="border-t border-slate-100 dark:border-zinc-800 p-3 space-y-2">
                    <Link
                        href="/settings"
                        className={cn(
                            "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] font-medium transition-colors",
                            pathname === '/settings'
                                ? "bg-violet-50 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300"
                                : "text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-zinc-900 hover:text-slate-900 dark:hover:text-white"
                        )}
                    >
                        <Settings className={cn("h-4 w-4", pathname === '/settings' ? "text-violet-600 dark:text-violet-400" : "text-slate-400 dark:text-slate-500")} />
                        <span>Impostazioni</span>
                    </Link>

                    {session?.user && (
                        <div className="rounded-md bg-slate-50 dark:bg-zinc-900 px-2.5 py-2 space-y-1.5">
                            <div>
                                <p className="text-[12px] font-medium text-slate-700 dark:text-slate-300 truncate">{session.user.name || 'Utente'}</p>
                                <p className="text-[11px] text-slate-500 dark:text-slate-500 truncate">{session.user.email}</p>
                            </div>
                            <button
                                onClick={() => signOut({ callbackUrl: '/auth/signin' })}
                                className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500 hover:text-slate-700 dark:text-slate-500 dark:hover:text-slate-300 transition-colors"
                            >
                                <LogOut className="h-3 w-3" />
                                Logout
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </aside>
    );
}



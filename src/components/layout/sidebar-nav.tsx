'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession, signOut } from 'next-auth/react';
import Image from 'next/image';
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
    LogOut,
    Edit,
    ShoppingCart,
    Calendar,
    Truck,
    Scissors,
    Shirt,
    Brush,
    PencilRuler,
    Droplets,
    Wind,
    Sparkles,
    Package,
    Boxes,
    Plug,
    GitCommitHorizontal,
    Compass,
    User as UserIcon,
    BookOpen,
    UserSearch,
    Palette,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Separator } from '@/components/ui/separator';
import { useEditMode } from '@/hooks/use-edit-mode';
import { Badge } from '@/components/ui/badge';

// Original FridAI nav items (Static)
const fridaiNavItems = [
    { name: 'Regole', href: '/', icon: LayoutDashboard },
    { name: 'detAI', href: '/detai', icon: BrainCircuit },
    { name: 'Chatbot Diagnostico', href: '/chatbot', icon: Bot },
    { name: 'Variabili', href: '/variables', icon: Database },
    { name: 'Knowledge Base', href: '/knowledge-base', icon: BookOpen },
    { name: 'Lead Generator', href: '/lead-generator', icon: UserSearch },
    { name: 'Schedulazioni', href: '/scheduler', icon: Calendar },
] as const;

import * as LucideIcons from 'lucide-react';
import { useNavigation } from '@/hooks/use-navigation';

import { useLayout } from '@/components/providers/layout-provider';

export function SidebarNav() {
    const pathname = usePathname();
    const { data: session } = useSession();
    const { editMode, setEditMode } = useEditMode();
    const { navItems, settingsNavItems, isLoading } = useNavigation();
    const { isSidebarOpen, toggleSidebar } = useLayout();
    const [missedTasksCount, setMissedTasksCount] = useState<number>(0);

    useEffect(() => {
        if (!session?.user) return;

        const fetchMissedCount = async () => {
            try {
                const res = await fetch('/api/scheduler/missed-tasks');
                if (res.ok) {
                    const data = await res.json();
                    setMissedTasksCount(data.length || 0);
                }
            } catch (err) {
                console.error('Failed to fetch missed tasks count:', err);
            }
        };

        fetchMissedCount();
        const interval = setInterval(fetchMissedCount, 60000); // Check every minute
        return () => clearInterval(interval);
    }, [session]);

    if (!isSidebarOpen) {
        return (
            <aside className="fixed left-0 top-0 z-40 h-screen w-0 border-r border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 transition-all duration-300 overflow-hidden">
                <Button
                    variant="ghost"
                    size="icon"
                    className="absolute top-4 left-4 z-50 h-8 w-8 bg-background border shadow-sm hover:bg-accent"
                    onClick={toggleSidebar}
                >
                    <ChevronRight className="h-4 w-4" />
                </Button>
            </aside>
        );
    }

    return (
        <aside className="fixed left-0 top-0 z-40 h-screen w-56 border-r border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 transition-all duration-300">
            <div className="flex h-full flex-col">
                {/* Logo and Edit Toggle */}
                <div className="flex h-14 items-center justify-between border-b border-slate-100 dark:border-zinc-800 px-4">
                    <Link href="/" className="flex items-center gap-2.5">
                        <div className="h-7 w-7 relative shrink-0">
                            <Image src="/logo-custom.png" alt="Logo" fill className="object-contain rounded-md" sizes="28px" />
                        </div>
                        <span className="text-slate-900 dark:text-white text-sm font-semibold tracking-tight">FridAI</span>
                    </Link>
                    <TooltipProvider>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button
                                    variant={editMode ? 'default' : 'ghost'}
                                    size="icon"
                                    className="h-8 w-8"
                                    onClick={() => setEditMode(!editMode)}
                                >
                                    <Edit className={cn("h-4 w-4", editMode && "text-white")} />
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent side="right">
                                <p>{editMode ? 'Disattiva Modifica' : 'Modalità Modifica'}</p>
                            </TooltipContent>
                        </Tooltip>
                    </TooltipProvider>
                </div>

                {/* Nav Items */}
                <ScrollArea className="flex-1 px-3 py-3">
                    <nav className="space-y-0.5">
                        {/* Production Section (Dynamic) */}
                        <p className="px-2.5 py-1.5 text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Aidra</p>
                        {isLoading ? (
                            <div className="px-2.5 py-2 text-sm text-slate-400">Caricamento...</div>
                        ) : (
                            navItems.map((item) => {
                                const isActive = pathname === item.href;
                                // Cast LucideIcons to any to index it with string key
                                const IconComponent = (LucideIcons as any)[item.icon] || LucideIcons.HelpCircle;
                                return (
                                    <Link
                                        key={item.label}
                                        href={item.href}
                                        className={cn(
                                            "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] font-medium transition-colors",
                                            isActive
                                                ? "bg-violet-50 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300"
                                                : "text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-zinc-900 hover:text-slate-900 dark:hover:text-white"
                                        )}
                                    >
                                        <IconComponent className={cn(
                                            "h-4 w-4",
                                            isActive ? "text-violet-600 dark:text-violet-400" : "text-slate-400 dark:text-slate-500"
                                        )} />
                                        <span>{item.label}</span>
                                    </Link>
                                );
                            })
                        )}

                        {/* FridAI Section (Static) */}
                        <Separator className="my-2" />
                        <p className="px-2.5 py-1.5 text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">FridAI</p>
                        {fridaiNavItems.map((item) => {
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
                                    <span className="flex-1">{item.name}</span>
                                    {item.href === '/scheduler' && missedTasksCount > 0 && (
                                        <Badge variant="destructive" className="h-4 min-w-[16px] px-1 flex items-center justify-center rounded-full text-[9px]">
                                            {missedTasksCount}
                                        </Badge>
                                    )}
                                </Link>
                            );
                        })}
                    </nav>
                </ScrollArea>

                {/* Footer */}
                <div className="border-t border-slate-100 dark:border-zinc-800 p-3 space-y-1">
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
                    <Link
                        href="/settings/navigation"
                        className={cn(
                            "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] font-medium transition-colors",
                            pathname === '/settings/navigation'
                                ? "bg-violet-50 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300"
                                : "text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-zinc-900 hover:text-slate-900 dark:hover:text-white"
                        )}
                    >
                        <Compass className={cn("h-4 w-4", pathname === '/settings/navigation' ? "text-violet-600 dark:text-violet-400" : "text-slate-400 dark:text-slate-500")} />
                        <span>Navigation</span>
                    </Link>
                    <Link
                        href="/settings/database"
                        className={cn(
                            "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] font-medium transition-colors",
                            pathname === '/settings/database'
                                ? "bg-violet-50 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300"
                                : "text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-zinc-900 hover:text-slate-900 dark:hover:text-white"
                        )}
                    >
                        <Database className={cn("h-4 w-4", pathname === '/settings/database' ? "text-violet-600 dark:text-violet-400" : "text-slate-400 dark:text-slate-500")} />
                        <span>Database</span>
                    </Link>
                    <Link
                        href="/style"
                        className={cn(
                            "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] font-medium transition-colors",
                            pathname === '/style'
                                ? "bg-violet-50 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300"
                                : "text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-zinc-900 hover:text-slate-900 dark:hover:text-white"
                        )}
                    >
                        <Palette className={cn("h-4 w-4", pathname === '/style' ? "text-violet-600 dark:text-violet-400" : "text-slate-400 dark:text-slate-500")} />
                        <span>Stile</span>
                    </Link>
                    <Link
                        href="/settings/profile"
                        className={cn(
                            "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] font-medium transition-colors",
                            pathname === '/settings/profile'
                                ? "bg-violet-50 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300"
                                : "text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-zinc-900 hover:text-slate-900 dark:hover:text-white"
                        )}
                    >
                        <UserIcon className={cn("h-4 w-4", pathname === '/settings/profile' ? "text-violet-600 dark:text-violet-400" : "text-slate-400 dark:text-slate-500")} />
                        <span>Profilo</span>
                    </Link>


                    {session?.user && (
                        <div className="rounded-md bg-slate-50 dark:bg-zinc-900 px-2.5 py-2 space-y-1.5 mt-2">
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



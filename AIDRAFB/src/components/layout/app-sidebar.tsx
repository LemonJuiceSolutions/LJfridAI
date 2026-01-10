'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import * as icons from 'lucide-react';
import { AidraIcon } from '@/components/icons/aidra-icon';

import { Sheet, SheetContent, SheetOverlay, SheetTrigger } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { PanelLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useNavigation } from '@/hooks/use-navigation';
import type { NavItem } from '@/hooks/use-navigation';
import { ScrollArea } from '@/components/ui/scroll-area';

export default function AppSidebar() {
  const pathname = usePathname();
  const { navItems, settingsNavItems } = useNavigation();

  const renderNavItems = (items: NavItem[], isSettings = false) =>
    items.map((item) => {
      const Icon = icons[item.icon as keyof typeof icons] || icons.HelpCircle;
      const isActive = pathname === item.href;
      return (
      <Link
        key={item.label}
        href={item.href}
        className={cn(
          'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-all',
          isActive
            ? isSettings ? 'bg-primary/10 font-semibold' : 'bg-primary text-primary-foreground'
            : isSettings ? 'hover:bg-primary/10' : 'text-muted-foreground hover:text-foreground hover:bg-muted',
           isSettings ? 'text-primary' : ''
        )}
      >
        <Icon className="h-5 w-5" />
        <span className="truncate">{item.label}</span>
      </Link>
    )});

  const SidebarContent = ({ isMobile = false }) => (
    <div className='flex flex-col h-full'>
      <div className='p-4 flex-shrink-0'>
        <Link
          href="/dashboard"
          className="group flex items-center gap-2 rounded-full bg-primary px-3 py-2 text-lg font-semibold text-primary-foreground"
        >
          <AidraIcon className="h-6 w-6 transition-all group-hover:scale-110" />
          <span className="">AIDRA</span>
        </Link>
      </div>

      <ScrollArea className="flex-1 pr-4">
        <nav className="flex flex-col gap-2 px-4">
          {renderNavItems(navItems)}
        </nav>
      </ScrollArea>
      
      <div className='flex-shrink-0 mt-auto'>
        <nav className="flex flex-col gap-2 p-4 border-t border-border">
          {renderNavItems(settingsNavItems, true)}
        </nav>
      </div>
    </div>
  );

  return (
    <>
      <aside className="fixed inset-y-0 left-0 z-10 hidden w-64 flex-col border-r bg-muted sm:flex">
        <SidebarContent />
      </aside>

      <div className="sm:hidden fixed top-4 left-4 z-20">
        <Sheet>
          <SheetTrigger asChild>
            <Button size="icon" variant="outline">
              <PanelLeft className="h-5 w-5" />
              <span className="sr-only">Toggle Menu</span>
            </Button>
          </SheetTrigger>
          <SheetOverlay className="sm:hidden" />
          <SheetContent side="left" className="sm:max-w-xs p-0">
             <SidebarContent isMobile={true} />
          </SheetContent>
        </Sheet>
      </div>
    </>
  );
}

'use client';
import React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import Image from 'next/image';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Edit, LogOut } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';
import { useEditMode } from '@/hooks/use-edit-mode';
import { useAuth, useUser, useFirestore, useDoc, useMemoFirebase } from '@/firebase';
import { signOut } from 'firebase/auth';
import { doc } from 'firebase/firestore';
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar';
import { User as UserIcon } from 'lucide-react';


export default function Header() {
  const pathname = usePathname();
  const segments = pathname.split('/').filter(Boolean);
  const { editMode, setEditMode } = useEditMode();
  const auth = useAuth();
  const router = useRouter();

  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();

  const userAccountRef = useMemoFirebase(() => {
      if (!user || !firestore) return null;
      return doc(firestore, 'tenants', user.uid, 'userAccounts', user.uid);
  }, [user, firestore]);

  const { data: userAccount } = useDoc<{ avatarUrl?: string | null }>(userAccountRef);

  const handleLogout = async () => {
    try {
      await signOut(auth);
      router.push('/login');
    } catch (error) {
      console.error('Error signing out: ', error);
    }
  };

  return (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-4 border-b bg-background px-4 sm:static sm:h-auto sm:border-0 sm:bg-transparent sm:px-6">
      <Breadcrumb className="hidden md:flex">
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/dashboard">Home</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          {segments.map((segment, index) => (
            <React.Fragment key={segment}>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                {index === segments.length - 1 ? (
                  <BreadcrumbPage className="capitalize">{segment}</BreadcrumbPage>
                ) : (
                  <BreadcrumbLink asChild>
                    <Link href={`/${segments.slice(0, index + 1).join('/')}`} className="capitalize">
                      {segment}
                    </Link>
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
            </React.Fragment>
          ))}
        </BreadcrumbList>
      </Breadcrumb>
      <div className="relative ml-auto flex items-center gap-2 md:grow-0">
        <TooltipProvider>
            <Tooltip>
                <TooltipTrigger asChild>
                    <Button variant={editMode ? 'default' : 'outline'} size="icon" onClick={() => setEditMode(!editMode)}>
                        <Edit className="h-4 w-4" />
                    </Button>
                </TooltipTrigger>
                <TooltipContent>
                    <p>Modalità Modifica</p>
                </TooltipContent>
            </Tooltip>
        </TooltipProvider>
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
            <Button
                variant="outline"
                size="icon"
                className="overflow-hidden rounded-full"
            >
              <Avatar className="h-8 w-8">
                <AvatarImage src={userAccount?.avatarUrl ?? undefined} alt="User avatar" />
                <AvatarFallback>
                  <UserIcon className="h-4 w-4" />
                </AvatarFallback>
              </Avatar>
            </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
            <DropdownMenuLabel>My Account</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
                <Link href="/settings">Settings</Link>
            </DropdownMenuItem>
            <DropdownMenuItem>Support</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleLogout}>
              <LogOut className="mr-2 h-4 w-4" />
              <span>Logout</span>
            </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}

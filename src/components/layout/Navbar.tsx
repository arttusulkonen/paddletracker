"use client";

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from '@/contexts/AuthContext';
import { HomeIcon, LogIn, TrophyIcon, UserCircle, UserPlus, UsersIcon } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type React from 'react';

// Define the SVG icon for PingPong as a React component
const PingPongIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    xmlns="http://www.w3.org/2000/svg"
    {...props}
  >
    <path d="M15.1093 10.1112C14.2093 9.21119 14.2093 7.78882 15.1093 6.88882C16.0093 5.98882 17.4293 5.98882 18.3293 6.88882C18.7993 7.35882 19.0093 8.01119 18.9293 8.59119C18.8093 9.51119 18.1893 10.3012 17.3093 10.6512" />
    <path d="M12.66 12.6495C11.33 13.9795 9.13 13.9795 7.8 12.6495C6.47 11.3195 6.47 9.1195 7.8 7.7895C9.13 6.4595 11.33 6.4595 12.66 7.7895" />
    <path d="M10.2282 10.2188L5.6582 14.7888C4.7582 15.6888 4.7582 17.1088 5.6582 18.0088C6.5582 18.9088 7.9782 18.9088 8.8782 18.0088L13.4482 13.4388" />
  </svg>
);


export function Navbar() {
  const { user, loading, logout } = useAuth();
  const router = useRouter();

  const handleLogout = async () => {
    await logout();
    router.push('/');
  };
  
  return (
    <header className="bg-card border-b sticky top-0 z-50 shadow-sm">
      <div className="container mx-auto px-4 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 text-primary hover:text-primary/80 transition-colors">
          <PingPongIcon className="h-8 w-8" />
          <h1 className="text-2xl font-bold">PaddleTracker</h1>
        </Link>
        <nav className="flex items-center gap-4">
          <Button variant="ghost" asChild>
            <Link href="/" className="flex items-center gap-1">
              <HomeIcon size={18}/> Home
            </Link>
          </Button>
          {user && (
            <>
              <Button variant="ghost" asChild>
                <Link href="/rooms" className="flex items-center gap-1">
                  <UsersIcon size={18}/> Rooms
                </Link>
              </Button>
              <Button variant="ghost" asChild>
                <Link href="/tournaments" className="flex items-center gap-1">
                  <TrophyIcon size={18}/> Tournaments
                </Link>
              </Button>
            </>
          )}

          {loading ? (
            <div className="h-8 w-20 bg-muted rounded-md animate-pulse" />
          ) : user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="relative h-10 w-10 rounded-full">
                  <Avatar className="h-9 w-9">
                    <AvatarImage src={user.photoURL || undefined} alt={user.name || user.email || "User"} />
                    <AvatarFallback>
                      {user.name ? user.name.charAt(0).toUpperCase() : <UserCircle />}
                    </AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-56" align="end" forceMount>
                <DropdownMenuLabel className="font-normal">
                  <div className="flex flex-col space-y-1">
                    <p className="text-sm font-medium leading-none">
                      {user.name || "User"}
                    </p>
                    <p className="text-xs leading-none text-muted-foreground">
                      {user.email}
                    </p>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/profile">
                    <UserCircle className="mr-2 h-4 w-4" />
                    <span>Profile</span>
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleLogout}>
                  <LogIn className="mr-2 h-4 w-4" />
                  <span>Log out</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <>
              <Button variant="ghost" asChild>
                <Link href="/login" className="flex items-center gap-1">
                  <LogIn size={18}/> Login
                </Link>
              </Button>
              <Button asChild>
                <Link href="/register" className="flex items-center gap-1">
                  <UserPlus size={18}/> Register
                </Link>
              </Button>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}

/* --------------------------------------------------------------------------
   src/components/layout/Navbar.tsx
----------------------------------------------------------------------------*/
"use client"

import {
  Avatar, AvatarFallback, AvatarImage,
  Button,
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui"
import { useAuth } from "@/contexts/AuthContext"
import {
  Bell, HomeIcon, LogIn, TrophyIcon, UserCircle,
  UserPlus, UsersIcon
} from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import type React from "react"

const PingPongIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg
    viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}
  >
    <path d="M15.11 10.11c-.9-.9-.9-2.32 0-3.22.9-.9 2.32-.9 3.22 0 .47.47.68 1.12.58 1.7-.12.93-.73 1.72-1.54 2.01" />
    <path d="M12.66 12.65a3.68 3.68 0 0 1-5.2 0 3.68 3.68 0 0 1 0-5.2 3.68 3.68 0 0 1 5.2 0" />
    <path d="M10.23 10.22 5.66 14.79a2 2 0 0 0 0 2.83 2 2 0 0 0 2.83 0l4.57-4.57" />
  </svg>
)

/* ------------------------------------------------------------------ */
export function Navbar() {
  const { user, userProfile, loading, logout } = useAuth()
  const router = useRouter()

  const handleLogout = async () => {
    await logout()
    router.push("/")
  }

  const reqCount = userProfile?.incomingRequests?.length ?? 0
  const visibleName = user?.displayName ?? user?.name;
  

  return (
    <header className="bg-card border-b sticky top-0 z-50 shadow-sm">
      <div className="container mx-auto px-2 sm:px-4 h-16 flex items-center justify-between">
        {/* ---------- logo ---------- */}
        <Link
          href="/" className="flex items-center gap-1 sm:gap-2 text-primary hover:text-primary/80"
        >
          <PingPongIcon className="h-7 w-7 sm:h-8 sm:w-8" />
          <h1 className="text-xl sm:text-2xl font-bold">PingPongTracker</h1>
        </Link>

        {/* ---------- nav ---------- */}
        <nav className="flex items-center gap-1 sm:gap-2">
          <Button variant="ghost" asChild size="sm" className="px-2 sm:px-3">
            <Link href="/" className="flex items-center gap-1">
              <HomeIcon size={16} /> <span className="hidden sm:inline">Home</span>
            </Link>
          </Button>

          {user && (
            <>
              <Button variant="ghost" asChild size="sm" className="px-2 sm:px-3">
                <Link href="/rooms" className="flex items-center gap-1">
                  <UsersIcon size={16} /> <span className="hidden sm:inline">Rooms</span>
                </Link>
              </Button>

              <Button variant="ghost" asChild size="sm" className="px-2 sm:px-3">
                <Link href="/tournaments" className="flex items-center gap-1">
                  <TrophyIcon size={16} /> <span className="hidden sm:inline">Tournaments</span>
                </Link>
              </Button>
            </>
          )}

          {/* ---------- avatar / login ---------- */}
          {loading ? (
            <div className="h-8 w-16 sm:w-20 bg-muted rounded-md animate-pulse" />
          ) : user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="relative h-9 w-9 sm:h-10 sm:w-10 rounded-full p-0">

                  {reqCount > 0 && (
                    <span
                      className="absolute -top-0.5 -right-0.5 z-10 flex h-3.5 min-w-3.5 sm:h-4 sm:min-w-4
                                 items-center justify-center rounded-full bg-destructive
                                 px-0.5 text-[9px] sm:text-[10px] font-medium leading-none text-background"
                    >
                      {reqCount}
                    </span>
                  )}
                  <Avatar className="relative z-0 h-8 w-8 sm:h-9 sm:w-9">
                    <AvatarImage src={user.photoURL || undefined} />
                    <AvatarFallback>
                      {user.name ? user.name[0].toUpperCase() : <UserCircle size={20} />}
                    </AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>

              <DropdownMenuContent className="w-56" align="end" forceMount>
                <DropdownMenuLabel className="font-normal">
                  <div className="flex flex-col space-y-1">
                    <p className="text-sm font-medium">{visibleName || "User"}</p>
                    <p className="text-xs text-muted-foreground">{user.email}</p>
                  </div>
                </DropdownMenuLabel>

                <DropdownMenuSeparator />

                <DropdownMenuItem asChild>
                  <Link href={`/profile/${user.uid}`}>
                    <UserCircle className="mr-2 h-4 w-4" />
                    <span>Profile</span>
                  </Link>
                </DropdownMenuItem>

                {/* -------- Requests item inside dropdown -------- */}
                <DropdownMenuItem asChild>
                  <Link href="/friend-requests">
                    <Bell className="mr-2 h-4 w-4" />
                    <span>Requests {reqCount > 0 && `(${reqCount})`}</span>
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
              <Button variant="ghost" asChild size="sm" className="px-2 sm:px-3">
                <Link href="/login" className="flex items-center gap-1">
                  <LogIn size={16} /> <span className="hidden sm:inline">Login</span>
                </Link>
              </Button>
              <Button asChild size="sm" className="px-2 sm:px-3">
                <Link href="/register" className="flex items-center gap-1">
                  <UserPlus size={16} /> <span className="hidden sm:inline">Register</span>
                </Link>
              </Button>
            </>
          )}
        </nav>
      </div>
    </header>
  )
}

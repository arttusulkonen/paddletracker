'use client';

import { Shield, Users } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { cn } from '@/lib/utils';

const AdminLayout = ({ children }: { children: React.ReactNode }) => {
  const pathname = usePathname();

  const navLinks = [
    {
      href: '/admin/users',
      label: 'Users',
      icon: <Users className='h-4 w-4' />,
    },
    {
      href: '/admin/rooms',
      label: 'Rooms',
      icon: <Shield className='h-4 w-4' />,
    },
  ];

  return (
    <div className='container mx-auto py-6'>
      <div className='flex flex-col md:flex-row gap-8'>
        <aside className='md:w-1/4 lg:w-1/5'>
          <nav className='flex flex-row md:flex-col gap-2'>
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2 text-muted-foreground transition-all hover:text-primary',
                  pathname === link.href && 'bg-muted text-primary'
                )}
              >
                {link.icon}
                <span className='hidden md:inline'>{link.label}</span>
              </Link>
            ))}
          </nav>
        </aside>
        <main className='flex-1'>{children}</main>
      </div>
    </div>
  );
};

export default AdminLayout;

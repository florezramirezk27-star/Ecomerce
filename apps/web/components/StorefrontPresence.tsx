'use client';

import { usePathname } from 'next/navigation';
import { useStorefrontPresence } from '@/lib/presence';

export default function StorefrontPresence() {
  const pathname = usePathname();
  const isAdmin = pathname === '/admin' || pathname.startsWith('/admin/');

  useStorefrontPresence(!isAdmin);

  return null;
}

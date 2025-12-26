// src/app/admin/users/page.tsx
'use client';

import {
	collection,
	doc,
	getDocs,
	orderBy,
	query,
	updateDoc,
	where,
} from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { Loader2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { db } from '@/lib/firebase';
import { UserCard } from './UserCard';

type SportKey = 'pingpong' | 'tennis' | 'badminton';
type U = {
  uid: string;
  email: string;
  name?: string;
  displayName?: string;
  photoURL?: string | null;
  isPublic?: boolean;
  approved?: boolean;
  approvalReason?: string;
  sports?: {
    [K in SportKey]?: {
      globalElo?: number;
    };
  };
};

export default function AdminUsersPage() {
  const { isGlobalAdmin, user } = useAuth();
  const [ready, setReady] = useState(false);
  const { toast } = useToast();

  const [pending, setPending] = useState<U[]>([]);
  const [allUsers, setAllUsers] = useState<U[]>([]);
  const [search, setSearch] = useState('');
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [isDeletingId, setIsDeletingId] = useState<string | null>(null);

  const loadAllData = useCallback(
    async (isInitial = false) => {
      // ИСПРАВЛЕНИЕ 1: Проверка на существование db
      if (!db) return;

      if (isInitial) setLoadingInitial(true);

      try {
        // 1. Загружаем пользователей, ожидающих одобрения
        const qPending = query(
          collection(db, 'users'),
          where('approved', '==', false),
          orderBy('createdAt', 'desc')
        );
        const dsPending = await getDocs(qPending);

        // ИСПРАВЛЕНИЕ 2: Используем Omit<U, 'uid'> чтобы избежать дублирования поля uid
        setPending(
          dsPending.docs.map((d) => ({
            uid: d.id,
            ...(d.data() as Omit<U, 'uid'>),
          }))
        );

        // 2. Загружаем ВСЕХ пользователей
        const qAll = query(collection(db, 'users'), orderBy('email', 'asc'));
        const dsAll = await getDocs(qAll);

        // ИСПРАВЛЕНИЕ 3: Аналогично используем Omit<U, 'uid'>
        setAllUsers(
          dsAll.docs.map((d) => ({
            uid: d.id,
            ...(d.data() as Omit<U, 'uid'>),
          }))
        );
      } catch (error) {
        console.error('Failed to load user data:', error);
        toast({ title: 'Error loading data', variant: 'destructive' });
      } finally {
        if (isInitial) setLoadingInitial(false);
      }
    },
    [toast]
  );

  useEffect(() => {
    if (user === null) return;
    if (!isGlobalAdmin) {
      window.location.href = '/';
    } else {
      setReady(true);
    }
  }, [isGlobalAdmin, user]);

  useEffect(() => {
    if (ready) {
      loadAllData(true);
    }
  }, [ready, loadAllData]);

  const filteredAll = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return allUsers;
    return allUsers.filter((u) => {
      const n = (u.name || u.displayName || '').toLowerCase();
      const e = (u.email || '').toLowerCase();
      const id = u.uid.toLowerCase();
      return n.includes(q) || e.includes(q) || id.includes(q);
    });
  }, [allUsers, search]);

  const approve = async (u: U) => {
    if (!db) return;
    try {
      await updateDoc(doc(db, 'users', u.uid), {
        approved: true,
        approvedAt: new Date().toISOString(),
        approvedBy: user?.uid || null,
      });
      await loadAllData();
      toast({ title: 'User Approved' });
    } catch (error) {
      console.error('Failed to approve user:', error);
      toast({ title: 'Failed to approve', variant: 'destructive' });
    }
  };

  const togglePublic = async (u: U) => {
    if (!db) return;
    try {
      const nextIsPublic = !(u.isPublic ?? true);
      await updateDoc(doc(db, 'users', u.uid), { isPublic: nextIsPublic });
      setAllUsers((prev) =>
        prev.map((x) =>
          x.uid === u.uid ? { ...x, isPublic: nextIsPublic } : x
        )
      );
      setPending((prev) =>
        prev.map((x) =>
          x.uid === u.uid ? { ...x, isPublic: nextIsPublic } : x
        )
      );
      toast({ title: 'User privacy updated' });
    } catch (error) {
      console.error('Failed to toggle public status:', error);
      toast({ title: 'Failed to update', variant: 'destructive' });
    }
  };

  const deleteUser = async (u: U) => {
    setIsDeletingId(u.uid);
    try {
      const functions = getFunctions();
      const deleteUserCallable = httpsCallable(
        functions,
        'permanentlyDeleteUser'
      );
      await deleteUserCallable({ userId: u.uid });
      toast({ title: 'User permanently deleted' });
      await loadAllData();
    } catch (error: any) {
      console.error('Failed to delete user:', error);
      toast({
        title: 'Failed to delete user',
        description: error.message || 'Please check the console for details.',
        variant: 'destructive',
      });
    } finally {
      setIsDeletingId(null);
    }
  };

  const saveName = async (u: U, newName: string) => {
    if (!db) return;
    const name = newName.trim();
    if (!name) {
      toast({ title: 'Name cannot be empty', variant: 'destructive' });
      return;
    }
    try {
      await updateDoc(doc(db, 'users', u.uid), { name, displayName: name });
      setAllUsers((prev) =>
        prev.map((x) =>
          x.uid === u.uid ? { ...x, name, displayName: name } : x
        )
      );
      setPending((prev) =>
        prev.map((x) =>
          x.uid === u.uid ? { ...x, name, displayName: name } : x
        )
      );
      toast({ title: 'User name saved' });
    } catch (error) {
      console.error('Failed to save name:', error);
      toast({ title: 'Failed to save', variant: 'destructive' });
    }
  };

  if (!ready) {
    return (
      <div className='flex justify-center items-center h-screen'>
        <Loader2 className='h-10 w-10 animate-spin' />
      </div>
    );
  }

  return (
    <div className='container mx-auto py-6 space-y-8'>
      {pending.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Pending Approvals ({pending.length})</CardTitle>
            <CardDescription>
              New registrations awaiting your approval.
            </CardDescription>
          </CardHeader>
          <CardContent className='grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4'>
            {pending.map((u) => (
              <UserCard
                key={u.uid}
                user={u}
                isDeleting={isDeletingId === u.uid}
                onApprove={approve}
                onTogglePublic={togglePublic}
                onDelete={deleteUser}
                onSaveName={saveName}
              />
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>All Users ({allUsers.length})</CardTitle>
          <CardDescription>
            Search, edit, and manage all users in the system.
          </CardDescription>
        </CardHeader>
        <CardContent className='space-y-4'>
          <Input
            placeholder='Search by name, email or UID...'
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />

          {loadingInitial ? (
            <div className='flex justify-center items-center py-10'>
              <Loader2 className='h-8 w-8 animate-spin' />
            </div>
          ) : (
            <>
              <div className='grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4'>
                {filteredAll.map((u) => (
                  <UserCard
                    key={u.uid}
                    user={u}
                    isDeleting={isDeletingId === u.uid}
                    onApprove={approve}
                    onTogglePublic={togglePublic}
                    onDelete={deleteUser}
                    onSaveName={saveName}
                  />
                ))}
              </div>
              {!filteredAll.length && (
                <div className='text-center text-muted-foreground py-10'>
                  No users found matching your search.
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

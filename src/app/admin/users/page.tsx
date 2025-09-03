'use client';

import {
  collection,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  startAfter,
  updateDoc,
  where,
} from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { Loader2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
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
  const [loadingMore, setLoadingMore] = useState(false);
  const [isDeletingId, setIsDeletingId] = useState<string | null>(null);
  const lastDocRef = useRef<any>(null);

  const loadAllData = useCallback(
    async (isInitial = false) => {
      if (isInitial) setLoadingInitial(true);

      try {
        const qPending = query(
          collection(db, 'users'),
          where('approved', '==', false)
        );
        const dsPending = await getDocs(qPending);
        setPending(
          dsPending.docs.map((d) => ({ uid: d.id, ...(d.data() as U) }))
        );

        const qAll = query(
          collection(db, 'users'),
          orderBy('createdAt', 'desc'),
          limit(24)
        );
        const dsAll = await getDocs(qAll);
        setAllUsers(dsAll.docs.map((d) => ({ uid: d.id, ...(d.data() as U) })));
        lastDocRef.current = dsAll.docs[dsAll.docs.length - 1] || null;
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

  const loadMore = async () => {
    if (!lastDocRef.current || loadingMore) return;
    setLoadingMore(true);
    try {
      const q = query(
        collection(db, 'users'),
        orderBy('createdAt', 'desc'),
        startAfter(lastDocRef.current),
        limit(24)
      );
      const ds = await getDocs(q);
      if (!ds.empty) {
        setAllUsers((prev) => [
          ...prev,
          ...ds.docs.map((d) => ({ uid: d.id, ...(d.data() as U) })),
        ]);
        lastDocRef.current = ds.docs[ds.docs.length - 1] || null;
      } else {
        lastDocRef.current = null;
        toast({ title: 'No more users to load.' });
      }
    } catch (error) {
      console.error('Failed to load more users:', error);
      toast({ title: 'Failed to load more', variant: 'destructive' });
    } finally {
      setLoadingMore(false);
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
          <CardTitle>All Users</CardTitle>
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
              {lastDocRef.current && !search && (
                <div className='pt-4 flex justify-center'>
                  <Button
                    variant='outline'
                    onClick={loadMore}
                    disabled={loadingMore}
                  >
                    {loadingMore && (
                      <Loader2 className='mr-2 h-4 w-4 animate-spin' />
                    )}
                    Load More
                  </Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// src/app/admin/users/page.tsx
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
  // Меняем логику: будем загружать всех сразу, но только если поиск не активен
  const [allUsers, setAllUsers] = useState<U[]>([]);
  const [search, setSearch] = useState('');
  const [loadingInitial, setLoadingInitial] = useState(true);
  // Элементы для постраничной загрузки (loadMore) удаляем,
  // так как мы переходим к загрузке всех сразу для поиска/администрирования.
  // Оставляем только для Pending.
  const [isDeletingId, setIsDeletingId] = useState<string | null>(null);
  // lastDocRef больше не нужен, т.к. убрано limit(24)
  // const lastDocRef = useRef<any>(null);

  const loadAllData = useCallback(
    async (isInitial = false) => {
      if (isInitial) setLoadingInitial(true);

      try {
        // 1. Загружаем пользователей, ожидающих одобрения (approved: false)
        const qPending = query(
          collection(db, 'users'),
          where('approved', '==', false),
          // Добавляем сортировку по createdAt для порядка
          orderBy('createdAt', 'desc')
        );
        const dsPending = await getDocs(qPending);
        setPending(
          dsPending.docs.map((d) => ({ uid: d.id, ...(d.data() as U) }))
        );

        // 2. Загружаем ВСЕХ пользователей (убираем limit(24)),
        // чтобы найти старых игроков для одобрения.
        const qAll = query(
          collection(db, 'users'),
          // Удаляем orderBy('createdAt', 'desc') и limit(24)
          // Если важна сортировка, можно оставить только orderBy.
          // В данном случае, оставим без явной сортировки для простоты,
          // так как фильтрация по поиску важнее.
          orderBy('email', 'asc') // Сортируем по email для стабильности
        );
        const dsAll = await getDocs(qAll);
        setAllUsers(dsAll.docs.map((d) => ({ uid: d.id, ...(d.data() as U) })));

        // lastDocRef.current = null; // сбрасываем, т.к. загрузили всех
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
    if (!q) return allUsers; // Если поиска нет, показываем всех загруженных
    return allUsers.filter((u) => {
      // Здесь используем имя, которое берет name или displayName, чтобы найти старых
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
      // Перезагружаем все данные, чтобы обновить списки
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
      // Перезагружаем все данные
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
      // Обновляем оба поля, name и displayName
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

  // Функция loadMore больше не нужна, т.к. мы загружаем всех сразу
  // const loadMore = async () => { ... }
  // Мы ее удаляем, но оставляем заглушку, чтобы не менять остальной код сильно
  const loadMore = async () => {};
  const lastDocRef = useRef<any>(null); // оставляем пустым, чтобы не было ошибок

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
                {/* filteredAll теперь содержит всех загруженных пользователей, 
                    что позволяет найти старых игроков через поиск. */}
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
              {/* Элемент Load More убран, т.к. вся база загружается сразу */}
              {/* {lastDocRef.current && !search && (
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
              )} */}
              {/* Вместо Load More: сообщение о количестве */}
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

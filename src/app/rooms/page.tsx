// src/app/rooms/page.tsx
'use client';

import { ProtectedRoute } from '@/components/ProtectedRoutes';
import { CreateRoomDialog } from '@/components/rooms/CreateRoomDialog';
import { RoomCard } from '@/components/rooms/RoomCard';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Skeleton,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui';
import { useAuth } from '@/contexts/AuthContext';
import { useSport } from '@/contexts/SportContext';
import { db } from '@/lib/firebase';
import { getUserLite } from '@/lib/friends';
import type { Room, UserProfile } from '@/lib/types';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  where,
} from 'firebase/firestore';
import { Globe, LayoutGrid, Search, Users } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

// Хелпер для парсинга дат (включая финский формат из ваших данных)
const parseRoomDate = (val: any): number => {
  if (!val) return 0;
  if (typeof val === 'object' && val.toDate) return val.toDate().getTime();
  if (typeof val === 'number') return val;

  const str = String(val).trim();

  // Попытка 1: Финский формат "DD.MM.YYYY HH.mm.ss"
  // Пример: "18.11.2025 20.56.50"
  if (str.includes('.')) {
    const parts = str.split(' ');
    const dateParts = parts[0].split('.');
    const timeParts = parts[1] ? parts[1].split('.') : ['00', '00', '00'];

    if (dateParts.length === 3) {
      const d = new Date(
        +dateParts[2],
        +dateParts[1] - 1,
        +dateParts[0],
        +(timeParts[0] || 0),
        +(timeParts[1] || 0),
        +(timeParts[2] || 0)
      );
      if (!isNaN(d.getTime())) return d.getTime();
    }
  }

  // Попытка 2: ISO
  const iso = Date.parse(str);
  if (!isNaN(iso)) return iso;

  return 0;
};

type RoomWithMeta = Room & {
  isFinished?: boolean;
  creatorName?: string;
  _sortTs: number; // Временная метка для сортировки
};

export default function RoomsPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { config } = useSport();

  const [allRooms, setAllRooms] = useState<RoomWithMeta[]>([]);
  const [isLoadingRooms, setIsLoadingRooms] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  // Статистика (количество моих матчей в комнате)
  const [myMatches, setMyMatches] = useState<Record<string, number>>({});
  // Мой рейтинг в комнате
  const [roomRating, setRoomRating] = useState<Record<string, number>>({});

  const [hasMounted, setHasMounted] = useState(false);

  useEffect(() => setHasMounted(true), []);

  // Загрузка комнат
  useEffect(() => {
    if (!user) {
      setIsLoadingRooms(false);
      return;
    }
    setIsLoadingRooms(true);

    const roomsCollectionName = config.collections.rooms;
    const roomsMap = new Map<string, any>();

    // Функция обработки сырых данных
    const processRooms = async (
      rawMap: Map<string, any>
    ): Promise<RoomWithMeta[]> => {
      const list = Array.from(rawMap.values());

      // 1. Подгружаем имена создателей (оптимизация: уникальные ID)
      const creatorIds = [
        ...new Set(list.map((r) => r.creator).filter(Boolean)),
      ];
      const creatorNameMap: Record<string, string> = {};

      if (creatorIds.length > 0) {
        // В реальном приложении лучше кэшировать, но для простоты загружаем пачками
        // Т.к. getDoc кешируется Firebase SDK, это не страшно
        await Promise.all(
          creatorIds.map(async (uid) => {
            const snap = await getDoc(doc(db, 'users', uid));
            if (snap.exists()) {
              const data = snap.data() as any;
              creatorNameMap[uid] =
                data.name || data.displayName || t('Unknown');
            }
          })
        );
      }

      // 2. Извлекаем рейтинг текущего юзера
      const ratingMap: Record<string, number> = {};
      list.forEach((r) => {
        const me = (r.members ?? []).find((m: any) => m.userId === user.uid);
        ratingMap[r.id] = me?.rating ?? 0;
      });
      setRoomRating(ratingMap);

      // 3. Формируем финальный объект
      return list.map((data) => ({
        ...data,
        id: data.id,
        creatorName: creatorNameMap[data.creator] || data.creatorName,
        isFinished: (data.seasonHistory?.length ?? 0) > 0,
        // Вычисляем timestamp для сортировки один раз
        _sortTs: parseRoomDate(
          data.createdAt || data.roomCreated || data.created
        ),
      }));
    };

    // Подписываемся на МОИ комнаты
    const qMyRooms = query(
      collection(db, roomsCollectionName),
      where('memberIds', 'array-contains', user.uid)
    );

    // Подписываемся на ПУБЛИЧНЫЕ комнаты
    const qPublicRooms = query(
      collection(db, roomsCollectionName),
      where('isPublic', '==', true)
    );

    // Обработчик обновлений (merge)
    const handleSnapshot = async (snap: any) => {
      snap.docs.forEach((d: any) =>
        roomsMap.set(d.id, { id: d.id, ...d.data() })
      );
      const processed = await processRooms(new Map(roomsMap));
      // Сортировка: Новые первыми
      processed.sort((a, b) => b._sortTs - a._sortTs);
      setAllRooms(processed);
      setIsLoadingRooms(false);
    };

    const unsubMy = onSnapshot(qMyRooms, handleSnapshot);
    const unsubPublic = onSnapshot(qPublicRooms, handleSnapshot);

    return () => {
      unsubMy();
      unsubPublic();
    };
  }, [user, t, config.collections.rooms]);

  // Загрузка количества матчей (ленивая)
  const loadMyCounts = useCallback(
    async (roomsToLoad: Room[]) => {
      if (!user || roomsToLoad.length === 0) return;
      const matchesCollectionName = config.collections.matches;
      const res: Record<string, number> = {};

      // Можно оптимизировать через collectionGroup index, но пока так надежнее
      await Promise.all(
        roomsToLoad.map(async (r) => {
          // Если уже загружено, пропускаем
          if (myMatches[r.id] !== undefined) return;

          const qy = query(
            collection(db, matchesCollectionName),
            where('roomId', '==', r.id),
            where('players', 'array-contains', user.uid)
          );
          const snap = await getDocs(qy);
          res[r.id] = snap.size;
        })
      );

      if (Object.keys(res).length > 0) {
        setMyMatches((prev) => ({ ...prev, ...res }));
      }
    },
    [user, config.collections.matches, myMatches]
  );

  useEffect(() => {
    if (allRooms.length > 0) {
      // Загружаем только для тех комнат, где я есть
      const myMemberRooms = allRooms.filter((r) =>
        r.memberIds?.includes(user?.uid || '')
      );
      loadMyCounts(myMemberRooms);
    }
  }, [allRooms, loadMyCounts, user]);

  // Фильтрация и разделение
  const { myRooms, publicRooms } = useMemo(() => {
    const lowerSearch = searchTerm.toLowerCase();

    const filtered = allRooms.filter(
      (r) =>
        r.name.toLowerCase().includes(lowerSearch) ||
        (r.creatorName ?? '').toLowerCase().includes(lowerSearch)
    );

    const my: RoomWithMeta[] = [];
    const pub: RoomWithMeta[] = [];

    filtered.forEach((r) => {
      const isMember = r.memberIds?.includes(user?.uid || '');
      if (isMember) {
        my.push(r);
      } else {
        // Если я не участник, но комната публичная, она идет в Public
        // Если комната приватная и я не участник - я её не увижу (security rules)
        // Но если она пришла в снапшоте (например, я админ), показываем в Public
        pub.push(r);
      }
    });

    return { myRooms: my, publicRooms: pub };
  }, [allRooms, searchTerm, user]);

  if (!hasMounted) return null;

  return (
    <ProtectedRoute>
      <div className='container mx-auto py-8 px-4 min-h-screen flex flex-col'>
        {/* Header Section */}
        <div className='flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8'>
          <div>
            <h1 className='text-4xl font-extrabold tracking-tight flex items-center gap-3'>
              <Users className='h-10 w-10 text-primary' />
              {t('Match Rooms')}
            </h1>
            <p className='text-muted-foreground mt-1 text-lg'>
              {t('Join a club or create your own league.')}
            </p>
          </div>
          <CreateRoomDialog />
        </div>

        {/* Search Bar */}
        <div className='relative mb-8'>
          <Search className='absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground' />
          <Input
            placeholder={t('Search rooms by name or creator...')}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className='pl-10 h-12 text-lg shadow-sm border-muted-foreground/20 focus-visible:ring-primary/30'
          />
        </div>

        {/* Content Tabs */}
        <Tabs defaultValue='my' className='w-full flex-1'>
          <TabsList className='grid w-full max-w-md grid-cols-2 p-1 pt-0 pb-0 mb-8 mx-auto md:mx-0'>
            <TabsTrigger value='my' className='text-base gap-2'>
              <LayoutGrid size={18} /> {t('My Rooms')}
              <span className='ml-1 bg-primary/10 text-primary text-xs px-2 py-0.5 rounded-full'>
                {myRooms.length}
              </span>
            </TabsTrigger>
            <TabsTrigger value='public' className='text-base gap-2'>
              <Globe size={18} /> {t('Discover')}
              <span className='ml-1 bg-muted text-muted-foreground text-xs px-2 py-0.5 rounded-full'>
                {publicRooms.length}
              </span>
            </TabsTrigger>
          </TabsList>

          {/* TAB: My Rooms */}
          <TabsContent value='my' className='space-y-6'>
            {isLoadingRooms ? (
              <RoomsSkeleton />
            ) : myRooms.length > 0 ? (
              <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6'>
                {myRooms.map((r) => (
                  <RoomCard
                    key={r.id}
                    room={r}
                    myMatches={myMatches[r.id]}
                    myRating={roomRating[r.id]}
                  />
                ))}
              </div>
            ) : (
              <EmptyState
                title={t('No rooms joined yet')}
                description={t(
                  'Create a new room or browse public rooms to get started.'
                )}
              />
            )}
          </TabsContent>

          {/* TAB: Public Rooms */}
          <TabsContent value='public' className='space-y-6'>
            {isLoadingRooms ? (
              <RoomsSkeleton />
            ) : publicRooms.length > 0 ? (
              <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6'>
                {publicRooms.map((r) => (
                  <RoomCard
                    key={r.id}
                    room={r}
                    // Для чужих комнат мы не знаем матчей и рейтинга (пока не вступим),
                    // либо они равны 0
                    myMatches={0}
                    myRating={0}
                  />
                ))}
              </div>
            ) : (
              <EmptyState
                title={t('No public rooms found')}
                description={t('Be the first to create a public league!')}
              />
            )}
          </TabsContent>
        </Tabs>
      </div>
    </ProtectedRoute>
  );
}

// --- Subcomponents ---

function RoomsSkeleton() {
  return (
    <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6'>
      {[1, 2, 3, 4, 5, 6].map((i) => (
        <div key={i} className='flex flex-col space-y-3'>
          <Skeleton className='h-[180px] w-full rounded-xl' />
          <div className='space-y-2'>
            <Skeleton className='h-4 w-[250px]' />
            <Skeleton className='h-4 w-[200px]' />
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <Card className='bg-muted/20 border-dashed border-2 flex flex-col items-center justify-center py-16 text-center'>
      <div className='bg-muted rounded-full p-4 mb-4'>
        <Search className='h-8 w-8 text-muted-foreground' />
      </div>
      <CardTitle className='text-xl mb-2'>{title}</CardTitle>
      <CardDescription className='max-w-sm mx-auto'>
        {description}
      </CardDescription>
    </Card>
  );
}

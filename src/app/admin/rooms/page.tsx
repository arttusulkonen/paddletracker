'use client';

import { collection, doc, getDoc, getDocs, query } from 'firebase/firestore';
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
import { parseFlexDate } from '@/lib/utils/date';
import { RoomCard, RoomData } from './RoomCard';

export default function AdminRoomsPage() {
  const { isGlobalAdmin, user } = useAuth();
  const [ready, setReady] = useState(false);
  const { toast } = useToast();

  const [allRooms, setAllRooms] = useState<RoomData[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadRooms = useCallback(async () => {
    setLoading(true);
    const roomsFromDB: Omit<RoomData, 'creatorName'>[] = [];
    const sportCollections = [
      'pingpong-rooms',
      'tennis-rooms',
      'badminton-rooms',
    ];

    try {
      for (const collectionName of sportCollections) {
        const q = query(collection(db, collectionName));
        const snapshot = await getDocs(q);
        snapshot.forEach((doc) => {
          const sport = collectionName.split('-')[0];
          roomsFromDB.push({ id: doc.id, sport, ...(doc.data() as any) });
        });
      }

      const creatorIds = [
        ...new Set(roomsFromDB.map((r) => r.creator).filter(Boolean)),
      ];
      const creatorNameMap: Record<string, string> = {};

      if (creatorIds.length > 0) {
        const creatorDocs = await Promise.all(
          creatorIds.map((uid) => getDoc(doc(db, 'users', uid)))
        );
        creatorDocs.forEach((snap) => {
          if (snap.exists()) {
            const data = snap.data();
            creatorNameMap[snap.id] =
              data?.name || data?.displayName || 'Unknown';
          }
        });
      }

      const processedRooms = roomsFromDB.map((room) => ({
        ...room,
        creatorName:
          creatorNameMap[room.creator] || room.creatorName || 'Unknown',
      }));

      const sortedRooms = processedRooms.sort((a, b) => {
        try {
          const dateA = parseFlexDate(a.createdAt).getTime();
          const dateB = parseFlexDate(b.createdAt).getTime();
          if (isNaN(dateA) || isNaN(dateB)) return 0;
          return dateB - dateA;
        } catch (e) {
          return 0;
        }
      });

      setAllRooms(sortedRooms);
    } catch (error) {
      console.error('Failed to load rooms:', error);
      toast({ title: 'Failed to load rooms', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    if (user === null) return;
    if (isGlobalAdmin) {
      setReady(true);
    } else if (user) {
      window.location.href = '/';
    }
  }, [isGlobalAdmin, user]);

  useEffect(() => {
    if (ready) {
      loadRooms();
    }
  }, [ready, loadRooms]);

  const filteredRooms = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return allRooms;
    return allRooms.filter(
      (room) =>
        (room.name || '').toLowerCase().includes(q) ||
        (room.creatorName || '').toLowerCase().includes(q) ||
        (room.id || '').toLowerCase().includes(q)
    );
  }, [allRooms, search]);

  const deleteRoom = async (room: RoomData) => {
    setDeletingId(room.id);
    try {
      const functions = getFunctions();
      const deleteRoomCallable = httpsCallable(
        functions,
        'deleteRoomPermanently'
      );
      await deleteRoomCallable({ roomId: room.id, sport: room.sport });
      toast({ title: 'Room deleted successfully' });
      await loadRooms();
    } catch (error: any) {
      console.error('Failed to delete room:', error);
      toast({
        title: 'Failed to delete room',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setDeletingId(null);
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
    <Card>
      <CardHeader>
        <CardTitle>Manage All Rooms</CardTitle>
        <CardDescription>
          View and permanently delete any room in the system.
        </CardDescription>
      </CardHeader>
      <CardContent className='space-y-4'>
        <Input
          placeholder='Search by room name, creator, or ID...'
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {loading ? (
          <div className='flex justify-center items-center py-10'>
            <Loader2 className='h-8 w-8 animate-spin' />
          </div>
        ) : (
          <div className='grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4'>
            {filteredRooms.map((room) => (
              <RoomCard
                key={room.id}
                room={room}
                isDeleting={deletingId === room.id}
                onDelete={deleteRoom}
              />
            ))}
          </div>
        )}
        {!loading && filteredRooms.length === 0 && (
          <p className='text-center text-muted-foreground py-10'>
            No rooms found.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

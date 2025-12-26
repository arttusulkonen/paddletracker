'use client';

import {
	Button,
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
	Input,
	Label,
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
	Textarea,
} from '@/components/ui';
import { useAuth } from '@/contexts/AuthContext';
import { useSport } from '@/contexts/SportContext';
import { useToast } from '@/hooks/use-toast';
import { db } from '@/lib/firebase';
import type { Community, Room } from '@/lib/types';
import {
	arrayRemove,
	arrayUnion,
	collection,
	doc,
	documentId,
	getDocs,
	query,
	updateDoc,
	where,
	writeBatch,
} from 'firebase/firestore';
import {
	ArrowDownToLine,
	Link as LinkIcon,
	Loader2,
	Plus,
	Trash2,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

interface CommunitySettingsDialogProps {
  community: Community;
  children: React.ReactNode;
}

export function CommunitySettingsDialog({
  community,
  children,
}: CommunitySettingsDialogProps) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { config } = useSport();
  const { toast } = useToast();
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [name, setName] = useState(community.name);
  const [description, setDescription] = useState(community.description || '');
  const [loading, setLoading] = useState(false);

  // Rooms State
  const [myRooms, setMyRooms] = useState<Room[]>([]);
  const [linkedRooms, setLinkedRooms] = useState<Room[]>([]);

  // Import State
  const [importCount, setImportCount] = useState<number | null>(null);
  const [potentialMembers, setPotentialMembers] = useState<string[]>([]);

  // 1. Загрузка комнат (моих и уже привязанных)
  useEffect(() => {
    if (!user || !open) return;

    const fetchRooms = async () => {
      try {
        // A. Комнаты, где я участник (чтобы я мог их привязать)
        const qMy = query(
          collection(db!, config.collections.rooms),
          where('memberIds', 'array-contains', user.uid)
        );
        const snapMy = await getDocs(qMy);
        const myRoomsData = snapMy.docs.map(
          (d) => ({ id: d.id, ...d.data() } as Room)
        );

        // B. Комнаты, уже привязанные к этому комьюнити
        // (даже если я в них не состою, но я админ комьюнити - я должен их видеть)
        const linkedData: Room[] = [];
        if (community.roomIds && community.roomIds.length > 0) {
          // Разбиваем на чанки по 10 для 'in' запроса
          const chunks = [];
          for (let i = 0; i < community.roomIds.length; i += 10) {
            chunks.push(community.roomIds.slice(i, i + 10));
          }
          for (const chunk of chunks) {
            const qLinked = query(
              collection(db!, config.collections.rooms),
              where(documentId(), 'in', chunk)
            );
            const snapLinked = await getDocs(qLinked);
            linkedData.push(
              ...snapLinked.docs.map((d) => ({ id: d.id, ...d.data() } as Room))
            );
          }
        }

        setMyRooms(myRoomsData);
        setLinkedRooms(linkedData);
      } catch (e) {
        console.error(e);
      }
    };
    fetchRooms();
  }, [user, open, config.collections.rooms, community.roomIds]);

  // 2. Расчет доступных для импорта участников
  useEffect(() => {
    if (linkedRooms.length === 0) {
      setImportCount(0);
      return;
    }

    const allMemberIds = new Set<string>();
    linkedRooms.forEach((r) => {
      r.memberIds?.forEach((mid) => allMemberIds.add(mid));
    });

    // Убираем тех, кто уже в комьюнити
    const existingMembers = new Set(community.members);
    const newMembers = Array.from(allMemberIds).filter(
      (id) => !existingMembers.has(id)
    );

    setPotentialMembers(newMembers);
    setImportCount(newMembers.length);
  }, [linkedRooms, community.members]);

  const handleUpdateGeneral = async () => {
    setLoading(true);
    try {
      await updateDoc(doc(db!, 'communities', community.id), {
        name,
        description,
      });
      toast({ title: t('Saved') });
      router.refresh();
    } catch {
      toast({ title: t('Error'), variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleLinkRoom = async (roomId: string) => {
    setLoading(true);
    try {
      const batch = writeBatch(db!);
      // 1. Обновляем комнату
      const roomRef = doc(db!, config.collections.rooms, roomId);
      batch.update(roomRef, { communityId: community.id });

      // 2. Обновляем комьюнити
      const commRef = doc(db!, 'communities', community.id);
      batch.update(commRef, { roomIds: arrayUnion(roomId) });

      await batch.commit();
      toast({ title: t('Room Linked') });

      // Обновляем локальный стейт (быстро)
      const room = myRooms.find((r) => r.id === roomId);
      if (room) {
        setLinkedRooms((prev) => [...prev, room]);
      }

      router.refresh();
    } catch (e) {
      console.error(e);
      toast({ title: t('Error linking room'), variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleUnlinkRoom = async (roomId: string) => {
    setLoading(true);
    try {
      const batch = writeBatch(db!);
      const roomRef = doc(db!, config.collections.rooms, roomId);
      batch.update(roomRef, { communityId: null });

      const commRef = doc(db!, 'communities', community.id);
      batch.update(commRef, { roomIds: arrayRemove(roomId) });

      await batch.commit();
      toast({ title: t('Room Unlinked') });

      setLinkedRooms((prev) => prev.filter((r) => r.id !== roomId));
      router.refresh();
    } catch {
      toast({ title: t('Error'), variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleImportMembers = async () => {
    if (potentialMembers.length === 0) return;
    setLoading(true);
    try {
      // 1. Обновляем Community (массив members)
      const commRef = doc(db!, 'communities', community.id);
      await updateDoc(commRef, {
        members: arrayUnion(...potentialMembers),
      });

      // 2. Обновляем Users (массив communityIds)
      // Внимание: Здесь лучше использовать batch, но Firebase лимит 500 операций.
      // Для простоты делаем Promise.all чанками по 400.
      const batch = writeBatch(db!);
      let count = 0;
      for (const uid of potentialMembers) {
        const userRef = doc(db!, 'users', uid);
        batch.update(userRef, {
          communityIds: arrayUnion(community.id),
        });
        count++;
        if (count >= 400) break; // Лимит батча
      }
      await batch.commit();

      toast({
        title: t('Members Imported'),
        description: t('{{count}} players added to community.', {
          count: potentialMembers.length,
        }),
      });
      router.refresh();
      setOpen(false); // Закрываем, чтобы обновить данные
    } catch (e) {
      console.error(e);
      toast({ title: t('Error importing members'), variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const availableRooms = myRooms.filter(
    (mr) => !linkedRooms.some((lr) => lr.id === mr.id)
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className='sm:max-w-xl h-[80vh] flex flex-col p-0 gap-0'>
        <DialogHeader className='p-6 pb-2'>
          <DialogTitle>{t('Community Settings')}</DialogTitle>
          <DialogDescription>{t('Manage rooms and members')}</DialogDescription>
        </DialogHeader>

        <Tabs
          defaultValue='rooms'
          className='flex-1 flex flex-col overflow-hidden'
        >
          <div className='px-6'>
            <TabsList className='grid w-full grid-cols-3'>
              <TabsTrigger value='general'>{t('General')}</TabsTrigger>
              <TabsTrigger value='rooms'>{t('Rooms')}</TabsTrigger>
              <TabsTrigger value='members'>{t('Members')}</TabsTrigger>
            </TabsList>
          </div>

          <div className='flex-1 overflow-y-auto p-6'>
            {/* TAB: GENERAL */}
            <TabsContent value='general' className='space-y-4 mt-0'>
              <div className='space-y-2'>
                <Label>{t('Name')}</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className='space-y-2'>
                <Label>{t('Description')}</Label>
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>
              <Button onClick={handleUpdateGeneral} disabled={loading}>
                {loading && <Loader2 className='mr-2 h-4 w-4 animate-spin' />}
                {t('Save Changes')}
              </Button>
            </TabsContent>

            {/* TAB: ROOMS */}
            <TabsContent value='rooms' className='space-y-6 mt-0'>
              {/* Linked Rooms */}
              <div>
                <h4 className='font-semibold text-sm mb-3 flex items-center gap-2'>
                  <LinkIcon className='h-4 w-4' /> {t('Linked Rooms')}
                </h4>
                {linkedRooms.length === 0 ? (
                  <div className='text-sm text-muted-foreground italic border border-dashed p-4 rounded-lg text-center'>
                    {t('No rooms linked yet.')}
                  </div>
                ) : (
                  <div className='space-y-2'>
                    {linkedRooms.map((r) => (
                      <div
                        key={r.id}
                        className='flex items-center justify-between p-3 border rounded-lg bg-accent/20'
                      >
                        <span className='font-medium'>{r.name}</span>
                        <Button
                          size='sm'
                          variant='ghost'
                          className='text-destructive hover:bg-destructive/10'
                          onClick={() => handleUnlinkRoom(r.id)}
                          disabled={loading}
                        >
                          <Trash2 className='h-4 w-4' />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Available Rooms */}
              <div>
                <h4 className='font-semibold text-sm mb-3 flex items-center gap-2'>
                  <Plus className='h-4 w-4' /> {t('Add from My Rooms')}
                </h4>
                {availableRooms.length === 0 ? (
                  <div className='text-sm text-muted-foreground italic'>
                    {t('No other rooms available where you are a member.')}
                  </div>
                ) : (
                  <div className='space-y-2'>
                    {availableRooms.map((r) => (
                      <div
                        key={r.id}
                        className='flex items-center justify-between p-3 border rounded-lg hover:bg-accent/10'
                      >
                        <div className='flex flex-col'>
                          <span className='font-medium'>{r.name}</span>
                          <span className='text-xs text-muted-foreground'>
                            {r.memberIds?.length || 0} members
                          </span>
                        </div>
                        <Button
                          size='sm'
                          variant='outline'
                          onClick={() => handleLinkRoom(r.id)}
                          disabled={loading}
                        >
                          {t('Link')}
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </TabsContent>

            {/* TAB: MEMBERS */}
            <TabsContent value='members' className='space-y-6 mt-0'>
              <div className='bg-primary/5 p-4 rounded-lg border border-primary/20 space-y-4'>
                <div className='flex items-center gap-4'>
                  <div className='h-10 w-10 bg-primary rounded-full flex items-center justify-center text-primary-foreground'>
                    <ArrowDownToLine className='h-6 w-6' />
                  </div>
                  <div>
                    <h4 className='font-bold'>{t('Sync Members')}</h4>
                    <p className='text-sm text-muted-foreground'>
                      {t(
                        'Automatically add all players from linked rooms to this community.'
                      )}
                    </p>
                  </div>
                </div>

                <div className='flex items-center justify-between bg-background p-3 rounded border'>
                  <span className='text-sm font-medium'>
                    {t('New players found')}:
                  </span>
                  <span className='font-mono font-bold text-lg'>
                    {importCount === null ? '...' : importCount}
                  </span>
                </div>

                <Button
                  className='w-full'
                  onClick={handleImportMembers}
                  disabled={loading || !importCount}
                >
                  {loading && <Loader2 className='mr-2 h-4 w-4 animate-spin' />}
                  {t('Import {{count}} Players', { count: importCount || 0 })}
                </Button>
              </div>

              <div className='text-xs text-muted-foreground mt-4'>
                {t(
                  "Note: This will only add users who are not yet in the community. It won't remove anyone."
                )}
              </div>
            </TabsContent>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

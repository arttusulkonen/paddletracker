// src/components/communities/CommunitySettingsDialog.tsx

'use client';

import {
	Avatar,
	AvatarFallback,
	AvatarImage,
	Button,
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
	Input,
	Label,
	ScrollArea,
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
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
import type { Community, Room, UserProfile } from '@/lib/types';
import {
	arrayRemove,
	arrayUnion,
	collection,
	doc,
	documentId,
	getDoc,
	getDocs,
	query,
	updateDoc,
	where,
	writeBatch,
} from 'firebase/firestore';
import {
	ArrowDownToLine,
	Crown,
	Link as LinkIcon,
	Loader2,
	Plus,
	ShieldPlus,
	Trash2,
	X,
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

  // Members Import State
  const [importCount, setImportCount] = useState<number | null>(null);
  const [potentialMembers, setPotentialMembers] = useState<string[]>([]);

  // Admins State
  const [adminProfiles, setAdminProfiles] = useState<UserProfile[]>([]);
  const [candidateProfiles, setCandidateProfiles] = useState<UserProfile[]>([]);
  const [newAdminId, setNewAdminId] = useState<string>('');

  // 1. Initial Load (Rooms & User Profiles for Admins tab)
  useEffect(() => {
    if (!user || !open || !db) return;

    const fetchData = async () => {
      try {
        // --- A. Rooms Fetching ---
        const qMy = query(
          collection(db!, config.collections.rooms),
          where('memberIds', 'array-contains', user.uid)
        );
        const snapMy = await getDocs(qMy);
        const myRoomsData = snapMy.docs.map(
          (d) => ({ id: d.id, ...d.data() } as Room)
        );

        const linkedData: Room[] = [];
        if (community.roomIds && community.roomIds.length > 0) {
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

        // --- B. Admins & Candidates Fetching ---
        // Fetch Admin Profiles
        const allAdminIds = new Set([
          community.ownerId,
          ...(community.admins || []),
        ]);
        const adminIdsArray = Array.from(allAdminIds);

        // Fetch Admins
        const loadedAdmins: UserProfile[] = [];
        if (adminIdsArray.length > 0) {
          // Simple fetch by ID for exact list
          // Using promise all for small list of admins is fine, or chunks if many
          for (const uid of adminIdsArray) {
            const snap = await getDoc(doc(db!, 'users', uid));
            if (snap.exists()) {
              loadedAdmins.push({
                uid: snap.id,
                ...snap.data(),
              } as UserProfile);
            }
          }
        }
        setAdminProfiles(loadedAdmins);

        // Fetch Candidates (Members who are NOT admins)
        // We limit this to avoid fetching thousands. e.g., first 20 or fetch by chunks.
        // For UX, usually you search, but here we'll load current members to pick from.
        const memberIds = community.members || [];
        const candidateIds = memberIds.filter((id) => !allAdminIds.has(id));

        // Let's fetch first 50 candidates to populate dropdown
        const idsToFetch = candidateIds.slice(0, 50);
        const loadedCandidates: UserProfile[] = [];

        if (idsToFetch.length > 0) {
          const q = query(
            collection(db!, 'users'),
            where(documentId(), 'in', idsToFetch)
          );
          const snap = await getDocs(q);
          snap.forEach((d) =>
            loadedCandidates.push({ uid: d.id, ...d.data() } as UserProfile)
          );
        }

        setCandidateProfiles(loadedCandidates);
      } catch (e) {
        console.error(e);
      }
    };
    fetchData();
  }, [user, open, config.collections.rooms, community, community.admins]);

  // 2. Logic for Import Members
  useEffect(() => {
    if (linkedRooms.length === 0) {
      setImportCount(0);
      return;
    }
    const allMemberIds = new Set<string>();
    linkedRooms.forEach((r) => {
      r.memberIds?.forEach((mid) => allMemberIds.add(mid));
    });
    const existingMembers = new Set(community.members);
    const newMembers = Array.from(allMemberIds).filter(
      (id) => !existingMembers.has(id)
    );
    setPotentialMembers(newMembers);
    setImportCount(newMembers.length);
  }, [linkedRooms, community.members]);

  // --- Handlers ---

  const handleUpdateGeneral = async () => {
    if (!db) return;
    setLoading(true);
    try {
      await updateDoc(doc(db, 'communities', community.id), {
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
    if (!db) return;
    setLoading(true);
    try {
      const batch = writeBatch(db);
      const roomRef = doc(db, config.collections.rooms, roomId);
      batch.update(roomRef, { communityId: community.id });

      const commRef = doc(db, 'communities', community.id);
      batch.update(commRef, { roomIds: arrayUnion(roomId) });

      await batch.commit();
      toast({ title: t('Room Linked') });

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
    if (!db) return;
    setLoading(true);
    try {
      const batch = writeBatch(db);
      const roomRef = doc(db, config.collections.rooms, roomId);
      batch.update(roomRef, { communityId: null });

      const commRef = doc(db, 'communities', community.id);
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
    if (potentialMembers.length === 0 || !db) return;
    setLoading(true);
    try {
      const commRef = doc(db, 'communities', community.id);
      await updateDoc(commRef, {
        members: arrayUnion(...potentialMembers),
      });

      const batch = writeBatch(db);
      let count = 0;
      for (const uid of potentialMembers) {
        const userRef = doc(db, 'users', uid);
        batch.update(userRef, {
          communityIds: arrayUnion(community.id),
        });
        count++;
        if (count >= 400) break;
      }
      await batch.commit();

      toast({
        title: t('Members Imported'),
        description: t('{{count}} players added to community.', {
          count: potentialMembers.length,
        }),
      });
      router.refresh();
      setOpen(false);
    } catch (e) {
      console.error(e);
      toast({ title: t('Error importing members'), variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  // --- Admin Management Handlers ---

  const handleAddAdmin = async () => {
    if (!newAdminId || !db) return;
    setLoading(true);
    try {
      await updateDoc(doc(db, 'communities', community.id), {
        admins: arrayUnion(newAdminId),
      });

      // Move from candidate to admin list locally
      const promoted = candidateProfiles.find((p) => p.uid === newAdminId);
      if (promoted) {
        setAdminProfiles((prev) => [...prev, promoted]);
        setCandidateProfiles((prev) =>
          prev.filter((p) => p.uid !== newAdminId)
        );
      }

      setNewAdminId('');
      toast({ title: t('Admin added') });
      router.refresh();
    } catch (e) {
      console.error(e);
      toast({ title: t('Failed to add admin'), variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveAdmin = async (uid: string) => {
    if (!db) return;
    setLoading(true);
    try {
      await updateDoc(doc(db, 'communities', community.id), {
        admins: arrayRemove(uid),
      });

      // Move from admin to candidate list locally
      const demoted = adminProfiles.find((p) => p.uid === uid);
      if (demoted) {
        setAdminProfiles((prev) => prev.filter((p) => p.uid !== uid));
        setCandidateProfiles((prev) => [...prev, demoted]);
      }

      toast({ title: t('Admin removed') });
      router.refresh();
    } catch {
      toast({ title: t('Error removing admin'), variant: 'destructive' });
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
      <DialogContent className='sm:max-w-xl h-[85vh] flex flex-col p-0 gap-0'>
        <DialogHeader className='p-6 pb-2'>
          <DialogTitle>{t('Community Settings')}</DialogTitle>
          <DialogDescription>{t('Manage rooms and members')}</DialogDescription>
        </DialogHeader>

        <Tabs
          defaultValue='rooms'
          className='flex-1 flex flex-col overflow-hidden'
        >
          <div className='px-6'>
            <TabsList className='grid w-full grid-cols-4'>
              <TabsTrigger value='general'>{t('General')}</TabsTrigger>
              <TabsTrigger value='rooms'>{t('Rooms')}</TabsTrigger>
              <TabsTrigger value='members'>{t('Members')}</TabsTrigger>
              <TabsTrigger value='admins'>{t('Admins')}</TabsTrigger>
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

            {/* TAB: ADMINS */}
            <TabsContent value='admins' className='space-y-6 mt-0'>
              <div className='space-y-4'>
                <div className='flex flex-col gap-2'>
                  <Label>{t('Add Administrator')}</Label>
                  <div className='flex gap-2'>
                    <Select value={newAdminId} onValueChange={setNewAdminId}>
                      <SelectTrigger className='flex-1'>
                        <SelectValue
                          placeholder={t('Select member to promote')}
                        />
                      </SelectTrigger>
                      <SelectContent>
                        {candidateProfiles.length === 0 && (
                          <SelectItem value='none' disabled>
                            {t('No eligible members')}
                          </SelectItem>
                        )}
                        {candidateProfiles.map((m) => (
                          <SelectItem key={m.uid} value={m.uid}>
                            <div className='flex items-center gap-2'>
                              <Avatar className='h-5 w-5'>
                                <AvatarImage src={m.photoURL || undefined} />
                                <AvatarFallback>{m.name?.[0]}</AvatarFallback>
                              </Avatar>
                              <span>{m.name}</span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      onClick={handleAddAdmin}
                      disabled={!newAdminId || loading}
                      size='icon'
                    >
                      <ShieldPlus className='h-4 w-4' />
                    </Button>
                  </div>
                  <p className='text-xs text-muted-foreground'>
                    {t(
                      'Admins can manage rooms, invite members, and edit settings.'
                    )}
                  </p>
                </div>

                <div className='border rounded-md'>
                  <div className='bg-muted/30 px-3 py-2 text-xs font-semibold text-muted-foreground border-b uppercase tracking-wider'>
                    {t('Current Team')}
                  </div>
                  <ScrollArea className='h-[300px]'>
                    <div className='p-2 space-y-1'>
                      {adminProfiles.map((p) => {
                        const isOwner = p.uid === community.ownerId;
                        return (
                          <div
                            key={p.uid}
                            className='flex items-center justify-between p-2 rounded-md hover:bg-muted/50 group'
                          >
                            <div className='flex items-center gap-3'>
                              <Avatar className='h-8 w-8 border'>
                                <AvatarImage src={p.photoURL || undefined} />
                                <AvatarFallback>{p.name?.[0]}</AvatarFallback>
                              </Avatar>
                              <div className='flex flex-col'>
                                <span className='text-sm font-medium flex items-center gap-1'>
                                  {p.name}
                                  {isOwner && (
                                    <Crown className='h-3 w-3 text-amber-500 fill-amber-500' />
                                  )}
                                </span>
                                <span className='text-[10px] text-muted-foreground capitalize'>
                                  {isOwner ? t('Owner') : t('Admin')}
                                </span>
                              </div>
                            </div>

                            {!isOwner && (
                              <Button
                                size='icon'
                                variant='ghost'
                                className='h-8 w-8 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity'
                                onClick={() => handleRemoveAdmin(p.uid)}
                                disabled={loading}
                              >
                                <X className='h-4 w-4' />
                              </Button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </ScrollArea>
                </div>
              </div>
            </TabsContent>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

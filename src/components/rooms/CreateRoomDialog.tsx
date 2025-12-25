// src/components/rooms/CreateRoomDialog.tsx
'use client';

import ImageCropDialog from '@/components/ImageCropDialog';
import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
	Avatar,
	AvatarFallback,
	AvatarImage,
	Button,
	Checkbox,
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
	Input,
	Label,
	RadioGroup,
	RadioGroupItem,
	ScrollArea,
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
	Separator,
	Slider,
	Switch,
	Textarea,
} from '@/components/ui';
import { useAuth } from '@/contexts/AuthContext';
import { useSport } from '@/contexts/SportContext';
import { useToast } from '@/hooks/use-toast';
import { db, storage } from '@/lib/firebase';
import { getUserLite } from '@/lib/friends';
import { getSuperAdminIds, withSuperAdmins } from '@/lib/superAdmins';
import type { Community, RoomMode, UserProfile } from '@/lib/types';
import { getFinnishFormattedDate } from '@/lib/utils';
import {
	addDoc,
	arrayUnion,
	collection,
	doc,
	documentId,
	getDoc,
	getDocs,
	onSnapshot,
	query,
	where,
	writeBatch,
} from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytesResumable } from 'firebase/storage';
import {
	BookOpen,
	Briefcase,
	Gamepad2,
	Globe,
	ImageIcon,
	Info,
	Medal,
	PlusCircle,
	Search,
	Swords,
	Trophy,
	Warehouse,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

interface CreateRoomDialogProps {
  onSuccess?: () => void;
}

// Тип для создаваемого участника (чтобы убрать any)
interface NewMember {
  userId: string;
  name: string;
  email: string;
  rating: number;
  globalElo: number;
  wins: number;
  losses: number;
  date: string;
  role: 'admin' | 'editor';
}

const NAME_MAX = 60;
const DESC_MAX = 500;
const AVATAR_MAX_BYTES = 2 * 1024 * 1024;
const ACCEPT_MIME = 'image/png,image/jpeg,image/webp';

export function CreateRoomDialog({ onSuccess }: CreateRoomDialogProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const { user, userProfile } = useAuth();
  const { sport, config } = useSport();
  const { toast } = useToast();

  // Dialog State
  const [isOpen, setIsOpen] = useState(false);

  // Form State
  const [roomName, setRoomName] = useState('');
  const [roomDescription, setRoomDescription] = useState('');
  const [isPublic, setIsPublic] = useState(false);
  const [isRanked, setIsRanked] = useState(true);
  const [roomMode, setRoomMode] = useState<RoomMode>('office');

  // Community Selection (Только для тренеров)
  const [selectedCommunityId, setSelectedCommunityId] =
    useState<string>('none');
  const [myCommunities, setMyCommunities] = useState<Community[]>([]);

  // Professional Settings
  const [kFactor, setKFactor] = useState(32);
  const [useGlobalElo, setUseGlobalElo] = useState(false);

  // Players State
  const [selectedFriends, setSelectedFriends] = useState<string[]>([]);
  const [friends, setFriends] = useState<UserProfile[]>([]);
  const [coPlayers, setCoPlayers] = useState<UserProfile[]>([]);
  const [search, setSearch] = useState('');
  const [isCreatingRoom, setIsCreatingRoom] = useState(false);

  // Avatar State
  const [avatarSrc, setAvatarSrc] = useState<string | null>(null);
  const [avatarBlob, setAvatarBlob] = useState<Blob | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [cropOpen, setCropOpen] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- Effects for loading friends/players ---
  useEffect(() => {
    if (!user || !isOpen || !db) return;
    const unsub = onSnapshot(doc(db!, 'users', user.uid), async (snap) => {
      if (!snap.exists()) return setFriends([]);
      const ids: string[] = snap.data().friends ?? [];
      const loaded = await Promise.all(
        ids.map(async (uid) => ({ uid, ...(await getUserLite(uid)) }))
      );
      setFriends(
        (loaded.filter(Boolean) as UserProfile[]).sort((a, b) =>
          (a.name ?? a.displayName ?? '').localeCompare(
            b.name ?? b.displayName ?? ''
          )
        )
      );
    });
    return () => unsub();
  }, [user, isOpen]);

  useEffect(() => {
    if (!user || !isOpen || !db) return;
    const qRooms = query(
      collection(db!, config.collections.rooms),
      where('memberIds', 'array-contains', user.uid)
    );
    const unsub = onSnapshot(qRooms, async (snap) => {
      const idsSet = new Set<string>();
      snap.forEach((d) => {
        const memberIds: string[] = d.data()?.memberIds ?? [];
        for (const id of memberIds) if (id && id !== user.uid) idsSet.add(id);
      });
      if (idsSet.size === 0) return setCoPlayers([]);
      const loaded = await Promise.all(
        Array.from(idsSet).map(async (uid) => ({
          uid,
          ...(await getUserLite(uid)),
        }))
      );
      setCoPlayers(
        (loaded.filter(Boolean) as UserProfile[]).sort((a, b) =>
          (a.name ?? a.displayName ?? '').localeCompare(
            b.name ?? b.displayName ?? ''
          )
        )
      );
    });
    return () => unsub();
  }, [user, isOpen, config.collections.rooms]);

  // --- Load Communities (Only if Coach/Admin) ---
  useEffect(() => {
    if (!user || !isOpen || !db) return;
    const fetchComms = async () => {
      try {
        const q = query(
          collection(db!, 'communities'),
          where('admins', 'array-contains', user.uid)
        );
        const snap = await getDocs(q);
        const comms = snap.docs.map(
          (d) => ({ id: d.id, ...d.data() } as Community)
        );
        setMyCommunities(comms);
      } catch (e) {
        console.error(e);
      }
    };
    fetchComms();
  }, [user, isOpen]);

  // --- Filtering Logic ---
  const { friendsAll, othersInSport, allCandidates } = useMemo(() => {
    const friendSet = new Set(friends.map((f) => f.uid));
    const others = coPlayers.filter((p) => !friendSet.has(p.uid));
    const byName = (a: UserProfile, b: UserProfile) =>
      (a.name ?? a.displayName ?? '').localeCompare(
        b.name ?? b.displayName ?? ''
      );
    const friendsSorted = [...friends].sort(byName);
    const othersSorted = [...others].sort(byName);
    const map = new Map<string, UserProfile>();
    for (const p of friendsSorted) map.set(p.uid, p);
    for (const p of othersSorted) if (!map.has(p.uid)) map.set(p.uid, p);
    return {
      friendsAll: friendsSorted,
      othersInSport: othersSorted,
      allCandidates: Array.from(map.values()),
    };
  }, [coPlayers, friends]);

  const filterFn = (p: UserProfile) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      (p.name ?? '').toLowerCase().includes(q) ||
      (p.displayName ?? '').toLowerCase().includes(q) ||
      (p.email ?? '').toLowerCase().includes(q)
    );
  };

  const filteredFriends = useMemo(
    () => friendsAll.filter(filterFn),
    [friendsAll, search]
  );
  const filteredOthers = useMemo(
    () => othersInSport.filter(filterFn),
    [othersInSport, search]
  );

  const toggleSelected = (uid: string, checked: boolean | string) => {
    const on = Boolean(checked);
    setSelectedFriends((prev) => {
      const set = new Set(prev);
      if (on) set.add(uid);
      else set.delete(uid);
      return Array.from(set);
    });
  };

  // --- Avatar Logic ---
  const onPickFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null;
    e.target.value = '';
    if (!f) return;

    const allowedMimeTypes = ACCEPT_MIME.split(',');
    const allowedExtensions = ['.jpg', '.jpeg', '.png', '.webp'];
    const fileExtension = f.name
      .substring(f.name.lastIndexOf('.'))
      .toLowerCase();
    const isValidType =
      allowedMimeTypes.includes(f.type) ||
      allowedExtensions.includes(fileExtension);

    if (!isValidType || f.size > AVATAR_MAX_BYTES) {
      toast({
        title: t('Invalid image'),
        description: t('Use PNG/JPEG/WEBP under 2MB.'),
        variant: 'destructive',
      });
      return;
    }

    const src = URL.createObjectURL(f);
    setAvatarSrc(src);
    setCropOpen(true);
  };

  const onCropped = (blob: Blob) => {
    setAvatarBlob(blob);
    const url = URL.createObjectURL(blob);
    setAvatarPreview(url);
  };

  const resetForm = () => {
    setRoomName('');
    setRoomDescription('');
    setIsPublic(false);
    setIsRanked(true);
    setRoomMode('office');
    setKFactor(32);
    setUseGlobalElo(false);
    setSelectedFriends([]);
    setSearch('');
    setAvatarSrc(null);
    setAvatarBlob(null);
    setAvatarPreview(null);
    setSelectedCommunityId('none');
  };

  const validate = () => {
    const name = roomName.trim();
    if (!user || !userProfile) return false;
    if (!name) {
      toast({
        title: t('Error'),
        description: t('Room name cannot be empty'),
        variant: 'destructive',
      });
      return false;
    }
    return true;
  };

  const uploadAvatar = async (): Promise<string> => {
    if (!avatarBlob || !storage) return '';
    const path = `room-avatars/${sport}/${Date.now()}.jpg`;
    const storageRef = ref(storage!, path);
    const task = uploadBytesResumable(storageRef, avatarBlob);
    return await new Promise<string>((resolve, reject) => {
      task.on(
        'state_changed',
        null, // No progress tracking needed
        (err) => reject(err),
        async () => resolve(await getDownloadURL(task.snapshot.ref))
      );
    });
  };

  const handleCreateRoom = async () => {
    if (!validate() || !db) return;
    setIsCreatingRoom(true);
    try {
      let avatarURL = '';
      if (avatarBlob) avatarURL = await uploadAvatar();
      const now = getFinnishFormattedDate();
      const meName = userProfile!.name ?? userProfile!.displayName ?? '';
      const meEmail = userProfile!.email ?? '';

      const getStartingRating = (globalElo: number) => {
        if (roomMode === 'arcade') return 0;
        if (roomMode === 'professional' && useGlobalElo) return globalElo;
        return 1000;
      };

      // 1. Сбор участников
      const finalMemberIds = new Set([user!.uid, ...selectedFriends]);
      const communityMembersToAdd: NewMember[] = [];

      // Логика для сообществ (только если выбрано)
      if (selectedCommunityId !== 'none') {
        const commDoc = await getDoc(
          doc(db!, 'communities', selectedCommunityId)
        );
        if (commDoc.exists()) {
          const commData = commDoc.data() as Community;
          if (commData.members && Array.isArray(commData.members)) {
            commData.members.forEach((id) => finalMemberIds.add(id));

            // Загружаем профили участников сообщества для добавления в комнату
            const membersArr = Array.from(finalMemberIds);
            for (let i = 0; i < membersArr.length; i += 10) {
              const chunk = membersArr.slice(i, i + 10);
              if (chunk.length === 0) continue;

              // ИСПРАВЛЕНИЕ: Используем documentId() вместо 'uid'
              // Это гарантирует, что мы найдем документ по его ключу,
              // даже если поле uid отсутствует внутри данных.
              const q = query(
                collection(db!, 'users'),
                where(documentId(), 'in', chunk)
              );

              const snaps = await getDocs(q);
              snaps.forEach((d) => {
                const p = d.data() as UserProfile;
                const currentUid = d.id; // ИСПРАВЛЕНИЕ: Берем ID из документа, а не из данных

                if (currentUid !== user?.uid) {
                  communityMembersToAdd.push({
                    userId: currentUid,
                    name: p.name || p.displayName || '',
                    email: p.email || '',
                    rating: getStartingRating(
                      p.sports?.[sport]?.globalElo ?? 1000
                    ),
                    globalElo: p.sports?.[sport]?.globalElo ?? 1000,
                    wins: 0,
                    losses: 0,
                    date: now,
                    role: 'editor',
                  });
                }
              });
            }
          }
        }
      }

      // Логика для друзей (всегда работает, если они выбраны)
      // Добавляем тех, кого еще нет в списке от сообщества
      const friendMembers = selectedFriends
        .map((uid) => {
          // Пропускаем, если уже добавлен через сообщество
          if (communityMembersToAdd.some((m) => m.userId === uid)) return null;

          const f =
            allCandidates.find((x) => x.uid === uid) ??
            friends.find((x) => x.uid === uid);
          const globalElo = f?.sports?.[sport]?.globalElo ?? 1000;
          return {
            userId: uid,
            name: f?.name ?? f?.displayName ?? '',
            email: f?.email ?? '',
            rating: getStartingRating(globalElo),
            globalElo: globalElo,
            wins: 0,
            losses: 0,
            date: now,
            role: 'editor' as const,
          };
        })
        .filter((m): m is NewMember => !!m);

      const myGlobalElo = userProfile?.sports?.[sport]?.globalElo ?? 1000;
      const initialMembers: NewMember[] = [
        {
          userId: user!.uid,
          name: meName,
          email: meEmail,
          rating: getStartingRating(myGlobalElo),
          globalElo: myGlobalElo,
          wins: 0,
          losses: 0,
          date: now,
          role: 'admin',
        },
        ...communityMembersToAdd,
        ...friendMembers,
      ];

      const superAdmins = await getSuperAdminIds(true);
      const adminIds = withSuperAdmins(user!.uid, superAdmins);
      const memberIdsArr = Array.from(finalMemberIds);

      const docRef = await addDoc(collection(db!, config.collections.rooms), {
        name: roomName.trim(),
        description: roomDescription.trim(),
        avatarURL,
        creator: user!.uid,
        creatorName: meName,
        createdAt: now,
        members: initialMembers,
        isPublic,
        isRanked,
        mode: roomMode,
        kFactor: roomMode === 'arcade' ? 0 : kFactor,
        useGlobalElo: roomMode === 'professional' ? useGlobalElo : false,
        memberIds: memberIdsArr,
        adminIds,
        isArchived: false,
        seasonHistory: [],
        joinRequests: [],
        communityId:
          selectedCommunityId !== 'none' ? selectedCommunityId : null,
      });

      const batch = writeBatch(db!);

      // Обновляем список комнат у пользователей
      memberIdsArr.forEach((uid) => {
        batch.update(doc(db!, 'users', uid), { rooms: arrayUnion(docRef.id) });
      });

      // Обновляем сообщество (если выбрано)
      if (selectedCommunityId !== 'none') {
        batch.update(doc(db!, 'communities', selectedCommunityId), {
          roomIds: arrayUnion(docRef.id),
        });
      }

      await batch.commit();

      toast({
        title: t('Success'),
        description: `${t('Room')} "${roomName.trim()}" ${t('created')}`,
      });
      resetForm();
      setIsOpen(false);
      onSuccess?.();
      router.push(`/rooms/${docRef.id}`);
    } catch (e) {
      console.error(e);
      toast({
        title: t('Error'),
        description: t('Failed to create room'),
        variant: 'destructive',
      });
    } finally {
      setIsCreatingRoom(false);
    }
  };

  const createDisabled =
    isCreatingRoom ||
    !roomName.trim() ||
    roomName.trim().length > NAME_MAX ||
    roomDescription.trim().length > DESC_MAX;

  return (
    <>
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogTrigger asChild>
          <Button size='lg'>
            <PlusCircle className='mr-2 h-5 w-5' />
            {t('Create New Room')}
          </Button>
        </DialogTrigger>
        <DialogContent className='w-[95vw] max-w-7xl h-[95vh] p-0 flex flex-col gap-0'>
          <DialogHeader className='px-6 py-4 border-b flex-shrink-0 bg-background z-10'>
            <DialogTitle className='text-xl flex items-center gap-2'>
              <Trophy className='text-primary h-5 w-5' />
              {t('Create a Match Room')}{' '}
              <span className='text-muted-foreground font-normal'>
                | {config.name}
              </span>
            </DialogTitle>
            <DialogDescription>
              {t(
                'Configure your league settings. Choose wisely, as the Game Mode affects how ratings are calculated.'
              )}
            </DialogDescription>
          </DialogHeader>

          {/* Main Content: Split View */}
          <div className='flex-1 overflow-hidden grid grid-cols-1 lg:grid-cols-12 bg-muted/5'>
            {/* LEFT COLUMN: FORM (7 cols) */}
            <div className='lg:col-span-7 overflow-y-auto p-6 space-y-8 bg-background shadow-sm'>
              {/* 1. Basic Info */}
              <section className='space-y-4'>
                <h3 className='font-semibold text-lg flex items-center gap-2'>
                  <span className='bg-primary/10 text-primary w-6 h-6 rounded-full flex items-center justify-center text-xs'>
                    1
                  </span>
                  {t('Basic Info')}
                </h3>
                <div className='flex items-start gap-4 pl-8'>
                  <div className='flex flex-col items-center gap-2'>
                    <Avatar className='h-20 w-20 border-2 border-dashed'>
                      <AvatarImage src={avatarPreview ?? undefined} />
                      <AvatarFallback>
                        <ImageIcon className='h-8 w-8 text-muted-foreground' />
                      </AvatarFallback>
                    </Avatar>
                    <input
                      id='avatar-upload'
                      ref={fileInputRef}
                      type='file'
                      className='hidden'
                      accept={ACCEPT_MIME}
                      onChange={onPickFile}
                    />
                    <Button
                      variant='outline'
                      size='sm'
                      onClick={() => fileInputRef.current?.click()}
                    >
                      {t('Upload')}
                    </Button>
                  </div>
                  <div className='flex-1 space-y-3'>
                    <div className='grid gap-1.5'>
                      <Label htmlFor='roomName'>{t('Room Name')} *</Label>
                      <Input
                        id='roomName'
                        value={roomName}
                        maxLength={NAME_MAX}
                        onChange={(e) => setRoomName(e.target.value)}
                        placeholder={t('e.g. Friday Smashers')}
                      />
                    </div>
                    <div className='grid gap-1.5'>
                      <Label htmlFor='roomDesc'>
                        {t('Description')}{' '}
                        <span className='text-xs'>({t('optional')})</span>
                      </Label>
                      <Textarea
                        id='roomDesc'
                        value={roomDescription}
                        maxLength={DESC_MAX}
                        onChange={(e) => setRoomDescription(e.target.value)}
                        placeholder={t('What is this room about?')}
                        className='h-20 resize-none'
                      />
                    </div>
                  </div>
                </div>
              </section>

              <Separator />

              {/* 2. Game Mode */}
              <section className='space-y-4'>
                <h3 className='font-semibold text-lg flex items-center gap-2'>
                  <span className='bg-primary/10 text-primary w-6 h-6 rounded-full flex items-center justify-center text-xs'>
                    2
                  </span>
                  {t('Game Mode')}
                </h3>
                <div className='pl-8'>
                  <RadioGroup
                    value={roomMode}
                    onValueChange={(v) => {
                      setRoomMode(v as RoomMode);
                      if (v === 'arcade') setKFactor(0);
                      else if (v === 'office') {
                        setKFactor(32);
                      } else {
                        setKFactor(32);
                      }
                    }}
                    className='grid grid-cols-1 sm:grid-cols-3 gap-4'
                  >
                    {/* Office */}
                    <Label
                      htmlFor='mode-office'
                      className={`relative flex flex-col gap-2 rounded-xl border-2 p-4 cursor-pointer hover:bg-accent/50 transition-all ${
                        roomMode === 'office'
                          ? 'border-primary bg-primary/5'
                          : 'border-muted'
                      }`}
                    >
                      <RadioGroupItem
                        value='office'
                        id='mode-office'
                        className='sr-only'
                      />
                      <Briefcase className='h-6 w-6 text-primary' />
                      <div>
                        <div className='font-bold'>{t('Office League')}</div>
                        <div className='text-xs text-muted-foreground mt-1'>
                          {t('Recommended for workplaces. Forgiving losses.')}
                        </div>
                      </div>
                    </Label>

                    {/* Professional */}
                    <Label
                      htmlFor='mode-pro'
                      className={`relative flex flex-col gap-2 rounded-xl border-2 p-4 cursor-pointer hover:bg-accent/50 transition-all ${
                        roomMode === 'professional'
                          ? 'border-amber-500 bg-amber-500/5'
                          : 'border-muted'
                      }`}
                    >
                      <RadioGroupItem
                        value='professional'
                        id='mode-pro'
                        className='sr-only'
                      />
                      <Medal className='h-6 w-6 text-amber-500' />
                      <div>
                        <div className='font-bold text-amber-700 dark:text-amber-400'>
                          {t('Professional')}
                        </div>
                        <div className='text-xs text-muted-foreground mt-1'>
                          {t('Strict Rules. For clubs & serious competition.')}
                        </div>
                      </div>
                    </Label>

                    {/* Arcade */}
                    <Label
                      htmlFor='mode-arcade'
                      className={`relative flex flex-col gap-2 rounded-xl border-2 p-4 cursor-pointer hover:bg-accent/50 transition-all ${
                        roomMode === 'arcade'
                          ? 'border-purple-500 bg-purple-500/5'
                          : 'border-muted'
                      }`}
                    >
                      <RadioGroupItem
                        value='arcade'
                        id='mode-arcade'
                        className='sr-only'
                      />
                      <Gamepad2 className='h-6 w-6 text-purple-500' />
                      <div>
                        <div className='font-bold text-purple-700 dark:text-purple-400'>
                          {t('Arcade')}
                        </div>
                        <div className='text-xs text-muted-foreground mt-1'>
                          {t('Just for fun. No rating changes.')}
                        </div>
                      </div>
                    </Label>
                  </RadioGroup>

                  {/* PRO Settings */}
                  {roomMode === 'professional' && (
                    <div className='mt-4 p-4 rounded-lg border border-dashed border-amber-500/30 bg-amber-500/5 space-y-4 animate-in fade-in slide-in-from-top-2'>
                      <div className='flex items-center justify-between'>
                        <div className='space-y-0.5'>
                          <Label className='text-base font-semibold'>
                            {t('Seed from Global ELO')}
                          </Label>
                          <p className='text-xs text-muted-foreground max-w-sm'>
                            {t(
                              'If enabled, players start with their Global Rating (e.g. 1500) instead of 1000. Use this if you want to reflect existing skill levels immediately.'
                            )}
                          </p>
                        </div>
                        <Switch
                          checked={useGlobalElo}
                          onCheckedChange={setUseGlobalElo}
                        />
                      </div>
                      <div className='space-y-2 pt-2'>
                        <div className='flex justify-between'>
                          <Label>{t('K-Factor (Volatility)')}</Label>
                          <span className='font-mono text-xs border px-1 rounded bg-background'>
                            K={kFactor}
                          </span>
                        </div>
                        <Slider
                          min={16}
                          max={64}
                          step={4}
                          value={[kFactor]}
                          onValueChange={(v) => setKFactor(v[0])}
                        />
                      </div>
                    </div>
                  )}
                </div>
              </section>

              <Separator />

              {/* 3. Players */}
              <section className='space-y-4'>
                <h3 className='font-semibold text-lg flex items-center gap-2'>
                  <span className='bg-primary/10 text-primary w-6 h-6 rounded-full flex items-center justify-center text-xs'>
                    3
                  </span>
                  {t('Invite Players')}
                </h3>
                <div className='pl-8'>
                  {/* Community Selector (Only if communities exist) */}
                  {myCommunities.length > 0 && (
                    <div className='mb-6 bg-muted/20 p-4 rounded-lg border'>
                      <Label className='mb-2 block font-semibold flex items-center gap-2'>
                        <Warehouse className='h-4 w-4' />
                        {t('Link to Community (Optional)')}
                      </Label>
                      <Select
                        value={selectedCommunityId}
                        onValueChange={setSelectedCommunityId}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder={t('Select a community')} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value='none'>
                            {t('No community (Individual Invites)')}
                          </SelectItem>
                          {myCommunities.map((c) => (
                            <SelectItem key={c.id} value={c.id}>
                              {c.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {selectedCommunityId !== 'none' && (
                        <p className='text-xs text-muted-foreground mt-2'>
                          {t(
                            'All members of this community will be automatically added to the room.'
                          )}
                        </p>
                      )}
                    </div>
                  )}

                  {/* Standard Friend Selector (Always available if no community is active, or if user wants to mix) */}
                  {selectedCommunityId === 'none' && (
                    <>
                      <div className='relative mb-2'>
                        <Search className='absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground' />
                        <Input
                          value={search}
                          onChange={(e) => setSearch(e.target.value)}
                          placeholder={t('Search friends...')}
                          className='pl-9'
                        />
                      </div>
                      <ScrollArea className='h-48 border rounded-md p-2 bg-background'>
                        {filteredFriends.length + filteredOthers.length > 0 ? (
                          <div className='grid grid-cols-1 sm:grid-cols-2 gap-2'>
                            {[...filteredFriends, ...filteredOthers].map(
                              (p) => (
                                <label
                                  key={p.uid}
                                  className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer transition-colors ${
                                    selectedFriends.includes(p.uid)
                                      ? 'bg-primary/10 border-primary'
                                      : 'hover:bg-accent border-transparent'
                                  }`}
                                >
                                  <Checkbox
                                    checked={selectedFriends.includes(p.uid)}
                                    onCheckedChange={(v) =>
                                      toggleSelected(p.uid, v)
                                    }
                                  />
                                  <Avatar className='h-8 w-8'>
                                    <AvatarImage
                                      src={p.photoURL ?? undefined}
                                    />
                                    <AvatarFallback>
                                      {(p.name ?? '?').charAt(0)}
                                    </AvatarFallback>
                                  </Avatar>
                                  <span className='text-sm truncate font-medium'>
                                    {p.name ?? p.displayName}
                                  </span>
                                </label>
                              )
                            )}
                          </div>
                        ) : (
                          <p className='text-center text-sm text-muted-foreground py-10'>
                            {t('No players found')}
                          </p>
                        )}
                      </ScrollArea>
                      <p className='text-xs text-muted-foreground mt-2 text-right'>
                        {selectedFriends.length} {t('players selected')}
                      </p>
                    </>
                  )}
                </div>
              </section>
            </div>

            {/* RIGHT COLUMN: KNOWLEDGE BASE (5 cols) */}
            <div className='lg:col-span-5 bg-background border-l overflow-y-auto p-8'>
              <div className='flex items-center gap-2 mb-6 pb-4 border-b'>
                <BookOpen className='h-6 w-6 text-primary' />
                <div>
                  <h3 className='font-bold text-lg leading-none'>
                    {t('Knowledge Base')}
                  </h3>
                  <p className='text-xs text-muted-foreground mt-1'>
                    {t('Everything you need to know about game logic')}
                  </p>
                </div>
              </div>

              <Accordion
                type='single'
                collapsible
                className='w-full'
                defaultValue='pro-details'
              >
                {/* 1. Game Modes Explained */}
                <AccordionItem
                  value='modes'
                  className='mb-4 border rounded-lg px-4 bg-muted/20'
                >
                  <AccordionTrigger className='hover:no-underline py-4'>
                    <div className='flex items-center gap-3 font-semibold'>
                      <Info className='h-5 w-5 text-primary' />
                      {t('Which mode should I choose?')}
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className='text-sm text-muted-foreground space-y-4 pb-4'>
                    <p>
                      {t(
                        'Choosing the right mode changes how the mathematical engine calculates points.'
                      )}
                    </p>

                    <div className='grid gap-3'>
                      <div className='p-3 bg-background rounded-md border'>
                        <div className='font-bold text-foreground flex items-center gap-2 mb-1'>
                          <Briefcase className='h-4 w-4' />{' '}
                          {t('Office League (Casual)')}
                        </div>
                        <p className='mb-2'>
                          {t(
                            'Designed for workplaces. It uses an "Inflationary System".'
                          )}
                        </p>
                        <ul className='list-disc pl-4 space-y-1 text-xs'>
                          <li>
                            <strong>{t('Forgiving Losses:')}</strong>{' '}
                            {t(
                              'When you lose, you only drop 80% of the calculated points. This injects points into the system, keeping morale high.'
                            )}
                          </li>
                          <li>
                            <strong>{t('Ranking:')}</strong>{' '}
                            {t(
                              'Based on "Adjusted Points" which rewards activity, not just raw skill. A player who plays 50 games can beat a "camper" who plays 5 games.'
                            )}
                          </li>
                        </ul>
                      </div>

                      <div className='p-3 bg-background rounded-md border border-amber-200 dark:border-amber-900'>
                        <div className='font-bold text-foreground flex items-center gap-2 mb-1'>
                          <Medal className='h-4 w-4 text-amber-500' />{' '}
                          {t('Professional (Serious)')}
                        </div>
                        <p className='mb-2'>
                          {t(
                            'For clubs and competitive groups. It uses a "Zero-Sum System".'
                          )}
                        </p>
                        <ul className='list-disc pl-4 space-y-1 text-xs'>
                          <li>
                            <strong>{t('Strict Math:')}</strong>{' '}
                            {t(
                              'If Winner gets +20, Loser gets -20. No points are created or destroyed.'
                            )}
                          </li>
                          <li>
                            <strong>{t('Ranking:')}</strong>{' '}
                            {t('Pure ELO Rating. The highest number wins.')}
                          </li>
                        </ul>
                      </div>
                    </div>
                  </AccordionContent>
                </AccordionItem>

                {/* 2. Professional Deep Dive */}
                <AccordionItem
                  value='pro-details'
                  className='mb-4 border rounded-lg px-4 bg-amber-50/50 dark:bg-amber-950/10 border-amber-200 dark:border-amber-900'
                >
                  <AccordionTrigger className='hover:no-underline py-4'>
                    <div className='flex items-center gap-3 font-semibold'>
                      <Swords className='h-5 w-5 text-amber-600 dark:text-amber-500' />
                      {t('Professional Mode Details')}
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className='text-sm text-muted-foreground space-y-4 pb-4'>
                    <p>
                      {t(
                        'Professional mode has specific rules to ensure fair competition among experienced players.'
                      )}
                    </p>

                    <div className='space-y-4'>
                      <div>
                        <h4 className='font-bold text-foreground text-xs uppercase tracking-wide mb-1'>
                          {t('1. Seeding (Seed from Global ELO)')}
                        </h4>
                        <p>
                          {t(
                            'By default, everyone in a new room starts at 1000 ELO. However, if you enable "Seeding", players will import their current "Global ELO" into this room.'
                          )}
                        </p>
                        <p className='mt-2 text-xs italic bg-background p-2 rounded border'>
                          {t(
                            'Example: Imagine a Pro player (2000 ELO) joins a room with beginners. If he starts at 1000, he will steal unfair points from beginners. Seeding puts him at 2000 immediately to prevent this.'
                          )}
                        </p>
                      </div>

                      <Separator className='bg-amber-200/50' />

                      <div>
                        <h4 className='font-bold text-foreground text-xs uppercase tracking-wide mb-1'>
                          {t('2. Calibration Phase')}
                        </h4>
                        <p>
                          {t(
                            'For the first 10 matches in a Professional room, the "K-Factor" (volatility) is DOUBLED.'
                          )}
                        </p>
                        <ul className='list-disc pl-4 mt-2 space-y-1 text-xs'>
                          <li>{t('Standard Match: +/- 20 points')}</li>
                          <li>{t('Calibration Match: +/- 40 points')}</li>
                        </ul>
                        <p className='mt-2'>
                          {t(
                            'Why? This allows new players to reach their "real" rating very quickly, rather than grinding slowly from 1000.'
                          )}
                        </p>
                      </div>
                    </div>
                  </AccordionContent>
                </AccordionItem>

                {/* 3. Dual Rating System */}
                <AccordionItem
                  value='elo-dual'
                  className='mb-4 border rounded-lg px-4 bg-muted/20'
                >
                  <AccordionTrigger className='hover:no-underline py-4'>
                    <div className='flex items-center gap-3 font-semibold'>
                      <Globe className='h-5 w-5 text-blue-500' />
                      {t('Global vs. Room ELO')}
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className='text-sm text-muted-foreground space-y-4 pb-4'>
                    <div className='flex gap-3'>
                      <div className='flex-1 p-2 bg-background border rounded text-xs'>
                        <div className='font-bold text-blue-600 mb-1'>
                          {t('Global ELO')}
                        </div>
                        {t(
                          'Your "Passport". Follows you everywhere. Never resets. Measures your lifetime skill.'
                        )}
                      </div>
                      <div className='flex-1 p-2 bg-background border rounded text-xs'>
                        <div className='font-bold text-green-600 mb-1'>
                          {t('Room ELO')}
                        </div>
                        {t(
                          'Your "Tournament Score". Specific to this room. Resets every season.'
                        )}
                      </div>
                    </div>

                    <div>
                      <h4 className='font-bold text-foreground text-xs uppercase tracking-wide mb-1'>
                        {t('Why do they differ?')}
                      </h4>
                      <p>
                        {t(
                          'Even if you start with Seeding, your Room ELO and Global ELO will drift apart because:'
                        )}
                      </p>
                      <ul className='list-disc pl-4 mt-1 space-y-1 text-xs'>
                        <li>
                          {t(
                            'Room ELO has a "Calibration Phase" (moving 2x faster).'
                          )}
                        </li>
                        <li>
                          {t(
                            'Office Mode rules (inflation) only apply to Room ELO.'
                          )}
                        </li>
                        <li>
                          {t(
                            'Room ELO resets to 1000 (or Seed) when a new Season starts.'
                          )}
                        </li>
                      </ul>
                    </div>
                  </AccordionContent>
                </AccordionItem>

                {/* 4. Season Winners */}
                <AccordionItem
                  value='seasons'
                  className='mb-4 border rounded-lg px-4 bg-muted/20'
                >
                  <AccordionTrigger className='hover:no-underline py-4'>
                    <div className='flex items-center gap-3 font-semibold'>
                      <Trophy className='h-5 w-5 text-yellow-500' />
                      {t('How are winners decided?')}
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className='text-sm text-muted-foreground space-y-3 pb-4'>
                    <p>
                      {t(
                        'When you click "Finish Season", the final standings are calculated. The winner depends on your Mode:'
                      )}
                    </p>

                    <div className='grid gap-2'>
                      <div className='flex items-start gap-2'>
                        <Medal className='h-4 w-4 mt-0.5 text-amber-500 shrink-0' />
                        <div>
                          <span className='font-bold text-foreground'>
                            {t('Professional:')}
                          </span>{' '}
                          {t(
                            'Highest Rating wins. If ratings are equal, Win % is the tie-breaker.'
                          )}
                        </div>
                      </div>
                      <div className='flex items-start gap-2'>
                        <Briefcase className='h-4 w-4 mt-0.5 text-primary shrink-0' />
                        <div>
                          <span className='font-bold text-foreground'>
                            {t('Office:')}
                          </span>{' '}
                          {t('Winner is decided by "Adjusted Points".')}
                          <div className='text-xs bg-background p-1 border rounded mt-1 font-mono'>
                            {t(
                              'Score = (Rating - 1000) × √(Games Played / Avg Games)'
                            )}
                          </div>
                          <div className='text-xs mt-1'>
                            {t(
                              'This means a player with lower rating who played 100 games can beat a player with higher rating who only played 2 games.'
                            )}
                          </div>
                        </div>
                      </div>
                      <div className='flex items-start gap-2'>
                        <Gamepad2 className='h-4 w-4 mt-0.5 text-purple-500 shrink-0' />
                        <div>
                          <span className='font-bold text-foreground'>
                            {t('Arcade:')}
                          </span>{' '}
                          {t('Whoever has the most Wins takes the crown.')}
                        </div>
                      </div>
                    </div>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </div>
          </div>

          <DialogFooter className='px-6 py-4 border-t bg-background flex-shrink-0'>
            <div className='flex items-center justify-between w-full'>
              <div className='text-xs text-muted-foreground hidden sm:flex items-center gap-2'>
                <Avatar className='h-6 w-6'>
                  <AvatarImage src={userProfile?.photoURL ?? undefined} />
                  <AvatarFallback className='text-[10px]'>
                    {userProfile?.name?.charAt(0)}
                  </AvatarFallback>
                </Avatar>
                <span>
                  {t('Creating as')}: <strong>{userProfile?.name}</strong>
                </span>
              </div>
              <div className='flex gap-2'>
                <Button variant='ghost' onClick={() => setIsOpen(false)}>
                  {t('Cancel')}
                </Button>
                <Button onClick={handleCreateRoom} disabled={createDisabled}>
                  {isCreatingRoom ? t('Creating Room...') : t('Create Room')}
                </Button>
              </div>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ImageCropDialog
        open={cropOpen}
        onOpenChange={setCropOpen}
        image={avatarSrc}
        aspect={1}
        onCropped={onCropped}
        title={t('Adjust image')}
      />
    </>
  );
}

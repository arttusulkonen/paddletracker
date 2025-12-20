// src/app/manage/players/page.tsx
'use client';

import {
	arrayUnion,
	collection,
	deleteDoc,
	doc,
	getDocs,
	orderBy,
	query,
	where,
	writeBatch,
} from 'firebase/firestore';
import {
	CheckCircle2,
	Ghost,
	Link as LinkIcon,
	Loader2,
	Plus,
	Users,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '@/components/ui/card';
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { db } from '@/lib/firebase';
import { getFinnishFormattedDate } from '@/lib/utils';

interface GhostUser {
  uid: string;
  name: string;
  isGhost: boolean;
  managedBy: string;
  isClaimed?: boolean;
  isArchivedGhost?: boolean;
  claimedBy?: string;
  createdAt: string;
  photoURL?: string;
  communityIds?: string[];
}

export default function ManagePlayersPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { toast } = useToast();

  const [players, setPlayers] = useState<GhostUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  // Dialog States
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newGhostName, setNewGhostName] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  // Community States
  const [communities, setCommunities] = useState<any[]>([]);
  const [selectedCommunity, setSelectedCommunity] = useState<string>('');

  // Load "My" Managed Players
  const loadPlayers = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const q = query(
        collection(db, 'users'),
        where('managedBy', '==', user.uid),
        orderBy('createdAt', 'desc')
      );
      const snap = await getDocs(q);
      const allLoaded = snap.docs.map((d) => ({
        uid: d.id,
        ...d.data(),
      })) as GhostUser[];

      const validPlayers = allLoaded.filter((p) => !p.isArchivedGhost);

      setPlayers(validPlayers);
    } catch (error) {
      console.error(error);
      toast({ title: t('Failed to load players'), variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [user, t, toast]);

  useEffect(() => {
    if (user) loadPlayers();
  }, [user, loadPlayers]);

  // Load Communities for Select
  useEffect(() => {
    if (!user) return;
    const fetchCommunities = async () => {
      try {
        const q = query(
          collection(db, 'communities'),
          where('admins', 'array-contains', user.uid)
        );
        const snap = await getDocs(q);
        setCommunities(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      } catch (e) {
        console.error('Failed to load communities', e);
      }
    };
    fetchCommunities();
  }, [user]);

  const filteredPlayers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return players;
    return players.filter((p) => p.name.toLowerCase().includes(q));
  }, [players, search]);

  const handleCreateGhost = async () => {
    if (!newGhostName.trim() || !user) return;
    setIsCreating(true);
    try {
      const batch = writeBatch(db);
      const now = getFinnishFormattedDate();

      // 1. Create reference for new user
      const newUserRef = doc(collection(db, 'users'));
      const newUserId = newUserRef.id;

      batch.set(newUserRef, {
        uid: newUserId,
        name: newGhostName.trim(),
        displayName: newGhostName.trim(),
        email: `ghost_${Date.now()}@smashlog.local`, // Fake email
        managedBy: user.uid,
        isGhost: true,
        isClaimed: false,
        createdAt: now,
        globalElo: 1000,
        matchesPlayed: 0,
        wins: 0,
        losses: 0,
        friends: [],
        rooms: [],
        photoURL: null,
        communityIds: selectedCommunity ? [selectedCommunity] : [],
      });

      // 2. If community selected, add player to community members
      if (selectedCommunity) {
        const commRef = doc(db, 'communities', selectedCommunity);
        batch.update(commRef, {
          members: arrayUnion(newUserId),
        });
      }

      await batch.commit();

      const newGhost: GhostUser = {
        uid: newUserId,
        name: newGhostName.trim(),
        managedBy: user.uid,
        isGhost: true,
        createdAt: now,
        communityIds: selectedCommunity ? [selectedCommunity] : [],
      };
      setPlayers((prev) => [newGhost, ...prev]);

      setNewGhostName('');
      setSelectedCommunity('');
      setIsCreateOpen(false);
      toast({ title: t('Ghost player created') });
    } catch (error) {
      console.error(error);
      toast({ title: t('Error creating player'), variant: 'destructive' });
    } finally {
      setIsCreating(false);
    }
  };

  const copyInviteLink = (uid: string) => {
    const link = `${window.location.origin}/register?claim=${uid}`;
    navigator.clipboard.writeText(link);
    toast({
      title: t('Link copied!'),
      description: t('Send this link to the player to claim this profile.'),
    });
  };

  const deleteGhost = async (uid: string) => {
    try {
      await deleteDoc(doc(db, 'users', uid));
      setPlayers((prev) => prev.filter((p) => p.uid !== uid));
      toast({ title: t('Player deleted') });
    } catch {
      toast({ title: t('Error deleting player'), variant: 'destructive' });
    }
  };

  if (!user) return null;

  return (
    <div className='container mx-auto py-8 max-w-5xl space-y-6'>
      <div className='flex flex-col md:flex-row items-start md:items-center justify-between gap-4'>
        <div>
          <h1 className='text-3xl font-bold flex items-center gap-2'>
            <Users className='h-8 w-8 text-primary' />
            {t('My Players')}
          </h1>
          <p className='text-muted-foreground'>
            {t('Manage ghost players and see claimed profiles.')}
          </p>
        </div>

        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className='mr-2 h-4 w-4' />
              {t('Create Ghost Player')}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t('Add New Player')}</DialogTitle>
              <DialogDescription>
                {t(
                  'Create a placeholder profile. You can add matches for them immediately.'
                )}
              </DialogDescription>
            </DialogHeader>
            <div className='space-y-4 py-4'>
              <div className='space-y-2'>
                <Label>{t('Player Name')}</Label>
                <Input
                  placeholder='e.g. John Doe'
                  value={newGhostName}
                  onChange={(e) => setNewGhostName(e.target.value)}
                />
              </div>

              <div className='space-y-2'>
                <Label>{t('Assign to Community (Optional)')}</Label>
                <Select
                  value={selectedCommunity}
                  onValueChange={setSelectedCommunity}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t('Select a community')} />
                  </SelectTrigger>
                  <SelectContent>
                    {communities.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant='ghost' onClick={() => setIsCreateOpen(false)}>
                {t('Cancel')}
              </Button>
              <Button
                onClick={handleCreateGhost}
                disabled={isCreating || !newGhostName.trim()}
              >
                {isCreating && (
                  <Loader2 className='mr-2 h-4 w-4 animate-spin' />
                )}
                {t('Create')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('Managed Profiles')}</CardTitle>
          <CardDescription>
            {t('Players you manage or invited.')}
          </CardDescription>
        </CardHeader>
        <CardContent className='space-y-4'>
          <div className='relative'>
            <Input
              placeholder={t('Search players...')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {loading ? (
            <div className='flex justify-center py-8'>
              <Loader2 className='h-8 w-8 animate-spin text-muted-foreground' />
            </div>
          ) : filteredPlayers.length === 0 ? (
            <div className='text-center py-12 border-2 border-dashed rounded-lg'>
              <Ghost className='h-12 w-12 mx-auto text-muted-foreground mb-3' />
              <h3 className='font-medium text-lg'>{t('No players found')}</h3>
            </div>
          ) : (
            <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4'>
              {filteredPlayers.map((player) => {
                const isRealUser = !player.isGhost && !player.isClaimed;

                return (
                  <div
                    key={player.uid}
                    className='group relative flex items-start gap-3 p-4 rounded-lg border bg-card hover:shadow-sm transition-all'
                  >
                    <Avatar className='h-12 w-12 border'>
                      <AvatarImage src={player.photoURL} />
                      <AvatarFallback>{player.name[0]}</AvatarFallback>
                    </Avatar>
                    <div className='flex-1 min-w-0'>
                      <div className='flex items-center gap-2'>
                        <h4 className='font-semibold truncate leading-none'>
                          {player.name}
                        </h4>
                        {isRealUser && (
                          <Badge
                            variant='outline'
                            className='text-[10px] h-4 px-1 border-green-500 text-green-600 bg-green-50'
                          >
                            {t('Active')}
                          </Badge>
                        )}
                        {player.isGhost && (
                          <Badge
                            variant='secondary'
                            className='text-[10px] h-4 px-1'
                          >
                            {t('Ghost')}
                          </Badge>
                        )}
                      </div>
                      <div className='text-xs text-muted-foreground mt-1'>
                        {t('Added')}: {player.createdAt.split(' ')[0]}
                      </div>

                      <div className='flex items-center gap-2 mt-3'>
                        {isRealUser ? (
                          <div className='text-xs text-green-600 flex items-center gap-1 bg-green-50 px-2 py-1 rounded w-full justify-center border border-green-100'>
                            <CheckCircle2 className='h-3 w-3' />
                            {t('Account Linked')}
                          </div>
                        ) : (
                          <>
                            <Button
                              variant='outline'
                              size='sm'
                              className='h-7 text-xs flex-1'
                              onClick={() => copyInviteLink(player.uid)}
                              disabled={player.isClaimed}
                            >
                              <LinkIcon className='mr-2 h-3 w-3' />
                              {t('Copy Invite')}
                            </Button>

                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button
                                  variant='ghost'
                                  size='icon'
                                  className='h-7 w-7 text-muted-foreground hover:text-destructive'
                                >
                                  <span className='sr-only'>{t('Delete')}</span>
                                  <Trash2 className='h-4 w-4' />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>
                                    {t('Delete player?')}
                                  </AlertDialogTitle>
                                  <AlertDialogDescription>
                                    {t(
                                      'This will remove the player. Matches involving this player might display "Unknown".'
                                    )}
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>
                                    {t('Cancel')}
                                  </AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => deleteGhost(player.uid)}
                                  >
                                    {t('Delete')}
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

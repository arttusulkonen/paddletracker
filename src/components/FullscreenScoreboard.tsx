'use client';

import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { useSport } from '@/contexts/SportContext';
import { useToast } from '@/hooks/use-toast';
import { app, db } from '@/lib/firebase';
import type { Room } from '@/lib/types';
import confetti from 'canvas-confetti';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import {
	ArrowDown,
	ArrowRight,
	ArrowUp,
	Flame,
	Loader2,
	Minus,
	Trophy,
	X,
} from 'lucide-react';
import React, {
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from 'react';
import { useTranslation } from 'react-i18next';

type HistoryMatch = {
  playerLName: string;
  playerRName: string;
  scoreL: number;
  scoreR: number;
};

type PlayerUpdate = {
  name: string;
  eloDiff: number;
  newElo: number;
  roomElo?: number;
  oldRank?: number;
  newRank?: number;
};

type MatchResultData = {
  updates: PlayerUpdate[];
};

type RoomWithId = Room & { id: string };

export const FullscreenScoreboard = ({
  onClose,
  lastActiveRoom,
}: {
  onClose: () => void;
  lastActiveRoom: (Room & { id: string }) | null;
}) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { config } = useSport();
  const { toast } = useToast();

  const [step, setStep] = useState<'setup' | 'waiting' | 'match' | 'results'>(
    'setup',
  );

  const [rooms, setRooms] = useState<RoomWithId[]>([]);
  const [selectedRoom, setSelectedRoom] = useState<RoomWithId | null>(null);
  const [playerLId, setPlayerLId] = useState('');
  const [playerRId, setPlayerRId] = useState('');

  const [scoreL, setScoreL] = useState(0);
  const [scoreR, setScoreR] = useState(0);
  const [time, setTime] = useState(0);
  const [isMac, setIsMac] = useState(false);

  const [matchHistory, setMatchHistory] = useState<HistoryMatch[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [matchResults, setMatchResults] = useState<MatchResultData | null>(
    null,
  );

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stateRef = useRef({
    step,
    isMatchFinished: false,
    isSubmitting,
    scoreL,
    scoreR,
    playerLId,
    playerRId,
  });

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setIsMac(navigator.userAgent.toUpperCase().indexOf('MAC') >= 0);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!user?.uid || !config?.collections?.rooms || !db) return;

    const fetchRooms = async () => {
      try {
        const q = query(
          collection(db, config.collections.rooms),
          where('memberIds', 'array-contains', user.uid),
          where('isArchived', '!=', true),
        );
        const snap = await getDocs(q);

        const fetched: RoomWithId[] = [];
        snap.forEach((doc) => {
          const rData = doc.data() as Room;
          if (rData.isArchived !== true && rData.isArchived !== 'true') {
            fetched.push({ id: doc.id, ...rData });
          }
        });

        fetched.sort((a, b) =>
          (b.createdAt || '').localeCompare(a.createdAt || ''),
        );
        setRooms(fetched);
      } catch (error: any) {
        toast({
          title: t('Error loading rooms'),
          description: error.message,
          variant: 'destructive',
        });
      }
    };

    fetchRooms();
  }, [user?.uid, config?.collections?.rooms, t, toast]);

  useEffect(() => {
    if (!rooms || rooms.length === 0) return;

    if (
      lastActiveRoom &&
      lastActiveRoom.isArchived !== true &&
      lastActiveRoom.isArchived !== 'true'
    ) {
      const match = rooms.find((r) => r.id === lastActiveRoom.id);
      if (match) {
        setSelectedRoom(match);
        return;
      }
    }

    if (!selectedRoom) {
      setSelectedRoom(rooms[0]);
    }
  }, [rooms, lastActiveRoom, selectedRoom]);

  const playerLName = useMemo(() => {
    if (!selectedRoom || !Array.isArray(selectedRoom.members))
      return 'Player L';
    const member = selectedRoom.members.find(
      (m: any) => m.userId === playerLId,
    );
    return member ? member.name : 'Player L';
  }, [selectedRoom, playerLId]);

  const playerRName = useMemo(() => {
    if (!selectedRoom || !Array.isArray(selectedRoom.members))
      return 'Player R';
    const member = selectedRoom.members.find(
      (m: any) => m.userId === playerRId,
    );
    return member ? member.name : 'Player R';
  }, [selectedRoom, playerRId]);

  const checkWinCondition = useCallback(
    (l: number, r: number) => {
      if (config && typeof config === 'object') {
        const validator = (config as any).validateScore;

        if (typeof validator === 'function') {
          const result = validator(l, r);

          if (typeof result === 'boolean') {
            return result;
          }

          if (result && typeof result === 'object' && 'isValid' in result) {
            const isValid = (result as any).isValid;
            if (typeof isValid === 'boolean') {
              return isValid;
            }
          }
        }
      }

      if (l >= 11 || r >= 11) {
        if (Math.abs(l - r) >= 2) {
          return true;
        }
      }
      return false;
    },
    [config],
  );

  const formatTime = (seconds: number) => {
    if (seconds === null || seconds === undefined) return '00:00';
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const isMatchFinished = checkWinCondition(scoreL, scoreR);

  useEffect(() => {
    stateRef.current = {
      step,
      isMatchFinished,
      isSubmitting,
      scoreL,
      scoreR,
      playerLId,
      playerRId,
    };
  }, [
    step,
    isMatchFinished,
    isSubmitting,
    scoreL,
    scoreR,
    playerLId,
    playerRId,
  ]);

  useEffect(() => {
    if (isMatchFinished) {
      confetti({
        particleCount: 150,
        spread: 80,
        origin: { y: 0.6 },
        colors: [
          '#26ccff',
          '#a25afd',
          '#ff5e7e',
          '#88ff5a',
          '#fcff42',
          '#ffa62d',
          '#ff36ff',
        ],
      });
    }
  }, [isMatchFinished]);

  useEffect(() => {
    if (isMatchFinished && timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, [isMatchFinished]);

  const submitSeries = useCallback(async () => {
    if (!selectedRoom?.id) {
      toast({ title: t('No room selected'), variant: 'destructive' });
      return;
    }

    if (matchHistory.length === 0 && scoreL === 0 && scoreR === 0) {
      toast({ title: t('No matches to submit'), variant: 'destructive' });
      return;
    }

    if (!isMatchFinished && (scoreL > 0 || scoreR > 0)) {
      toast({
        title: t('Please finish the current game before submitting'),
        variant: 'destructive',
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const functions = getFunctions(app ?? undefined, 'europe-west1');
      const saveFunc = httpsCallable(functions, 'aiSaveMatch');

      const drafts = matchHistory.map((h) => ({
        player1Name: h.playerLName,
        player2Name: h.playerRName,
        score1: h.scoreL,
        score2: h.scoreR,
      }));

      if (scoreL > 0 || scoreR > 0) {
        drafts.push({
          player1Name: playerLName,
          player2Name: playerRName,
          score1: scoreL,
          score2: scoreR,
        });
      }

      const response = await saveFunc({
        matches: drafts,
        roomId: selectedRoom.id,
      });

      setMatchResults(response.data as MatchResultData);
      toast({ title: t('Series submitted successfully!') });

      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('match-recorded'));
      }

      setStep('results');
    } catch (error: any) {
      toast({
        title: t('Submit Failed'),
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  }, [
    matchHistory,
    scoreL,
    scoreR,
    playerLName,
    playerRName,
    selectedRoom,
    isMatchFinished,
    app,
    t,
    toast,
  ]);

  const handleNextAction = useCallback(
    (action: 'next_swap' | 'next_keep' | 'rematch') => {
      if (action !== 'rematch') {
        setMatchHistory((prev) => [
          ...prev,
          {
            playerLName,
            playerRName,
            scoreL,
            scoreR,
          },
        ]);
      }

      setScoreL(0);
      setScoreR(0);
      setTime(0);

      if (action === 'next_swap') {
        const tempLId = playerLId;
        setPlayerLId(playerRId);
        setPlayerRId(tempLId);
      }

      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = setInterval(() => {
        setTime((prev) => prev + 1);
      }, 1000);
    },
    [playerLName, playerRName, scoreL, scoreR, playerLId, playerRId],
  );

  const callbacksRef = useRef({ submitSeries, handleNextAction, onClose });
  useEffect(() => {
    callbacksRef.current = { submitSeries, handleNextAction, onClose };
  }, [submitSeries, handleNextAction, onClose]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (typeof document !== 'undefined') {
        const activeTag = document.activeElement?.tagName.toLowerCase();
        if (
          activeTag === 'input' ||
          activeTag === 'textarea' ||
          activeTag === 'select'
        )
          return;
      }

      const current = stateRef.current;
      const cbs = callbacksRef.current;

      if (current.step === 'setup') return;

      if (current.step === 'results') {
        if (e.code === 'Enter' || e.code === 'Space' || e.code === 'Escape') {
          e.preventDefault();
          cbs.onClose();
        }
        return;
      }

      const isSubmit =
        (isMac && e.metaKey && e.code === 'Enter') ||
        (!isMac && e.ctrlKey && e.code === 'Enter');

      if (isSubmit) {
        e.preventDefault();
        if (current.step === 'match' && !current.isSubmitting) {
          cbs.submitSeries();
        }
        return;
      }

      if (current.step === 'waiting') {
        if (e.code === 'Space') {
          e.preventDefault();
          setStep('match');
          setScoreL(0);
          setScoreR(0);
          setTime(0);
          if (timerRef.current) clearInterval(timerRef.current);
          timerRef.current = setInterval(() => {
            setTime((prev) => prev + 1);
          }, 1000);
        }
        return;
      }

      if (current.step === 'match' && current.isMatchFinished) {
        if (e.code === 'Space') {
          e.preventDefault();
          cbs.handleNextAction('rematch');
        } else if (e.code === 'KeyS') {
          e.preventDefault();
          cbs.handleNextAction('next_swap');
        } else if (e.code === 'KeyN') {
          e.preventDefault();
          cbs.handleNextAction('next_keep');
        } else if (e.code === 'KeyW') {
          e.preventDefault();
          setScoreL((prev) => Math.max(0, prev - 1));
          if (timerRef.current) clearInterval(timerRef.current);
          timerRef.current = setInterval(
            () => setTime((prev) => prev + 1),
            1000,
          );
        } else if (e.code === 'KeyO') {
          e.preventDefault();
          setScoreR((prev) => Math.max(0, prev - 1));
          if (timerRef.current) clearInterval(timerRef.current);
          timerRef.current = setInterval(
            () => setTime((prev) => prev + 1),
            1000,
          );
        }
        return;
      }

      if (current.step === 'match' && !current.isMatchFinished) {
        if (e.code === 'KeyQ') {
          setScoreL((prev) => prev + 1);
        } else if (e.code === 'KeyP') {
          setScoreR((prev) => prev + 1);
        } else if (e.code === 'KeyW') {
          setScoreL((prev) => Math.max(0, prev - 1));
        } else if (e.code === 'KeyO') {
          setScoreR((prev) => Math.max(0, prev - 1));
        } else if (e.code === 'KeyS') {
          setScoreL(current.scoreR);
          setScoreR(current.scoreL);
          setPlayerLId(current.playerRId);
          setPlayerRId(current.playerLId);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isMac]);

  return (
    <div className='fixed inset-0 z-[100] bg-background flex flex-col items-center justify-center overflow-hidden animate-in fade-in duration-300'>
      <Button
        variant='ghost'
        size='icon'
        onClick={onClose}
        className='absolute top-6 right-6 h-12 w-12 rounded-full bg-muted/50 hover:bg-muted z-50'
        aria-label={t('Close')}
      >
        <X className='h-6 w-6' />
      </Button>

      {step === 'setup' && (
        <div className='w-full max-w-xl space-y-8 p-8'>
          <div className='text-center space-y-2'>
            <h2 className='text-4xl font-extrabold tracking-tight'>
              {t('Setup Match')}
            </h2>
            <p className='text-muted-foreground'>
              {t('Configure room and player positions.')}
            </p>
          </div>
          <div className='space-y-4'>
            <div className='space-y-1.5'>
              <label
                htmlFor='room-select'
                className='text-[10px] font-bold text-muted-foreground uppercase tracking-widest pl-1'
              >
                {t('Select Room')}
              </label>
              <select
                id='room-select'
                value={selectedRoom?.id || ''}
                onChange={(e) => {
                  const r = rooms.find((room) => room.id === e.target.value);
                  if (r) {
                    setSelectedRoom(r);
                    setPlayerLId('');
                    setPlayerRId('');
                  }
                }}
                className='w-full p-4 bg-muted/50 rounded-xl border-0 ring-1 ring-border focus:ring-2 focus:ring-primary text-lg outline-none cursor-pointer'
                aria-label={t('Room')}
              >
                <option value='' disabled>
                  {t('Select Room')}
                </option>
                {rooms.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </div>

            <div className='grid grid-cols-2 gap-4'>
              <div className='space-y-1.5'>
                <label
                  htmlFor='player-left-select'
                  className='text-[10px] font-bold text-muted-foreground uppercase tracking-widest pl-1'
                >
                  {t('Player Left')}
                </label>
                <select
                  id='player-left-select'
                  value={playerLId}
                  onChange={(e) => setPlayerLId(e.target.value)}
                  disabled={!selectedRoom}
                  className='w-full p-4 bg-muted/50 rounded-xl border-0 ring-1 ring-border focus:ring-2 focus:ring-primary text-lg outline-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed'
                  aria-label={t('Player Left')}
                >
                  <option value='' disabled>
                    {t('Select Player Left')}
                  </option>
                  {Array.isArray(selectedRoom?.members) &&
                    selectedRoom.members.map((m: any) => (
                      <option
                        key={m.userId}
                        value={m.userId}
                        disabled={m.userId === playerRId}
                      >
                        {m.name}
                      </option>
                    ))}
                </select>
              </div>

              <div className='space-y-1.5'>
                <label
                  htmlFor='player-right-select'
                  className='text-[10px] font-bold text-muted-foreground uppercase tracking-widest pl-1'
                >
                  {t('Player Right')}
                </label>
                <select
                  id='player-right-select'
                  value={playerRId}
                  onChange={(e) => setPlayerRId(e.target.value)}
                  disabled={!selectedRoom}
                  className='w-full p-4 bg-muted/50 rounded-xl border-0 ring-1 ring-border focus:ring-2 focus:ring-primary text-lg outline-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed'
                  aria-label={t('Player Right')}
                >
                  <option value='' disabled>
                    {t('Select Player Right')}
                  </option>
                  {Array.isArray(selectedRoom?.members) &&
                    selectedRoom.members.map((m: any) => (
                      <option
                        key={m.userId}
                        value={m.userId}
                        disabled={m.userId === playerLId}
                      >
                        {m.name}
                      </option>
                    ))}
                </select>
              </div>
            </div>

            <Button
              size='lg'
              className='w-full h-14 text-lg rounded-xl mt-4'
              onClick={() => setStep('waiting')}
              disabled={!selectedRoom || !playerLId || !playerRId}
            >
              {t('Proceed to Match')}
            </Button>
          </div>
        </div>
      )}

      {step === 'waiting' && (
        <div className='text-center space-y-10'>
          <h2 className='text-2xl font-semibold text-muted-foreground uppercase tracking-widest'>
            {selectedRoom?.name}
          </h2>
          <div>
            <h1 className='text-6xl font-extrabold text-primary animate-pulse'>
              {t('Waiting for START...')}
            </h1>
            <p className='text-2xl text-muted-foreground mt-6 font-medium tracking-widest uppercase'>
              {t('Press [Space] to begin')}
            </p>
          </div>
          <div className='flex justify-center gap-24 text-3xl font-medium pt-8'>
            <div className='flex flex-col items-center gap-2'>
              <span className='text-muted-foreground text-sm uppercase tracking-widest'>
                {t('Left Side')}
              </span>
              <span>{playerLName}</span>
            </div>
            <div className='flex flex-col items-center gap-2'>
              <span className='text-muted-foreground text-sm uppercase tracking-widest'>
                {t('Right Side')}
              </span>
              <span>{playerRName}</span>
            </div>
          </div>
        </div>
      )}

      {step === 'match' && (
        <div className='w-full h-full flex flex-col relative'>
          {matchHistory.length > 0 && (
            <div className='absolute top-6 left-6 w-72 bg-card/80 backdrop-blur-md rounded-2xl border border-border p-5 z-40 shadow-xl'>
              <h3 className='text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-4'>
                {t('Series History')}
              </h3>
              <div className='space-y-3'>
                {matchHistory.map((m, i) => (
                  <div
                    key={i}
                    className='flex justify-between items-center text-sm font-medium'
                  >
                    <span
                      className={`truncate flex-1 ${m.scoreL > m.scoreR ? 'text-primary font-black' : 'text-foreground'}`}
                    >
                      {m.playerLName}
                    </span>
                    <span className='bg-muted px-3 py-1 rounded-lg font-mono text-xs mx-3 whitespace-nowrap'>
                      {m.scoreL} - {m.scoreR}
                    </span>
                    <span
                      className={`truncate flex-1 text-right ${m.scoreR > m.scoreL ? 'text-primary font-black' : 'text-foreground'}`}
                    >
                      {m.playerRName}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className='flex-none text-center pt-12 pb-4 z-10'>
            <div className='text-6xl font-mono tracking-tighter font-light'>
              {formatTime(time)}
            </div>
            <div className='text-muted-foreground uppercase tracking-widest text-sm mt-2'>
              {selectedRoom?.name}
            </div>
          </div>

          <div className='flex-1 flex items-center justify-center w-full z-10'>
            <div className='flex-1 flex flex-col items-center justify-center border-r border-border/50'>
              <div className='text-4xl text-muted-foreground font-medium uppercase tracking-wider mb-8'>
                {playerLName}
              </div>
              <div
                className={`text-[15rem] leading-none font-extrabold transition-colors ${
                  isMatchFinished && scoreL > scoreR ? 'text-primary' : ''
                }`}
              >
                {scoreL}
              </div>
            </div>

            <div className='flex-1 flex flex-col items-center justify-center'>
              <div className='text-4xl text-muted-foreground font-medium uppercase tracking-wider mb-8'>
                {playerRName}
              </div>
              <div
                className={`text-[15rem] leading-none font-extrabold transition-colors ${
                  isMatchFinished && scoreR > scoreL ? 'text-primary' : ''
                }`}
              >
                {scoreR}
              </div>
            </div>
          </div>

          {isMatchFinished && (
            <div className='absolute inset-0 bg-background/80 backdrop-blur-sm z-50 flex flex-col items-center justify-center animate-in zoom-in-95 duration-300'>
              <div className='text-center mb-12'>
                <h2 className='text-7xl font-black text-primary uppercase tracking-tight mb-4'>
                  {scoreL > scoreR ? playerLName : playerRName} {t('Wins!')}
                </h2>
                <div className='text-5xl text-foreground font-mono font-light'>
                  {scoreL} - {scoreR}
                </div>
              </div>

              <div className='grid grid-cols-2 gap-4 max-w-3xl w-full px-8'>
                <Button
                  size='lg'
                  className='h-16 text-xl rounded-2xl shadow-lg'
                  onClick={() => handleNextAction('next_swap')}
                >
                  {t('Swap Sides & Next [S]')}
                </Button>
                <Button
                  size='lg'
                  variant='secondary'
                  className='h-16 text-xl rounded-2xl shadow-lg'
                  onClick={() => handleNextAction('next_keep')}
                >
                  {t('Next Game [N]')}
                </Button>
                <Button
                  size='lg'
                  variant='outline'
                  className='h-16 text-xl rounded-2xl shadow-sm col-span-2 bg-background'
                  onClick={() => handleNextAction('rematch')}
                >
                  {t('Discard & Replay [Space]')}
                </Button>
                <Button
                  size='lg'
                  variant='destructive'
                  className='h-16 text-xl rounded-2xl shadow-sm'
                  onClick={() => setScoreL((prev) => Math.max(0, prev - 1))}
                >
                  {t('Undo Left Point [W]')}
                </Button>
                <Button
                  size='lg'
                  variant='destructive'
                  className='h-16 text-xl rounded-2xl shadow-sm'
                  onClick={() => setScoreR((prev) => Math.max(0, prev - 1))}
                >
                  {t('Undo Right Point [O]')}
                </Button>
                <Button
                  size='lg'
                  className='h-16 text-xl col-span-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl shadow-lg mt-4'
                  onClick={submitSeries}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <Loader2 className='animate-spin mr-2 h-6 w-6' />
                  ) : null}
                  {t(`Submit Series [${isMac ? 'Cmd' : 'Ctrl'}+Enter]`)}
                </Button>
              </div>
            </div>
          )}

          {!isMatchFinished && (
            <div className='absolute bottom-8 left-8 p-6 bg-card/80 backdrop-blur-md rounded-2xl border border-border text-sm text-muted-foreground space-y-2 z-10 shadow-xl'>
              <div className='font-bold text-foreground mb-4 uppercase tracking-widest'>
                {t('Manual Controls')}
              </div>
              <div className='grid grid-cols-2 gap-x-8 gap-y-2'>
                <div>
                  <strong className='text-foreground'>S</strong> : SWITCH SIDES
                </div>
                <div>
                  <strong className='text-foreground'>Q</strong> : LEFT +1
                </div>
                <div>
                  <strong className='text-foreground'>P</strong> : RIGHT +1
                </div>
                <div>
                  <strong className='text-foreground'>W</strong> : LEFT UNDO
                </div>
                <div>
                  <strong className='text-foreground'>O</strong> : RIGHT UNDO
                </div>
                <div className='col-span-2 pt-2 mt-2 border-t border-border/50'>
                  <strong className='text-foreground'>
                    {isMac ? 'Cmd + Enter' : 'Ctrl + Enter'}
                  </strong>{' '}
                  : SUBMIT SERIES
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {step === 'results' && matchResults && (
        <div className='flex flex-col w-full max-w-2xl bg-card border border-border rounded-[2rem] p-8 md:p-12 shadow-2xl animate-in zoom-in-95 duration-500 z-50'>
          <div className='flex items-center justify-center gap-3 mb-8 text-primary'>
            <Trophy className='h-10 w-10' />
            <h2 className='text-4xl font-extrabold uppercase tracking-tight text-foreground'>
              {t('Series Results')}
            </h2>
          </div>
          <div className='flex flex-col gap-3 mb-10'>
            {matchResults.updates.map((u, idx) => {
              const isPositive = u.eloDiff > 0;
              const isNeutral = u.eloDiff === 0;
              const isEpicGain = u.eloDiff >= 20;

              return (
                <div
                  key={idx}
                  className={`p-5 rounded-2xl flex items-center justify-between border transition-colors ${
                    isEpicGain
                      ? 'bg-accent/50 border-accent'
                      : 'bg-muted/50 border-border'
                  }`}
                >
                  <div className='flex flex-col'>
                    <span className='font-bold text-xl flex items-center gap-2 text-foreground'>
                      {u.name}
                      {isEpicGain && (
                        <Flame className='w-5 h-5 text-orange-500 fill-current animate-pulse' />
                      )}
                    </span>
                    {u.oldRank && u.newRank ? (
                      <div className='flex items-center gap-2 text-sm font-medium text-muted-foreground mt-1'>
                        <span>#{u.oldRank}</span>
                        <ArrowRight size={14} />
                        <span
                          className={
                            u.newRank < u.oldRank
                              ? 'text-emerald-500 font-bold'
                              : u.newRank > u.oldRank
                                ? 'text-destructive font-bold'
                                : 'text-foreground font-bold'
                          }
                        >
                          #{u.newRank}
                        </span>
                      </div>
                    ) : null}
                  </div>
                  <div className='text-right'>
                    <div
                      className={`font-black text-2xl flex items-center justify-end gap-1 ${
                        isPositive
                          ? 'text-emerald-500'
                          : isNeutral
                            ? 'text-muted-foreground'
                            : 'text-destructive'
                      }`}
                    >
                      {isPositive ? (
                        <ArrowUp size={24} />
                      ) : isNeutral ? (
                        <Minus size={20} />
                      ) : (
                        <ArrowDown size={24} />
                      )}
                      {u.eloDiff > 0
                        ? `+${Math.round(u.eloDiff)}`
                        : Math.round(u.eloDiff)}
                    </div>
                    <div className='text-sm font-medium text-muted-foreground mt-1'>
                      {Math.round(u.newElo)} Global
                    </div>
                    {u.roomElo && (
                      <div className='text-sm font-bold mt-0.5 text-primary'>
                        {Math.round(u.roomElo)} Room
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <Button
            size='lg'
            className='h-16 text-xl rounded-2xl w-full font-bold'
            onClick={onClose}
          >
            {t('Close Scoreboard [Enter]')}
          </Button>
        </div>
      )}
    </div>
  );
};

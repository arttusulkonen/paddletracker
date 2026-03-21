// src/components/FullscreenScoreboard.tsx
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
  playerLId: string;
  playerRId: string;
  playerLName: string;
  playerRName: string;
  scoreL: number;
  scoreR: number;
  matchTime: number;
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

  const [initialIds, setInitialIds] = useState<{ l: string; r: string } | null>(
    null,
  );

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
  const clickCountRef = useRef(0);
  const clickTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    if (typeof window !== 'undefined') {
      setIsMac(navigator.userAgent.toUpperCase().indexOf('MAC') >= 0);
    }
    return () => {
      document.body.style.overflow = '';
      if (clickTimeoutRef.current) clearTimeout(clickTimeoutRef.current);
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
        );
        const snap = await getDocs(q);

        const fetched: RoomWithId[] = [];
        snap.forEach((doc) => {
          const rData = doc.data() as Room;
          const history = rData.seasonHistory || [];
          const isSeasonFinished =
            history.length > 0 &&
            history[history.length - 1].type === 'seasonFinish';

          if (
            rData.isArchived !== true &&
            String(rData.isArchived) !== 'true' &&
            !isSeasonFinished
          ) {
            fetched.push({ ...rData, id: doc.id });
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
      String(lastActiveRoom.isArchived) !== 'true'
    ) {
      const match = rooms.find((r) => r.id === lastActiveRoom.id);
      if (match) {
        setSelectedRoom(match);
        return;
      }
    }

    if (!selectedRoom) setSelectedRoom(rooms[0]);
  }, [rooms, lastActiveRoom, selectedRoom]);

  const playerLName = useMemo(() => {
    if (!selectedRoom) return '...';
    return (
      selectedRoom.members?.find((m: any) => m.userId === playerLId)?.name ||
      'Player L'
    );
  }, [selectedRoom, playerLId]);

  const playerRName = useMemo(() => {
    if (!selectedRoom) return '...';
    return (
      selectedRoom.members?.find((m: any) => m.userId === playerRId)?.name ||
      'Player R'
    );
  }, [selectedRoom, playerRId]);

  const checkWinCondition = useCallback(
    (l: number, r: number) => {
      if (config && typeof (config as any).validateScore === 'function') {
        const res = (config as any).validateScore(l, r);
        return typeof res === 'boolean' ? res : !!res?.isValid;
      }
      return (l >= 11 || r >= 11) && Math.abs(l - r) >= 2;
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

  const intensity = useMemo(() => {
    if (isMatchFinished) return 'normal';

    const maxScore = Math.max(scoreL, scoreR);
    const minScore = Math.min(scoreL, scoreR);
    const diff = maxScore - minScore;

    if (minScore >= 13 && diff <= 1) {
      return 'high_voltage';
    }

    if (scoreL >= 9 && scoreR >= 9 && diff === 0) {
      return 'critical_tie';
    }

    return 'normal';
  }, [scoreL, scoreR, isMatchFinished]);

  const intensityClasses = {
    normal: 'text-foreground',
    critical_tie: 'text-foreground drop-shadow-[0_0_25px_rgba(59,130,246,0.6)]',
    high_voltage: 'text-foreground drop-shadow-[0_0_35px_rgba(245,158,11,0.7)]',
  };

  const gamesWonL = useMemo(() => {
    return matchHistory.filter((m) => {
      const pLWin = m.scoreL > m.scoreR;
      const pRWin = m.scoreR > m.scoreL;
      return (
        (m.playerLId === playerLId && pLWin) ||
        (m.playerRId === playerLId && pRWin)
      );
    }).length;
  }, [matchHistory, playerLId]);

  const gamesWonR = useMemo(() => {
    return matchHistory.filter((m) => {
      const pLWin = m.scoreL > m.scoreR;
      const pRWin = m.scoreR > m.scoreL;
      return (
        (m.playerLId === playerRId && pLWin) ||
        (m.playerRId === playerRId && pRWin)
      );
    }).length;
  }, [matchHistory, playerRId]);

  const playerLHistoryStatus = useMemo(() => {
    return matchHistory.map((m) => {
      const pLWin = m.scoreL > m.scoreR;
      const pRWin = m.scoreR > m.scoreL;
      if (m.playerLId === playerLId && pLWin) return 'win';
      if (m.playerRId === playerLId && pRWin) return 'win';
      if (m.playerLId === playerLId && !pLWin) return 'loss';
      if (m.playerRId === playerLId && !pRWin) return 'loss';
      return 'none';
    });
  }, [matchHistory, playerLId]);

  const playerRHistoryStatus = useMemo(() => {
    return matchHistory.map((m) => {
      const pLWin = m.scoreL > m.scoreR;
      const pRWin = m.scoreR > m.scoreL;
      if (m.playerLId === playerRId && pLWin) return 'win';
      if (m.playerRId === playerRId && pRWin) return 'win';
      if (m.playerLId === playerRId && !pLWin) return 'loss';
      if (m.playerRId === playerRId && !pRWin) return 'loss';
      return 'none';
    });
  }, [matchHistory, playerRId]);

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
        colors: ['#3b82f6', '#ef4444', '#10b981', '#f59e0b'],
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
    if (
      !selectedRoom?.id ||
      (matchHistory.length === 0 && scoreL === 0 && scoreR === 0)
    )
      return;
    if (!isMatchFinished && (scoreL > 0 || scoreR > 0)) {
      toast({
        title: t('Finish the set before submitting'),
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
        matchTime: h.matchTime,
      }));
      if (scoreL > 0 || scoreR > 0)
        drafts.push({
          player1Name: playerLName,
          player2Name: playerRName,
          score1: scoreL,
          score2: scoreR,
          matchTime: time,
        });
      const response = await saveFunc({
        matches: drafts,
        roomId: selectedRoom.id,
      });
      setMatchResults(response.data as MatchResultData);
      window.dispatchEvent(new Event('match-recorded'));
      setStep('results');
    } catch (e: any) {
      toast({
        title: t('Error'),
        description: e.message,
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
    time,
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
            playerLId,
            playerRId,
            playerLName,
            playerRName,
            scoreL,
            scoreR,
            matchTime: time,
          },
        ]);
      }
      setScoreL(0);
      setScoreR(0);
      setTime(0);
      if (action === 'next_swap') {
        const oldL = playerLId;
        setPlayerLId(playerRId);
        setPlayerRId(oldL);
      }
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = setInterval(() => setTime((v) => v + 1), 1000);
    },
    [playerLId, playerRId, playerLName, playerRName, scoreL, scoreR, time],
  );

  const onCloseReset = useCallback(() => {
    setMatchHistory([]);
    onClose();
  }, [onClose]);

  const cbsRef = useRef({
    submitSeries,
    handleNextAction,
    onClose: onCloseReset,
  });
  useEffect(() => {
    cbsRef.current = { submitSeries, handleNextAction, onClose: onCloseReset };
  }, [submitSeries, handleNextAction, onCloseReset]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.repeat) return;

      const active = document.activeElement?.tagName.toLowerCase();
      if (active === 'input' || active === 'textarea' || active === 'select')
        return;

      const cur = stateRef.current;
      const cbs = cbsRef.current;

      if (cur.step === 'setup') return;
      if (cur.step === 'results') {
        if (['Enter', 'Space', 'Escape'].includes(e.code)) {
          e.preventDefault();
          cbs.onClose();
        }
        return;
      }

      const isSubmitShortcut =
        (isMac && e.metaKey && e.code === 'Enter') ||
        (!isMac && e.ctrlKey && e.code === 'Enter');

      if (isSubmitShortcut) {
        e.preventDefault();
        if (!cur.isSubmitting) {
          if (cur.isMatchFinished || (cur.scoreL === 0 && cur.scoreR === 0)) {
            cbs.submitSeries();
          }
        }
        return;
      }

      if (cur.step === 'waiting') {
        if (e.code === 'Space' || e.code === 'Enter') {
          e.preventDefault();
          setStep('match');
          setScoreL(0);
          setScoreR(0);
          setTime(0);
          timerRef.current = setInterval(() => setTime((v) => v + 1), 1000);
        }
        return;
      }

      if (cur.step === 'match' && cur.isMatchFinished) {
        if (e.code === 'Space') {
          e.preventDefault();
          cbs.handleNextAction('rematch');
        } else if (
          e.code === 'KeyS' ||
          e.code === 'Enter' ||
          e.code === 'NumpadEnter'
        ) {
          e.preventDefault();
          cbs.handleNextAction('next_swap');
        } else if (e.code === 'KeyN') {
          e.preventDefault();
          cbs.handleNextAction('next_keep');
        } else if (e.code === 'KeyW') {
          e.preventDefault();
          setScoreL((v) => Math.max(0, v - 1));
          if (!timerRef.current)
            timerRef.current = setInterval(() => setTime((v) => v + 1), 1000);
        } else if (e.code === 'KeyO') {
          e.preventDefault();
          setScoreR((v) => Math.max(0, v - 1));
          if (!timerRef.current)
            timerRef.current = setInterval(() => setTime((v) => v + 1), 1000);
        }
        return;
      }

      if (cur.step === 'match' && !cur.isMatchFinished) {
        if (e.code === 'Enter' || e.code === 'NumpadEnter') {
          e.preventDefault();
          clickCountRef.current += 1;

          if (clickTimeoutRef.current) clearTimeout(clickTimeoutRef.current);

          clickTimeoutRef.current = setTimeout(() => {
            const clicks = clickCountRef.current;
            clickCountRef.current = 0;

            if (clicks === 1) {
              setScoreR((v) => v + 1);
            } else if (clicks === 2) {
              setScoreL((v) => v + 1);
            } else if (clicks === 3) {
              setScoreR((v) => Math.max(0, v - 1));
            } else if (clicks >= 4) {
              setScoreL((v) => Math.max(0, v - 1));
            }
          }, 350);
          return;
        }

        if (e.code === 'KeyQ') setScoreL((v) => v + 1);
        else if (e.code === 'KeyP') setScoreR((v) => v + 1);
        else if (e.code === 'KeyW') setScoreL((v) => Math.max(0, v - 1));
        else if (e.code === 'KeyO') setScoreR((v) => Math.max(0, v - 1));
        else if (e.code === 'KeyS') {
          setScoreL(cur.scoreR);
          setScoreR(cur.scoreL);
          setPlayerLId(cur.playerRId);
          setPlayerRId(cur.playerLId);
        }
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isMac]);

  return (
    <div className='fixed inset-0 z-[100] bg-background flex flex-col items-center justify-center overflow-hidden animate-in fade-in duration-500'>
      <div className='absolute inset-0 bg-gradient-to-br from-background via-background to-primary/5 pointer-events-none' />

      <Button
        variant='ghost'
        size='icon'
        onClick={onCloseReset}
        className='absolute top-6 right-6 h-14 w-14 rounded-full bg-card/40 backdrop-blur-xl border border-border/50 hover:bg-muted z-50 transition-all hover:rotate-90'
        aria-label={t('Close')}
      >
        <X className='h-6 w-6' />
      </Button>

      {step === 'setup' && (
        <div className='w-full max-w-xl space-y-12 p-10 relative z-10 bg-card/30 backdrop-blur-2xl rounded-[3rem] border border-border/50 shadow-2xl'>
          <div className='text-center space-y-4'>
            <h2 className='text-6xl font-black tracking-tighter uppercase italic text-primary'>
              {t('Arena')}
            </h2>
            <p className='text-muted-foreground font-bold tracking-widest uppercase text-xs'>
              {t('Match Configuration')}
            </p>
          </div>
          <div className='space-y-6'>
            <div className='space-y-3'>
              <label
                htmlFor='roomId'
                className='text-[10px] font-black text-muted-foreground uppercase tracking-[0.3em] pl-2'
              >
                {t('Select Arena')}
              </label>
              <select
                id='roomId'
                name='roomId'
                value={selectedRoom?.id || ''}
                onChange={(e) => {
                  const r = rooms.find((room) => room.id === e.target.value);
                  if (r) {
                    setSelectedRoom(r);
                    setPlayerLId('');
                    setPlayerRId('');
                  }
                }}
                className='w-full p-5 bg-background/50 rounded-2xl border-2 border-border/50 text-xl font-bold outline-none cursor-pointer focus:ring-4 focus:ring-primary/20 transition-all'
              >
                <option value='' disabled>
                  {t('Choose Room...')}
                </option>
                {rooms.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </div>

            <div className='grid grid-cols-2 gap-6'>
              <div className='space-y-3'>
                <label
                  htmlFor='playerLId'
                  className='text-[10px] font-black text-blue-500 uppercase tracking-[0.3em] pl-2'
                >
                  {t('Blue Corner')}
                </label>
                <select
                  id='playerLId'
                  name='playerLId'
                  value={playerLId}
                  onChange={(e) => setPlayerLId(e.target.value)}
                  disabled={!selectedRoom}
                  className='w-full p-5 bg-background/50 rounded-2xl border-2 border-blue-500/20 text-lg font-bold outline-none cursor-pointer focus:ring-4 focus:ring-blue-500/20 transition-all'
                >
                  <option value='' disabled>
                    {t('Select Player')}
                  </option>
                  {selectedRoom?.members?.map((m: any) => (
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
              <div className='space-y-3'>
                <label
                  htmlFor='playerRId'
                  className='text-[10px] font-black text-red-500 uppercase tracking-[0.3em] pl-2'
                >
                  {t('Red Corner')}
                </label>
                <select
                  id='playerRId'
                  name='playerRId'
                  value={playerRId}
                  onChange={(e) => setPlayerRId(e.target.value)}
                  disabled={!selectedRoom}
                  className='w-full p-5 bg-background/50 rounded-2xl border-2 border-red-500/20 text-lg font-bold outline-none cursor-pointer focus:ring-4 focus:ring-red-500/20 transition-all'
                >
                  <option value='' disabled>
                    {t('Select Player')}
                  </option>
                  {selectedRoom?.members?.map((m: any) => (
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
              className='w-full h-20 text-2xl font-black uppercase tracking-widest rounded-2xl mt-8 shadow-[0_20px_50px_rgba(var(--primary),0.2)] hover:scale-[1.02] transition-all bg-primary'
              onClick={() => {
                setStep('waiting');
                setInitialIds({ l: playerLId, r: playerRId });
              }}
              disabled={!selectedRoom || !playerLId || !playerRId}
            >
              {t('Initialize Arena')}
            </Button>
          </div>
        </div>
      )}

      {step === 'waiting' && (
        <div className='text-center space-y-16 relative z-10 w-full max-w-6xl px-8'>
          <div className='inline-block bg-primary/10 px-10 py-3 rounded-full border border-primary/20'>
            <h2 className='text-2xl font-black text-primary uppercase tracking-[0.4em]'>
              {selectedRoom?.name}
            </h2>
          </div>
          <div className='space-y-8'>
            <h1 className='text-9xl font-black text-foreground uppercase tracking-tighter animate-pulse drop-shadow-2xl italic'>
              {t('Ready')}
            </h1>
            <p className='text-4xl text-primary font-black tracking-[0.5em] uppercase border-y border-primary/20 py-6'>
              {t('Press [Space] to start')}
            </p>
          </div>
          <div className='grid grid-cols-2 gap-20 text-6xl font-black uppercase italic pt-12'>
            <div className='flex flex-col items-center gap-6'>
              <span className='text-blue-500 drop-shadow-[0_0_20px_rgba(59,130,246,0.5)]'>
                {playerLName}
              </span>
              <span className='text-xs font-black tracking-[1em] text-muted-foreground/40 not-italic uppercase'>
                {t('Blue Corner')}
              </span>
            </div>
            <div className='flex flex-col items-center gap-6'>
              <span className='text-red-500 drop-shadow-[0_0_20px_rgba(239,68,68,0.5)]'>
                {playerRName}
              </span>
              <span className='text-xs font-black tracking-[1em] text-muted-foreground/40 not-italic uppercase'>
                {t('Red Corner')}
              </span>
            </div>
          </div>
        </div>
      )}

      {step === 'match' && (
        <div className='w-full h-full flex flex-col relative'>
          <div className='flex-none flex flex-col items-center pt-10 pb-6 z-10 w-full'>
            <div className='flex flex-wrap justify-center gap-4 mb-8 px-6'>
              {matchHistory.map((m, i) => (
                <div
                  key={i}
                  className='bg-card/60 backdrop-blur-xl border border-border/50 px-5 py-2.5 rounded-2xl text-xs font-black shadow-xl flex items-center gap-4 group hover:scale-105 transition-transform'
                >
                  <span
                    className={`${m.playerLId === initialIds?.l ? 'text-blue-500' : 'text-red-500'}`}
                  >
                    {m.playerLName}
                  </span>
                  <div className='bg-background/80 px-3 py-1 rounded-lg font-mono text-base tracking-tighter'>
                    <span className={m.scoreL > m.scoreR ? 'text-primary' : ''}>
                      {m.scoreL}
                    </span>
                    <span className='text-muted-foreground mx-1'>:</span>
                    <span className={m.scoreR > m.scoreL ? 'text-primary' : ''}>
                      {m.scoreR}
                    </span>
                  </div>
                  <span
                    className={`${m.playerRId === initialIds?.l ? 'text-blue-500' : 'text-red-500'}`}
                  >
                    {m.playerRName}
                  </span>
                </div>
              ))}
            </div>

            <div className='flex items-center gap-10'>
              <div className='flex flex-col items-end'>
                <span className='text-[10px] font-black uppercase tracking-widest text-muted-foreground'>
                  {t('Arena')}
                </span>
                <span className='text-xl font-black uppercase tracking-tighter opacity-50'>
                  {selectedRoom?.name}
                </span>
              </div>
              <div className='h-12 w-px bg-border/50' />
              <div className='bg-primary text-primary-foreground px-10 py-3 rounded-full text-lg font-black uppercase tracking-[0.3em] shadow-lg'>
                {t('Game')} {matchHistory.length + 1}
              </div>
              <div className='h-12 w-px bg-border/50' />
              <div className='flex flex-col items-start'>
                <span className='text-[10px] font-black uppercase tracking-widest text-muted-foreground'>
                  {t('Time')}
                </span>
                <span className='text-3xl font-mono font-light tracking-tighter tabular-nums opacity-80'>
                  {formatTime(time)}
                </span>
              </div>
            </div>
          </div>

          <div className='flex-1 flex items-center justify-center w-full z-10 relative'>
            <div className='absolute inset-0 flex items-center justify-center pointer-events-none opacity-[0.03] text-[40vw] font-black italic select-none'>
              VS
            </div>

            <div className='flex-1 h-full flex flex-col items-center justify-center relative px-12 group'>
              <div className='flex flex-col items-center mb-10 transition-transform group-hover:-translate-y-2'>
                <h3
                  className={`text-6xl lg:text-8xl font-black uppercase tracking-tighter mb-6 ${playerLId === initialIds?.l ? 'text-blue-500 drop-shadow-[0_0_20px_rgba(59,130,246,0.3)]' : 'text-red-500 drop-shadow-[0_0_20px_rgba(239,68,68,0.3)]'}`}
                >
                  {playerLName}
                </h3>
                <div className='flex gap-3'>
                  {Array.from({ length: 4 }).map((_, i) => {
                    const status = playerLHistoryStatus[i];
                    const colorClass =
                      status === 'win'
                        ? 'bg-emerald-500 border-emerald-400 shadow-[0_0_15px_#10b981]'
                        : status === 'loss'
                          ? 'bg-red-500 border-red-400 shadow-[0_0_15px_#ef4444]'
                          : 'bg-transparent border-muted-foreground/20';
                    return (
                      <div
                        key={i}
                        className={`h-4 w-4 rounded-full border-2 transition-all duration-700 ${colorClass}`}
                      />
                    );
                  })}
                </div>
              </div>
              <div
                className={`text-[min(28vw,38vh)] leading-none font-black font-mono tracking-tighter tabular-nums transition-all duration-500 ${isMatchFinished && scoreL > scoreR ? 'text-primary scale-110 drop-shadow-[0_0_60px_rgba(var(--primary),0.5)]' : intensityClasses[intensity as keyof typeof intensityClasses]}`}
              >
                {scoreL}
              </div>
            </div>

            <div className='flex-1 h-full flex flex-col items-center justify-center relative px-12 group'>
              <div className='flex flex-col items-center mb-10 transition-transform group-hover:-translate-y-2'>
                <h3
                  className={`text-6xl lg:text-8xl font-black uppercase tracking-tighter mb-6 ${playerRId === initialIds?.l ? 'text-blue-500 drop-shadow-[0_0_20px_rgba(59,130,246,0.3)]' : 'text-red-500 drop-shadow-[0_0_20px_rgba(239,68,68,0.3)]'}`}
                >
                  {playerRName}
                </h3>
                <div className='flex gap-3'>
                  {Array.from({ length: 4 }).map((_, i) => {
                    const status = playerRHistoryStatus[i];
                    const colorClass =
                      status === 'win'
                        ? 'bg-emerald-500 border-emerald-400 shadow-[0_0_15px_#10b981]'
                        : status === 'loss'
                          ? 'bg-red-500 border-red-400 shadow-[0_0_15px_#ef4444]'
                          : 'bg-transparent border-muted-foreground/20';
                    return (
                      <div
                        key={i}
                        className={`h-4 w-4 rounded-full border-2 transition-all duration-700 ${colorClass}`}
                      />
                    );
                  })}
                </div>
              </div>
              <div
                className={`text-[min(28vw,38vh)] leading-none font-black font-mono tracking-tighter tabular-nums transition-all duration-500 ${isMatchFinished && scoreR > scoreL ? 'text-primary scale-110 drop-shadow-[0_0_60px_rgba(var(--primary),0.5)]' : intensityClasses[intensity as keyof typeof intensityClasses]}`}
              >
                {scoreR}
              </div>
            </div>
          </div>

          <div className='absolute bottom-10 left-10 z-50 group'>
            <div className='absolute bottom-full left-0 mb-4 p-8 bg-card/90 backdrop-blur-3xl rounded-[2.5rem] border border-border shadow-2xl min-w-[340px] opacity-0 translate-y-4 pointer-events-none group-hover:opacity-100 group-hover:translate-y-0 group-hover:pointer-events-auto group-focus-within:opacity-100 group-focus-within:translate-y-0 group-focus-within:pointer-events-auto transition-all duration-300 origin-bottom-left'>
              <div className='flex items-center gap-3 mb-6'>
                <div className='h-3 w-3 rounded-full bg-emerald-500 animate-pulse' />
                <h4 className='text-xs font-black uppercase tracking-[0.2em] text-foreground'>
                  {isMatchFinished ? t('Post-Match') : t('Smart Remote')}
                </h4>
              </div>
              <div className='grid grid-cols-1 gap-y-4 font-mono'>
                {!isMatchFinished ? (
                  <>
                    <div className='flex justify-between items-center gap-6 text-xs'>
                      <span className='text-muted-foreground font-bold uppercase'>
                        {t('Right +1')}
                      </span>
                      <kbd className='bg-primary/20 px-3 py-1 rounded border-b-2 border-primary/40 font-black text-primary'>
                        1 Click
                      </kbd>
                    </div>
                    <div className='flex justify-between items-center gap-6 text-xs'>
                      <span className='text-muted-foreground font-bold uppercase'>
                        {t('Left +1')}
                      </span>
                      <kbd className='bg-primary/20 px-3 py-1 rounded border-b-2 border-primary/40 font-black text-primary'>
                        2 Clicks
                      </kbd>
                    </div>
                    <div className='flex justify-between items-center gap-6 text-xs'>
                      <span className='text-muted-foreground font-bold uppercase'>
                        {t('Undo Right')}
                      </span>
                      <kbd className='bg-muted px-3 py-1 rounded border-b-2 border-border font-black text-muted-foreground'>
                        3 Clicks
                      </kbd>
                    </div>
                    <div className='flex justify-between items-center gap-6 text-xs'>
                      <span className='text-muted-foreground font-bold uppercase'>
                        {t('Undo Left')}
                      </span>
                      <kbd className='bg-muted px-3 py-1 rounded border-b-2 border-border font-black text-muted-foreground'>
                        4 Clicks
                      </kbd>
                    </div>
                    <div className='flex justify-between items-center gap-6 text-xs pt-2 border-t border-border/50'>
                      <span className='text-muted-foreground/50 font-bold uppercase'>
                        {t('Keyboard')}
                      </span>
                      <span className='font-black text-muted-foreground/50'>
                        Q / P / S
                      </span>
                    </div>
                  </>
                ) : (
                  <>
                    <div className='flex justify-between items-center gap-6 text-xs'>
                      <span className='text-indigo-400 font-black uppercase'>
                        {t('Swap & Next')}
                      </span>
                      <kbd className='bg-indigo-500/20 px-3 py-1 rounded border-b-2 border-indigo-500 text-indigo-400 font-black'>
                        Enter
                      </kbd>
                    </div>
                    <div className='flex justify-between items-center gap-6 text-xs'>
                      <span className='text-emerald-400 font-black uppercase'>
                        {t('Stay & Next')}
                      </span>
                      <kbd className='bg-emerald-500/20 px-3 py-1 rounded border-b-2 border-emerald-500 text-emerald-400 font-black'>
                        N
                      </kbd>
                    </div>
                  </>
                )}
                <div className='mt-4 pt-6 border-t border-border flex flex-col gap-2'>
                  <span className='text-[10px] font-black text-muted-foreground uppercase tracking-widest'>
                    {t('Save Match Series')}
                  </span>
                  <div className='flex items-center gap-2 font-black text-primary italic'>
                    <span className='text-lg'>
                      {isMac ? '⌘' : 'Ctrl'} + Enter
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <button className='p-4 bg-card/90 backdrop-blur-3xl rounded-full border border-border shadow-2xl flex items-center gap-3 cursor-pointer hover:bg-muted focus:outline-none focus:ring-4 focus:ring-primary/50 transition-all w-max'>
              <div className='h-3 w-3 rounded-full bg-emerald-500 animate-pulse' />
              <span className='text-xs font-black uppercase tracking-[0.2em] pr-2'>
                {isMatchFinished ? t('Post-Match') : t('Remote')}
              </span>
            </button>
          </div>

          {isMatchFinished && (
            <div className='absolute inset-0 bg-background/60 backdrop-blur-md z-40 flex flex-col items-center justify-center animate-in zoom-in-95 duration-500'>
              <div className='bg-card border border-border/50 p-16 rounded-[4rem] shadow-[0_0_100px_rgba(0,0,0,0.4)] flex flex-col items-center text-center max-w-2xl w-full mx-4 relative overflow-hidden'>
                <div className='absolute top-0 left-0 w-full h-1.5 bg-primary shadow-[0_0_15px_rgba(var(--primary),0.5)]' />
                <Trophy className='w-20 h-20 text-primary mb-8 animate-bounce' />
                <h2 className='text-6xl font-black text-foreground uppercase tracking-tighter mb-4'>
                  {scoreL > scoreR ? playerLName : playerRName}
                </h2>
                <p className='text-2xl font-black text-primary uppercase tracking-[0.3em] mb-12'>
                  {t('Set Victory')}
                </p>

                <div className='grid grid-cols-2 gap-4 w-full'>
                  <Button
                    size='lg'
                    className='h-16 text-lg font-black uppercase rounded-2xl'
                    onClick={() => handleNextAction('next_swap')}
                  >
                    {t('Swap & Next [Enter]')}
                  </Button>
                  <Button
                    size='lg'
                    variant='secondary'
                    className='h-16 text-lg font-black uppercase rounded-2xl'
                    onClick={() => handleNextAction('next_keep')}
                  >
                    {t('Stay & Next [N]')}
                  </Button>
                  <Button
                    size='lg'
                    variant='outline'
                    className='h-16 text-lg font-bold rounded-2xl col-span-2'
                    onClick={() => handleNextAction('rematch')}
                  >
                    {t('Discard & Replay [Space]')}
                  </Button>

                  <Button
                    size='lg'
                    className='h-20 text-2xl font-black uppercase col-span-2 bg-emerald-600 hover:bg-emerald-500 mt-6 rounded-2xl shadow-xl'
                    onClick={submitSeries}
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? (
                      <Loader2 className='animate-spin mr-3 h-8 w-8' />
                    ) : null}
                    {t('Submit Final Series')}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {step === 'results' && matchResults && (
        <div className='flex flex-col w-full max-w-3xl bg-card border border-border rounded-[3rem] p-12 md:p-16 shadow-2xl animate-in zoom-in-95 duration-500 z-50 backdrop-blur-3xl relative overflow-hidden'>
          <div className='absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-blue-500 via-primary to-red-500' />
          <div className='flex items-center justify-center gap-5 mb-12 text-primary'>
            <Trophy className='h-14 w-14' />
            <h2 className='text-6xl font-black uppercase tracking-tighter text-foreground'>
              {t('Report')}
            </h2>
          </div>

          <div className='flex flex-col gap-4 mb-14'>
            {matchResults.updates.map((u, idx) => {
              const isPositive = u.eloDiff > 0;
              const isNeutral = u.eloDiff === 0;
              const isEpic = u.eloDiff >= 20;
              return (
                <div
                  key={idx}
                  className={`p-8 rounded-[2.5rem] flex items-center justify-between border transition-all ${isEpic ? 'bg-primary/10 border-primary/40 shadow-lg' : 'bg-muted/40 border-border/50'}`}
                >
                  <div className='flex flex-col gap-2'>
                    <span className='font-black text-3xl text-foreground tracking-tight flex items-center gap-4'>
                      {u.name}{' '}
                      {isEpic && (
                        <Flame className='w-8 h-8 text-primary fill-current animate-pulse' />
                      )}
                    </span>
                    {u.oldRank && u.newRank && (
                      <div className='flex items-center gap-3 text-xs font-black text-muted-foreground uppercase tracking-widest'>
                        <span>#{u.oldRank}</span> <ArrowRight size={16} />{' '}
                        <span
                          className={
                            u.newRank < u.oldRank
                              ? 'text-emerald-500'
                              : 'text-destructive'
                          }
                        >
                          #{u.newRank}
                        </span>
                      </div>
                    )}
                  </div>
                  <div className='text-right'>
                    <div
                      className={`font-black text-5xl flex items-center justify-end gap-1 tracking-tighter ${isPositive ? 'text-emerald-500' : isNeutral ? 'text-muted-foreground' : 'text-destructive'}`}
                    >
                      {isPositive ? (
                        <ArrowUp size={36} />
                      ) : isNeutral ? (
                        <Minus size={30} />
                      ) : (
                        <ArrowDown size={36} />
                      )}
                      {Math.round(Math.abs(u.eloDiff))}
                    </div>
                    <div className='text-xs font-black text-muted-foreground uppercase mt-3 tracking-widest'>
                      <span className='text-foreground text-sm mr-2'>
                        {Math.round(u.newElo)}
                      </span>{' '}
                      GBL
                      {u.roomElo && (
                        <>
                          <span className='mx-3 opacity-20'>|</span>
                          <span className='text-primary text-sm mr-2'>
                            {Math.round(u.roomElo)}
                          </span>{' '}
                          RM
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <Button
            size='lg'
            className='h-20 text-2xl rounded-3xl w-full font-black uppercase tracking-[0.2em] shadow-2xl hover:scale-[1.02] transition-transform'
            onClick={onCloseReset}
          >
            {t('Exit Arena')}
          </Button>
        </div>
      )}
    </div>
  );
};

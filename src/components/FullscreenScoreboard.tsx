'use client';

import { createSessionPairing } from '@/app/actions/garminPairing';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { useSport } from '@/contexts/SportContext';
import { useToast } from '@/hooks/use-toast';
import { useLiveMatch } from '@/hooks/useLiveMatch';
import { app, db } from '@/lib/firebase';
import type { Room } from '@/lib/types';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { X } from 'lucide-react';
import React, {
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import { MatchPhase } from './scoreboard/MatchPhase';
import { ResultsPhase } from './scoreboard/ResultsPhase';
import { SetupPhase } from './scoreboard/SetupPhase';
import { WaitingPhase } from './scoreboard/WaitingPhase';

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

type MatchChronicleEntry = {
  gameNumber: number;
  player1Id: string;
  player2Id: string;
  player1EloBefore: number;
  player2EloBefore: number;
  player1BaseDelta: number;
  player2BaseDelta: number;
  player1Delta: number;
  player2Delta: number;
  bountyApplied: number;
  nemesisApplied: boolean;
  streakContinued: number;
};

type MatchResultData = {
  updates: PlayerUpdate[];
  chronicle?: MatchChronicleEntry[];
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
  const [isGarminEnabled, setIsGarminEnabled] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [pairingPin, setPairingPin] = useState<string | null>(null);
  const [isPairingLoading, setIsPairingLoading] = useState(false);

  const { matchState, updateScore, initMatch, clearMatch } =
    useLiveMatch(sessionId);

  const scoreL = matchState.scoreL;
  const scoreR = matchState.scoreR;
  const currentServerSide = matchState.server;

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
    isSubmitting,
    scoreL,
    scoreR,
    playerLId,
    playerRId,
    currentServerSide,
  });

  const startTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    setTime(0);
    timerRef.current = setInterval(() => setTime((v) => v + 1), 1000);
  }, []);

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
          collection(db!, config.collections.rooms),
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

  const isDerbyMode = selectedRoom?.mode === 'derby';

  const sessionGames = useMemo(() => {
    if (step !== 'results' || !selectedRoom) return [];

    return matchHistory.map((g, i) => {
      const cInfo = matchResults?.chronicle?.[i];
      const isLWinner = g.scoreL > g.scoreR;
      const winnerId = isLWinner ? g.playerLId : g.playerRId;

      let chronicleData = null;

      if (cInfo) {
        const isP1L = cInfo.player1Id === g.playerLId;
        chronicleData = {
          pLEloBefore: isP1L ? cInfo.player1EloBefore : cInfo.player2EloBefore,
          pREloBefore: isP1L ? cInfo.player2EloBefore : cInfo.player1EloBefore,
          pLBaseDelta: isP1L ? cInfo.player1BaseDelta : cInfo.player2BaseDelta,
          pRBaseDelta: isP1L ? cInfo.player2BaseDelta : cInfo.player1BaseDelta,
          pLDelta: isP1L ? cInfo.player1Delta : cInfo.player2Delta,
          pRDelta: isP1L ? cInfo.player2Delta : cInfo.player1Delta,
          bountyApplied: cInfo.bountyApplied || 0,
          nemesisApplied: cInfo.nemesisApplied || false,
          streakContinued: cInfo.streakContinued || 0,
        };
      }

      return {
        ...g,
        gameNumber: i + 1,
        winnerId,
        chronicleData,
      };
    });
  }, [step, selectedRoom, matchHistory, matchResults]);

  useEffect(() => {
    stateRef.current = {
      step,
      isSubmitting,
      scoreL,
      scoreR,
      playerLId,
      playerRId,
      currentServerSide,
    };
  }, [
    step,
    isSubmitting,
    scoreL,
    scoreR,
    playerLId,
    playerRId,
    currentServerSide,
  ]);

  useEffect(() => {
    if (isMatchFinished) {
      import('canvas-confetti')
        .then((module) => {
          const confetti = module.default;
          confetti({
            particleCount: 150,
            spread: 80,
            origin: { y: 0.6 },
            colors: ['#3b82f6', '#ef4444', '#10b981', '#f59e0b'],
          });
        })
        .catch((error) => {
          console.error(error);
        });
    }
  }, [isMatchFinished]);

  useEffect(() => {
    if (isMatchFinished && timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, [isMatchFinished]);

  const handleInitializeArena = async () => {
    if (!selectedRoom || !playerLId || !playerRId) return;

    if (isGarminEnabled) {
      setIsPairingLoading(true);
      try {
        const res = await createSessionPairing();
        if (res && res.success && res.sessionId && res.pin) {
          setSessionId(res.sessionId);
          setPairingPin(res.pin);
          setInitialIds({ l: playerLId, r: playerRId });
          setStep('waiting');
        } else {
          toast({
            title: t('Error creating session'),
            description: res?.error || t('Unknown error'),
            variant: 'destructive',
          });
        }
      } catch (e: any) {
        toast({
          title: t('Error'),
          description: e.message,
          variant: 'destructive',
        });
      } finally {
        setIsPairingLoading(false);
      }
    } else {
      setInitialIds({ l: playerLId, r: playerRId });
      setStep('waiting');
    }
  };

  const handleServerSelection = useCallback(
    (side: 'L' | 'R') => {
      initMatch({
        scoreL: 0,
        scoreR: 0,
        server: side,
        last_updated: Date.now(),
        matchStarted: true,
        deviceConnected: true,
      });
      setStep('match');
      startTimer();
    },
    [initMatch, startTimer],
  );

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
      const finalGames = [...matchHistory];
      if (scoreL > 0 || scoreR > 0 || isMatchFinished) {
        finalGames.push({
          playerLId,
          playerRId,
          playerLName,
          playerRName,
          scoreL,
          scoreR,
          matchTime: time,
        });
      }

      const functions = getFunctions(app ?? undefined, 'europe-west1');
      const saveFunc = httpsCallable(functions, 'aiSaveMatch');
      const drafts = finalGames.map((h) => ({
        player1Name: h.playerLName,
        player2Name: h.playerRName,
        score1: h.scoreL,
        score2: h.scoreR,
        matchTime: h.matchTime,
      }));

      const response = await saveFunc({
        matches: drafts,
        roomId: selectedRoom.id,
      });

      setMatchHistory(finalGames);
      await clearMatch();

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
    playerLId,
    playerRId,
    playerLName,
    playerRName,
    selectedRoom,
    isMatchFinished,
    time,
    app,
    t,
    toast,
    clearMatch,
  ]);

  const handleNextAction = useCallback(
    async (action: 'next_swap' | 'next_keep' | 'rematch') => {
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

      startTimer();

      if (action === 'next_swap') {
        const oldL = playerLId;
        setPlayerLId(playerRId);
        setPlayerRId(oldL);
        await updateScore({ scoreL: 0, scoreR: 0 });
      } else if (action === 'next_keep') {
        await updateScore({
          scoreL: 0,
          scoreR: 0,
          server: currentServerSide === 'L' ? 'R' : 'L',
        });
      } else {
        await updateScore({ scoreL: 0, scoreR: 0 });
      }

      setStep('match');
    },
    [
      playerLId,
      playerRId,
      playerLName,
      playerRName,
      scoreL,
      scoreR,
      time,
      currentServerSide,
      startTimer,
      updateScore,
    ],
  );

  const onCloseReset = useCallback(async () => {
    setMatchHistory([]);
    await clearMatch();
    onClose();
  }, [onClose, clearMatch]);

  const cbsRef = useRef({
    submitSeries,
    handleNextAction,
    onClose: onCloseReset,
    handleServerSelection,
  });
  useEffect(() => {
    cbsRef.current = {
      submitSeries,
      handleNextAction,
      onClose: onCloseReset,
      handleServerSelection,
    };
  }, [submitSeries, handleNextAction, onCloseReset, handleServerSelection]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.repeat) return;

      const active = document.activeElement?.tagName.toLowerCase();
      if (active === 'input' || active === 'textarea' || active === 'select')
        return;

      const cur = stateRef.current;
      const cbs = cbsRef.current;
      const isFin = checkWinCondition(cur.scoreL, cur.scoreR);

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
          if (isFin || (cur.scoreL === 0 && cur.scoreR === 0)) {
            cbs.submitSeries();
          }
        }
        return;
      }

      if (cur.step === 'waiting') {
        if (e.code === 'ArrowLeft' || e.code === 'KeyQ') {
          e.preventDefault();
          cbs.handleServerSelection('L');
        } else if (e.code === 'ArrowRight' || e.code === 'KeyP') {
          e.preventDefault();
          cbs.handleServerSelection('R');
        }
        return;
      }

      if (cur.step === 'match' && isFin) {
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
          updateScore({ scoreL: Math.max(0, cur.scoreL - 1) });
          if (!timerRef.current)
            timerRef.current = setInterval(() => setTime((v) => v + 1), 1000);
        } else if (e.code === 'KeyO') {
          e.preventDefault();
          updateScore({ scoreR: Math.max(0, cur.scoreR - 1) });
          if (!timerRef.current)
            timerRef.current = setInterval(() => setTime((v) => v + 1), 1000);
        }
        return;
      }

      if (cur.step === 'match' && !isFin) {
        if (e.code === 'Enter' || e.code === 'NumpadEnter') {
          e.preventDefault();
          clickCountRef.current += 1;

          if (clickTimeoutRef.current) clearTimeout(clickTimeoutRef.current);

          clickTimeoutRef.current = setTimeout(() => {
            const clicks = clickCountRef.current;
            clickCountRef.current = 0;

            if (clicks === 1) {
              updateScore({ scoreR: cur.scoreR + 1 });
            } else if (clicks === 2) {
              updateScore({ scoreL: cur.scoreL + 1 });
            } else if (clicks === 3) {
              updateScore({ scoreR: Math.max(0, cur.scoreR - 1) });
            } else if (clicks >= 4) {
              updateScore({ scoreL: Math.max(0, cur.scoreL - 1) });
            }
          }, 350);
          return;
        }

        if (e.code === 'KeyQ') updateScore({ scoreL: cur.scoreL + 1 });
        else if (e.code === 'KeyP') updateScore({ scoreR: cur.scoreR + 1 });
        else if (e.code === 'KeyW')
          updateScore({ scoreL: Math.max(0, cur.scoreL - 1) });
        else if (e.code === 'KeyO')
          updateScore({ scoreR: Math.max(0, cur.scoreR - 1) });
        else if (e.code === 'KeyS') {
          updateScore({ scoreL: cur.scoreR, scoreR: cur.scoreL });
          setPlayerLId(cur.playerRId);
          setPlayerRId(cur.playerLId);
        }
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isMac, startTimer, updateScore, checkWinCondition]);

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

      {pairingPin && step !== 'setup' && step !== 'results' && (
        <div className='absolute top-6 left-6 flex items-center gap-3 bg-card/40 backdrop-blur-xl border border-border/50 px-5 py-3 rounded-full z-50 shadow-lg group'>
          <div className='h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse' />
          <span className='text-xs font-black uppercase tracking-[0.2em] text-muted-foreground'>
            {t('Garmin PIN')}
          </span>
          <span className='font-mono text-xl font-bold text-primary tracking-widest'>
            {pairingPin}
          </span>
        </div>
      )}

      {step === 'setup' && (
        <SetupPhase
          state={{
            rooms,
            selectedRoom,
            playerLId,
            playerRId,
            isGarminEnabled,
            isPairingLoading,
          }}
          actions={{
            setSelectedRoom,
            setPlayerLId,
            setPlayerRId,
            setIsGarminEnabled,
            handleInitializeArena,
          }}
          t={t}
        />
      )}

      {step === 'waiting' && (
        <WaitingPhase
          state={{
            matchState,
            selectedRoom,
            playerLName,
            playerRName,
						isGarminEnabled,
          }}
          actions={{
            handleServerSelection,
          }}
          t={t}
        />
      )}

      {step === 'match' && (
        <MatchPhase
          state={{
            matchHistory,
            initialIds,
            playerLId,
            playerRId,
            playerLName,
            playerRName,
            selectedRoom,
            time,
            isMatchFinished,
            currentServerSide,
            scoreL,
            scoreR,
            intensity,
            intensityClasses,
            playerLHistoryStatus,
            playerRHistoryStatus,
            isSubmitting,
            isMac,
          }}
          actions={{
            handleNextAction,
            submitSeries,
            onCloseReset,
          }}
          t={t}
        />
      )}

      {step === 'results' && matchResults && (
        <ResultsPhase
          state={{
            matchResults,
            sessionGames,
            isDerbyMode,
          }}
          actions={{
            onCloseReset,
          }}
          t={t}
        />
      )}
    </div>
  );
};
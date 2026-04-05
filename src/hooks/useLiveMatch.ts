import { rtdb } from '@/lib/firebase';
import { onValue, ref, remove, update } from 'firebase/database';
import { useCallback, useEffect, useState } from 'react';

export type MatchState = {
  scoreL: number;
  scoreR: number;
  server: 'L' | 'R';
  last_updated: number;
  deviceConnected?: boolean;
  matchStarted?: boolean;
  nameL?: string;
  nameR?: string;
  colorL?: string;
  colorR?: string;
  seriesL?: number;
  seriesR?: number;
  isMatchFinished?: boolean;
  remoteAction?: string;
};

const defaultState: MatchState = {
  scoreL: 0,
  scoreR: 0,
  server: 'L',
  last_updated: 0,
  deviceConnected: false,
  matchStarted: false,
  isMatchFinished: false,
  remoteAction: '',
};

export function useLiveMatch(sessionId: string | null) {
  const [matchState, setMatchState] = useState<MatchState>(defaultState);

  useEffect(() => {
    if (!sessionId) {
      return;
    }
    if (!rtdb) {
      return;
    }

    const matchRef = ref(rtdb, `live_sessions/${sessionId}`);

    const unsubscribe = onValue(
      matchRef,
      (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.val();
          if (data) {
            setMatchState((prev) => ({ ...prev, ...data }));
          }
        }
      },
      (error) => {},
    );

    return () => {
      unsubscribe();
    };
  }, [sessionId]);

  const updateScore = useCallback(
    async (updates: Partial<MatchState>) => {
      const last_updated = Date.now();
      setMatchState((prev) => ({ ...prev, ...updates, last_updated }));

      if (!sessionId || !rtdb) return;

      const matchRef = ref(rtdb, `live_sessions/${sessionId}`);
      await update(matchRef, {
        ...updates,
        last_updated,
      });
    },
    [sessionId],
  );

  const initMatch = useCallback(
    async (initialState: MatchState) => {
      const stateWithTime = { ...initialState, last_updated: Date.now() };
      setMatchState((prev) => ({ ...prev, ...stateWithTime }));
      if (sessionId && rtdb) {
        const matchRef = ref(rtdb, `live_sessions/${sessionId}`);
        try {
          await update(matchRef, stateWithTime);
        } catch (err) {}
      }
    },
    [sessionId],
  );

  const clearMatch = useCallback(async () => {
    setMatchState(defaultState);
    if (!sessionId || !rtdb) return;
    const matchRef = ref(rtdb, `live_sessions/${sessionId}`);
    try {
      await remove(matchRef);
    } catch (err) {}
  }, [sessionId]);

  const startMatch = useCallback(async () => {
    if (!sessionId || !rtdb) return;
    const matchRef = ref(rtdb, `live_sessions/${sessionId}`);
    try {
      await update(matchRef, { matchStarted: true, last_updated: Date.now() });
    } catch (err) {}
  }, [sessionId]);

  return { matchState, updateScore, initMatch, clearMatch, startMatch };
}

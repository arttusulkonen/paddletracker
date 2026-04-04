// src/hooks/useLiveMatch.ts
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
};

const defaultState: MatchState = {
  scoreL: 0,
  scoreR: 0,
  server: 'L',
  last_updated: 0,
  deviceConnected: false,
  matchStarted: false,
};

export function useLiveMatch(sessionId: string | null) {
  const [matchState, setMatchState] = useState<MatchState>(defaultState);

  useEffect(() => {
    if (!sessionId) {
      console.log('[RTDB Debug] No sessionId provided');
      return;
    }
    if (!rtdb) {
      console.error('[RTDB Debug] rtdb instance is null');
      return;
    }

    console.log(
      `[RTDB Debug] Attaching listener to live_sessions/${sessionId}`,
    );
    const matchRef = ref(rtdb, `live_sessions/${sessionId}`);

    const unsubscribe = onValue(
      matchRef,
      (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.val();
          console.log('[RTDB Debug] Data received:', data);
          setMatchState((prev) => ({ ...prev, ...data }));
        } else {
          console.log('[RTDB Debug] Node is empty or deleted');
        }
      },
      (error) => {
        console.error('[RTDB Debug] Listener error:', error);
      },
    );

    return () => {
      console.log(
        `[RTDB Debug] Detaching listener from live_sessions/${sessionId}`,
      );
      unsubscribe();
    };
  }, [sessionId]);

  const updateScore = useCallback(
    async (updates: Partial<MatchState>) => {
      console.log('[RTDB Debug] updateScore called with:', updates);
      setMatchState((prev) => {
        const newState = { ...prev, ...updates, last_updated: Date.now() };
        if (sessionId && rtdb) {
          const matchRef = ref(rtdb, `live_sessions/${sessionId}`);
          update(matchRef, {
            ...updates,
            last_updated: newState.last_updated,
          })
            .then(() => {
              console.log('[RTDB Debug] updateScore success');
            })
            .catch((err) => {
              console.error('[RTDB Debug] updateScore failed:', err);
            });
        }
        return newState;
      });
    },
    [sessionId],
  );

  const initMatch = useCallback(
    async (initialState: MatchState) => {
      console.log('[RTDB Debug] initMatch called with:', initialState);
      const stateWithTime = { ...initialState, last_updated: Date.now() };
      setMatchState((prev) => ({ ...prev, ...stateWithTime }));
      if (sessionId && rtdb) {
        const matchRef = ref(rtdb, `live_sessions/${sessionId}`);
        await update(matchRef, stateWithTime)
          .then(() => {
            console.log('[RTDB Debug] initMatch success');
          })
          .catch((err) => {
            console.error('[RTDB Debug] initMatch failed:', err);
          });
      }
    },
    [sessionId],
  );

  const clearMatch = useCallback(async () => {
    console.log('[RTDB Debug] clearMatch called');
    setMatchState(defaultState);
    if (!sessionId || !rtdb) return;
    const matchRef = ref(rtdb, `live_sessions/${sessionId}`);
    await remove(matchRef)
      .then(() => {
        console.log('[RTDB Debug] clearMatch success');
      })
      .catch((err) => {
        console.error('[RTDB Debug] clearMatch failed:', err);
      });
  }, [sessionId]);

  const startMatch = useCallback(async () => {
    console.log('[RTDB Debug] startMatch called');
    if (!sessionId || !rtdb) return;
    const matchRef = ref(rtdb, `live_sessions/${sessionId}`);
    await update(matchRef, { matchStarted: true, last_updated: Date.now() })
      .then(() => {
        console.log('[RTDB Debug] startMatch success');
      })
      .catch((err) => {
        console.error('[RTDB Debug] startMatch failed:', err);
      });
  }, [sessionId]);

  return { matchState, updateScore, initMatch, clearMatch, startMatch };
}

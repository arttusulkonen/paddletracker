// src/lib/elo.ts
import { getFunctions, httpsCallable } from 'firebase/functions';
import { app } from './firebase';
import type { Room, Sport } from './types';

type NonTennisRow = {
  score1: string;
  score2: string;
  side1: string;
  side2: string;
};

type MatchInputData = NonTennisRow | any; 

export async function processAndSaveMatches(
  roomId: string,
  room: Room,
  player1Id: string,
  player2Id: string,
  matchesInput: MatchInputData[],
  currentMembers: Room['members'], 
  sport: Sport,
  config: any 
): Promise<boolean> {
  if (!app) {
    console.error('Firebase app not initialized');
    return false;
  }

  try {
    const functions = getFunctions(app, 'us-central1');
    const recordMatch = httpsCallable(functions, 'recordMatch');

    const response = await recordMatch({
      roomId,
      player1Id,
      player2Id,
      matches: matchesInput, 
      sport
    });

    const data = response.data as { success: boolean };
    return data.success;

  } catch (error) {
    console.error('Failed to record match via Cloud Function:', error);
    return false;
  }
}
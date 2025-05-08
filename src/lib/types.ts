import type { Timestamp } from 'firebase/firestore';

export interface UserProfile {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL?: string | null;
  globalElo: number;
  matchesPlayed: number;
  wins: number;
  losses: number;
  // winPercentage can be calculated on the fly or stored
  createdAt: Timestamp;
  eloHistory?: { date: Timestamp; elo: number }[];
}

export interface MatchScore {
  player1Score: number;
  player2Score: number;
}

export interface Match extends MatchScore {
  id: string;
  player1Id: string;
  player2Id: string;
  player1Name?: string; 
  player2Name?: string; 
  winnerId: string;
  playedAt: Timestamp;
  eloChangePlayer1: number;
  eloChangePlayer2: number;
  roomId?: string;
  tournamentId?: string;
  roundName?: string; // For tournaments
}

export interface Room {
  id: string;
  name: string;
  createdBy: string; 
  creatorName?: string;
  members: string[]; // Array of User UIDs
  memberNames?: Record<string, string>; // UID: DisplayName
  localElos: Record<string, number>; // UID: ELO score
  createdAt: Timestamp;
}

export type TournamentSize = 4 | 6 | 8 | 12;
export type TournamentStatus = 'pending_registration' | 'group_stage' | 'playoffs' | 'completed';

export interface TournamentPlayer {
  uid: string;
  displayName: string; // denormalized
  eloAtStart: number; // ELO when joining tournament
  matchesPlayed: number;
  wins: number;
  losses: number;
  setsWon?: number; // For tie-breaking in group stage
  setsLost?: number; // For tie-breaking in group stage
  points?: number; // For group stage standings
  group?: string; // e.g., 'A', 'B'
}

export interface TournamentMatch extends Match {
  tournamentId: string;
  round: string; // e.g., "Group A - Match 1", "Quarterfinal 1", "Final"
  isPlayoff?: boolean;
}

export interface Tournament {
  id: string;
  name: string;
  createdBy: string; 
  creatorName?: string;
  players: TournamentPlayer[]; // List of registered players
  size: TournamentSize;
  status: TournamentStatus;
  createdAt: Timestamp;
  startDate?: Timestamp;
  winner?: string; // UID of the tournament winner
  // Structure for rounds/matches/bracket can be complex.
  // For simplicity, matches can be queried by tournamentId.
  // A subcollection for 'tournament_matches' or 'tournament_rounds' might be better.
}

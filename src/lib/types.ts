export type Sport = 'pingpong' | 'tennis' | 'badminton';

export interface SportProfile {
  globalElo: number;
  wins: number;
  losses: number;
  rank?: string;
  aces?: number;
  doubleFaults?: number;
  winners?: number;
  eloHistory?: {
    ts: string;
    elo: number;
  }[];
}

export interface Achievement {
  type: string;
  sport?: Sport;
  dateFinished?: string;
  userId?: string | null;
  name?: string | null;
  place?: number | null;
  matchesPlayed?: number;
  wins?: number;
  losses?: number;
  winRate?: number;
  totalAddedPoints?: number;
  adjPoints?: number;
  longestWinStreak?: number;
  roomRating?: number;
  startGlobalElo?: number;
  endGlobalElo?: number;
  roomId?: string | null;
  roomName?: string | null;
  finalScore?: number;
}

export interface UserProfile {
  uid: string;
  email?: string;
  name?: string;
  displayName?: string;
  rank?: string;
  globalElo?: number;
  matchesPlayed?: number;
  wins?: number;
  losses?: number;
  maxRating?: number;
  isPublic?: boolean;
  bio?: string;
  photoURL?: string | null;
  isDeleted?: boolean;
  rooms: string[];
  friends?: string[];
  eloHistory?: {
    date: string;
    elo: number;
  }[];
  achievements?: Achievement[];
  sports?: {
    [key in Sport]?: SportProfile;
  };
  activeSport?: Sport;
}

export interface Room {
  id: string;
  name: string;
  createdBy: string;
  creatorName?: string;
  members: Member[];
  createdAt: string;
  roomCreated: string;
  joinRequests?: string[];
  isPublic: boolean;
  isRanked?: boolean;
  isArchived?: boolean;
  avatarURL?: string;
  memberIds: string[];
  seasonHistory?: any[];
  description?: string;
  sport?: Sport;
}

export interface Member {
  userId: string;
  name: string;
  email?: string;
  rating: number;
  wins: number;
  losses: number;
  maxRating?: number;
  date: string;
  role: string;
  globalElo?: number;
}

export interface Match {
  id: string;
  roomId: string;
  tsIso?: string;
  timestamp?: string;
  createdAt?: string;
  playedAt?: string;
  isRanked?: boolean;
  player1Id: string;
  player2Id: string;
  players?: string[];
  player1: MatchSide;
  player2: MatchSide;
  winner: string;
  player1Name?: string;
  player2Name?: string;
  winnerId?: string;
  player1Score?: number;
  player2Score?: number;
  eloChangePlayer1?: number;
  eloChangePlayer2?: number;
  tournamentId?: string;
  roundName?: string;
  [key: string]: any;
}

export interface MatchSide {
  name: string;
  scores: number;
  oldRating: number;
  newRating: number;
  addedPoints: number;
  roomOldRating: number;
  roomNewRating: number;
  roomAddedPoints: number;
  side?: 'left' | 'right';
  aces?: number;
  doubleFaults?: number;
  winners?: number;
}

export interface TournamentRoom {
  id: string;
  name: string;
}
export interface UserProfile {
  email: string;
  name: string;
  displayName: string;
  uid: string;
  rank: string;
  globalElo: number;
  matchesPlayed: number;
  wins: number;
  losses: number;
  maxRating: number;
  isPublic?: boolean;
  bio?: string;
  photoURL?: string | null;
  isDeleted?: boolean;
  rooms: string[];
  friends?: string[];
  eloHistory: {
    date: string;
    elo: number;
  }[];
  achievements: {
    type: string;
    dateFinished: string;
    finalScore: number;
    wins: number;
    losses: number;
    matchesPlayed: number;
    place: number | null;
    roomId: string | null;
    roomName: string | null;
    totalAddedPoints: number;
  }[];
  sports?: {
    [key in Sport]?: SportProfile;
  };
  activeSport?: Sport;
}

export type Sport = 'pingpong' | 'tennis';

export interface SportProfile {
  globalElo: number;
  wins: number;
  losses: number;
  rank: string;
  aces?: number;
  doubleFaults?: number;
  winners?: number;
}


export interface TournamentRoom {
  id: string;
  name: string;
}

export interface Match {
  id: string;
  player1Id: string;
  player2Id: string;
  player1Name?: string;
  player2Name?: string;
  winnerId: string;
  playedAt: string;
  eloChangePlayer1: number;
  eloChangePlayer2: number;
  roomId?: string;
  tournamentId?: string;
  roundName?: string;
  player1Score: number;
  player2Score: number;
  isRanked?: boolean;
  tsIso?: string;
  timestamp?: any;
  createdAt?: any;
  [key: string]: any; 
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

interface Member {
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
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
}

export interface TournamentRoom {
  id: string;
  name: string;
  // Add other properties as needed
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
  isArchived?: boolean;
  avatarURL?: string;
  memberIds: string[];
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
}
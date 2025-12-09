// src/lib/types.ts

// --- Enums & Unions ---
export type Sport = 'pingpong' | 'tennis' | 'badminton';
export type RoomMode = 'office' | 'professional' | 'arcade';
export type AccountType = 'player' | 'coach'; 

// --- Config ---
export interface AppConfig {
  id: string; // usually 'app'
  superAdminIds: string[];
}

// --- Communities ---
export interface Community {
  id: string;
  name: string;
  description?: string;
  ownerId: string; // Главный тренер/создатель
  admins: string[]; // Список ID тренеров, которые управляют
  members: string[]; // Список ID игроков (призраков и реальных)
  createdAt: string;
  avatarURL?: string | null;
}

// --- Statistics & History ---
export interface EloHistoryPoint {
  date?: string; // Legacy format or ISO
  ts?: string;   // ISO format
  elo: number;
}

export interface SportProfile {
  globalElo: number;
  wins: number;
  losses: number;
  rank?: string;
  
  // Tennis specific
  aces?: number;
  doubleFaults?: number;
  winners?: number;
  
  eloHistory?: EloHistoryPoint[];
}

export interface RankHistoryPoint {
  ts: string;
  place: number;
  rating: number;
}

// --- Achievements ---
export interface Achievement {
  type: string; // e.g. 'seasonFinish'
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
  mode?: string;
}

// --- User Profile ---
export interface UserProfile {
  uid: string;
  email?: string;
  name?: string;
  displayName?: string;
  
  // Bio & Media
  bio?: string;
  photoURL?: string | null;
  
  // Meta
  createdAt?: string;
  isPublic?: boolean;
  isDeleted?: boolean;
  
  // Approvals (Legacy/Internal)
  approved?: boolean;
  approvedAt?: string;
  approvedBy?: string;
  approvalReason?: string;

  // Stats (Root level / Legacy)
  rank?: string;
  globalElo?: number;
  matchesPlayed?: number;
  wins?: number;
  losses?: number;
  maxRating?: number;
  eloHistory?: EloHistoryPoint[]; // Legacy root history
  
  // Relations
  rooms: string[];
  friends?: string[];
  incomingRequests?: string[];
  outgoingRequests?: string[];
  communityIds?: string[];
  
  // Nested Data
  achievements?: Achievement[];
  sports?: {
    [key in Sport]?: SportProfile;
  };
  activeSport?: Sport;
  
  // Roles & Ghost Accounts
  roles?: string[];
  accountType?: AccountType;
  managedBy?: string;      // ID тренера, если это Ghost
  isGhost?: boolean;       // Флаг призрачного игрока
  isClaimed?: boolean;     // Был ли профиль захвачен реальным пользователем
  claimedBy?: string;      // ID реального пользователя, захватившего профиль
}

// --- Room Members ---
export interface Member {
  userId: string;
  name: string;
  email?: string;
  photoURL?: string | null;
  role: string; // 'admin' | 'editor' | 'member'
  date: string; // Join date
  
  // Room Stats
  rating: number;
  wins: number;
  losses: number;
  maxRating?: number;
  
  // Computed / Optional Stats
  totalMatches?: number;
  longestWinStreak?: number;
  currentStreak?: number;
  totalAddedPoints?: number;
  prevPlace?: number;
  
  // Global context
  globalElo?: number;
}

// --- Seasons ---
export interface SeasonSummary {
  userId: string;
  name: string;
  place: number;
  matchesPlayed: number;
  wins: number;
  losses: number;
  winRate: number;
  totalAddedPoints: number;
  longestWinStreak?: number;
  roomRating: number;
  adjPoints?: number;
  startGlobalElo?: number;
  endGlobalElo?: number;
}

export interface Season {
  type: string; // 'seasonFinish'
  dateFinished: string;
  roomId: string;
  roomName: string;
  sport: Sport | string;
  mode?: string;
  summary: SeasonSummary[];
}

// --- Rooms ---
export interface Room {
  id: string;
  name: string;
  description?: string;
  sport?: Sport;
  mode?: RoomMode;
  avatarURL?: string;
  
  // Creation
  creator: string; // DB field is 'creator'
  createdBy?: string; // Alias sometimes used in code
  creatorName?: string;
  createdAt: string;
  roomCreated?: string; // Legacy format
  
  // Config
  isPublic: boolean;
  isRanked?: boolean;
  isArchived?: boolean;
  archivedAt?: string;
  kFactor?: number;
  
  // Members & Access
  adminIds?: string[];
  memberIds: string[];
  members: Member[];
  joinRequests?: string[];
  
  // Data
  seasonHistory?: Season[];
  rankHistories?: Record<string, RankHistoryPoint[]>; // userId -> history
}

// --- Matches ---
export interface MatchSide {
  name: string;
  scores: number;
  side?: 'left' | 'right';
  
  // Global
  oldRating: number;
  newRating: number;
  addedPoints: number;
  
  // Room
  roomOldRating: number;
  roomNewRating: number;
  roomAddedPoints: number;
  
  // Tennis specific stats
  aces?: number;
  doubleFaults?: number;
  winners?: number;
}

export interface Match {
  id: string;
  roomId: string;
  
  // Timestamps
  createdAt?: string;
  timestamp?: string;
  tsIso?: string;
  playedAt?: string; // ISO when the match actually happened
  
  // Config
  isRanked?: boolean;
  
  // Tournament Context
  isTournament?: boolean;
  tournamentId?: string;
  tournamentName?: string;
  tournamentStage?: string;
  roundName?: string;
  
  // Players
  players?: string[]; // Array of UIDs for querying
  player1Id: string;
  player2Id: string;
  
  // Legacy / Flat fields
  player1Name?: string;
  player2Name?: string;
  player1Score?: number;
  player2Score?: number;
  eloChangePlayer1?: number;
  eloChangePlayer2?: number;
  
  // Detailed Data
  player1: MatchSide;
  player2: MatchSide;
  
  // Result
  winner: string;
  winnerId?: string;
  
  // Catch-all for very old legacy fields
  [key: string]: any;
}

// --- Tournaments ---
export interface TournamentRoom {
  id: string;
  name: string;
}
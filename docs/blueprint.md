# Smashlog (PaddleTracker) — Architectural Blueprint

## 1. Project Overview

**Smashlog** is a progressive web application (PWA) designed to track ELO ratings, manage match history, and organize tournaments for racket sports.
**Supported Sports:** Ping-Pong, Tennis, Badminton.

The core philosophy is a **Dual-Rating System** designed to balance competitive fairness with social engagement:

1.  **Global ELO (True Skill):** A strict, zero-sum rating that persists across all games and rooms. It represents the player's objective skill level.
2.  **Room ELO (Season Progress):** A local, inflationary rating specific to a private club or season. It resets to 1000 for everyone at the start of a room/season and is designed to reward activity and prevent stagnation.

---

## 2. Technology Stack

### Frontend

- **Framework:** Next.js 15 (App Router)
- **Language:** TypeScript
- **Styling:** Tailwind CSS, Shadcn UI
- **Icons:** Lucide React, React Icons
- **State Management:** React Context API (`AuthContext`, `SportContext`)
- **Internationalization:** i18next (English, Finnish, Russian, Korean)

### Backend (Firebase)

- **Auth:** Firebase Authentication (Email/Password, Social)
- **Database:** Cloud Firestore (NoSQL)
- **Storage:** Firebase Storage (Avatars)
- **Compute:** Cloud Functions (2nd Gen)
- **AI Engine:** Google Genkit + Gemini 2.0 Flash

---

## 3. Directory Structure & Key Files

```text
src/
├── app/
│   ├── (page)/           # Protected routes (Dashboard, Profile, etc.)
│   ├── rooms/            # Room lists, details, and standings
│   ├── login/            # Authentication pages
│   └── mobile/           # Mobile-optimized views
├── components/
│   ├── AiAssistant.tsx   # AI Chat Interface (Genkit integration)
│   ├── RecordBlock.tsx   # Manual match entry component
│   └── ...
├── contexts/
│   ├── AuthContext.tsx   # User profile & auth state
│   └── SportContext.tsx  # Active sport switcher & DB config
├── lib/
│   ├── elo.ts            # Client-side ELO calculation (Dual logic)
│   ├── season.ts         # Season finishing & Adjusted Points logic
│   ├── firebase.ts       # Firebase Client SDK initialization
│   └── types.ts          # TS Interfaces (User, Room, Match)
functions/
├── src/
│   ├── index.ts          # Cloud Functions (aiChat, aiSaveMatch)
│   ├── config.ts         # Collection names configuration
│   └── ...
```

---

## 4\. ELO Rating System & Logic

### Configuration

- **Algorithm:** Standard ELO Rating System (modified).
- **K-Factor:** `32` (High volatility for dynamic adjustments).
- **Granularity:** **Per-Game/Set**. Every scored unit (e.g., a single Ping Pong game 11-9) is calculated as a distinct transaction.

### The Dual-Layer Formula

Every match triggers two independent calculations.

#### A. Global ELO (Zero-Sum)

Used for cross-room skill comparison.

1.  **Expected Score ($E_a$):** Standard logistic curve.
2.  **New Rating:** $R'_a = R_a + 32 \times (S_a - E_a)$.
3.  **Property:** Points gained by the winner equal points lost by the loser.

#### B. Room ELO (Inflationary)

Used for room leaderboards and season standings.

1.  **Start:** Everyone starts at **1000** in a new room.
2.  **Winner:** Gains full delta ($+32 \times (1 - E_a)$).
3.  **Loser (The Twist):** Loses only **80%** of the delta.
    - _Formula:_ $\text{Loss} = \text{BaseDelta} \times 0.8$
    - _Effect:_ Every match injects \~20% of the "energy" into the system. This prevents the "1200 trap" and allows active players ("grinders") to progress even with a \~50% win rate.

---

## 5\. Season Ranking & Adjusted Points

To further encourage activity in office leagues, the final season ranking is **not** based solely on raw ELO.

### The Problem

A player with 10 wins and 0 losses (ELO \~1300) often ranked higher than a player with 50 wins and 40 losses (ELO \~1250), discouraging active play.

### The Solution: Adjusted Points

The "Live Final" and "Season Finish" standings use a weighted formula:

$$ \text{AdjPoints} = (\text{RoomRating} - 1000) \times \sqrt{\frac{\text{MatchesPlayed}}{\text{AverageMatches}}} $$

- **Net Points:** Points gained above the baseline 1000.
- **Activity Multiplier:** Square root of the player's volume vs. the room average.
- **Result:** A player who plays significantly more matches can outrank a slightly higher-rated player who camps on a good score.

---

## 6\. Database Structure (Firestore)

The database is partitioned by sport to ensure scalability.

### Users Collection (`users`)

Stores profile data and nested statistics per sport.

```json
users/{uid}
{
  "uid": "string",
  "displayName": "Pekka",
  "sports": {
    "pingpong": {
      "globalElo": 1200, // <-- GLOBAL RATING
      "wins": 15,
      "losses": 5,
      "eloHistory": [{ "ts": "ISO", "elo": 1200 }]
    }
  }
}
```

### Rooms Collections (`rooms-pingpong`, etc.)

Embeds member data for fast leaderboards.

```json
rooms-pingpong/{roomId}
{
  "id": "roomId",
  "name": "Office League",
  "members": [
    {
      "userId": "uid1",
      "name": "Pekka",
      "rating": 1050, // <-- ROOM RATING (Inflationary)
      "globalElo": 1210, // Snapshot of Global
      "wins": 5,
      "losses": 1
    }
  ]
}
```

### Matches Collections (`matches-pingpong`, etc.)

Stores details of both rating changes.

```json
matches-pingpong/{matchId}
{
  "roomId": "roomId",
  "winner": "Pekka",
  "player1": {
    "name": "Pekka",
    "scores": 11,
    "oldRating": 1200,      // Global Before
    "newRating": 1216,      // Global After (+16)
    "roomOldRating": 1000,  // Room Before
    "roomNewRating": 1016,  // Room After (+16)
    "roomAddedPoints": 16
  },
  "player2": {
    "name": "Jukka",
    "scores": 9,
    "oldRating": 1200,
    "newRating": 1184,      // Global After (-16)
    "roomOldRating": 1000,
    "roomNewRating": 987,   // Room After (-13) <-- INFLATION APPLIED
    "roomAddedPoints": -13
  }
}
```

---

## 7\. Match Submission Workflows

### A. Manual Entry (Client-Side)

**File:** `src/lib/elo.ts`

1.  **Logic:** Iterates through input rows (sets).
2.  **Calc:** Computes both Global (Zero-Sum) and Room (Inflationary) deltas for each set.
3.  **Write:** Saves matches sequentially to Firestore (with 1000ms delay for timestamp ordering).
4.  **Update:** Updates `users` (Global) and `rooms` (Room) documents via `updateDoc`.

### B. AI Assistant (Server-Side)

**File:** `functions/src/index.ts`

1.  **Parsing:** Genkit + Gemini 2.0 Flash parses natural text into JSON.
2.  **Execution (`aiSaveMatch`):**
    - **Optimization:** Pre-fetches all user profiles and room members in bulk (mapped by Name/ID).
    - **In-Memory Calculation:** Performs the entire ELO simulation (150+ matches) in memory to determine final states.
    - **Batch Write:** Commits all matches and updates in a single Firestore Batch (max 500 ops).
    - **Speed:** Capable of processing \~200 matches in \<2 seconds.

---

## 8\. Critical Implementation Details

- **Inflation Factor:** `0.8` (Losers lose 20% less in Room ELO).
- **Season Reset:** Creating a new room resets all participants' Room ELO to 1000, while Global ELO remains untouched.
- **Indexes:** Complex queries (e.g., "Player's history in a specific room") require composite indexes on `roomId` + `tsIso`.

```

```

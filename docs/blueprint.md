# Smashlog (PaddleTracker) — Architectural Blueprint

## 1. Project Overview

**Smashlog** is a progressive web application (PWA) designed to track ELO ratings, manage match history, and organize tournaments for racket sports.
**Supported Sports:** Ping-Pong, Tennis, Badminton.

The platform supports flexible **Game Modes** to cater to different groups: from casual office environments ("Office League") to serious competitive clubs ("Professional") and purely fun sessions ("Arcade").

The core philosophy is a **Dual-Rating System**:

1.  **Global ELO:** A persistent, strict zero-sum rating (True Skill) that follows the player everywhere.
2.  **Room ELO:** A local, seasonal rating specific to a private room, with rules defined by the selected Game Mode.

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

## 3. Game Modes & Logic

When creating a room, admins select a **Game Mode** which dictates how ELO is calculated and how the leaderboard is ranked.

### A. Office League (Default)

_Designed for workplace rivalries and casual leagues where activity should be rewarded._

- **ELO Logic:** **Inflationary**. Winners gain full points, losers lose only **80%** of the calculated delta. This injects points into the system, preventing stagnation.
- **K-Factor:** Default `32`.
- **Ranking Criteria:** **Adjusted Points**.
  $$\text{AdjPoints} = (\text{Rating} - 1000) \times \sqrt{\frac{\text{MatchesPlayed}}{\text{AverageMatches}}}$$
  _Active players can outrank higher-rated campers._

### B. Professional

_Designed for serious clubs and competitive play._

- **ELO Logic:** **Strict Zero-Sum**. Points gained = Points lost.
- **K-Factor:** Default `32` (Customizable: 10–64). Lower K for less volatility, Higher K for faster placement.
- **Ranking Criteria:** **Room Rating** (Pure ELO).
  _Tie-breakers: Win Rate -> Wins._

### C. Arcade

_Designed for "just for fun" games without ranking stress._

- **ELO Logic:** **None**. K-Factor is forced to `0`. Ratings remain at 1000.
- **Ranking Criteria:** **Total Wins**.
  _Tie-breakers: Win Rate -> Matches Played._

---

## 4. Directory Structure & Key Files

```text
src/
├── app/
│   ├── (page)/           # Protected routes (Dashboard, Profile, etc.)
│   ├── rooms/            # Room lists, details, and standings
│   ├── login/            # Authentication pages
│   └── mobile/           # Mobile-optimized views
├── components/
│   ├── AiAssistant.tsx         # AI Chat Interface (Genkit integration)
│   ├── RecordBlock.tsx         # Manual match entry component
│   ├── rooms/
│   │   ├── CreateRoomDialog.tsx # Room creation with Mode & K-Factor selection
│   │   └── StandingsTable.tsx   # Dynamic leaderboard based on Mode
│   └── ...
├── contexts/
│   ├── AuthContext.tsx   # User profile & auth state
│   └── SportContext.tsx  # Active sport switcher & DB config
├── lib/
│   ├── elo.ts            # Client-side ELO calculation (Mode-aware)
│   ├── season.ts         # Season statistics & sorting logic (Mode-aware)
│   ├── firebase.ts       # Firebase Client SDK initialization
│   └── types.ts          # TS Interfaces (User, Room, Match)
functions/
├── src/
│   ├── index.ts          # Cloud Functions (AI Match processing)
│   ├── config.ts         # Collection names configuration
│   └── ...
```

---

## 5\. ELO Rating System Details

### The Dual-Layer Formula

Every match triggers two independent calculations in `src/lib/elo.ts`.

#### 1\. Global ELO (Always Professional)

- Used for cross-room skill comparison.
- **Formula:** Standard ELO ($R_a' = R_a + K \cdot (S_a - E_a)$).
- **K-Factor:** Always fixed at `32`.
- **Type:** Zero-Sum.

#### 2\. Room ELO (Mode Dependent)

- **Office Mode:**
  - K = 32.
  - If Delta \< 0 (Loss): $\text{FinalDelta} = \text{Delta} \times 0.8$.
- **Professional Mode:**
  - K = Custom (10-64).
  - Standard Zero-Sum logic.
- **Arcade Mode:**
  - K = 0. Delta is always 0.

---

## 6\. Database Structure (Firestore)

The database is partitioned by sport (`pingpong`, `tennis`, `badminton`).

### Users Collection (`users`)

Stores profile data and nested statistics per sport.

```json
users/{uid}
{
	"uid": "string (Primary Key)",
	"email": "string",
	"displayName": "string",
	"name": "string",
	"photoURL": "string | null",
	"bio": "string",
	"createdAt": "string (Custom format: DD.MM.YYYY HH.mm.ss or ISO)",
	"approved": "boolean",
	"approvedAt": "string (ISO)",
	"approvedBy": "string (UID)",
	"isPublic": "boolean",
	"isDeleted": "boolean",
	"activeSport": "string ('pingpong' | 'tennis' | 'badminton')",
	"maxRating": "number",
	"matchesPlayed": "number",
	"wins": "number",
	"losses": "number",
	"globalElo": "number",
	"friends": [
		"string (UID)"
	],
	"incomingRequests": [
		"string (UID)"
	],
	"outgoingRequests": [
		"string (UID)"
	],
	"rooms": [
		"string (RoomID)"
	],
	"tournaments": [
		"string (TournamentID)"
	],
	"achievements": [
		{
			"type": "string",
			"sport": "string",
			"dateFinished": "string",
			"place": "number",
			"wins": "number",
			"losses": "number",
			"winRate": "number",
			"roomId": "string",
			"roomName": "string",
			"roomRating": "number",
			"startGlobalElo": "number",
			"endGlobalElo": "number",
			"totalAddedPoints": "number",
			"adjPoints": "number",
			"longestWinStreak": "number",
			"userId": "string"
		}
	],
	"eloHistory": [
		{
			"date": "string",
			"elo": "number"
		}
	],
	"sports": {
		"pingpong": {
			"globalElo": "number",
			"wins": "number",
			"losses": "number",
			"eloHistory": [
				{
					"ts": "string (ISO)",
					"elo": "number"
				}
			]
		},
		"tennis": {
			"globalElo": "number",
			"wins": "number",
			"losses": "number",
			"aces": "number",
			"doubleFaults": "number",
			"winners": "number",
			"eloHistory": [
				{
					"ts": "string (ISO)",
					"elo": "number"
				}
			]
		},
		"badminton": {
			"globalElo": "number",
			"wins": "number",
			"losses": "number",
			"eloHistory": [
				{
					"ts": "string (ISO)",
					"elo": "number"
				}
			]
		}
	}
}
```

### Rooms Collections (`rooms-pingpong`, etc.)

Stores league configuration and embedded member data.

```json
rooms-pingpong/{roomId}
{
  "id": "string (RoomID)",
  "createdAt": "string (Format: DD.MM.YYYY HH.mm.ss)",
  "creator": "string (UID)",
  "creatorName": "string",
  "name": "string",
  "description": "string",
  "avatarURL": "string | null",
  "mode": "string ('office' | 'professional' | 'arcade')",
  "kFactor": "number",
  "isPublic": "boolean",
  "isRanked": "boolean",
  "isArchived": "boolean",
  "adminIds": [ "string (UID)" ],
  "memberIds": [ "string (UID)" ],
  "members": [
    {
      "userId": "string (UID)",
      "name": "string",
      "email": "string",
      "role": "string ('admin' | 'editor' | 'member')",
      "photoURL": "string | null",
      "date": "string (Join date)",
      "rating": "number (Room ELO)",
      "wins": "number",
      "losses": "number",
      "globalElo": "number"
    }
  ],

  "seasonHistory": [
    {
      "type": "seasonFinish",
      "dateFinished": "string",
      "roomId": "string",
      "roomName": "string",
      "sport": "string",
      "mode": "string ('office' | 'professional' | 'arcade')",
      "summary": [
        {
          "userId": "string",
          "name": "string",
          "place": "number",
          "wins": "number",
          "losses": "number",
          "winRate": "number",
          "matchesPlayed": "number",
          "longestWinStreak": "number",
          "startGlobalElo": "number",
          "endGlobalElo": "number",
          "totalAddedPoints": "number",
          "adjPoints": "number",
          "roomRating": "number"
        }
      ]
    }
  ]
}
```

### Matches Collections (`matches-pingpong`, etc.)

Stores details of both rating changes.

```json
matches-pingpong/{matchId}
matches-pingpong/{matchId}
{
  "id": "string (MatchID)",
  "roomId": "string",
  "isRanked": "boolean",
  "timestamp": "string (Format: DD.MM.YYYY HH.mm.ss)",
  "tsIso": "string (ISO 8601)",
  "createdAt": "string",
  "players": [ "string (UID)", "string (UID)" ],
  "player1Id": "string (UID)",
  "player2Id": "string (UID)",
  "winner": "string (Player Name)",

  "player1": {
    "name": "string",
    "scores": "number",
    "side": "string ('left' | 'right')",

    // GLOBAL ELO (Всегда Zero-Sum, K=32)
    "oldRating": "number",
    "newRating": "number",
    "addedPoints": "number",

    // ROOM ELO (Зависит от Mode и kFactor комнаты)
    "roomOldRating": "number",
    "roomNewRating": "number",

    // В режиме 'arcade' здесь будет 0
    // В режиме 'office' при поражении здесь будет "мягкий" минус (инфляция)
    "roomAddedPoints": "number"
  },

  "player2": {
    "name": "string",
    "scores": "number",
    "side": "string ('left' | 'right')",
    "oldRating": "number",
    "newRating": "number",
    "addedPoints": "number",
    "roomOldRating": "number",
    "roomNewRating": "number",
    "roomAddedPoints": "number"
  }
}
```

---

## 7\. Workflows

### A. Match Entry (Client-Side)

**File:** `src/lib/elo.ts`

1.  Read `room.mode` and `room.kFactor`.
2.  Calculate Global Delta (Fixed K=32, Zero-Sum).
3.  Calculate Room Delta based on Mode:
    - **Arcade:** Delta = 0.
    - **Office:** Apply 0.8 multiplier to negative deltas.
    - **Professional:** Use room's `kFactor`.
4.  Commit to Firestore.

### B. Season Finalization

**File:** `src/lib/season.ts`

1.  Fetch all matches for the room.
2.  Re-calculate statistics (Wins/Losses/Streaks).
3.  **Sort Leaderboard:**
    - **Office:** Sort by `AdjPoints`.
    - **Professional:** Sort by `RoomRating`.
    - **Arcade:** Sort by `Wins`.
4.  Save snapshot to `seasonHistory` and award Achievements.

### C. AI Assistant

**File:** `functions/src/index.ts`
The server-side AI handler `aiSaveMatch` implements the **exact same logic** as the client-side `elo.ts`. It fetches the room configuration, determines the mode/K-factor, and applies the appropriate math before writing to the database.

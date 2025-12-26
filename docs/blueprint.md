# Smashlog — Architectural Blueprint

## 1\. Project Overview

**Smashlog** is a progressive web application (PWA) designed to track ELO ratings, manage match history, and organize tournaments for racket sports.
**Supported Sports:** Ping-Pong, Tennis, Badminton.

The platform caters to two primary audience groups:

1.  **Individual Players:** Tracking their own progress, joining rooms, and competing.
2.  **Coaches & Organizers:** Managing player groups (Communities), tracking student progress, and organizing private leagues.

The core philosophy is a **Dual-Rating System**:

1.  **Global ELO:** A persistent, strict zero-sum rating (True Skill) that follows the player everywhere. Used primarily for "The Big Picture" and seeding new rooms.
2.  **Room ELO:** A local, seasonal rating specific to a private room.
    - **Independence:** By default, everyone starts from **1000** in a new room (fresh start).
    - **Seeding:** Optionally, professional rooms can seed players based on their Global ELO.
    - **Rules:** The calculation rules (Inflation, K-Factor, Volatility) are dictated by the Room's **Game Mode**.

---

## 2\. Technology Stack

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

## 3\. User Roles & Account Types

The system distinguishes between user roles to tailor the interface and capabilities.

### A. Account Types (Registration Choice)

- **Player:** Standard user. Can join rooms, record matches, and view their own stats.
- **Coach / Organizer:** Extended capabilities. Can create **Communities**, manage **Ghost Players**, and view the "Management Console" (`/manage`).

### B. System Roles

- **Global Admin (Super Admin):** Has access to the system-wide Admin Panel (`/admin/users`, `/admin/rooms`) to manage all users and content.
- **Room Admin:** Creator of a specific room. Can manage settings and kick members.
- **Community Owner:** Creator of a community. Can assign admins and manage members.

---

## 4\. Game Modes & Logic

When creating a room, admins select a **Game Mode** which dictates how ELO is calculated and how the leaderboard is ranked.

### A. Office League (Default)

_Designed for workplace rivalries and casual leagues where activity should be rewarded._

- **ELO Logic:** **Inflationary**. Winners gain full points, losers lose only **80%** of the calculated delta. This injects points into the system, preventing stagnation.
- **K-Factor:** Fixed at `32`.
- **Ranking Criteria:** **Adjusted Points**.
  $$\text{AdjPoints} = (\text{Rating} - 1000) \times \sqrt{\frac{\text{MatchesPlayed}}{\text{AverageMatches}}}$$
  _Active players can outrank higher-rated campers._

### B. Professional

_Designed for serious clubs, tournaments, and competitive squads._

- **ELO Logic:** **Strict Zero-Sum** with **Provisional Ratings**.
- **Dynamic Volatility (Calibration):** For the first **10 matches** in the room, the K-Factor is **doubled** (e.g., $32 \times 2 = 64$). This allows new players to quickly reach their real skill level.
- **Base K-Factor:** Customizable (16–64). Standard is `32`.
- **Seeding (Optional):** Admins can choose to seed players based on their **Global ELO** upon room creation. By default, everyone starts at 1000.
- **Ranking Criteria:** **Room Rating** (Pure ELO).
  _Tie-breakers: Win Rate -\> Wins._

### C. Arcade

_Designed for "just for fun" games without ranking stress._

- **ELO Logic:** **None**. K-Factor is forced to `0`. Ratings remain at 1000.
- **Ranking Criteria:** **Total Wins**.
  _Tie-breakers: Win Rate -\> Matches Played._

---

## 5\. Coaching & Community Features

### A. Ghost Players (Managed Profiles)

Coaches can create "Ghost Players" — placeholder accounts for students who haven't registered yet.

- **Creation:** Coach creates a profile (Name only) in the Management Console.
- **Usage:** Ghosts can be added to rooms and have matches recorded against them immediately.
- **Claiming:** Coaches can generate a unique **Invite Link** (`/register?claim={uid}`). When a real user registers via this link, they inherit the Ghost's stats, history, and community memberships. The Ghost profile is then marked as `claimed`.

### B. Communities (Groups)

A **Community** is a higher-level grouping entity (e.g., "Junior Squad 2008", "Corporate League").

- **Structure:** Contains a list of `members` (Players/Ghosts) and `admins` (Coaches).
- **Purpose:** Allows coaches to organize players into logical groups.
- **Integration:** When creating a Ghost Player, the coach can immediately assign them to a specific Community.

---

## 6\. Directory Structure & Key Files

```text
src/
├── app/
│   ├── (page)/              # Protected routes (Dashboard, Profile, etc.)
│   ├── rooms/               # Room lists, details, and standings
│   ├── login/               # Authentication pages
│   ├── register/            # Registration with "Claim Profile" logic
│   ├── mobile/              # Mobile-optimized views
│   ├── admin/               # Global Admin Panel (Super Admins)
│   └── manage/              # [NEW] Coach Management Console
│       ├── layout.tsx       # Coach sidebar navigation
│       ├── players/         # Ghost player management & creation
│       └── communities/     # Community creation & details
│           ├── [communityId]/ # Single community view
├── components/
│   ├── AiAssistant.tsx      # AI Chat Interface (Genkit integration)
│   ├── RecordBlock.tsx      # Manual match entry component
│   ├── communities/         # [NEW] Community-related components
│   │   └── CreateCommunityDialog.tsx
│   ├── layout/
│   │   └── Navbar.tsx       # Dynamic navigation based on roles (Coach/Admin/Player)
│   ├── rooms/
│   │   ├── CreateRoomDialog.tsx # Room creation (Mode, K-Factor, Seeding)
│   │   ├── RoomHeader.tsx       # Room metadata & Visual Theme
│   │   └── StandingsTable.tsx   # Dynamic leaderboard based on Mode
│   └── ...
├── contexts/
│   ├── AuthContext.tsx      # User profile, auth state, & role checks
│   └── SportContext.tsx     # Active sport switcher & DB config
├── lib/
│   ├── elo.ts               # Client-side wrapper for Cloud Function call
│   ├── season.ts            # Season statistics & sorting logic (Mode-aware)
│   ├── firebase.ts          # Firebase Client SDK initialization
│   └── types.ts             # TS Interfaces (User, Room, Match, Community, GhostUser)
functions/
├── src/
│   ├── index.ts             # Cloud Functions (recordMatch, aiSaveMatch)
│   ├── config.ts            # Collection names configuration
│   ├── lib/
│   │   └── eloMath.ts       # Shared ELO math logic (K-factor, Delta)
│   └── ...
```

---

## 7\. ELO Rating System Details

### The Dual-Layer Formula

**Calculation Location:** Server-side (Cloud Functions).
The client sends raw match data, and the server calculates both Global and Room ratings using `functions/src/lib/eloMath.ts`.

#### 1\. Global ELO (Always Professional)

- Used for cross-room skill comparison.
- **Formula:** Standard ELO ($R_a' = R_a + K \cdot (S_a - E_a)$).
- **K-Factor:** Always fixed at `32`.
- **Type:** Zero-Sum.

#### 2\. Room ELO (Mode Dependent)

Calculated using the **current room ratings** of the players (not Global).

- **Office Mode:**
  - Base K = 32.
  - If Delta \< 0 (Loss): $\text{FinalDelta} = \text{Delta} \times 0.8$.
- **Professional Mode:**
  - **Dynamic K (Provisional):**
    - If `matchesPlayed < 10`: $K = \text{BaseK} \times 2$. (Calibration Phase)
    - If `matchesPlayed >= 10`: $K = \text{BaseK}$.
  - **Base K:** Configured in room settings (default 32).
  - Logic: Standard Zero-Sum.
- **Arcade Mode:**
  - K = 0. Delta is always 0.

---

## 8\. Database Structure (Firestore)

The database is partitioned by sport (`pingpong`, `tennis`, `badminton`) for matches and rooms, but Users and Communities are shared/global.

### Users Collection (`users`)

Stores profile data, roles, ghost status, and nested statistics per sport.

```json
users/{uid}
{
  "uid": "string",
  "displayName": "string",
  "email": "string",

  // Role & Type
  "accountType": "player" | "coach",
  "roles": ["player", "coach"],

  // Ghost / Management Fields
  "isGhost": boolean,
  "managedBy": "string (Coach UID)", // If ghost, who created them
  "isClaimed": boolean, // If true, this is an archived ghost
  "claimedBy": "string (Real User UID)", // Link to the new real user
  "communityIds": ["string (CommunityID)"], // Membership references

  // Statistics (New Structure)
  "rooms": ["string (RoomID)"],
  "sports": {
    "pingpong": {
      "globalElo": "number", // Persistent True Skill
      "wins": "number",
      "losses": "number",
      "eloHistory": [{ "ts": "ISO", "elo": 1200 }]
    },
    "tennis": {
      "globalElo": "number",
      "wins": "number",
      "losses": "number",
      "aces": "number",
      "doubleFaults": "number",
      "winners": "number",
      "eloHistory": [...]
    }
    // ... badminton
  }
}
```

### Communities Collection (`communities`)

Groups of players managed by coaches.

```json
communities/{communityId}
{
  "id": "string",
  "name": "string",
  "description": "string",
  "ownerId": "string (Coach UID)",
  "admins": ["string (Coach UIDs)"],
  "members": ["string (Player/Ghost UIDs)"],
  "roomIds": ["string (RoomID)"], // Auto-linked rooms
  "createdAt": "string (ISO)",
  "avatarURL": "string | null"
}
```

### Rooms Collections (`rooms-pingpong`, etc.)

Stores league configuration and embedded member data.

```json
rooms-pingpong/{roomId}
{
  "id": "string",
  "name": "string",
  "mode": "string ('office' | 'professional' | 'arcade')",
  "kFactor": "number (Base K)",
  "useGlobalElo": "boolean", // Did we seed from global?
  "isRanked": "boolean",
  "members": [
    {
      "userId": "string",
      "name": "string",
      "rating": "number (Room ELO - Independent)",
      "globalElo": "number (Snapshot for display)",
      "wins": "number (In this room)",
      "losses": "number (In this room)",
      "role": "string",
      "totalMatches": "number", // Cached stats
      "longestWinStreak": "number"
    }
  ],
  "rankHistories": {
     "USER_UID": [{ "ts": "ISO", "rating": 1200, "place": 1 }]
  },
  "seasonHistory": [...]
}
```

### Matches Collections (`matches-pingpong`, etc.)

Stores details of **both** rating changes.

```json
matches-pingpong/{matchId}
{
  "id": "string",
  "roomId": "string",
  "players": ["uid1", "uid2"],
  "winner": "string",
  "isRanked": "boolean",
  "tsIso": "string (ISO)",

  "player1": {
    "name": "string",
    "scores": "number", // or sets for tennis
    "side": "left | right",

    // GLOBAL TRACKING
    "oldRating": "number",
    "newRating": "number",
    "addedPoints": "number",

    // ROOM TRACKING (Used for Standings)
    "roomOldRating": "number",
    "roomNewRating": "number",
    "roomAddedPoints": "number",

    // Tennis Stats (Optional)
    "aces": "number",
    "doubleFaults": "number",
    "winners": "number"
  },
  // ... player2
}
```

---

## 9\. Workflows

### A. Ghost Player Lifecycle

1.  **Create:** Coach goes to `/manage/players` -\> "Create Ghost Player".
2.  **Assign:** Coach selects a Community (optional) during creation.
3.  **Play:** Ghost appears in search results and can be added to rooms. Matches are recorded normally against the Ghost's ID.
4.  **Invite:** Coach clicks "Copy Invite Link" (`.../register?claim=GHOST_ID`).
5.  **Claim:** User opens link -\> Registers.
    - System detects `claim` param.
    - New user document created with stats copied from Ghost document.
    - Ghost document updated to `isClaimed: true` / `isGhost: false`.

### B. Community Management

1.  **Create:** Coach creates a Community via `/manage/communities`.
2.  **Populate:** Coach adds new Ghost Players directly into the Community or assigns existing ones.
3.  **View:** Coach can view the roster and jump to individual player profiles.

### C. Match Entry (Server-Side)

**File:** `functions/src/index.ts` (Function: `recordMatch`)

1.  **Client:** Collects scores and calls `recordMatch` Cloud Function.
2.  **Server:** - Validates user auth and permissions.
    - Fetches Room config and User profiles.
    - Calculates Global ELO change (always K=32).
    - Calculates Room ELO change (based on Room Mode & K-Factor).
3.  **Batch Write:** Atomically updates:
    - `matches` collection (new doc).
    - `rooms` collection (updates `members` array stats).
    - `users` collection (updates global stats & history).

### D. Season Finalization

**File:** `src/lib/season.ts`

1.  Fetch all matches for the room.
2.  Re-calculate statistics (Wins/Losses/Streaks).
3.  **Sort Leaderboard:**
    - **Office:** Sort by `AdjPoints` (Activity biased).
    - **Professional:** Sort by `RoomRating` (Skill biased).
    - **Arcade:** Sort by `Wins`.
4.  Save snapshot to `seasonHistory` and award Achievements.

### E. AI Assistant

**File:** `functions/src/index.ts`
The server-side AI handler `aiSaveMatch` implements the **exact same logic** as `recordMatch`. It parses natural language input into structured match data and then applies the standard ELO math logic.

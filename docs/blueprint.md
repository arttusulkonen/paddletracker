# Smashlog — Architectural Blueprint

## 1. Project Overview

**Smashlog** is a progressive web application (PWA) designed to track ELO ratings, manage match history, and organize tournaments for racket sports.
**Supported Sports:** Ping-Pong, Tennis, Badminton.

The platform caters to two primary audience groups:

1.  **Individual Players:** Tracking their own progress, joining rooms, and competing.
2.  **Coaches & Organizers:** Managing player groups (Communities), tracking student progress, and organizing private leagues.

The core philosophy is a **Dual-Rating System**:

1.  **Global ELO:** A persistent, strict zero-sum rating (True Skill) that follows the player everywhere. Used primarily for "The Big Picture" and seeding new rooms.
2.  **Room ELO:** A local, seasonal rating specific to a private room.
    - **Independence:** By default, everyone starts from **1000** in a new room (fresh start), unless specific room modes dictate otherwise.
    - **Rules:** The calculation rules (Inflation, K-Factor, Volatility, Resets) are dictated by the Room's **Game Mode**.

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

### Hardware Integration (Planned)

- **Controllers:** Zero Delay USB Encoders
- **Input Detection:** Gamepad API (Web Native)

---

## 3. User Roles & Account Types

The system distinguishes between user roles to tailor the interface and capabilities.

### A. Account Types (Registration Choice)

- **Player:** Standard user. Can join rooms, record matches, and view their own stats.
- **Coach / Organizer:** Extended capabilities. Can create **Communities**, manage **Ghost Players**, and view the "Management Console" (`/manage`). Not visible on public leaderboards.

### B. System Roles

- **Global Admin (Super Admin):** Has access to the system-wide Admin Panel (`/admin/users`, `/admin/rooms`) to manage all users and content.
- **Room Admin:** Creator of a specific room. Can manage settings and kick members.
- **Community Owner:** Creator of a community. Can assign admins and manage members.

---

## 4. Game Modes & Logic

When creating a room, admins select a **Game Mode** which dictates how ELO is calculated and how the leaderboard is ranked.

### A. Office League (Default)

_Designed for workplace rivalries and casual leagues where activity should be rewarded._

- **ELO Logic:** **Inflationary**. Winners gain full points, losers lose only **80%** of the calculated delta. This injects points into the system, preventing stagnation.
- **K-Factor:** Fixed at `32`.
- **Ranking Criteria:** **Adjusted Points**. Active players can outrank higher-rated campers.

### B. Professional

_Designed for serious clubs, tournaments, and competitive squads._

- **ELO Logic:** **Strict Zero-Sum** with **Provisional Ratings**.
- **Dynamic Volatility (Calibration):** For the first **10 matches** in the room, the K-Factor is **doubled**. This allows new players to quickly reach their real skill level.
- **Base K-Factor:** Customizable (16–64). Standard is `32`.
- **Seeding:** By default, everyone starts at 1000, but admins can optionally seed players based on their Global ELO.
- **Ranking Criteria:** **Room Rating** (Pure ELO).

### C. Derby

_Designed for intense, endless rivalries with short cycles and persistent history._

- **Endless Season & Sprints:** The room never truly "closes". Instead, it runs in automated cycles called **Sprints** (e.g., 1–2 weeks).
- **Starting ELO:** Players start with their **Global ELO** exactly as it is, seamlessly integrating the room with global skill levels.
- **Soft Reset:** At the end of a sprint, ratings are pulled 25% closer to 1000 to prevent runaway leaders, and a new sprint begins automatically.
- **Hall of Fame:** Persistent tracking of all-time achievements (Titles won, "Giant Slayers" for breaking 3+ win streaks, Max Streaks, Total Derby Wins).
- **Ranking Criteria:** **Room Rating** (Pure ELO).

### D. Arcade

_Designed for "just for fun" games without ranking stress._

- **ELO Logic:** **None**. K-Factor is forced to `0`. Ratings remain at 1000.
- **Ranking Criteria:** **Total Wins**.

---

## 5. Coaching & Community Features

### A. Ghost Players (Managed Profiles)

Coaches can create "Ghost Players" — placeholder accounts for students who haven't registered yet.

- **Creation:** Coach creates a profile (Name only) in the Management Console.
- **Usage:** Ghosts can be added to rooms and have matches recorded against them immediately.
- **Claiming:** Coaches can generate a unique **Invite Link** (`/register?claim={uid}`). When a real user registers via this link, they inherit the Ghost's stats, history, and community memberships. The Ghost profile is then marked as `claimed`.

### B. Communities (Groups)

A **Community** is a higher-level grouping entity (e.g., "Junior Squad 2008", "Corporate League").

- **Structure:** Contains a list of `members` (Players/Ghosts) and `admins` (Coaches).
- **Purpose:** Allows coaches to organize players into logical groups.
- **Activity Feed:** A "wall" of events (matches played, rooms created) happening within the community, visible to admins.

---

## 6. Directory Structure & Key Files

```text
src/
├── app/
│   ├── (page)/              # Protected routes (Dashboard, Profile, etc.)
│   ├── rooms/               # Room lists, details, and standings
│   ├── login/               # Authentication pages
│   ├── register/            # Registration with "Claim Profile" logic
│   ├── mobile/              # Mobile-optimized views
│   ├── admin/               # Global Admin Panel (Super Admins)
│   └── manage/              # Coach Management Console
│       ├── layout.tsx       # Coach sidebar navigation
│       ├── players/         # Ghost player management & creation
│       └── communities/     # Community creation & details
├── components/
│   ├── AiAssistant.tsx      # AI Chat Interface (Genkit integration)
│   ├── FullscreenScoreboard.tsx # Live scoreboard for physical/keyboard input
│   ├── RecordBlock.tsx      # Manual match entry component
│   ├── communities/         # Community-related components
│   ├── rooms/
│   │   ├── CreateRoomDialog.tsx # Room creation (Mode, K-Factor, Seeding)
│   │   ├── RoomHeader.tsx       # Room metadata, Visual Theme, Derby Timer
│   │   ├── DerbyHallOfFame.tsx  # Persistent stats for Derby mode
│   │   └── StandingsTable.tsx   # Dynamic leaderboard based on Mode
│   └── ...
├── contexts/
│   ├── AuthContext.tsx      # User profile, auth state, & role checks
│   └── SportContext.tsx     # Active sport switcher & DB config
├── lib/
│   ├── elo.ts               # Client-side wrapper for Cloud Function calls
│   ├── season.ts            # Season statistics, archiving, & sprint logic
│   ├── firebase.ts          # Firebase Client SDK initialization
│   └── types.ts             # TS Interfaces
functions/
├── src/
│   ├── index.ts             # Cloud Functions (recordMatch, Derby Triggers)
│   ├── config.ts            # Collection names configuration
│   ├── lib/
│   │   └── eloMath.ts       # Shared ELO math logic
│   └── ...
```

---

## 7. Core Features & Workflows

### A. Ghost Player Lifecycle

1. **Create:** Coach goes to `/manage/players` -> "Create Ghost Player".
2. **Play:** Ghost appears in search results. Matches are recorded normally against the Ghost's ID.
3. **Claim:** User opens link (`/register?claim=GHOST_ID`) -> Registers. System copies stats, updates community links, and marks ghost as `isClaimed`.

### B. Match Entry (Manual vs Scoreboard)

**1. Manual Entry (Traditional)**
Users fill out standard forms (e.g., `PingPongRecordBlock.tsx`) entering final scores. Sent to the server via Cloud Functions.

**2. Live Scoreboard (Fullscreen)**

- **File:** `src/components/FullscreenScoreboard.tsx`
- **Flow:** Setup (Room/Players) -> Waiting -> Match in Progress -> Series Results.
- **Features:** Keyboard shortcuts for scoring, undo, side switching, and match series aggregation.
- **Submission:** Submits an entire series of matches in one payload via `aiSaveMatch` cloud function. Dispatches a custom `match-recorded` event to automatically refresh background feeds.
- **TODO [Hardware Integration]:** Hook up `Gamepad API` event listeners inside the Scoreboard component when the physical USB Arcade Controllers arrive. Replace/augment keyboard `keydown` events with `gamepadconnected` and polling logic.

### C. Season Finalization (Classic vs. Derby)

**File:** `src/lib/season.ts`

**For Classic Modes (Office / Pro / Arcade):**

1. Admin clicks "Finish Season".
2. System calculates final standings, total wins, and longest streaks.
3. Snapshots the results into the room's `seasonHistory` array.
4. Awards achievements (medals) to top players' user profiles.
5. Sets **`isArchived: true`** on the room. The room becomes a read-only historical monument. No matches are deleted, and no stats are reset.

**For Derby Mode (Sprints):**

1. Triggered automatically via Cloud Functions (or manual override).
2. Calculates sprint standings, snapshots to `seasonHistory`, and awards achievements (`derbyChampion`, `derbyUnstoppable`).
3. Updates the persistent **Hall of Fame** inside the room document with new titles, slayers, and total wins.
4. Performs a **Soft Reset**: `newRating = 1000 + (oldRating - 1000) * 0.75`.
5. Resets sprint-specific stats (`wins`, `losses`, `currentStreak`) to 0.
6. Updates `sprintStartTs` and increments `sprintCount` to begin the next sprint automatically. The room remains active.

---

## 8. ELO Rating System Details

### The Dual-Layer Formula

**Calculation Location:** Server-side (Cloud Functions).
The client sends raw match data, and the server calculates both Global and Room ratings simultaneously.

#### 1. Global ELO (Always Professional)

- Used for cross-room skill comparison.
- **Formula:** Standard ELO.
- **K-Factor:** Always fixed at `32`.
- **Type:** Zero-Sum.

#### 2. Room ELO (Mode Dependent)

Calculated using the **current room ratings** of the players (not Global).

- **Office Mode:** Base K = 32. If Delta < 0 (Loss), multiply by 0.8.
- **Professional Mode:** Provisional K (matches < 10) = Base K \* 2. Normal matches use Base K. Zero-Sum.
- **Derby Mode:** Same zero-sum logic as Professional, but room ratings undergo a 25% Soft Reset towards 1000 at the end of each Sprint.
- **Arcade Mode:** K = 0. Delta is always 0.

---

## 9. Database Structure (Firestore)

The database is partitioned by sport (`pingpong`, `tennis`, `badminton`) for matches and rooms, but Users and Communities are shared/global.

### Users Collection (`users`)

Stores profile data, roles, ghost status, achievements, and nested statistics per sport.

```json
users/{uid}
{
  "uid": "string",
  "displayName": "string",
  "email": "string",
  "accountType": "player" | "coach",
  "isGhost": boolean,
  "managedBy": "string (Coach UID)",
  "achievements": [
    {
      "type": "seasonFinish | derbyChampion | derbyUnstoppable",
      "sport": "pingpong",
      "dateFinished": "string",
      "roomName": "string",
      "place": 1
    }
  ],
  "sports": {
    "pingpong": {
      "globalElo": "number",
      "wins": "number",
      "losses": "number",
      "eloHistory": [{ "ts": "ISO", "elo": 1200 }]
    }
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
  "ownerId": "string (Coach UID)",
  "admins": ["string (Coach UIDs)"],
  "members": ["string (Player/Ghost UIDs)"],
  "roomIds": ["string (RoomID)"]
}
```

### Rooms Collections (`rooms-pingpong`, etc.)

Stores league configuration, Derby settings, and embedded member data.

```json
rooms-pingpong/{roomId}
{
  "id": "string",
  "name": "string",
  "mode": "string ('office' | 'professional' | 'arcade' | 'derby')",
  "kFactor": "number (Base K)",
  "isArchived": "boolean", // True if the season was manually finished (Read-Only)

  // Derby Specific Fields
  "sprintDuration": "number (weeks)",
  "sprintStartTs": "number (Epoch ms)",
  "sprintCount": "number",
  "hallOfFame": [
    {
      "userId": "string",
      "name": "string",
      "titles": "number",
      "streaksBroken": "number",
      "maxStreakEver": "number",
      "totalDerbyWins": "number"
    }
  ],

  "members": [
    {
      "userId": "string",
      "name": "string",
      "rating": "number (Room ELO)",
      "wins": "number",
      "losses": "number",
      "currentStreak": "number",
      "highestStreak": "number",
      "badges": ["string ('giant_slayer')"]
    }
  ],
  "seasonHistory": [...]
}
```

### Matches Collections (`matches-pingpong`, etc.)

Stores details of **both** global and room rating changes.

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
    "scores": "number",
    "addedPoints": "number (Global Delta)",
    "roomAddedPoints": "number (Room Delta)"
  }
}
```

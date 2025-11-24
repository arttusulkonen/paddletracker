Here is the fully updated and detailed **blueprint.md** in English, reflecting the current state of your project, including the latest AI architecture with Gemini 2.0 Flash, the specific ELO logic, and the database structure.

---

# Smashlog (PaddleTracker) — Architectural Blueprint

## 1\. Project Overview

**Smashlog** is a progressive web application (PWA) designed to track ELO ratings, manage match history, and organize tournaments for racket sports.
**Supported Sports:** Ping-Pong, Tennis, Badminton.

The core philosophy is a **dual-rating system**: players have a **Global ELO** (persists across all games) and a **Room ELO** (specific to a private club or league).

---

## 2\. Technology Stack

### Frontend

- **Framework:** Next.js 14 (App Router)
- **Language:** TypeScript
- **Styling:** Tailwind CSS, Shadcn UI
- **Icons:** Lucide React
- **State Management:** React Context API (`AuthContext`, `SportContext`)
- **Internationalization:** i18next (Hybrid: Local JSON + Firestore overrides)

### Backend (Firebase)

- **Auth:** Firebase Authentication (Email/Password, Social)
- **Database:** Cloud Firestore (NoSQL)
- **Storage:** Firebase Storage (Avatars)
- **Compute:** Cloud Functions (2nd Gen)
- **AI Engine:** Google Genkit + Gemini 2.0 Flash

---

## 3\. Directory Structure & Key Files

```text
src/
├── app/
│   ├── (page)/           # Protected routes (Dashboard, Profile, etc.)
│   ├── rooms/            # Room lists and details
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
│   ├── elo.ts            # Client-side ELO logic & Firestore transactions
│   ├── firebase.ts       # Firebase Client SDK initialization
│   └── types.ts          # TS Interfaces (User, Room, Match)
functions/
├── src/
│   ├── index.ts          # Cloud Functions (aiChat, aiSaveMatch, user delete)
│   ├── config.ts         # Collection names configuration
│   └── lib/
│       └── eloMath.ts    # Server-side ELO math (mirrors client logic)
```

---

## 4\. ELO Rating System

### Configuration

- **Algorithm:** Standard ELO Rating System.
- **K-Factor:** `32` (High volatility for dynamic rank adjustments).
- **Starting Rating:** `1000`.

### Logic Locations

1.  **Client-Side:** `src/lib/elo.ts` (Used for manual entry in `RecordBlock`).
2.  **Server-Side:** `functions/src/lib/eloMath.ts` (Used for AI-processed matches).

### The Formula

For Player A ($R_a$) vs Player B ($R_b$):

1.  **Calculate Expected Score ($E_a$):**
    $$E_a = \frac{1}{1 + 10^{(R_b - R_a) / 400}}$$

2.  **Calculate New Rating ($R'_a$):**
    $$R'_a = R_a + 32 \times (S_a - E_a)$$
    _Where $S_a$ is the actual score (1 for win, 0 for loss)._

### Dual-Layer Updates

Every match triggers **four** rating updates:

1.  Player 1 **Global** Rating.
2.  Player 2 **Global** Rating.
3.  Player 1 **Room** Rating (Specific to the room where the match was played).
4.  Player 2 **Room** Rating.

---

## 5\. Database Structure (Firestore)

The database is segmented by sport to ensure scalability.

### Users Collection (`users`)

A single collection for all users.

```json
users/{uid}
{
  "uid": "string",
  "displayName": "Pekka",
  "email": "pekka@example.com",
  "photoURL": "url",
  "friends": ["uid2", "uid3"],
  // Nested object for sport-specific global stats
  "sports": {
    "pingpong": {
      "globalElo": 1200,
      "wins": 15,
      "losses": 5,
      "eloHistory": [{ "ts": "ISO", "elo": 1200 }]
    },
    "tennis": { ... }
  }
}
```

### Rooms Collections (`rooms-pingpong`, `rooms-tennis`, etc.)

Stores leagues/clubs data.

```json
rooms-pingpong/{roomId}
{
  "id": "roomId",
  "name": "Office League",
  "isRanked": true,
  "memberIds": ["uid1", "uid2"], // For security rules & quick lookup
  "members": [
    {
      "userId": "uid1",
      "name": "Pekka",
      "rating": 1050, // <-- ROOM-SPECIFIC ELO
      "wins": 5,
      "losses": 1,
      "role": "admin"
    }
  ]
}
```

### Matches Collections (`matches-pingpong`, `matches-tennis`, etc.)

Stores individual match records.

```json
matches-pingpong/{matchId}
{
  "roomId": "roomId",
  "timestamp": "19.11.2025 18:30:00",
  "tsIso": "2025-11-19T18:30:00.000Z",
  "winner": "Pekka",
  "players": ["uid1", "uid2"], // For composite indexes
  "player1": {
    "name": "Pekka",
    "scores": 11,
    "side": "left",
    "oldRating": 1000,      // Global ELO Before
    "newRating": 1016,      // Global ELO After
    "roomOldRating": 1000,  // Room ELO Before
    "roomNewRating": 1016   // Room ELO After
  },
  "player2": {
    "name": "Jukka",
    "scores": 9,
    "side": "right",
    // ... ratings ...
  }
}
```

---

## 6\. Match Submission Workflows

### A. Manual Entry (UI)

**File:** `src/components/RecordBlock.tsx`

1.  User selects "Player 1", "Player 2", and enters scores.
2.  **Validation:** Client checks if score is valid (e.g., 11-9).
3.  **Calculation:** `src/lib/elo.ts` calculates the new ratings locally.
4.  **Transaction:** A Firestore Batch is committed:
    - `matches-{sport}`: Create new doc.
    - `rooms-{sport}`: Update `members` array with new Room ELOs.
    - `users/{uid1}`: Update Global ELO, win count, history.
    - `users/{uid2}`: Update Global ELO, loss count, history.

### B. AI Assistant (Chat)

**Files:** `src/components/AiAssistant.tsx` -\> `functions/src/index.ts`

1.  **User Input:** "Pekka vs Jukka 11-9, 11-8".
2.  **Step 1: Parsing (`aiChat` Cloud Function)**
    - Uses **Gemini 2.0 Flash**.
    - System Prompt: Acts as a strict JSON parser.
    - Output: `{ type: "MATCH_DRAFT", data: { matches: [...] } }`.
3.  **Verification:** Frontend displays a draft form for user confirmation.
4.  **Step 2: Execution (`aiSaveMatch` Cloud Function)**
    - Frontend sends confirmed JSON + `roomId` to backend.
    - **Fuzzy Search:** Backend searches Firestore for players using Levenshtein distance (handling typos like "Peka").
    - **Calculation:** Server calculates ELO (`functions/src/lib/eloMath.ts`).
    - **Transaction:** Server executes Firestore Batch write (same structure as Manual Entry).

---

## 7\. AI Architecture

The AI is implemented using **Firebase Genkit**.

- **Model:** `googleai/gemini-2.0-flash` (Chosen for speed and stability).
- **Functions:**
  1.  **`aiChat`**: A stateless callable function. It takes text + context (sport, username) and returns structured JSON or conversational text. It does **not** write to the DB directly.
  2.  **`aiSaveMatch`**: A deterministic callable function. It takes validated match data, performs DB lookups, math, and writes. It does **not** use the LLM (to ensure data integrity).

---

## 8\. Composite Indexes

Due to the data structure, complex queries require `firestore.indexes.json`.
**Critical Index:**

- Collection: `matches-pingpong`
- Fields: `players` (Array Contains) + `tsIso` (Descending)
- _Purpose:_ Allows querying "Show me the recent match history for Player X".

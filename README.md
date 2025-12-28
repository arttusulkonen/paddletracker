# Smashlog 🏓 🎾 🏸

**The ultimate competitive platform for Ping-Pong, Tennis, and Badminton.**
Built for serious athletes, office leagues, and sports communities.

Smashlog goes beyond simple scorekeeping. It allows coaches to manage students ("Ghost Players"), communities to organize leagues, and players to track their "True Skill" across different environments using advanced ELO mathematics.

## 🌟 Key Features

### 🎭 Role-Based System

- **Players:** Track stats, climb leaderboards, join multiple rooms.
- **Coaches/Organizers:** Manage communities and tournaments, create "Ghost Profiles" for students, and record matches without affecting their own stats. Coaches are hidden from leaderboards.

### 👻 Ghost Profiles & Claiming

- Coaches can create placeholder profiles for unregistered players to track their progress immediately.
- **Claim System:** Real users can "claim" a ghost profile via a unique invite link, merging their account with the ghost's history and stats seamlessly.

### 🏠 Room Modes (The Math Behind)

| Mode                 | Description                      | Math Logic                                                                                                                  |
| :------------------- | :------------------------------- | :-------------------------------------------------------------------------------------------------------------------------- |
| **Professional** 🏆  | Zero-sum game for serious clubs. | Strict ELO (K-Factor 32). Optional "Calibration Phase" (2x K-Factor) for new players.                                       |
| **Office League** 💼 | For workplace morale.            | **Inflationary System:** Losses are penalized at 80%. Rankings use "Adjusted Points" to reward activity over pure win rate. |
| **Arcade** 👾        | For fun and casual play.         | No ELO changes. Leaderboard based on total wins only.                                                                       |

### 📊 Dual-Rating Architecture

1.  **Global ELO:** Your "Passport". Follows you everywhere and never resets.
2.  **Room ELO:** Specific to a private league. Resets every **Season**.

### 🧠 AI Match Recorder

Powered by **Google Genkit + Gemini 2.0 Flash**.

- Simply type or speak: _"Alex beat Bob 11-9 in ping pong"_
- The AI parses names, scores, and creates the match draft automatically.

---

## 🛠 Tech Stack

### Frontend

- **Framework:** Next.js 15 (App Router)
- **Language:** TypeScript
- **UI Library:** React 19, Shadcn UI, Tailwind CSS
- **State Management:** React Context (Auth, Sport)
- **Visualization:** Recharts (ELO history graphs)
- **Internationalization:** i18next

### Backend (Serverless)

- **Database:** Cloud Firestore (NoSQL)
- **Auth:** Firebase Auth
- **Logic:** Firebase Cloud Functions (v2)
  - _Complex ELO calculations are performed server-side to ensure integrity._
  - _Profile merging and deletions are handled via secure transactions._
- **AI:** Google Genkit

---

## 📂 Project Structure

```bash
├── functions/               # Firebase Cloud Functions (Backend)
│   ├── src/
│   │   ├── index.ts         # Entry point (Triggers & Callables)
│   │   ├── lib/eloMath.ts   # Core ELO algorithms
│   │   └── config.ts        # Sport-specific collection configs
├── src/
│   ├── app/                 # Next.js App Router
│   │   ├── (auth)/          # Login/Register pages
│   │   ├── manage/          # Coach/Admin dashboards
│   │   ├── profile/         # User profiles & stats
│   │   └── rooms/           # League pages
│   ├── components/
│   │   ├── communities/     # Community settings & feed
│   │   ├── record-blocks/   # Sport-specific score inputs
│   │   └── ui/              # Shadcn UI primitives
│   ├── contexts/            # Global state (Auth, Sport selection)
│   ├── lib/
│   │   ├── elo.ts           # Client-side helpers
│   │   ├── season.ts        # Season finalization logic
│   │   └── types.ts         # TypeScript interfaces (Room, UserProfile, Match)
├── firebase.rules           # Firestore Security Rules
└── firebaserc               # Project configuration
```

## 🔐 Security & Permissions

Smashlog uses a hybrid security model:

1. **Firestore Rules:**

- **Read:** Most data is public-read (if `isPublic: true`) or restricted to room members.
- **Write:** Users can only update their own profiles.
- **Invites:** A special rule allows users to update the `rooms` array of _other_ users only for invitations.

2. **Cloud Functions:**

- Critical operations (Recording matches, Calculating ELO, Merging profiles) are executed in a trusted server environment to prevent cheating.

## 🚀 Getting Started

### Prerequisites

- Node.js 18+
- Firebase CLI (`npm install -g firebase-tools`)

### Installation

1. **Clone and Install:**

```bash
git clone [https://github.com/your-repo/smashlog.git](https://github.com/your-repo/smashlog.git)
cd smashlog
npm install
```

2. **Environment Setup:**
   Create a `.env.local` file with your keys:

```env
NEXT_PUBLIC_FIREBASE_API_KEY=...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=...
NEXT_PUBLIC_FIREBASE_PROJECT_ID=...
# ... other firebase config
GOOGLE_GENAI_API_KEY=...
```

3. **Run Development Server:**

```bash
npm run dev
```

4. **Deploy Backend:**

```bash
firebase deploy --only functions
```

## 🤝 Contributing

Contributions are welcome! Please ensure you do not modify `src/lib/season.ts` or `functions/src/lib/eloMath.ts` without understanding the rating inflation implications.

## 📄 License

This project is licensed under the MIT License.

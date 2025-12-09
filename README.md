# Smashlog (PaddleTracker)

The ultimate multi-sport ELO tracker for Ping-Pong, Tennis, and Badminton.
Built for individual players, coaches, and clubs.

## Features

- **Multi-Sport Support:** Track stats separately for Table Tennis, Tennis, and Badminton.
- **Dual-Rating System:**
  - **Global ELO:** Your "True Skill" that follows you everywhere.
  - **Room ELO:** Seasonal ratings specific to private leagues.
- **Game Modes:**
  - 🏆 **Professional:** Zero-sum ELO with calibration matches.
  - 💼 **Office League:** Inflationary system to encourage participation.
  - 👾 **Arcade:** Fun mode, tracks wins only.
- **Coaching Tools:** Manage "Ghost Players" (students) and Communities.
- **AI Assistant:** Record matches by typing natural language (e.g., "Alex beat Bob 11-9").
- **PWA:** Installable on mobile devices.

## Tech Stack

- **Frontend:** Next.js 15, React 19, Tailwind CSS, Shadcn UI
- **Backend:** Firebase (Auth, Firestore, Storage, Cloud Functions)
- **AI:** Google Genkit + Gemini 2.0 Flash

## Getting Started

1.  **Install dependencies:**

    ```bash
    npm install
    ```

2.  **Run development server:**

    ```bash
    npm run dev
    ```

3.  **Deploy:**
    ```bash
    npm run deploy
    ```

## Project Structure

- `src/app`: Next.js App Router pages.
- `src/components`: UI components.
- `src/lib`: Logic & Utilities.
- `functions/`: Cloud Functions backend.
- `docs/`: Detailed documentation and schemas.

## Security

Database writes are restricted to server-side Cloud Functions to ensure ELO integrity. Client-side writes are disabled for critical collections.

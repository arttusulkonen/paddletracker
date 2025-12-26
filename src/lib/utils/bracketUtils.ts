
/* ───────── helpers ───────── */
export const makeRound = (idx: number, type: string, label: string) => ({
  roundIndex: idx,
  type,
  label,
  status: "pending",
  matches: [] as any[],
})

export const sortRounds = (br: any) =>
  br.rounds.sort((a: any, b: any) => a.roundIndex - b.roundIndex)

/* ───────── таблица результатов ───────── */
export function computeTable(matches: any[]) {
  const t: Record<string, any> = {}

  for (const m of matches) {
    const p1 = m.player1?.userId
    const p2 = m.player2?.userId
    if (!p1 || !p2) continue

    /* ensure rows */
    if (!t[p1])
      t[p1] = { userId: p1, name: m.player1.name, wins: 0, losses: 0, pf: 0, pa: 0 }
    if (!t[p2])
      t[p2] = { userId: p2, name: m.player2.name, wins: 0, losses: 0, pf: 0, pa: 0 }

    /* points */
    t[p1].pf += m.scorePlayer1 ?? 0
    t[p1].pa += m.scorePlayer2 ?? 0
    t[p2].pf += m.scorePlayer2 ?? 0
    t[p2].pa += m.scorePlayer1 ?? 0

    /* wins / losses */
    if (typeof m.winner === "string") {
      t[m.winner].wins += 1
      const loser = m.winner === p1 ? p2 : p1
      t[loser].losses += 1
    }
  }

  const arr = Object.values(t).sort(
    (a: any, b: any) =>
      b.wins - a.wins ||
      (b.pf - b.pa) - (a.pf - a.pa) ||
      a.name.localeCompare(b.name)
  )

  arr.forEach((p, i) => (p.place = i + 1))
  return arr
}

/* ───────── генерация плей‑офф раундов ───────── */
export function seedKnockoutRounds(bracket: any) {
  const rr = bracket.rounds.find((r: any) => r.type === "roundRobin")
  let quarters = bracket.rounds.find((r: any) => r.type === "knockoutQuarters")
  let semis = bracket.rounds.find((r: any) => r.type === "knockoutSemis")
  let bronze = bracket.rounds.find((r: any) => r.type === "knockoutBronze")
  let final = bracket.rounds.find((r: any) => r.type === "knockoutFinal")

  /* гарантируем наличие базовых плей‑офф раундов */
  if (!semis) { semis = makeRound(1, "knockoutSemis", "Semi-finals"); bracket.rounds.push(semis) }
  if (!bronze) { bronze = makeRound(2, "knockoutBronze", "3rd-place"); bracket.rounds.push(bronze) }
  if (!final) { final = makeRound(3, "knockoutFinal", "Finals"); bracket.rounds.push(final) }

  /* ───── 1. После окончания Round‑Robin ───── */
  if (rr && rr.status === "finished" && semis.status === "pending" && !(quarters?.matches.length)) {
    const seeds = computeTable(rr.matches)

    if (seeds.length <= 4) {
      semis.matches = [
        {
          matchId: `${semis.roundIndex}-0`, matchStatus: "notStarted",
          player1: seeds[0], player2: seeds[3], scorePlayer1: 0, scorePlayer2: 0, winner: null,
        },
        {
          matchId: `${semis.roundIndex}-1`, matchStatus: "notStarted",
          player1: seeds[1], player2: seeds[2], scorePlayer1: 0, scorePlayer2: 0, winner: null,
        },
      ]
      semis.status = "inProgress"
      bronze.status = "pending"
      final.status = "pending"
      bracket.currentRound = semis.roundIndex
      return
    }

    if (!quarters) {
      quarters = makeRound(1, "knockoutQuarters", "Quarter-finals")
      bracket.rounds.push(quarters)
      semis.roundIndex = 2
      bronze.roundIndex = 3
      final.roundIndex = 4
    }

    const byes = seeds.length - 4          /* 6 игроков → 2 byes */
    const playing = seeds.slice(byes)
    const pairs: [any, any][] = []
    for (let i = 0; i < playing.length / 2; i++)
      pairs.push([playing[i], playing[playing.length - 1 - i]])

    quarters.matches = pairs.map((p, i) => ({
      matchId: `${quarters.roundIndex}-${i}`,
      matchStatus: "notStarted",
      player1: p[0], player2: p[1], scorePlayer1: 0, scorePlayer2: 0, winner: null,
    }))

    quarters.status = "inProgress"
    semis.status = "pending"
    bronze.status = "pending"
    final.status = "pending"
    bracket.currentRound = quarters.roundIndex
    sortRounds(bracket)
    return
  }

  /* ───── 2. После четверть‑финалов ───── */
  if (quarters && quarters.status === "finished" && semis.status === "pending") {
    const seeds = computeTable(rr.matches)
    const byes = seeds.length - 4
    const byeSeeds = seeds.slice(0, byes)
    const qWin = quarters.matches.map((m: any) =>
      m.winner === m.player1.userId ? m.player1 : m.player2)
    const lineup = [...byeSeeds, ...qWin]   // 4 игроков
    if (lineup.length !== 4) return           // ещё не все сыграны

    semis.matches = [
      {
        matchId: `${semis.roundIndex}-0`, matchStatus: "notStarted",
        player1: lineup[0], player2: lineup[3], scorePlayer1: 0, scorePlayer2: 0, winner: null,
      },
      {
        matchId: `${semis.roundIndex}-1`, matchStatus: "notStarted",
        player1: lineup[1], player2: lineup[2], scorePlayer1: 0, scorePlayer2: 0, winner: null,
      },
    ]
    semis.status = "inProgress"
    bracket.currentRound = semis.roundIndex
    return
  }

  /* ───── 3. После полуфиналов ───── */
  if (semis && semis.status === "finished" && bronze.status === "pending") {
    const losers = semis.matches.map((m: any) =>
      m.winner === m.player1.userId ? m.player2 : m.player1)
    bronze.matches = [{
      matchId: `${bronze.roundIndex}-0`, matchStatus: "notStarted",
      player1: losers[0], player2: losers[1], scorePlayer1: 0, scorePlayer2: 0, winner: null,
    }]
    bronze.status = "inProgress"
    bracket.currentRound = bronze.roundIndex
    return
  }

  /* ───── 4. После матча за третье место ───── */
  if (bronze && bronze.status === "finished" && final.status === "pending") {
    const winners = semis.matches.map((m: any) => m.winner)
    if (winners.length !== 2) return

    const p1 = semis.matches[0].player1.userId === winners[0]
      ? semis.matches[0].player1
      : semis.matches[0].player2
    const p2 = semis.matches[1].player1.userId === winners[1]
      ? semis.matches[1].player1
      : semis.matches[1].player2

    final.matches = [{
      matchId: `${final.roundIndex}-0`, matchStatus: "notStarted",
      player1: p1, player2: p2, scorePlayer1: 0, scorePlayer2: 0, winner: null,
    }]
    final.status = "inProgress"
    bracket.currentRound = final.roundIndex
    return
  }

  /* ───── 5. Турнир завершён ───── */
  if (final && final.status === "finished" && bracket.stage !== "completed") {
    computeFinalStats(bracket)        // ← делегируем всю работу одной функции
  }
}

/* ───────── финальная расстановка мест ───────── */
export function computeFinalStats(bracket: any) {
  const finals = bracket.rounds.find((r: any) => r.type === "knockoutFinal")
  const bronze = bracket.rounds.find((r: any) => r.type === "knockoutBronze")

  if (!(finals?.status === "finished" && bronze?.status === "finished")) return

  /* 1️⃣  собираем абсолютно все сыгранные матчи
         (round-robin + все KO) и строим базовую таблицу */
  const allMatches = bracket.rounds.flatMap((r: any) => r.matches ?? [])
  bracket.finalStats = computeTable(allMatches)          // ← теперь точно массив

  /* 2️⃣  определяем четвёрку по фактическим матчам */
  const f = finals.matches[0]
  const b = bronze.matches[0]

  const championId = f.winner
  const runnerUpId = f.player1.userId === championId ? f.player2.userId
    : f.player1.userId
  const thirdId = b.winner

  /* 3️⃣  проставляем места вручную */
  bracket.finalStats.forEach((s: any) => {
    s.place =
      s.userId === championId ? 1 :
        s.userId === runnerUpId ? 2 :
          s.userId === thirdId ? 3 : 4
  })

  /* 4️⃣  сортировка + champion + stage */
  bracket.finalStats.sort((a: any, b: any) => a.place - b.place)
  bracket.champion = bracket.finalStats[0]
  bracket.stage = "completed"
}

/* ─────────────────────────────────────────────────────────────── */

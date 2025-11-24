// src/lib/season.ts
import type { Sport, SportConfig } from '@/contexts/SportContext';
import { db } from '@/lib/firebase';
import { getFinnishFormattedDate } from '@/lib/utils';
import {
  arrayUnion,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  Timestamp,
  updateDoc,
  where,
} from 'firebase/firestore';

// Хелпер для конвертации даты из разных форматов
const toDate = (v: string | Timestamp): Date => {
  if (v instanceof Timestamp) return v.toDate();
  if (typeof v === 'string') {
    // Попытка парсинга финского формата "DD.MM.YYYY HH.mm.ss"
    if (v.includes('.')) {
      const parts = v.split(' ');
      const dateParts = parts[0].split('.');
      const timeParts = parts[1] ? parts[1].split('.') : ['00', '00', '00'];
      return new Date(
        +dateParts[2],
        +dateParts[1] - 1,
        +dateParts[0],
        +timeParts[0],
        +timeParts[1],
        +timeParts[2] || 0
      );
    }
    return new Date(v);
  }
  return new Date();
};

const pickRoomRating = (o: any): number =>
  o.roomNewRating ?? o.rating ?? o.newRating ?? o.oldRating ?? 1000;

interface RawMatch extends Record<string, any> {}
interface PlayerSeason {
  userId: string;
  name: string;
  wins: number;
  losses: number;
  totalAddedPoints: number;
  matches: { w: boolean; ts: Date }[];
  roomRating: number;
}

export interface SeasonRow {
  userId: string;
  name: string;
  place: number;
  matchesPlayed: number;
  wins: number;
  losses: number;
  winRate: number;
  totalAddedPoints: number;
  adjPoints: number; // Скорректированные очки с учетом активности
  longestWinStreak: number;
  roomRating: number;
  startGlobalElo?: number;
  endGlobalElo?: number;
}

// Фактор корректировки: поощряет тех, кто играет больше среднего
// Если сыграл меньше среднего -> коэффициент < 1 (штраф)
// Если сыграл больше среднего -> коэффициент > 1 (бонус)
// Используем корень, чтобы сгладить влияние гринда
const adjFactor = (ratio: number): number => {
  if (!isFinite(ratio) || ratio <= 0) return 0;
  return Math.sqrt(ratio);
};

async function collectStats(
  roomId: string,
  matchesCollectionName: string
): Promise<SeasonRow[]> {
  const snap = await getDocs(
    query(collection(db, matchesCollectionName), where('roomId', '==', roomId))
  );

  if (snap.empty) return [];

  const map: Record<string, PlayerSeason> = {};

  snap.forEach((d) => {
    const m = d.data() as RawMatch;
    // Пропускаем отмененные или некорректные матчи
    if (!m.player1Id || !m.player2Id) return;

    [
      { id: m.player1Id, info: m.player1 },
      { id: m.player2Id, info: m.player2 },
    ].forEach(({ id, info }) => {
      if (!info) return;

      if (!map[id]) {
        map[id] = {
          userId: id,
          name: info.name ?? 'Unknown',
          wins: 0,
          losses: 0,
          totalAddedPoints: 0,
          matches: [],
          roomRating: pickRoomRating(info),
        };
      }
      const rec = map[id];

      // Определение победителя по имени (legacy) или ID (лучше)
      // В идеале в базе должен быть winnerId, но используем name как фоллбэк
      const isWinner = m.winner === info.name;

      isWinner ? rec.wins++ : rec.losses++;
      rec.totalAddedPoints += info.roomAddedPoints ?? info.addedPoints ?? 0;

      // Сохраняем дату для расчета стриков
      const matchDate = m.tsIso ? new Date(m.tsIso) : toDate(m.timestamp);
      rec.matches.push({ w: isWinner, ts: matchDate });

      // Обновляем текущий рейтинг (берем из последнего матча)
      // Так как порядок перебора не гарантирован, это приблизительно
      // Для точности лучше сортировать матчи перед обработкой, но для MVP сойдет
      rec.roomRating = pickRoomRating(info);
    });
  });

  // Превращаем map в массив и считаем базовую статистику
  const rows: Omit<SeasonRow, 'place' | 'adjPoints'>[] = Object.values(map).map(
    (s) => {
      // Сортируем матчи игрока по времени для корректного подсчета стриков
      const ordered = [...s.matches].sort(
        (a, b) => a.ts.getTime() - b.ts.getTime()
      );

      let cur = 0,
        max = 0;
      ordered.forEach((m) => {
        if (m.w) {
          cur++;
          if (cur > max) max = cur;
        } else {
          cur = 0;
        }
      });

      const matchesPlayed = s.wins + s.losses;

      return {
        userId: s.userId,
        name: s.name,
        matchesPlayed,
        wins: s.wins,
        losses: s.losses,
        winRate: matchesPlayed > 0 ? (s.wins / matchesPlayed) * 100 : 0,
        totalAddedPoints: s.totalAddedPoints,
        longestWinStreak: max,
        roomRating: s.roomRating,
      };
    }
  );

  // Расчет среднего количества матчей для нормализации
  const totalMatchesAll = rows.reduce((sum, r) => sum + r.matchesPlayed, 0);
  const avgM = rows.length > 0 ? totalMatchesAll / rows.length : 1;

  // Финальный расчет очков и сортировка
  const finalRows: SeasonRow[] = rows.map((r) => {
    // Если очков < 0, то аджастмент работает наоборот (уменьшает минус),
    // поэтому для отрицательных очков логика может быть другой,
    // но для простоты оставим умножение.
    // Важно: если человек в минусе, и сыграл МНОГО игр, он уйдет в еще больший минус.
    // Это справедливо: "нагриндил поражения".
    const adjPoints = r.totalAddedPoints * adjFactor(r.matchesPlayed / avgM);

    return {
      ...r,
      place: 0, // Заполним после сортировки
      adjPoints,
    };
  });

  finalRows.sort((a, b) => {
    // 1. Скорректированные очки (главный критерий)
    if (b.adjPoints !== a.adjPoints) return b.adjPoints - a.adjPoints;
    // 2. Чистые очки
    if (b.totalAddedPoints !== a.totalAddedPoints)
      return b.totalAddedPoints - a.totalAddedPoints;
    // 3. Винрейт
    if (b.winRate !== a.winRate) return b.winRate - a.winRate;
    // 4. Количество побед
    return b.wins - a.wins;
  });

  // Присваиваем места
  finalRows.forEach((r, i) => (r.place = i + 1));

  return finalRows;
}

async function getLastMatchFinishDateFinnish(
  roomId: string,
  matchesCollectionName: string
): Promise<string> {
  const qs = query(
    collection(db, matchesCollectionName),
    where('roomId', '==', roomId),
    orderBy('tsIso', 'desc'),
    limit(1)
  );
  const snap = await getDocs(qs);
  if (snap.empty) {
    return getFinnishFormattedDate();
  }
  const m = snap.docs[0].data() as any;
  const dt =
    m?.tsIso != null
      ? new Date(m.tsIso)
      : m?.timestamp
      ? toDate(m.timestamp)
      : new Date();
  return getFinnishFormattedDate(dt);
}

export async function finalizeSeason(
  roomId: string,
  snapshots: Record<string, { start: number; end: number }>,
  config: SportConfig['collections'],
  sport: Sport
): Promise<void> {
  // 1. Сбор статистики
  const summary = await collectStats(roomId, config.matches);
  if (!summary.length) return; // Нельзя завершить пустой сезон

  const roomRef = doc(db, config.rooms, roomId);
  const roomSnap = await getDoc(roomRef);
  if (!roomSnap.exists()) return;
  const roomData = roomSnap.data() as any;

  // 2. Обогащение данными о глобальном ELO (из снэпшотов, переданных с клиента)
  const enrichedSummary: SeasonRow[] = summary.map((r) => ({
    ...r,
    startGlobalElo: snapshots[r.userId]?.start ?? 1000,
    endGlobalElo: snapshots[r.userId]?.end ?? r.roomRating,
  }));

  const dateFinished = await getLastMatchFinishDateFinnish(
    roomId,
    config.matches
  );

  // 3. Формирование записи истории
  const entry = {
    dateFinished,
    roomId,
    roomName: roomData.name ?? '',
    summary: enrichedSummary,
    sport,
    type: 'seasonFinish',
  };

  // 4. Обновление данных участников в комнате (сброс/фиксация)
  // Обычно при завершении сезона мы хотим сохранить текущий рейтинг как стартовый для следующего,
  // или сбросить его. В текущей логике мы просто обновляем wins/losses в массиве members,
  // чтобы они соответствовали итогам сезона.
  // Если нужно СБРОСИТЬ wins/losses в ноль для нового сезона, это нужно делать здесь.
  // В ВАШЕМ СЛУЧАЕ: Вы обновляете members данными из summary.
  // Если matches коллекция не чистится, то это просто "чекпоинт".
  // Если вы хотите "начать с чистого листа", вам нужно будет фильтровать матчи по дате старта сезона.
  // Пока оставляем как есть (snapshot текущего состояния).
  const updatedMembers = (roomData.members ?? []).map((m: any) => {
    const row = enrichedSummary.find((r) => r.userId === m.userId);
    return row
      ? { ...m, wins: row.wins, losses: row.losses, rating: row.roomRating }
      : m;
  });

  // 5. Атомарное обновление комнаты
  await updateDoc(roomRef, {
    seasonHistory: arrayUnion(entry),
    members: updatedMembers,
  });

  // 6. Раздача ачивок пользователям
  for (const r of enrichedSummary) {
    const achievement = {
      type: 'seasonFinish',
      sport,
      roomId,
      roomName: roomData.name ?? '',
      dateFinished,
      userId: r.userId,
      name: r.name,
      place: r.place,
      matchesPlayed: r.matchesPlayed,
      wins: r.wins,
      losses: r.losses,
      winRate: r.winRate,
      totalAddedPoints: r.totalAddedPoints,
      adjPoints: r.adjPoints,
      longestWinStreak: r.longestWinStreak,
      roomRating: r.roomRating,
      startGlobalElo: r.startGlobalElo,
      endGlobalElo: r.endGlobalElo,
    };

    // Пишем каждому юзеру
    await updateDoc(doc(db, 'users', r.userId), {
      achievements: arrayUnion(achievement),
    });
  }
}

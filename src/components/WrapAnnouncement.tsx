'use client';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { useAuth } from '@/contexts/AuthContext';
import { useSport } from '@/contexts/SportContext';
import { db } from '@/lib/firebase';
import { parseFlexDate } from '@/lib/utils/date';
import confetti from 'canvas-confetti';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { Sparkles, Trophy } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

const WRAP_YEAR = 2025;
const STORAGE_KEY = `hasSeenWrap${WRAP_YEAR}`;
const MIN_MATCHES = 10;
// Показывать до 1 февраля 2026 года
const DEADLINE = new Date('2026-02-01T00:00:00').getTime();

export function WrapAnnouncement() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { config } = useSport();
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (!user) return;

    const checkEligibility = async () => {
      // 1. Проверка даты (не показываем после января 2026)
      if (Date.now() > DEADLINE) {
        return;
      }

      // 2. Проверка LocalStorage (уже видели?)
      const hasSeen = localStorage.getItem(STORAGE_KEY);
      if (hasSeen === 'true') {
        return;
      }

      try {
        // 3. Проверка количества матчей за 2025 год
        // Ищем комнаты пользователя
        const roomsQuery = query(
          collection(db!, config.collections.rooms),
          where('memberIds', 'array-contains', user.uid)
        );
        const roomsSnap = await getDocs(roomsQuery);
        const roomIds = roomsSnap.docs.map((doc) => doc.id);

        if (roomIds.length === 0) {
          return;
        }

        // Грузим матчи (упрощенно: грузим пачку и фильтруем, либо делаем сложный запрос)
        // Для оптимизации можно делать запрос с ограничением по дате, если есть индексы.
        // Здесь делаем простой вариант с where('roomId', 'in', ...)
        // ВНИМАНИЕ: Firestore where 'in' поддерживает максимум 10 ID.
        // Если комнат много, нужно делать чанками. Для простоты примера берем первые 10.
        const checkRoomIds = roomIds.slice(0, 10);

        const matchesQuery = query(
          collection(db!, config.collections.matches),
          where('roomId', 'in', checkRoomIds)
        );

        const matchesSnap = await getDocs(matchesQuery);

        let matchesCount2025 = 0;
        const start2025 = new Date(`${WRAP_YEAR}-01-01`).getTime();
        const end2025 = new Date(`${WRAP_YEAR}-12-31T23:59:59`).getTime();

        for (const doc of matchesSnap.docs) {
          const data = doc.data();
          // Проверяем участие
          if (data.player1Id !== user.uid && data.player2Id !== user.uid)
            continue;

          // Проверяем дату
          const ts = parseFlexDate(
            data.tsIso ?? data.timestamp ?? data.createdAt
          ).getTime();
          if (ts >= start2025 && ts <= end2025) {
            matchesCount2025++;
          }

          // Если уже набрали минимум, можно выходить
          if (matchesCount2025 >= MIN_MATCHES) break;
        }

        if (matchesCount2025 >= MIN_MATCHES) {
          setIsOpen(true);
          triggerFireworks();
        }
      } catch (error) {
        console.error('Failed to check wrap eligibility', error);
      } finally {
      }
    };

    checkEligibility();
  }, [user, config]);

  const triggerFireworks = () => {
    const duration = 3000;
    const animationEnd = Date.now() + duration;
    const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 100 };

    const random = (min: number, max: number) =>
      Math.random() * (max - min) + min;

    const interval: any = setInterval(function () {
      const timeLeft = animationEnd - Date.now();

      if (timeLeft <= 0) {
        return clearInterval(interval);
      }

      const particleCount = 50 * (timeLeft / duration);
      confetti({
        ...defaults,
        particleCount,
        origin: { x: random(0.1, 0.3), y: Math.random() - 0.2 },
      });
      confetti({
        ...defaults,
        particleCount,
        origin: { x: random(0.7, 0.9), y: Math.random() - 0.2 },
      });
    }, 250);
  };

  const handleClose = () => {
    setIsOpen(false);
    localStorage.setItem(STORAGE_KEY, 'true');
  };

  const handleGoToWrap = () => {
    localStorage.setItem(STORAGE_KEY, 'true');
    setIsOpen(false);
    router.push(`/wrap?year=${WRAP_YEAR}`);
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className='sm:max-w-md border-0 p-0 overflow-hidden rounded-3xl'>
        {/* Красочный фон */}
        <div className='relative h-full w-full bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-500 p-8 text-center text-white'>
          {/* Декоративные круги */}
          <div className='absolute -top-12 -right-12 h-40 w-40 rounded-full bg-white/10 blur-3xl' />
          <div className='absolute -bottom-12 -left-12 h-40 w-40 rounded-full bg-black/10 blur-3xl' />

          <div className='relative z-10 flex flex-col items-center gap-4'>
            <div className='flex h-16 w-16 items-center justify-center rounded-full bg-white/20 backdrop-blur-sm shadow-xl'>
              <Trophy className='h-8 w-8 text-yellow-300' />
            </div>

            <DialogTitle className='text-3xl font-extrabold tracking-tight text-white mt-2'>
              Your {WRAP_YEAR} Wrapped
            </DialogTitle>

            <p className='text-indigo-100 font-medium'>
              {t(
                'You played hard this year! Check out your personal highlights, rivalries, and stats.'
              )}
            </p>

            <div className='mt-6 w-full grid gap-3'>
              <Button
                onClick={handleGoToWrap}
                size='lg'
                className='w-full bg-white text-indigo-600 hover:bg-indigo-50 font-bold text-lg h-12 rounded-xl shadow-lg transition-transform hover:scale-105 active:scale-95'
              >
                <Sparkles className='mr-2 h-5 w-5 text-orange-400' />
                {t('Show me my stats!')}
              </Button>

              <Button
                onClick={handleClose}
                variant='ghost'
                className='w-full text-indigo-200 hover:text-white hover:bg-white/10'
              >
                {t('Maybe later')}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

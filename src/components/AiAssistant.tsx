'use client';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input'; // Мы используем textarea, но стили берем похожие
import { useAuth } from '@/contexts/AuthContext';
import { useSport } from '@/contexts/SportContext';
import { useToast } from '@/hooks/use-toast';
import { app, db } from '@/lib/firebase';
import {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  where,
} from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import {
  AlertTriangle,
  Bot,
  Check,
  Loader2,
  RefreshCw,
  Send,
  Trash2,
  X,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

// === Вспомогательная функция валидации ===
const getScoreWarning = (s1: number, s2: number): string | null => {
  if (s1 < 0 || s2 < 0) return 'Negative score';
  if (s1 < 11 && s2 < 11) return 'Winner needs 11+ pts';
  if (Math.abs(s1 - s2) < 2) return 'Min 2 pts diff';
  return null;
};

// Типы
type MatchDraft = {
  player1Name: string;
  player2Name: string;
  score1: number;
  score2: number;
};

type Message = {
  id: string;
  role: 'user' | 'ai';
  text: string;
  drafts?: MatchDraft[];
};

type PlayerOption = { uid: string; name: string; email?: string };
type RoomOption = { id: string; name: string };

export function AiAssistant() {
  const { user, userProfile } = useAuth();
  const { config } = useSport();

  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState('');

  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      role: 'ai',
      text: `👋 **Hi! I'm your AI Referee.**

**Examples:**
• "Moon vs Paavo 11-5, 5-11"
• "Moon vs Paavo 11-5. Ghost vs Pro 11-0"

**Rules:**
1. Order: Player 1 vs Player 2.
2. Shift+Enter for new line.`,
    },
  ]);

  const [isProcessing, setIsProcessing] = useState(false);
  const [playersList, setPlayersList] = useState<PlayerOption[]>([]);
  const [roomsList, setRoomsList] = useState<RoomOption[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const functions = getFunctions(app, 'us-central1');
  const { toast } = useToast();

  // === 1. УМНАЯ ЗАГРУЗКА ДАННЫХ ===
  useEffect(() => {
    if (isOpen && user && userProfile && config) {
      const loadData = async () => {
        try {
          const roomsCollection = config.collections.rooms;

          // А. Загружаем ТОЛЬКО активные комнаты
          const qRooms = query(
            collection(db, roomsCollection),
            where('memberIds', 'array-contains', user.uid),
            where('isArchived', '!=', true)
          );
          const roomsSnap = await getDocs(qRooms);

          const activeRooms: RoomOption[] = [];
          const relevantUserIds = new Set<string>();

          if (userProfile.friends)
            userProfile.friends.forEach((fid: string) =>
              relevantUserIds.add(fid)
            );
          relevantUserIds.add(user.uid);

          roomsSnap.docs.forEach((doc) => {
            const data = doc.data();
            const history = data.seasonHistory || [];
            const isSeasonFinished =
              history.length > 0 &&
              history[history.length - 1].type === 'seasonFinish';

            if (!isSeasonFinished) {
              activeRooms.push({
                id: doc.id,
                name: data.name || 'Unnamed Room',
              });
              if (data.memberIds)
                data.memberIds.forEach((mid: string) =>
                  relevantUserIds.add(mid)
                );
            }
          });

          setRoomsList(activeRooms);

          // Б. Загружаем профили
          if (playersList.length === 0) {
            const allUsersSnap = await getDocs(query(collection(db, 'users')));
            const filteredPlayers = allUsersSnap.docs
              .filter((doc) => relevantUserIds.has(doc.id))
              .map((doc) => ({
                uid: doc.id,
                name: doc.data().displayName || 'Unknown',
                email: doc.data().email || '',
              }))
              .sort((a, b) => a.name.localeCompare(b.name));

            setPlayersList(filteredPlayers);
          }
        } catch (e) {
          console.error('Failed to load data', e);
        }
      };
      loadData();
    }
  }, [isOpen, user, userProfile, config]);

  useEffect(() => {
    if (scrollRef.current)
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, isOpen]);

  const handleSend = async () => {
    if (!input.trim()) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      text: input,
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setIsProcessing(true);

    try {
      const parseFunc = httpsCallable(functions, 'aiParseInput');
      const response = await parseFunc({ text: userMsg.text });
      const data = response.data as { matches: MatchDraft[] };

      if (data.matches && data.matches.length > 0) {
        // === ЛОГИКА СМЕНЫ СТОРОН ПО ПАРАМ ===
        const processedDrafts: MatchDraft[] = [];
        let lastPair = '';
        let matchCountInPair = 0;

        data.matches.forEach((m) => {
          // Создаем уникальный ключ пары (сортируем имена, чтобы A vs B == B vs A)
          const currentPair = [
            m.player1Name.toLowerCase(),
            m.player2Name.toLowerCase(),
          ]
            .sort()
            .join('|');

          if (currentPair !== lastPair) {
            // Новая пара -> сбрасываем счетчик
            matchCountInPair = 0;
            lastPair = currentPair;
          }

          // Если это НЕ первый матч в серии этой пары (1, 3, 5...), меняем стороны
          // 0-й матч (первый) -> оставляем как есть
          // 1-й матч (второй) -> меняем
          if (matchCountInPair % 2 !== 0) {
            processedDrafts.push({
              player1Name: m.player2Name,
              player2Name: m.player1Name,
              score1: m.score2,
              score2: m.score1,
            });
          } else {
            processedDrafts.push(m);
          }

          matchCountInPair++;
        });

        const aiMsg: Message = {
          id: (Date.now() + 1).toString(),
          role: 'ai',
          text: `I found ${data.matches.length} match(es). Verify below.`,
          drafts: processedDrafts,
        };
        setMessages((prev) => [...prev, aiMsg]);
      } else {
        setMessages((prev) => [
          ...prev,
          {
            id: Date.now().toString(),
            role: 'ai',
            text: 'Sorry, no scores found.',
          },
        ]);
      }
    } catch (error: any) {
      console.error(error);
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now().toString(),
          role: 'ai',
          text: `Error: ${error.message}`,
        },
      ]);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSaveAll = async (
    drafts: MatchDraft[],
    roomId: string,
    msgId: string
  ) => {
    setIsProcessing(true);
    try {
      const saveFunc = httpsCallable(functions, 'aiSaveMatch');
      await saveFunc({ matches: drafts, roomId });
      setMessages((prev) =>
        prev.map((m) =>
          m.id === msgId
            ? { ...m, drafts: undefined, text: '✅ Matches saved!' }
            : m
        )
      );
      toast({
        title: 'Saved',
        description: `${drafts.length} matches recorded.`,
      });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Save Failed',
        description: error.message,
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCancel = (msgId: string) => {
    setMessages((prev) =>
      prev.map((m) =>
        m.id === msgId ? { ...m, drafts: undefined, text: '❌ Cancelled.' } : m
      )
    );
  };

  if (!user) return null;

  return (
    <>
      <Button
        className='fixed bottom-6 right-6 h-14 w-14 rounded-full shadow-xl z-50 transition-transform hover:scale-110'
        onClick={() => setIsOpen(!isOpen)}
      >
        {isOpen ? <X /> : <Bot />}
      </Button>

      {isOpen && (
        <Card className='fixed bottom-24 right-6 w-[90vw] max-w-[400px] h-[600px] flex flex-col shadow-2xl z-50 animate-in slide-in-from-bottom-10 fade-in bg-background border-2 border-border'>
          <div className='p-4 border-b bg-primary text-primary-foreground rounded-t-lg flex items-center gap-2'>
            <Bot size={20} />
            <span className='font-semibold'>AI Referee</span>
          </div>

          <div
            ref={scrollRef}
            className='flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50 dark:bg-slate-900'
          >
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex flex-col ${
                  msg.role === 'user' ? 'items-end' : 'items-start'
                }`}
              >
                <div
                  className={`max-w-[90%] p-3 rounded-lg text-sm ${
                    msg.role === 'user'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-white dark:bg-slate-800 border shadow-sm whitespace-pre-line'
                  }`}
                >
                  {msg.text}
                </div>
                {msg.drafts && (
                  <DraftsForm
                    initialDrafts={msg.drafts}
                    players={playersList}
                    rooms={roomsList}
                    config={config}
                    onSave={(finalDrafts, rid) =>
                      handleSaveAll(finalDrafts, rid, msg.id)
                    }
                    onCancel={() => handleCancel(msg.id)}
                    loading={isProcessing}
                  />
                )}
              </div>
            ))}
            {isProcessing && (
              <Loader2
                className='animate-spin text-muted-foreground mx-auto'
                size={20}
              />
            )}
          </div>

          <div className='p-3 border-t flex gap-2 bg-background'>
            {/* TEXTAREA для Shift+Enter */}
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder='Enter match result...'
              className='flex-1 min-h-[44px] max-h-[120px] p-2 text-sm border rounded-md bg-background resize-none focus:outline-none focus:ring-2 focus:ring-ring'
              autoFocus
            />
            <Button
              size='icon'
              onClick={handleSend}
              disabled={isProcessing}
              className='h-11 w-11 self-end'
            >
              <Send size={18} />
            </Button>
          </div>
        </Card>
      )}
    </>
  );
}

// --- FORM COMPONENT ---
function DraftsForm({
  initialDrafts,
  players,
  rooms,
  config,
  onSave,
  onCancel,
  loading,
}: {
  initialDrafts: MatchDraft[];
  players: PlayerOption[];
  rooms: RoomOption[];
  config: any;
  onSave: (d: MatchDraft[], roomId: string) => void;
  onCancel: () => void;
  loading: boolean;
}) {
  const [drafts, setDrafts] = useState(initialDrafts);
  const [selectedRoom, setSelectedRoom] = useState('');

  // 1. Авто-коррекция имен
  useEffect(() => {
    if (players.length === 0) return;
    setDrafts((current) =>
      current.map((d) => {
        let p1 = d.player1Name;
        let p2 = d.player2Name;
        const f1 = players.find(
          (p) => p.name.toLowerCase() === p1.toLowerCase()
        );
        const f2 = players.find(
          (p) => p.name.toLowerCase() === p2.toLowerCase()
        );
        if (f1) p1 = f1.name;
        if (f2) p2 = f2.name;
        return { ...d, player1Name: p1, player2Name: p2 };
      })
    );
  }, [players]);

  // 2. Авто-определение комнаты
  useEffect(() => {
    const detectRoom = async () => {
      if (
        selectedRoom ||
        players.length === 0 ||
        !config ||
        drafts.length === 0
      )
        return;
      const firstPlayerName = drafts[0]?.player1Name;
      const playerObj = players.find(
        (p) => p.name.toLowerCase() === firstPlayerName.toLowerCase()
      );

      if (playerObj) {
        try {
          const matchesRef = collection(db, config.collections.matches);
          const q = query(
            matchesRef,
            where('players', 'array-contains', playerObj.uid),
            orderBy('tsIso', 'desc'),
            limit(5)
          );
          const snap = await getDocs(q);
          for (const doc of snap.docs) {
            const rid = doc.data().roomId;
            if (rooms.some((r) => r.id === rid)) {
              setSelectedRoom(rid);
              return;
            }
          }
        } catch (e) {
          console.error(e);
        }
      }
      if (rooms.length > 0) setSelectedRoom(rooms[0].id);
    };
    detectRoom();
  }, [drafts, players, rooms, config, selectedRoom]);

  const updateDraft = (index: number, field: keyof MatchDraft, value: any) => {
    const newDrafts = [...drafts];
    newDrafts[index] = { ...newDrafts[index], [field]: value };
    setDrafts(newDrafts);
  };

  const removeDraft = (index: number) =>
    setDrafts(drafts.filter((_, i) => i !== index));

  // Вспомогательная функция для определения смены пары
  const isNewMatchup = (index: number) => {
    if (index === 0) return true; // Первый всегда новый
    const curr = drafts[index];
    const prev = drafts[index - 1];
    // Сравниваем пары (сортируем имена, чтобы порядок не влиял на определение пары)
    const currPair = [
      curr.player1Name.toLowerCase(),
      curr.player2Name.toLowerCase(),
    ]
      .sort()
      .join('|');
    const prevPair = [
      prev.player1Name.toLowerCase(),
      prev.player2Name.toLowerCase(),
    ]
      .sort()
      .join('|');
    return currPair !== prevPair;
  };

  return (
    <div className='mt-2 w-full space-y-4 bg-white dark:bg-slate-950 p-3 rounded-lg border shadow-sm'>
      <div className='space-y-1'>
        <label className='text-xs font-bold text-muted-foreground uppercase tracking-wider'>
          Room
        </label>
        {rooms.length > 0 ? (
          <select
            className='w-full h-9 text-sm border rounded bg-background px-2'
            value={selectedRoom}
            onChange={(e) => setSelectedRoom(e.target.value)}
          >
            <option value='' disabled>
              Select a room...
            </option>
            {rooms.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        ) : (
          <div className='text-xs text-amber-600'>No active rooms found.</div>
        )}
      </div>

      <div className='space-y-3'>
        {drafts.map((draft, i) => {
          const warning = getScoreWarning(draft.score1, draft.score2);
          const newMatchup = isNewMatchup(i);

          return (
            <div key={i}>
              {/* Разделитель для новой пары */}
              {newMatchup && i > 0 && (
                <div className='flex items-center gap-2 my-4'>
                  <div className='h-px bg-border flex-1'></div>
                  <span className='text-[10px] font-bold text-muted-foreground uppercase flex items-center gap-1'>
                    <RefreshCw size={10} /> New Matchup
                  </span>
                  <div className='h-px bg-border flex-1'></div>
                </div>
              )}

              <div
                className={`bg-accent/10 border rounded-md p-3 relative group transition-colors ${
                  warning
                    ? 'border-amber-500/50 bg-amber-50 dark:bg-amber-950/20'
                    : 'hover:border-primary/50'
                }`}
              >
                <button
                  onClick={() => removeDraft(i)}
                  className='absolute top-1 right-1 text-muted-foreground hover:text-destructive p-1 opacity-0 group-hover:opacity-100 transition-opacity'
                >
                  <Trash2 size={16} />
                </button>
                <div className='flex flex-col gap-3'>
                  <div className='grid grid-cols-[1fr_auto_1fr] gap-2 items-center'>
                    <div className='flex flex-col'>
                      <span className='text-[10px] text-muted-foreground mb-0.5 ml-1'>
                        Player 1
                      </span>
                      <PlayerSelect
                        value={draft.player1Name}
                        options={players}
                        onChange={(val) => updateDraft(i, 'player1Name', val)}
                      />
                    </div>
                    <span className='text-xs font-bold text-muted-foreground mt-4'>
                      VS
                    </span>
                    <div className='flex flex-col'>
                      <span className='text-[10px] text-muted-foreground mb-0.5 ml-1'>
                        Player 2
                      </span>
                      <PlayerSelect
                        value={draft.player2Name}
                        options={players}
                        onChange={(val) => updateDraft(i, 'player2Name', val)}
                      />
                    </div>
                  </div>
                  <div className='flex flex-col items-center'>
                    <div className='flex justify-center gap-3 items-center'>
                      <Input
                        type='number'
                        className='h-12 w-20 text-center font-mono text-2xl font-bold'
                        value={draft.score1}
                        onChange={(e) =>
                          updateDraft(i, 'score1', +e.target.value)
                        }
                      />
                      <span className='text-2xl font-bold text-muted-foreground pb-1'>
                        :
                      </span>
                      <Input
                        type='number'
                        className='h-12 w-20 text-center font-mono text-2xl font-bold'
                        value={draft.score2}
                        onChange={(e) =>
                          updateDraft(i, 'score2', +e.target.value)
                        }
                      />
                    </div>
                    {warning && (
                      <div className='flex items-center gap-1 text-amber-600 text-xs mt-2 font-medium animate-pulse'>
                        <AlertTriangle size={12} /> {warning}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {drafts.length > 0 && (
        <div className='flex gap-2 mt-2'>
          <Button
            variant='outline'
            className='flex-1 h-10 text-sm'
            onClick={onCancel}
            disabled={loading}
          >
            Cancel
          </Button>
          <Button
            className='flex-[2] h-10 text-base'
            onClick={() => onSave(drafts, selectedRoom)}
            disabled={loading || !selectedRoom}
          >
            {loading ? (
              <Loader2 className='animate-spin mr-2 h-5 w-5' />
            ) : (
              <Check className='mr-2 h-5 w-5' />
            )}{' '}
            Confirm All
          </Button>
        </div>
      )}
    </div>
  );
}

function PlayerSelect({
  value,
  options,
  onChange,
}: {
  value: string;
  options: PlayerOption[];
  onChange: (v: string) => void;
}) {
  const matches = options.filter(
    (o) => o.name.toLowerCase() === value.toLowerCase()
  );
  const hasDuplicates = matches.length > 1;

  return (
    <div className='w-full'>
      <select
        className={`w-full h-9 text-sm border rounded bg-background px-2 truncate font-medium ${
          hasDuplicates ? 'border-amber-500' : ''
        }`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {!options.find((o) => o.name === value) && (
          <option value={value} disabled>
            {value} (Not found)
          </option>
        )}
        {options.map((p) => {
          const isDuplicateName =
            options.filter((o) => o.name === p.name).length > 1;
          const label = isDuplicateName ? `${p.name} (${p.email})` : p.name;
          return (
            <option key={p.uid} value={p.name}>
              {label}
            </option>
          );
        })}
      </select>
      {hasDuplicates && (
        <div className='text-[10px] text-amber-600 mt-1'>
          ⚠️ Multiple players found. Check email.
        </div>
      )}
    </div>
  );
}

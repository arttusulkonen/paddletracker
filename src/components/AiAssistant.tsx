'use client';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
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
import { Bot, Check, Loader2, Send, Trash2, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

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

type PlayerOption = { uid: string; name: string };
type RoomOption = { id: string; name: string };

export function AiAssistant() {
  const { user } = useAuth();
  const { config } = useSport();

  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState('');

  // ❗ ОБНОВЛЕННАЯ ИНСТРУКЦИЯ
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      role: 'ai',
      text: `👋 **Hi! I'm your AI Referee.**

I can help you record matches quickly.

**Examples:**
• "Moon vs Paavo 11-5, 5-11, 11-9"
• "Moon vs Paavo 11-5. Paavo vs Jukka 11-0"

**Rules:**
1. Mention Player 1 vs Player 2.
2. Scores follow that order.
3. To add **different matches**, separate them with a **dot (.)** or a **new line**.`,
    },
  ]);

  const [isProcessing, setIsProcessing] = useState(false);
  const [playersList, setPlayersList] = useState<PlayerOption[]>([]);
  const [roomsList, setRoomsList] = useState<RoomOption[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const functions = getFunctions(app, 'us-central1');
  const { toast } = useToast();

  // Загрузка данных (игроки и комнаты)
  useEffect(() => {
    if (isOpen && user) {
      const loadData = async () => {
        try {
          // Игроки
          if (playersList.length === 0) {
            const usersSnap = await getDocs(
              query(collection(db, 'users'), orderBy('displayName'))
            );
            setPlayersList(
              usersSnap.docs.map((d) => ({
                uid: d.id,
                name: d.data().displayName || 'Unknown',
              }))
            );
          }

          // Комнаты
          if (roomsList.length === 0) {
            const roomsCollection =
              config?.collections?.rooms || 'rooms-pingpong';
            const roomsSnap = await getDocs(collection(db, roomsCollection));
            setRoomsList(
              roomsSnap.docs.map((d) => ({
                id: d.id,
                name: d.data().name || 'Unnamed Room',
              }))
            );
          }
        } catch (e) {
          console.error('Failed to load data', e);
        }
      };
      loadData();
    }
  }, [isOpen, user, config, playersList.length, roomsList.length]);

  // Автоскролл
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
        // Логика смены сторон для четных матчей в серии
        const processedDrafts = data.matches.map((m, i) =>
          i % 2 !== 0
            ? {
                player1Name: m.player2Name,
                player2Name: m.player1Name,
                score1: m.score2,
                score2: m.score1,
              }
            : m
        );

        const aiMsg: Message = {
          id: (Date.now() + 1).toString(),
          role: 'ai',
          text: `I found ${data.matches.length} match(es). Please verify details below before saving.`,
          drafts: processedDrafts,
        };
        setMessages((prev) => [...prev, aiMsg]);
      } else {
        setMessages((prev) => [
          ...prev,
          {
            id: Date.now().toString(),
            role: 'ai',
            text: "Sorry, I couldn't understand the scores or players. Please try again.",
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
        prev.map((m) => {
          if (m.id === msgId) {
            return {
              ...m,
              drafts: undefined,
              text: '✅ All matches saved successfully!',
            };
          }
          return m;
        })
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

  if (!user) return null;

  return (
    <>
      <Button
        className='fixed bottom-6 right-6 h-14 w-14 rounded-full shadow-xl z-50'
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
                      : 'bg-white dark:bg-slate-800 border shadow-sm whitespace-pre-line leading-relaxed'
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
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              placeholder='Enter match result...'
              className='flex-1'
              autoFocus
            />
            <Button size='icon' onClick={handleSend} disabled={isProcessing}>
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
  loading,
}: {
  initialDrafts: MatchDraft[];
  players: PlayerOption[];
  rooms: RoomOption[];
  config: any;
  onSave: (d: MatchDraft[], roomId: string) => void;
  loading: boolean;
}) {
  const [drafts, setDrafts] = useState(initialDrafts);
  const [selectedRoom, setSelectedRoom] = useState('');

  // Авто-определение комнаты (по первому игроку и его последнему матчу)
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
      if (!firstPlayerName) return;

      const playerObj = players.find(
        (p) => p.name.toLowerCase() === firstPlayerName.toLowerCase()
      );

      if (playerObj) {
        try {
          const matchesRef = collection(db, config.collections.matches);
          // Ищем последний матч этого игрока
          const q = query(
            matchesRef,
            where('players', 'array-contains', playerObj.uid),
            orderBy('tsIso', 'desc'),
            limit(1)
          );
          const snap = await getDocs(q);

          if (!snap.empty) {
            const lastRoomId = snap.docs[0].data().roomId;
            // Если такая комната есть в списке активных, выбираем её
            if (rooms.some((r) => r.id === lastRoomId)) {
              setSelectedRoom(lastRoomId);
              return;
            }
          }
        } catch (e) {
          console.error('Error detecting room:', e);
        }
      }

      // Фолбек: первая комната в списке
      if (rooms.length > 0) setSelectedRoom(rooms[0].id);
    };

    detectRoom();
  }, [drafts, players, rooms, config, selectedRoom]);

  const updateDraft = (index: number, field: keyof MatchDraft, value: any) => {
    const newDrafts = [...drafts];
    newDrafts[index] = { ...newDrafts[index], [field]: value };
    setDrafts(newDrafts);
  };

  const removeDraft = (index: number) => {
    setDrafts(drafts.filter((_, i) => i !== index));
  };

  return (
    <div className='mt-2 w-full space-y-4 bg-white dark:bg-slate-950 p-3 rounded-lg border shadow-sm'>
      {/* Выбор комнаты */}
      <div className='space-y-1'>
        <label className='text-xs font-bold text-muted-foreground uppercase tracking-wider'>
          Room
        </label>
        <select
          className='w-full h-9 text-sm border rounded bg-background px-2 font-medium'
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
      </div>

      <div className='space-y-2'>
        <label className='text-xs font-bold text-muted-foreground uppercase tracking-wider'>
          Matches
        </label>
        {drafts.map((draft, i) => (
          <div
            key={i}
            className='bg-accent/10 border rounded-md p-3 relative group hover:border-primary/50 transition-colors'
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

              <div className='flex justify-center gap-3 items-center'>
                <Input
                  type='number'
                  className='h-12 w-20 text-center font-mono text-2xl font-bold'
                  value={draft.score1}
                  onChange={(e) => updateDraft(i, 'score1', +e.target.value)}
                />
                <span className='text-2xl font-bold text-muted-foreground pb-1'>
                  :
                </span>
                <Input
                  type='number'
                  className='h-12 w-20 text-center font-mono text-2xl font-bold'
                  value={draft.score2}
                  onChange={(e) => updateDraft(i, 'score2', +e.target.value)}
                />
              </div>
            </div>
          </div>
        ))}
      </div>

      {drafts.length > 0 && (
        <Button
          className='w-full h-10 text-base mt-2'
          onClick={() => onSave(drafts, selectedRoom)}
          disabled={loading || !selectedRoom}
        >
          {loading ? (
            <Loader2 className='animate-spin mr-2 h-5 w-5' />
          ) : (
            <Check className='mr-2 h-5 w-5' />
          )}
          Confirm & Save All ({drafts.length})
        </Button>
      )}

      {drafts.length === 0 && (
        <div className='text-center text-xs text-muted-foreground py-2'>
          No matches to save
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
  return (
    <div className='w-full'>
      <select
        className='w-full h-9 text-sm border rounded bg-background px-2 truncate font-medium'
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {!options.find((o) => o.name === value) && (
          <option value={value}>{value} (AI)</option>
        )}
        {options.map((p) => (
          <option key={p.uid} value={p.name}>
            {p.name}
          </option>
        ))}
      </select>
    </div>
  );
}

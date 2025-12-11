// src/components/AiAssistant.tsx
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
import {
	AlertTriangle,
	ArrowDown,
	ArrowRight,
	ArrowUp,
	Bot,
	Check,
	Loader2,
	Minus,
	RefreshCw,
	Send,
	Trash2,
	Trophy,
	X,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

const getScoreWarning = (s1: number, s2: number, t: any): string | null => {
  if (s1 < 0 || s2 < 0) return t('Negative score');
  if (s1 < 11 && s2 < 11) return t('Winner needs 11+ pts');
  if (Math.abs(s1 - s2) < 2) return t('Min 2 pts diff');
  return null;
};

type MatchDraft = {
  player1Name: string;
  player2Name: string;
  score1: number;
  score2: number;
};

type PlayerUpdate = {
  name: string;
  eloDiff: number;
  newElo: number;
  roomElo?: number;
  oldRank?: number;
  newRank?: number;
};

type MatchResultData = {
  updates: PlayerUpdate[];
};

type Message = {
  id: string;
  role: 'user' | 'ai';
  text: string;
  drafts?: MatchDraft[];
  results?: MatchResultData;
};

type PlayerOption = { uid: string; name: string; email?: string };
type RoomOption = { id: string; name: string };

const MatchResultSummary = ({ data, t }: { data: MatchResultData; t: any }) => {
  return (
    <div className='mt-2 w-full max-w-xl bg-white dark:bg-slate-950 rounded-lg border shadow-sm overflow-hidden animate-in fade-in slide-in-from-bottom-2'>
      <div className='bg-muted/50 p-2 border-b flex items-center gap-2'>
        <Trophy className='h-4 w-4 text-yellow-500' />
        <span className='text-xs font-bold uppercase text-muted-foreground'>
          {t('Match Results')}
        </span>
      </div>
      <div className='divide-y'>
        {data.updates.map((u, idx) => {
          const isPositive = u.eloDiff > 0;
          const isNeutral = u.eloDiff === 0;

          return (
            <div key={idx} className='p-3 flex items-center justify-between'>
              <div className='flex flex-col'>
                <span className='font-semibold text-sm'>{u.name}</span>

                {u.oldRank && u.newRank ? (
                  <div className='flex items-center gap-1 text-xs text-muted-foreground mt-0.5'>
                    <span>#{u.oldRank}</span>
                    <ArrowRight size={10} />
                    <span
                      className={
                        u.newRank < u.oldRank
                          ? 'text-green-600 font-bold'
                          : u.newRank > u.oldRank
                          ? 'text-red-500'
                          : ''
                      }
                    >
                      #{u.newRank}
                    </span>
                  </div>
                ) : null}
              </div>

              <div className='text-right'>
                <div
                  className={`font-bold text-sm flex items-center justify-end gap-1 ${
                    isPositive
                      ? 'text-green-600'
                      : isNeutral
                      ? 'text-gray-500'
                      : 'text-red-600'
                  }`}
                >
                  {isPositive ? (
                    <ArrowUp size={14} />
                  ) : isNeutral ? (
                    <Minus size={14} />
                  ) : (
                    <ArrowDown size={14} />
                  )}
                  {u.eloDiff > 0
                    ? `+${Math.round(u.eloDiff)}`
                    : Math.round(u.eloDiff)}
                </div>
                <div className='text-xs text-muted-foreground'>
                  {Math.round(u.newElo)} Global
                </div>
                {u.roomElo && (
                  <div className='text-xs text-blue-600/80 dark:text-blue-400 font-medium mt-0.5'>
                    {Math.round(u.roomElo)} Room
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export function AiAssistant() {
  const { user, userProfile } = useAuth();
  const { sport, config } = useSport();
  const { t } = useTranslation();

  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMessages((prev) => {
      if (prev.length === 0) {
        return [
          {
            id: '1',
            role: 'ai',
            text: t(
              "Hi! I'm your AI Referee. Record matches or ask about stats."
            ),
          },
        ];
      }
      return prev;
    });
  }, [t]);

  const [isProcessing, setIsProcessing] = useState(false);
  const [playersList, setPlayersList] = useState<PlayerOption[]>([]);
  const [roomsList, setRoomsList] = useState<RoomOption[]>([]);
  const functions = getFunctions(app, 'us-central1');
  const { toast } = useToast();

  const suggestionChips = [
    {
      label: t('Add Result'),
      action: () => setInput(t('Paavo vs Jukka 11-9, 11-8')),
    },
  ];

  useEffect(() => {
    const handleOpen = () => setIsOpen(true);
    window.addEventListener('open-ai-assistant', handleOpen);
    return () => window.removeEventListener('open-ai-assistant', handleOpen);
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false);
    };
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      document.addEventListener('keydown', handleKeyDown);
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && user && userProfile && config) {
      const loadData = async () => {
        try {
          const roomsCollection = config.collections.rooms;
          const qRooms = query(
            collection(db, roomsCollection),
            where('memberIds', 'array-contains', user.uid),
            where('isArchived', '!=', true)
          );
          const roomsSnap = await getDocs(qRooms);

          const activeRooms: RoomOption[] = [];
          const playerMap = new Map<string, PlayerOption>();

          // Добавляем текущего пользователя
          playerMap.set(user.uid, {
            uid: user.uid,
            name: userProfile.name || userProfile.displayName || 'Me',
            email: user.email || '',
          });

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

              // Извлекаем игроков из members комнаты, чтобы избежать запроса к users (block by rules)
              if (Array.isArray(data.members)) {
                data.members.forEach((m: any) => {
                  if (m.userId && m.name) {
                    playerMap.set(m.userId, {
                      uid: m.userId,
                      name: m.name,
                      email: m.email || '',
                    });
                  }
                });
              }
            }
          });

          setRoomsList(activeRooms);
          setPlayersList(
            Array.from(playerMap.values()).sort((a, b) =>
              a.name.localeCompare(b.name)
            )
          );
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

  const sendMessage = async (textOverride?: string) => {
    const textToSend = textOverride || input;
    if (!textToSend.trim()) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      text: textToSend,
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setIsProcessing(true);

    try {
      const chatFunc = httpsCallable(functions, 'aiChat');
      const currentUserName =
        userProfile?.name || userProfile?.displayName || 'User';
      const response = await chatFunc({
        text: userMsg.text,
        sport,
        userName: currentUserName,
      });
      const responseData = response.data as {
        type: 'MATCH_DRAFT' | 'TEXT';
        data?: { matches: MatchDraft[] };
        message?: string;
      };

      if (
        responseData.type === 'MATCH_DRAFT' &&
        responseData.data?.matches?.length
      ) {
        const matches = responseData.data.matches;
        const processedDrafts: MatchDraft[] = [];
        let lastPair = '';
        let matchCountInPair = 0;
        matches.forEach((m) => {
          const currentPair = [
            m.player1Name.toLowerCase(),
            m.player2Name.toLowerCase(),
          ]
            .sort()
            .join('|');
          if (currentPair !== lastPair) {
            matchCountInPair = 0;
            lastPair = currentPair;
          }
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
          text: t('I found {{count}} match(es). Verify below.', {
            count: matches.length,
          }),
          drafts: processedDrafts,
        };
        setMessages((prev) => [...prev, aiMsg]);
      } else if (responseData.type === 'TEXT' && responseData.message) {
        setMessages((prev) => [
          ...prev,
          {
            id: (Date.now() + 1).toString(),
            role: 'ai',
            text: responseData.message || '',
          },
        ]);
      } else {
        setMessages((prev) => [
          ...prev,
          {
            id: Date.now().toString(),
            role: 'ai',
            text: t('Sorry, I could not understand that request.'),
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
      const result = await saveFunc({ matches: drafts, roomId });
      const responseData = result.data as MatchResultData;

      setMessages((prev) =>
        prev.map((m) => {
          if (m.id === msgId) {
            return {
              ...m,
              drafts: undefined,
              text: t('✅ Matches saved!'),
              results: { updates: responseData.updates },
            };
          }
          return m;
        })
      );

      toast({
        title: t('Saved'),
        description: t('{{count}} matches recorded.', {
          count: drafts.length,
        }),
      });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: t('Save Failed'),
        description: error.message,
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCancel = (msgId: string) => {
    setMessages((prev) =>
      prev.map((m) =>
        m.id === msgId
          ? { ...m, drafts: undefined, text: t('❌ Cancelled.') }
          : m
      )
    );
  };

  if (!user || sport !== 'pingpong') return null;

  return (
    <>
      <Button
        id='ai-assistant-trigger'
        className='fixed bottom-6 right-6 h-14 w-14 rounded-full shadow-xl z-50 transition-transform hover:scale-110'
        onClick={() => setIsOpen(!isOpen)}
      >
        {isOpen ? <X /> : <Bot />}
      </Button>

      {isOpen && (
        <div className='fixed inset-0 z-[60] flex items-end md:items-center justify-center bg-black/50 backdrop-blur-sm p-0 md:p-4 animate-in fade-in duration-200'>
          <Card className='w-full h-[100dvh] md:h-[85vh] md:max-w-[800px] flex flex-col shadow-2xl bg-background rounded-none md:rounded-xl overflow-hidden animate-in slide-in-from-bottom-10 md:zoom-in-95 duration-200'>
            <div className='p-4 border-b bg-primary text-primary-foreground flex items-center gap-3 shrink-0'>
              <div className='bg-primary-foreground/20 p-2 rounded-full'>
                <Bot size={20} />
              </div>
              <div>
                <h3 className='font-bold text-sm md:text-base leading-none'>
                  AI Referee ({t(sport)})
                </h3>
                <p className='text-[10px] md:text-xs opacity-80 mt-1'>
                  {t('Powered by Gemini 2.0')}
                </p>
              </div>
              <Button
                variant='ghost'
                size='icon'
                className='h-8 w-8 ml-auto text-primary-foreground hover:bg-primary/80 rounded-full'
                onClick={() => setIsOpen(false)}
              >
                <X className='h-5 w-5' />
              </Button>
            </div>

            <div
              ref={scrollRef}
              className='flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50 dark:bg-slate-900/50'
            >
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex flex-col ${
                    msg.role === 'user' ? 'items-end' : 'items-start'
                  }`}
                >
                  <div
                    className={`max-w-[85%] md:max-w-[75%] p-3.5 rounded-2xl text-sm shadow-sm ${
                      msg.role === 'user'
                        ? 'bg-primary text-primary-foreground rounded-br-none'
                        : 'bg-white dark:bg-slate-800 border rounded-bl-none'
                    }`}
                  >
                    {msg.text && (
                      <div
                        className='whitespace-pre-line leading-relaxed'
                        dangerouslySetInnerHTML={{
                          __html: msg.text
                            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                            .replace(/\n/g, '<br/>'),
                        }}
                      />
                    )}

                    {msg.drafts && (
                      <div className='mt-3'>
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
                      </div>
                    )}
                    {msg.results && (
                      <MatchResultSummary data={msg.results} t={t} />
                    )}
                  </div>
                </div>
              ))}
              {isProcessing && (
                <div className='flex items-center gap-2 text-muted-foreground text-xs ml-4'>
                  <Loader2 className='animate-spin h-3 w-3' />
                  {t('Thinking...')}
                </div>
              )}
            </div>

            <div className='flex flex-col border-t bg-background shrink-0'>
              <div className='flex gap-2 overflow-x-auto p-2 no-scrollbar border-b bg-muted/20'>
                {suggestionChips.map((chip) => (
                  <Button
                    key={chip.label}
                    variant='secondary'
                    size='sm'
                    className='whitespace-nowrap text-xs h-7 rounded-full px-3'
                    onClick={chip.action}
                    disabled={isProcessing}
                  >
                    {chip.label}
                  </Button>
                ))}
              </div>

              <div className='p-4 flex gap-3 items-end'>
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      sendMessage();
                    }
                  }}
                  placeholder={t('Enter match result or ask stats...')}
                  className='flex-1 min-h-[48px] max-h-[120px] p-3 text-sm border rounded-xl bg-muted/30 focus:bg-background resize-none focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all'
                  autoFocus
                />
                <Button
                  size='icon'
                  onClick={() => sendMessage()}
                  disabled={isProcessing || !input.trim()}
                  className='h-12 w-12 rounded-xl shrink-0 transition-all active:scale-95'
                >
                  <Send size={20} />
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}
    </>
  );
}

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
  const { t } = useTranslation();
  const [drafts, setDrafts] = useState(initialDrafts);
  const [selectedRoom, setSelectedRoom] = useState('');

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

  const isNewMatchup = (index: number) => {
    if (index === 0) return true;
    const curr = drafts[index];
    const prev = drafts[index - 1];
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
    <div className='w-full space-y-4 text-foreground max-w-xl'>
      <div className='bg-muted/30 p-3 rounded-lg border border-dashed'>
        <div className='space-y-1'>
          <label className='text-xs font-bold text-muted-foreground uppercase tracking-wider'>
            {t('Room')}
          </label>
          {rooms.length > 0 ? (
            <select
              className='w-full h-9 text-sm border rounded bg-background px-2'
              value={selectedRoom}
              onChange={(e) => setSelectedRoom(e.target.value)}
            >
              <option value='' disabled>
                {t('Select a room...')}
              </option>
              {rooms.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          ) : (
            <div className='text-xs text-amber-600'>
              {t('No active rooms found.')}
            </div>
          )}
        </div>
      </div>

      <div className='space-y-3'>
        {drafts.map((draft, i) => {
          const warning = getScoreWarning(draft.score1, draft.score2, t);
          const newMatchup = isNewMatchup(i);

          const score1 = +draft.score1;
          const score2 = +draft.score2;
          const p1Wins = score1 > score2;
          const p2Wins = score2 > score1;

          let cardClass =
            'relative p-4 border rounded-lg bg-background shadow-sm transition-all group hover:border-primary/40';

          if (warning) {
            cardClass =
              'relative p-4 border rounded-lg bg-amber-50 dark:bg-amber-950/20 border-amber-500/50 group';
          }

          let input1Class =
            'h-12 w-20 text-center font-mono text-2xl font-bold bg-muted/20 border-transparent focus:border-primary';
          let input2Class =
            'h-12 w-20 text-center font-mono text-2xl font-bold bg-muted/20 border-transparent focus:border-primary';

          if (p1Wins) {
            input1Class =
              'h-12 w-20 text-center font-mono text-2xl font-bold bg-green-100 dark:bg-green-900 border border-green-400 text-green-900 dark:text-green-100';
          } else if (p2Wins) {
            input2Class =
              'h-12 w-20 text-center font-mono text-2xl font-bold bg-green-100 dark:bg-green-900 border border-green-400 text-green-900 dark:text-green-100';
          }

          return (
            <div key={i}>
              {newMatchup && i > 0 && (
                <div className='flex items-center gap-2 my-4 opacity-70'>
                  <div className='h-px bg-border flex-1'></div>
                  <span className='text-[10px] font-bold text-muted-foreground uppercase flex items-center gap-1'>
                    <RefreshCw size={10} /> {t('New Matchup')}
                  </span>
                  <div className='h-px bg-border flex-1'></div>
                </div>
              )}

              <div className={cardClass}>
                <div className='absolute top-0 left-0 right-0 flex justify-center'>
                  <span className='bg-muted px-2 py-0.5 rounded-b text-[10px] uppercase font-bold text-muted-foreground tracking-widest border-b border-x border-border/20'>
                    {t('Game')} {i + 1}
                  </span>
                </div>
                <button
                  onClick={() => removeDraft(i)}
                  className='absolute top-2 right-2 text-muted-foreground hover:text-destructive p-1 opacity-0 group-hover:opacity-100 transition-opacity z-10'
                >
                  <Trash2 size={16} />
                </button>
                <div className='flex flex-col gap-3 pt-3'>
                  <div className='grid grid-cols-[1fr_auto_1fr] gap-2 items-center'>
                    <div className='flex flex-col'>
                      <span className='text-[10px] text-muted-foreground mb-0.5 ml-1 uppercase font-semibold'>
                        {t('Player 1')}
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
                      <span className='text-[10px] text-muted-foreground mb-0.5 ml-1 uppercase font-semibold'>
                        {t('Player 2')}
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
                        className={input1Class}
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
                        className={input2Class}
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
        <div className='flex gap-2 mt-2 pt-2 border-t border-dashed'>
          <Button
            variant='outline'
            className='flex-1'
            onClick={onCancel}
            disabled={loading}
          >
            {t('Cancel')}
          </Button>
          <Button
            className='flex-[2]'
            onClick={() => onSave(drafts, selectedRoom)}
            disabled={loading || !selectedRoom}
          >
            {loading ? (
              <Loader2 className='animate-spin mr-2 h-4 w-4' />
            ) : (
              <Check className='mr-2 h-4 w-4' />
            )}{' '}
            {t('Confirm All')}
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
  const { t } = useTranslation();
  const hasDuplicates = matches.length > 1;

  return (
    <div className='w-full'>
      <select
        className={`w-full h-9 text-sm border rounded-md bg-background px-2 truncate font-medium focus:ring-1 ${
          hasDuplicates ? 'border-amber-500' : 'border-input'
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
          ⚠️ {t('Multiple players found. Check email.')}
        </div>
      )}
    </div>
  );
}

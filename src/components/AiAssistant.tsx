// src/components/AiAssistant.tsx
'use client';
import { Button } from '@/components/ui/button';
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
	Flame,
	Loader2,
	Minus,
	RefreshCw,
	Send,
	Sparkles,
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
  highlights?: string[];
};

type PlayerOption = { uid: string; name: string; email?: string };
type RoomOption = { id: string; name: string; mode?: string };

const MatchResultSummary = ({ data, t }: { data: MatchResultData; t: any }) => {
  return (
    <div className='mt-3 w-full bg-white/60 dark:bg-black/40 backdrop-blur-xl rounded-2xl shadow-sm ring-1 ring-black/5 dark:ring-white/10 overflow-hidden animate-in fade-in slide-in-from-bottom-2'>
      <div className='bg-muted/30 p-2.5 border-b border-black/5 dark:border-white/5 flex items-center gap-2'>
        <Trophy className='h-4 w-4 text-yellow-500' />
        <span className='text-xs font-bold uppercase tracking-widest text-muted-foreground'>
          {t('Match Results')}
        </span>
      </div>
      <div className='divide-y divide-black/5 dark:divide-white/5'>
        {data.updates.map((u, idx) => {
          const isPositive = u.eloDiff > 0;
          const isNeutral = u.eloDiff === 0;
          const isEpicGain = u.eloDiff >= 20; // Порог для эпика чуть снижен

          return (
            <div
              key={idx}
              className={`p-3 flex items-center justify-between transition-colors ${
                isEpicGain ? 'bg-orange-500/10' : 'hover:bg-muted/20'
              }`}
            >
              <div className='flex flex-col'>
                <span className='font-semibold text-sm flex items-center gap-1.5'>
                  {u.name}
                  {isEpicGain && (
                     <span title={t('Epic Gain!')}>
                      <Flame className='w-3.5 h-3.5 text-orange-500 fill-current animate-pulse' />
                    </span>
                  )}
                </span>

                {u.oldRank && u.newRank ? (
                  <div className='flex items-center gap-1.5 text-[10px] font-medium text-muted-foreground mt-1'>
                    <span>#{u.oldRank}</span>
                    <ArrowRight size={10} />
                    <span
                      className={
                        u.newRank < u.oldRank
                          ? 'text-emerald-500 font-bold'
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
                  className={`font-black text-sm flex items-center justify-end gap-0.5 ${
                    isEpicGain
                      ? 'text-orange-600 dark:text-orange-400'
                      : isPositive
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : isNeutral
                          ? 'text-muted-foreground'
                          : 'text-red-500'
                  }`}
                >
                  {isPositive ? (
                    <ArrowUp size={isEpicGain ? 16 : 14} />
                  ) : isNeutral ? (
                    <Minus size={12} />
                  ) : (
                    <ArrowDown size={14} />
                  )}
                  {u.eloDiff > 0
                    ? `+${Math.round(u.eloDiff)}`
                    : Math.round(u.eloDiff)}
                </div>
                <div className='text-[10px] font-medium text-muted-foreground leading-tight mt-0.5'>
                  {Math.round(u.newElo)} Global
                </div>
                {u.roomElo && (
                  <div
                    className={`text-[10px] font-bold leading-tight mt-0.5 ${
                      isEpicGain
                        ? 'text-orange-600/80 dark:text-orange-400/80'
                        : 'text-primary/80'
                    }`}
                  >
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
              "Hi! I'm your AI Referee. Record matches or ask about stats.",
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
  const functions = getFunctions(app ?? undefined, 'europe-west1');
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
          if (!db) return;
          const roomsCollection = config.collections.rooms;
          const qRooms = query(
            collection(db, roomsCollection),
            where('memberIds', 'array-contains', user.uid),
            where('isArchived', '!=', true),
          );
          const roomsSnap = await getDocs(qRooms);

          const activeRooms: RoomOption[] = [];
          const playerMap = new Map<string, PlayerOption>();

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
                mode: data.mode || 'office',
              });

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
              a.name.localeCompare(b.name),
            ),
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

  const generateHighlights = (
    drafts: MatchDraft[],
    updates: PlayerUpdate[],
    roomId: string,
  ) => {
    const highlights: string[] = [];
    const room = roomsList.find((r) => r.id === roomId);
    const isDerby = room?.mode === 'derby';

    drafts.forEach((d) => {
      const s1 = +d.score1;
      const s2 = +d.score2;
      const diff = Math.abs(s1 - s2);
      const max = Math.max(s1, s2);
      const min = Math.min(s1, s2);
      const w = s1 > s2 ? d.player1Name : d.player2Name;
      const l = s1 > s2 ? d.player2Name : d.player1Name;

      if (min <= 2 && max >= 11) {
        highlights.push(
          `🥶 **${w}** gave a free lesson to **${l}** (${max}-${min})`,
        );
      } else if (diff <= 2 && max >= 11) {
        highlights.push(
          `💦 Absolute cinema! **${w}** clutched against **${l}** (${max}-${min})`,
        );
      }
    });

    if (isDerby) {
      updates.forEach((u) => {
        if (u.eloDiff >= 20) {
          highlights.push(
            `💰 Jackpot! **${u.name}** claimed a massive bounty (+${Math.round(u.eloDiff)} ELO)!`,
          );
        } else if (u.eloDiff <= -18) {
          highlights.push(
            `💀 Ouch! **${u.name}** took a heavy hit and bled ${Math.abs(Math.round(u.eloDiff))} ELO.`,
          );
        } else if (u.eloDiff > 10) {
          highlights.push(
            `⚔️ **${u.name}** is building momentum (+${Math.round(u.eloDiff)} ELO).`,
          );
        }
      });

      // Дефолтный хайлайт, если ничего специфичного не подошло
      if (highlights.length === 0) {
        highlights.push(`⚔️ The Derby continues! Standings have shifted.`);
      }
    } else {
      updates.forEach((u) => {
        if (u.eloDiff >= 15) {
          highlights.push(
            `📈 Stonks! **${u.name}** gained +${Math.round(u.eloDiff)} ELO.`,
          );
        }
      });
    }

    return Array.from(new Set(highlights)).slice(0, 3);
  };

  const handleSaveAll = async (
    drafts: MatchDraft[],
    roomId: string,
    msgId: string,
  ) => {
    setIsProcessing(true);
    try {
      const saveFunc = httpsCallable(functions, 'aiSaveMatch');
      const result = await saveFunc({ matches: drafts, roomId });
      const responseData = result.data as MatchResultData;

      const highlights = generateHighlights(
        drafts,
        responseData.updates,
        roomId,
      );

      setMessages((prev) =>
        prev.map((m) => {
          if (m.id === msgId) {
            return {
              ...m,
              drafts: undefined,
              text: t('✅ Matches saved!'),
              results: { updates: responseData.updates },
              highlights: highlights.length > 0 ? highlights : undefined,
            };
          }
          return m;
        }),
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
          : m,
      ),
    );
  };

  if (!user || sport !== 'pingpong') return null;

  return (
    <>
      <Button
        id='ai-assistant-trigger'
        className='fixed bottom-6 right-6 h-14 w-14 rounded-full shadow-2xl z-50 transition-transform hover:scale-105 bg-primary/90 backdrop-blur-md border border-white/20'
        onClick={() => setIsOpen(!isOpen)}
      >
        {isOpen ? <X size={24} /> : <Bot size={24} />}
      </Button>

      {isOpen && (
        <div className='fixed inset-0 z-[60] flex items-end md:items-center justify-center bg-black/20 dark:bg-black/40 backdrop-blur-md p-0 md:p-6 animate-in fade-in duration-300'>
          <div className='w-full max-w-[1280px] h-[100dvh] md:h-[90vh] md:max-h-[900px] flex flex-col shadow-[0_8px_32px_rgba(0,0,0,0.15)] bg-background/80 dark:bg-background/60 backdrop-blur-2xl rounded-none md:rounded-[2rem] overflow-hidden border-0 md:border border-white/20 dark:border-white/10 animate-in slide-in-from-bottom-10 md:zoom-in-95 duration-300'>
            {/* Header */}
            <div className='p-4 border-b border-black/5 dark:border-white/5 bg-white/30 dark:bg-black/20 flex items-center gap-3 shrink-0 backdrop-blur-md'>
              <div className='bg-primary/10 text-primary p-2 rounded-xl ring-1 ring-primary/20'>
                <Bot size={20} />
              </div>
              <div>
                <h3 className='font-bold text-base leading-none text-foreground'>
                  AI Referee ({t(sport)})
                </h3>
                <p className='text-xs font-medium text-muted-foreground mt-1'>
                  {t('Powered by Gemini 2.0')}
                </p>
              </div>
              <Button
                variant='ghost'
                size='icon'
                className='h-9 w-9 ml-auto rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition-colors'
                onClick={() => setIsOpen(false)}
              >
                <X className='h-5 w-5 text-muted-foreground' />
              </Button>
            </div>

            {/* Messages Area */}
            <div
              ref={scrollRef}
              className='flex-1 overflow-y-auto p-4 md:p-6 space-y-6 flex flex-col items-center'
            >
              <div className='w-full max-w-4xl space-y-6'>
                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex flex-col ${
                      msg.role === 'user' ? 'items-end' : 'items-start'
                    }`}
                  >
                    <div
                      className={`w-fit max-w-[95%] md:max-w-[85%] p-4 rounded-[1.5rem] shadow-sm text-sm md:text-base transition-all ${
                        msg.role === 'user'
                          ? 'bg-primary text-primary-foreground rounded-br-sm ml-auto shadow-primary/20'
                          : 'bg-white/60 dark:bg-white/5 border border-white/40 dark:border-white/10 backdrop-blur-md rounded-bl-sm mr-auto text-foreground'
                      }`}
                    >
                      {msg.text && (
                        <div
                          className='whitespace-pre-line leading-relaxed font-medium'
                          dangerouslySetInnerHTML={{
                            __html: msg.text
                              .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                              .replace(/\n/g, '<br/>'),
                          }}
                        />
                      )}

                      {msg.highlights && msg.highlights.length > 0 && (
                        <div className='mt-4 bg-gradient-to-r from-orange-500/10 to-rose-500/10 border border-orange-500/20 rounded-xl p-3.5 space-y-2.5 shadow-sm'>
                          <div className='flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-orange-600 dark:text-orange-400'>
                            <Sparkles className='w-4 h-4' />
                            {t('Derby Highlights')}
                          </div>
                          <ul className='space-y-2 text-sm font-medium'>
                            {msg.highlights.map((hl, idx) => (
                              <li
                                key={idx}
                                className='leading-snug flex items-start gap-2'
                                dangerouslySetInnerHTML={{
                                  __html: hl.replace(
                                    /\*\*(.*?)\*\*/g,
                                    '<strong class="text-foreground">$1</strong>',
                                  ),
                                }}
                              />
                            ))}
                          </ul>
                        </div>
                      )}

                      {msg.drafts && (
                        <div className='mt-4 w-full min-w-[280px] md:min-w-[400px]'>
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
                        <div className='w-full mt-3'>
                          <MatchResultSummary data={msg.results} t={t} />
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                {isProcessing && (
                  <div className='flex items-center gap-2 text-muted-foreground text-sm font-medium ml-2'>
                    <Loader2 className='animate-spin h-4 w-4' />
                    {t('Thinking...')}
                  </div>
                )}
              </div>
            </div>

            {/* Input Area */}
            <div className='flex flex-col border-t border-white/20 dark:border-white/5 bg-white/40 dark:bg-black/20 backdrop-blur-md shrink-0 w-full'>
              <div className='flex gap-2 overflow-x-auto p-3 no-scrollbar w-full justify-center'>
                <div className='flex gap-2 max-w-4xl w-full px-2'>
                  {suggestionChips.map((chip) => (
                    <Button
                      key={chip.label}
                      variant='secondary'
                      size='sm'
                      className='whitespace-nowrap text-xs h-8 rounded-full px-4 bg-white/60 dark:bg-white/10 hover:bg-white border border-white/40 dark:border-white/5 shadow-sm'
                      onClick={chip.action}
                      disabled={isProcessing}
                    >
                      {chip.label}
                    </Button>
                  ))}
                </div>
              </div>

              <div className='p-4 w-full flex justify-center pb-6 md:pb-4'>
                <div className='w-full max-w-4xl flex gap-3 items-end relative'>
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
                    className='flex-1 min-h-[52px] max-h-[150px] p-3.5 pr-14 text-sm md:text-base border-0 rounded-2xl bg-white/60 dark:bg-black/40 backdrop-blur-md resize-none focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all shadow-inner ring-1 ring-black/5 dark:ring-white/10'
                    autoFocus
                  />
                  <Button
                    size='icon'
                    onClick={() => sendMessage()}
                    disabled={isProcessing || !input.trim()}
                    className='absolute right-2 bottom-2 h-9 w-9 rounded-xl shrink-0 transition-all active:scale-95 shadow-md bg-primary hover:bg-primary/90 text-white'
                  >
                    <Send size={16} />
                  </Button>
                </div>
              </div>
            </div>
          </div>
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
          (p) => p.name.toLowerCase() === p1.toLowerCase(),
        );
        const f2 = players.find(
          (p) => p.name.toLowerCase() === p2.toLowerCase(),
        );
        if (f1) p1 = f1.name;
        if (f2) p2 = f2.name;
        return { ...d, player1Name: p1, player2Name: p2 };
      }),
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
        (p) => p.name.toLowerCase() === firstPlayerName.toLowerCase(),
      );

      if (playerObj) {
        try {
          if (!db) return;
          const matchesRef = collection(db, config.collections.matches);
          const q = query(
            matchesRef,
            where('players', 'array-contains', playerObj.uid),
            orderBy('tsIso', 'desc'),
            limit(5),
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
    <div className='w-full space-y-3 text-foreground bg-white/40 dark:bg-black/20 p-4 rounded-2xl border border-white/20 dark:border-white/5'>
      <div className='space-y-1.5'>
        <label className='text-[10px] font-bold text-muted-foreground uppercase tracking-widest pl-1'>
          {t('Room')}
        </label>
        {rooms.length > 0 ? (
          <select
            className='w-full h-10 text-sm font-semibold border-0 rounded-xl bg-white/60 dark:bg-black/40 px-3 ring-1 ring-black/5 dark:ring-white/10 focus:ring-2 focus:ring-primary/40 outline-none transition-all cursor-pointer'
            value={selectedRoom}
            onChange={(e) => setSelectedRoom(e.target.value)}
          >
            <option value='' disabled>
              {t('Select a room...')}
            </option>
            {rooms.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name} {r.mode === 'derby' ? '⚔️' : ''}
              </option>
            ))}
          </select>
        ) : (
          <div className='text-xs text-amber-600 font-medium p-2 bg-amber-50 rounded-xl'>
            {t('No active rooms found.')}
          </div>
        )}
      </div>

      <div className='space-y-3 w-full mt-4'>
        {drafts.map((draft, i) => {
          const warning = getScoreWarning(draft.score1, draft.score2, t);
          const newMatchup = isNewMatchup(i);

          const score1 = +draft.score1;
          const score2 = +draft.score2;
          const p1Wins = score1 > score2;
          const p2Wins = score2 > score1;

          let cardClass =
            'relative p-4 rounded-xl bg-white/50 dark:bg-black/20 ring-1 ring-black/5 dark:ring-white/5 shadow-sm transition-all group';

          if (warning) {
            cardClass =
              'relative p-4 rounded-xl bg-amber-50/50 dark:bg-amber-950/20 ring-1 ring-amber-500/30 group';
          }

          let input1Class =
            'h-12 w-16 text-center font-mono text-2xl font-black bg-background/50 border-0 ring-1 ring-black/5 dark:ring-white/10 focus:ring-2 focus:ring-primary/40 rounded-xl transition-all';
          let input2Class =
            'h-12 w-16 text-center font-mono text-2xl font-black bg-background/50 border-0 ring-1 ring-black/5 dark:ring-white/10 focus:ring-2 focus:ring-primary/40 rounded-xl transition-all';

          if (p1Wins) {
            input1Class =
              'h-12 w-16 text-center font-mono text-2xl font-black bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-0 ring-1 ring-emerald-500/40 rounded-xl shadow-sm transition-all';
          } else if (p2Wins) {
            input2Class =
              'h-12 w-16 text-center font-mono text-2xl font-black bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-0 ring-1 ring-emerald-500/40 rounded-xl shadow-sm transition-all';
          }

          return (
            <div key={i} className='w-full'>
              {newMatchup && i > 0 && (
                <div className='flex items-center gap-2 my-4 opacity-50'>
                  <div className='h-px bg-foreground/20 flex-1'></div>
                  <span className='text-[9px] font-bold uppercase tracking-widest flex items-center gap-1'>
                    <RefreshCw size={10} /> {t('New Matchup')}
                  </span>
                  <div className='h-px bg-foreground/20 flex-1'></div>
                </div>
              )}

              <div className={cardClass}>
                <div className='absolute top-0 left-0 right-0 flex justify-center'>
                  <span className='bg-background/80 backdrop-blur-md px-2 py-0.5 rounded-b-md text-[8px] uppercase font-bold text-muted-foreground tracking-widest ring-1 ring-black/5 dark:ring-white/10 shadow-sm'>
                    {t('Game')} {i + 1}
                  </span>
                </div>
                <button
                  onClick={() => removeDraft(i)}
                  className='absolute top-2 right-2 text-muted-foreground hover:text-destructive p-1.5 rounded-full hover:bg-destructive/10 opacity-0 group-hover:opacity-100 transition-all z-10'
                >
                  <Trash2 size={14} />
                </button>
                <div className='flex flex-col gap-3 pt-3'>
                  <div className='grid grid-cols-[1fr_auto_1fr] gap-2 items-center'>
                    <div className='flex flex-col'>
                      <PlayerSelect
                        value={draft.player1Name}
                        options={players}
                        onChange={(val) => updateDraft(i, 'player1Name', val)}
                      />
                    </div>
                    <span className='text-[10px] font-black text-muted-foreground/40 mt-1 bg-black/5 dark:bg-white/5 w-6 h-6 flex items-center justify-center rounded-full'>
                      VS
                    </span>
                    <div className='flex flex-col'>
                      <PlayerSelect
                        value={draft.player2Name}
                        options={players}
                        onChange={(val) => updateDraft(i, 'player2Name', val)}
                      />
                    </div>
                  </div>
                  <div className='flex flex-col items-center pt-2'>
                    <div className='flex justify-center gap-3 items-center'>
                      <Input
                        type='number'
                        className={input1Class}
                        value={draft.score1}
                        onChange={(e) =>
                          updateDraft(i, 'score1', +e.target.value)
                        }
                      />
                      <span className='text-xl font-black text-muted-foreground/30'>
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
                      <div className='flex items-center gap-1 text-amber-600 bg-amber-500/10 px-2.5 py-1 rounded-full text-[10px] mt-3 font-bold uppercase tracking-widest animate-pulse ring-1 ring-amber-500/20'>
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
        <div className='flex gap-2 w-full mt-4'>
          <Button
            variant='outline'
            className='flex-1 h-11 text-sm font-semibold rounded-xl bg-white/50 dark:bg-white/5 border-0 ring-1 ring-black/5 dark:ring-white/10 hover:bg-white dark:hover:bg-white/10'
            onClick={onCancel}
            disabled={loading}
          >
            {t('Cancel')}
          </Button>
          <Button
            className='flex-[2] h-11 text-sm font-bold rounded-xl shadow-md bg-primary hover:bg-primary/90 text-primary-foreground'
            onClick={() => onSave(drafts, selectedRoom)}
            disabled={loading || !selectedRoom}
          >
            {loading ? (
              <Loader2 className='animate-spin mr-2 h-4 w-4' />
            ) : (
              <Check className='mr-2 h-4 w-4' />
            )}{' '}
            {t('Confirm & Save')}
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
    (o) => o.name.toLowerCase() === value.toLowerCase(),
  );
  const { t } = useTranslation();
  const hasDuplicates = matches.length > 1;

  return (
    <div className='w-full'>
      <select
        className={`w-full h-10 text-sm font-semibold border-0 rounded-lg bg-white/60 dark:bg-black/40 px-2 truncate ring-1 outline-none transition-all cursor-pointer ${
          hasDuplicates
            ? 'ring-amber-500/50 focus:ring-amber-500 text-amber-700 dark:text-amber-400'
            : 'ring-black/5 dark:ring-white/10 focus:ring-primary/40'
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
        <div className='text-[8px] uppercase tracking-widest font-bold text-amber-600 mt-1 px-1'>
          ⚠️ {t('Multiple players found')}
        </div>
      )}
    </div>
  );
}

import { Button } from '@/components/ui/button';
import {
	ArrowDown,
	ArrowRight,
	ArrowUp,
	Flame,
	Minus,
	Skull,
	Swords,
	Trophy,
} from 'lucide-react';

export const ResultsPhase = ({ state, actions, t }: any) => {
  if (!state || !state.matchResults || !state.sessionGames) return null;

  return (
    <div className='flex flex-col w-full max-w-6xl max-h-[95vh] bg-card border border-border rounded-[3rem] p-8 md:p-12 shadow-2xl animate-in zoom-in-95 duration-500 z-50 backdrop-blur-3xl relative overflow-hidden'>
      <div className='absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-blue-500 via-primary to-red-500 min-h-[8px]' />

      {/* ШАПКА ФИКСИРОВАНА */}
      <div className='flex flex-col items-center justify-center gap-3 mb-8 text-primary mt-2 shrink-0'>
        <Trophy className='h-12 w-12' />
        <h2 className='text-4xl md:text-5xl font-black uppercase tracking-tighter text-foreground'>
          {t('Series Report')}
        </h2>
      </div>

      {/* ГЛАВНЫЙ КОНТЕЙНЕР (flex-1 min-h-0 заставляет его занимать только оставшееся место) */}
      <div className='flex-1 min-h-0 w-full overflow-y-auto lg:overflow-hidden custom-scrollbar mb-8 pr-2 lg:pr-0'>
        <div className='grid grid-cols-1 lg:grid-cols-2 gap-10 lg:h-full'>
          {/* ЛЕВАЯ КОЛОНКА */}
          <div className='flex flex-col gap-4 lg:h-full lg:min-h-0'>
            <div className='bg-primary/10 text-primary px-4 py-2 rounded-xl w-fit font-black uppercase tracking-widest text-sm mb-2 shrink-0'>
              {t('Total Rating Change')}
            </div>

            {/* Скролл только для изменения рейтинга (на десктопе) */}
            <div className='flex flex-col gap-4 lg:overflow-y-auto custom-scrollbar lg:pr-4 lg:pb-4 flex-1'>
              {state.matchResults.updates.map((u: any, idx: number) => {
                const isPositive = u.eloDiff > 0;
                const isNeutral = u.eloDiff === 0;
                const isEpic = u.eloDiff >= 20;
                return (
                  <div
                    key={idx}
                    className={`p-6 rounded-[2rem] flex items-center justify-between border transition-all shrink-0 ${isEpic ? 'bg-primary/5 border-primary/40 shadow-sm' : 'bg-muted/30 border-border/50'}`}
                  >
                    <div className='flex flex-col gap-1'>
                      <span className='font-black text-2xl text-foreground tracking-tight flex items-center gap-3'>
                        {u.name}{' '}
                        {isEpic && (
                          <Flame className='w-6 h-6 text-primary fill-current animate-pulse' />
                        )}
                      </span>
                      {u.oldRank && u.newRank && (
                        <div className='flex items-center gap-2 text-[10px] font-bold text-muted-foreground uppercase tracking-widest'>
                          <span>#{u.oldRank}</span> <ArrowRight size={14} />{' '}
                          <span
                            className={
                              u.newRank < u.oldRank
                                ? 'text-emerald-500'
                                : 'text-destructive'
                            }
                          >
                            #{u.newRank}
                          </span>
                        </div>
                      )}
                    </div>
                    <div className='text-right'>
                      <div
                        className={`font-black text-4xl flex items-center justify-end gap-1 tracking-tighter ${isPositive ? 'text-emerald-500' : isNeutral ? 'text-muted-foreground' : 'text-destructive'}`}
                      >
                        {isPositive ? (
                          <ArrowUp size={28} />
                        ) : isNeutral ? (
                          <Minus size={24} />
                        ) : (
                          <ArrowDown size={28} />
                        )}
                        {(u.eloDiff > 0 ? '+' : '') + Math.round(u.eloDiff)}
                      </div>
                      <div className='text-[10px] font-bold text-muted-foreground uppercase mt-2 tracking-widest'>
                        <span className='text-foreground text-xs mr-1.5'>
                          {Math.round(u.newElo)}
                        </span>{' '}
                        GBL
                        {u.roomElo && (
                          <>
                            <span className='mx-2 opacity-20'>|</span>
                            <span className='text-primary text-xs mr-1.5'>
                              {Math.round(u.roomElo)}
                            </span>{' '}
                            RM
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ПРАВАЯ КОЛОНКА (ХРОНОЛОГИЯ МАТЧЕЙ) */}
          <div className='flex flex-col gap-4 lg:h-full lg:min-h-0'>
            <div className='bg-muted/50 text-muted-foreground px-4 py-2 rounded-xl w-fit font-black uppercase tracking-widest text-sm mb-2 shrink-0'>
              {t('Match Chronicle')}
            </div>

            {/* Скролл только для хронологии матчей (на десктопе) */}
            <div className='space-y-3 lg:overflow-y-auto custom-scrollbar lg:pr-4 lg:pb-4 flex-1'>
              {state.sessionGames.map((g: any) => (
                <div
                  key={g.gameNumber}
                  className='bg-background rounded-[1.5rem] p-4 shadow-sm border border-border/40 flex flex-col gap-3 shrink-0'
                >
                  <div className='flex justify-between items-center'>
                    <div className='text-[10px] font-black text-muted-foreground uppercase tracking-widest'>
                      {t('Game')} {g.gameNumber}
                    </div>
                    <div className='text-[10px] font-black bg-primary/10 text-primary px-3 py-1 rounded-full uppercase tracking-widest'>
                      {g.winnerId === g.playerLId
                        ? g.playerLName
                        : g.playerRName}{' '}
                      {t('Wins')}
                    </div>
                  </div>

                  <div className='flex items-center justify-between mt-1'>
                    <div className='font-bold text-lg flex items-center gap-3 w-full'>
                      <span
                        className={`truncate flex-1 text-right flex items-center justify-end gap-2 ${g.winnerId === g.playerLId ? 'text-foreground' : 'text-muted-foreground'}`}
                      >
                        {g.chronicleData && g.chronicleData.pLDelta < 0 && (
                          <span className='text-[10px] text-red-500 font-black px-1.5 py-0.5 bg-red-500/10 rounded'>
                            {g.chronicleData.pLDelta}
                          </span>
                        )}
                        {g.chronicleData && g.chronicleData.pLDelta > 0 && (
                          <span className='text-[10px] text-emerald-500 font-black px-1.5 py-0.5 bg-emerald-500/10 rounded'>
                            +{g.chronicleData.pLDelta}
                          </span>
                        )}
                        {g.playerLName}
                      </span>
                      <span className='font-mono bg-muted/50 px-3 py-1 rounded-lg text-primary shrink-0'>
                        {g.scoreL} - {g.scoreR}
                      </span>
                      <span
                        className={`truncate flex-1 text-left flex items-center gap-2 ${g.winnerId === g.playerRId ? 'text-foreground' : 'text-muted-foreground'}`}
                      >
                        {g.playerRName}
                        {g.chronicleData && g.chronicleData.pRDelta < 0 && (
                          <span className='text-[10px] text-red-500 font-black px-1.5 py-0.5 bg-red-500/10 rounded'>
                            {g.chronicleData.pRDelta}
                          </span>
                        )}
                        {g.chronicleData && g.chronicleData.pRDelta > 0 && (
                          <span className='text-[10px] text-emerald-500 font-black px-1.5 py-0.5 bg-emerald-500/10 rounded'>
                            +{g.chronicleData.pRDelta}
                          </span>
                        )}
                      </span>
                    </div>
                  </div>

                  {g.chronicleData && (
                    <div className='flex flex-col gap-1 mt-3 pt-3 border-t border-border/30 bg-muted/10 rounded-xl p-3 font-mono text-[10px] text-muted-foreground shadow-inner'>
                      <div className='flex justify-between items-center w-full'>
                        <span className='opacity-70 text-left w-1/4 truncate'>
                          {g.playerLName}{' '}
                          <span className='text-foreground font-bold ml-1'>
                            [{Math.round(g.chronicleData.pLEloBefore)}]
                          </span>
                        </span>
                        <span className='flex-1 flex justify-center items-center gap-1.5 opacity-80'>
                          <span className='font-bold'>
                            {g.chronicleData.pLBaseDelta > 0
                              ? `+${g.chronicleData.pLBaseDelta}`
                              : g.chronicleData.pLBaseDelta}{' '}
                            {t('Base')}
                          </span>
                          {state.isDerbyMode &&
                            g.winnerId === g.playerLId &&
                            g.chronicleData.nemesisApplied && (
                              <span className='text-purple-500 font-bold bg-purple-500/10 px-1.5 py-0.5 rounded'>
                                ×1.5
                              </span>
                            )}
                          {state.isDerbyMode &&
                            g.winnerId === g.playerLId &&
                            g.chronicleData.bountyApplied > 0 && (
                              <span className='text-red-500 font-bold bg-red-500/10 px-1.5 py-0.5 rounded'>
                                +{g.chronicleData.bountyApplied} {t('Bounty')}
                              </span>
                            )}
                        </span>
                        <span className='w-1/4 text-right'>
                          <span className='text-foreground font-bold bg-background px-2 py-1 rounded shadow-sm border border-border/50'>
                            ={' '}
                            {g.chronicleData.pLDelta > 0
                              ? `+${g.chronicleData.pLDelta}`
                              : g.chronicleData.pLDelta}
                          </span>
                        </span>
                      </div>
                      <div className='flex justify-between items-center w-full'>
                        <span className='opacity-70 text-left w-1/4 truncate'>
                          {g.playerRName}{' '}
                          <span className='text-foreground font-bold ml-1'>
                            [{Math.round(g.chronicleData.pREloBefore)}]
                          </span>
                        </span>
                        <span className='flex-1 flex justify-center items-center gap-1.5 opacity-80'>
                          <span className='font-bold'>
                            {g.chronicleData.pRBaseDelta > 0
                              ? `+${g.chronicleData.pRBaseDelta}`
                              : g.chronicleData.pRBaseDelta}{' '}
                            {t('Base')}
                          </span>
                          {state.isDerbyMode &&
                            g.winnerId === g.playerRId &&
                            g.chronicleData.nemesisApplied && (
                              <span className='text-purple-500 font-bold bg-purple-500/10 px-1.5 py-0.5 rounded'>
                                ×1.5
                              </span>
                            )}
                          {state.isDerbyMode &&
                            g.winnerId === g.playerRId &&
                            g.chronicleData.bountyApplied > 0 && (
                              <span className='text-red-500 font-bold bg-red-500/10 px-1.5 py-0.5 rounded'>
                                +{g.chronicleData.bountyApplied} {t('Bounty')}
                              </span>
                            )}
                        </span>
                        <span className='w-1/4 text-right'>
                          <span className='text-foreground font-bold bg-background px-2 py-1 rounded shadow-sm border border-border/50'>
                            ={' '}
                            {g.chronicleData.pRDelta > 0
                              ? `+${g.chronicleData.pRDelta}`
                              : g.chronicleData.pRDelta}
                          </span>
                        </span>
                      </div>
                    </div>
                  )}

                  {state.isDerbyMode &&
                    g.chronicleData &&
                    (g.chronicleData.bountyApplied > 0 ||
                      g.chronicleData.nemesisApplied ||
                      g.chronicleData.streakContinued >= 3) && (
                      <div className='flex flex-wrap items-center justify-center gap-2 pt-3 mt-1'>
                        {g.chronicleData.bountyApplied > 0 && (
                          <div className='flex items-center gap-1.5 text-[10px] font-bold bg-red-500/10 text-red-600 dark:text-red-400 px-2.5 py-1 rounded-md ring-1 ring-red-500/20 uppercase tracking-widest'>
                            <Swords className='w-3.5 h-3.5' />
                            {t('Bounty Claimed!')}
                          </div>
                        )}
                        {g.chronicleData.nemesisApplied && (
                          <div className='flex items-center gap-1.5 text-[10px] font-bold bg-purple-500/10 text-purple-600 dark:text-purple-400 px-2.5 py-1 rounded-md ring-1 ring-purple-500/20 uppercase tracking-widest'>
                            <Skull className='w-3.5 h-3.5' />
                            {t('Nemesis Defeated!')}
                          </div>
                        )}
                        {g.chronicleData.streakContinued >= 3 &&
                          !g.chronicleData.bountyApplied &&
                          !g.chronicleData.nemesisApplied && (
                            <div className='flex items-center gap-1.5 text-[10px] font-bold bg-orange-500/10 text-orange-600 dark:text-orange-400 px-2.5 py-1 rounded-md ring-1 ring-orange-500/20 uppercase tracking-widest'>
                              <Flame className='w-3.5 h-3.5 fill-current animate-pulse' />
                              {g.chronicleData.streakContinued}{' '}
                              {t('Win Streak')}
                            </div>
                          )}
                      </div>
                    )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <Button
        size='lg'
        className='h-16 w-full text-xl rounded-[1.5rem] font-black uppercase tracking-[0.2em] shadow-xl hover:scale-[1.01] transition-transform shrink-0'
        onClick={actions.onCloseReset}
      >
        {t('Exit Arena')}
      </Button>
    </div>
  );
};

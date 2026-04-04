// src/components/scoreboard/MatchPhase.tsx
import { Button } from '@/components/ui/button';
import { Loader2, Trophy } from 'lucide-react';

export const MatchPhase = ({ state, actions, t }: any) => {
  return (
    <div className='w-full h-full flex flex-col relative'>
      <div className='flex-none flex flex-col items-center pt-10 pb-6 z-10 w-full'>
        <div className='flex flex-wrap justify-center gap-4 mb-8 px-6'>
          {state.matchHistory.map((m: any, i: number) => (
            <div
              key={i}
              className='bg-card/60 backdrop-blur-xl border border-border/50 px-5 py-2.5 rounded-2xl text-xs font-black shadow-xl flex items-center gap-4 group hover:scale-105 transition-transform'
            >
              <span
                className={`${m.playerLId === state.initialIds?.l ? 'text-blue-500' : 'text-red-500'}`}
              >
                {m.playerLName}
              </span>
              <div className='bg-background/80 px-3 py-1 rounded-lg font-mono text-base tracking-tighter'>
                <span className={m.scoreL > m.scoreR ? 'text-primary' : ''}>
                  {m.scoreL}
                </span>
                <span className='text-muted-foreground mx-1'>:</span>
                <span className={m.scoreR > m.scoreL ? 'text-primary' : ''}>
                  {m.scoreR}
                </span>
              </div>
              <span
                className={`${m.playerRId === state.initialIds?.l ? 'text-blue-500' : 'text-red-500'}`}
              >
                {m.playerRName}
              </span>
            </div>
          ))}
        </div>

        <div className='flex items-center gap-10'>
          <div className='flex flex-col items-end'>
            <span className='text-[10px] font-black uppercase tracking-widest text-muted-foreground'>
              {t('Arena')}
            </span>
            <span className='text-xl font-black uppercase tracking-tighter opacity-50'>
              {state.selectedRoom?.name}
            </span>
          </div>
          <div className='h-12 w-px bg-border/50' />
          <div className='bg-primary text-primary-foreground px-10 py-3 rounded-full text-lg font-black uppercase tracking-[0.3em] shadow-lg'>
            {t('Game')} {state.matchHistory.length + 1}
          </div>
          <div className='h-12 w-px bg-border/50' />
          <div className='flex flex-col items-start'>
            <span className='text-[10px] font-black uppercase tracking-widest text-muted-foreground'>
              {t('Time')}
            </span>
            <span className='text-3xl font-mono font-light tracking-tighter tabular-nums opacity-80'>
              {((v) =>
                typeof v === 'number'
                  ? `${Math.floor(v / 60)
                      .toString()
                      .padStart(
                        2,
                        '0',
                      )}:${(v % 60).toString().padStart(2, '0')}`
                  : '00:00')(state.time)}
            </span>
          </div>
        </div>
      </div>

      <div className='flex-1 flex items-center justify-center w-full z-10 relative'>
        <div className='absolute inset-0 flex items-center justify-center pointer-events-none opacity-[0.03] text-[40vw] font-black italic select-none'>
          VS
        </div>

        <div className='flex-1 h-full flex flex-col items-center justify-center relative px-12 group'>
          <div className='flex flex-col items-center mb-10 transition-transform group-hover:-translate-y-2 relative'>
            {!state.isMatchFinished && state.currentServerSide === 'L' && (
              <div className='absolute -top-10 bg-emerald-500 text-white text-[10px] font-black px-3 py-1 rounded-full animate-bounce uppercase tracking-widest shadow-[0_0_15px_rgba(16,185,129,0.6)]'>
                {t('Serve')}
              </div>
            )}
            <h3
              className={`text-6xl lg:text-8xl font-black uppercase tracking-tighter mb-6 ${state.playerLId === state.initialIds?.l ? 'text-blue-500 drop-shadow-[0_0_20px_rgba(59,130,246,0.3)]' : 'text-red-500 drop-shadow-[0_0_20px_rgba(239,68,68,0.3)]'}`}
            >
              {state.playerLName}
            </h3>
            <div className='flex gap-3'>
              {Array.from({ length: 4 }).map((_, i) => {
                const status = state.playerLHistoryStatus[i];
                const colorClass =
                  status === 'win'
                    ? 'bg-emerald-500 border-emerald-400 shadow-[0_0_15px_#10b981]'
                    : status === 'loss'
                      ? 'bg-red-500 border-red-400 shadow-[0_0_15px_#ef4444]'
                      : 'bg-transparent border-muted-foreground/20';
                return (
                  <div
                    key={i}
                    className={`h-4 w-4 rounded-full border-2 transition-all duration-700 ${colorClass}`}
                  />
                );
              })}
            </div>
          </div>
          <div
            className={`text-[min(28vw,38vh)] leading-none font-black font-mono tracking-tighter tabular-nums transition-all duration-500 ${state.isMatchFinished && state.scoreL > state.scoreR ? 'text-primary scale-110 drop-shadow-[0_0_60px_rgba(var(--primary),0.5)]' : state.intensityClasses[state.intensity as keyof typeof state.intensityClasses]}`}
          >
            {state.scoreL}
          </div>
        </div>

        <div className='flex-1 h-full flex flex-col items-center justify-center relative px-12 group'>
          <div className='flex flex-col items-center mb-10 transition-transform group-hover:-translate-y-2 relative'>
            {!state.isMatchFinished && state.currentServerSide === 'R' && (
              <div className='absolute -top-10 bg-emerald-500 text-white text-[10px] font-black px-3 py-1 rounded-full animate-bounce uppercase tracking-widest shadow-[0_0_15px_rgba(16,185,129,0.6)]'>
                {t('Serve')}
              </div>
            )}
            <h3
              className={`text-6xl lg:text-8xl font-black uppercase tracking-tighter mb-6 ${state.playerRId === state.initialIds?.l ? 'text-blue-500 drop-shadow-[0_0_20px_rgba(59,130,246,0.3)]' : 'text-red-500 drop-shadow-[0_0_20px_rgba(239,68,68,0.3)]'}`}
            >
              {state.playerRName}
            </h3>
            <div className='flex gap-3'>
              {Array.from({ length: 4 }).map((_, i) => {
                const status = state.playerRHistoryStatus[i];
                const colorClass =
                  status === 'win'
                    ? 'bg-emerald-500 border-emerald-400 shadow-[0_0_15px_#10b981]'
                    : status === 'loss'
                      ? 'bg-red-500 border-red-400 shadow-[0_0_15px_#ef4444]'
                      : 'bg-transparent border-muted-foreground/20';
                return (
                  <div
                    key={i}
                    className={`h-4 w-4 rounded-full border-2 transition-all duration-700 ${colorClass}`}
                  />
                );
              })}
            </div>
          </div>
          <div
            className={`text-[min(28vw,38vh)] leading-none font-black font-mono tracking-tighter tabular-nums transition-all duration-500 ${state.isMatchFinished && state.scoreR > state.scoreL ? 'text-primary scale-110 drop-shadow-[0_0_60px_rgba(var(--primary),0.5)]' : state.intensityClasses[state.intensity as keyof typeof state.intensityClasses]}`}
          >
            {state.scoreR}
          </div>
        </div>
      </div>

      <div className='absolute bottom-10 left-10 z-50 group'>
        <div className='absolute bottom-full left-0 mb-4 p-8 bg-card/90 backdrop-blur-3xl rounded-[2.5rem] border border-border shadow-2xl min-w-[340px] opacity-0 translate-y-4 pointer-events-none group-hover:opacity-100 group-hover:translate-y-0 group-hover:pointer-events-auto group-focus-within:opacity-100 group-focus-within:translate-y-0 group-focus-within:pointer-events-auto transition-all duration-300 origin-bottom-left'>
          <div className='flex items-center gap-3 mb-6'>
            <div className='h-3 w-3 rounded-full bg-emerald-500 animate-pulse' />
            <h4 className='text-xs font-black uppercase tracking-[0.2em] text-foreground'>
              {state.isMatchFinished ? t('Post-Match') : t('Smart Remote')}
            </h4>
          </div>
          <div className='grid grid-cols-1 gap-y-4 font-mono'>
            {!state.isMatchFinished ? (
              <>
                <div className='flex justify-between items-center gap-6 text-xs'>
                  <span className='text-muted-foreground font-bold uppercase'>
                    {t('Right +1')}
                  </span>
                  <kbd className='bg-primary/20 px-3 py-1 rounded border-b-2 border-primary/40 font-black text-primary'>
                    1 Click
                  </kbd>
                </div>
                <div className='flex justify-between items-center gap-6 text-xs'>
                  <span className='text-muted-foreground font-bold uppercase'>
                    {t('Left +1')}
                  </span>
                  <kbd className='bg-primary/20 px-3 py-1 rounded border-b-2 border-primary/40 font-black text-primary'>
                    2 Clicks
                  </kbd>
                </div>
                <div className='flex justify-between items-center gap-6 text-xs'>
                  <span className='text-muted-foreground font-bold uppercase'>
                    {t('Undo Right')}
                  </span>
                  <kbd className='bg-muted px-3 py-1 rounded border-b-2 border-border font-black text-muted-foreground'>
                    3 Clicks
                  </kbd>
                </div>
                <div className='flex justify-between items-center gap-6 text-xs'>
                  <span className='text-muted-foreground font-bold uppercase'>
                    {t('Undo Left')}
                  </span>
                  <kbd className='bg-muted px-3 py-1 rounded border-b-2 border-border font-black text-muted-foreground'>
                    4 Clicks
                  </kbd>
                </div>
                <div className='flex justify-between items-center gap-6 text-xs pt-2 border-t border-border/50'>
                  <span className='text-muted-foreground/50 font-bold uppercase'>
                    {t('Keyboard')}
                  </span>
                  <span className='font-black text-muted-foreground/50'>
                    Q / P / S
                  </span>
                </div>
              </>
            ) : (
              <>
                <div className='flex justify-between items-center gap-6 text-xs'>
                  <span className='text-indigo-400 font-black uppercase'>
                    {t('Swap & Next')}
                  </span>
                  <kbd className='bg-indigo-500/20 px-3 py-1 rounded border-b-2 border-indigo-500 text-indigo-400 font-black'>
                    Enter
                  </kbd>
                </div>
                <div className='flex justify-between items-center gap-6 text-xs'>
                  <span className='text-emerald-400 font-black uppercase'>
                    {t('Stay & Next')}
                  </span>
                  <kbd className='bg-emerald-500/20 px-3 py-1 rounded border-b-2 border-emerald-500 text-emerald-400 font-black'>
                    N
                  </kbd>
                </div>
              </>
            )}
            <div className='mt-4 pt-6 border-t border-border flex flex-col gap-2'>
              <span className='text-[10px] font-black text-muted-foreground uppercase tracking-widest'>
                {t('Save Match Series')}
              </span>
              <div className='flex items-center gap-2 font-black text-primary italic'>
                <span className='text-lg'>
                  {state.isMac ? '⌘' : 'Ctrl'} + Enter
                </span>
              </div>
            </div>
          </div>
        </div>

        <button className='p-4 bg-card/90 backdrop-blur-3xl rounded-full border border-border shadow-2xl flex items-center gap-3 cursor-pointer hover:bg-muted focus:outline-none focus:ring-4 focus:ring-primary/50 transition-all w-max'>
          <div className='h-3 w-3 rounded-full bg-emerald-500 animate-pulse' />
          <span className='text-xs font-black uppercase tracking-[0.2em] pr-2'>
            {state.isMatchFinished ? t('Post-Match') : t('Remote')}
          </span>
        </button>
      </div>

      {state.isMatchFinished && (
        <div className='absolute inset-0 bg-background/60 backdrop-blur-md z-40 flex flex-col items-center justify-center animate-in zoom-in-95 duration-500'>
          <div className='bg-card border border-border/50 p-16 rounded-[4rem] shadow-[0_0_100px_rgba(0,0,0,0.4)] flex flex-col items-center text-center max-w-2xl w-full mx-4 relative overflow-hidden'>
            <div className='absolute top-0 left-0 w-full h-1.5 bg-primary shadow-[0_0_15px_rgba(var(--primary),0.5)]' />
            <Trophy className='w-20 h-20 text-primary mb-8 animate-bounce' />
            <h2 className='text-6xl font-black text-foreground uppercase tracking-tighter mb-4'>
              {state.scoreL > state.scoreR
                ? state.playerLName
                : state.playerRName}
            </h2>
            <p className='text-2xl font-black text-primary uppercase tracking-[0.3em] mb-12'>
              {t('Set Victory')}
            </p>

            <div className='grid grid-cols-2 gap-4 w-full'>
              <Button
                size='lg'
                className='h-16 text-lg font-black uppercase rounded-2xl'
                onClick={() => actions.handleNextAction('next_swap')}
              >
                {t('Swap & Next [Enter]')}
              </Button>
              <Button
                size='lg'
                variant='secondary'
                className='h-16 text-lg font-black uppercase rounded-2xl'
                onClick={() => actions.handleNextAction('next_keep')}
              >
                {t('Stay & Next [N]')}
              </Button>
              <Button
                size='lg'
                variant='outline'
                className='h-16 text-lg font-bold rounded-2xl col-span-2'
                onClick={() => actions.handleNextAction('rematch')}
              >
                {t('Discard & Replay [Space]')}
              </Button>

              <Button
                size='lg'
                className='h-20 text-2xl font-black uppercase col-span-2 bg-emerald-600 hover:bg-emerald-500 mt-6 rounded-2xl shadow-xl'
                onClick={actions.submitSeries}
                disabled={state.isSubmitting}
              >
                {state.isSubmitting ? (
                  <Loader2 className='animate-spin mr-3 h-8 w-8' />
                ) : null}
                {t('Submit Final Series')}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

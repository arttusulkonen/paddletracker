import { Loader2 } from 'lucide-react';

export const WaitingPhase = ({ state, actions, t }: any) => {
  return (
    <div className='text-center space-y-12 relative z-10 w-full max-w-6xl px-8'>
      <div className='flex flex-col items-center gap-4'>
        {state.isGarminEnabled && (
          state.matchState.deviceConnected ? (
            <div className='bg-emerald-500/20 text-emerald-500 border border-emerald-500/50 px-6 py-2 rounded-full flex items-center gap-2 animate-in fade-in zoom-in duration-500'>
              <div className='h-2 w-2 rounded-full bg-emerald-500 animate-pulse' />
              <span className='text-sm font-black uppercase tracking-widest'>
                Garmin Watch Connected
              </span>
            </div>
          ) : (
            <div className='bg-amber-500/10 text-amber-500/50 border border-amber-500/20 px-6 py-2 rounded-full flex items-center gap-2'>
              <Loader2 className='h-4 w-4 animate-spin' />
              <span className='text-sm font-bold uppercase tracking-widest italic text-muted-foreground/40'>
                Waiting for Garmin...
              </span>
            </div>
          )
        )}
      </div>
      <div className='inline-block bg-primary/10 px-10 py-3 rounded-full border border-primary/20'>
        <h2 className='text-2xl font-black text-primary uppercase tracking-[0.4em]'>
          {state.selectedRoom?.name}
        </h2>
      </div>
      <div className='space-y-4'>
        <h1 className='text-6xl md:text-8xl font-black text-foreground uppercase tracking-tighter drop-shadow-2xl italic'>
          {t('Who serves first?')}
        </h1>
        <p className='text-xl md:text-2xl text-muted-foreground font-black tracking-[0.2em] uppercase py-2'>
          {t('Select to begin match')}
        </p>
      </div>
      <div className='grid grid-cols-2 gap-10 md:gap-20 pt-8'>
        <button
          onClick={() => actions.handleServerSelection('L')}
          className='flex flex-col items-center gap-6 p-10 rounded-[3rem] border-4 border-transparent hover:border-blue-500/50 hover:bg-blue-500/10 transition-all group focus:outline-none focus:ring-4 focus:ring-blue-500/30'
        >
          <span className='text-4xl md:text-6xl font-black uppercase italic text-blue-500 drop-shadow-[0_0_20px_rgba(59,130,246,0.5)] group-hover:scale-105 transition-transform'>
            {state.playerLName}
          </span>
          <span className='text-sm font-black tracking-[0.5em] text-muted-foreground/60 not-italic uppercase'>
            {t('Press ←')}
          </span>
        </button>
        <button
          onClick={() => actions.handleServerSelection('R')}
          className='flex flex-col items-center gap-6 p-10 rounded-[3rem] border-4 border-transparent hover:border-red-500/50 hover:bg-red-500/10 transition-all group focus:outline-none focus:ring-4 focus:ring-red-500/30'
        >
          <span className='text-4xl md:text-6xl font-black uppercase italic text-red-500 drop-shadow-[0_0_20px_rgba(239,68,68,0.5)] group-hover:scale-105 transition-transform'>
            {state.playerRName}
          </span>
          <span className='text-sm font-black tracking-[0.5em] text-muted-foreground/60 not-italic uppercase'>
            {t('Press →')}
          </span>
        </button>
      </div>
    </div>
  );
};

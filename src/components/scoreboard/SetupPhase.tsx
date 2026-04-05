// src/components/scoreboard/SetupPhase.tsx
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';

export const SetupPhase = ({ state, actions, t }: any) => {
  return (
    <div className='w-full max-w-xl space-y-12 p-10 relative z-10 bg-card/30 backdrop-blur-2xl rounded-[3rem] border border-border/50 shadow-2xl'>
      <div className='text-center space-y-4'>
        <h2 className='text-6xl font-black tracking-tighter uppercase italic text-primary'>
          {t('Arena')}
        </h2>
        <p className='text-muted-foreground font-bold tracking-widest uppercase text-xs'>
          {t('Match Configuration')}
        </p>
      </div>
      <div className='space-y-6'>
        <div className='space-y-3'>
          <label
            htmlFor='roomId'
            className='text-[10px] font-black text-muted-foreground uppercase tracking-[0.3em] pl-2'
          >
            {t('Select Arena')}
          </label>
          <select
            id='roomId'
            name='roomId'
            value={state.selectedRoom?.id || ''}
            onChange={(e) => {
              const r = state.rooms.find(
                (room: any) => room.id === e.target.value,
              );
              if (r) {
                actions.setSelectedRoom(r);
                actions.setPlayerLId('');
                actions.setPlayerRId('');
              }
            }}
            className='w-full p-5 bg-background/50 rounded-2xl border-2 border-border/50 text-xl font-bold outline-none cursor-pointer focus:ring-4 focus:ring-primary/20 transition-all'
          >
            <option value='' disabled>
              {t('Choose Room...')}
            </option>
            {state.rooms.map((r: any) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </div>

        <div className='grid grid-cols-2 gap-6'>
          <div className='space-y-3'>
            <label
              htmlFor='playerLId'
              className='text-[10px] font-black text-blue-500 uppercase tracking-[0.3em] pl-2'
            >
              {t('Left Corner')}
            </label>
            <select
              id='playerLId'
              name='playerLId'
              value={state.playerLId}
              onChange={(e) => actions.setPlayerLId(e.target.value)}
              disabled={!state.selectedRoom}
              className='w-full p-5 bg-background/50 rounded-2xl border-2 border-blue-500/20 text-lg font-bold outline-none cursor-pointer focus:ring-4 focus:ring-blue-500/20 transition-all'
            >
              <option value='' disabled>
                {t('Select Player')}
              </option>
              {state.selectedRoom?.members?.map((m: any) => (
                <option
                  key={m.userId}
                  value={m.userId}
                  disabled={m.userId === state.playerRId}
                >
                  {m.name}
                </option>
              ))}
            </select>
          </div>
          <div className='space-y-3'>
            <label
              htmlFor='playerRId'
              className='text-[10px] font-black text-red-500 uppercase tracking-[0.3em] pl-2'
            >
              {t('Right Corner')}
            </label>
            <select
              id='playerRId'
              name='playerRId'
              value={state.playerRId}
              onChange={(e) => actions.setPlayerRId(e.target.value)}
              disabled={!state.selectedRoom}
              className='w-full p-5 bg-background/50 rounded-2xl border-2 border-red-500/20 text-lg font-bold outline-none cursor-pointer focus:ring-4 focus:ring-red-500/20 transition-all'
            >
              <option value='' disabled>
                {t('Select Player')}
              </option>
              {state.selectedRoom?.members?.map((m: any) => (
                <option
                  key={m.userId}
                  value={m.userId}
                  disabled={m.userId === state.playerLId}
                >
                  {m.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className='flex items-center gap-3 px-2 py-4'>
          <label className='relative flex items-center cursor-pointer'>
            <input
              type='checkbox'
              className='sr-only peer'
              checked={state.isGarminEnabled}
              onChange={(e) => actions.setIsGarminEnabled(e.target.checked)}
            />
            <div className='w-11 h-6 bg-muted peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[""] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500'></div>
          </label>
          <span className='text-sm font-bold text-muted-foreground uppercase tracking-widest'>
            {t('Enable Garmin Watch Sync')}
          </span>
        </div>

        <Button
          size='lg'
          className='w-full h-20 text-2xl font-black uppercase tracking-widest rounded-2xl mt-8 shadow-[0_20px_50px_rgba(var(--primary),0.2)] hover:scale-[1.02] transition-all bg-primary'
          onClick={actions.handleInitializeArena}
          disabled={
            !state.selectedRoom ||
            !state.playerLId ||
            !state.playerRId ||
            state.isPairingLoading
          }
        >
          {state.isPairingLoading ? (
            <Loader2 className='animate-spin h-8 w-8' />
          ) : (
            t('Initialize Arena')
          )}
        </Button>
      </div>
    </div>
  );
};

import type { GameSim } from '../world/players';

/** Keyboard and touch input share the same possession controller. */
export function createGameplay(game: GameSim, follow: () => void) {
  const play = document.getElementById('btn-play') as HTMLButtonElement;
  const pad = document.getElementById('play-controls')!;
  const status = document.getElementById('game-status')!;
  const score = document.getElementById('game-score')!;
  const keys = new Set<string>();
  let manual = false;
  let touchX = 0, touchZ = 0;
  let lastHud = '';
  const send = () => {
    const x = touchX + Number(keys.has('d') || keys.has('arrowright')) - Number(keys.has('a') || keys.has('arrowleft'));
    const z = touchZ + Number(keys.has('s') || keys.has('arrowdown')) - Number(keys.has('w') || keys.has('arrowup'));
    game.setManualInput(x, z);
  };
  function toggle() {
    manual = !manual;
    game.setManualControl(manual);
    keys.clear(); touchX = touchZ = 0; send();
    play.textContent = manual ? 'Watch game' : 'Take the ball';
    play.setAttribute('aria-pressed', String(manual));
    pad.hidden = !manual;
    document.body.classList.toggle('playing', manual);
    status.textContent = manual ? 'WASD / arrows to move · Space to shoot · E to pass' : 'PICKUP GAME · AUTOPLAY';
    if (manual) follow();
  }
  play.addEventListener('click', toggle);
  const supported = new Set(['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright']);
  window.addEventListener('keydown', (event) => {
    if (!manual || event.metaKey || event.ctrlKey || event.altKey || /INPUT|TEXTAREA|SELECT/.test((event.target as HTMLElement).tagName)) return;
    const key = event.key.toLowerCase();
    if (supported.has(key)) { event.preventDefault(); keys.add(key); send(); }
    if (!event.repeat && (key === ' ' || key === 'e')) {
      event.preventDefault();
      if (key === ' ') game.requestShot(); else game.requestPass();
    }
  });
  window.addEventListener('keyup', (event) => { keys.delete(event.key.toLowerCase()); send(); });
  window.addEventListener('blur', () => { keys.clear(); touchX = touchZ = 0; send(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) { keys.clear(); touchX = touchZ = 0; send(); } });
  pad.querySelectorAll<HTMLButtonElement>('[data-move]').forEach((button) => {
    const [x,z] = button.dataset.move!.split(',').map(Number);
    button.addEventListener('pointerdown', (event) => { event.preventDefault(); button.setPointerCapture(event.pointerId); touchX = x; touchZ = z; send(); });
    const stop = () => { touchX = touchZ = 0; send(); };
    button.addEventListener('pointerup', stop); button.addEventListener('pointercancel', stop); button.addEventListener('lostpointercapture', stop);
  });
  document.getElementById('btn-shoot')!.addEventListener('click', () => game.requestShot());
  document.getElementById('btn-pass')!.addEventListener('click', () => game.requestPass());
  document.getElementById('btn-spots')!.addEventListener('click', () => {
    const open = document.body.classList.toggle('show-spots');
    document.getElementById('btn-spots')!.setAttribute('aria-expanded', String(open));
  });
  return {
    get manual() { return manual; },
    update() {
      const time = `${Math.floor(game.clock / 60)}:${String(Math.floor(game.clock % 60)).padStart(2, '0')}`;
      const next = `SUNSETS  ${game.score[0]} — ${game.score[1]}  TIDES   ·   ${time}`;
      if (next !== lastHud) { score.textContent = next; lastHud = next; }
    },
  };
}

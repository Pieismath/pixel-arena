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
  const touches = new Map<number, [number,number]>();
  let lastHud = '';
  const send = () => {
    const x = touchX + Number(keys.has('d') || keys.has('arrowright')) - Number(keys.has('a') || keys.has('arrowleft'));
    const z = touchZ + Number(keys.has('s') || keys.has('arrowdown')) - Number(keys.has('w') || keys.has('arrowup'));
    game.setManualInput(x, z);
  };
  function toggle() {
    manual = !manual;
    game.setManualControl(manual);
    keys.clear(); touches.clear(); touchX = touchZ = 0; send();
    play.textContent = manual ? 'Watch game' : 'Take the ball';
    play.setAttribute('aria-pressed', String(manual));
    pad.hidden = !manual;
    document.body.classList.toggle('playing', manual);
    status.textContent = manual ? (innerWidth < 700 ? 'Move with the pad · Pass, shoot, or cross over' : 'WASD / arrows to move · Space to shoot · E pass · Q crossover') : 'PICKUP GAME · AUTOPLAY';
    if (manual) { document.body.classList.remove('show-spots'); document.getElementById('btn-spots')!.setAttribute('aria-expanded', 'false'); follow(); }
  }
  play.addEventListener('click', toggle);
  const supported = new Set(['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright']);
  window.addEventListener('keydown', (event) => {
    if (!manual || document.querySelector('dialog[open]') || event.metaKey || event.ctrlKey || event.altKey || /INPUT|TEXTAREA|SELECT/.test((event.target as HTMLElement).tagName)) return;
    const key = event.key.toLowerCase();
    if (supported.has(key)) { event.preventDefault(); keys.add(key); send(); }
    if (!event.repeat && (key === ' ' || key === 'e' || key === 'q')) {
      event.preventDefault();
      if (key === ' ') game.requestShot(); else if (key === 'e') game.requestPass(); else game.requestCrossover();
    }
  });
  window.addEventListener('keyup', (event) => { keys.delete(event.key.toLowerCase()); send(); });
  window.addEventListener('blur', () => { keys.clear(); touches.clear(); touchX = touchZ = 0; send(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) { keys.clear(); touches.clear(); touchX = touchZ = 0; send(); } });
  pad.querySelectorAll<HTMLButtonElement>('[data-move]').forEach((button) => {
    const [x,z] = button.dataset.move!.split(',').map(Number);
    const updateTouch = () => { touchX = touchZ = 0; for (const [dx,dz] of touches.values()) { touchX += dx; touchZ += dz; } send(); };
    button.addEventListener('pointerdown', (event) => { event.preventDefault(); button.setPointerCapture(event.pointerId); touches.set(event.pointerId, [x,z]); updateTouch(); });
    const stop = (event: PointerEvent) => { touches.delete(event.pointerId); updateTouch(); };
    button.addEventListener('pointerup', stop); button.addEventListener('pointercancel', stop); button.addEventListener('lostpointercapture', stop);
  });
  document.getElementById('btn-shoot')!.addEventListener('click', () => game.requestShot());
  document.getElementById('btn-crossover')!.addEventListener('click', () => game.requestCrossover());
  document.getElementById('btn-pass')!.addEventListener('click', () => game.requestPass());
  document.getElementById('btn-spots')!.addEventListener('click', () => {
    if (manual) toggle();
    const open = document.body.classList.toggle('show-spots');
    document.getElementById('btn-spots')!.setAttribute('aria-expanded', String(open));
  });
  return {
    get manual() { return manual; },
    watch() { if (manual) toggle(); },
    update() {
      const time = `${Math.floor(game.clock / 60)}:${String(Math.floor(game.clock % 60)).padStart(2, '0')}`;
      const next = `SUNSETS  ${game.score[0]} — ${game.score[1]}  TIDES   ·   ${time}`;
      if (next !== lastHud) { score.textContent = next; lastHud = next; }
    },
  };
}

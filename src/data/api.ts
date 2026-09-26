import { demoArena, emptyArena } from './demo';
import type { ArenaState } from './types';

/**
 * Where the arena's contents come from. For now it's local data; once checkout exists this
 * becomes a fetch of the live arena from the backend.
 */
export async function loadArenaState(demo: boolean): Promise<ArenaState> {
  return demo ? demoArena() : emptyArena();
}

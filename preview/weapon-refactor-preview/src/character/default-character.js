import { createProceduralKayKitCharacter } from './procedural-kaykit-character.js';

export const DEFAULT_CHARACTER_RIG_ID = 'kaykit_rig_medium';

export function createDefaultCharacter(THREE, options = {}) {
  return createProceduralKayKitCharacter(THREE, options);
}

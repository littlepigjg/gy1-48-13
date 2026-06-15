export { EnemyManager } from './EnemyManager.js';
export { tryEnterDemonExplosion } from './EnemyManager.js';
export { getTerrainPreference, measureChannelWidth, countAdjacentDiggable } from './terrainSystem.js';
export { sendCommunication, processCommunications, updateGroupTactics, getDistance, countNearbyAllies } from './groupSystem.js';
export {
  updateSpiderAI,
  updateBatAI,
  updateDemonAI,
  updateWormAI,
  onBatHit,
  triggerDemonExplosion
} from './behaviors.js';

import { TILE_SIZE, WORLD_WIDTH, TILE_TYPES, AI_CONFIG } from '../constants.js';

export function getTerrainPreference(enemy, world) {
  const terrainConfig = AI_CONFIG.terrain[enemy.type];
  if (!terrainConfig) return 1.0;

  const tileX = enemy.tileX;
  const tileY = enemy.tileY;
  let bonus = 1.0;

  const currentTile = getTileTypeName(world.getTile(tileX, tileY));
  if (terrainConfig.preferredTiles.includes(currentTile)) {
    bonus *= 1.3;
  }
  if (terrainConfig.avoidTiles.includes(currentTile)) {
    bonus *= 0.5;
  }

  if (terrainConfig.narrowSpaceBonus) {
    const width = measureChannelWidth(world, tileX, tileY);
    if (width <= AI_CONFIG.spider.channelWidthThreshold) {
      bonus *= terrainConfig.narrowSpaceBonus;
    }
  }

  if (terrainConfig.openSpaceBonus) {
    const width = measureChannelWidth(world, tileX, tileY);
    if (width > 6) {
      bonus *= terrainConfig.openSpaceBonus;
    }
  }

  if (terrainConfig.diggableBonus) {
    const adjacentDiggable = countAdjacentDiggable(world, tileX, tileY);
    if (adjacentDiggable >= 2) {
      bonus *= terrainConfig.diggableBonus;
    }
  }

  return bonus;
}

export function getTileTypeName(tileType) {
  for (const [name, value] of Object.entries(TILE_TYPES)) {
    if (value === tileType) return name;
  }
  return 'UNKNOWN';
}

export function measureChannelWidth(world, tileX, tileY) {
  let left = tileX;
  let right = tileX;

  while (left > 0 && !world.isSolid(left - 1, tileY)) {
    left--;
  }
  while (right < WORLD_WIDTH - 1 && !world.isSolid(right + 1, tileY)) {
    right++;
  }

  return right - left + 1;
}

export function countAdjacentDiggable(world, tileX, tileY) {
  let count = 0;
  const directions = [[-1, 0], [1, 0], [0, -1], [0, 1]];

  for (const [dx, dy] of directions) {
    const tx = tileX + dx;
    const ty = tileY + dy;
    if (world.inBounds(tx, ty)) {
      const tile = world.getTile(tx, ty);
      if (tile !== TILE_TYPES.BEDROCK && tile !== TILE_TYPES.LAVA) {
        count++;
      }
    }
  }
  return count;
}

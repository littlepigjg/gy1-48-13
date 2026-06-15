import { TILE_SIZE, AI_CONFIG, ENEMY_STATES } from '../constants.js';
import { measureChannelWidth } from './terrainSystem.js';
import { sendCommunication, getDistance, countNearbyAllies } from './groupSystem.js';

export function updateSpiderAI(manager, e, player, world, hazards, dist, dt, terrainBonus) {
  if (e.spider.webCooldown > 0) {
    e.spider.webCooldown -= dt * 60;
  }

  const playerInAggro = dist < AI_CONFIG.global.aggroRange * TILE_SIZE;
  const playerInRange = dist < AI_CONFIG.spider.webRange * TILE_SIZE;

  if (playerInAggro && e.state === ENEMY_STATES.IDLE) {
    e.state = ENEMY_STATES.CHASE;
    sendCommunication(manager, e, 'player_sighted', {
      playerX: player.x,
      playerY: player.y
    });
  }

  if (e.state === ENEMY_STATES.FLANK) {
    const flankDist = AI_CONFIG.group.flankDistance * TILE_SIZE;
    e.targetX = player.x + Math.cos(e.flankTargetAngle) * flankDist;
    e.targetY = player.y + Math.sin(e.flankTargetAngle) * flankDist;

    const distToTarget = getDistance(e, { x: e.targetX, y: e.targetY });
    if (distToTarget < TILE_SIZE * 0.5) {
      e.flanking = false;
      e.state = ENEMY_STATES.CHASE;
    }
  } else if (e.state === ENEMY_STATES.CHASE || e.state === ENEMY_STATES.ATTACK) {
    e.targetX = player.x;
    e.targetY = player.y;

    if (playerInRange && e.spider.webCooldown <= 0) {
      const channelWidth = measureChannelWidth(world, player.tileX, player.tileY);
      if (channelWidth <= AI_CONFIG.spider.channelWidthThreshold || Math.random() < 0.3) {
        e.state = ENEMY_STATES.WEB_PLACEMENT;
        e.spider.webCooldown = AI_CONFIG.spider.webCooldown;
      }
    }
  } else if (e.state === ENEMY_STATES.WEB_PLACEMENT) {
    if (dist < TILE_SIZE * 1.2) {
      hazards.spawnSpiderWeb(player.x, player.y, e.id);
      e.spider.webCount++;
      e.state = ENEMY_STATES.CHASE;
    } else {
      e.targetX = player.x;
      e.targetY = player.y;
    }
  } else if (e.state === ENEMY_STATES.SUPPORT) {
    const distToTarget = getDistance(e, { x: e.targetX, y: e.targetY });
    if (distToTarget < TILE_SIZE * 2) {
      e.state = ENEMY_STATES.PATROL;
    }
  } else {
    if (e.patrolPoints.length === 0) {
      e.state = ENEMY_STATES.IDLE;
    } else {
      e.state = ENEMY_STATES.PATROL;
      const target = e.patrolPoints[e.currentPatrolIndex];
      e.targetX = target.x;
      e.targetY = target.y;

      const distToTarget = getDistance(e, target);
      if (distToTarget < TILE_SIZE * 0.5) {
        e.currentPatrolIndex = (e.currentPatrolIndex + 1) % e.patrolPoints.length;
      }
    }
  }
}

export function updateBatAI(manager, e, player, world, dist, dt, terrainBonus) {
  if (e.bat.summonCooldown > 0) {
    e.bat.summonCooldown -= dt * 60;
  }

  const playerInAggro = dist < AI_CONFIG.global.aggroRange * TILE_SIZE;

  if (playerInAggro && e.state === ENEMY_STATES.IDLE) {
    e.state = ENEMY_STATES.CHASE;
    sendCommunication(manager, e, 'player_sighted', {
      playerX: player.x,
      playerY: player.y
    });
  }

  if (e.state === ENEMY_STATES.FLANK) {
    const flankDist = AI_CONFIG.group.flankDistance * TILE_SIZE;
    e.targetX = player.x + Math.cos(e.flankTargetAngle) * flankDist;
    e.targetY = player.y + Math.sin(e.flankTargetAngle) * flankDist;

    const distToTarget = getDistance(e, { x: e.targetX, y: e.targetY });
    if (distToTarget < TILE_SIZE * 0.5) {
      e.flanking = false;
      e.state = ENEMY_STATES.CHASE;
    }
  } else if (e.state === ENEMY_STATES.CHASE || e.state === ENEMY_STATES.ATTACK) {
    e.targetX = player.x;
    e.targetY = player.y;

    const swarmSize = countNearbyAllies(manager.enemies, e, 'bat', AI_CONFIG.bat.swarmAttackRange * TILE_SIZE);
    if (swarmSize >= AI_CONFIG.bat.minSwarmSize) {
      e.state = ENEMY_STATES.ATTACK;
    }
  } else if (e.state === ENEMY_STATES.SUPPORT) {
    const distToTarget = getDistance(e, { x: e.targetX, y: e.targetY });
    if (distToTarget < TILE_SIZE * 2) {
      e.state = ENEMY_STATES.PATROL;
    }
  } else {
    if (e.aiTimer <= 0) {
      e.aiTimer = 30 + Math.random() * 30;
      e.aiDir = {
        x: (Math.random() - 0.5) * 0.6,
        y: (Math.random() - 0.5) * 0.6
      };
    }
    e.state = ENEMY_STATES.PATROL;
    e.targetX = e.x + e.aiDir.x * TILE_SIZE * 5;
    e.targetY = e.y + e.aiDir.y * TILE_SIZE * 5;
  }
}

export function onBatHit(manager, e) {
  if (!AI_CONFIG.bat.summonOnHit) return;
  if (e.bat.summonCooldown > 0) return;
  if (e.bat.summonedCount >= AI_CONFIG.bat.maxSummons) return;
  if (Math.random() > AI_CONFIG.bat.summonChance) return;

  e.bat.summonCooldown = AI_CONFIG.bat.summonCooldown;
  e.bat.summonedCount++;

  sendCommunication(manager, e, 'request_support', {
    threatLevel: 'high'
  });

  const summonRange = AI_CONFIG.bat.summonRange * TILE_SIZE;
  const idleBats = manager.enemies.filter(ally =>
    ally.type === 'bat' &&
    ally.id !== e.id &&
    ally.state === ENEMY_STATES.IDLE &&
    getDistance(ally, e) < summonRange
  );

  for (const bat of idleBats.slice(0, 2)) {
    bat.state = ENEMY_STATES.CHASE;
    bat.targetX = e.x;
    bat.targetY = e.y;
  }
}

export function updateDemonAI(manager, e, player, world, dist, dt, terrainBonus, particles, game) {
  if (e.demon.isExploding) {
    e.demon.deathExplosionTimer -= dt * 60;

    if (e.demon.deathExplosionTimer <= 0) {
      triggerDemonExplosion(manager, e, player, particles, game);
      return true;
    }
    return false;
  }

  e.demon.summonTimer -= dt * 60;

  if (e.demon.buffAuraActive) {
    sendCommunication(manager, e, 'demon_buff', {
      range: AI_CONFIG.demon.buffRange * TILE_SIZE
    });
  }

  const playerInAggro = dist < AI_CONFIG.global.aggroRange * TILE_SIZE;

  if (playerInAggro && e.state === ENEMY_STATES.IDLE) {
    e.state = ENEMY_STATES.CHASE;
    sendCommunication(manager, e, 'player_sighted', {
      playerX: player.x,
      playerY: player.y
    });
  }

  if (e.state === ENEMY_STATES.CHASE || e.state === ENEMY_STATES.ATTACK) {
    e.targetX = player.x;
    e.targetY = player.y;

    if (e.demon.summonTimer <= 0 && e.demon.minionCount < AI_CONFIG.demon.maxMinions) {
      e.demon.summonTimer = AI_CONFIG.demon.summonInterval;
      summonDemonMinions(manager, e, world);
    }
  } else if (e.state === ENEMY_STATES.SUPPORT) {
    const distToTarget = getDistance(e, { x: e.targetX, y: e.targetY });
    if (distToTarget < TILE_SIZE * 2) {
      e.state = ENEMY_STATES.PATROL;
    }
  } else {
    e.state = ENEMY_STATES.PATROL;
    if (e.patrolPoints.length > 0) {
      const target = e.patrolPoints[e.currentPatrolIndex];
      e.targetX = target.x;
      e.targetY = target.y;

      const distToTarget = getDistance(e, target);
      if (distToTarget < TILE_SIZE * 0.5) {
        e.currentPatrolIndex = (e.currentPatrolIndex + 1) % e.patrolPoints.length;
      }
    }
  }

  return false;
}

export function triggerDemonExplosion(manager, e, player, particles, game) {
  const explosionRadius = AI_CONFIG.demon.explosionRadius * TILE_SIZE;
  const explosionDamage = AI_CONFIG.demon.explosionDamage;

  particles.spawnCircle(e.x, e.y, '#FF4500', 30, 6, explosionRadius);
  particles.spawnCircle(e.x, e.y, '#FFFF00', 20, 4, explosionRadius * 0.7);
  particles.spawn(e.x, e.y, '#FF0000', 25, 5, {
    vxRange: 10,
    vyRange: 10,
    vyBias: 0,
    gravity: 0,
    lifeMin: 30,
    lifeMax: 60
  });

  if (game && game.renderer && game.renderer.shake) {
    game.renderer.shake(8, 0.8);
  }

  const playerDist = getDistance(e, player);
  if (playerDist < explosionRadius) {
    const damageFactor = 1 - playerDist / explosionRadius;
    player.takeDamage(explosionDamage * damageFactor);
  }

  manager.damageEnemyAt(
    e.x, e.y,
    explosionRadius,
    explosionDamage * 0.5,
    e.id
  );

  manager.cleanupEnemy(e);
}

function summonDemonMinions(manager, e, world) {
  e.state = ENEMY_STATES.SUMMONING;
  e.demon.summonTimer = AI_CONFIG.demon.summonInterval;

  for (let i = 0; i < AI_CONFIG.demon.summonCount; i++) {
    const angle = (i / AI_CONFIG.demon.summonCount) * Math.PI * 2;
    const dist = TILE_SIZE * 1.5;
    const spawnX = e.x + Math.cos(angle) * dist;
    const spawnY = e.y + Math.sin(angle) * dist;

    const minion = manager.createEnemy('bat', spawnX, spawnY);
    minion.isMinion = true;
    minion.masterId = e.id;
    minion.health *= 0.6;
    minion.maxHealth *= 0.6;
    minion.damage *= 0.7;
    minion.baseDamage *= 0.7;

    manager.enemies.push(minion);
    manager.assignRole(minion);
    e.minions.push(minion.id);
    e.demon.minionCount++;
  }
}

export function updateWormAI(manager, e, player, world, dist, dt, terrainBonus, particles) {
  if (e.state === ENEMY_STATES.DIGGING) {
    e.worm.digTimer -= dt * 60;

    if (e.worm.digTimer <= 0) {
      if (e.worm.digTarget) {
        e.x = e.worm.digTarget.x;
        e.y = e.worm.digTarget.y;
      }

      e.state = ENEMY_STATES.EMERGING;
      e.worm.isUnderground = false;
      e.worm.emergeTimer = AI_CONFIG.worm.emergeWarningTime;

      for (let i = 0; i < 8; i++) {
        const angle = (i / 8) * Math.PI * 2;
        particles.spawn(
          e.x + Math.cos(angle) * TILE_SIZE,
          e.y + Math.sin(angle) * TILE_SIZE,
          '#8B4513',
          3, 3,
          { vxRange: 4, vyRange: -2, vyBias: -2, lifeMin: 20, lifeMax: 40 }
        );
      }
    } else {
      e.vx *= 0.95;
      e.vy *= 0.95;
      return;
    }
  }

  if (e.state === ENEMY_STATES.EMERGING) {
    e.worm.emergeTimer -= dt * 60;

    if (e.worm.emergeTimer <= 0) {
      e.state = ENEMY_STATES.ATTACK;
      e.worm.surfaceTimer = AI_CONFIG.worm.surfaceTime;

      const emergeDist = getDistance(e, player);
      if (emergeDist < TILE_SIZE * 1.5) {
        player.takeDamage(AI_CONFIG.worm.emergeDamage);
        particles.spawnCircle(player.x, player.y, '#FF6600', 10, 4);
      }
    } else {
      e.x += (Math.random() - 0.5) * 3;
      e.y += (Math.random() - 0.5) * 3;
      return;
    }
  }

  if (e.state === ENEMY_STATES.ATTACK || e.state === ENEMY_STATES.CHASE) {
    e.worm.surfaceTimer -= dt * 60;
    e.targetX = player.x;
    e.targetY = player.y;

    if (e.worm.surfaceTimer <= 0) {
      startWormDig(e, player, world);
    }
  }

  const playerInAggro = dist < AI_CONFIG.global.aggroRange * TILE_SIZE;

  if (e.state === ENEMY_STATES.IDLE || e.state === ENEMY_STATES.PATROL) {
    if (playerInAggro) {
      if (Math.random() < 0.7 && AI_CONFIG.worm.chaseThroughWalls) {
        startWormDig(e, player, world);
      } else {
        e.state = ENEMY_STATES.CHASE;
        sendCommunication(manager, e, 'player_sighted', {
          playerX: player.x,
          playerY: player.y
        });
      }
    } else {
      e.state = ENEMY_STATES.PATROL;
      if (e.patrolPoints.length > 0) {
        const target = e.patrolPoints[e.currentPatrolIndex];
        e.targetX = target.x;
        e.targetY = target.y;

        const distToTarget = getDistance(e, target);
        if (distToTarget < TILE_SIZE * 0.5) {
          e.currentPatrolIndex = (e.currentPatrolIndex + 1) % e.patrolPoints.length;
        }
      }
    }
  }

  if (e.state === ENEMY_STATES.AMBUSH) {
    startWormDig(e, player, world);
  }
}

function startWormDig(e, player, world) {
  let digX = player.x;
  let digY = player.y;

  const angle = Math.random() * Math.PI * 2;
  const offset = AI_CONFIG.worm.ambushRange * TILE_SIZE * 0.5;
  digX += Math.cos(angle) * offset;
  digY += Math.sin(angle) * offset;

  const tileX = Math.floor(digX / TILE_SIZE);
  const tileY = Math.floor(digY / TILE_SIZE);

  if (world.isSolid(tileX, tileY)) {
    const tile = world.getTile(tileX, tileY);
    if (tile === TILE_TYPES.BEDROCK || tile === TILE_TYPES.LAVA) {
      e.state = ENEMY_STATES.CHASE;
      return;
    }
  }

  e.state = ENEMY_STATES.DIGGING;
  e.worm.isUnderground = true;
  e.worm.digTimer = AI_CONFIG.worm.digTime;
  e.worm.digTarget = { x: digX, y: digY };
}

import { TILE_SIZE, AI_CONFIG, ENEMY_ROLES, ENEMY_STATES } from '../constants.js';

export function sendCommunication(manager, sender, type, data) {
  manager.communications.push({
    id: Date.now() + Math.random(),
    senderId: sender.id,
    senderType: sender.type,
    type,
    data,
    position: { x: sender.x, y: sender.y },
    timestamp: 0,
    lifetime: 120
  });
}

export function processCommunications(manager, enemy, player) {
  const range = AI_CONFIG.group.communicationRange * TILE_SIZE;

  for (let i = manager.communications.length - 1; i >= 0; i--) {
    const comm = manager.communications[i];
    comm.timestamp++;

    if (comm.timestamp > comm.lifetime) {
      manager.communications.splice(i, 1);
      continue;
    }

    if (comm.senderId === enemy.id) continue;

    const dx = comm.position.x - enemy.x;
    const dy = comm.position.y - enemy.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist > range) continue;

    switch (comm.type) {
      case 'player_sighted':
        if (enemy.state === ENEMY_STATES.IDLE || enemy.state === ENEMY_STATES.PATROL) {
          enemy.state = ENEMY_STATES.CHASE;
          enemy.targetX = comm.data.playerX;
          enemy.targetY = comm.data.playerY;
        }
        break;

      case 'request_support':
        if (enemy.lastSupportRequest <= 0 &&
            enemy.type !== comm.senderType &&
            shouldSupport(enemy.type, comm.senderType)) {
          enemy.state = ENEMY_STATES.SUPPORT;
          enemy.targetX = comm.position.x;
          enemy.targetY = comm.position.y;
          enemy.lastSupportRequest = AI_CONFIG.group.supportRequestCooldown;
        }
        break;

      case 'flank_ready':
        if (enemy.role === ENEMY_ROLES.TANK && !enemy.flanking) {
          manager.groupTargets.set(comm.data.targetId, {
            flankerReady: true,
            tankAttackAngle: comm.data.attackAngle
          });
        }
        break;

      case 'demon_buff':
        if (!enemy.buffedBy.has(comm.senderId)) {
          enemy.buffedBy.add(comm.senderId);
          enemy.damage = enemy.baseDamage * AI_CONFIG.demon.buffDamageMultiplier;
          enemy.speed = enemy.baseSpeed * AI_CONFIG.demon.buffSpeedMultiplier;
        }
        break;

      case 'ambush_ready':
        if (enemy.role === ENEMY_ROLES.AMBUSHER) {
          enemy.state = ENEMY_STATES.AMBUSH;
          enemy.targetX = comm.data.playerX;
          enemy.targetY = comm.data.playerY;
        }
        break;
    }
  }
}

export function updateGroupTactics(manager, player) {
  const tanks = manager.enemies.filter(e => e.role === ENEMY_ROLES.TANK && e.state !== ENEMY_STATES.DIGGING);
  const flankers = manager.enemies.filter(e => e.role === ENEMY_ROLES.FLANKER && e.state !== ENEMY_STATES.DIGGING);
  const ambushers = manager.enemies.filter(e => e.role === ENEMY_ROLES.AMBUSHER);

  for (const flanker of flankers) {
    const playerDist = getDistance(flanker, player);
    if (playerDist < AI_CONFIG.global.aggroRange * TILE_SIZE && !flanker.flanking) {
      const nearestTank = tanks.find(t => getDistance(t, flanker) < AI_CONFIG.group.communicationRange * TILE_SIZE);
      if (nearestTank && nearestTank.state === ENEMY_STATES.CHASE) {
        const angleToPlayer = Math.atan2(player.y - flanker.y, player.x - flanker.x);
        const flankAngle = AI_CONFIG.group.flankAngleRange.min +
          Math.random() * (AI_CONFIG.group.flankAngleRange.max - AI_CONFIG.group.flankAngleRange.min);
        const side = Math.random() > 0.5 ? 1 : -1;

        flanker.flanking = true;
        flanker.flankTargetAngle = angleToPlayer + flankAngle * side;
        flanker.state = ENEMY_STATES.FLANK;

        sendCommunication(manager, flanker, 'flank_ready', {
          targetId: player,
          attackAngle: angleToPlayer - flankAngle * side
        });
      }
    }
  }

  for (const tank of tanks) {
    const groupTarget = manager.groupTargets.get(player);
    if (groupTarget && groupTarget.flankerReady) {
      tank.state = ENEMY_STATES.ATTACK;
    }
  }

  for (const ambusher of ambushers) {
    const playerDist = getDistance(ambusher, player);
    if (playerDist < AI_CONFIG.worm.ambushRange * TILE_SIZE * 1.5 &&
        playerDist > AI_CONFIG.worm.ambushRange * TILE_SIZE * 0.5 &&
        ambusher.state === ENEMY_STATES.PATROL) {

      for (const ally of manager.enemies) {
        if (ally.id !== ambusher.id && getDistance(ally, player) < AI_CONFIG.global.aggroRange * TILE_SIZE) {
          sendCommunication(manager, ambusher, 'ambush_ready', {
            playerX: player.x,
            playerY: player.y
          });
          break;
        }
      }
    }
  }
}

function shouldSupport(enemyType, requesterType) {
  const supportMatrix = {
    worm: ['spider', 'demon'],
    bat: ['spider', 'demon'],
    spider: ['demon', 'bat'],
    demon: []
  };
  return supportMatrix[enemyType]?.includes(requesterType) || false;
}

export function getDistance(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

export function countNearbyAllies(enemies, enemy, type, range) {
  let count = 0;
  for (const ally of enemies) {
    if (ally.id === enemy.id) continue;
    if (ally.type !== type) continue;
    if (getDistance(enemy, ally) < range) count++;
  }
  return count;
}

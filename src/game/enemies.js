import {
  TILE_SIZE,
  WORLD_WIDTH,
  WORLD_HEIGHT,
  SURFACE_Y,
  TILE_TYPES,
  AI_CONFIG,
  ENEMY_ROLES,
  ENEMY_STATES
} from './constants.js';

let enemyIdCounter = 0;

export class EnemyAI {
  constructor() {
    this.enemies = [];
    this.spawnTimer = 0;
    this.communications = [];
    this.groupTargets = new Map();
  }

  spawn(player, world, hazards) {
    const depth = player.tileY - SURFACE_Y;
    const maxDepth = WORLD_HEIGHT - SURFACE_Y;
    const depthRatio = depth / maxDepth;

    if (depthRatio < 0.15) return;
    if (this.enemies.length >= AI_CONFIG.global.maxEnemies) return;

    this.spawnTimer--;
    if (this.spawnTimer > 0) return;
    this.spawnTimer = 180 + Math.floor(Math.random() * 120);

    const angle = Math.random() * Math.PI * 2;
    const dist = 10 + Math.random() * 10;
    let spawnX = player.x + Math.cos(angle) * dist * TILE_SIZE;
    let spawnY = player.y + Math.sin(angle) * dist * TILE_SIZE;

    spawnX = Math.max(TILE_SIZE * 2, Math.min(WORLD_WIDTH * TILE_SIZE - TILE_SIZE * 2, spawnX));
    spawnY = Math.max((SURFACE_Y + 3) * TILE_SIZE, Math.min((WORLD_HEIGHT - 5) * TILE_SIZE, spawnY));

    const tileX = Math.floor(spawnX / TILE_SIZE);
    const tileY = Math.floor(spawnY / TILE_SIZE);

    if (world.isSolid(tileX, tileY)) return;

    let enemyType;
    const r = Math.random();
    if (depthRatio < 0.3) {
      enemyType = r < 0.7 ? 'worm' : 'bat';
    } else if (depthRatio < 0.6) {
      if (r < 0.4) enemyType = 'worm';
      else if (r < 0.7) enemyType = 'bat';
      else enemyType = 'spider';
    } else {
      if (r < 0.25) enemyType = 'worm';
      else if (r < 0.5) enemyType = 'bat';
      else if (r < 0.8) enemyType = 'spider';
      else enemyType = 'demon';
    }

    const enemy = this.createEnemy(enemyType, spawnX, spawnY);
    this.enemies.push(enemy);
    this.assignRole(enemy);
  }

  createEnemy(type, x, y) {
    const baseStats = {
      worm: { health: 30, speed: 1.2, damage: 5, color: '#8B4513', size: 0.7, gold: 10 },
      bat: { health: 20, speed: 2.5, damage: 4, color: '#4B0082', size: 0.6, gold: 15 },
      spider: { health: 50, speed: 1.8, damage: 10, color: '#2F4F4F', size: 0.8, gold: 25 },
      demon: { health: 100, speed: 2.0, damage: 20, color: '#8B0000', size: 1.0, gold: 60 }
    };

    const stats = baseStats[type];
    enemyIdCounter++;

    const enemy = {
      id: enemyIdCounter,
      type,
      x,
      y,
      vx: 0,
      vy: 0,
      health: stats.health,
      maxHealth: stats.health,
      speed: stats.speed,
      baseSpeed: stats.speed,
      damage: stats.damage,
      baseDamage: stats.damage,
      color: stats.color,
      size: stats.size,
      gold: stats.gold,
      tileX: Math.floor(x / TILE_SIZE),
      tileY: Math.floor(y / TILE_SIZE),
      width: TILE_SIZE * stats.size,
      height: TILE_SIZE * stats.size,
      damageFlash: 0,
      state: ENEMY_STATES.IDLE,
      role: null,
      aiTimer: 0,
      aiDir: { x: 0, y: 0 },
      targetX: x,
      targetY: y,
      pathfindTimer: 0,
      path: [],
      patrolPoints: [],
      currentPatrolIndex: 0,
      lastSupportRequest: 0,
      flanking: false,
      flankTargetAngle: 0,
      isMinion: false,
      masterId: null,
      minions: [],
      buffedBy: new Set(),
      animFrame: 0,
      animTimer: 0,

      spider: {
        webCooldown: 0,
        webCount: 0,
        patrolCenter: { x, y }
      },
      bat: {
        summonCooldown: 0,
        summonedCount: 0,
        swarmId: null
      },
      demon: {
        summonTimer: AI_CONFIG.demon.summonInterval,
        minionCount: 0,
        deathExplosionTimer: 0,
        isExploding: false,
        buffAuraActive: true
      },
      worm: {
        digTimer: 0,
        isUnderground: false,
        emergeTimer: 0,
        emergePosition: null,
        surfaceTimer: 0,
        digTarget: null
      }
    };

    this.generatePatrolPoints(enemy);

    return enemy;
  }

  generatePatrolPoints(enemy) {
    const config = AI_CONFIG[enemy.type];
    const range = config.patrolRange || 5;
    enemy.patrolPoints = [];
    const pointCount = 3 + Math.floor(Math.random() * 3);

    for (let i = 0; i < pointCount; i++) {
      const angle = (i / pointCount) * Math.PI * 2 + Math.random() * 0.5;
      const dist = range * TILE_SIZE * (0.5 + Math.random() * 0.5);
      enemy.patrolPoints.push({
        x: enemy.x + Math.cos(angle) * dist,
        y: enemy.y + Math.sin(angle) * dist
      });
    }
  }

  assignRole(enemy) {
    const division = AI_CONFIG.group.divisionOfLabor;
    if (division.tankers.includes(enemy.type)) {
      enemy.role = ENEMY_ROLES.TANK;
    } else if (division.flankers.includes(enemy.type)) {
      enemy.role = ENEMY_ROLES.FLANKER;
    } else if (division.ambushers.includes(enemy.type)) {
      enemy.role = ENEMY_ROLES.AMBUSHER;
    } else {
      enemy.role = ENEMY_ROLES.SUPPORT;
    }
  }

  getTerrainPreference(enemy, world) {
    const terrainConfig = AI_CONFIG.terrain[enemy.type];
    if (!terrainConfig) return 1.0;

    const tileX = enemy.tileX;
    const tileY = enemy.tileY;
    let bonus = 1.0;

    const currentTile = this.getTileTypeName(world.getTile(tileX, tileY));
    if (terrainConfig.preferredTiles.includes(currentTile)) {
      bonus *= 1.3;
    }
    if (terrainConfig.avoidTiles.includes(currentTile)) {
      bonus *= 0.5;
    }

    if (terrainConfig.narrowSpaceBonus) {
      const width = this.measureChannelWidth(world, tileX, tileY);
      if (width <= AI_CONFIG.spider.channelWidthThreshold) {
        bonus *= terrainConfig.narrowSpaceBonus;
      }
    }

    if (terrainConfig.openSpaceBonus) {
      const width = this.measureChannelWidth(world, tileX, tileY);
      if (width > 6) {
        bonus *= terrainConfig.openSpaceBonus;
      }
    }

    if (terrainConfig.diggableBonus) {
      const adjacentDiggable = this.countAdjacentDiggable(world, tileX, tileY);
      if (adjacentDiggable >= 2) {
        bonus *= terrainConfig.diggableBonus;
      }
    }

    return bonus;
  }

  getTileTypeName(tileType) {
    for (const [name, value] of Object.entries(TILE_TYPES)) {
      if (value === tileType) return name;
    }
    return 'UNKNOWN';
  }

  measureChannelWidth(world, tileX, tileY) {
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

  countAdjacentDiggable(world, tileX, tileY) {
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

  sendCommunication(sender, type, data) {
    const comm = {
      id: Date.now() + Math.random(),
      senderId: sender.id,
      senderType: sender.type,
      type,
      data,
      position: { x: sender.x, y: sender.y },
      timestamp: 0,
      lifetime: 120
    };
    this.communications.push(comm);
  }

  processCommunications(enemy, player) {
    const range = AI_CONFIG.group.communicationRange * TILE_SIZE;

    for (let i = this.communications.length - 1; i >= 0; i--) {
      const comm = this.communications[i];
      comm.timestamp++;

      if (comm.timestamp > comm.lifetime) {
        this.communications.splice(i, 1);
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
              this.shouldSupport(enemy, comm.senderType)) {
            enemy.state = ENEMY_STATES.SUPPORT;
            enemy.targetX = comm.position.x;
            enemy.targetY = comm.position.y;
            enemy.lastSupportRequest = AI_CONFIG.group.supportRequestCooldown;
          }
          break;

        case 'flank_ready':
          if (enemy.role === ENEMY_ROLES.TANK && !enemy.flanking) {
            this.groupTargets.set(comm.data.targetId, {
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

  shouldSupport(enemy, requesterType) {
    const supportMatrix = {
      worm: ['spider', 'demon'],
      bat: ['spider', 'demon'],
      spider: ['demon', 'bat'],
      demon: []
    };
    return supportMatrix[enemy.type]?.includes(requesterType) || false;
  }

  update(dt, player, world, hazards, particles, game) {
    this.spawn(player, world, hazards);

    this.updateGroupTactics(player);

    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];

      e.tileX = Math.floor(e.x / TILE_SIZE);
      e.tileY = Math.floor(e.y / TILE_SIZE);
      e.animTimer += dt;
      if (e.animTimer > 0.1) {
        e.animTimer = 0;
        e.animFrame = (e.animFrame + 1) % 4;
      }

      const dx = player.x - e.x;
      const dy = player.y - e.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist > 40 * TILE_SIZE) {
        this.cleanupEnemy(e);
        this.enemies.splice(i, 1);
        continue;
      }

      e.aiTimer -= dt * 60;
      e.pathfindTimer -= dt * 60;

      if (e.lastSupportRequest > 0) {
        e.lastSupportRequest -= dt * 60;
      }

      this.processCommunications(e, player);

      if (e.buffedBy.size === 0) {
        e.damage = e.baseDamage;
        e.speed = e.baseSpeed;
      }

      const terrainBonus = this.getTerrainPreference(e, world);

      let shouldRemove = false;

      switch (e.type) {
        case 'spider':
          this.updateSpiderAI(e, player, world, hazards, dist, dt, terrainBonus);
          break;
        case 'bat':
          this.updateBatAI(e, player, world, dist, dt, terrainBonus);
          break;
        case 'demon':
          if (this.updateDemonAI(e, player, world, dist, dt, terrainBonus, particles, game)) {
            shouldRemove = true;
          }
          break;
        case 'worm':
          this.updateWormAI(e, player, world, dist, dt, terrainBonus, particles);
          break;
      }

      if (shouldRemove) {
        player.gold += e.gold;
        this.enemies.splice(i, 1);
        continue;
      }

      const speedMod = hazards.getWebSlowFactor(e);
      const actualSpeed = e.speed * terrainBonus * speedMod * dt * 60;

      this.moveEnemy(e, actualSpeed, world);

      e.x = Math.max(e.width / 2, Math.min(WORLD_WIDTH * TILE_SIZE - e.width / 2, e.x));
      e.y = Math.max(e.height / 2, Math.min(WORLD_HEIGHT * TILE_SIZE - e.height / 2, e.y));

      if (dist < TILE_SIZE * 0.8 && e.state !== ENEMY_STATES.DIGGING) {
        let damage = e.damage;
        if (e.type === 'bat') {
          const swarmSize = this.countNearbyAllies(e, 'bat', AI_CONFIG.bat.swarmAttackRange * TILE_SIZE);
          if (swarmSize >= AI_CONFIG.bat.minSwarmSize) {
            damage *= AI_CONFIG.bat.swarmDamageBonus;
          }
        }
        player.takeDamage(damage * dt);
      }

      if (e.damageFlash > 0) e.damageFlash -= dt;

      if (e.health <= 0 && e.state !== ENEMY_STATES.DEAD) {
        if (e.type === 'demon' && !e.demon.isExploding) {
          e.demon.isExploding = true;
          e.demon.deathExplosionTimer = AI_CONFIG.demon.explosionDelay;
          e.state = ENEMY_STATES.DEAD;
        } else {
          this.cleanupEnemy(e);
          player.gold += e.gold;
          this.enemies.splice(i, 1);
        }
      }
    }
  }

  updateGroupTactics(player) {
    const tanks = this.enemies.filter(e => e.role === ENEMY_ROLES.TANK && e.state !== ENEMY_STATES.DIGGING);
    const flankers = this.enemies.filter(e => e.role === ENEMY_ROLES.FLANKER && e.state !== ENEMY_STATES.DIGGING);
    const ambushers = this.enemies.filter(e => e.role === ENEMY_ROLES.AMBUSHER);

    for (const flanker of flankers) {
      const playerDist = this.getDistance(flanker, player);
      if (playerDist < AI_CONFIG.global.aggroRange * TILE_SIZE && !flanker.flanking) {
        const nearestTank = tanks.find(t => this.getDistance(t, flanker) < AI_CONFIG.group.communicationRange * TILE_SIZE);
        if (nearestTank && nearestTank.state === ENEMY_STATES.CHASE) {
          const angleToPlayer = Math.atan2(player.y - flanker.y, player.x - flanker.x);
          const flankAngle = AI_CONFIG.group.flankAngleRange.min +
            Math.random() * (AI_CONFIG.group.flankAngleRange.max - AI_CONFIG.group.flankAngleRange.min);
          const side = Math.random() > 0.5 ? 1 : -1;

          flanker.flanking = true;
          flanker.flankTargetAngle = angleToPlayer + flankAngle * side;
          flanker.state = ENEMY_STATES.FLANK;

          this.sendCommunication(flanker, 'flank_ready', {
            targetId: player,
            attackAngle: angleToPlayer - flankAngle * side
          });
        }
      }
    }

    for (const tank of tanks) {
      const groupTarget = this.groupTargets.get(player);
      if (groupTarget && groupTarget.flankerReady) {
        tank.state = ENEMY_STATES.ATTACK;
      }
    }

    for (const ambusher of ambushers) {
      const playerDist = this.getDistance(ambusher, player);
      if (playerDist < AI_CONFIG.worm.ambushRange * TILE_SIZE * 1.5 &&
          playerDist > AI_CONFIG.worm.ambushRange * TILE_SIZE * 0.5 &&
          ambusher.state === ENEMY_STATES.PATROL) {

        for (const ally of this.enemies) {
          if (ally.id !== ambusher.id && this.getDistance(ally, player) < AI_CONFIG.global.aggroRange * TILE_SIZE) {
            this.sendCommunication(ambusher, 'ambush_ready', {
              playerX: player.x,
              playerY: player.y
            });
            break;
          }
        }
      }
    }
  }

  getDistance(a, b) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  countNearbyAllies(enemy, type, range) {
    let count = 0;
    for (const ally of this.enemies) {
      if (ally.id === enemy.id) continue;
      if (ally.type !== type) continue;
      const dist = this.getDistance(enemy, ally);
      if (dist < range) count++;
    }
    return count;
  }

  updateSpiderAI(e, player, world, hazards, dist, dt, terrainBonus) {
    if (e.spider.webCooldown > 0) {
      e.spider.webCooldown -= dt * 60;
    }

    const playerInAggro = dist < AI_CONFIG.global.aggroRange * TILE_SIZE;
    const playerInRange = dist < AI_CONFIG.spider.webRange * TILE_SIZE;

    if (playerInAggro && e.state === ENEMY_STATES.IDLE) {
      e.state = ENEMY_STATES.CHASE;
      this.sendCommunication(e, 'player_sighted', {
        playerX: player.x,
        playerY: player.y
      });
    }

    if (e.state === ENEMY_STATES.FLANK) {
      const flankDist = AI_CONFIG.group.flankDistance * TILE_SIZE;
      e.targetX = player.x + Math.cos(e.flankTargetAngle) * flankDist;
      e.targetY = player.y + Math.sin(e.flankTargetAngle) * flankDist;

      const distToTarget = this.getDistance(e, { x: e.targetX, y: e.targetY });
      if (distToTarget < TILE_SIZE * 0.5) {
        e.flanking = false;
        e.state = ENEMY_STATES.CHASE;
      }
    } else if (e.state === ENEMY_STATES.CHASE || e.state === ENEMY_STATES.ATTACK) {
      e.targetX = player.x;
      e.targetY = player.y;

      if (playerInRange && e.spider.webCooldown <= 0) {
        const channelWidth = this.measureChannelWidth(world, player.tileX, player.tileY);
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
      const distToTarget = this.getDistance(e, { x: e.targetX, y: e.targetY });
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

        const distToTarget = this.getDistance(e, target);
        if (distToTarget < TILE_SIZE * 0.5) {
          e.currentPatrolIndex = (e.currentPatrolIndex + 1) % e.patrolPoints.length;
        }
      }
    }
  }

  updateBatAI(e, player, world, dist, dt, terrainBonus) {
    if (e.bat.summonCooldown > 0) {
      e.bat.summonCooldown -= dt * 60;
    }

    const playerInAggro = dist < AI_CONFIG.global.aggroRange * TILE_SIZE;

    if (playerInAggro && e.state === ENEMY_STATES.IDLE) {
      e.state = ENEMY_STATES.CHASE;
      this.sendCommunication(e, 'player_sighted', {
        playerX: player.x,
        playerY: player.y
      });
    }

    if (e.state === ENEMY_STATES.FLANK) {
      const flankDist = AI_CONFIG.group.flankDistance * TILE_SIZE;
      e.targetX = player.x + Math.cos(e.flankTargetAngle) * flankDist;
      e.targetY = player.y + Math.sin(e.flankTargetAngle) * flankDist;

      const distToTarget = this.getDistance(e, { x: e.targetX, y: e.targetY });
      if (distToTarget < TILE_SIZE * 0.5) {
        e.flanking = false;
        e.state = ENEMY_STATES.CHASE;
      }
    } else if (e.state === ENEMY_STATES.CHASE || e.state === ENEMY_STATES.ATTACK) {
      e.targetX = player.x;
      e.targetY = player.y;

      const swarmSize = this.countNearbyAllies(e, 'bat', AI_CONFIG.bat.swarmAttackRange * TILE_SIZE);
      if (swarmSize >= AI_CONFIG.bat.minSwarmSize) {
        e.state = ENEMY_STATES.ATTACK;
      }
    } else if (e.state === ENEMY_STATES.SUPPORT) {
      const distToTarget = this.getDistance(e, { x: e.targetX, y: e.targetY });
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

  onBatHit(e) {
    if (!AI_CONFIG.bat.summonOnHit) return;
    if (e.bat.summonCooldown > 0) return;
    if (e.bat.summonedCount >= AI_CONFIG.bat.maxSummons) return;
    if (Math.random() > AI_CONFIG.bat.summonChance) return;

    e.bat.summonCooldown = AI_CONFIG.bat.summonCooldown;
    e.bat.summonedCount++;

    this.sendCommunication(e, 'request_support', {
      threatLevel: 'high'
    });

    const summonRange = AI_CONFIG.bat.summonRange * TILE_SIZE;
    const idleBats = this.enemies.filter(ally =>
      ally.type === 'bat' &&
      ally.id !== e.id &&
      ally.state === ENEMY_STATES.IDLE &&
      this.getDistance(ally, e) < summonRange
    );

    for (const bat of idleBats.slice(0, 2)) {
      bat.state = ENEMY_STATES.CHASE;
      bat.targetX = e.x;
      bat.targetY = e.y;
    }
  }

  updateDemonAI(e, player, world, dist, dt, terrainBonus, particles, game) {
    if (e.demon.isExploding) {
      e.demon.deathExplosionTimer -= dt * 60;
      e.x += (Math.random() - 0.5) * 5;
      e.y += (Math.random() - 0.5) * 5;

      if (e.demon.deathExplosionTimer <= 0) {
        this.triggerDemonExplosion(e, player, particles, game);
        return true;
      }
      return false;
    }

    e.demon.summonTimer -= dt * 60;

    if (e.demon.buffAuraActive) {
      this.sendCommunication(e, 'demon_buff', {
        range: AI_CONFIG.demon.buffRange * TILE_SIZE
      });
    }

    const playerInAggro = dist < AI_CONFIG.global.aggroRange * TILE_SIZE;

    if (playerInAggro && e.state === ENEMY_STATES.IDLE) {
      e.state = ENEMY_STATES.CHASE;
      this.sendCommunication(e, 'player_sighted', {
        playerX: player.x,
        playerY: player.y
      });
    }

    if (e.state === ENEMY_STATES.CHASE || e.state === ENEMY_STATES.ATTACK) {
      e.targetX = player.x;
      e.targetY = player.y;

      if (e.demon.summonTimer <= 0 && e.demon.minionCount < AI_CONFIG.demon.maxMinions) {
        e.demon.summonTimer = AI_CONFIG.demon.summonInterval;
        this.summonDemonMinions(e, world);
      }
    } else if (e.state === ENEMY_STATES.SUPPORT) {
      const distToTarget = this.getDistance(e, { x: e.targetX, y: e.targetY });
      if (distToTarget < TILE_SIZE * 2) {
        e.state = ENEMY_STATES.PATROL;
      }
    } else {
      e.state = ENEMY_STATES.PATROL;
      if (e.patrolPoints.length > 0) {
        const target = e.patrolPoints[e.currentPatrolIndex];
        e.targetX = target.x;
        e.targetY = target.y;

        const distToTarget = this.getDistance(e, target);
        if (distToTarget < TILE_SIZE * 0.5) {
          e.currentPatrolIndex = (e.currentPatrolIndex + 1) % e.patrolPoints.length;
        }
      }
    }
  }

  summonDemonMinions(e, world) {
    e.state = ENEMY_STATES.SUMMONING;
    e.demon.summonTimer = AI_CONFIG.demon.summonInterval;

    for (let i = 0; i < AI_CONFIG.demon.summonCount; i++) {
      const angle = (i / AI_CONFIG.demon.summonCount) * Math.PI * 2;
      const dist = TILE_SIZE * 1.5;
      const spawnX = e.x + Math.cos(angle) * dist;
      const spawnY = e.y + Math.sin(angle) * dist;

      const minion = this.createEnemy('bat', spawnX, spawnY);
      minion.isMinion = true;
      minion.masterId = e.id;
      minion.health *= 0.6;
      minion.maxHealth *= 0.6;
      minion.damage *= 0.7;
      minion.baseDamage *= 0.7;

      this.enemies.push(minion);
      this.assignRole(minion);
      e.minions.push(minion.id);
      e.demon.minionCount++;
    }
  }

  triggerDemonExplosion(e, player, particles, game) {
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

    game.renderer.shake(8, 0.8);

    const playerDist = this.getDistance(e, player);
    if (playerDist < explosionRadius) {
      const damageFactor = 1 - playerDist / explosionRadius;
      player.takeDamage(explosionDamage * damageFactor);
    }

    this.damageEnemyAt(
      e.x, e.y,
      explosionRadius,
      explosionDamage * 0.5,
      e.id
    );

    this.cleanupEnemy(e);
    player.gold += e.gold;
  }

  updateWormAI(e, player, world, dist, dt, terrainBonus, particles) {
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

        const emergeDist = this.getDistance(e, player);
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
        this.startWormDig(e, player, world);
      }
    }

    const playerInAggro = dist < AI_CONFIG.global.aggroRange * TILE_SIZE;

    if (e.state === ENEMY_STATES.IDLE || e.state === ENEMY_STATES.PATROL) {
      if (playerInAggro) {
        if (Math.random() < 0.7 && AI_CONFIG.worm.chaseThroughWalls) {
          this.startWormDig(e, player, world);
        } else {
          e.state = ENEMY_STATES.CHASE;
          this.sendCommunication(e, 'player_sighted', {
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

          const distToTarget = this.getDistance(e, target);
          if (distToTarget < TILE_SIZE * 0.5) {
            e.currentPatrolIndex = (e.currentPatrolIndex + 1) % e.patrolPoints.length;
          }
        }
      }
    }

    if (e.state === ENEMY_STATES.AMBUSH) {
      this.startWormDig(e, player, world);
    }
  }

  startWormDig(e, player, world) {
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

  moveEnemy(e, speed, world) {
    if (e.state === ENEMY_STATES.DIGGING) return;
    if (e.state === ENEMY_STATES.EMERGING) return;
    if (e.demon && e.demon.isExploding) return;

    const dx = e.targetX - e.x;
    const dy = e.targetY - e.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < 1) return;

    let moveX = dx / dist;
    let moveY = dy / dist;

    if (e.type === 'bat') {
      if (e.aiTimer <= 0) {
        e.aiTimer = 30 + Math.random() * 30;
        e.aiDir = {
          x: (Math.random() - 0.5) * 0.6,
          y: (Math.random() - 0.5) * 0.6
        };
      }
      moveX += e.aiDir.x * 0.3;
      moveY += e.aiDir.y * 0.3;
      const l = Math.sqrt(moveX * moveX + moveY * moveY);
      if (l > 0) { moveX /= l; moveY /= l; }
    }

    const newX = e.x + moveX * speed;
    const newY = e.y + moveY * speed;

    if (e.type === 'bat' || e.type === 'demon' || !this.checkCollision(newX, e.y, e.width, e.height, world)) {
      e.x = newX;
    }
    if (e.type === 'bat' || e.type === 'demon' || !this.checkCollision(e.x, newY, e.width, e.height, world)) {
      e.y = newY;
    }

    e.vx = moveX * speed;
    e.vy = moveY * speed;
  }

  checkCollision(x, y, width, height, world) {
    const halfW = width / 2;
    const halfH = height / 2;

    const left = Math.floor((x - halfW) / TILE_SIZE);
    const right = Math.floor((x + halfW) / TILE_SIZE);
    const top = Math.floor((y - halfH) / TILE_SIZE);
    const bottom = Math.floor((y + halfH) / TILE_SIZE);

    for (let ty = top; ty <= bottom; ty++) {
      for (let tx = left; tx <= right; tx++) {
        if (world.isSolid(tx, ty)) {
          return true;
        }
      }
    }
    return false;
  }

  checkBulletCollision(bullet) {
    for (const e of this.enemies) {
      if (e.state === ENEMY_STATES.DIGGING) continue;

      const dx = bullet.x - e.x;
      const dy = bullet.y - e.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < e.width * 0.6) {
        let damage = bullet.damage;

        if (e.type === 'worm' && e.worm.isUnderground) {
          damage *= (1 - AI_CONFIG.worm.digDamageReduction);
        }

        e.health -= damage;
        e.damageFlash = 0.2;

        if (e.type === 'bat') {
          this.onBatHit(e);
        }

        if (e.health > 0 && e.state !== ENEMY_STATES.CHASE && e.state !== ENEMY_STATES.ATTACK) {
          e.state = ENEMY_STATES.CHASE;
          this.sendCommunication(e, 'request_support', { threatLevel: 'medium' });
        }

        return true;
      }
    }
    return false;
  }

  damageEnemyAt(x, y, radius, damage, excludeId = null) {
    for (const e of this.enemies) {
      if (e.id === excludeId) continue;
      if (e.state === ENEMY_STATES.DIGGING) continue;

      const dx = e.x - x;
      const dy = e.y - y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < radius) {
        const damageFactor = 1 - dist / radius;
        e.health -= damage * damageFactor;
        e.damageFlash = 0.2;
      }
    }
  }

  cleanupEnemy(e) {
    if (e.minions) {
      for (const minionId of e.minions) {
        const minion = this.enemies.find(en => en.id === minionId);
        if (minion) {
          minion.masterId = null;
          minion.isMinion = false;
        }
      }
    }

    if (e.masterId) {
      const master = this.enemies.find(en => en.id === e.masterId);
      if (master && master.demon) {
        master.demon.minionCount--;
        master.minions = master.minions.filter(id => id !== e.id);
      }
    }

    this.communications = this.communications.filter(c => c.senderId !== e.id);

    for (const ally of this.enemies) {
      ally.buffedBy.delete(e.id);
    }
  }
}

export { EnemyAI as EnemyManager };

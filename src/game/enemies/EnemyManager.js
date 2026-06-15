import {
  TILE_SIZE,
  WORLD_WIDTH,
  WORLD_HEIGHT,
  SURFACE_Y,
  TILE_TYPES,
  AI_CONFIG,
  ENEMY_ROLES,
  ENEMY_STATES
} from '../constants.js';
import { getTerrainPreference } from './terrainSystem.js';
import { sendCommunication, processCommunications, updateGroupTactics, getDistance, countNearbyAllies } from './groupSystem.js';
import {
  updateSpiderAI,
  updateBatAI,
  updateDemonAI,
  updateWormAI,
  onBatHit,
  triggerDemonExplosion
} from './behaviors.js';

let enemyIdCounter = 0;

export function tryEnterDemonExplosion(e) {
  if (e.type === 'demon' && !e.demon.isExploding) {
    e.demon.isExploding = true;
    e.demon.deathExplosionTimer = AI_CONFIG.demon.explosionDelay;
    e.state = ENEMY_STATES.DEAD;
    return true;
  }
  return false;
}

export class EnemyManager {
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
      const d = range * TILE_SIZE * (0.5 + Math.random() * 0.5);
      enemy.patrolPoints.push({
        x: enemy.x + Math.cos(angle) * d,
        y: enemy.y + Math.sin(angle) * d
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

  update(dt, player, world, hazards, particles, game) {
    this.spawn(player, world, hazards);
    updateGroupTactics(this, player);

    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];

      if (e.health <= 0 && !(e.demon && e.demon.isExploding)) {
        continue;
      }

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
      if (e.lastSupportRequest > 0) e.lastSupportRequest -= dt * 60;

      processCommunications(this, e, player);

      if (e.buffedBy.size === 0) {
        e.damage = e.baseDamage;
        e.speed = e.baseSpeed;
      }

      const terrainBonus = getTerrainPreference(e, world);

      let shouldRemove = false;

      switch (e.type) {
        case 'spider':
          updateSpiderAI(this, e, player, world, hazards, dist, dt, terrainBonus);
          break;
        case 'bat':
          updateBatAI(this, e, player, world, dist, dt, terrainBonus);
          break;
        case 'demon':
          if (updateDemonAI(this, e, player, world, dist, dt, terrainBonus, particles, game)) {
            shouldRemove = true;
          }
          break;
        case 'worm':
          updateWormAI(this, e, player, world, dist, dt, terrainBonus, particles);
          break;
      }

      if (shouldRemove) {
        player.gold += e.gold;
        this.enemies.splice(i, 1);
        continue;
      }

      if (e.demon && e.demon.isExploding) {
        e.x += (Math.random() - 0.5) * 5;
        e.y += (Math.random() - 0.5) * 5;
      } else {
        const speedMod = hazards.getWebSlowFactor(e);
        const actualSpeed = e.speed * terrainBonus * speedMod * dt * 60;
        this.moveEnemy(e, actualSpeed, world);
      }

      e.x = Math.max(e.width / 2, Math.min(WORLD_WIDTH * TILE_SIZE - e.width / 2, e.x));
      e.y = Math.max(e.height / 2, Math.min(WORLD_HEIGHT * TILE_SIZE - e.height / 2, e.y));

      if (dist < TILE_SIZE * 0.8 && e.state !== ENEMY_STATES.DIGGING && !(e.demon && e.demon.isExploding)) {
        let damage = e.damage;
        if (e.type === 'bat') {
          const swarmSize = countNearbyAllies(this.enemies, e, 'bat', AI_CONFIG.bat.swarmAttackRange * TILE_SIZE);
          if (swarmSize >= AI_CONFIG.bat.minSwarmSize) {
            damage *= AI_CONFIG.bat.swarmDamageBonus;
          }
        }
        player.takeDamage(damage * dt);
      }

      if (e.damageFlash > 0) e.damageFlash -= dt;
    }
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
        if (world.isSolid(tx, ty)) return true;
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
          onBatHit(this, e);
        }

        if (e.health <= 0) {
          if (!tryEnterDemonExplosion(e)) {
            this.cleanupEnemy(e);
          }
        } else if (e.state !== ENEMY_STATES.CHASE && e.state !== ENEMY_STATES.ATTACK) {
          e.state = ENEMY_STATES.CHASE;
          sendCommunication(this, e, 'request_support', { threatLevel: 'medium' });
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

        if (e.health <= 0) {
          if (!tryEnterDemonExplosion(e)) {
            this.cleanupEnemy(e);
          }
        }
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
      if (e.demon) {
        e.demon.minionCount = 0;
      }
      e.minions = [];
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

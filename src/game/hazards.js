import { TILE_SIZE, TILE_TYPES, AI_CONFIG } from './constants.js';

export class SpiderWeb {
  constructor(x, y, ownerId = null) {
    this.x = x;
    this.y = y;
    this.tileX = Math.floor(x / TILE_SIZE);
    this.tileY = Math.floor(y / TILE_SIZE);
    this.ownerId = ownerId;
    this.size = TILE_SIZE * 1.2;
    this.life = AI_CONFIG.spider.webDuration;
    this.maxLife = AI_CONFIG.spider.webDuration;
    this.trappedEntities = new Set();
    this.strands = this.generateStrands();
    this.pulsePhase = Math.random() * Math.PI * 2;
  }

  generateStrands() {
    const strands = [];
    const strandCount = 8 + Math.floor(Math.random() * 4);
    for (let i = 0; i < strandCount; i++) {
      const angle = (i / strandCount) * Math.PI * 2;
      const length = this.size * (0.6 + Math.random() * 0.4);
      strands.push({
        angle,
        length,
        innerRadius: this.size * 0.15,
        wobble: Math.random() * Math.PI * 2,
        wobbleSpeed: 0.5 + Math.random() * 0.5
      });
    }
    return strands;
  }

  getSlowFactor(entity) {
    const dx = entity.x - this.x;
    const dy = entity.y - this.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < this.size * 0.6) {
      return AI_CONFIG.spider.webSlowFactor;
    } else if (dist < this.size) {
      const t = (dist - this.size * 0.6) / (this.size * 0.4);
      return AI_CONFIG.spider.webSlowFactor + (1 - AI_CONFIG.spider.webSlowFactor) * t;
    }
    return 1.0;
  }

  isInWeb(x, y) {
    const dx = x - this.x;
    const dy = y - this.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    return dist < this.size * 0.8;
  }

  update(dt, world) {
    this.life -= dt * 60;
    this.pulsePhase += dt * 2;

    for (const strand of this.strands) {
      strand.wobble += dt * strand.wobbleSpeed;
    }

    if (Math.random() < 0.001) {
      const dx = (Math.random() - 0.5) * 0.5;
      const dy = (Math.random() - 0.5) * 0.5;
    }

    return this.life > 0;
  }

  getDamage(dt) {
    return AI_CONFIG.spider.webDamagePerSecond * dt;
  }

  render(ctx, worldToScreen) {
    const screen = worldToScreen(this.x, this.y);
    const alpha = Math.min(0.7, this.life / this.maxLife * 0.8);
    const pulse = 1 + Math.sin(this.pulsePhase) * 0.05;
    const size = this.size * pulse;

    ctx.save();
    ctx.translate(screen.x, screen.y);

    ctx.strokeStyle = `rgba(255, 255, 255, ${alpha * 0.8})`;
    ctx.lineWidth = 1.5;
    ctx.shadowColor = 'rgba(255, 255, 255)';
    ctx.shadowBlur = 2;

    for (const strand of this.strands) {
      const wobbleOffset = Math.sin(strand.wobble) * 3;
      const endX = Math.cos(strand.angle) * strand.length + wobbleOffset * 0.3;
      const endY = Math.sin(strand.angle) * strand.length + wobbleOffset * 0.3;
      const innerX = Math.cos(strand.angle) * strand.innerRadius;
      const innerY = Math.sin(strand.angle) * strand.innerRadius;

      ctx.beginPath();
      ctx.moveTo(innerX, innerY);
      ctx.lineTo(endX, endY);
      ctx.stroke();
    }

    const spiralLoops = 3;
    for (let i = 0; i < spiralLoops; i++) {
      const loopRadius = size * (0.25 + i * 0.25);
      ctx.beginPath();
      for (let j = 0; j < this.strands.length; j++) {
        const strand = this.strands[j];
        const nextStrand = this.strands[(j + 1) % this.strands.length];
        const t = j / this.strands.length;
        const wobble1 = Math.sin(strand.wobble) * 2;
        const x1 = Math.cos(strand.angle) * loopRadius + wobble1 * 0.2;
        const y1 = Math.sin(strand.angle) * loopRadius + wobble1 * 0.2;
        if (j === 0) {
          ctx.moveTo(x1, y1);
        } else {
          ctx.lineTo(x1, y1);
        }
      }
      ctx.closePath();
      ctx.stroke();
    }

    ctx.fillStyle = `rgba(200, 220, 255, ${alpha * 0.15})`;
    ctx.beginPath();
    ctx.arc(0, 0, size * 0.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }
}

export class PoisonGasCloud {
  constructor(x, y, tileX, tileY, index = 0, total = 5) {
    const angle = (index / total) * Math.PI * 2;
    const spread = TILE_SIZE * 1.5;
    this.x = x + Math.cos(angle) * spread * (0.3 + Math.random() * 0.7);
    this.y = y + Math.sin(angle) * spread * (0.3 + Math.random() * 0.7);
    this.tileX = tileX;
    this.tileY = tileY;
    this.vx = Math.cos(angle) * 0.4 + (Math.random() - 0.5) * 0.2;
    this.vy = -0.2 - Math.random() * 0.15;
    this.size = TILE_SIZE * (0.9 + Math.random() * 0.3);
    this.life = 500 + Math.random() * 300;
    this.maxLife = 800;
    this.pulsePhase = Math.random() * Math.PI * 2;
  }

  update(dt, world) {
    this.x += this.vx;
    this.y += this.vy;
    this.vy += 0.005;
    if (this.vy > 0.2) this.vy = 0.2;

    const newTileX = Math.floor(this.x / TILE_SIZE);
    const newTileY = Math.floor(this.y / TILE_SIZE);
    if (world.isSolid(newTileX, newTileY)) {
      this.vx = -this.vx * 0.5;
      this.vy = -this.vy * 0.3;
      this.x += this.vx * 5;
      this.y += this.vy * 5;
    }
    this.tileX = newTileX;
    this.tileY = newTileY;

    if (Math.random() < 0.002) {
      this.vx += (Math.random() - 0.5) * 0.2;
    }

    this.life -= dt * 60;
    this.pulsePhase += dt * 2;
    return this.life > 0;
  }

  getDamageRadius() {
    return this.size * 0.6;
  }

  isAlive() {
    return this.life > 0;
  }
}

export class HazardManager {
  constructor() {
    this.poisonClouds = [];
    this.spiderWebs = [];
    this.collapseWarnings = [];
    this.damageTimer = 0;
    this.damageInterval = 0.6;
    this.maxDamagePerTick = 3;
  }

  spawnSpiderWeb(x, y, ownerId = null) {
    if (this.spiderWebs.length >= AI_CONFIG.spider.maxWebs * 2) {
      const oldest = this.spiderWebs.shift();
    }
    const web = new SpiderWeb(x, y, ownerId);
    this.spiderWebs.push(web);
    return web;
  }

  getWebSlowFactor(entity) {
    let minFactor = 1.0;
    for (const web of this.spiderWebs) {
      const factor = web.getSlowFactor(entity);
      if (factor < minFactor) {
        minFactor = factor;
      }
    }
    return minFactor;
  }

  isInAnyWeb(x, y) {
    for (const web of this.spiderWebs) {
      if (web.isInWeb(x, y)) {
        return true;
      }
    }
    return false;
  }

  removeWebsByOwner(ownerId) {
    this.spiderWebs = this.spiderWebs.filter(web => web.ownerId !== ownerId);
  }

  spawnPoisonClouds(x, y, count = 5) {
    count = Math.min(count, 5);
    for (let i = 0; i < count; i++) {
      this.poisonClouds.push(new PoisonGasCloud(
        x, y,
        Math.floor(x / TILE_SIZE),
        Math.floor(y / TILE_SIZE),
        i, count
      ));
    }
  }

  addCollapseWarning(tileX, tileY) {
    this.collapseWarnings.push({
      tileX,
      tileY,
      timer: 60,
      phase: 0
    });
  }

  update(dt, world, player, onDamage) {
    for (let i = this.spiderWebs.length - 1; i >= 0; i--) {
      const web = this.spiderWebs[i];
      if (!web.update(dt, world)) {
        this.spiderWebs.splice(i, 1);
        continue;
      }

      if (web.isInWeb(player.x, player.y)) {
        const damage = web.getDamage(dt);
        if (damage > 0 && onDamage) {
          onDamage('web', damage);
        }
      }
    }

    const clouds = this.poisonClouds;

    for (let i = clouds.length - 1; i >= 0; i--) {
      const cloud = clouds[i];

      let repelX = 0;
      let repelY = 0;
      for (let j = 0; j < clouds.length; j++) {
        if (i === j) continue;
        const other = clouds[j];
        const dx = cloud.x - other.x;
        const dy = cloud.y - other.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const minDist = TILE_SIZE * 0.8;
        if (dist < minDist && dist > 0.1) {
          const force = (minDist - dist) / minDist * 0.3;
          repelX += (dx / dist) * force;
          repelY += (dy / dist) * force;
        }
      }
      cloud.vx += repelX;
      cloud.vy += repelY;

      const maxSpeed = 0.8;
      const speed = Math.sqrt(cloud.vx * cloud.vx + cloud.vy * cloud.vy);
      if (speed > maxSpeed) {
        cloud.vx = (cloud.vx / speed) * maxSpeed;
        cloud.vy = (cloud.vy / speed) * maxSpeed;
      }

      if (!cloud.update(dt, world)) {
        clouds.splice(i, 1);
        continue;
      }
    }

    this.damageTimer += dt;
    if (this.damageTimer >= this.damageInterval) {
      this.damageTimer = 0;

      let totalIntensity = 0;
      for (const cloud of clouds) {
        const dx = player.x - cloud.x;
        const dy = player.y - cloud.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < cloud.getDamageRadius()) {
          const intensity = 1 - dist / cloud.getDamageRadius();
          totalIntensity += intensity;
        }
      }

      if (totalIntensity > 0) {
        const damage = Math.min(this.maxDamagePerTick, totalIntensity * 2);
        if (damage > 0.1) {
          onDamage('poison', damage);
        }
      }
    }

    for (let i = this.collapseWarnings.length - 1; i >= 0; i--) {
      const w = this.collapseWarnings[i];
      w.timer -= dt * 60;
      w.phase += dt * 10;
      if (w.timer <= 0) {
        this.collapseWarnings.splice(i, 1);
      }
    }
  }

  getTotalPoisonDamage(dt = 0) {
    return this.poisonClouds.length > 0 ? 0.5 * dt : 0;
  }

  render(ctx, worldToScreen) {
    for (const web of this.spiderWebs) {
      web.render(ctx, worldToScreen);
    }

    for (const cloud of this.poisonClouds) {
      const screen = worldToScreen(cloud.x, cloud.y);
      const alpha = Math.min(0.5, (cloud.life / cloud.maxLife) * 0.6);
      const pulse = 1 + Math.sin(cloud.pulsePhase) * 0.1;
      const size = cloud.size * pulse;

      const gradient = ctx.createRadialGradient(
        screen.x, screen.y, 0,
        screen.x, screen.y, size / 2
      );
      gradient.addColorStop(0, `rgba(124, 252, 0, ${alpha})`);
      gradient.addColorStop(0.5, `rgba(144, 238, 144, ${alpha * 0.6})`);
      gradient.addColorStop(1, `rgba(50, 205, 50, 0)`);

      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(screen.x, screen.y, size / 2, 0, Math.PI * 2);
      ctx.fill();
    }

    for (const w of this.collapseWarnings) {
      const screen = worldToScreen(w.tileX * TILE_SIZE, w.tileY * TILE_SIZE);
      const alpha = Math.min(1, w.timer / 30) * (0.5 + Math.sin(w.phase) * 0.5);

      ctx.strokeStyle = `rgba(255, 0, 0, ${alpha})`;
      ctx.lineWidth = 3;
      ctx.strokeRect(screen.x + 2, screen.y + 2, TILE_SIZE - 4, TILE_SIZE - 4);

      ctx.fillStyle = `rgba(255, 255, 0, ${alpha})`;
      ctx.font = 'bold 16px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('⚠', screen.x + TILE_SIZE / 2, screen.y + TILE_SIZE / 2 + 6);
    }
  }

  clear() {
    this.poisonClouds = [];
    this.spiderWebs = [];
    this.collapseWarnings = [];
  }
}

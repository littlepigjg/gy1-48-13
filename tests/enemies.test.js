import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EnemyManager, tryEnterDemonExplosion } from '../src/game/enemies/EnemyManager.js';
import { sendCommunication } from '../src/game/enemies/groupSystem.js';
import { TILE_SIZE, AI_CONFIG, ENEMY_STATES } from '../src/game/constants.js';

describe('EnemyManager - 死亡处理', () => {
  let manager;
  let mockPlayer;
  let mockWorld;
  let mockHazards;
  let mockParticles;
  let mockGame;
  let mockRenderer;

  beforeEach(() => {
    manager = new EnemyManager();
    mockPlayer = {
      x: 10 * TILE_SIZE,
      y: 20 * TILE_SIZE,
      tileX: 10,
      tileY: 20,
      gold: 0,
      takeDamage: vi.fn()
    };
    mockWorld = {
      isSolid: vi.fn(() => false),
      getTile: vi.fn(() => 0),
      inBounds: vi.fn(() => true),
      isDiggable: vi.fn(() => true)
    };
    mockHazards = {
      getWebSlowFactor: vi.fn(() => 1.0),
      spawnSpiderWeb: vi.fn()
    };
    mockParticles = {
      spawn: vi.fn(),
      spawnCircle: vi.fn()
    };
    mockRenderer = {
      shake: vi.fn()
    };
    mockGame = {
      renderer: mockRenderer
    };
  });

  const createTestEnemy = (type, x, y) => {
    const enemy = manager.createEnemy(type, x, y);
    manager.enemies.push(enemy);
    manager.assignRole(enemy);
    return enemy;
  };

  describe('damageEnemyAt - 范围攻击死亡处理', () => {
    it('范围攻击杀死蜘蛛时，应该调用 cleanupEnemy 清理资源', () => {
      const spider = createTestEnemy('spider', 10 * TILE_SIZE, 20 * TILE_SIZE);
      const initialHealth = spider.health;

      sendCommunication(manager, spider, 'player_sighted', { playerX: 0, playerY: 0 });
      expect(manager.communications.length).toBe(1);

      manager.damageEnemyAt(spider.x, spider.y, 5 * TILE_SIZE, initialHealth * 2);

      expect(spider.health).toBeLessThanOrEqual(0);
      expect(manager.communications.length).toBe(0);
    });

    it('范围攻击杀死蝙蝠时，应该调用 cleanupEnemy 清理资源', () => {
      const bat = createTestEnemy('bat', 10 * TILE_SIZE, 20 * TILE_SIZE);
      const initialHealth = bat.health;

      sendCommunication(manager, bat, 'player_sighted', { playerX: 0, playerY: 0 });
      expect(manager.communications.length).toBe(1);

      manager.damageEnemyAt(bat.x, bat.y, 5 * TILE_SIZE, initialHealth * 2);

      expect(bat.health).toBeLessThanOrEqual(0);
      expect(manager.communications.length).toBe(0);
    });

    it('范围攻击杀死蠕虫时，应该调用 cleanupEnemy 清理资源', () => {
      const worm = createTestEnemy('worm', 10 * TILE_SIZE, 20 * TILE_SIZE);
      const initialHealth = worm.health;

      sendCommunication(manager, worm, 'player_sighted', { playerX: 0, playerY: 0 });
      expect(manager.communications.length).toBe(1);

      manager.damageEnemyAt(worm.x, worm.y, 5 * TILE_SIZE, initialHealth * 2);

      expect(worm.health).toBeLessThanOrEqual(0);
      expect(manager.communications.length).toBe(0);
    });

    it('范围攻击杀死恶魔时，应该进入爆炸状态而不是立即清理', () => {
      const demon = createTestEnemy('demon', 10 * TILE_SIZE, 20 * TILE_SIZE);
      const initialHealth = demon.health;

      sendCommunication(manager, demon, 'demon_buff', { range: 100 });
      expect(manager.communications.length).toBe(1);

      manager.damageEnemyAt(demon.x, demon.y, 5 * TILE_SIZE, initialHealth * 2);

      expect(demon.health).toBeLessThanOrEqual(0);
      expect(demon.demon.isExploding).toBe(true);
      expect(demon.state).toBe(ENEMY_STATES.DEAD);
      expect(manager.communications.length).toBe(1);
    });

    it('范围攻击同时杀死多个不同类型怪物时，都应该被正确清理', () => {
      const spider = createTestEnemy('spider', 10 * TILE_SIZE, 20 * TILE_SIZE);
      const bat = createTestEnemy('bat', 11 * TILE_SIZE, 20 * TILE_SIZE);
      const worm = createTestEnemy('worm', 12 * TILE_SIZE, 20 * TILE_SIZE);

      sendCommunication(manager, spider, 'test_comm', {});
      sendCommunication(manager, bat, 'test_comm', {});
      sendCommunication(manager, worm, 'test_comm', {});
      expect(manager.communications.length).toBe(3);

      manager.damageEnemyAt(11 * TILE_SIZE, 20 * TILE_SIZE, 10 * TILE_SIZE, 1000);

      expect(spider.health).toBeLessThanOrEqual(0);
      expect(bat.health).toBeLessThanOrEqual(0);
      expect(worm.health).toBeLessThanOrEqual(0);
      expect(manager.communications.length).toBe(0);
    });

    it('范围攻击应该正确排除指定ID的敌人', () => {
      const spider1 = createTestEnemy('spider', 10 * TILE_SIZE, 20 * TILE_SIZE);
      const spider2 = createTestEnemy('spider', 11 * TILE_SIZE, 20 * TILE_SIZE);

      manager.damageEnemyAt(10 * TILE_SIZE, 20 * TILE_SIZE, 10 * TILE_SIZE, 1000, spider1.id);

      expect(spider1.health).toBeGreaterThan(0);
      expect(spider2.health).toBeLessThanOrEqual(0);
    });
  });

  describe('update - 死亡怪物跳过处理', () => {
    it('已死亡且非爆炸状态的怪物应该在update中被跳过（不移动）', () => {
      const spider = createTestEnemy('spider', 10 * TILE_SIZE, 20 * TILE_SIZE);
      spider.health = 0;
      spider.targetX = 20 * TILE_SIZE;
      spider.targetY = 20 * TILE_SIZE;

      const originalX = spider.x;
      const originalY = spider.y;

      manager.update(1.0, mockPlayer, mockWorld, mockHazards, mockParticles, mockGame);

      expect(spider.x).toBe(originalX);
      expect(spider.y).toBe(originalY);
    });

    it('爆炸中的恶魔不应该被跳过', () => {
      const demon = createTestEnemy('demon', 10 * TILE_SIZE, 20 * TILE_SIZE);
      demon.health = 0;
      demon.demon.isExploding = true;
      demon.demon.deathExplosionTimer = 60;

      const originalX = demon.x;
      const originalY = demon.y;

      manager.update(0.016, mockPlayer, mockWorld, mockHazards, mockParticles, mockGame);

      expect(demon.x).not.toBe(originalX);
      expect(demon.y).not.toBe(originalY);
    });

    it('死亡怪物不应该攻击玩家', () => {
      const spider = createTestEnemy('spider', mockPlayer.x, mockPlayer.y);
      spider.health = 0;

      mockPlayer.takeDamage.mockClear();

      manager.update(0.016, mockPlayer, mockWorld, mockHazards, mockParticles, mockGame);

      expect(mockPlayer.takeDamage).not.toHaveBeenCalled();
    });

    it('死亡怪物的动画帧不应该更新', () => {
      const spider = createTestEnemy('spider', 10 * TILE_SIZE, 20 * TILE_SIZE);
      spider.health = 0;
      spider.animFrame = 0;
      spider.animTimer = 0;

      manager.update(1.0, mockPlayer, mockWorld, mockHazards, mockParticles, mockGame);

      expect(spider.animFrame).toBe(0);
    });
  });

  describe('checkBulletCollision - 子弹攻击死亡处理', () => {
    it('子弹杀死蜘蛛时，应该调用 cleanupEnemy', () => {
      const spider = createTestEnemy('spider', 10 * TILE_SIZE, 20 * TILE_SIZE);

      sendCommunication(manager, spider, 'test', {});
      expect(manager.communications.length).toBe(1);

      const bullet = { x: spider.x, y: spider.y, damage: 1000 };
      const hit = manager.checkBulletCollision(bullet);

      expect(hit).toBe(true);
      expect(spider.health).toBeLessThanOrEqual(0);
      expect(manager.communications.length).toBe(0);
    });

    it('子弹杀死蝙蝠时，应该触发召唤同伴逻辑然后清理', () => {
      const bat1 = createTestEnemy('bat', 10 * TILE_SIZE, 20 * TILE_SIZE);
      const bat2 = createTestEnemy('bat', 12 * TILE_SIZE, 20 * TILE_SIZE);
      bat2.state = ENEMY_STATES.IDLE;

      const bullet = { x: bat1.x, y: bat1.y, damage: 1000 };
      vi.spyOn(Math, 'random').mockReturnValue(0);

      const hit = manager.checkBulletCollision(bullet);

      expect(hit).toBe(true);
      expect(bat1.health).toBeLessThanOrEqual(0);
    });

    it('子弹击伤未死亡的蝙蝠时，应该进入追击状态', () => {
      const bat = createTestEnemy('bat', 10 * TILE_SIZE, 20 * TILE_SIZE);
      bat.state = ENEMY_STATES.IDLE;

      const bullet = { x: bat.x, y: bat.y, damage: 5 };
      manager.checkBulletCollision(bullet);

      expect(bat.health).toBeGreaterThan(0);
      expect(bat.state).toBe(ENEMY_STATES.CHASE);
    });
  });

  describe('tryEnterDemonExplosion', () => {
    it('恶魔死亡时应该进入爆炸状态', () => {
      const demon = createTestEnemy('demon', 10 * TILE_SIZE, 20 * TILE_SIZE);

      const result = tryEnterDemonExplosion(demon);

      expect(result).toBe(true);
      expect(demon.demon.isExploding).toBe(true);
      expect(demon.demon.deathExplosionTimer).toBe(AI_CONFIG.demon.explosionDelay);
      expect(demon.state).toBe(ENEMY_STATES.DEAD);
    });

    it('非恶魔怪物调用应该返回false且不修改状态', () => {
      const spider = createTestEnemy('spider', 10 * TILE_SIZE, 20 * TILE_SIZE);
      const originalState = spider.state;

      const result = tryEnterDemonExplosion(spider);

      expect(result).toBe(false);
      expect(spider.state).toBe(originalState);
    });

    it('已经在爆炸的恶魔调用应该返回false且不修改计时器', () => {
      const demon = createTestEnemy('demon', 10 * TILE_SIZE, 20 * TILE_SIZE);
      demon.demon.isExploding = true;
      demon.demon.deathExplosionTimer = 30;

      const result = tryEnterDemonExplosion(demon);

      expect(result).toBe(false);
      expect(demon.demon.deathExplosionTimer).toBe(30);
    });
  });

  describe('cleanupEnemy - 资源清理', () => {
    it('应该清理该敌人发送的所有通信', () => {
      const enemy1 = createTestEnemy('spider', 10 * TILE_SIZE, 20 * TILE_SIZE);
      const enemy2 = createTestEnemy('bat', 11 * TILE_SIZE, 20 * TILE_SIZE);

      sendCommunication(manager, enemy1, 'test1', {});
      sendCommunication(manager, enemy2, 'test2', {});
      sendCommunication(manager, enemy1, 'test3', {});

      expect(manager.communications.length).toBe(3);

      manager.cleanupEnemy(enemy1);

      expect(manager.communications.length).toBe(1);
      expect(manager.communications[0].senderId).toBe(enemy2.id);
    });

    it('应该清理其他敌人身上该敌人施加的buff', () => {
      const demon = createTestEnemy('demon', 10 * TILE_SIZE, 20 * TILE_SIZE);
      const bat = createTestEnemy('bat', 11 * TILE_SIZE, 20 * TILE_SIZE);

      bat.buffedBy.add(demon.id);
      bat.damage = bat.baseDamage * AI_CONFIG.demon.buffDamageMultiplier;

      manager.cleanupEnemy(demon);

      expect(bat.buffedBy.has(demon.id)).toBe(false);
    });

    it('主人死亡时应该解除所有仆役的主仆关系', () => {
      const master = createTestEnemy('demon', 10 * TILE_SIZE, 20 * TILE_SIZE);
      const minion = createTestEnemy('bat', 11 * TILE_SIZE, 20 * TILE_SIZE);

      minion.masterId = master.id;
      minion.isMinion = true;
      master.minions.push(minion.id);
      master.demon.minionCount = 1;

      manager.cleanupEnemy(master);

      expect(minion.masterId).toBeNull();
      expect(minion.isMinion).toBe(false);
      expect(master.demon.minionCount).toBe(0);
      expect(master.minions.length).toBe(0);
    });

    it('仆役死亡时应该解除对主人的引用', () => {
      const master = createTestEnemy('demon', 10 * TILE_SIZE, 20 * TILE_SIZE);
      const minion = createTestEnemy('bat', 11 * TILE_SIZE, 20 * TILE_SIZE);

      minion.masterId = master.id;
      minion.isMinion = true;
      master.minions.push(minion.id);
      master.demon.minionCount = 1;

      manager.cleanupEnemy(minion);

      expect(master.demon.minionCount).toBe(0);
      expect(master.minions.includes(minion.id)).toBe(false);
    });
  });

  describe('恶魔爆炸完整流程', () => {
    it('恶魔死亡后应该经历完整的爆炸流程', () => {
      const demon = createTestEnemy('demon', 10 * TILE_SIZE, 20 * TILE_SIZE);
      demon.health = 0;

      tryEnterDemonExplosion(demon);
      expect(demon.demon.isExploding).toBe(true);
      expect(demon.demon.deathExplosionTimer).toBe(AI_CONFIG.demon.explosionDelay);

      const initialCount = manager.enemies.length;

      const updateCount = Math.ceil(AI_CONFIG.demon.explosionDelay / (0.016 * 60)) + 1;
      for (let i = 0; i < updateCount; i++) {
        manager.update(0.016, mockPlayer, mockWorld, mockHazards, mockParticles, mockGame);
      }

      expect(manager.enemies.length).toBe(initialCount - 1);
      expect(mockParticles.spawnCircle).toHaveBeenCalled();
      expect(mockRenderer.shake).toHaveBeenCalled();
    });

    it('恶魔爆炸应该对周围敌人造成伤害', () => {
      const spider = createTestEnemy('spider', 10.5 * TILE_SIZE, 20 * TILE_SIZE);
      const demon = createTestEnemy('demon', 10 * TILE_SIZE, 20 * TILE_SIZE);
      const spiderInitialHealth = spider.health;

      demon.health = 0;
      tryEnterDemonExplosion(demon);
      demon.demon.deathExplosionTimer = 0.5;

      manager.update(0.016, mockPlayer, mockWorld, mockHazards, mockParticles, mockGame);

      expect(spider.health).toBeLessThan(spiderInitialHealth);
    });

    it('恶魔爆炸应该对玩家造成伤害', () => {
      const demon = createTestEnemy('demon', mockPlayer.x, mockPlayer.y);
      demon.health = 0;

      tryEnterDemonExplosion(demon);
      demon.demon.deathExplosionTimer = 0.5;

      mockPlayer.takeDamage.mockClear();
      manager.update(0.016, mockPlayer, mockWorld, mockHazards, mockParticles, mockGame);

      expect(mockPlayer.takeDamage).toHaveBeenCalled();
    });
  });

  describe('怪物数组过滤', () => {
    it('非恶魔死亡怪物应该被过滤掉', () => {
      const spider = createTestEnemy('spider', 10 * TILE_SIZE, 20 * TILE_SIZE);
      spider.health = 0;

      const filtered = manager.enemies.filter(e =>
        e.health > 0 || (e.demon && e.demon.isExploding)
      );

      expect(filtered.length).toBe(0);
    });

    it('爆炸中的恶魔不应该被过滤掉', () => {
      const demon = createTestEnemy('demon', 10 * TILE_SIZE, 20 * TILE_SIZE);
      demon.health = 0;
      demon.demon.isExploding = true;

      const filtered = manager.enemies.filter(e =>
        e.health > 0 || (e.demon && e.demon.isExploding)
      );

      expect(filtered.length).toBe(1);
    });

    it('活着的怪物不应该被过滤掉', () => {
      const spider = createTestEnemy('spider', 10 * TILE_SIZE, 20 * TILE_SIZE);
      const bat = createTestEnemy('bat', 11 * TILE_SIZE, 20 * TILE_SIZE);

      const filtered = manager.enemies.filter(e =>
        e.health > 0 || (e.demon && e.demon.isExploding)
      );

      expect(filtered.length).toBe(2);
    });
  });
});

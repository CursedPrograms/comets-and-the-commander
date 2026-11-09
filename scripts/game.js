// Comet & Commander - a 3D space RTS (three.js r128)
// Fly your Commander carrier through a sphere of ten sectors. Mine comets and asteroids, build a
// fleet, research upgrades and conquer every sector's enemy hives. The battle happens all around you.
(function (CC) {
  'use strict';

  const COL = CC.COL, models = CC.models, fx = CC.fx, audio = CC.audio, sfx = CC.audio.sfx, factions = CC.factions;

  // ---------- Settings ----------
  const R = 110;                   // the battle sphere around the Commander (radar range)
  const WORLD_R = 560;             // the whole game: a sphere made of the sectors
  const SECTOR_RING = 330;         // sector centres sit on this sphere
  const SECTORS = factions.count;  // 10
  const ACTIVE = 240;              // hives this close to the Commander wake up
  const HIVES_PER_SECTOR = [1, 1, 2, 2, 2, 3, 3, 3, 3, 4];
  const SAVE_KEY = 'comet-and-commander-save-v1';

  const UNIT = {
    fighter:   { name: 'Fighter',   cost: 70,  build: 4, hp: 80,  dmg: 7,  range: 16, rate: 0.35, speed: 16, accel: 3,   turn: 5,   aggro: 30, bolt: 70, heavy: false },
    cruiser:   { name: 'Cruiser',   cost: 220, build: 9, hp: 400, dmg: 22, range: 24, rate: 0.9,  speed: 7,  accel: 1.2, turn: 1.4, aggro: 32, bolt: 50, heavy: true },
    harvester: { name: 'Harvester', cost: 60,  build: 4, hp: 120, dmg: 0,  range: 0,  rate: 0,    speed: 10, accel: 2,   turn: 3,   aggro: 0, cargo: 50, mine: 10 }
  };
  const ENEMY = {
    light: { hp: 50,  dmg: 5,  range: 14, rate: 0.7, speed: 12, accel: 2.5, turn: 4,   bolt: 55 },
    heavy: { hp: 380, dmg: 18, range: 22, rate: 1.3, speed: 5,  accel: 1,   turn: 1.2, bolt: 45 }
  };
  const UPGRADES = {
    weapons:   { name: 'Weapons',   costs: [150, 280, 420], build: 10 },
    hulls:     { name: 'Hulls',     costs: [150, 280, 420], build: 10 },
    mining:    { name: 'Mining',    costs: [100, 220, 350], build: 8 },
    logistics: { name: 'Logistics', costs: [120, 250, 380], build: 8 }
  };
  const BOUNTY = { light: 15, heavy: 60, hive: 300 };
  const STRIKE = { first: [70, 110], gap: [45, 90], speed: 46, warn: 3.5, radius: 3.2, shipDamage: 0.7, bigDamage: 0.2 };
  const BEHAVIOURS = ['swarm', 'orbit', 'harass', 'ram', 'snipe', 'regen', 'heal', 'split', 'shield'];

  // ---------- DOM ----------
  const $ = (id) => document.getElementById(id);
  const ui = {
    container: $('game-container'), resources: $('resources'), sector: $('sector'), wave: $('wave'), base: $('base-hp'),
    units: $('unit-count'), selected: $('selected-info'), queue: $('queue'), queueBar: $('queue-bar'), message: $('message'),
    box: $('select-box'), radar: $('radar'), menu: $('menu'), menuTitle: $('menu-title'), menuText: $('menu-text'),
    map: $('sector-map'), mapCanvas: $('map-canvas'), mapList: $('map-list')
  };
  const hex = (c) => '#' + c.toString(16).padStart(6, '0');

  // ---------- Three.js setup ----------
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(COL.navy);
  const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.5, 5000);
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  ui.container.insertBefore(renderer.domElement, ui.container.firstChild);

  models.environment(renderer, scene);
  scene.add(new THREE.AmbientLight(0x30465a, 0.6));
  scene.add(new THREE.HemisphereLight(0x8fd3ff, 0x001725, 0.5));
  const key = new THREE.DirectionalLight(0xfff3df, 1.6); key.position.set(900, 500, 700); scene.add(key);
  const rim = new THREE.DirectionalLight(COL.pink, 0.7); rim.position.set(-600, -200, -800); scene.add(rim);
  const fill = new THREE.DirectionalLight(COL.light, 0.4); fill.position.set(-300, 400, 600); scene.add(fill);
  // the sky (stars, nebula, planet) travels with the camera: space goes on forever
  const sky = new THREE.Group();
  scene.add(sky);
  models.backdrop(sky);
  fx.setScene(scene);

  // faint sphere showing the battle area around the Commander
  const edge = new THREE.Mesh(new THREE.SphereGeometry(R, 32, 16), new THREE.MeshBasicMaterial({ color: COL.dark, wireframe: true, transparent: true, opacity: 0.1, depthWrite: false }));
  scene.add(edge);

  // ---------- Camera: orbit freely (360 degrees) around the Commander ----------
  const cam = { q: new THREE.Quaternion(), dist: 52, target: new THREE.Vector3() };
  const qTmp = new THREE.Quaternion();
  const AX = { x: new THREE.Vector3(1, 0, 0), y: new THREE.Vector3(0, 1, 0), z: new THREE.Vector3(0, 0, 1) };
  let camTween = null;
  function resetCamera() {
    cam.q.setFromEuler(new THREE.Euler(-0.35, 0.5, 0, 'YXZ'));
    cam.dist = 52;
    placeCamera();
  }
  function rotateCamera(dx, dy) {
    qTmp.setFromAxisAngle(AX.y, -dx); cam.q.multiply(qTmp);
    qTmp.setFromAxisAngle(AX.x, -dy); cam.q.multiply(qTmp);
    cam.q.normalize();
    placeCamera();
  }
  function placeCamera() {
    cam.dist = Math.max(16, Math.min(260, cam.dist));
    camera.position.set(0, 0, cam.dist).applyQuaternion(cam.q).add(cam.target);
    camera.quaternion.copy(cam.q);
    camera.updateMatrixWorld();
  }
  function lookTowards(p) {      // swing round so p is in front, beyond the Commander
    const dir = p.clone().sub(cam.target);
    if (dir.lengthSq() < 1) return;
    dir.normalize();
    camTween = { from: cam.q.clone(), to: new THREE.Quaternion().setFromUnitVectors(AX.z, dir.negate()), t: 0 };
  }
  resetCamera();

  // ---------- Helpers ----------
  const v1 = new THREE.Vector3(), v2 = new THREE.Vector3();
  const dummy = new THREE.Object3D();
  let rng = Math.random;                       // seeded while the world is built
  function seeded(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function rand(a, b) { return a + rng() * (b - a); }
  function randDir() { return new THREE.Vector3(rand(-1, 1), rand(-1, 1), rand(-1, 1)).normalize(); }
  function randDirM() { return new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize(); }
  function d2(a, b) { return a.distanceToSquared(b); }
  function plural(n, word) { return n + ' ' + word + (n === 1 ? '' : 's'); }
  function alive(e) { return e && !e.dead; }

  // ---------- Game state ----------
  let state = null;
  const units = [], enemies = [], rocks = [], hives = [], strikes = [];
  let sectors = [];
  let commander = null;
  let selection = [];
  const groups = {};

  // ---------- Entities ----------
  class Entity {
    constructor(model, hp, team) {
      this.model = model;
      this.mesh = model.group;
      this.hp = this.maxHp = hp;
      this.team = team;
      this.isEnemy = team === 'enemy';
      this.colour = this.isEnemy ? COL.enemy : COL.light;
      this.radius = model.size;
      this.vel = new THREE.Vector3();
      this.cooldown = Math.random() * 0.5;
      this.dead = false;
      this.lastHit = -99;
      this.mesh.userData.entity = this;
      this.engines = (model.engines || []).map((e) => ({
        plume: e.children.find((c) => c.userData.plume),
        glow: e.children.find((c) => c.userData.engineGlow)
      }));
      this.barBg = new THREE.Sprite(new THREE.SpriteMaterial({ color: COL.navy, depthTest: false }));
      this.barFg = new THREE.Sprite(new THREE.SpriteMaterial({ color: COL.light, depthTest: false }));
      this.barBg.renderOrder = 21; this.barFg.renderOrder = 22;
      this.barBg.visible = this.barFg.visible = false;
      this.ring = models.ringSprite(this.isEnemy ? COL.white : COL.pink, this.radius * 2.6);
      this.ring.visible = false;
      scene.add(this.mesh); scene.add(this.barBg); scene.add(this.barFg); scene.add(this.ring);
    }
    get pos() { return this.mesh.position; }
    hurt(amount, from) {
      if (this.dead) return;
      if (this.behaviour === 'shield') amount *= 0.65;
      this.hp -= amount;
      this.lastHit = state.time;
      fx.shieldFlash(this);
      if (this.hp <= 0) this.die(from);
    }
    die() {
      this.dead = true;
      fx.explosion(this.pos.clone(), this.radius * 0.9, this.colour);
      sfx.explosion(this.radius > 4);
      this.remove();
    }
    remove() {
      scene.remove(this.mesh); scene.remove(this.barBg); scene.remove(this.barFg); scene.remove(this.ring);
    }
    steer(point, speed, dt, stopAt, noBrake) {
      v1.subVectors(point, this.pos);
      const d = v1.length();
      const arrived = d <= (stopAt || 1);
      let want = speed;
      if (!noBrake) want = arrived ? 0 : Math.min(speed, (d - (stopAt || 1)) * 1.2 + 0.5);
      if (d > 0.001) v1.multiplyScalar(want / d); else v1.set(0, 0, 0);
      this.vel.lerp(v1, Math.min(1, this.t.accel * dt));
      this.pos.addScaledVector(this.vel, dt);
      if (this.pos.lengthSq() > WORLD_R * WORLD_R) this.pos.setLength(WORLD_R);
      if (this.vel.lengthSq() > 0.5) this.face(v2.copy(this.pos).add(this.vel), dt);
      return arrived;
    }
    face(point, dt) {
      dummy.position.copy(this.pos);
      dummy.lookAt(point);
      this.mesh.quaternion.slerp(dummy.quaternion, Math.min(1, this.t.turn * dt));
    }
    drawEngines() {
      const k = Math.min(1, this.vel.length() / Math.max(1, this.t.speed));
      for (const e of this.engines) {
        if (e.plume) e.plume.scale.z = e.plume.userData.plume * (0.25 + k * 0.9) * (0.85 + Math.random() * 0.3);
        if (e.glow) { const s = e.glow.userData.engineGlow * (0.6 + k * 0.6); e.glow.scale.set(s, s, 1); }
        if (k > 0.2 && Math.random() < k * 0.8) fx.trail(e.glow ? e.glow.getWorldPosition(v2) : this.pos, this.colour);
      }
    }
    shoot(target, dmg, colour, speed, heavy, from) {
      const start = from ? from.clone() : this.pos.clone();
      sfx.laser(heavy ? 'heavy' : (this.isEnemy ? 'enemy' : 'light'));
      const me = this;
      fx.bolt(start, target, colour, speed, heavy, (p) => {
        if (target.dead) return;
        fx.spark(p, colour, heavy ? 3 : 1.8);
        sfx.hit();
        target.hurt(dmg, me);
      });
    }
  }

  class Commander extends Entity {
    constructor(pos) {
      super(models.mothership(), 3000, 'player');
      this.type = 'commander'; this.name = 'Commander';
      this.t = { speed: 8, accel: 0.5, turn: 0.5 };
      this.turrets = this.model.turrets;
      this.queue = [];
      this.progress = 0;
      this.order = null;
      this.pos.copy(pos);
    }
    hurt(amount, from) {
      super.hurt(amount, from);
      if (!this.dead && from && from.isEnemy) say('announce_base_attack', 30);
    }
    die(from) {
      super.die(from);
      fx.explosion(this.pos.clone(), 14, COL.pink);
      endGame(false);
    }
    update(dt) {
      if (this.order) { if (this.steer(this.order.point, this.t.speed, dt, 3)) this.order = null; }
      else this.steer(this.pos, 0, dt, 99);
      this.drawEngines();
      if (this.queue.length) {
        const item = this.queue[0];
        this.progress += dt;
        if (this.progress >= item.time) { this.queue.shift(); this.progress = 0; finishItem(item); }
      }
      this.cooldown -= dt;
      const threat = nearest(enemies.concat(hives), this.pos, 43);
      if (threat) for (const t of this.turrets) t.lookAt(threat.pos);
      if (threat && this.cooldown <= 0) {
        this.cooldown = 0.5;
        const t = this.turrets[Math.floor(Math.random() * this.turrets.length)];
        this.shoot(threat, 14 * dmgMult(), COL.pink, 60, true, t.getWorldPosition(v2));
      }
      for (const u of units) {
        if (u.hp < u.maxHp && d2(u.pos, this.pos) < 30 * 30) {
          u.hp = Math.min(u.maxHp, u.hp + 6 * dt);
          if (Math.random() < dt * 2) fx.line(this.pos, u.pos, COL.light);
        }
      }
      if (state.time - this.lastHit > 8) this.hp = Math.min(this.maxHp, this.hp + 3 * dt);
    }
  }

  function orbitPoint(centre, axis, r, a) {
    const u = new THREE.Vector3(1, 0, 0).cross(axis);
    if (u.lengthSq() < 0.01) u.set(0, 1, 0).cross(axis);
    u.normalize();
    const w = new THREE.Vector3().crossVectors(axis, u);
    return centre.clone().addScaledVector(u, Math.cos(a) * r).addScaledVector(w, Math.sin(a) * r);
  }

  class Unit extends Entity {
    constructor(type, pos) {
      const t = UNIT[type];
      super(models[type](), Math.round(t.hp * hullMult()), 'player');
      this.type = type; this.t = t; this.name = t.name;
      this.order = null;
      this.cargo = 0;
      this.hstate = 'seek';
      this.rock = null;
      this.phase = Math.random() * Math.PI * 2;
      this.axis = randDirM();
      this.escort = this.axis.clone().multiplyScalar(14 + Math.random() * 10);
      this.turrets = this.model.turrets;
      this.drill = this.model.drill;
      this.pos.copy(pos);
      units.push(this);
    }
    die(from) {
      super.die(from);
      deselect(this);
      say('announce_ship_lost', 10);
    }
    hurt(amount, from) {
      super.hurt(amount, from);
      if (!this.dead && from && from.isEnemy) say('announce_under_attack', 30);
      if (!this.dead && from && !from.dead && from.isEnemy && this.type !== 'harvester' && !this.order) this.order = { kind: 'attack', target: from, auto: true };
    }
    update(dt) {
      this.cooldown -= dt;
      if (this.type === 'harvester') this.updateHarvester(dt);
      else this.updateCombat(dt);
      this.drawEngines();
    }
    updateCombat(dt) {
      const o = this.order;
      if (o && o.kind === 'move') {
        if (this.steer(o.point, this.t.speed, dt, 1.5)) this.order = null;
        const e = nearest(enemies.concat(hives), this.pos, this.t.range + 6);
        if (e) this.fireAt(e);
        return;
      }
      let target = o && o.kind === 'attack' && alive(o.target) ? o.target : null;
      if (o && o.kind === 'attack' && !target) this.order = null;
      if (!target) {
        target = nearest(enemies, this.pos, this.t.aggro) || nearest(hives, this.pos, this.t.aggro);
        if (target) this.order = { kind: 'attack', target: target, auto: true };
      }
      if (!target) {
        // idle: stay with the Commander as an escort
        if (d2(this.pos, commander.pos) > 34 * 34) this.steer(commander.pos.clone().add(this.escort), this.t.speed, dt, 3);
        else this.steer(this.pos, 0, dt, 99);
        return;
      }
      // automatic chases give up when they drag the ship far from the Commander
      if (o && o.auto && d2(this.pos, commander.pos) > 90 * 90) { this.order = { kind: 'move', point: commander.pos.clone().add(this.escort) }; return; }
      const dist = Math.sqrt(d2(this.pos, target.pos));
      if (this.type === 'fighter') {
        this.steer(orbitPoint(target.pos, this.axis, target.radius + 7, state.time * 0.9 + this.phase), this.t.speed, dt, 0, true);
      } else if (dist > this.t.range * 0.75 + target.radius) {
        this.steer(target.pos, this.t.speed, dt, this.t.range * 0.75 + target.radius);
      } else { this.steer(this.pos, 0, dt, 99); this.face(target.pos, dt * 0.5); }
      if (dist <= this.t.range + target.radius) this.fireAt(target);
    }
    fireAt(target) {
      for (const t of this.turrets) t.lookAt(target.pos);
      if (this.cooldown > 0) return;
      this.cooldown = this.t.rate * (0.9 + Math.random() * 0.2);
      const from = this.turrets.length ? this.turrets[Math.floor(Math.random() * this.turrets.length)].getWorldPosition(new THREE.Vector3()) : null;
      this.shoot(target, this.t.dmg * dmgMult(), this.type === 'cruiser' ? COL.pink : COL.light, this.t.bolt, this.t.heavy, from);
    }
    updateHarvester(dt) {
      const t = this.t;
      const cap = t.cargo * (1 + 0.25 * state.up.mining);
      const o = this.order;
      if (this.drill) this.drill.rotation.z += dt * (this.hstate === 'mine' ? 14 : 1);
      if (o && o.kind === 'move') { if (this.steer(o.point, t.speed, dt, 1.5)) this.order = null; return; }
      if (o && o.kind === 'harvest') { this.rock = o.rock; this.order = null; this.hstate = this.cargo >= cap ? 'return' : 'seek'; this.manual = true; }
      if (this.hstate === 'seek') {
        // the nearest rock within reach of the Commander (or the one you picked)
        if (!this.rock || this.rock.dead || (!this.manual && d2(this.rock.pos, commander.pos) > 160 * 160)) {
          this.rock = null; this.manual = false;
          let best = Infinity;
          for (const r of rocks) {
            if (r.dead || d2(r.pos, commander.pos) > 140 * 140) continue;
            const d = d2(r.pos, this.pos);
            if (d < best) { best = d; this.rock = r; }
          }
        }
        if (!this.rock) {
          if (this.cargo > 0) this.hstate = 'return';
          else if (d2(this.pos, commander.pos) > 30 * 30) this.steer(commander.pos.clone().add(this.escort), t.speed, dt, 3);
          else this.steer(this.pos, 0, dt, 99);
          return;
        }
        if (this.steer(this.rock.pos, t.speed, dt, this.rock.radius + 2.5)) this.hstate = 'mine';
      } else if (this.hstate === 'mine') {
        if (!this.rock || this.rock.dead) { this.hstate = this.cargo > 0 ? 'return' : 'seek'; return; }
        if (d2(this.pos, this.rock.pos) > Math.pow(this.rock.radius + 5, 2)) { this.hstate = 'seek'; return; }
        this.steer(this.rock.pos, t.speed, dt, this.rock.radius + 2.5);
        this.face(this.rock.pos, dt);
        const take = Math.min(t.mine * (1 + 0.3 * state.up.mining) * dt, cap - this.cargo, this.rock.amount);
        this.cargo += take;
        this.rock.take(take);
        if (Math.random() < dt * 8) { fx.line(this.drill ? this.drill.getWorldPosition(v2) : this.pos, this.rock.pos, COL.pink); sfx.mine(); }
        if (this.cargo >= cap - 0.001) this.hstate = 'return';
      } else if (this.hstate === 'return') {
        if (this.steer(commander.pos, t.speed, dt, commander.radius + 3)) {
          addResources(Math.round(this.cargo));
          this.cargo = 0;
          this.hstate = 'seek';
          sfx.deposit();
        }
      }
    }
  }

  class Enemy extends Entity {
    constructor(kind, pos, hive, opts) {
      opts = opts || {};
      const sector = hive.sector, f = sector.faction, t = ENEMY[kind];
      const model = models.factionShip(f, kind);
      const mult = (1 + 0.15 * sector.level + 0.06 * sector.wave) * (opts.mini ? 0.3 : 1) * (f.behaviour === 'swarm' ? 0.7 : 1);
      super(model, Math.round(t.hp * mult), 'enemy');
      this.faction = f;
      this.colour = f.glow;
      this.barFg.material.color.setHex(f.glow);
      this.kind = kind; this.type = kind; this.t = t; this.name = f.name + (kind === 'heavy' ? ' heavy' : '');
      this.dmg = t.dmg * (1 + 0.08 * sector.level);
      this.behaviour = f.behaviour === 'mixed' ? BEHAVIOURS[Math.floor(Math.random() * BEHAVIOURS.length)] : f.behaviour;
      this.hive = hive; this.guard = !!opts.guard; this.mini = !!opts.mini;
      this.phase = Math.random() * Math.PI * 2;
      this.axis = randDirM();
      this.turrets = model.turrets;
      if (opts.mini) { this.mesh.scale.setScalar(0.6); this.radius *= 0.6; }
      this.pos.copy(pos);
      enemies.push(this);
    }
    die(from) {
      super.die(from);
      deselect(this);
      addResources(this.mini ? 5 : BOUNTY[this.kind]);
      state.kills++;
      if (this.behaviour === 'split' && this.kind === 'light' && !this.mini) {
        for (let i = 0; i < 2; i++) new Enemy('light', this.pos.clone().add(randDirM().multiplyScalar(2)), this.hive, { mini: true });
      }
    }
    pickTarget() {
      if (this.guard && alive(this.hive)) {
        let t = nearest(units, this.hive.pos, 45);
        if (!t && d2(commander.pos, this.hive.pos) < 45 * 45) t = commander;
        return t;
      }
      if (this.behaviour === 'harass') {
        const h = nearest(units.filter((u) => u.type === 'harvester'), this.pos, 160);
        if (h) return h;
      }
      return nearest(units, this.pos, 30) || commander;
    }
    update(dt) {
      this.cooldown -= dt;
      if (this.behaviour === 'regen' && state.time - this.lastHit > 3) this.hp = Math.min(this.maxHp, this.hp + this.maxHp * 0.03 * dt);
      if (this.behaviour === 'heal' && this.kind === 'heavy' && Math.random() < dt * 2) {
        const ally = enemies.find((e) => e !== this && !e.dead && e.hp < e.maxHp && d2(e.pos, this.pos) < 22 * 22);
        if (ally) { ally.hp = Math.min(ally.maxHp, ally.hp + 12); fx.line(this.pos, ally.pos, this.colour); }
      }
      const target = this.pickTarget();
      if (!alive(target)) {
        if (alive(this.hive)) this.steer(orbitPoint(this.hive.pos, this.axis, 16, state.time * 0.4 + this.phase), this.t.speed * 0.6, dt, 0, true);
        else this.steer(this.pos, 0, dt, 99);
        this.drawEngines();
        return;
      }
      const dist = Math.sqrt(d2(this.pos, target.pos));
      const snipe = this.behaviour === 'snipe';
      const range = this.t.range * (snipe ? 1.7 : 1);
      if (this.behaviour === 'ram' && this.kind === 'light') {
        this.steer(target.pos, this.t.speed * 1.3, dt, 0, true);
        if (dist < target.radius + this.radius) {
          fx.explosion(this.pos.clone(), 3, this.colour);
          sfx.explosion(false);
          target.hurt(this.dmg * 5, this);
          this.dead = true; this.remove(); deselect(this); state.kills++;
          return;
        }
        this.drawEngines();
        return;
      }
      if (this.kind === 'light' && !snipe) {
        this.steer(orbitPoint(target.pos, this.axis, target.radius + 6, state.time * 1.1 + this.phase), this.t.speed, dt, 0, true);
      } else {
        const keep = range * (snipe ? 0.9 : 0.75) + target.radius;
        if (dist > keep) this.steer(target.pos, this.t.speed, dt, keep);
        else if (snipe && dist < keep * 0.7) this.steer(this.pos.clone().multiplyScalar(2).sub(target.pos), this.t.speed, dt, 0, true);
        else { this.steer(this.pos, 0, dt, 99); this.face(target.pos, dt * 0.5); }
        for (const t of this.turrets) t.lookAt(target.pos);
      }
      if (dist <= range + target.radius && this.cooldown <= 0) {
        this.cooldown = this.t.rate * (0.9 + Math.random() * 0.25);
        const from = this.turrets.length ? this.turrets[Math.floor(Math.random() * this.turrets.length)].getWorldPosition(new THREE.Vector3()) : null;
        this.shoot(target, this.dmg, this.colour, this.t.bolt, this.kind === 'heavy' || snipe, from);
      }
      this.drawEngines();
    }
  }

  class Hive extends Entity {
    constructor(sector, pos, hp) {
      super(models.hive(sector.faction), 1800 + 350 * sector.level, 'enemy');
      this.sector = sector;
      this.colour = sector.faction.glow;
      this.barFg.material.color.setHex(this.colour);
      this.type = 'hive'; this.name = sector.faction.name + ' hive';
      this.t = { speed: 0, accel: 0, turn: 0 };
      if (hp !== undefined) this.hp = hp;
      this.pos.copy(pos);
      this.guardTimer = 3 + Math.random() * 5;
      hives.push(this);
      sector.hives.push(this);
    }
    die(from) {
      super.die(from);
      fx.explosion(this.pos.clone(), 10, this.colour);
      deselect(this);
      addResources(BOUNTY.hive);
      const left = this.sector.hives.filter(alive).length;
      if (left) { say('announce_hive_destroyed', 0, true); flash('Hive destroyed! ' + left + ' left in this sector'); }
    }
    update(dt) {
      this.mesh.rotation.y += dt * 0.15;
      this.mesh.rotation.x += dt * 0.05;
      this.model.core.material.opacity = 0.45 + Math.sin(state.time * 3) * 0.15;
      if (d2(this.pos, commander.pos) > ACTIVE * ACTIVE) return;     // asleep
      this.cooldown -= dt;
      const target = nearest(units, this.pos, 32) || (d2(commander.pos, this.pos) < 34 * 34 ? commander : null);
      if (target && this.cooldown <= 0) {
        this.cooldown = 0.9;
        this.shoot(target, 14 + this.sector.level * 2, this.colour, 50, true);
      }
      this.guardTimer -= dt;
      if (this.guardTimer <= 0) {
        this.guardTimer = 45;
        const guards = enemies.filter((e) => e.hive === this && e.guard).length;
        if (guards < 1 + Math.floor(this.sector.level / 3)) new Enemy('light', this.pos.clone().add(randDirM().multiplyScalar(10)), this, { guard: true });
      }
    }
  }

  class Rock {
    constructor(kind, centre, pos, amount) {
      this.kind = kind;
      this.model = kind === 'comet' ? models.comet() : models.asteroid();
      this.mesh = this.model.group;
      this.mesh.userData.entity = this;
      this.radius = this.model.size;
      this.max = kind === 'comet' ? Math.round(rand(900, 1300)) : Math.round(rand(350, 500));
      this.amount = amount === undefined ? this.max : amount;
      this.spin = randDir().multiplyScalar(rand(0.1, 0.4));
      this.centre = centre.clone();
      if (kind === 'comet') {
        this.orbit = pos;                         // a number: orbit radius round the sector centre
        this.angle = rand(0, Math.PI * 2);
        this.speed = rand(0.01, 0.02) * (rng() < 0.5 ? -1 : 1);
        const n = randDir();
        this.u = new THREE.Vector3(1, 0, 0).cross(n).normalize();
        this.w = new THREE.Vector3().crossVectors(n, this.u);
        this.place();
      } else this.mesh.position.copy(pos);
      this.ring = models.ringSprite(COL.white, this.radius * 2.8); this.ring.visible = false;
      scene.add(this.mesh); scene.add(this.ring);
      rocks.push(this);                           // depleted rocks stay listed (dead) so saves line up
      if (this.amount <= 0) this.deplete(true); else this.take(0);
    }
    get pos() { return this.mesh.position; }
    place() {
      this.mesh.position.copy(this.centre).addScaledVector(this.u, Math.cos(this.angle) * this.orbit).addScaledVector(this.w, Math.sin(this.angle) * this.orbit);
      this.mesh.lookAt(this.centre);              // the tail points away from the sector centre
    }
    take(n) {
      this.amount -= n;
      const s = 0.4 + 0.6 * Math.max(0, this.amount / this.max);
      this.model.rock.scale.set(s, s, s);
      if (this.amount <= 0 && !this.dead) this.deplete(false);
    }
    deplete(quiet) {
      this.amount = 0;
      this.dead = true;
      deselect(this);
      scene.remove(this.mesh); scene.remove(this.ring);
      if (quiet) return;
      fx.explosion(this.pos.clone(), 1.5, COL.light);
      say('announce_mined_out', 20);
    }
    update(dt) {
      if (this.kind === 'comet') { this.angle += this.speed * dt; this.place(); }
      this.model.rock.rotation.x += this.spin.x * dt;
      this.model.rock.rotation.y += this.spin.y * dt;
    }
  }

  // A rogue comet that streaks in from any direction. It warns first (blinking path, alarm, voice),
  // then hits whatever is in its way: most of a ship's hull, a fifth of the Commander's.
  class Strike {
    constructor() {
      const targets = [commander].concat(units.filter((u) => alive(u) && d2(u.pos, commander.pos) < R * R));
      const aim = targets[Math.floor(Math.random() * targets.length)].pos.clone().add(randDirM().multiplyScalar(Math.random() * 4));
      this.dir = randDirM();
      this.start = aim.clone().addScaledVector(this.dir, -STRIKE.speed * STRIKE.warn);
      this.end = aim.clone().addScaledVector(this.dir, R * 1.6);
      this.hit = new Set();
      this.dead = false;
      this.age = 0;
      this.radius = STRIKE.radius;
      this.model = models.comet();
      this.mesh = this.model.group;
      this.mesh.scale.setScalar(1.6);
      this.mesh.position.copy(this.start);
      this.mesh.lookAt(this.start.clone().add(this.dir));
      this.mesh.add(models.glowSprite(COL.white, 16, 0.9));
      scene.add(this.mesh);
      this.beacons = new THREE.Group();
      this.beaconMat = models.glowSprite(COL.pink, 1).material;
      const len = this.start.distanceTo(this.end);
      for (let d = 0; d < len; d += 5) {
        const b = new THREE.Sprite(this.beaconMat);
        b.position.copy(this.start).addScaledVector(this.dir, d);
        b.scale.set(3, 3, 1);
        this.beacons.add(b);
      }
      scene.add(this.beacons);
      this.marker = models.ringSprite(COL.pink, 10); this.marker.position.copy(aim); scene.add(this.marker);
      sfx.warning();
      say('announce_comet', 0, true);
      flash('Comet incoming! Move your ships off the blinking line.');
      strikes.push(this);
    }
    update(dt) {
      this.age += dt;
      const warn = this.age < STRIKE.warn, blink = Math.sin(this.age * 12) > 0;
      this.beaconMat.opacity = warn ? (blink ? 0.9 : 0.25) : Math.max(0, 0.25 - (this.age - STRIKE.warn));
      this.marker.material.opacity = warn ? (blink ? 1 : 0.3) : 0;
      if (this.age > STRIKE.warn - 1.2 && !this.whooshed) { this.whooshed = true; sfx.whoosh(); }
      this.mesh.position.addScaledVector(this.dir, STRIKE.speed * dt);
      this.model.rock.rotation.x += dt * 3;
      for (let i = 0; i < 3; i++) fx.trail(this.mesh.position.clone().addScaledVector(this.dir, -i * 1.2 - Math.random() * 2).add(randDirM().multiplyScalar(Math.random() * 1.5)), i % 2 ? COL.light : COL.white);
      const p = this.mesh.position;
      for (const e of units.concat(enemies, hives, [commander])) {
        if (!alive(e) || this.hit.has(e)) continue;
        const reach = this.radius + e.radius * 0.8;
        if (d2(p, e.pos) > reach * reach) continue;
        this.hit.add(e);
        const big = e === commander || e instanceof Hive;
        fx.explosion(p.clone(), big ? 7 : 3.5, COL.light);
        sfx.explosion(true);
        e.hurt(e.maxHp * (big ? STRIKE.bigDamage : STRIKE.shipDamage), null);
        if (big) { this.finish(true); return; }
      }
      if (d2(p, this.start) > d2(this.end, this.start)) this.finish(false);
    }
    finish(impact) {
      if (this.dead) return;
      this.dead = true;
      if (impact) fx.explosion(this.mesh.position.clone(), 8, COL.white);
      scene.remove(this.mesh); scene.remove(this.beacons); scene.remove(this.marker);
    }
  }

  function nearest(list, p, maxDist) {
    let best = null, bd = maxDist * maxDist;
    for (const e of list) {
      if (e.dead) continue;
      const d = d2(e.pos, p) - (e.radius || 0) * (e.radius || 0);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  function dmgMult() { return 1 + 0.2 * state.up.weapons; }
  function hullMult() { return 1 + 0.2 * (state ? state.up.hulls : 0); }
  function unitCost(type) { return Math.round(UNIT[type].cost * (1 - 0.12 * state.up.logistics)); }
  function buildTime(t) { return t * (1 - 0.15 * state.up.logistics); }

  // ---------- Sectors ----------
  function sectorAt(p) {
    let best = sectors[0], bd = Infinity;
    for (const s of sectors) { const d = d2(s.centre, p); if (d < bd) { bd = d; best = s; } }
    return best;
  }
  function conqueredCount() { return sectors.filter((s) => s.conquered).length; }

  function checkSectors() {
    const here = sectorAt(commander.pos);
    if (here !== state.current) {
      state.current = here;
      if (!here.visited) { here.visited = true; here.nextWave = here.level === 0 ? 120 : 80; }
      if (!here.conquered) {
        if (state.time > 1) say('announce_enter', 0, true);
        flash('Sector ' + (here.level + 1) + ': ' + here.faction.name + '. ' + here.faction.about);
      } else flash('Sector ' + (here.level + 1) + ' (conquered)');
      drawMap();
    }
    for (const s of sectors) {
      if (!s.conquered && s.hives.length && s.hives.every((h) => h.dead)) {
        s.conquered = true;
        const bonus = 400 + 100 * s.level;
        addResources(bonus);
        say('announce_sector', 0, true);
        flash('Sector ' + (s.level + 1) + ' conquered! +' + bonus + ' ore. ' + (SECTORS - conqueredCount()) + ' to go: open Sectors (N) and pick the next one.');
        drawMap();
        saveGame(true);
      }
    }
    if (conqueredCount() === SECTORS) endGame(true);
  }

  // ---------- Economy, production, upgrades ----------
  function addResources(n) { state.resources += n; state.mined += Math.max(0, n); }

  function queueUnit(type) {
    if (!state || !state.running) return;
    const cost = unitCost(type);
    if (commander.queue.length >= 8) { flash('The build queue is full'); sfx.denied(); return; }
    if (state.resources < cost) { flash('Not enough ore for a ' + UNIT[type].name + ' (' + cost + ')'); sfx.denied(); say('announce_no_resources', 4); return; }
    state.resources -= cost;
    commander.queue.push({ kind: 'unit', type: type, time: buildTime(UNIT[type].build), name: UNIT[type].name });
    sfx.queue();
  }

  function queueUpgrade(kind) {
    if (!state || !state.running) return;
    const u = UPGRADES[kind];
    const level = state.up[kind] + commander.queue.filter((q) => q.type === kind).length;
    if (level >= 3) { flash(u.name + ' is fully upgraded'); sfx.denied(); return; }
    const cost = u.costs[level];
    if (state.resources < cost) { flash('Not enough ore for ' + u.name + ' ' + (level + 1) + ' (' + cost + ')'); sfx.denied(); say('announce_no_resources', 4); return; }
    if (commander.queue.length >= 8) { flash('The build queue is full'); sfx.denied(); return; }
    state.resources -= cost;
    commander.queue.push({ kind: 'upgrade', type: kind, time: u.build, name: u.name + ' ' + (level + 1) });
    sfx.queue();
  }

  function finishItem(item) {
    if (item.kind === 'upgrade') {
      state.up[item.type]++;
      if (item.type === 'hulls') for (const u of units) { const add = u.t.hp * 0.2; u.maxHp += add; u.hp += add; }
      sfx.upgrade();
      say('announce_upgrade', 0, true);
      flash(item.name + ' complete');
      return;
    }
    const start = new THREE.Vector3(Math.random() * 4 - 2, 2.5, Math.random() * 12 - 6).applyQuaternion(commander.mesh.quaternion).add(commander.pos);
    const u = new Unit(item.type, start);
    u.mesh.quaternion.copy(commander.mesh.quaternion);
    if (item.type !== 'harvester') u.order = { kind: 'move', point: commander.pos.clone().add(u.escort) };
    sfx.build();
    say(item.type + '_built', 0);
  }

  // ---------- Waves (only in the sector you are in) ----------
  function updateWaves(dt) {
    const s = state.current;
    if (!s || s.conquered || !s.hives.some(alive)) return;
    s.nextWave -= dt;
    if (s.nextWave > 0) return;
    s.nextWave = 65;
    let n = 0, big = 0;
    for (const h of s.hives) {
      if (h.dead || d2(h.pos, commander.pos) > (ACTIVE + 60) * (ACTIVE + 60)) continue;
      const lights = Math.round((1 + Math.floor(s.level / 2) + s.wave) * (s.faction.behaviour === 'swarm' ? 1.5 : 1));
      const heavies = Math.floor((s.wave + s.level) / 3);
      for (let i = 0; i < lights; i++) new Enemy('light', h.pos.clone().add(randDirM().multiplyScalar(9)), h);
      for (let i = 0; i < heavies; i++) new Enemy('heavy', h.pos.clone().add(randDirM().multiplyScalar(11)), h);
      n += lights; big += heavies;
    }
    s.wave++;
    if (!n && !big) return;
    say('announce_wave', 0, true);
    flash(s.faction.name + ' wave ' + s.wave + ': ' + n + ' light ship' + (n === 1 ? '' : 's') + (big ? ' and ' + big + ' heavy' : '') + ' incoming');
  }

  // ---------- Voice ----------
  function say(key, gap, important) { audio.say(key, gap, important); }

  // ---------- Selection & orders ----------
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  function setRay(x, y) {
    ndc.x = (x / window.innerWidth) * 2 - 1;
    ndc.y = -(y / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(ndc, camera);
  }
  function toScreen(p) {
    const v = p.clone().project(camera);
    return { x: (v.x + 1) / 2 * window.innerWidth, y: (1 - v.y) / 2 * window.innerHeight, behind: v.z > 1 || v.z < -1 };
  }
  function pickables() {
    const list = units.concat(enemies, hives, rocks.filter((r) => !r.dead && d2(r.pos, camera.position) < 400 * 400));
    if (alive(commander)) list.push(commander);
    return list.filter((e) => !e.dead);
  }
  function entityAt(x, y) {
    setRay(x, y);
    const list = pickables();
    const hits = raycaster.intersectObjects(list.map((e) => e.mesh), true);
    for (const h of hits) {
      if (h.object.type === 'Sprite' || h.object.type === 'Points') continue;
      let o = h.object;
      while (o && !o.userData.entity) o = o.parent;
      if (o) return o.userData.entity;
    }
    let best = null, bd = 30 * 30;
    for (const e of list) {
      const s = toScreen(e.pos);
      if (s.behind) continue;
      const d = (s.x - x) * (s.x - x) + (s.y - y) * (s.y - y);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }
  function setSelected(e, on) { e.ring.visible = on; e.selected = on; }
  function deselect(e) {
    const i = selection.indexOf(e);
    if (i >= 0) { selection.splice(i, 1); setSelected(e, false); }
  }
  function select(list, add, quiet) {
    if (!add) { for (const e of selection) setSelected(e, false); selection = []; }
    for (const e of list) if (alive(e) && selection.indexOf(e) < 0) { selection.push(e); setSelected(e, true); }
    if (!list.length || quiet) return;
    sfx.select();
    const first = list.find((e) => e.team === 'player');
    if (first) say(first === commander ? 'commander_select' : first.type + '_select', 0);
  }
  function myShips() { return selection.filter((e) => e.team === 'player' && e !== commander); }

  function spacePoint(x, y, through) {
    setRay(x, y);
    const n = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(n, through);
    const p = new THREE.Vector3();
    if (!raycaster.ray.intersectPlane(plane, p)) return null;
    if (p.distanceTo(through) > R * 1.5) p.sub(through).setLength(R * 1.5).add(through);
    if (p.length() > WORLD_R) p.setLength(WORLD_R);
    return p;
  }

  function moveCommander(p, quiet) {
    commander.order = { kind: 'move', point: p.clone() };
    if (!quiet) { sfx.order(); say('commander_move', 0); marker(p, COL.pink); }
  }

  function command(x, y) {
    if (!state.running) return false;
    const ships = myShips();
    const withCommander = selection.indexOf(commander) >= 0;
    if (!ships.length && !withCommander) return false;
    const e = entityAt(x, y);
    if (e && e.isEnemy && ships.some((u) => u.type !== 'harvester')) {
      for (const u of ships) if (u.type !== 'harvester') u.order = { kind: 'attack', target: e };
      sfx.order(); say(ships.find((u) => u.type !== 'harvester').type + '_attack', 0); marker(e.pos, COL.white);
      return true;
    }
    if (e instanceof Rock && ships.some((u) => u.type === 'harvester')) {
      for (const u of ships) if (u.type === 'harvester') u.order = { kind: 'harvest', rock: e };
      sfx.order(); say('harvester_harvest', 0); marker(e.pos, COL.white);
      return true;
    }
    const movers = withCommander ? ships.concat([commander]) : ships;
    const centre = new THREE.Vector3();
    for (const u of movers) centre.add(u.pos);
    centre.divideScalar(movers.length);
    const p = e && e.team === 'player' && e !== commander ? e.pos.clone().add(randDirM().multiplyScalar(e.radius + 4)) : spacePoint(x, y, centre);
    if (!p) return false;
    if (withCommander) moveCommander(p, ships.length > 0);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
    const cols = Math.ceil(Math.sqrt(ships.length));
    ships.forEach((u, i) => {
      const ox = (i % cols - (cols - 1) / 2) * 4.5, oy = (Math.floor(i / cols) - (cols - 1) / 2) * 4.5;
      const pt = p.clone().addScaledVector(right, ox).addScaledVector(up, oy);
      if (withCommander) pt.add(u.escort.clone().multiplyScalar(0.8));
      u.order = { kind: 'move', point: pt };
      if (u.type === 'harvester') u.hstate = 'seek';
    });
    if (ships.length) { sfx.order(); say(ships[0].type + '_move', 0); marker(p, COL.pink); }
    return true;
  }

  const markerSprite = models.ringSprite(COL.pink, 3); markerSprite.visible = false; scene.add(markerSprite);
  let markerLife = 0;
  function marker(p, colour) {
    markerSprite.position.copy(p);
    markerSprite.material.color.setHex(colour);
    markerSprite.visible = true;
    markerLife = 0.7;
  }

  // ---------- Input ----------
  const canvas = renderer.domElement;
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  const pointers = new Map();
  let drag = null, pinch = null;
  let lastTap = { time: 0, type: null };

  canvas.addEventListener('pointerdown', (e) => {
    audio.init();
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* synthetic events */ }
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) {
      const [a, b] = Array.from(pointers.values());
      pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), dist: cam.dist };
      drag = null; ui.box.style.display = 'none';
      return;
    }
    const boxMode = e.pointerType === 'mouse' && e.button === 0;
    drag = { x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, button: e.button, type: e.pointerType, moved: false, mode: boxMode ? 'box' : 'rotate', shift: e.shiftKey };
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!pointers.has(e.pointerId)) return;
    const prev = pointers.get(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && pointers.size === 2) {
      const [a, b] = Array.from(pointers.values());
      cam.dist = pinch.dist * pinch.d / Math.max(10, Math.hypot(a.x - b.x, a.y - b.y));
      return;
    }
    if (!drag) return;
    drag.x = e.clientX; drag.y = e.clientY;
    if (!drag.moved && Math.hypot(drag.x - drag.x0, drag.y - drag.y0) > 8) drag.moved = true;
    if (!drag.moved) return;
    if (drag.mode === 'box') {
      const x = Math.min(drag.x0, drag.x), y = Math.min(drag.y0, drag.y);
      Object.assign(ui.box.style, { display: 'block', left: x + 'px', top: y + 'px', width: Math.abs(drag.x - drag.x0) + 'px', height: Math.abs(drag.y - drag.y0) + 'px' });
    } else {
      camTween = null;
      rotateCamera((e.clientX - prev.x) * 0.006, (e.clientY - prev.y) * 0.006);
    }
  });
  function pointerEnd(e) {
    if (!pointers.has(e.pointerId)) return;
    pointers.delete(e.pointerId);
    if (pinch) { if (pointers.size < 2) pinch = null; drag = null; return; }
    if (!drag) return;
    const d = drag; drag = null;
    ui.box.style.display = 'none';
    if (!state || !state.running) return;
    if (d.moved && d.mode === 'box') {
      const x1 = Math.min(d.x0, d.x), x2 = Math.max(d.x0, d.x), y1 = Math.min(d.y0, d.y), y2 = Math.max(d.y0, d.y);
      const inBox = units.filter((u) => { const s = toScreen(u.pos); return !u.dead && !s.behind && s.x >= x1 && s.x <= x2 && s.y >= y1 && s.y <= y2; });
      if (inBox.length) select(inBox, d.shift); else if (!d.shift) select([], false);
      return;
    }
    if (d.moved) return;
    tap(d.x0, d.y0, d.button, d.type, d.shift);
  }
  canvas.addEventListener('pointerup', pointerEnd);
  canvas.addEventListener('pointercancel', pointerEnd);

  function tap(x, y, button, type, shift) {
    if (button === 2) { command(x, y); return; }
    if (button !== 0) return;
    const e = entityAt(x, y);
    const now = performance.now();
    if (e && (units.indexOf(e) >= 0 || e === commander)) {
      if (e !== commander && lastTap.type === e.type && now - lastTap.time < 350) select(units.filter((u) => u.type === e.type && !toScreen(u.pos).behind), shift);
      else select([e], shift);
      lastTap = { time: now, type: e.type };
      return;
    }
    if (type !== 'mouse' && selection.some((s) => s.team === 'player')) { if (command(x, y)) return; }
    if (e && (e.isEnemy || e instanceof Rock)) { select([e], false, true); sfx.select(); return; }
    if (!shift) select([], false);
  }

  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    cam.dist *= e.deltaY > 0 ? 1.1 : 0.9;
  }, { passive: false });

  const keys = {};
  window.addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    keys[k] = true;
    if (!state || !state.started || state.over) return;
    if (k === 'escape') { if (menuOpen()) closeMenu(); else if (!ui.map.hidden) toggleMap(false); else openMenu(); return; }
    if (menuOpen()) return;
    if (/^[1-9]$/.test(k)) {
      if (e.ctrlKey || e.metaKey) { e.preventDefault(); groups[k] = myShips().slice(); flash('Group ' + k + ' set'); }
      else if (groups[k]) select(groups[k].filter(alive), e.shiftKey);
      return;
    }
    if (k === 'f') queueUnit('fighter');
    else if (k === 'c') queueUnit('cruiser');
    else if (k === 'h') queueUnit('harvester');
    else if (k === 'x') selectArmy();
    else if (k === 'z') selectHarvesters();
    else if (k === 'b') selectBase();
    else if (k === 'n') toggleMap();
    else if (k === 'p' || k === ' ') { e.preventDefault(); togglePause(); }
    else if (k === 'm') toggleSound();
    else if (k === 'home') resetCamera();
  });
  window.addEventListener('keyup', (e) => { keys[e.key.toLowerCase()] = false; });
  window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; });
  function keyCamera(dt) {
    let dx = 0, dy = 0;
    if (keys.a || keys.arrowleft) dx -= 1;
    if (keys.d || keys.arrowright) dx += 1;
    if (keys.w || keys.arrowup) dy -= 1;
    if (keys.s || keys.arrowdown) dy += 1;
    if (keys.q) cam.dist *= 1 + dt;
    if (keys.e) cam.dist *= 1 - dt;
    if (dx || dy) rotateCamera(dx * dt * 1.6, dy * dt * 1.6);
  }
  function selectArmy() { select(units.filter((u) => u.type !== 'harvester'), false); }
  function selectHarvesters() { select(units.filter((u) => u.type === 'harvester'), false); }
  function selectBase() { if (alive(commander)) select([commander], false); }

  // Buttons
  $('build-fighter').addEventListener('click', () => queueUnit('fighter'));
  $('build-cruiser').addEventListener('click', () => queueUnit('cruiser'));
  $('build-harvester').addEventListener('click', () => queueUnit('harvester'));
  for (const k of Object.keys(UPGRADES)) $('up-' + k).addEventListener('click', () => queueUpgrade(k));
  $('select-army').addEventListener('click', selectArmy);
  $('select-harvesters').addEventListener('click', selectHarvesters);
  $('select-base').addEventListener('click', selectBase);
  $('select-none').addEventListener('click', () => select([], false));
  $('home').addEventListener('click', resetCamera);
  $('open-map').addEventListener('click', () => toggleMap());
  $('close-map').addEventListener('click', () => toggleMap(false));
  $('pause').addEventListener('click', () => openMenu());
  $('sound').addEventListener('click', toggleSound);
  $('menu-new').addEventListener('click', () => { closeMenu(); newGame(); });
  $('menu-continue').addEventListener('click', () => { closeMenu(); continueGame(); });
  $('menu-resume').addEventListener('click', closeMenu);
  $('menu-controls').addEventListener('click', () => { const h = $('help'); h.hidden = !h.hidden; });
  $('menu-sound').addEventListener('click', toggleSound);

  function togglePause() {
    if (!state || state.over || !state.started) return;
    state.running = !state.running;
    flash(state.running ? 'Resumed' : 'Paused (P to resume)');
  }
  function toggleSound() {
    audio.setMuted(!audio.muted);
    soundLabels();
  }
  function soundLabels() {
    $('sound').textContent = audio.muted ? 'Sound off' : 'Sound on';
    $('menu-sound').textContent = audio.muted ? 'Sound: off' : 'Sound: on';
  }

  // ---------- Menu ----------
  function menuOpen() { return ui.menu.style.display !== 'none'; }
  function openMenu(title, text) {
    const inGame = state && state.started && !state.over;
    if (inGame) { state.running = false; saveGame(); }
    ui.menuTitle.textContent = title || 'Comet & Commander';
    ui.menuText.textContent = text || 'Fly your Commander carrier through ten sectors of space. Mine comets, build a fleet, research upgrades and conquer every sector.';
    $('menu-resume').hidden = !inGame;
    $('menu-continue').hidden = inGame || !hasSave();
    $('menu-new').textContent = state && state.over ? 'Play again' : 'New game';
    ui.menu.style.display = 'flex';
    document.body.classList.remove('playing');
    audio.music('theme');
  }
  function closeMenu() {
    ui.menu.style.display = 'none';
    $('help').hidden = true;
    if (state && state.started && !state.over) { state.running = true; document.body.classList.add('playing'); }
  }

  // ---------- Sector map ----------
  const mctx = ui.mapCanvas.getContext('2d');
  let mapNodes = [];
  function toggleMap(show) {
    const open = show === undefined ? ui.map.hidden : show;
    ui.map.hidden = !open;
    if (open) drawMap();
  }
  function drawMap() {
    if (ui.map.hidden || !sectors.length) return;
    const c = ui.mapCanvas, s = c.width, h = s / 2;
    mctx.fillStyle = '#001725'; mctx.fillRect(0, 0, s, s);
    const qi = camera.quaternion.clone().invert();
    const scale = (h - 30) / (SECTOR_RING + 60);
    mctx.strokeStyle = '#005184'; mctx.lineWidth = 2;
    mctx.beginPath(); mctx.arc(h, h, (SECTOR_RING + 50) * scale, 0, Math.PI * 2); mctx.stroke();
    mapNodes = sectors.map((sec) => {
      const v = sec.centre.clone().applyQuaternion(qi);
      return { sec: sec, x: h + v.x * scale, y: h - v.y * scale, z: v.z };
    });
    mctx.strokeStyle = '#00304f'; mctx.lineWidth = 1;
    for (const a of mapNodes) {
      const near = mapNodes.filter((b) => b !== a).sort((p, q) => d2(p.sec.centre, a.sec.centre) - d2(q.sec.centre, a.sec.centre)).slice(0, 3);
      for (const b of near) { mctx.beginPath(); mctx.moveTo(a.x, a.y); mctx.lineTo(b.x, b.y); mctx.stroke(); }
    }
    mapNodes.slice().sort((a, b) => a.z - b.z).forEach((n) => {
      const sec = n.sec;
      mctx.beginPath(); mctx.arc(n.x, n.y, 15, 0, Math.PI * 2);
      mctx.fillStyle = sec.conquered ? '#f088e9' : (sec === state.current ? '#007ab7' : '#001725');
      mctx.fill();
      mctx.lineWidth = sec === state.current ? 4 : 2;
      mctx.strokeStyle = sec === state.current ? '#ffffff' : (sec.visited ? hex(sec.faction.glow) : '#34A9E3');
      mctx.stroke();
      mctx.fillStyle = sec.conquered ? '#001725' : '#ffffff';
      mctx.font = 'bold 13px Arial'; mctx.textAlign = 'center'; mctx.textBaseline = 'middle';
      mctx.fillText(sec.visited || sec.conquered ? String(sec.level + 1) : '?', n.x, n.y);
    });
    const cv = commander.pos.clone().applyQuaternion(qi);
    mctx.fillStyle = '#ffffff';
    mctx.beginPath(); mctx.arc(h + cv.x * scale, h - cv.y * scale, 5, 0, Math.PI * 2); mctx.fill();
    ui.mapList.innerHTML = '';
    sectors.slice().sort((a, b) => a.level - b.level).forEach((sec) => {
      const li = document.createElement('li');
      const status = sec.conquered ? 'conquered' : (sec === state.current ? 'you are here' : (sec.visited ? plural(sec.hives.filter(alive).length, 'hive') + ' left' : 'unknown'));
      li.className = sec.conquered ? 'done' : (sec === state.current ? 'here' : (sec.visited ? 'known' : 'unknown'));
      li.textContent = (sec.level + 1) + '. ' + (sec.visited || sec.conquered ? sec.faction.name : 'Unknown sector') + ': ' + status;
      li.addEventListener('click', () => travelTo(sec));
      ui.mapList.appendChild(li);
    });
  }
  function travelTo(sec) {
    if (!state.started || state.over) return;
    if (sec === state.current) { flash('You are in this sector'); return; }
    moveCommander(sec.centre.clone().addScaledVector(sec.centre.clone().normalize(), -20));
    for (const u of units) if (u.type !== 'harvester' && (!u.order || u.order.auto)) u.order = null;   // escorts follow
    flash('Course set for sector ' + (sec.level + 1) + '. Idle ships follow the Commander.');
    toggleMap(false);
  }
  ui.mapCanvas.addEventListener('click', (e) => {
    const r = ui.mapCanvas.getBoundingClientRect();
    const x = (e.clientX - r.left) * ui.mapCanvas.width / r.width, y = (e.clientY - r.top) * ui.mapCanvas.height / r.height;
    const hit = mapNodes.find((n) => Math.hypot(n.x - x, n.y - y) < 18);
    if (hit) travelTo(hit.sec);
  });

  // ---------- Messages ----------
  let msgTimer = 0;
  function flash(text) {
    ui.message.textContent = text;
    ui.message.style.display = 'block';
    msgTimer = 5;
  }

  // ---------- HUD ----------
  function updateHUD() {
    ui.resources.textContent = 'Ore: ' + Math.floor(state.resources);
    const s = state.current;
    if (s) {
      ui.sector.textContent = 'Sector ' + (s.level + 1) + '/' + SECTORS + ': ' + s.faction.name + (s.conquered ? ' (conquered)' : ', ' + plural(s.hives.filter(alive).length, 'hive'));
      ui.sector.style.color = hex(s.faction.glow);
      ui.wave.textContent = s.conquered ? 'Conquered ' + conqueredCount() + '/' + SECTORS + '. Open Sectors (N) to move on.' : 'Next wave in ' + Math.max(0, Math.ceil(s.nextWave)) + 's. Conquered ' + conqueredCount() + '/' + SECTORS;
    }
    ui.base.textContent = 'Commander hull: ' + Math.max(0, Math.ceil(commander.hp)) + '/' + commander.maxHp;
    const army = units.filter((u) => u.type !== 'harvester').length;
    ui.units.textContent = 'Fleet: ' + army + ' warships, ' + (units.length - army) + ' harvesters. Kills: ' + state.kills;
    if (selection.length === 1) {
      const u = selection[0];
      let txt = u.name + ': hull ' + Math.max(0, Math.ceil(u.hp || 0)) + '/' + Math.round(u.maxHp || 0);
      if (u instanceof Rock) txt = (u.kind === 'comet' ? 'Comet' : 'Asteroid') + ': ' + Math.floor(u.amount) + ' ore left';
      if (u.type === 'harvester') txt += ', cargo ' + Math.floor(u.cargo) + ' (' + ({ seek: 'heading out', mine: 'mining', return: 'returning' })[u.hstate] + ')';
      if (u === commander) txt += '. Right-click to move the carrier.';
      ui.selected.textContent = txt;
    } else if (selection.length > 1) ui.selected.textContent = selection.length + ' ships selected';
    else ui.selected.textContent = 'Nothing selected';
    for (const type of Object.keys(UNIT)) {
      const b = $('build-' + type), cost = unitCost(type);
      b.querySelector('.cost').textContent = cost;
      b.disabled = !state.running || state.resources < cost;
    }
    for (const kind of Object.keys(UPGRADES)) {
      const lvl = state.up[kind] + commander.queue.filter((q) => q.type === kind).length;
      const b = $('up-' + kind);
      b.querySelector('.cost').textContent = lvl >= 3 ? 'max' : UPGRADES[kind].costs[lvl];
      b.querySelector('.lvl').textContent = state.up[kind];
      b.disabled = !state.running || lvl >= 3 || state.resources < UPGRADES[kind].costs[lvl];
    }
    if (commander.queue.length) {
      const item = commander.queue[0];
      ui.queue.textContent = 'Building ' + item.name + (commander.queue.length > 1 ? ' (+' + (commander.queue.length - 1) + ' queued)' : '');
      ui.queueBar.style.width = Math.min(100, commander.progress / item.time * 100) + '%';
      ui.queueBar.parentNode.style.display = 'block';
    } else { ui.queue.textContent = ''; ui.queueBar.parentNode.style.display = 'none'; }
  }

  const camUp = new THREE.Vector3(), camRight = new THREE.Vector3();
  function updateBars() {
    camUp.set(0, 1, 0).applyQuaternion(camera.quaternion);
    camRight.set(1, 0, 0).applyQuaternion(camera.quaternion);
    const list = units.concat(enemies, hives);
    if (alive(commander)) list.push(commander);
    for (const e of list) {
      if (e.dead) continue;
      const show = e.selected || e.hp < e.maxHp - 0.5;
      e.barBg.visible = e.barFg.visible = show;
      e.ring.position.copy(e.pos);
      if (e.shield && e.shieldGlow !== undefined) e.shield.material.opacity = Math.max(0, e.shieldGlow);
      if (!show) continue;
      const dist = camera.position.distanceTo(e.pos);
      const w = Math.max(e.radius * 1.6, dist * 0.05) * (e.radius > 6 ? 1.6 : 1);
      const h = Math.max(0.25, dist * 0.007);
      const f = Math.max(0, e.hp / e.maxHp);
      e.barBg.position.copy(e.pos).addScaledVector(camUp, e.radius + h * 3);
      e.barBg.scale.set(w, h, 1);
      e.barFg.scale.set(Math.max(0.001, w * f), h * 0.7, 1);
      e.barFg.position.copy(e.barBg.position).addScaledVector(camRight, -(w - w * f) / 2);
      e.barFg.material.color.setHex(f < 0.35 ? COL.white : e.colour);
    }
    for (const r of rocks) if (!r.dead && r.ring.visible) r.ring.position.copy(r.pos);
  }

  // ---------- Radar (centred on the Commander) ----------
  const rctx = ui.radar.getContext('2d');
  const qInv = new THREE.Quaternion();
  function drawRadar() {
    const c = ui.radar, s = c.width, h = s / 2;
    rctx.fillStyle = '#001725'; rctx.fillRect(0, 0, s, s);
    rctx.strokeStyle = '#005184'; rctx.lineWidth = 1;
    for (const r of [0.33, 0.66, 0.98]) { rctx.beginPath(); rctx.arc(h, h, h * r, 0, Math.PI * 2); rctx.stroke(); }
    rctx.beginPath(); rctx.moveTo(h, 2); rctx.lineTo(h, s - 2); rctx.moveTo(2, h); rctx.lineTo(s - 2, h); rctx.stroke();
    qInv.copy(camera.quaternion).invert();
    const scale = (h - 4) / (R + 10);
    const centre = commander.pos;
    const dot = (p, colour, size, clampEdge) => {
      v1.copy(p).sub(centre).applyQuaternion(qInv);
      let x = v1.x * scale, y = v1.z * scale;
      const sy = -v1.y * scale * 0.5;
      const len = Math.hypot(x, y + sy);
      rctx.fillStyle = colour;
      if (len > h - 6) {
        if (!clampEdge) return;
        const k = (h - 6) / len;
        rctx.fillRect(h + x * k - size / 2, h + (y + sy) * k - size / 2, size, size);
        return;
      }
      x += h; y += h;
      rctx.strokeStyle = colour; rctx.globalAlpha = 0.45;
      rctx.beginPath(); rctx.moveTo(x, y); rctx.lineTo(x, y + sy); rctx.stroke();
      rctx.globalAlpha = 1;
      rctx.fillRect(x - size / 2, y + sy - size / 2, size, size);
    };
    for (const r of rocks) if (!r.dead && d2(r.pos, centre) < 140 * 140) dot(r.pos, '#7f99aa', 3);
    for (const hv of hives) if (!hv.dead) dot(hv.pos, hex(hv.colour), 7, d2(hv.pos, centre) < ACTIVE * ACTIVE);
    for (const e of enemies) if (!e.dead) dot(e.pos, hex(e.colour), e.kind === 'heavy' ? 4 : 3);
    for (const u of units) if (!u.dead) dot(u.pos, u.selected ? '#f088e9' : (u.type === 'harvester' ? '#ffffff' : '#34A9E3'), 3);
    for (const st of strikes) if (!st.dead) dot(st.mesh.position, '#ffffff', 6, true);
    dot(centre, '#f088e9', 6);
    rctx.strokeStyle = '#34A9E3';
    rctx.beginPath(); rctx.moveTo(h, h); rctx.lineTo(h - 14, h - 26); rctx.moveTo(h, h); rctx.lineTo(h + 14, h - 26); rctx.stroke();
  }
  ui.radar.addEventListener('click', (e) => {
    const r = ui.radar.getBoundingClientRect();
    const h = r.width / 2, scale = (h - 4) / (R + 10);
    const p = new THREE.Vector3((e.clientX - r.left - h) / scale, 0, (e.clientY - r.top - h) / scale).applyQuaternion(camera.quaternion).add(commander.pos);
    if (p.distanceTo(commander.pos) > 5) lookTowards(p);
  });

  // ---------- World ----------
  function clearWorld() {
    for (const list of [units, enemies, hives]) { for (const e of list) e.remove(); list.length = 0; }
    for (const r of rocks) { scene.remove(r.mesh); scene.remove(r.ring); }
    rocks.length = 0;
    for (const c of strikes) c.finish(false);
    strikes.length = 0;
    if (commander) commander.remove();
    fx.clear();
    selection = [];
    sectors = [];
    for (const k in groups) delete groups[k];
  }

  // The same seed builds the same world; a save keeps the seed plus what changed.
  function buildWorld(seed, saved) {
    clearWorld();
    rng = seeded(seed);
    const turn = new THREE.Quaternion().setFromEuler(new THREE.Euler(rand(0, 6.28), rand(0, 6.28), rand(0, 6.28)));
    const pts = [];
    for (let i = 0; i < SECTORS; i++) {          // ten centres spread over a sphere (Fibonacci lattice)
      const y = 1 - (i + 0.5) / SECTORS * 2, r = Math.sqrt(1 - y * y), a = i * 2.39996;
      pts.push(new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r).applyQuaternion(turn).multiplyScalar(SECTOR_RING));
    }
    const startPt = pts[Math.floor(rand(0, SECTORS))];
    pts.sort((a, b) => a.distanceTo(startPt) - b.distanceTo(startPt));   // nearer to the start = easier
    sectors = pts.map((p, level) => ({ level: level, centre: p, faction: factions.get(level), hives: [], visited: false, conquered: false, wave: 0, nextWave: 90 }));
    let hiveIndex = 0, rockIndex = 0;
    for (const s of sectors) {
      const out = s.centre.clone().normalize();
      for (let i = 0; i < HIVES_PER_SECTOR[s.level]; i++) {
        let d = randDir();
        if (s.level === 0) d = d.add(out.clone().multiplyScalar(1.5)).normalize();   // the first hives sit beyond the start
        const pos = s.centre.clone().addScaledVector(d, s.level === 0 ? rand(100, 125) : rand(45, 100));
        if (pos.length() > WORLD_R - 10) pos.setLength(WORLD_R - 10);
        const hp = saved ? saved.hives[hiveIndex] : undefined;
        const h = new Hive(s, pos, hp);
        if (hp !== undefined && hp <= 0) { h.dead = true; h.remove(); }
        hiveIndex++;
      }
      const comets = s.level === 0 ? 5 : 3, fields = s.level === 0 ? 4 : 2;
      for (let i = 0; i < comets; i++) {
        new Rock('comet', s.centre, s.level === 0 ? rand(25, 75) : rand(30, 110), saved ? saved.rocks[rockIndex] : undefined);
        rockIndex++;
      }
      for (let f = 0; f < fields; f++) {
        const c = s.centre.clone().addScaledVector(randDir(), s.level === 0 ? rand(22, 60) : rand(30, 100));
        for (let i = 0; i < 4; i++) {
          new Rock('asteroid', s.centre, c.clone().addScaledVector(randDir(), rand(3, 8)), saved ? saved.rocks[rockIndex] : undefined);
          rockIndex++;
        }
      }
    }
    rng = Math.random;
    for (let i = hives.length - 1; i >= 0; i--) if (hives[i].dead) hives.splice(i, 1);
    const start = sectors[0].centre.clone().addScaledVector(sectors[0].centre.clone().normalize(), -25);
    commander = new Commander(saved ? new THREE.Vector3().fromArray(saved.commander.pos) : start);
    cam.target.copy(commander.pos);
  }

  function freshState(seed) {
    return { seed: seed, resources: 500, mined: 0, kills: 0, running: false, started: false, over: false, time: 0, lastFight: -99,
      nextStrike: STRIKE.first[0] + Math.random() * (STRIKE.first[1] - STRIKE.first[0]), current: null,
      up: { weapons: 0, hulls: 0, mining: 0, logistics: 0 } };
  }

  function newGame() {
    const seed = Math.floor(Math.random() * 1e9);
    state = freshState(seed);
    buildWorld(seed);
    const c = commander.pos;
    for (let i = 0; i < 3; i++) new Unit('harvester', c.clone().add(new THREE.Vector3(12 - i * 12, -3, 8)));
    for (let i = 0; i < 3; i++) new Unit('fighter', c.clone().add(new THREE.Vector3(-8 + i * 8, 7, 16)));
    new Unit('cruiser', c.clone().add(new THREE.Vector3(0, 3, -18)));
    sectors[0].visited = true;
    sectors[0].nextWave = 120;
    begin();
    say('announce_start', 0, true);
    flash('Harvesters mine on their own: build more of them, then a fleet. Destroy the hives to conquer this sector.');
    saveGame();
  }

  function begin() {
    state.running = true; state.started = true;
    resetCamera();
    closeMenu();
    document.body.classList.add('playing');
    checkSectors();
  }

  // ---------- Save / continue ----------
  function hasSave() { try { return !!localStorage.getItem(SAVE_KEY); } catch (e) { return false; } }
  function saveGame(announce) {
    if (!state || !state.started || state.over) return;
    const data = {
      seed: state.seed, time: state.time, resources: state.resources, mined: state.mined, kills: state.kills, up: state.up, nextStrike: state.nextStrike,
      sectors: sectors.map((s) => ({ visited: s.visited, conquered: s.conquered, wave: s.wave, nextWave: s.nextWave })),
      hives: [].concat.apply([], sectors.map((s) => s.hives.map((h) => (h.dead ? 0 : Math.round(h.hp))))),
      rocks: rocks.map((r) => Math.round(r.amount)),
      commander: { pos: commander.pos.toArray(), hp: commander.hp, queue: commander.queue },
      units: units.filter(alive).map((u) => ({ type: u.type, pos: u.pos.toArray(), hp: u.hp, cargo: u.cargo }))
    };
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(data)); } catch (e) { return; }
    if (announce) say('announce_saved', 60);
  }
  function continueGame() {
    let data = null;
    try { data = JSON.parse(localStorage.getItem(SAVE_KEY)); } catch (e) { data = null; }
    if (!data) { newGame(); return; }
    state = freshState(data.seed);
    Object.assign(state, { time: data.time, resources: data.resources, mined: data.mined, kills: data.kills, up: data.up, nextStrike: data.nextStrike });
    buildWorld(data.seed, { hives: data.hives, rocks: data.rocks, commander: data.commander });
    data.sectors.forEach((s, i) => Object.assign(sectors[i], s));
    commander.hp = data.commander.hp;
    commander.queue = data.commander.queue || [];
    for (const u of data.units) {
      const unit = new Unit(u.type, new THREE.Vector3().fromArray(u.pos));
      unit.hp = Math.min(unit.maxHp, u.hp); unit.cargo = u.cargo || 0;
    }
    begin();
    flash('Welcome back, Commander.');
  }
  function clearSave() { try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* private mode */ } }

  function endGame(won) {
    if (state.over) return;
    state.over = true;
    state.running = false;
    clearSave();
    say(won ? 'announce_victory' : 'announce_defeat', 0, true);
    const mins = Math.floor(state.time / 60), secs = Math.round(state.time % 60);
    const text = (won ? 'Every sector is yours.' : 'You conquered ' + conqueredCount() + ' of ' + SECTORS + ' sectors.') +
      ' Kills: ' + state.kills + '. Ore mined: ' + Math.round(state.mined) + '. Time: ' + mins + 'm ' + secs + 's.';
    setTimeout(() => openMenu(won ? 'Victory' : 'The Commander has fallen', text), 1500);
  }

  let checkTimer = 0, saveTimer = 30;
  function step(dt) {
    state.time += dt;
    checkTimer -= dt;
    if (checkTimer <= 0) { checkTimer = 0.5; checkSectors(); if (state.over) return; }
    updateWaves(dt);
    state.nextStrike -= dt;
    if (state.nextStrike <= 0) { state.nextStrike = STRIKE.gap[0] + Math.random() * (STRIKE.gap[1] - STRIKE.gap[0]); new Strike(); }
    for (const c of strikes) if (!c.dead) c.update(dt);
    for (let i = strikes.length - 1; i >= 0; i--) if (strikes[i].dead) strikes.splice(i, 1);

    for (const r of rocks) if (!r.dead && d2(r.pos, commander.pos) < 300 * 300) r.update(dt);
    commander.update(dt);
    if (state.over) return;
    for (const h of hives) if (!h.dead) h.update(dt);
    for (const u of units) if (!u.dead) u.update(dt);
    for (const e of enemies) if (!e.dead) e.update(dt);

    const all = units.concat(enemies);
    for (let i = 0; i < all.length; i++) {
      const a = all[i];
      if (a.dead) continue;
      for (let j = i + 1; j < all.length; j++) {
        const b = all[j];
        if (b.dead) continue;
        const min = (a.radius + b.radius) * 0.75;
        v1.subVectors(b.pos, a.pos);
        const d = v1.length();
        if (d > 0.0001 && d < min) { v1.multiplyScalar((min - d) / 2 / d); a.pos.sub(v1); b.pos.add(v1); }
      }
      for (const big of [commander].concat(hives)) {
        if (big.dead) continue;
        v1.subVectors(a.pos, big.pos);
        const d = v1.length(), min = big.radius + a.radius * 0.6;
        if (d < min && d > 0.0001) a.pos.addScaledVector(v1, (min - d) / d);
      }
    }
    for (const list of [units, enemies, hives]) for (let i = list.length - 1; i >= 0; i--) if (list[i].dead) list.splice(i, 1);

    // music: the battle track while enemies are close, the calm one otherwise
    if (enemies.some((e) => d2(e.pos, commander.pos) < 80 * 80)) state.lastFight = state.time;
    audio.music(state.time - state.lastFight < 12 ? 'battle' : 'calm');

    saveTimer -= dt;
    if (saveTimer <= 0) { saveTimer = 30; saveGame(); }
  }

  // ---------- Main loop ----------
  let last = performance.now();
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    keyCamera(dt);
    if (camTween) {
      camTween.t = Math.min(1, camTween.t + dt * 1.5);
      cam.q.copy(camTween.from).slerp(camTween.to, camTween.t * camTween.t * (3 - 2 * camTween.t));
      if (camTween.t >= 1) camTween = null;
    }
    if (state.running) { step(dt); fx.update(dt); }
    else if (!state.started) {
      rotateCamera(dt * 0.05, 0);
      for (const r of rocks) if (!r.dead && d2(r.pos, commander.pos) < 200 * 200) r.update(dt);
      fx.update(dt);
    } else if (state.over) fx.update(dt);
    if (alive(commander)) cam.target.lerp(commander.pos, Math.min(1, dt * 3));   // follow the Commander
    placeCamera();
    edge.position.copy(cam.target);
    sky.position.copy(camera.position);
    for (const e of units.concat(enemies, hives, [commander])) if (e && e.shieldGlow > 0) e.shieldGlow -= dt;
    if (markerLife > 0) { markerLife -= dt; markerSprite.material.opacity = Math.max(0, markerLife / 0.7); markerSprite.scale.setScalar(3 + (0.7 - markerLife) * 6); if (markerLife <= 0) markerSprite.visible = false; }
    if (msgTimer > 0 && state.running) { msgTimer -= dt; if (msgTimer <= 0) ui.message.style.display = 'none'; }
    updateBars();
    if (state.started) updateHUD();
    drawRadar();
    if (!ui.map.hidden && Math.random() < 0.1) drawMap();
    renderer.render(scene, camera);
  }

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });
  window.addEventListener('pagehide', () => saveGame());

  // Title screen: a world turning slowly behind the menu
  state = freshState(1);
  buildWorld(20261109);
  $('loading').style.display = 'none';
  soundLabels();
  openMenu();
  requestAnimationFrame(frame);

  // For the browser console and tests
  window.cometAndCommander = {
    get state() { return state; }, units: units, enemies: enemies, hives: hives, rocks: rocks, strikes: strikes,
    get sectors() { return sectors; }, get commander() { return commander; }, get selection() { return selection; },
    queueUnit: queueUnit, queueUpgrade: queueUpgrade, select: select, command: command, step: step, newGame: newGame,
    continueGame: continueGame, saveGame: saveGame, toScreen: toScreen, camera: camera, cam: cam, placeCamera: placeCamera,
    lookTowards: lookTowards, travelTo: travelTo, toggleMap: toggleMap, Unit: Unit, Enemy: Enemy, Strike: Strike, fx: fx,
    renderer: renderer, scene: scene, updateWaves: updateWaves
  };
})(window.CC);

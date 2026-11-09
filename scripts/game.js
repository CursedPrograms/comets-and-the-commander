// Comet & Commander - a 3D space RTS (three.js r128)
// You are the Commander carrier at the centre of a sphere of space. Mine comets and asteroids,
// build a fleet, research upgrades and destroy the enemy hives before their waves destroy you.
(function (CC) {
  'use strict';

  const COL = CC.COL, models = CC.models, fx = CC.fx, audio = CC.audio, sfx = CC.audio.sfx;

  // ---------- Settings ----------
  const R = 95;                    // radius of the battle sphere
  const HIVES = 3;
  const FIRST_WAVE = 75;
  const WAVE_GAP = 55;

  const UNIT = {
    fighter:   { name: 'Fighter',   cost: 100, build: 4, hp: 70,  dmg: 7,  range: 16, rate: 0.35, speed: 16, accel: 3,   turn: 5, aggro: 30, bolt: 70, heavy: false },
    cruiser:   { name: 'Cruiser',   cost: 300, build: 9, hp: 380, dmg: 22, range: 24, rate: 0.9,  speed: 6,  accel: 1.2, turn: 1.4, aggro: 32, bolt: 50, heavy: true },
    harvester: { name: 'Harvester', cost: 150, build: 5, hp: 110, dmg: 0,  range: 0,  rate: 0,    speed: 9,  accel: 2,   turn: 3, aggro: 0, cargo: 40, mine: 10 }
  };
  const ENEMY = {
    raider:    { name: 'Raider',    hp: 55,  dmg: 6,  range: 14, rate: 0.6, speed: 13, accel: 2.5, turn: 4, bolt: 55 },
    destroyer: { name: 'Destroyer', hp: 420, dmg: 20, range: 22, rate: 1.2, speed: 5,  accel: 1,   turn: 1.2, bolt: 45 }
  };
  const UPGRADES = {
    weapons: { name: 'Weapons', costs: [200, 350, 500], build: 12 },
    armour:  { name: 'Armour',  costs: [200, 350, 500], build: 12 },
    mining:  { name: 'Mining',  costs: [150, 300, 450], build: 10 }
  };
  const BOUNTY = { raider: 20, destroyer: 80, hive: 400 };

  // ---------- DOM ----------
  const $ = (id) => document.getElementById(id);
  const ui = {
    container: $('game-container'), resources: $('resources'), wave: $('wave'), hives: $('hives'), base: $('base-hp'),
    units: $('unit-count'), selected: $('selected-info'), queue: $('queue'), queueBar: $('queue-bar'), message: $('message'),
    overlay: $('overlay'), overlayTitle: $('overlay-title'), overlayText: $('overlay-text'), start: $('start'),
    box: $('select-box'), pause: $('pause'), sound: $('sound'), radar: $('radar')
  };

  // ---------- Three.js setup ----------
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(COL.navy);
  const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.5, 5000);
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.physicallyCorrectLights = false;
  ui.container.insertBefore(renderer.domElement, ui.container.firstChild);

  models.environment(renderer, scene);
  scene.add(new THREE.AmbientLight(0x30465a, 0.6));
  scene.add(new THREE.HemisphereLight(0x8fd3ff, 0x001725, 0.5));
  const key = new THREE.DirectionalLight(0xfff3df, 1.6); key.position.set(900, 500, 700); scene.add(key);
  const rim = new THREE.DirectionalLight(COL.pink, 0.7); rim.position.set(-600, -200, -800); scene.add(rim);
  const fill = new THREE.DirectionalLight(COL.light, 0.4); fill.position.set(-300, 400, 600); scene.add(fill);
  models.backdrop(scene);
  fx.setScene(scene);

  // faint sphere showing the edge of the battle area
  const edge = new THREE.Mesh(new THREE.SphereGeometry(R, 32, 16), new THREE.MeshBasicMaterial({ color: COL.dark, wireframe: true, transparent: true, opacity: 0.12, depthWrite: false }));
  scene.add(edge);

  // ---------- Camera: orbit freely (360 degrees) around the Commander ----------
  const cam = { q: new THREE.Quaternion(), dist: 48 };
  const qTmp = new THREE.Quaternion();
  const AX = { x: new THREE.Vector3(1, 0, 0), y: new THREE.Vector3(0, 1, 0), z: new THREE.Vector3(0, 0, 1) };
  function resetCamera() {
    cam.q.setFromEuler(new THREE.Euler(-0.35, 0.5, 0, 'YXZ'));
    cam.dist = 48;
    placeCamera();
  }
  function rotateCamera(dx, dy) {           // radians about the camera's own up and right axes
    qTmp.setFromAxisAngle(AX.y, -dx); cam.q.multiply(qTmp);
    qTmp.setFromAxisAngle(AX.x, -dy); cam.q.multiply(qTmp);
    cam.q.normalize();
    placeCamera();
  }
  function placeCamera() {
    cam.dist = Math.max(16, Math.min(240, cam.dist));
    camera.position.set(0, 0, cam.dist).applyQuaternion(cam.q);
    camera.quaternion.copy(cam.q);
    camera.updateMatrixWorld();
  }
  function lookTowards(p) {               // swing round so p is in front, beyond the Commander
    const dir = p.clone().normalize();
    if (dir.lengthSq() < 0.5) return;
    const target = new THREE.Quaternion().setFromUnitVectors(AX.z, dir.negate());
    camTween = { from: cam.q.clone(), to: target, t: 0 };
  }
  let camTween = null;
  resetCamera();

  // ---------- Helpers ----------
  const v1 = new THREE.Vector3(), v2 = new THREE.Vector3();
  const dummy = new THREE.Object3D();
  function rand(a, b) { return a + Math.random() * (b - a); }
  function randDir() { return new THREE.Vector3(rand(-1, 1), rand(-1, 1), rand(-1, 1)).normalize(); }
  function d2(a, b) { return a.distanceToSquared(b); }
  function alive(e) { return e && !e.dead; }

  // ---------- Game state ----------
  let state = null;
  const units = [], enemies = [], rocks = [], hives = [];
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
      this.radius = model.size;
      this.vel = new THREE.Vector3();
      this.cooldown = rand(0, 0.5);
      this.dead = false;
      this.mesh.userData.entity = this;
      this.engines = (model.engines || []).map((e) => ({
        obj: e,
        plume: e.children.find((c) => c.userData.plume),
        glow: e.children.find((c) => c.userData.engineGlow)
      }));
      // health bar (two sprites kept facing the camera)
      this.barBg = new THREE.Sprite(new THREE.SpriteMaterial({ color: COL.navy, depthTest: false }));
      this.barFg = new THREE.Sprite(new THREE.SpriteMaterial({ color: this.isEnemy ? COL.enemy : COL.light, depthTest: false }));
      this.barBg.renderOrder = 21; this.barFg.renderOrder = 22;
      this.barBg.visible = this.barFg.visible = false;
      this.ring = models.ringSprite(this.isEnemy ? COL.enemy : COL.pink, this.radius * 2.6);
      this.ring.visible = false;
      scene.add(this.mesh); scene.add(this.barBg); scene.add(this.barFg); scene.add(this.ring);
    }
    get pos() { return this.mesh.position; }
    hurt(amount, from) {
      if (this.dead) return;
      if (this.team === 'player') amount *= 1 - 0.15 * state.up.armour;
      this.hp -= amount;
      this.lastHit = state.time;
      fx.shieldFlash(this);
      if (this.hp <= 0) this.die(from);
    }
    die() {
      this.dead = true;
      fx.explosion(this.pos.clone(), this.radius * 0.9, this.isEnemy ? COL.enemy : COL.light);
      sfx.explosion(this.radius > 4);
      this.remove();
    }
    remove() {
      scene.remove(this.mesh); scene.remove(this.barBg); scene.remove(this.barFg); scene.remove(this.ring);
    }
    // fly towards a point; returns true once within stopAt
    steer(point, speed, dt, stopAt, noBrake) {
      v1.subVectors(point, this.pos);
      const d = v1.length();
      const arrived = d <= (stopAt || 1);
      let want = speed;
      if (!noBrake) want = arrived ? 0 : Math.min(speed, (d - (stopAt || 1)) * 1.2 + 0.5);
      if (d > 0.001) v1.multiplyScalar(want / d); else v1.set(0, 0, 0);
      this.vel.lerp(v1, Math.min(1, this.t.accel * dt));
      this.pos.addScaledVector(this.vel, dt);
      if (this.pos.lengthSq() > (R + 25) * (R + 25)) this.pos.setLength(R + 25);
      if (this.vel.lengthSq() > 0.5) this.face(v2.copy(this.pos).add(this.vel), dt);
      return arrived;
    }
    face(point, dt) {
      dummy.position.copy(this.pos);
      dummy.lookAt(point);
      this.mesh.quaternion.slerp(dummy.quaternion, Math.min(1, this.t.turn * dt));
    }
    drawEngines(dt) {
      const k = Math.min(1, this.vel.length() / this.t.speed);
      for (const e of this.engines) {
        if (e.plume) e.plume.scale.z = e.plume.userData.plume * (0.25 + k * 0.9) * (0.85 + Math.random() * 0.3);
        if (e.glow) { const s = e.glow.userData.engineGlow * (0.6 + k * 0.6); e.glow.scale.set(s, s, 1); }
        if (k > 0.2 && Math.random() < k * 0.8) fx.trail(e.glow ? e.glow.getWorldPosition(v2) : this.pos, this.isEnemy ? COL.enemy : COL.light);
      }
    }
    // fire a bolt from a point (defaults to the ship) at a target
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
    constructor() {
      super(models.mothership(), 3000, 'player');
      this.type = 'commander'; this.name = 'Commander';
      this.t = { speed: 0, accel: 0, turn: 0 };
      this.turrets = this.model.turrets;
      this.queue = [];
      this.progress = 0;
      this.rally = null;
      this.mesh.rotation.y = 0.6;
    }
    die(from) {
      super.die(from);
      fx.explosion(this.pos.clone(), 14, COL.pink);
      endGame(false);
    }
    update(dt) {
      this.mesh.rotation.y += dt * 0.02;
      // production queue
      if (this.queue.length) {
        const item = this.queue[0];
        this.progress += dt;
        if (this.progress >= item.time) {
          this.queue.shift();
          this.progress = 0;
          finishItem(item);
        }
      }
      // point defence: each turret fires at the nearest enemy in range
      this.cooldown -= dt;
      const threat = nearest(enemies.concat(hives), this.pos, 32 + 11);
      if (threat) for (const t of this.turrets) t.lookAt(threat.pos);
      if (threat && this.cooldown <= 0) {
        this.cooldown = 0.5;
        const t = this.turrets[Math.floor(Math.random() * this.turrets.length)];
        this.shoot(threat, 14 * dmgMult(), COL.pink, 60, true, t.getWorldPosition(v2));
      }
      // repair friendly ships nearby
      for (const u of units) {
        if (u.hp < u.maxHp && d2(u.pos, this.pos) < 30 * 30) {
          u.hp = Math.min(u.maxHp, u.hp + 6 * dt);
          if (Math.random() < dt * 2) fx.line(this.pos, u.pos, COL.light);
        }
      }
    }
  }

  class Unit extends Entity {
    constructor(type, pos) {
      const t = UNIT[type];
      super(models[type](), Math.round(t.hp), 'player');
      this.type = type; this.t = t; this.name = t.name;
      this.order = null;
      this.cargo = 0;
      this.hstate = 'seek';
      this.rock = null;
      this.phase = rand(0, Math.PI * 2);
      this.axis = randDir();
      this.turrets = this.model.turrets;
      this.drill = this.model.drill;
      this.pos.copy(pos);
      units.push(this);
    }
    die(from) {
      super.die(from);
      deselect(this);
      say('announce_ship_lost', 8);
    }
    hurt(amount, from) {
      super.hurt(amount, from);
      if (!this.dead && from && from.isEnemy) say('announce_under_attack', 25);
      // fight back if idle
      if (!this.dead && from && !from.dead && this.type !== 'harvester' && !this.order) this.order = { kind: 'attack', target: from, auto: true };
    }
    update(dt) {
      this.cooldown -= dt;
      if (this.type === 'harvester') this.updateHarvester(dt);
      else this.updateCombat(dt);
      this.drawEngines(dt);
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
        // idle: drift to a stop and look around slowly
        this.steer(this.pos, 0, dt, 99);
        return;
      }
      const dist = Math.sqrt(d2(this.pos, target.pos));
      if (this.type === 'fighter') {
        // dogfight: circle the target
        const r = target.radius + 7;
        const a = state.time * 0.9 + this.phase;
        v2.set(1, 0, 0).cross(this.axis); if (v2.lengthSq() < 0.01) v2.set(0, 1, 0).cross(this.axis);
        v2.normalize();
        const b = new THREE.Vector3().crossVectors(this.axis, v2);
        const p = target.pos.clone().addScaledVector(v2, Math.cos(a) * r).addScaledVector(b, Math.sin(a) * r);
        this.steer(p, this.t.speed, dt, 0, true);
      } else {
        if (dist > this.t.range * 0.75 + target.radius) this.steer(target.pos, this.t.speed, dt, this.t.range * 0.75 + target.radius);
        else { this.steer(this.pos, 0, dt, 99); this.face(target.pos, dt * 0.5); }
      }
      if (dist <= this.t.range + target.radius) this.fireAt(target);
    }
    fireAt(target) {
      for (const t of this.turrets) t.lookAt(target.pos);
      if (this.cooldown > 0) return;
      this.cooldown = this.t.rate * rand(0.9, 1.1);
      const from = this.turrets.length ? this.turrets[Math.floor(Math.random() * this.turrets.length)].getWorldPosition(new THREE.Vector3()) : null;
      this.shoot(target, this.t.dmg * dmgMult(), this.type === 'cruiser' ? COL.pink : COL.light, this.t.bolt, this.t.heavy, from);
    }
    updateHarvester(dt) {
      const t = this.t;
      const cap = t.cargo * (1 + 0.25 * state.up.mining);
      const o = this.order;
      if (this.drill) this.drill.rotation.z += dt * (this.hstate === 'mine' ? 14 : 1);
      if (o && o.kind === 'move') {
        if (this.steer(o.point, t.speed, dt, 1.5)) this.order = null;
        return;
      }
      if (o && o.kind === 'harvest') { this.rock = o.rock; this.order = null; this.hstate = this.cargo >= cap ? 'return' : 'seek'; }
      if (this.hstate === 'seek') {
        if (!this.rock || this.rock.amount <= 0) this.rock = nearest(rocks, this.pos, Infinity);
        if (!this.rock) { if (this.cargo > 0) this.hstate = 'return'; else this.steer(this.pos, 0, dt, 99); return; }
        if (this.steer(this.rock.pos, t.speed, dt, this.rock.radius + 2.5)) this.hstate = 'mine';
      } else if (this.hstate === 'mine') {
        if (!this.rock || this.rock.amount <= 0) { this.hstate = this.cargo > 0 ? 'return' : 'seek'; return; }
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
    constructor(type, pos, hive, guard) {
      const t = ENEMY[type];
      super(models[type](), Math.round(t.hp * (1 + state.wave * 0.1)), 'enemy');
      this.type = type; this.t = t; this.name = t.name;
      this.hive = hive; this.guard = !!guard;
      this.phase = rand(0, Math.PI * 2);
      this.axis = randDir();
      this.turrets = this.model.turrets;
      this.pos.copy(pos);
      enemies.push(this);
    }
    die(from) {
      super.die(from);
      deselect(this);
      addResources(BOUNTY[this.type]);
      state.kills++;
    }
    update(dt) {
      this.cooldown -= dt;
      let target = null;
      if (this.guard && alive(this.hive)) {
        target = nearest(units, this.hive.pos, 38);
        if (!target && d2(commander.pos, this.hive.pos) < 38 * 38) target = commander;
        if (!target) {
          const a = state.time * 0.4 + this.phase;
          v2.set(1, 0, 0).cross(this.axis).normalize();
          const b = new THREE.Vector3().crossVectors(this.axis, v2);
          const p = this.hive.pos.clone().addScaledVector(v2, Math.cos(a) * 16).addScaledVector(b, Math.sin(a) * 16);
          this.steer(p, this.t.speed * 0.6, dt, 0, true);
          this.drawEngines(dt);
          return;
        }
      } else {
        target = nearest(units, this.pos, 30) || commander;
      }
      if (!alive(target)) { this.drawEngines(dt); return; }
      const dist = Math.sqrt(d2(this.pos, target.pos));
      if (this.type === 'raider') {
        const r = target.radius + 6;
        const a = state.time * 1.1 + this.phase;
        v2.set(0, 1, 0).cross(this.axis); if (v2.lengthSq() < 0.01) v2.set(1, 0, 0).cross(this.axis);
        v2.normalize();
        const b = new THREE.Vector3().crossVectors(this.axis, v2);
        const p = target.pos.clone().addScaledVector(v2, Math.cos(a) * r).addScaledVector(b, Math.sin(a) * r);
        this.steer(p, this.t.speed, dt, 0, true);
      } else {
        if (dist > this.t.range * 0.75 + target.radius) this.steer(target.pos, this.t.speed, dt, this.t.range * 0.75 + target.radius);
        else { this.steer(this.pos, 0, dt, 99); this.face(target.pos, dt * 0.5); }
        for (const t of this.turrets) t.lookAt(target.pos);
      }
      if (dist <= this.t.range + target.radius && this.cooldown <= 0) {
        this.cooldown = this.t.rate * rand(0.9, 1.15);
        const from = this.turrets.length ? this.turrets[Math.floor(Math.random() * this.turrets.length)].getWorldPosition(new THREE.Vector3()) : null;
        this.shoot(target, this.t.dmg, COL.enemy, this.t.bolt, this.type === 'destroyer', from);
      }
      this.drawEngines(dt);
    }
  }

  class Hive extends Entity {
    constructor(pos) {
      super(models.hive(), 3200, 'enemy');
      this.type = 'hive'; this.name = 'Enemy hive';
      this.t = { speed: 0, accel: 0, turn: 0 };
      this.pos.copy(pos);
      this.guardTimer = 5;
      hives.push(this);
    }
    die(from) {
      super.die(from);
      fx.explosion(this.pos.clone(), 10, COL.enemy);
      deselect(this);
      addResources(BOUNTY.hive);
      say('announce_hive_destroyed', 0, true);
      flash('Enemy hive destroyed! ' + hives.filter(alive).length + ' left');
    }
    update(dt) {
      this.mesh.rotation.y += dt * 0.15;
      this.mesh.rotation.x += dt * 0.05;
      this.model.core.material.opacity = 0.45 + Math.sin(state.time * 3) * 0.15;
      this.cooldown -= dt;
      const target = nearest(units, this.pos, 30) || (d2(commander.pos, this.pos) < 30 * 30 ? commander : null);
      if (target && this.cooldown <= 0) {
        this.cooldown = 0.8;
        this.shoot(target, 16, COL.enemy, 50, true);
      }
      // keep a few guards
      this.guardTimer -= dt;
      if (this.guardTimer <= 0) {
        this.guardTimer = 40;
        const guards = enemies.filter((e) => e.hive === this && e.guard).length;
        if (guards < 3) new Enemy('raider', this.pos.clone().add(randDir().multiplyScalar(10)), this, true);
      }
    }
  }

  class Rock {
    constructor(kind, pos) {
      this.kind = kind;
      this.model = kind === 'comet' ? models.comet() : models.asteroid();
      this.mesh = this.model.group;
      this.mesh.userData.entity = this;
      this.radius = this.model.size;
      this.amount = this.max = kind === 'comet' ? Math.round(rand(800, 1100)) : Math.round(rand(300, 450));
      this.spin = randDir().multiplyScalar(rand(0.1, 0.4));
      if (kind === 'comet') {
        this.orbit = rand(30, R - 15);
        this.angle = rand(0, Math.PI * 2);
        this.speed = rand(0.012, 0.025) * (Math.random() < 0.5 ? -1 : 1);
        const n = randDir();
        this.u = new THREE.Vector3(1, 0, 0).cross(n).normalize();
        this.w = new THREE.Vector3().crossVectors(n, this.u);
        this.place();
      } else this.mesh.position.copy(pos);
      this.ring = models.ringSprite(COL.white, this.radius * 2.8); this.ring.visible = false;
      scene.add(this.mesh); scene.add(this.ring);
      rocks.push(this);
    }
    get pos() { return this.mesh.position; }
    place() {
      this.mesh.position.copy(this.u).multiplyScalar(Math.cos(this.angle) * this.orbit).addScaledVector(this.w, Math.sin(this.angle) * this.orbit);
      this.mesh.lookAt(0, 0, 0);       // the tail points away from the centre
    }
    take(n) {
      this.amount -= n;
      const s = 0.4 + 0.6 * Math.max(0, this.amount / this.max);
      this.model.rock.scale.set(s, s, s);
      if (this.amount <= 0) {
        this.amount = 0;
        this.dead = true;
        deselect(this);
        scene.remove(this.mesh); scene.remove(this.ring);
        fx.explosion(this.pos.clone(), 1.5, COL.light);
        say('announce_mined_out', 15);
        flash('A ' + this.kind + ' is mined out');
      }
    }
    update(dt) {
      if (this.kind === 'comet') { this.angle += this.speed * dt; this.place(); }
      this.model.rock.rotation.x += this.spin.x * dt;
      this.model.rock.rotation.y += this.spin.y * dt;
    }
  }

  function nearest(list, p, maxDist) {
    let best = null, bd = maxDist * maxDist;
    for (const e of list) {
      if (e.dead || e.amount === 0) continue;
      const d = d2(e.pos, p) - (e.radius || 0) * (e.radius || 0);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  function dmgMult() { return 1 + 0.25 * state.up.weapons; }

  // ---------- Economy, production, upgrades ----------
  function addResources(n) { state.resources += n; state.mined += n; }

  function queueUnit(type) {
    if (!state || !state.running) return;
    const t = UNIT[type];
    if (commander.queue.length >= 8) { flash('The build queue is full'); sfx.denied(); return; }
    if (state.resources < t.cost) { flash('Not enough resources for a ' + t.name + ' (' + t.cost + ')'); sfx.denied(); say('announce_no_resources', 3); return; }
    state.resources -= t.cost;
    commander.queue.push({ kind: 'unit', type: type, time: t.build, name: t.name });
    sfx.queue();
  }

  function queueUpgrade(kind) {
    if (!state || !state.running) return;
    const u = UPGRADES[kind];
    const level = state.up[kind] + commander.queue.filter((q) => q.type === kind).length;
    if (level >= 3) { flash(u.name + ' is fully upgraded'); sfx.denied(); return; }
    const cost = u.costs[level];
    if (state.resources < cost) { flash('Not enough resources for ' + u.name + ' ' + (level + 1) + ' (' + cost + ')'); sfx.denied(); say('announce_no_resources', 3); return; }
    if (commander.queue.length >= 8) { flash('The build queue is full'); sfx.denied(); return; }
    state.resources -= cost;
    commander.queue.push({ kind: 'upgrade', type: kind, time: u.build, name: u.name + ' ' + (level + 1) });
    sfx.queue();
  }

  function finishItem(item) {
    if (item.kind === 'upgrade') {
      state.up[item.type]++;
      sfx.upgrade();
      say('announce_upgrade', 0, true);
      flash(item.name + ' complete');
      return;
    }
    // launch from the carrier's deck
    const start = new THREE.Vector3(rand(-2, 2), 2.5, rand(-6, 6)).applyQuaternion(commander.mesh.quaternion);
    const u = new Unit(item.type, start);
    u.mesh.quaternion.copy(commander.mesh.quaternion);
    const out = commander.rally ? commander.rally.clone().add(randDir().multiplyScalar(4))
      : new THREE.Vector3(rand(-1, 1), rand(-0.4, 0.4), rand(-1, 1)).normalize().multiplyScalar(commander.radius + 8 + Math.random() * 8);
    if (item.type !== 'harvester') u.order = { kind: 'move', point: out };
    sfx.build();
    say(item.type + '_built', 0);
  }

  // ---------- Waves ----------
  function spawnWave() {
    state.wave++;
    const living = hives.filter(alive);
    let n = 0, big = 0;
    for (const h of living) {
      const raiders = 1 + state.wave;
      const destroyers = Math.floor(state.wave / 3);
      for (let i = 0; i < raiders; i++) new Enemy('raider', h.pos.clone().add(randDir().multiplyScalar(9)), h, false);
      for (let i = 0; i < destroyers; i++) new Enemy('destroyer', h.pos.clone().add(randDir().multiplyScalar(11)), h, false);
      n += raiders; big += destroyers;
    }
    state.nextWave = WAVE_GAP;
    if (!living.length) return;
    say('announce_wave', 0, true);
    flash('Wave ' + state.wave + ': ' + n + ' raiders' + (big ? ' and ' + big + ' destroyer' + (big > 1 ? 's' : '') : '') + ' incoming');
  }

  // ---------- Voice helper ----------
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
    const list = units.concat(enemies, hives, rocks);
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
    // generous fallback: the closest thing on screen within 30px
    let best = null, bd = 30 * 30;
    for (const e of list) {
      const s = toScreen(e.pos);
      if (s.behind) continue;
      const pad = e === commander ? 0 : 0;
      const d = (s.x - x) * (s.x - x) + (s.y - y) * (s.y - y) - pad;
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
    const first = list.find((e) => e.team === 'player' && UNIT[e.type]);
    if (first) say(first.type + '_select', 0);
  }
  function myShips() { return selection.filter((e) => e.team === 'player' && e !== commander); }

  // the point the player clicked "in space": on a plane through the selection, facing the camera
  function spacePoint(x, y, through) {
    setRay(x, y);
    const n = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(n, through);
    const p = new THREE.Vector3();
    if (!raycaster.ray.intersectPlane(plane, p)) return null;
    if (p.length() > R) p.setLength(R);
    return p;
  }

  function command(x, y) {
    if (!state.running) return false;
    const ships = myShips();
    const e = entityAt(x, y);
    // the Commander alone selected: set the rally point
    if (!ships.length && selection.indexOf(commander) >= 0) {
      const p = e && e !== commander ? e.pos.clone() : spacePoint(x, y, new THREE.Vector3());
      if (!p) return false;
      commander.rally = p;
      rallyMarker.position.copy(p); rallyMarker.visible = true;
      flash('Rally point set'); sfx.order();
      return true;
    }
    if (!ships.length) return false;
    if (e && e.isEnemy) {
      let fighters = 0;
      for (const u of ships) if (u.type !== 'harvester') { u.order = { kind: 'attack', target: e }; fighters++; }
      if (fighters) { sfx.order(); say(ships.find((u) => u.type !== 'harvester').type + '_attack', 0); marker(e.pos, COL.enemy); return true; }
    }
    if (e instanceof Rock) {
      let sent = 0;
      for (const u of ships) if (u.type === 'harvester') { u.order = { kind: 'harvest', rock: e }; sent++; }
      if (sent) { sfx.order(); say('harvester_harvest', 0); marker(e.pos, COL.white); return true; }
    }
    const centre = new THREE.Vector3();
    for (const u of ships) centre.add(u.pos);
    centre.divideScalar(ships.length);
    const p = e && e.team === 'player' ? e.pos.clone().add(randDir().multiplyScalar(e.radius + 4)) : spacePoint(x, y, centre);
    if (!p) return false;
    // formation: a small grid facing the camera
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
    const cols = Math.ceil(Math.sqrt(ships.length));
    ships.forEach((u, i) => {
      const ox = (i % cols - (cols - 1) / 2) * 4.5, oy = (Math.floor(i / cols) - (cols - 1) / 2) * 4.5;
      u.order = { kind: 'move', point: p.clone().addScaledVector(right, ox).addScaledVector(up, oy) };
      if (u.type === 'harvester') u.hstate = 'seek';
    });
    sfx.order();
    say(ships[0].type + '_move', 0);
    marker(p, COL.pink);
    return true;
  }

  // order markers
  const markerSprite = models.ringSprite(COL.pink, 3); markerSprite.visible = false; scene.add(markerSprite);
  let markerLife = 0;
  function marker(p, colour) {
    markerSprite.position.copy(p);
    markerSprite.material.color.setHex(colour);
    markerSprite.visible = true;
    markerLife = 0.7;
  }
  const rallyMarker = models.glowSprite(COL.pink, 3, 0.9); rallyMarker.visible = false; scene.add(rallyMarker);

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
      placeCamera();
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
    if (d.moved) return;   // that was a camera turn
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
      if (e !== commander && lastTap.type === e.type && now - lastTap.time < 350) {
        // double click: every ship of that type on screen
        select(units.filter((u) => u.type === e.type && !toScreen(u.pos).behind), shift);
      } else select([e], shift && e !== commander);
      lastTap = { time: now, type: e.type };
      return;
    }
    if (type !== 'mouse' && myShips().length + (selection.indexOf(commander) >= 0 ? 1 : 0)) {
      if (command(x, y)) return;   // touch: tap anything else to give an order
    }
    if (e && (e.isEnemy || e instanceof Rock)) { select([e], false, true); sfx.select(); return; }
    if (!shift) select([], false);
  }

  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    cam.dist *= e.deltaY > 0 ? 1.1 : 0.9;
    placeCamera();
  }, { passive: false });

  const keys = {};
  window.addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    keys[k] = true;
    if (e.target && e.target.tagName === 'INPUT') return;
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
    else if (k === 'escape') select([], false);
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
    else if (keys.q || keys.e) placeCamera();
  }

  function selectArmy() { select(units.filter((u) => u.type !== 'harvester'), false); }
  function selectHarvesters() { select(units.filter((u) => u.type === 'harvester'), false); }
  function selectBase() { if (alive(commander)) { select([commander], false); lookTowards(new THREE.Vector3(0, 0.3, 1)); } }

  // Buttons
  $('build-fighter').addEventListener('click', () => queueUnit('fighter'));
  $('build-cruiser').addEventListener('click', () => queueUnit('cruiser'));
  $('build-harvester').addEventListener('click', () => queueUnit('harvester'));
  $('up-weapons').addEventListener('click', () => queueUpgrade('weapons'));
  $('up-armour').addEventListener('click', () => queueUpgrade('armour'));
  $('up-mining').addEventListener('click', () => queueUpgrade('mining'));
  $('select-army').addEventListener('click', selectArmy);
  $('select-harvesters').addEventListener('click', selectHarvesters);
  $('select-base').addEventListener('click', selectBase);
  $('select-none').addEventListener('click', () => select([], false));
  $('home').addEventListener('click', resetCamera);
  ui.pause.addEventListener('click', togglePause);
  ui.sound.addEventListener('click', toggleSound);
  ui.start.addEventListener('click', startGame);
  document.querySelectorAll('#controls button').forEach((b) => b.addEventListener('click', () => audio.init()));

  function togglePause() {
    if (!state || state.over || !state.started) return;
    state.running = !state.running;
    ui.pause.textContent = state.running ? 'Pause' : 'Resume';
    if (!state.running) flash('Paused');
  }
  function toggleSound() {
    audio.setMuted(!audio.muted);
    ui.sound.textContent = audio.muted ? 'Sound off' : 'Sound on';
  }

  // ---------- Messages ----------
  let msgTimer = 0;
  function flash(text) {
    ui.message.textContent = text;
    ui.message.style.display = 'block';
    msgTimer = 4;
  }

  // ---------- HUD ----------
  function updateHUD() {
    ui.resources.textContent = 'Ore: ' + Math.floor(state.resources);
    const living = hives.filter(alive).length;
    ui.hives.textContent = 'Enemy hives: ' + living + '/' + HIVES;
    ui.wave.textContent = state.started ? 'Wave ' + (state.wave + 1) + ' in ' + Math.max(0, Math.ceil(state.nextWave)) + 's' : '';
    ui.base.textContent = 'Commander hull: ' + Math.max(0, Math.ceil(commander.hp)) + '/' + commander.maxHp;
    const army = units.filter((u) => u.type !== 'harvester').length;
    ui.units.textContent = 'Fleet: ' + army + ' warships, ' + (units.length - army) + ' harvesters. Kills: ' + state.kills;
    if (selection.length === 1) {
      const u = selection[0];
      let s = u.name + ': hull ' + Math.max(0, Math.ceil(u.hp !== undefined ? u.hp : 0)) + '/' + (u.maxHp || 0);
      if (u instanceof Rock) s = (u.kind === 'comet' ? 'Comet' : 'Asteroid') + ': ' + Math.floor(u.amount) + ' ore left';
      if (u.type === 'harvester') s += ', cargo ' + Math.floor(u.cargo) + ' (' + ({ seek: 'heading out', mine: 'mining', return: 'returning' })[u.hstate] + ')';
      if (u === commander) s += '. Right-click to set a rally point.';
      ui.selected.textContent = s;
    } else if (selection.length > 1) ui.selected.textContent = selection.length + ' ships selected';
    else ui.selected.textContent = 'Nothing selected';
    for (const type of Object.keys(UNIT)) $('build-' + type).disabled = !state.running || state.resources < UNIT[type].cost;
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

  // health bars and rings follow their ships, sized to stay readable at any zoom
  const camUp = new THREE.Vector3();
  function updateBars() {
    camUp.set(0, 1, 0).applyQuaternion(camera.quaternion);
    const list = units.concat(enemies, hives);
    if (alive(commander)) list.push(commander);
    for (const e of list) {
      if (e.dead) continue;
      const show = e.selected || e.hp < e.maxHp;
      e.barBg.visible = e.barFg.visible = show;
      e.ring.position.copy(e.pos);
      if (!show) continue;
      const dist = camera.position.distanceTo(e.pos);
      const w = Math.max(e.radius * 1.6, dist * 0.05) * (e.radius > 6 ? 1.6 : 1);
      const h = Math.max(0.25, dist * 0.007);
      const f = Math.max(0, e.hp / e.maxHp);
      e.barBg.position.copy(e.pos).addScaledVector(camUp, e.radius + h * 3);
      e.barBg.scale.set(w, h, 1);
      e.barFg.scale.set(Math.max(0.001, w * f), h * 0.7, 1);
      e.barFg.position.copy(e.barBg.position).addScaledVector(v1.set(1, 0, 0).applyQuaternion(camera.quaternion), -(w - w * f) / 2);
      e.barFg.material.color.setHex(f < 0.35 ? COL.white : (e.isEnemy ? COL.enemy : COL.light));
    }
    for (const r of rocks) if (!r.dead) r.ring.position.copy(r.pos);
    for (const e of list) if (e.shieldGlow !== undefined && e.shield) e.shield.material.opacity = Math.max(0, e.shieldGlow);
  }

  // ---------- Radar ----------
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
    const dot = (p, colour, size) => {
      v1.copy(p).applyQuaternion(qInv);
      const x = h + v1.x * scale, y = h + v1.z * scale, sy = -v1.y * scale * 0.5;
      rctx.strokeStyle = colour; rctx.globalAlpha = 0.45;
      rctx.beginPath(); rctx.moveTo(x, y); rctx.lineTo(x, y + sy); rctx.stroke();
      rctx.globalAlpha = 1; rctx.fillStyle = colour;
      rctx.fillRect(x - size / 2, y + sy - size / 2, size, size);
    };
    for (const r of rocks) if (!r.dead) dot(r.pos, '#7f99aa', 3);
    for (const hv of hives) if (!hv.dead) dot(hv.pos, '#8cff2e', 7);
    for (const e of enemies) if (!e.dead) dot(e.pos, '#8cff2e', e.type === 'destroyer' ? 4 : 3);
    for (const u of units) if (!u.dead) dot(u.pos, u.selected ? '#f088e9' : (u.type === 'harvester' ? '#ffffff' : '#34A9E3'), 3);
    if (alive(commander)) dot(commander.pos, '#f088e9', 6);
    // view direction wedge
    rctx.strokeStyle = '#34A9E3';
    rctx.beginPath(); rctx.moveTo(h, h); rctx.lineTo(h - 14, h - 26); rctx.moveTo(h, h); rctx.lineTo(h + 14, h - 26); rctx.stroke();
  }
  ui.radar.addEventListener('click', (e) => {
    // turn the view towards the clicked spot
    const r = ui.radar.getBoundingClientRect();
    const h = r.width / 2, scale = (h - 4) / (R + 10);
    const lx = (e.clientX - r.left - h) / scale, lz = (e.clientY - r.top - h) / scale;
    const p = new THREE.Vector3(lx, 0, lz).applyQuaternion(camera.quaternion);
    if (p.length() > 5) lookTowards(p);
  });

  // ---------- Game flow ----------
  function clearWorld() {
    for (const list of [units, enemies, hives]) { for (const e of list) e.remove(); list.length = 0; }
    for (const r of rocks) { scene.remove(r.mesh); scene.remove(r.ring); }
    rocks.length = 0;
    if (commander) commander.remove();
    fx.clear();
    selection = [];
    for (const k in groups) delete groups[k];
    rallyMarker.visible = false;
  }

  function newWorld() {
    clearWorld();
    state = { resources: 400, mined: 0, wave: 0, nextWave: FIRST_WAVE, kills: 0, running: false, started: false, over: false, time: 0, up: { weapons: 0, armour: 0, mining: 0 } };
    commander = new Commander();
    // enemy hives spread out at the edge of the sphere
    const dirs = [];
    while (dirs.length < HIVES) {
      const d = randDir();
      if (Math.abs(d.y) > 0.7) continue;
      if (dirs.every((o) => o.angleTo(d) > 1.6)) dirs.push(d);
      if (dirs.length < HIVES && Math.random() < 0.002) dirs.length = 0;
    }
    dirs.forEach((d) => new Hive(d.multiplyScalar(R - 12)));
    // comets on tilted orbits and asteroid fields away from the hives
    for (let i = 0; i < 7; i++) new Rock('comet');
    let fields = 0;
    while (fields < 4) {
      const d = randDir();
      if (dirs.some((h) => h.clone().normalize().angleTo(d) < 0.8)) continue;
      const c = d.multiplyScalar(rand(28, 52));
      for (let i = 0; i < 4; i++) new Rock('asteroid', c.clone().add(randDir().multiplyScalar(rand(3, 8))));
      fields++;
    }
  }

  function startGame() {
    audio.init();
    newWorld();
    state.running = true; state.started = true;
    // starting fleet
    new Unit('harvester', new THREE.Vector3(14, 2, 4));
    new Unit('harvester', new THREE.Vector3(-14, -2, 4));
    for (let i = 0; i < 3; i++) new Unit('fighter', new THREE.Vector3(rand(-8, 8), 7, 16 + i * 3));
    resetCamera();
    ui.overlay.style.display = 'none';
    document.body.classList.add('playing');
    ui.pause.textContent = 'Pause';
    say('announce_start', 0, true);
    flash('Harvesters mine on their own. Build a fleet and destroy the 3 enemy hives (green on the radar).');
  }

  function endGame(won) {
    if (state.over) return;
    state.over = true;
    state.running = false;
    say(won ? 'announce_victory' : 'announce_defeat', 0, true);
    ui.overlayTitle.textContent = won ? 'Victory' : 'The Commander has fallen';
    const mins = Math.floor(state.time / 60), secs = Math.round(state.time % 60);
    ui.overlayText.textContent = (won ? 'All enemy hives destroyed' : 'You lasted ' + mins + 'm ' + secs + 's and destroyed ' + (HIVES - hives.filter(alive).length) + ' of ' + HIVES + ' hives') +
      '. Kills: ' + state.kills + '. Ore mined: ' + Math.round(state.mined) + (won ? '. Time: ' + mins + 'm ' + secs + 's.' : '.');
    ui.start.textContent = 'Play again';
    document.getElementById('help').style.display = 'none';
    setTimeout(() => { ui.overlay.style.display = 'flex'; document.body.classList.remove('playing'); }, 1500);
  }

  function step(dt) {
    state.time += dt;
    state.nextWave -= dt;
    if (state.nextWave <= 0) spawnWave();

    for (const r of rocks) if (!r.dead) r.update(dt);
    commander.update(dt);
    for (const h of hives) if (!h.dead) h.update(dt);
    for (const u of units) if (!u.dead) u.update(dt);
    for (const e of enemies) if (!e.dead) e.update(dt);

    // keep ships from overlapping (and out of the carrier)
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

    // tidy up
    for (const list of [units, enemies, hives]) for (let i = list.length - 1; i >= 0; i--) if (list[i].dead) list.splice(i, 1);
    for (let i = rocks.length - 1; i >= 0; i--) if (rocks[i].dead) rocks.splice(i, 1);
    if (!state.over && hives.length === 0) endGame(true);
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
      placeCamera();
      if (camTween.t >= 1) camTween = null;
    }
    if (state.running) {
      step(dt);
      fx.update(dt);
    } else if (!state.started) {
      rotateCamera(dt * 0.05, 0);       // slow turn behind the title screen
      for (const r of rocks) r.update(dt);
      for (const h of hives) h.update(0);
      fx.update(dt);
    } else if (state.over) fx.update(dt);
    for (const e of units.concat(enemies, hives, [commander])) if (e && e.shieldGlow > 0) e.shieldGlow -= dt;
    if (markerLife > 0) { markerLife -= dt; markerSprite.material.opacity = Math.max(0, markerLife / 0.7); markerSprite.scale.setScalar(3 + (0.7 - markerLife) * 6); if (markerLife <= 0) markerSprite.visible = false; }
    if (msgTimer > 0 && state.running) { msgTimer -= dt; if (msgTimer <= 0) ui.message.style.display = 'none'; }
    updateBars();
    updateHUD();
    drawRadar();
    renderer.render(scene, camera);
  }

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // Show the world behind the title screen
  newWorld();
  $('loading').style.display = 'none';
  requestAnimationFrame(frame);

  // For the browser console
  window.cometAndCommander = {
    get state() { return state; }, units: units, enemies: enemies, hives: hives, rocks: rocks,
    get commander() { return commander; }, get selection() { return selection; },
    queueUnit: queueUnit, queueUpgrade: queueUpgrade, select: select, command: command, step: step, spawnWave: spawnWave,
    startGame: startGame, toScreen: toScreen, camera: camera, cam: cam, placeCamera: placeCamera, lookTowards: lookTowards,
    Unit: Unit, Enemy: Enemy, fx: fx, renderer: renderer, scene: scene
  };
})(window.CC);

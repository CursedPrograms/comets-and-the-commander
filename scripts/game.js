// Comets and the Commander - a 3D space RTS (three.js r128)
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
    fighter:   { name: 'Fighter',   cost: { s: 60, f: 15 },  build: 4, hp: 80,  dmg: 7,  range: 16, rate: 0.35, speed: 16, accel: 3,   turn: 5,   aggro: 30, bolt: 70, heavy: false },
    cruiser:   { name: 'Cruiser',   cost: { s: 160, f: 50 }, build: 9, hp: 400, dmg: 22, range: 24, rate: 0.9,  speed: 7,  accel: 1.2, turn: 1.4, aggro: 32, bolt: 50, heavy: true },
    harvester: { name: 'Steel harvester', res: 's', cost: { s: 60, f: 10 },  build: 4, hp: 120, dmg: 0,  range: 0,  rate: 0,    speed: 10, accel: 2,   turn: 3,   aggro: 0, cargo: 50, mine: 10 },
    // the very special one (needs a Tech Centre): a lance whose hits splash round the target
    dreadnought: { name: 'Dreadnought', cost: { s: 900, f: 400, a: 150 }, build: 30, hp: 3200, dmg: 46, range: 36, rate: 1.1, speed: 5, accel: 0.8, turn: 0.8, aggro: 40, bolt: 55, heavy: true, tech: true, max: 3 },
    // takes over a nest (needs a Tech Centre): fly it to a nest, it locks on and the nest becomes yours
    captor:    { name: 'Usurper',   cost: { s: 350, f: 150, a: 60 }, build: 14, hp: 500, dmg: 0, range: 0, rate: 0, speed: 9, accel: 1.6, turn: 2, aggro: 0, tech: true },
    // built by a captured nest for you, in its faction's shape
    turncoat:  { name: 'Turncoat',  cost: {}, build: 0, hp: 110, dmg: 8, range: 16, rate: 0.45, speed: 14, accel: 2.6, turn: 4, aggro: 34, bolt: 60, heavy: false }
  };
  // the Pathfinder: a scout you can fly yourself (T), outside the sphere too, burning fuel out there; it plants
  // black holes (Space while flying) that pull in and swallow enemy ships for 20 seconds
  // a harvester for each resource: meteorites (steel), comets (water), green meteorites (fuel)
  UNIT.hwater = Object.assign({}, UNIT.harvester, { name: 'Water harvester', res: 'w', model: 'harvester' });
  UNIT.hfuel = Object.assign({}, UNIT.harvester, { name: 'Fuel harvester', res: 'f', model: 'harvester' });
  UNIT.halu = Object.assign({}, UNIT.harvester, { name: 'Aluminium harvester', res: 'a', model: 'harvester', cost: { s: 120, f: 40 } });
  const RES_COLOUR = { s: 0xbfb2a6, w: 0x34a9e3, f: 0x39ff6a, a: 0xeaf7ff };
  function isH(t) { return !!(UNIT[t] && UNIT[t].res); }
  function voiceOf(t) { return isH(t) ? 'harvester' : (t === 'fighter' || t === 'cruiser' ? t : 'cruiser'); }
  UNIT.pathfinder = { name: 'Pathfinder', cost: { s: 250, f: 120 }, build: 12, hp: 600, dmg: 9, range: 22, rate: 0.3, speed: 20, accel: 3, turn: 3, aggro: 30, bolt: 80, heavy: false, max: 1 };
  const PILOT = { thrust: 34, max: 46, boost: 1.8, turn: 1.9, fuelOut: 2.5 };     // fuel a second, outside the sphere
  const HARVEST_AREA = 22;   // a harvester's area: the rocks this close to where it's mining (a field is ~16 across)
  const HOLE = { cost: { f: 250 }, life: 20, pull: 38, horizon: 4.5, strength: 26, max: 3 };
  const CAP = { warships: 250, harvesters: 20, enemies: 100, overlord: 250, queue: 20 };   // a faction's ships at once: 250 with an Overlord, else 100
  const ENEMY = {
    light:    { hp: 50,   dmg: 5,  range: 14, rate: 0.7, speed: 12, accel: 2.5, turn: 4,   bolt: 55 },
    heavy:    { hp: 380,  dmg: 18, range: 22, rate: 1.3, speed: 5,  accel: 1,   turn: 1.2, bolt: 45 },
    bomber:   { hp: 220,  dmg: 42, range: 12, rate: 2.4, speed: 7,  accel: 1.4, turn: 1.6, bolt: 35 },   // goes for your buildings
    flagship: { hp: 2600, dmg: 34, range: 30, rate: 1.1, speed: 4,  accel: 0.8, turn: 0.8, bolt: 45 },   // each faction's very special ship
    miner:    { hp: 140,  dmg: 0,  range: 0,  rate: 9,   speed: 9,  accel: 2,   turn: 3,   bolt: 0 },    // an Overlord's harvester
    turret:   { hp: 600,  dmg: 14, range: 30, rate: 0.8, speed: 0,  accel: 0,   turn: 0,   bolt: 55 }    // static, round the spires
  };
  // research needs a Tech Centre; the Commander's own upgrades don't
  const UPGRADES = {
    weapons:   { name: 'Weapons',   costs: [{ s: 150, w: 150 }, { s: 300, w: 300 }, { s: 500, w: 500 }], build: 12, tech: true },
    hulls:     { name: 'Hulls',     costs: [{ s: 150, w: 150 }, { s: 300, w: 300 }, { s: 500, w: 500 }], build: 12, tech: true },
    mining:    { name: 'Mining',    costs: [{ s: 100, w: 150 }, { s: 200, w: 300 }, { s: 350, w: 500 }], build: 10, tech: true },
    logistics: { name: 'Logistics', costs: [{ s: 150, w: 150 }, { s: 300, w: 300 }, { s: 450, w: 500 }], build: 10, tech: true },
    armour:    { name: 'Armour',    costs: [{ s: 250 }, { s: 500 }, { s: 900 }], build: 12 },                    // Commander hull +25% a level
    guns:      { name: 'Guns',      costs: [{ s: 150, f: 100 }, { s: 300, f: 200 }, { s: 550, f: 350 }], build: 12 },   // Commander guns +30% a level
    tractor:   { name: 'Tractor',   costs: [{ s: 500, f: 300 }], build: 20 }                                    // your buildings travel with the Commander
  };
  // buildings float where they're built; solar plants power the rest (power: + makes, - uses)
  const BUILDINGS = {
    solar:    { name: 'Solar plant',  cost: { s: 120, w: 40 }, build: 8,  hp: 900,  power: 100, model: 'solar' },
    refinery: { name: 'Refinery',     cost: { s: 250, w: 80 }, build: 12, hp: 1400, power: -40, model: 'refinery' },
    tech:     { name: 'Tech Centre',  cost: { s: 300, w: 200, a: 100 }, build: 18, hp: 1200, power: -60, model: 'tech' },
    turret:   { name: 'Defence turret', cost: { s: 160, w: 40 }, build: 8, hp: 800, power: -20, model: 'turretPlatform' },
    shipyard: { name: 'Shipyard',     cost: { s: 320, w: 120 }, build: 15, hp: 1500, power: -50, model: 'shipyard' },
    repair:   { name: 'Repair dock',  cost: { s: 180, w: 80 }, build: 10, hp: 1000, power: -30, model: 'repairDock' },
    // the special refinery: aluminium can only be unloaded and processed here
    smelter:  { name: 'Smelter',      cost: { s: 300, w: 150 }, build: 14, hp: 1300, power: -50, model: 'refinery' }
  };
  const OUTPOST_R = 55;            // a captured nest's own sphere
  const BUILD_R = 50;              // every building's own sphere: your ships can fight there
  const LINK = 120;                // buildings this close are one network (their power lines reach)
  // a colony (a network the Commander has left) brings in resources slowly: per building a second
  const COLONY = { s: 0.5, w: 0.3, refinery: 1.2, f: 0.06 };
  const NESTS_PER_SECTOR = [1, 1, 1, 2, 2, 2, 2, 3, 3, 3];
  const RIVAL_LEVELS = [2, 4, 6, 8, 9];   // sectors with an Overlord: an enemy commander who plays like you
  const BOUNTY = { light: 12, heavy: 45, hive: 250, bomber: 30, flagship: 600, miner: 20, turret: 60, rival: 1500 };
  // Waves: sooner, more often and bigger as the game goes on; every fifth is a big one. Each wave also sends raiders
  // in from the edge of your sphere, from any direction, so waves come even when the hives are far away.
  const WAVES = { first: 45, firstLater: 45, gap: 50, gapPerLevel: 1.5, minGap: 34, big: 5 };   // small and soon, growing evenly
  // Raids: the other sectors' factions send waves too, wherever you are. They come in at the edge of your sphere
  // from the side their sector lies on; the more of the game that's gone by, the bigger and more often.
  const RAIDS = { first: 360, gap: [100, 150], minGap: 70 };
  const STRIKE = { first: [70, 110], gap: [45, 90], speed: 46, warn: 3.5, radius: 3.2, shipDamage: 0.7, bigDamage: 0.2 };
  const BEHAVIOURS = ['swarm', 'orbit', 'harass', 'ram', 'snipe', 'regen', 'heal', 'split', 'shield'];

  // ---------- DOM ----------
  const $ = (id) => document.getElementById(id);
  const ui = {
    container: $('game-container'), resources: $('resources'), sector: $('sector'), wave: $('wave'), base: $('base-hp'),
    units: $('unit-count'), power: $('power'), selected: $('selected-info'), queue: $('queue'), queueBar: $('queue-bar'),
    bqueue: $('bqueue'), bqueueBar: $('bqueue-bar'), uqueue: $('uqueue'), uqueueBar: $('uqueue-bar'), message: $('message'),
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

  // The area spheres (the Commander's, every building's, every captured nest's) are drawn as one shape: each skips
  // the parts of its wireframe that lie inside another sphere, so where spheres overlap only the outer skin shows,
  // and a sphere wholly inside another isn't drawn at all. updateSphereUnion() passes them all to the shader.
  const SPHERES_MAX = 48;
  const sphereUnion = { uSpheres: { value: Array.from({ length: SPHERES_MAX }, () => new THREE.Vector4()) }, uSphereCount: { value: 0 } };
  const unionMeshes = [];
  function unionSphere(mesh) {
    mesh.material.onBeforeCompile = (sh) => {
      sh.uniforms.uSpheres = sphereUnion.uSpheres;
      sh.uniforms.uSphereCount = sphereUnion.uSphereCount;
      sh.vertexShader = 'varying vec3 vUnionPos;\n' + sh.vertexShader.replace('#include <begin_vertex>',
        '#include <begin_vertex>\n  vUnionPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      sh.fragmentShader = 'varying vec3 vUnionPos;\nuniform vec4 uSpheres[' + SPHERES_MAX + '];\nuniform int uSphereCount;\n' +
        sh.fragmentShader.replace('void main() {', 'void main() {\n  for (int i = 0; i < ' + SPHERES_MAX + '; i++) {\n' +
          '    if (i >= uSphereCount) break;\n' +
          '    if (distance(vUnionPos, uSpheres[i].xyz) < uSpheres[i].w * 0.995) discard;   // inside another sphere\n  }');
    };
    unionMeshes.push(mesh);
    return mesh;
  }
  function updateSphereUnion() {
    let n = 0;
    for (let i = unionMeshes.length - 1; i >= 0; i--) {
      const m = unionMeshes[i];
      if (!m.parent) { unionMeshes.splice(i, 1); continue; }       // its building or nest is gone
      if (!m.visible || n >= SPHERES_MAX) continue;
      sphereUnion.uSpheres.value[n++].set(m.position.x, m.position.y, m.position.z, m.geometry.parameters.radius * m.scale.x);
    }
    sphereUnion.uSphereCount.value = n;
  }

  // faint sphere showing the battle area around the Commander
  const edge = unionSphere(new THREE.Mesh(new THREE.SphereGeometry(R, 32, 16), new THREE.MeshBasicMaterial({ color: COL.dark, wireframe: true, transparent: true, opacity: 0.1, depthWrite: false })));
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
  const buildings = [], outposts = [], rivals = [], nests = [], enemyBuildings = [], holes = [];
  let pilot = null;                 // the Pathfinder while you fly it (third person)
  let sectors = [];
  let focus = null;                 // the sphere the view is on: null = the Commander's, or a captured nest
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
      this.queue = [];               // ships
      this.progress = 0;
      this.bqueue = [];              // buildings, at the same time as the ships
      this.bprogress = 0;
      this.uqueue = [];              // research and upgrades, at the same time again
      this.uprogress = 0;
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
      if (this.bqueue.length) {
        const item = this.bqueue[0];
        this.bprogress += dt;
        if (this.bprogress >= item.time) { this.bqueue.shift(); this.bprogress = 0; finishItem(item); }
      }
      if (this.uqueue.length) {
        const item = this.uqueue[0];
        // research is slower short of power
        this.uprogress += dt * (UPGRADES[item.type].tech ? Math.max(0.25, power().ratio) : 1);
        if (this.uprogress >= item.time) { this.uqueue.shift(); this.uprogress = 0; finishItem(item); }
      }
      if (this.queue.length) {
        const item = this.queue[0];
        // research is slower short of power; ships quicker with shipyards
        this.progress += dt * (item.kind === 'upgrade' && UPGRADES[item.type].tech ? Math.max(0.25, power().ratio) : item.kind === 'unit' ? buildSpeed() : 1);
        if (this.progress >= item.time) { this.queue.shift(); this.progress = 0; finishItem(item); }
      }
      this.cooldown -= dt;
      const threat = nearest(hostiles(), this.pos, 43);
      if (threat) for (const t of this.turrets) t.lookAt(threat.pos);
      if (threat && this.cooldown <= 0) {
        this.cooldown = 0.5 / (1 + 0.15 * state.up.guns);
        const t = this.turrets[Math.floor(Math.random() * this.turrets.length)];
        this.shoot(threat, 14 * dmgMult() * (1 + 0.3 * state.up.guns), COL.pink, 60, true, t.getWorldPosition(v2));
      }
      for (const u of units) {
        if (u.hp < u.maxHp && d2(u.pos, this.pos) < 30 * 30) {
          u.hp = Math.min(u.maxHp, u.hp + 6 * dt);
          if (Math.random() < dt * 2) fx.line(this.pos, u.pos, COL.light);
        }
      }
      if (state.time - this.lastHit > 10) this.hp = Math.min(this.maxHp, this.hp + 1.5 * dt);
    }
  }

  // Your ships fight only inside the battle sphere round the Commander (R): no orders to attack or fly beyond it,
  // and a ship that ends up outside it comes back.
  function inSphere(p, extra) {
    const r = R + (extra || 0);
    if (commander && d2(p, commander.pos) <= r * r) return true;
    for (const o of outposts) if (!o.dead && d2(p, o.pos) <= (OUTPOST_R + (extra || 0)) * (OUTPOST_R + (extra || 0))) return true;
    const rb = BUILD_R + (extra || 0);
    for (const b of buildings) if (!b.dead && d2(p, b.pos) <= rb * rb) return true;
    return false;
  }
  // into the nearest sphere of yours (the Commander's unless a building's or a nest's is nearer)
  function intoAnySphere(p) {
    if (inSphere(p)) return p;
    let best = commander, bd = d2(p, commander.pos), r = R;
    for (const b of buildings) if (!b.dead && d2(p, b.pos) < bd) { best = b; bd = d2(p, b.pos); r = BUILD_R; }
    for (const o of outposts) if (!o.dead && d2(p, o.pos) < bd) { best = o; bd = d2(p, o.pos); r = OUTPOST_R; }
    if (bd > r * 0.9 * r * 0.9) p.sub(best.pos).setLength(r * 0.9).add(best.pos);
    return p;
  }

  // ---------- networks: buildings linked by their power lines; the ones the Commander has left are colonies ----------
  let networks = [], netAt = -1;
  function updateNetworks() {
    const list = buildings.filter(alive);
    const parent = list.map((_, i) => i);
    const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
    for (let i = 0; i < list.length; i++)
      for (let j = i + 1; j < list.length; j++)
        if (d2(list[i].pos, list[j].pos) < LINK * LINK) parent[find(i)] = find(j);
    const groups = {};
    list.forEach((b, i) => { (groups[find(i)] = groups[find(i)] || []).push(b); });
    const before = networks.filter((n) => n.colony).length;
    networks = Object.values(groups).map((bs) => {
      const c = new THREE.Vector3();
      for (const b of bs) c.add(b.pos);
      c.divideScalar(bs.length);
      const home = bs.some((b) => d2(b.pos, commander.pos) < (R + BUILD_R) * (R + BUILD_R));
      return { buildings: bs, centre: c, colony: !home, anchor: bs[0] };
    });
    const colonies = networks.filter((n) => n.colony).length;
    if (colonies > before && state.time > 2) {
      say('announce_sector', 0, true);
      flash('Your base stays behind as a colony: its own sphere, its own network, and it brings in resources slowly. Spheres (J) jumps to it; send ships there to guard it.');
    }
  }
  function colonyIncome(dt) {
    for (const n of networks) {
      if (!n.colony) continue;
      const p = power().ratio;
      for (const b of n.buildings) {
        if (b.dead) continue;
        const k = b.kind === 'refinery' ? COLONY.refinery : 1;
        state.steel += COLONY.s * k * dt * p; state.water += COLONY.w * k * dt * p;
        if (b.kind === 'refinery') state.fuel += COLONY.f * 4 * dt * p;
      }
    }
  }
  // a power spark from a to b: whatever of `list` it passes through (within 3) takes damage
  const segTmp = new THREE.Vector3(), segTmp2 = new THREE.Vector3();
  function zapHurt(a, b, list, dmg, from) {
    segTmp.subVectors(b, a);
    const len2 = Math.max(1e-6, segTmp.lengthSq());
    for (const e of list) {
      if (e.dead) continue;
      const t = Math.max(0, Math.min(1, segTmp2.subVectors(e.pos, a).dot(segTmp) / len2));
      segTmp2.copy(a).addScaledVector(segTmp, t);
      const r = 3 + (e.radius || 1);
      if (d2(segTmp2, e.pos) < r * r) { e.hurt(dmg, from); fx.spark(e.pos.clone(), 0xffc977, 2.2); }
    }
  }

  // everything of yours the enemy can shoot at, and everything of theirs you can
  function playerTargets() { return units.concat(buildings, outposts); }
  function hostiles() { return enemies.concat(hives, rivals, enemyBuildings); }
  function intoSphere(p, centre) {
    const c = centre || commander.pos;
    if (d2(p, c) > R * 0.9 * R * 0.9) p.sub(c).setLength(R * 0.9).add(c);
    return p;
  }
  function inReach(list, p, maxDist) { return nearest(list.filter((e) => inSphere(e.pos, e.radius || 0)), p, maxDist); }

  function orbitPoint(centre, axis, r, a) {
    const u = new THREE.Vector3(1, 0, 0).cross(axis);
    if (u.lengthSq() < 0.01) u.set(0, 1, 0).cross(axis);
    u.normalize();
    const w = new THREE.Vector3().crossVectors(axis, u);
    return centre.clone().addScaledVector(u, Math.cos(a) * r).addScaledVector(w, Math.sin(a) * r);
  }

  class Unit extends Entity {
    // opts: { model, home (a captured nest it guards), faction } for ships a nest builds
    constructor(type, pos, opts) {
      opts = opts || {};
      const t = UNIT[type];
      super(opts.model || models[t.model || type](), Math.round(t.hp * hullMult()), 'player');
      if (t.res) this.mesh.add(models.glowSprite(RES_COLOUR[t.res], 4, 0.7));
      this.type = type; this.t = t; this.name = t.name;
      this.home = opts.home || null;
      if (opts.faction) { this.name = opts.faction.name + ' turncoat'; this.boltColour = opts.faction.glow; this.faction = opts.faction; }
      this.order = null;
      this.cargo = 0;
      this.hstate = 'seek';
      this.rock = null;
      this.capture = 0;
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
      if (this === pilot) stopPiloting('The Pathfinder is lost.');
      say('announce_ship_lost', 10);
    }
    hurt(amount, from) {
      super.hurt(amount, from);
      if (!this.dead && from && from.isEnemy) say('announce_under_attack', 30);
      if (!this.dead && from && !from.dead && from.isEnemy && this.t.dmg > 0 && !this.order) this.order = { kind: 'attack', target: from, auto: true };
    }
    // where it belongs: a nest's turncoats stay with their nest, everything else with the Commander
    get base() { return this.home && alive(this.home) ? this.home : (this.post && alive(this.post) ? this.post : commander); }
    update(dt) {
      this.cooldown -= dt;
      if (this === pilot) this.updatePilot(dt);
      else if (isH(this.type)) this.updateHarvester(dt);
      else if (this.type === 'captor') this.updateCaptor(dt);
      else this.updateCombat(dt);
      this.drawEngines();
    }
    // you fly it: W/S thrust and brake, A/D turn, the arrow keys pitch (and turn), Shift boosts. Its guns fire at
    // whatever is ahead. Outside every sphere of yours it burns fuel; with none left you lose the controls.
    updatePilot(dt) {
      const k = keys, boost = k.shift ? PILOT.boost : 1;
      const yaw = ((k.a ? 1 : 0) - (k.d ? 1 : 0) + (k.arrowleft ? 1 : 0) - (k.arrowright ? 1 : 0)) * PILOT.turn * dt;
      const pitch = ((k.arrowdown ? 1 : 0) - (k.arrowup ? 1 : 0)) * PILOT.turn * dt;
      if (yaw) { qTmp.setFromAxisAngle(AX.y, yaw); this.mesh.quaternion.multiply(qTmp); }
      if (pitch) { qTmp.setFromAxisAngle(AX.x, pitch); this.mesh.quaternion.multiply(qTmp); }
      this.mesh.quaternion.normalize();
      const fwd = v2.set(0, 0, 1).applyQuaternion(this.mesh.quaternion);
      if (k.w) this.vel.addScaledVector(fwd, PILOT.thrust * boost * dt);
      if (k.s) this.vel.multiplyScalar(Math.max(0, 1 - 2.5 * dt));
      this.vel.multiplyScalar(1 - 0.35 * dt);                          // a little drag, so it settles
      const max = PILOT.max * boost;
      if (this.vel.length() > max) this.vel.setLength(max);
      this.pos.addScaledVector(this.vel, dt);
      if (this.pos.lengthSq() > WORLD_R * WORLD_R) this.pos.setLength(WORLD_R);
      if (!inSphere(this.pos)) {
        state.fuel = Math.max(0, state.fuel - PILOT.fuelOut * (k.shift && k.w ? 2 : 1) * dt);
        if (state.fuel <= 0) { stopPiloting('Out of fuel: the Pathfinder heads home.'); return; }   // (stopPiloting sends it home)
      }
      // guns: whatever's in front and in range
      const t = nearest(hostiles(), this.pos, this.t.range + 4);
      if (t && v1.subVectors(t.pos, this.pos).normalize().dot(fwd) > 0.3) this.fireAt(t);
    }
    updateCombat(dt) {
      const o = this.order, base = this.base;
      const free = this.type === 'pathfinder';          // the Pathfinder goes where it's sent, sphere or not
      if (free && !inSphere(this.pos, 4)) {
        state.fuel = Math.max(0, state.fuel - PILOT.fuelOut * 0.5 * dt);
        if (state.fuel <= 0 && !(o && o.home)) { this.order = { kind: 'move', point: commander.pos.clone().add(this.escort), home: true }; flash('The Pathfinder is out of fuel and heads home.'); }
      }
      // outside every sphere of yours (the Commander flew off, or a chase ran wide): back inside first
      if (!free && !inSphere(this.pos, 4) && !(o && o.kind === 'move' && inSphere(o.point))) {
        this.order = { kind: 'move', point: base.pos.clone().add(this.escort) };
        return;
      }
      if (o && o.kind === 'move') {
        if (this.steer(o.point, this.t.speed, dt, 1.5)) this.order = null;
        const e = inReach(hostiles(), this.pos, this.t.range + 6);
        if (e) this.fireAt(e);
        return;
      }
      let target = o && o.kind === 'attack' && alive(o.target) && (free || inSphere(o.target.pos, o.target.radius)) ? o.target : null;
      if (o && o.kind === 'attack' && !target) this.order = null;
      if (!target) {
        target = free ? nearest(hostiles(), this.pos, this.t.aggro)
                      : inReach(enemies, this.pos, this.t.aggro) || inReach(hives.concat(rivals, enemyBuildings), this.pos, this.t.aggro);
        if (target) this.order = { kind: 'attack', target: target, auto: true };
      }
      if (!target && free && !inSphere(this.pos)) { this.steer(this.pos, 0, dt, 99); return; }   // holds its position out there
      if (!target) {
        // idle: stay with its base as an escort
        if (d2(this.pos, base.pos) > 34 * 34) this.steer(base.pos.clone().add(this.escort), this.t.speed, dt, 3);
        else this.steer(this.pos, 0, dt, 99);
        return;
      }
      // automatic chases give up when they drag the ship far from its base
      if (o && o.auto && !free && d2(this.pos, base.pos) > 90 * 90) { this.order = { kind: 'move', point: base.pos.clone().add(this.escort) }; return; }
      const dist = Math.sqrt(d2(this.pos, target.pos));
      if (this.type === 'fighter' || this.type === 'turncoat' || this.type === 'pathfinder') {
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
      const colour = this.boltColour || (this.type === 'cruiser' || this.type === 'dreadnought' ? COL.pink : COL.light);
      if (this.type === 'dreadnought') {
        // the lance: the hit splashes half its damage on everything round the target
        const dmg = this.t.dmg * dmgMult(), me = this;
        sfx.laser('heavy');
        fx.bolt(from || this.pos.clone(), target, colour, this.t.bolt, true, (p) => {
          fx.explosion(p.clone(), 3, COL.pink);
          if (!target.dead) target.hurt(dmg, me);
          for (const e of enemies) if (!e.dead && e !== target && d2(e.pos, p) < 8 * 8) e.hurt(dmg * 0.5, me);
        });
        return;
      }
      this.shoot(target, this.t.dmg * dmgMult(), colour, this.t.bolt, this.t.heavy, from);
    }
    // the Usurper: to its nest, then a beam; the nest is yours after a while, sooner the weaker it is
    updateCaptor(dt) {
      const o = this.order;
      if (o && o.kind === 'move') { if (this.steer(o.point, this.t.speed, dt, 1.5)) this.order = null; this.capture = 0; return; }
      const nest = o && o.kind === 'capture' && alive(o.nest) ? o.nest : null;
      if (!nest) {
        this.order = null; this.capture = 0;
        if (d2(this.pos, commander.pos) > 30 * 30) this.steer(commander.pos.clone().add(this.escort), this.t.speed, dt, 3);
        else this.steer(this.pos, 0, dt, 99);
        return;
      }
      const reach = nest.radius + 6;
      if (d2(this.pos, nest.pos) > reach * reach) { this.steer(nest.pos, this.t.speed, dt, reach - 1); this.capture = 0; return; }
      this.steer(this.pos, 0, dt, 99);
      this.face(nest.pos, dt);
      const need = 6 + 12 * (nest.hp / nest.maxHp);       // 18 s at full strength, 6 s when beaten down
      this.capture += dt;
      if (Math.random() < dt * 10) fx.zap(this.pos, nest.pos, COL.pink);
      if (this.capture >= need) { nest.takeOver(); this.order = null; this.capture = 0; }
    }
    updateHarvester(dt) {
      const t = this.t;
      const cap = t.cargo * (1 + 0.25 * state.up.mining);
      const o = this.order;
      if (this.drill) this.drill.rotation.z += dt * (this.hstate === 'mine' ? 14 : 1);
      if (o && o.kind === 'move') { if (this.steer(o.point, t.speed, dt, 1.5)) this.order = null; return; }
      if (o && o.kind === 'harvest') { this.rock = o.rock; this.area = o.rock.pos.clone(); this.order = null; this.hstate = this.cargo >= cap ? 'return' : 'seek'; this.manual = true; }
      if (this.hstate === 'seek') {
        // A harvester works one area (the field it's mining) until every rock there of its kind is gone, then the
        // field nearest that area. A rock is in reach near the Commander or near one of its drop-offs (refineries,
        // or smelters for aluminium), so a field by a refinery is still worked after the Commander has moved on.
        const docks = buildings.filter((b) => !b.dead && b.kind === (t.res === 'a' ? 'smelter' : 'refinery'));
        const inReach = (r, k) => d2(r.pos, commander.pos) < k * k || docks.some((b) => d2(r.pos, b.pos) < k * k);
        if (!this.rock || this.rock.dead || (!this.manual && !inReach(this.rock, 160))) {
          this.rock = null; this.manual = false;
          const from = this.area || this.pos;
          let best = Infinity, bestArea = Infinity, inArea = null;
          for (const r of rocks) {
            if (r.dead || RES_OF_ROCK[r.kind] !== t.res || !inReach(r, 140)) continue;
            if (hives.some((h) => !h.dead && d2(h.pos, r.pos) < 55 * 55)) continue;     // not under an enemy hive's guns
            const d = d2(r.pos, from);
            if (this.area && d < HARVEST_AREA * HARVEST_AREA && d < bestArea) { bestArea = d; inArea = r; }
            if (d < best) { best = d; this.rock = r; }
          }
          if (inArea) this.rock = inArea;                 // the area isn't used up yet: stay
          if (this.rock) this.area = this.rock.pos.clone();
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
        const kind = t.res;
        this.cargoKind = kind;
        const take = Math.min(t.mine * (1 + 0.3 * state.up.mining) * dt, cap - this.cargo, this.rock.amount);
        this.cargo += take;
        this.rock.take(take);
        if (Math.random() < dt * 8) { fx.line(this.drill ? this.drill.getWorldPosition(v2) : this.pos, this.rock.pos, kind === 'f' ? 0x39ff6a : (kind === 'w' ? COL.light : COL.pink)); sfx.mine(); }
        if (this.cargo >= cap - 0.001) this.hstate = 'return';
      } else if (this.hstate === 'return') {
        // home to the nearest of the Commander and your refineries (a refinery adds a quarter, when it has power)
        let dock = t.res === 'a' ? null : commander, best = dock ? d2(this.pos, commander.pos) : Infinity;
        const accepts = t.res === 'a' ? 'smelter' : 'refinery';
        for (const b of buildings) if (!b.dead && b.kind === accepts && d2(this.pos, b.pos) < best) { best = d2(this.pos, b.pos); dock = b; }
        if (!dock) {
          // aluminium needs a smelter: it waits by the Commander, full, until there is one
          if (state.time - (state.smelterWarned || -99) > 40) { state.smelterWarned = state.time; flash('Aluminium needs a Smelter to unload (Base tab)'); }
          if (d2(this.pos, commander.pos) > 30 * 30) this.steer(commander.pos.clone().add(this.escort), t.speed, dt, 3); else this.steer(this.pos, 0, dt, 99);
          return;
        }
        if (this.steer(dock.pos, t.speed, dt, dock.radius + 3)) {
          const bonus = dock === commander || dock.kind === 'smelter' ? 1 : 1 + 0.25 * power().ratio;
          addRes(this.cargoKind || 's', Math.round(this.cargo * bonus));
          this.cargo = 0; this.cargoKind = null;
          this.hstate = 'seek';
          sfx.deposit();
        }
      }
    }
  }

  // An enemy ship. hive: what it belongs to (a spire, a nest or an Overlord; anything with .sector and .pos).
  // kinds: light, heavy, bomber (goes for your buildings), flagship (its faction's very special ship), miner (an
  // Overlord's harvester), turret (static, round a spire). opts: guard (stays by its hive), mini (a split-off).
  const SHAPE_OF = { light: 'light', heavy: 'heavy', bomber: 'heavy', flagship: 'heavy', miner: 'light', turret: 'heavy' };
  const SCALE_OF = { bomber: 0.75, flagship: 2.4, miner: 1.15, turret: 1.2 };
  class Enemy extends Entity {
    constructor(kind, pos, hive, opts) {
      opts = opts || {};
      const sector = hive.sector, f = sector.faction, t = ENEMY[kind];
      const model = models.factionShip(f, SHAPE_OF[kind]);
      const mult = (1 + 0.18 * sector.level + 0.1 * sector.wave) * (opts.mini ? 0.3 : 1) * (f.behaviour === 'swarm' && kind === 'light' ? 0.7 : 1);
      super(model, Math.round(t.hp * mult), 'enemy');
      this.sector = sector;
      sector.pop = (sector.pop || 0) + 1;
      this.faction = f;
      this.colour = f.glow;
      this.barFg.material.color.setHex(f.glow);
      this.kind = kind; this.type = kind; this.t = t;
      this.name = kind === 'flagship' ? f.special : f.name + (kind === 'light' ? '' : ' ' + ({ heavy: 'heavy', bomber: 'bomber', miner: 'miner', turret: 'turret' })[kind]);
      this.dmg = t.dmg * (1 + 0.1 * sector.level + 0.03 * sector.wave);
      this.behaviour = f.behaviour === 'mixed' ? BEHAVIOURS[Math.floor(Math.random() * BEHAVIOURS.length)] : f.behaviour;
      this.hive = hive; this.guard = !!opts.guard; this.mini = !!opts.mini;
      this.phase = Math.random() * Math.PI * 2;
      this.axis = randDirM();
      this.turrets = model.turrets;
      this.cargo = 0; this.mstate = 'seek'; this.rock = null; this.ability = 4;
      const sc = (SCALE_OF[kind] || 1) * (opts.mini ? 0.6 : 1);
      if (sc !== 1) { this.mesh.scale.setScalar(sc); this.radius *= sc; }
      if (kind === 'flagship') { this.mesh.add(models.glowSprite(f.glow, 14, 0.5)); }
      this.pos.copy(pos);
      enemies.push(this);
    }
    remove() {
      super.remove();
      if (!this.counted) { this.counted = true; this.sector.pop--; }
    }
    hurt(amount, from) {
      if (this.kind === 'flagship' && (this.behaviour === 'shield' || this.faction.behaviour === 'mixed')) amount *= this.behaviour === 'shield' ? 0.25 / 0.65 : 0.6;
      super.hurt(amount, from);
    }
    die(from) {
      super.die(from);
      deselect(this);
      addResources(this.mini ? 5 : BOUNTY[this.kind]);
      state.kills++;
      if (this.kind === 'flagship') {
        fx.explosion(this.pos.clone(), 9, this.colour);
        say('announce_hive_destroyed', 0, true);
        flash(this.name + ' destroyed! +' + BOUNTY.flagship + ' steel');
        if (this.behaviour === 'split') for (let i = 0; i < 3; i++) spawnEnemy('heavy', this.pos.clone().add(randDirM().multiplyScalar(5)), this.hive);
      }
      if (this.behaviour === 'split' && this.kind === 'light' && !this.mini) {
        for (let i = 0; i < 2; i++) new Enemy('light', this.pos.clone().add(randDirM().multiplyScalar(2)), this.hive, { mini: true });
      }
    }
    pickTarget() {
      if (this.guard && alive(this.hive)) {
        // guards defend everything round their hive
        const r = this.hive.nest ? 45 : 60;
        let t = nearest(playerTargets(), this.hive.pos, r);
        if (!t && d2(commander.pos, this.hive.pos) < r * r) t = commander;
        return t;
      }
      if (this.kind === 'bomber') {
        const b = nearest(buildings.concat(outposts), this.pos, 260);
        if (b) return b;
      }
      if (this.behaviour === 'harass') {
        const h = nearest(units.filter((u) => isH(u.type)), this.pos, 160);
        if (h) return h;
      }
      return nearest(playerTargets(), this.pos, 30) || commander;
    }
    // a faction's flagship: its own trick on a timer (and some all the time)
    flagshipAbility(dt) {
      const b = this.faction.behaviour, mixed = b === 'mixed';
      this.ability -= dt;
      if (b === 'regen' || mixed) this.hp = Math.min(this.maxHp, this.hp + this.maxHp * 0.02 * dt);
      if (b === 'heal' || mixed) {
        for (const e of enemies) if (!e.dead && e !== this && e.hp < e.maxHp && d2(e.pos, this.pos) < 30 * 30) e.hp = Math.min(e.maxHp, e.hp + 20 * dt);
        if (Math.random() < dt * 3) { const a = enemies[Math.floor(Math.random() * enemies.length)]; if (a && !a.dead && d2(a.pos, this.pos) < 900) fx.line(this.pos, a.pos, this.colour); }
      }
      if (b === 'harass' || mixed) for (const u of units) if (!u.dead && d2(u.pos, this.pos) < 22 * 22) u.vel.multiplyScalar(1 - dt * 3);
      if (this.ability > 0) return;
      this.ability = 8;
      // the timed tricks only while it's fighting: what it launches fights beside it (guards when it's a guard)
      if (!alive(this.pickTarget())) return;
      if (b === 'swarm' || b === 'orbit' || mixed) for (let i = 0; i < 3; i++) spawnEnemy('light', this.pos.clone().add(randDirM().multiplyScalar(this.radius + 2)), this.hive, { guard: this.guard });
      if (b === 'snipe' || mixed) {
        const t = nearest(playerTargets().concat([commander]), this.pos, 75);
        if (t) this.shoot(t, this.dmg * 2.5, this.colour, 90, true);
      }
    }
    update(dt) {
      this.cooldown -= dt;
      if (this.kind === 'miner') { this.updateMiner(dt); this.drawEngines(); return; }
      if (this.kind === 'flagship') this.flagshipAbility(dt);
      if (this.behaviour === 'regen' && state.time - this.lastHit > 3) this.hp = Math.min(this.maxHp, this.hp + this.maxHp * 0.03 * dt);
      if (this.behaviour === 'heal' && this.kind === 'heavy' && Math.random() < dt * 2) {
        const ally = enemies.find((e) => e !== this && !e.dead && e.hp < e.maxHp && d2(e.pos, this.pos) < 22 * 22);
        if (ally) { ally.hp = Math.min(ally.maxHp, ally.hp + 12); fx.line(this.pos, ally.pos, this.colour); }
      }
      if (this.kind === 'turret') {
        // static: turns and fires, never moves
        const t = nearest(playerTargets(), this.pos, this.t.range) || (d2(commander.pos, this.pos) < Math.pow(this.t.range + commander.radius, 2) ? commander : null);
        this.mesh.rotation.y += dt * 0.3;
        if (t && this.cooldown <= 0) { this.cooldown = this.t.rate; this.shoot(t, this.dmg, this.colour, this.t.bolt, true); }
        return;
      }
      const target = this.pickTarget();
      if (!alive(target)) {
        if (alive(this.hive)) this.steer(orbitPoint(this.hive.pos, this.axis, (this.hive.radius || 7) + 10, state.time * 0.4 + this.phase), this.t.speed * 0.6, dt, 0, true);
        else this.steer(this.pos, 0, dt, 99);
        this.drawEngines();
        return;
      }
      const dist = Math.sqrt(d2(this.pos, target.pos));
      const snipe = this.behaviour === 'snipe';
      const range = this.t.range * (snipe ? 1.7 : 1);
      if ((this.behaviour === 'ram' && this.kind === 'light') || (this.kind === 'flagship' && this.faction.behaviour === 'ram')) {
        this.steer(target.pos, this.t.speed * (this.kind === 'flagship' ? 2.2 : 1.3), dt, 0, true);
        if (dist < target.radius + this.radius) {
          fx.explosion(this.pos.clone(), 3, this.colour);
          sfx.explosion(false);
          if (this.kind === 'flagship') {
            // the Bloodhammer rams, then backs off to charge again
            if (this.cooldown <= 0) { target.hurt(400, this); this.cooldown = 6; this.vel.multiplyScalar(-1.5); }
          } else {
            target.hurt(this.dmg * 5, this);
            this.dead = true; this.remove(); deselect(this); state.kills++;
            return;
          }
        }
        this.drawEngines();
        if (this.kind !== 'flagship') return;
      } else if (this.kind === 'light' && !snipe) {
        this.steer(orbitPoint(target.pos, this.axis, target.radius + 6, state.time * 1.1 + this.phase), this.t.speed, dt, 0, true);
      } else {
        const keep = range * (snipe ? 0.9 : 0.75) + target.radius;
        if (dist > keep) this.steer(target.pos, this.t.speed * (this.kind === 'flagship' && this.faction.behaviour === 'orbit' ? 3 : 1), dt, keep);
        else if (snipe && dist < keep * 0.7) this.steer(this.pos.clone().multiplyScalar(2).sub(target.pos), this.t.speed, dt, 0, true);
        else { this.steer(this.pos, 0, dt, 99); this.face(target.pos, dt * 0.5); }
        for (const t of this.turrets) t.lookAt(target.pos);
      }
      if (dist <= range + target.radius && this.cooldown <= 0) {
        this.cooldown = this.t.rate * (0.9 + Math.random() * 0.25);
        const from = this.turrets.length ? this.turrets[Math.floor(Math.random() * this.turrets.length)].getWorldPosition(new THREE.Vector3()) : null;
        this.shoot(target, this.dmg, this.colour, this.t.bolt, this.kind !== 'light' || snipe, from);
      }
      this.drawEngines();
    }
    // an Overlord's miner: rocks near its Overlord, ore home to it
    updateMiner(dt) {
      const home = this.hive;
      if (!alive(home)) { this.steer(this.pos, 0, dt, 99); return; }
      if (this.mstate === 'seek') {
        if (!this.rock || this.rock.dead) {
          this.rock = null;
          let best = Infinity;
          for (const r of rocks) {
            if (r.dead || d2(r.pos, home.pos) > 130 * 130) continue;
            const d = d2(r.pos, this.pos);
            if (d < best) { best = d; this.rock = r; }
          }
        }
        if (!this.rock) { this.steer(orbitPoint(home.pos, this.axis, 20, state.time * 0.3 + this.phase), this.t.speed * 0.5, dt, 0, true); return; }
        if (this.steer(this.rock.pos, this.t.speed, dt, this.rock.radius + 2.5)) this.mstate = 'mine';
      } else if (this.mstate === 'mine') {
        if (!this.rock || this.rock.dead) { this.mstate = this.cargo > 0 ? 'return' : 'seek'; return; }
        this.steer(this.rock.pos, this.t.speed, dt, this.rock.radius + 2.5);
        const take = Math.min(9 * dt, 50 - this.cargo, this.rock.amount);
        this.cargo += take; this.rock.take(take);
        if (Math.random() < dt * 5) fx.line(this.pos, this.rock.pos, this.colour);
        if (this.cargo >= 49.9) this.mstate = 'return';
      } else {
        let dock = home, best = d2(this.pos, home.pos);
        for (const b of enemyBuildings) if (!b.dead && b.owner === home && b.kind === 'refinery' && d2(this.pos, b.pos) < best) { best = d2(this.pos, b.pos); dock = b; }
        if (this.steer(dock.pos, this.t.speed, dt, dock.radius + 3)) {
          home.ore += this.cargo * (dock === home ? 1 : 1.25); this.cargo = 0; this.mstate = 'seek';
        }
      }
    }
  }

  // every enemy spawn goes through here: a faction with an Overlord has up to 250 ships at once, the others 100
  function spawnEnemy(kind, pos, hive, opts) {
    const cap = RIVAL_LEVELS.indexOf(hive.sector.level) >= 0 ? CAP.overlord : CAP.enemies;
    if ((hive.sector.pop || 0) >= cap) return null;
    return new Enemy(kind, pos, hive, opts);
  }

  // A hive: a spire (destroy it) or a nest (it can't be destroyed: capture it with a Usurper).
  // Spires keep a garrison that grows even while you're away, static turrets round them, and the sector's
  // first spire launches the faction's flagship.
  class Hive extends Entity {
    constructor(sector, pos, hp, nest) {
      super(models.hive(sector.faction, nest ? 'nest' : 'spire'), Math.round((1800 + 350 * sector.level) * (nest ? 1.3 : 1)), 'enemy');
      this.sector = sector;
      this.nest = !!nest;
      this.colour = sector.faction.glow;
      this.barFg.material.color.setHex(this.colour);
      this.type = 'hive'; this.name = sector.faction.name + (nest ? ' nest (capture it)' : ' spire');
      this.t = { speed: 0, accel: 0, turn: 0 };
      if (hp !== undefined) this.hp = hp;
      this.pos.copy(pos);
      this.buildTimer = 2 + Math.random() * 4;
      this.guardMax = (nest ? 4 : 6) + 2 * sector.level;
      this.bank = Math.ceil(this.guardMax * 0.6);      // ships ready the first time you come near
      this.turretsUp = nest;                            // nests have no turrets
      this.flagshipDue = false;
      hives.push(this);
      sector.hives.push(this);
      if (nest) nests.push(this);
    }
    hurt(amount, from) {
      if (this.nest) {
        // a nest doesn't die: it holds at a tenth, waiting for a Usurper
        if (this.dead) return;
        this.hp = Math.max(this.maxHp * 0.1, this.hp - amount);
        this.lastHit = state.time;
        fx.shieldFlash(this);
        if (this.hp <= this.maxHp * 0.1 + 0.5 && from && from.team === 'player' && state.time - (this.warned || -99) > 20) {
          this.warned = state.time;
          flash('The nest can\'t be destroyed. Capture it: send a Usurper (needs a Tech Centre).');
        }
        return;
      }
      super.hurt(amount, from);
    }
    die(from) {
      super.die(from);
      fx.explosion(this.pos.clone(), 10, this.colour);
      deselect(this);
      addResources(BOUNTY.hive);
      const left = this.sector.hives.filter(alive).length;
      if (left) { say('announce_hive_destroyed', 0, true); flash('Spire destroyed! ' + plural(left, 'hive') + ' left in this sector'); }
    }
    // a Usurper got it: the nest is yours, a sphere of your empire that builds its faction's ships for you
    takeOver() {
      if (this.dead) return;
      this.dead = true; this.captured = true;
      this.remove(); deselect(this);
      const o = new Outpost(this.sector, this.pos.clone(), this.maxHp, nests.indexOf(this));
      // its garrison defects: every ship that guarded the nest is yours now (as long as your fleet has room)
      let turned = 0;
      for (const e of enemies) {
        if (e.hive !== this || e.dead) continue;
        if (warshipCount() < CAP.warships) {
          const u = new Unit('turncoat', e.pos.clone(), { model: models.factionShip(this.sector.faction, e.kind === 'light' ? 'light' : 'heavy'), home: o, faction: this.sector.faction });
          if (e.kind !== 'light') { u.maxHp = u.hp = u.maxHp * 3; }
          turned++;
        }
        e.dead = true; e.remove(); deselect(e);
      }
      fx.explosion(this.pos.clone(), 8, COL.pink);
      sfx.upgrade();
      say('announce_sector', 0, true);
      flash(this.sector.faction.name + ' nest captured!' + (turned ? ' ' + plural(turned, 'ship') + ' defect to you.' : '') + ' It builds ' + this.sector.faction.name + ' ships for you, and its sphere is yours (J jumps between your spheres).');
      return o;
    }
    awake() {
      if (d2(this.pos, commander.pos) < ACTIVE * ACTIVE) return true;
      if (pilot && d2(this.pos, pilot.pos) < 140 * 140) return true;
      for (const o of outposts) if (!o.dead && d2(this.pos, o.pos) < 150 * 150) return true;
      return false;
    }
    update(dt) {
      this.mesh.rotation.y += dt * 0.15;
      this.mesh.rotation.x += dt * 0.05;
      this.model.core.material.opacity = 0.45 + Math.sin(state.time * 3) * 0.15;
      if (this.nest && this.hp < this.maxHp && state.time - this.lastHit > 8) this.hp = Math.min(this.maxHp, this.hp + this.maxHp * 0.01 * dt);
      // the garrison: built all the time, kept in the bank while nobody's near
      this.buildTimer -= dt;
      const awake = this.awake();
      if (this.buildTimer <= 0) {
        this.buildTimer = Math.max(3, 8 - this.sector.level * 0.45);
        if (this.guards() + this.bank < this.guardMax) this.bank++;
      }
      if (!awake) return;
      if (!this.turretsUp) {
        this.turretsUp = true;
        const n = 2 + Math.floor(this.sector.level / 3);
        for (let i = 0; i < n; i++) spawnEnemy('turret', this.pos.clone().add(randDirM().multiplyScalar(16 + Math.random() * 6)), this, { guard: true });
        if (this === this.sector.hives.find((h) => !h.nest)) this.flagshipDue = true;
      }
      if (this.flagshipDue) {
        this.flagshipDue = false;
        const f = spawnEnemy('flagship', this.pos.clone().add(randDirM().multiplyScalar(18)), this, { guard: true });
        if (f) flash(this.sector.faction.special + ', the ' + this.sector.faction.name + ' flagship, guards this sector: ' + this.sector.faction.specialAbout + '.');
      }
      if (this.bank > 0 && Math.random() < dt * 4) {
        this.bank--;
        const roll = Math.random(), lvl = this.sector.level;
        const kind = roll < 0.22 ? 'heavy' : (roll < 0.3 + lvl * 0.01 && lvl >= 2 ? 'bomber' : 'light');
        spawnEnemy(kind, this.pos.clone().add(randDirM().multiplyScalar(10)), this, { guard: true });
      }
      this.cooldown -= dt;
      const target = nearest(playerTargets(), this.pos, 32) || (d2(commander.pos, this.pos) < 34 * 34 ? commander : null);
      if (target && this.cooldown <= 0) {
        this.cooldown = 0.9;
        this.shoot(target, 14 + this.sector.level * 2, this.colour, 50, true);
      }
    }
    guards() {
      let n = 0;
      for (const e of enemies) if (e.hive === this && e.guard && !e.dead && e.kind !== 'turret' && e.kind !== 'flagship') n++;
      return n;
    }
  }

  // A captured nest: yours now. It has its own sphere (your ships fight inside it), shoots, and builds its
  // faction's ships for you (turncoats that guard it).
  class Outpost extends Entity {
    constructor(sector, pos, hp, nestIndex) {
      super(models.hive(sector.faction, 'nest'), Math.round(1800 + 350 * sector.level), 'player');
      this.sector = sector; this.faction = sector.faction; this.nestIndex = nestIndex;
      this.type = 'outpost'; this.name = sector.faction.name + ' nest (yours)';
      this.colour = COL.pink;
      this.t = { speed: 0, accel: 0, turn: 0 };
      this.hp = Math.min(this.maxHp, hp);
      this.pos.copy(pos);
      this.buildTimer = 6;
      this.sphere = unionSphere(new THREE.Mesh(new THREE.SphereGeometry(OUTPOST_R, 24, 12), new THREE.MeshBasicMaterial({ color: COL.pink, wireframe: true, transparent: true, opacity: 0.07, depthWrite: false })));
      this.sphere.position.copy(pos);
      scene.add(this.sphere);
      this.mesh.add(models.glowSprite(COL.pink, 26, 0.35));
      outposts.push(this);
    }
    remove() { super.remove(); scene.remove(this.sphere); }
    die(from) {
      super.die(from);
      deselect(this);
      if (focus === this) focus = null;
      fx.explosion(this.pos.clone(), 10, COL.pink);
      say('announce_ship_lost', 0, true);
      flash('Your ' + this.faction.name + ' nest has fallen.');
    }
    update(dt) {
      this.mesh.rotation.y += dt * 0.15;
      this.model.core.material.opacity = 0.45 + Math.sin(state.time * 3) * 0.15;
      if (state.time - this.lastHit > 6) this.hp = Math.min(this.maxHp, this.hp + this.maxHp * 0.01 * dt);
      this.cooldown -= dt;
      const t = nearest(hostiles(), this.pos, 36);
      if (t && this.cooldown <= 0) { this.cooldown = 0.8; this.shoot(t, (16 + this.sector.level * 2) * dmgMult(), COL.pink, 55, true); }
      this.buildTimer -= dt;
      if (this.buildTimer <= 0) {
        this.buildTimer = 20;
        const mine = units.filter((u) => u.home === this).length;
        if (mine < 12 && warshipCount() < CAP.warships) {
          new Unit('turncoat', this.pos.clone().add(randDirM().multiplyScalar(this.radius + 3)), { model: models.factionShip(this.faction, 'light'), home: this, faction: this.faction });
        }
      }
    }
  }

  // Your buildings float where they're built. Solar plants power the rest (sparks fly to each one); short of power,
  // everything works slower. With the Tractor upgrade they travel with the Commander.
  class Building extends Entity {
    constructor(kind, pos, hp) {
      const b = BUILDINGS[kind];
      super(models[b.model](), b.hp * hullMult(), 'player');
      this.kind = kind; this.type = 'building'; this.b = b; this.name = b.name;
      this.t = { speed: 0, accel: 0, turn: 0 };
      if (hp !== undefined) this.hp = Math.min(this.maxHp, hp);
      this.pos.copy(pos);
      this.mesh.rotation.set(Math.random() * 0.4, Math.random() * Math.PI * 2, Math.random() * 0.4);
      this.offset = pos.clone().sub(commander.pos);
      this.zapTimer = Math.random();
      if (kind === 'smelter') { this.mesh.add(models.glowSprite(0xeaf7ff, 16, 0.55)); this.mesh.scale.setScalar(0.9); }
      this.sphere = unionSphere(new THREE.Mesh(new THREE.SphereGeometry(BUILD_R, 20, 10), new THREE.MeshBasicMaterial({ color: COL.light, wireframe: true, transparent: true, opacity: 0.035, depthWrite: false })));
      this.sphere.position.copy(pos);
      scene.add(this.sphere);
      buildings.push(this);
    }
    remove() { super.remove(); scene.remove(this.sphere); }
    keepSphere() { this.sphere.position.copy(this.pos); }
    die(from) {
      super.die(from);
      deselect(this);
      fx.explosion(this.pos.clone(), 6, COL.light);
      say('announce_ship_lost', 5);
      flash('Your ' + this.name + ' was destroyed.');
    }
    update(dt) {
      this.keepSphere();
      if (state.up.tractor) {
        // the tractor beam: keep station on the Commander
        v1.copy(commander.pos).add(this.offset);
        this.pos.lerp(v1, Math.min(1, dt * 0.8));
      }
      const p = power().ratio;
      if (this.kind === 'solar') {
        this.mesh.rotation.y += dt * 0.1;
        this.zapTimer -= dt;
        if (this.zapTimer <= 0) {
          this.zapTimer = 0.35 + Math.random() * 0.4;
          for (const o of buildings) {
            if (o === this || o.dead || o.b.power >= 0 || d2(o.pos, this.pos) > 140 * 140 || Math.random() > 0.6) continue;
            fx.zap(this.pos, o.pos, COL.amber);
            zapHurt(this.pos, o.pos, enemies, 30 * dmgMult(), this);         // the power lines are a fence
          }
        }
      } else if (this.kind === 'turret') {
        this.cooldown -= dt;
        const t = nearest(hostiles(), this.pos, 36);
        if (t) for (const tr of this.model.turrets) tr.lookAt(t.pos);
        if (t && this.cooldown <= 0) {
          this.cooldown = 0.55 / Math.max(0.25, p);
          const tr = this.model.turrets[Math.floor(Math.random() * this.model.turrets.length)];
          this.shoot(t, 16 * dmgMult(), COL.light, 60, true, tr ? tr.getWorldPosition(v2) : null);
        }
      } else if (this.kind === 'repair') {
        this.mesh.rotation.z += dt * 0.5;
        for (const u of playerTargets()) {
          if (u === this || u.dead || u.hp >= u.maxHp || d2(u.pos, this.pos) > 32 * 32) continue;
          u.hp = Math.min(u.maxHp, u.hp + 14 * p * dt);
          if (Math.random() < dt * 1.5) fx.line(this.pos, u.pos, COL.light);
        }
      } else if (this.kind === 'tech') {
        this.mesh.rotation.y += dt * 0.25;
      }
    }
  }

  // An Overlord's building: solar plants (power) and refineries (its miners unload there, a quarter more ore).
  // Static, in its faction's colours; shoot its power down and it builds slower.
  class EnemyBuilding extends Entity {
    constructor(owner, kind, pos) {
      const b = BUILDINGS[kind];
      super(models[b.model](), Math.round(b.hp * (1 + 0.15 * owner.sector.level)), 'enemy');
      this.owner = owner; this.sector = owner.sector; this.kind = kind; this.type = 'enemyBuilding'; this.b = b;
      this.name = owner.sector.faction.name + ' ' + b.name.toLowerCase();
      this.colour = owner.sector.faction.glow;
      this.barFg.material.color.setHex(this.colour);
      this.t = { speed: 0, accel: 0, turn: 0 };
      this.mesh.add(models.glowSprite(this.colour, this.radius * 3, 0.35));
      this.mesh.rotation.set(Math.random() * 0.4, Math.random() * Math.PI * 2, Math.random() * 0.4);
      this.pos.copy(pos);
      this.zapTimer = Math.random();
      enemyBuildings.push(this);
    }
    die(from) {
      super.die(from);
      deselect(this);
      fx.explosion(this.pos.clone(), 6, this.colour);
      addResources(this.kind === 'solar' ? 80 : 120);
      flash(this.name + ' destroyed' + (this.kind === 'solar' ? ': the Overlord builds slower now.' : '.'));
    }
    update(dt) {
      if (this.kind !== 'solar' || !alive(this.owner)) return;
      this.mesh.rotation.y += dt * 0.1;
      this.zapTimer -= dt;
      if (this.zapTimer > 0) return;
      this.zapTimer = 0.4 + Math.random() * 0.5;
      if (d2(this.pos, commander.pos) > 300 * 300) return;
      fx.zap(this.pos, this.owner.pos, this.colour);
      zapHurt(this.pos, this.owner.pos, units, 25, this);
      for (const o of enemyBuildings) {
        if (o === this || o.owner !== this.owner || o.dead || o.kind === 'solar' || Math.random() > 0.6) continue;
        fx.zap(this.pos, o.pos, this.colour);
        zapHurt(this.pos, o.pos, units, 25, this);                         // their power lines hurt your ships too
      }
    }
  }

  // An Overlord: an enemy commander who plays like you. Its miners bring it ore; it builds ships, research and its
  // faction's flagship, keeps a defence, and sends attack fleets that grow every time.
  class Rival extends Entity {
    constructor(sector, pos, hp, ore) {
      super(models.rivalCarrier(sector.faction), 4500 + 600 * sector.level, 'enemy');
      this.sector = sector;
      this.colour = sector.faction.glow;
      this.barFg.material.color.setHex(this.colour);
      this.type = 'rival'; this.name = sector.faction.name + ' Overlord';
      this.t = { speed: 3, accel: 0.4, turn: 0.4 };
      this.turrets = this.model.turrets;
      if (hp !== undefined) this.hp = hp;
      this.ore = ore === undefined ? 600 : ore;
      this.pos.copy(pos);
      this.home = pos.clone();
      this.buildTimer = 3; this.attacks = 0; this.flagship = false; this.baseTimer = 1;
      rivals.push(this);
    }
    die(from) {
      super.die(from);
      fx.explosion(this.pos.clone(), 14, this.colour);
      deselect(this);
      addResources(BOUNTY.rival);
      for (const e of enemies) if (e.hive === this) e.guard = false;
      for (const b of enemyBuildings) if (b.owner === this && !b.dead) b.hurt(b.maxHp * 2, null);
      say('announce_hive_destroyed', 0, true);
      flash(this.name + ' destroyed! +' + BOUNTY.rival + ' steel');
    }
    powerRatio() {
      let made = 50, used = 0;                          // the carrier makes a little itself
      for (const b of enemyBuildings) if (b.owner === this && !b.dead) { if (b.b.power > 0) made += b.b.power; else used -= b.b.power; }
      return Math.max(0.35, Math.min(1, made / Math.max(1, used + 60)));
    }
    update(dt) {
      const near = d2(this.pos, commander.pos) < (ACTIVE + 160) * (ACTIVE + 160);
      this.ore += (near ? 3 : 6) * dt;                   // its own refinery; while you're away it saves up
      if (!near) return;
      this.steer(this.home, this.t.speed, dt, 4);
      this.drawEngines();
      this.cooldown -= dt;
      const threat = nearest(playerTargets().concat([commander]), this.pos, 44);
      if (threat) for (const t of this.turrets) t.lookAt(threat.pos);
      if (threat && this.cooldown <= 0) {
        this.cooldown = 0.6;
        const t = this.turrets[Math.floor(Math.random() * this.turrets.length)];
        this.shoot(threat, 16 + this.sector.level * 2, this.colour, 60, true, t ? t.getWorldPosition(v2) : null);
      }
      // its base: up to 3 solar plants and 2 refineries, rebuilt when you knock them out
      this.baseTimer -= dt;
      if (this.baseTimer <= 0) {
        this.baseTimer = 25;
        const mineB = enemyBuildings.filter((b) => b.owner === this && !b.dead);
        const solars = mineB.filter((b) => b.kind === 'solar').length, refs = mineB.length - solars;
        const kind = solars <= refs && solars < 3 ? 'solar' : (refs < 2 ? 'refinery' : (solars < 3 ? 'solar' : null));
        const cost = kind ? BUILDINGS[kind].cost : 0;
        if (kind && (this.ore >= cost || mineB.length < 2)) {
          this.ore = Math.max(0, this.ore - cost);
          new EnemyBuilding(this, kind, this.home.clone().add(randDirM().multiplyScalar(this.radius + 14 + Math.random() * 12)));
        }
      }
      this.buildTimer -= dt * this.powerRatio();
      if (this.buildTimer > 0) return;
      this.buildTimer = Math.max(2, 5 - this.sector.level * 0.25);
      const mine = enemies.filter((e) => e.hive === this && !e.dead);
      const miners = mine.filter((e) => e.kind === 'miner').length;
      const idle = mine.filter((e) => e.guard && e.kind !== 'miner' && e.kind !== 'flagship');
      // what to build: miners first, then its flagship once it can afford it, then a mixed fleet
      let kind = null, cost = 0;
      if (miners < 4 + Math.floor(this.sector.level / 3)) { kind = 'miner'; cost = 80; }
      else if (!this.flagship && this.ore >= 1500) { kind = 'flagship'; cost = 1500; this.flagship = true; }
      else { const r = Math.random(); kind = r < 0.3 ? 'heavy' : (r < 0.45 ? 'bomber' : 'light'); cost = ({ light: 60, heavy: 220, bomber: 160 })[kind]; }
      if (this.ore >= cost) {
        const e = spawnEnemy(kind, this.pos.clone().add(randDirM().multiplyScalar(this.radius + 3)), this, { guard: kind !== 'miner' });
        if (e) this.ore -= cost;
        if (e && kind === 'flagship') flash(this.name + ' has built ' + this.sector.faction.special + ': ' + this.sector.faction.specialAbout + '.');
      }
      // attack when the fleet is big enough and you're near, or once the game's gone on a while (later in harder
      // sectors); it keeps a few home to defend
      const want = Math.min(50, 12 + 4 * this.attacks);
      const ready = d2(this.pos, commander.pos) < 210 * 210 || state.time > 60 * (16 + 3 * this.sector.level);
      if (ready && idle.length >= want + 6) {
        const go = idle.slice(0, idle.length - 6);
        for (const e of go) e.guard = false;
        this.attacks++;
        say('announce_wave', 0, true);
        flash(this.name + ' attacks with ' + plural(go.length, 'ship') + '!');
      }
    }
  }

  // A little black hole, planted by the Pathfinder: for 20 seconds it pulls enemy ships in and swallows them
  // (flagships only take damage; turrets, hives and Overlords are too big to move).
  class Hole {
    constructor(pos) {
      this.model = models.blackHole();
      this.mesh = this.model.group;
      this.mesh.position.copy(pos);
      this.mesh.quaternion.setFromUnitVectors(AX.y, randDirM());
      this.age = 0; this.eaten = 0; this.dead = false;
      scene.add(this.mesh);
      holes.push(this);
      sfx.warning();
    }
    get pos() { return this.mesh.position; }
    update(dt) {
      this.age += dt;
      const left = HOLE.life - this.age;
      const grow = Math.min(1, this.age / 0.8) * Math.min(1, Math.max(0, left) / 1.5);   // opens, then closes
      this.mesh.scale.setScalar(Math.max(0.01, grow));
      this.model.disc.rotation.z += dt * 2.5; this.model.inner.rotation.z -= dt * 4;
      if (Math.random() < dt * 30) {
        const a = Math.random() * Math.PI * 2, r = 3 + Math.random() * 6;
        fx.trail(v1.set(Math.cos(a) * r, 0, Math.sin(a) * r).applyQuaternion(this.mesh.quaternion).multiplyScalar(grow).add(this.pos), Math.random() < 0.5 ? 0xff8a3c : COL.pink);
      }
      const pull = HOLE.pull * grow;
      for (const e of enemies) {
        if (e.dead || e.kind === 'turret') continue;
        const dd = d2(e.pos, this.pos);
        if (dd > pull * pull) continue;
        const d = Math.sqrt(dd);
        if (e.kind === 'flagship') { e.hurt(220 * dt, null); e.pos.addScaledVector(v1.subVectors(this.pos, e.pos).normalize(), HOLE.strength * 0.25 * dt); continue; }
        if (d < HOLE.horizon) {
          // swallowed: no wreck, no explosion; it pays like a kill
          e.dead = true; e.remove(); deselect(e);
          addResources(e.mini ? 5 : BOUNTY[e.kind] || 10); state.kills++; this.eaten++;
          fx.spark(this.pos.clone(), 0xff8a3c, 3);
          continue;
        }
        // the pull grows as they fall in, and drags them round in a spiral
        const k = HOLE.strength * (0.4 + 1.6 * (1 - d / pull));
        v1.subVectors(this.pos, e.pos).normalize();
        v2.copy(v1).cross(AX.y).normalize();
        e.pos.addScaledVector(v1, k * dt).addScaledVector(v2, k * 0.5 * dt);
        e.vel.multiplyScalar(1 - Math.min(1, dt * 2));
      }
      if (left <= 0) this.finish();
    }
    finish() {
      if (this.dead) return;
      this.dead = true;
      scene.remove(this.mesh);
      fx.explosion(this.pos.clone(), 4, COL.pink);
      flash('The black hole closed' + (this.eaten ? ': it swallowed ' + plural(this.eaten, 'ship') : ''));
    }
  }

  function plantHole() {
    if (!state || !state.running) return;
    const pf = units.find((u) => u.type === 'pathfinder' && !u.dead);
    if (!pf) { flash('Black holes come from the Pathfinder: build one first'); sfx.denied(); return; }
    if (holes.filter((h) => !h.dead).length >= HOLE.max) { flash('At most ' + HOLE.max + ' black holes at once'); sfx.denied(); return; }
    if (!pay(HOLE.cost, 'a black hole')) return;
    const ahead = v1.set(0, 0, 1).applyQuaternion(pf.mesh.quaternion).multiplyScalar(14);
    new Hole(pf.pos.clone().add(ahead));
    say('announce_upgrade', 0);
    flash('Black hole! For ' + HOLE.life + ' seconds it pulls in and swallows enemy ships.');
  }

  // ---- flying the Pathfinder yourself (third person)
  function startPiloting() {
    const pf = units.find((u) => u.type === 'pathfinder' && !u.dead);
    if (!pf) { flash('Build a Pathfinder to fly it (it needs no Tech Centre)'); sfx.denied(); return; }
    pilot = pf; pf.order = null; focus = null;
    select([pf], false, true);
    flash('Flying the Pathfinder: W thrust, S brake, A/D turn, arrows pitch, Shift boost, Space black hole (' + costText(HOLE.cost) + '), T hands back. Outside your spheres it burns fuel.');
  }
  function stopPiloting(why) {
    if (!pilot) return;
    const pf = pilot;
    pilot = null;
    // it holds where you left it (and takes orders there); only an empty tank sends it home
    if (!pf.dead) pf.order = state.fuel <= 0 ? { kind: 'move', point: commander.pos.clone().add(pf.escort), home: true } : null;
    if (why) flash(why);
  }

  class Rock {
    constructor(kind, centre, pos, amount) {
      this.kind = kind;
      this.model = kind === 'comet' ? models.comet() : models.asteroid(kind);
      this.mesh = this.model.group;
      this.mesh.userData.entity = this;
      this.radius = this.model.size;
      this.max = kind === 'comet' ? Math.round(rand(900, 1300)) : kind === 'fuel' ? Math.round(worldVersion >= 2 ? rand(500, 700) : rand(250, 380)) : kind === 'alu' ? Math.round(rand(160, 240)) : Math.round(rand(350, 500));
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
      for (const e of units.concat(enemies, hives, buildings, outposts, rivals, enemyBuildings, [commander])) {
        if (!alive(e) || this.hit.has(e)) continue;
        const reach = this.radius + e.radius * 0.8;
        if (d2(p, e.pos) > reach * reach) continue;
        this.hit.add(e);
        const big = e === commander || e instanceof Hive || e instanceof Rival || e instanceof Outpost;
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
  function unitCost(type) {
    const c = UNIT[type].cost, k = 1 - 0.12 * state.up.logistics, out = {};
    for (const r in c) out[r] = Math.round(c[r] * k);
    return out;
  }
  function buildTime(t) { return t * (1 - 0.15 * state.up.logistics); }
  // shipyards build faster, when they have power (up to two count)
  function buildSpeed() { return 1 + 0.35 * Math.min(2, buildings.filter((b) => !b.dead && b.kind === 'shipyard').length) * power().ratio; }

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
      if (!here.visited) { here.visited = true; here.nextWave = here.level === 0 ? WAVES.first : WAVES.firstLater; }
      if (!here.conquered) {
        if (state.time > 1) say('announce_enter', 0, true);
        flash('Sector ' + (here.level + 1) + ': ' + here.faction.name + '. ' + here.faction.about);
      } else flash('Sector ' + (here.level + 1) + ' (conquered)');
      drawMap();
    }
    for (const s of sectors) {
      if (!s.conquered && s.hives.length && s.hives.every((h) => h.dead) && !rivals.some((r) => r.sector === s && !r.dead)) {
        s.conquered = true;
        const bonus = 400 + 100 * s.level;
        addRes('s', bonus); addRes('w', Math.round(bonus / 2)); addRes('f', Math.round(bonus / 4)); addRes('a', 20 + 10 * s.level);
        say('announce_sector', 0, true);
        flash('Sector ' + (s.level + 1) + ' conquered! +' + bonus + ' steel, ' + Math.round(bonus / 2) + ' water, ' + Math.round(bonus / 4) + ' fuel, ' + (20 + 10 * s.level) + ' aluminium. ' + (SECTORS - conqueredCount()) + ' to go: open Sectors (N) and pick the next one.');
        drawMap();
        saveGame(true);
      }
    }
    if (conqueredCount() === SECTORS) endGame(true);
  }

  // ---------- Economy, production, upgrades ----------
  // three resources: steel (meteorites), water (comets), fuel (green meteorites). Kills and conquests pay steel.
  const RES = { s: 'steel', w: 'water', f: 'fuel', a: 'aluminium' };
  const RES_OF_ROCK = { asteroid: 's', comet: 'w', fuel: 'f', alu: 'a' };
  function addRes(k, n) { state[RES[k]] += n; state.mined += Math.max(0, n); }
  function addResources(n) { addRes('s', n); }
  function canPay(c) { return (state.steel >= (c.s || 0)) && (state.water >= (c.w || 0)) && (state.fuel >= (c.f || 0)) && (state.aluminium >= (c.a || 0)); }
  function costText(c) {
    const out = [];
    if (c.s) out.push(c.s + ' steel'); if (c.w) out.push(c.w + ' water'); if (c.f) out.push(c.f + ' fuel'); if (c.a) out.push(c.a + ' aluminium');
    return out.join(', ') || 'free';
  }
  function costHtml(c) {
    const out = [];
    if (c.s) out.push('<span class="r-s">' + c.s + '</span>'); if (c.w) out.push('<span class="r-w">' + c.w + '</span>'); if (c.f) out.push('<span class="r-f">' + c.f + '</span>');
    if (c.a) out.push('<span class="r-a">' + c.a + '</span>');
    return out.join(' ');
  }

  function hasTech() { return buildings.some((b) => !b.dead && b.kind === 'tech'); }
  function queued(pred) { return commander.queue.filter(pred).length + commander.bqueue.filter(pred).length + commander.uqueue.filter(pred).length; }
  function warshipCount() { return units.filter((u) => !u.dead && !isH(u.type)).length + queued((q) => q.kind === 'unit' && !isH(q.type)); }
  function harvesterCount() { return units.filter((u) => !u.dead && isH(u.type)).length + queued((q) => isH(q.type)); }
  // power: what your solar plants make against what your buildings use; short of it, everything works slower
  let powerCache = null, powerAt = -1;
  function power() {
    if (powerAt === state.time && powerCache) return powerCache;
    let made = 0, used = 0;
    for (const b of buildings) if (!b.dead) { if (b.b.power > 0) made += b.b.power; else used -= b.b.power; }
    powerAt = state.time;
    powerCache = { made: made, used: used, ratio: used <= 0 ? 1 : Math.min(1, made / used) };
    return powerCache;
  }
  function queueFull(which) {     // undefined: ships, true: buildings, 'u': upgrades
    const q = which === 'u' ? commander.uqueue : (which ? commander.bqueue : commander.queue);
    if (q.length < CAP.queue) return false;
    flash('The ' + (which === 'u' ? 'upgrade' : (which ? 'building' : 'ship')) + ' queue is full (' + CAP.queue + ')'); sfx.denied(); return true;
  }
  function pay(c, what) {
    if (canPay(c)) { state.steel -= c.s || 0; state.water -= c.w || 0; state.fuel -= c.f || 0; state.aluminium -= c.a || 0; return true; }
    flash('Not enough for ' + what + ': it costs ' + costText(c)); sfx.denied(); say('announce_no_resources', 4);
    return false;
  }

  function queueUnit(type) {
    if (!state || !state.running) return;
    const t = UNIT[type], cost = unitCost(type);
    if (queueFull()) return;
    if (t.tech && !hasTech()) { flash('A ' + t.name + ' needs a Tech Centre'); sfx.denied(); return; }
    if (isH(type) && harvesterCount() >= CAP.harvesters) { flash('Harvesters are capped at ' + CAP.harvesters); sfx.denied(); return; }
    if (!isH(type) && warshipCount() >= CAP.warships) { flash('Your fleet is capped at ' + CAP.warships + ' warships'); sfx.denied(); return; }
    if (t.max && units.filter((u) => u.type === type).length + queued((q) => q.type === type) >= t.max) { flash('At most ' + t.max + ' ' + t.name + 's'); sfx.denied(); return; }
    if (!pay(cost, 'a ' + t.name)) return;
    commander.queue.push({ kind: 'unit', type: type, time: buildTime(t.build), name: t.name, cost: cost });
    sfx.queue();
  }

  function queueBuilding(kind) {
    if (!state || !state.running) return;
    const b = BUILDINGS[kind];
    if (queueFull(true) || !pay(b.cost, 'a ' + b.name)) return;
    commander.bqueue.push({ kind: 'building', type: kind, time: b.build, name: b.name, cost: b.cost });
    sfx.queue();
  }

  function queueUpgrade(kind) {
    if (!state || !state.running) return;
    const u = UPGRADES[kind];
    const level = state.up[kind] + queued((q) => q.type === kind);
    if (level >= u.costs.length) { flash(u.name + ' is fully upgraded'); sfx.denied(); return; }
    if (u.tech && !hasTech()) { flash(u.name + ' research needs a Tech Centre'); sfx.denied(); return; }
    if (queueFull('u')) return;
    const cost = u.costs[level];
    if (!pay(cost, u.name + ' ' + (level + 1))) return;
    commander.uqueue.push({ kind: 'upgrade', type: kind, time: u.build, name: u.name + (u.costs.length > 1 ? ' ' + (level + 1) : ''), cost: cost });
    sfx.queue();
  }

  // cancel a queued item: everything it cost comes back (also the one being built). Upgrades queued after it
  // go too, when they were the next levels of the same thing.
  const QUEUES = { queue: 'progress', bqueue: 'bprogress', uqueue: 'uprogress' };
  function cancelItem(qName, index) {
    const q = commander[qName];
    if (!q || index < 0 || index >= q.length) return;
    let gone = [q[index]];
    if (q[index].kind === 'upgrade') gone = q.filter((x, i) => i >= index && x.type === q[index].type);
    for (const item of gone) {
      const c = item.cost || (item.kind === 'unit' ? unitCost(item.type) : item.kind === 'building' ? BUILDINGS[item.type].cost : {});
      state.steel += c.s || 0; state.water += c.w || 0; state.fuel += c.f || 0; state.aluminium += c.a || 0;
      const i = q.indexOf(item);
      if (i === 0) commander[QUEUES[qName]] = 0;
      q.splice(i, 1);
    }
    sfx.order();
    flash('Cancelled: ' + gone.map((x) => x.name).join(', ') + ' (refunded)');
  }
  // right-click a build button: the last one of that kind comes out of its queue
  function cancelLast(qName, type) {
    const q = commander[qName];
    for (let i = q.length - 1; i >= 0; --i) if (q[i].type === type) { cancelItem(qName, i); return; }
  }

  function finishItem(item) {
    if (item.kind === 'building') {
      // it floats where it's built: round the Commander, a little way out
      const at = commander.pos.clone().add(randDirM().multiplyScalar(26 + Math.random() * 30));
      intoSphere(at);
      new Building(item.type, at);
      sfx.build();
      say('announce_upgrade', 0);
      flash(item.name + ' built' + (item.type !== 'solar' && power().ratio < 1 ? '. Low power: build a solar plant.' : ''));
      return;
    }
    if (item.kind === 'upgrade') {
      state.up[item.type]++;
      if (item.type === 'hulls') for (const u of units) { const add = u.t.hp * 0.2; u.maxHp += add; u.hp += add; }
      if (item.type === 'armour') { const add = 3000 * 0.25; commander.maxHp += add; commander.hp += add; }
      if (item.type === 'tractor') for (const b of buildings) b.offset = b.pos.clone().sub(commander.pos);
      sfx.upgrade();
      say('announce_upgrade', 0, true);
      flash(item.name + ' complete');
      return;
    }
    const start = new THREE.Vector3(Math.random() * 4 - 2, 2.5, Math.random() * 12 - 6).applyQuaternion(commander.mesh.quaternion).add(commander.pos);
    const u = new Unit(item.type, start);
    u.mesh.quaternion.copy(commander.mesh.quaternion);
    if (!isH(item.type)) u.order = { kind: 'move', point: commander.pos.clone().add(u.escort) };
    sfx.build();
    say(item.type + '_built', 0);
  }

  // ---------- Waves (only in the sector you are in) ----------
  function updateWaves(dt) {
    const s = state.current;
    if (!s || s.conquered || !s.hives.some(alive)) return;
    s.nextWave -= dt;
    if (s.nextWave > 0) return;
    s.nextWave = Math.max(WAVES.minGap, WAVES.gap - WAVES.gapPerLevel * s.level - s.wave * 0.5);
    const big = (s.wave + 1) % WAVES.big === 0;
    const swarm = s.faction.behaviour === 'swarm' ? 1.5 : 1;
    let n = 0, heavy = 0;
    for (const h of s.hives) {
      if (h.dead || h.nest || d2(h.pos, commander.pos) > (ACTIVE + 60) * (ACTIVE + 60)) continue;
      const lights = Math.round((1.5 + s.level * 0.5 + s.wave * 0.55) * swarm * (big ? 1.4 : 1));
      const heavies = Math.floor((s.wave + s.level) / 4) + (big ? 1 : 0);
      for (let i = 0; i < lights; i++) spawnEnemy('light', h.pos.clone().add(randDirM().multiplyScalar(9)), h);
      for (let i = 0; i < heavies; i++) spawnEnemy('heavy', h.pos.clone().add(randDirM().multiplyScalar(11)), h);
      if (s.wave >= 2 && s.level >= 2) spawnEnemy('bomber', h.pos.clone().add(randDirM().multiplyScalar(11)), h);
      n += lights; heavy += heavies;
    }
    // raiders: in from the edge of your sphere, all from one side
    const home = s.hives.filter(alive).sort((a, b) => d2(a.pos, commander.pos) - d2(b.pos, commander.pos))[0];
    const raiders = Math.round((1 + Math.floor(s.wave / 3) + Math.floor(s.level / 2)) * swarm * (big ? 1.6 : 1));
    const from = commander.pos.clone().add(randDirM().multiplyScalar(R * 0.95));
    for (let i = 0; i < raiders; i++) spawnEnemy('light', from.clone().add(randDirM().multiplyScalar(6)), home);
    if (s.wave >= 3 && (big || s.level >= 4)) { spawnEnemy('heavy', from.clone().add(randDirM().multiplyScalar(8)), home); heavy++; }
    n += raiders;
    s.wave++;
    say('announce_wave', 0, true);
    flash((big ? 'BIG WAVE! ' : '') + s.faction.name + ' wave ' + s.wave + ': ' + plural(n, 'light ship') + (heavy ? ' and ' + heavy + ' heavy' : '') + ' incoming, raiders at the edge of your sphere');
  }

  // ---------- Raids from the other sectors ----------
  function updateRaids(dt) {
    state.nextRaid -= dt;
    if (state.nextRaid > 0) return;
    const here = state.current;
    const from = sectors.filter((x) => x !== here && !x.conquered && x.hives.some(alive));
    const gap = RAIDS.gap[0] + Math.random() * (RAIDS.gap[1] - RAIDS.gap[0]);
    state.nextRaid = Math.max(RAIDS.minGap, gap - state.raids * 2);
    if (!from.length) return;
    // nearer sectors raid more often: pick by 1 / distance
    const weights = from.map((x) => 1 / Math.max(80, x.centre.distanceTo(commander.pos)));
    let pick = Math.random() * weights.reduce((a, b) => a + b, 0), sec = from[0];
    for (let i = 0; i < from.length; i++) { pick -= weights[i]; if (pick <= 0) { sec = from[i]; break; } }
    const hive = sec.hives.find(alive);
    const dir = sec.centre.clone().sub(commander.pos);
    if (dir.lengthSq() < 1) dir.copy(randDirM()); else dir.normalize();
    const at = commander.pos.clone().addScaledVector(dir, R * 0.95);
    const swarm = sec.faction.behaviour === 'swarm' ? 1.5 : 1;
    const lights = Math.round((1.5 + sec.level * 0.3 + state.raids * 0.25) * swarm);
    const heavies = Math.floor((sec.level + state.raids) / 6);
    for (let i = 0; i < lights; i++) spawnEnemy('light', at.clone().add(randDirM().multiplyScalar(7)), hive);
    for (let i = 0; i < heavies; i++) spawnEnemy('heavy', at.clone().add(randDirM().multiplyScalar(9)), hive);
    if (state.raids >= 5) spawnEnemy('bomber', at.clone().add(randDirM().multiplyScalar(9)), hive);
    state.raids++;
    say('announce_wave', 0, true);
    flash('RAID! ' + sec.faction.name + ' from sector ' + (sec.level + 1) + ': ' + plural(lights, 'light ship') + (heavies ? ' and ' + heavies + ' heavy' : '') + ' at the edge of your sphere');
  }

  // ---------- Voice ----------
  function say(key, gap, important) { audio.say(key, gap, important); }

  // ---------- Selection & orders ----------
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  function setRay(x, y) {
    ndc.x = (x / viewW) * 2 - 1;
    ndc.y = -(y / viewH) * 2 + 1;
    raycaster.setFromCamera(ndc, camera);
  }
  function toScreen(p) {
    const v = p.clone().project(camera);
    return { x: (v.x + 1) / 2 * viewW, y: (1 - v.y) / 2 * viewH, behind: v.z > 1 || v.z < -1 };
  }
  function pickables() {
    const list = units.concat(enemies, hives, buildings, outposts, rivals, enemyBuildings, rocks.filter((r) => !r.dead && d2(r.pos, camera.position) < 400 * 400));
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
    if (first) say(first === commander ? 'commander_select' : voiceOf(first.type) + '_select', 0);
  }
  function myShips() { return selection.filter((e) => e.team === 'player' && e !== commander && units.indexOf(e) >= 0); }

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
    if (e instanceof Hive && e.nest && ships.some((u) => u.type === 'captor')) {
      if (!inSphere(e.pos, e.radius)) { flash('Out of reach: fly the Commander closer to the nest first.'); sfx.denied(); marker(e.pos, COL.white); return true; }
      for (const u of ships) if (u.type === 'captor') u.order = { kind: 'capture', nest: e };
      for (const u of ships) if (u.type !== 'captor' && !isH(u.type)) u.order = { kind: 'attack', target: e };
      sfx.order(); say('cruiser_attack', 0); marker(e.pos, COL.pink);
      flash('Usurper on its way: it takes over the nest once it locks on (quicker if you beat the nest down first).');
      return true;
    }
    if (e && e.isEnemy && ships.some((u) => !isH(u.type) && u.type !== 'captor')) {
      const outside = !inSphere(e.pos, e.radius);
      if (outside && !ships.some((u) => u.type === 'pathfinder')) {
        flash('Out of reach: your ships only fight inside your sphere (the Pathfinder goes anywhere). Fly the Commander closer first.');
        sfx.denied(); marker(e.pos, COL.white);
        return true;
      }
      for (const u of ships) if (!isH(u.type) && u.type !== 'captor' && (!outside || u.type === 'pathfinder')) u.order = { kind: 'attack', target: e };
      const voice = ships.find((u) => u.type === 'fighter' || u.type === 'cruiser');
      sfx.order(); say((voice ? voice.type : 'cruiser') + '_attack', 0); marker(e.pos, COL.white);
      return true;
    }
    if (e instanceof Rock && ships.some((u) => isH(u.type))) {
      const res = RES_OF_ROCK[e.kind], fit = ships.filter((u) => isH(u.type) && UNIT[u.type].res === res);
      if (!fit.length) { flash('That needs a ' + UNIT[res === 's' ? 'harvester' : res === 'w' ? 'hwater' : 'hfuel'].name.toLowerCase()); sfx.denied(); return true; }
      for (const u of fit) u.order = { kind: 'harvest', rock: e };
      sfx.order(); say('harvester_harvest', 0); marker(e.pos, COL.white);
      return true;
    }
    const movers = withCommander ? ships.concat([commander]) : ships;
    const centre = new THREE.Vector3();
    for (const u of movers) centre.add(u.pos);
    centre.divideScalar(movers.length);
    const p = e && e.team === 'player' && e !== commander ? e.pos.clone().add(randDirM().multiplyScalar(e.radius + 4)) : spacePoint(x, y, centre);
    if (!p) return false;
    const free = p.clone();                      // where the Pathfinder may go: anywhere
    if (withCommander) moveCommander(p, ships.length > 0);
    else intoAnySphere(p);                       // ships alone go no further than your spheres' edges
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
    const cols = Math.ceil(Math.sqrt(ships.length));
    ships.forEach((u, i) => {
      const ox = (i % cols - (cols - 1) / 2) * 4.5, oy = (Math.floor(i / cols) - (cols - 1) / 2) * 4.5;
      const pt = (u.type === 'pathfinder' ? free : p).clone().addScaledVector(right, ox).addScaledVector(up, oy);
      if (withCommander) { pt.add(u.escort.clone().multiplyScalar(0.8)); u.post = null; }
      else if (u.type !== 'pathfinder') intoAnySphere(pt);
      u.order = { kind: 'move', point: pt };
      // sent into a building's sphere away from the Commander: posted there, it guards that network
      if (!withCommander && !isH(u.type) && u.type !== 'pathfinder' && d2(pt, commander.pos) > R * R) {
        let nb = null, bd = BUILD_R * BUILD_R * 1.2;
        for (const b of buildings) if (!b.dead && d2(b.pos, pt) < bd) { nb = b; bd = d2(b.pos, pt); }
        u.post = nb;
        if (nb) u.escort = pt.clone().sub(nb.pos);
      } else if (!withCommander) u.post = null;
      if (isH(u.type)) u.hstate = 'seek';
    });
    if (ships.length) { sfx.order(); say(voiceOf(ships[0].type) + '_move', 0); marker(p, COL.pink); }
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
    if (e && (buildings.indexOf(e) >= 0 || outposts.indexOf(e) >= 0)) { select([e], false, true); sfx.select(); return; }
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
    if (k === 't') { if (pilot) stopPiloting('You hand the Pathfinder back: right-click to send it anywhere, inside or outside the sphere.'); else startPiloting(); return; }
    if (pilot && k === ' ') { e.preventDefault(); plantHole(); return; }
    if (k === 'f') queueUnit('fighter');
    else if (k === 'c') queueUnit('cruiser');
    else if (k === 'h') queueUnit('harvester');
    else if (k === 'g') queueUnit('dreadnought');
    else if (k === 'u') queueUnit('captor');
    else if (k === 'y') queueUnit('pathfinder');
    else if (k === 'j') nextSphere();
    else if (k === 'x') selectArmy();
    else if (k === 'z') selectHarvesters();
    else if (k === 'k') stayHere();
    else if (k === 'l') followCommander();
    else if (k === 'b') selectBase();
    else if (k === 'n') toggleMap();
    else if (k === 'p' || k === ' ') { e.preventDefault(); togglePause(); }
    else if (k === 'm') toggleSound();
    else if (k === 'home') resetCamera();
  });
  window.addEventListener('keyup', (e) => { keys[e.key.toLowerCase()] = false; });
  window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; });
  function keyCamera(dt) {
    if (pilot) return;                              // the keys fly the Pathfinder
    let dx = 0, dy = 0;
    if (keys.a || keys.arrowleft) dx -= 1;
    if (keys.d || keys.arrowright) dx += 1;
    if (keys.w || keys.arrowup) dy -= 1;
    if (keys.s || keys.arrowdown) dy += 1;
    if (keys.q) cam.dist *= 1 + dt;
    if (keys.e) cam.dist *= 1 - dt;
    if (dx || dy) rotateCamera(dx * dt * 1.6, dy * dt * 1.6);
  }
  function nextSphere() {
    const cols = networks.filter((n) => n.colony && alive(n.anchor)).map((n) => n.anchor);
    const list = [null].concat(outposts.filter(alive), cols);
    if (list.length === 1) { focus = null; flash('No other spheres yet: leave a base behind (a colony) or capture a nest with a Usurper'); return; }
    focus = list[(list.indexOf(focus) + 1) % list.length];
    let what = 'the Commander';
    if (focus instanceof Outpost) what = focus.name + ' (' + units.filter((u) => u.home === focus).length + ' turncoats)';
    else if (focus) { const n = networks.find((x) => x.anchor === focus); what = 'a colony: ' + plural(n ? n.buildings.length : 1, 'building') + ', ' + plural(units.filter((u) => u.post && n && n.buildings.indexOf(u.post) >= 0).length, 'ship') + ' guarding it'; }
    flash('Sphere: ' + what);
    sfx.select();
  }
  function selectArmy() { focus = null; select(units.filter((u) => !isH(u.type) && u.type !== 'captor' && !u.home), false); }
  function selectHarvesters() { select(units.filter((u) => isH(u.type)), false); }
  function selectBase() { focus = null; if (alive(commander)) select([commander], false); }

  // Stances for the selected warships: Stay (K) posts each at the nearest of your buildings or captured nests, to
  // guard it whatever the Commander does; Follow (L) brings them back to the Commander's escort.
  function warshipsSelected() { return myShips().filter((u) => !isH(u.type) && u.type !== 'pathfinder'); }
  function stayHere() {
    const ships = warshipsSelected();
    if (!ships.length) { flash('Select warships first, then Stay (K) keeps them by the nearest building.'); sfx.denied(); return; }
    const posts = buildings.filter(alive).concat(outposts.filter(alive));
    if (!posts.length) { flash('Nothing to stay by yet: build something first (Base tab).'); sfx.denied(); return; }
    let placed = 0;
    for (const u of ships) {
      const b = nearest(posts, u.pos, Infinity);
      if (!b) continue;
      u.post = b;
      // keep the spot it's at when that's inside the post's sphere, else a spot round the post
      const off = u.pos.clone().sub(b.pos);
      if (off.length() > BUILD_R * 0.7 || off.length() < b.radius + 4) off.copy(u.axis).multiplyScalar(b.radius + 8 + Math.random() * 10);
      u.escort = off;
      u.order = { kind: 'move', point: b.pos.clone().add(off) };
      placed++;
    }
    sfx.order(); flash(plural(placed, 'ship') + ' staying by ' + (placed === 1 ? 'its' : 'the nearest') + ' building. Follow (L) brings them back to the Commander.');
  }
  function followCommander() {
    const ships = warshipsSelected();
    if (!ships.length) { flash('Select warships first, then Follow (L) sends them to the Commander.'); sfx.denied(); return; }
    for (const u of ships) {
      u.post = null; u.home = null;
      u.escort = u.axis.clone().multiplyScalar(14 + Math.random() * 10);
      u.order = { kind: 'move', point: commander.pos.clone().add(u.escort) };
    }
    sfx.order(); say(voiceOf(ships[0].type) + '_move', 0); flash(plural(ships.length, 'ship') + ' following the Commander.');
  }

  // Buttons
  $('build-fighter').addEventListener('click', () => queueUnit('fighter'));
  $('build-cruiser').addEventListener('click', () => queueUnit('cruiser'));
  $('build-harvester').addEventListener('click', () => queueUnit('harvester'));
  $('build-hwater').addEventListener('click', () => queueUnit('hwater'));
  $('build-hfuel').addEventListener('click', () => queueUnit('hfuel'));
  $('build-halu').addEventListener('click', () => queueUnit('halu'));
  $('build-dreadnought').addEventListener('click', () => queueUnit('dreadnought'));
  $('build-captor').addEventListener('click', () => queueUnit('captor'));
  for (const k of Object.keys(BUILDINGS)) $('bld-' + k).addEventListener('click', () => queueBuilding(k));
  $('spheres').addEventListener('click', () => nextSphere());
  $('build-pathfinder').addEventListener('click', () => queueUnit('pathfinder'));
  for (const b of document.querySelectorAll('#controls .tab-body .button')) {
    b.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      const id = b.id;
      if (id.startsWith('build-')) cancelLast('queue', id.slice(6));
      else if (id.startsWith('bld-')) cancelLast('bqueue', id.slice(4));
      else if (id.startsWith('up-')) cancelLast('uqueue', id.slice(3));
    });
  }
  for (const qName of Object.keys(QUEUES)) {
    $(qName + '-chips').addEventListener('click', (e) => {
      const chip = e.target.closest('.chip');
      if (chip) cancelItem(qName, Number(chip.dataset.i));
    });
  }
  // the panel's tabs: Ships, Base, Research
  for (const tab of document.querySelectorAll('#controls .tab')) {
    tab.addEventListener('click', () => {
      for (const el of document.querySelectorAll('#controls .tab, #controls .tab-body')) el.classList.toggle('on', el.dataset.tab === tab.dataset.tab);
    });
  }
  $('fly').addEventListener('click', () => { if (pilot) stopPiloting('You hand the Pathfinder back: right-click to send it anywhere, inside or outside the sphere.'); else startPiloting(); });
  $('hole').addEventListener('click', () => plantHole());
  for (const k of Object.keys(UPGRADES)) $('up-' + k).addEventListener('click', () => queueUpgrade(k));
  $('select-army').addEventListener('click', selectArmy);
  $('select-harvesters').addEventListener('click', selectHarvesters);
  $('stay').addEventListener('click', stayHere);
  $('follow').addEventListener('click', followCommander);
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
    ui.menuTitle.textContent = title || 'Comets and the Commander';
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
    for (const u of units) if (!isH(u.type) && (!u.order || u.order.auto)) u.order = null;   // escorts follow
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
    ui.resources.innerHTML = '<span class="r-s">Steel ' + Math.floor(state.steel) + '</span> <span class="r-w">Water ' + Math.floor(state.water) +
      '</span> <span class="r-f">Fuel ' + Math.floor(state.fuel) + '</span> <span class="r-a">Alu ' + Math.floor(state.aluminium) + '</span>';
    const s = state.current;
    if (s) {
      ui.sector.textContent = 'Sector ' + (s.level + 1) + '/' + SECTORS + ': ' + s.faction.name + (s.conquered ? ' (conquered)' : ', ' + plural(s.hives.filter(alive).length, 'hive'));
      ui.sector.style.color = hex(s.faction.glow);
      ui.wave.textContent = s.conquered ? 'Conquered ' + conqueredCount() + '/' + SECTORS + '. Open Sectors (N) to move on.' : 'Next wave in ' + Math.max(0, Math.ceil(s.nextWave)) + 's. Conquered ' + conqueredCount() + '/' + SECTORS;
    }
    ui.base.textContent = 'Commander hull: ' + Math.max(0, Math.ceil(commander.hp)) + '/' + commander.maxHp;
    const army = units.filter((u) => !isH(u.type)).length;
    const pw = power();
    ui.units.textContent = 'Fleet: ' + army + '/' + CAP.warships + ' warships, ' + (units.length - army) + '/' + CAP.harvesters + ' harvesters, ' +
      plural(buildings.length, 'building') + (outposts.length ? ', ' + plural(outposts.length, 'nest') : '') + '. Kills: ' + state.kills;
    const cols = networks.filter((n) => n.colony).length;
    ui.power.textContent = 'Power: ' + pw.made + ' made, ' + pw.used + ' used' + (pw.ratio < 1 ? ' (LOW: ' + Math.round(pw.ratio * 100) + '%)' : '') +
      (networks.length > 1 || cols ? '. Networks: ' + networks.length + (cols ? ' (' + plural(cols, 'colony').replace('colonys', 'colonies') + ')' : '') : '');
    ui.power.style.color = pw.ratio < 1 ? '#f088e9' : '';
    if (selection.length === 1) {
      const u = selection[0];
      let txt = u.name + ': hull ' + Math.max(0, Math.ceil(u.hp || 0)) + '/' + Math.round(u.maxHp || 0);
      if (u instanceof Rock) txt = ({ comet: 'Comet', asteroid: 'Meteorite', fuel: 'Green meteorite', alu: 'Aluminium crystal' })[u.kind] + ': ' + Math.floor(u.amount) + ' ' + RES[RES_OF_ROCK[u.kind]] + ' left';
      if (isH(u.type)) txt += ', cargo ' + Math.floor(u.cargo) + (u.cargo > 0 && u.cargoKind ? ' ' + RES[u.cargoKind] : '') + ' (' + ({ seek: 'heading out', mine: 'mining', return: 'returning' })[u.hstate] + ')';
      if (u === commander) txt += '. Right-click to move the carrier.';
      if (u.type === 'pathfinder') txt += u === pilot ? (inSphere(u.pos) ? ', you are flying it' : ', OUTSIDE the sphere: burning fuel') + '. Space: black hole, T: hand back' : '. T flies it yourself';
      if (u.type === 'captor') txt += u.capture > 0 ? ', taking over the nest' : ', right-click a nest to take it over';
      if (u instanceof Building) txt += ' (' + (u.b.power > 0 ? '+' + u.b.power : u.b.power) + ' power)';
      if (u instanceof Outpost) txt += ', ' + plural(units.filter((x) => x.home === u).length, 'turncoat');
      if (u instanceof Hive) txt += u.nest ? '. A nest: capture it with a Usurper' : '. A spire: destroy it';
      if (u instanceof Rival) txt += ', ore ' + Math.floor(u.ore);
      if (u.kind === 'flagship') txt += ': ' + u.faction.specialAbout;
      ui.selected.textContent = txt;
    } else if (selection.length > 1) ui.selected.textContent = selection.length + ' ships selected';
    else ui.selected.textContent = 'Nothing selected';
    const tech = hasTech(), full = commander.queue.length >= CAP.queue, bfull = commander.bqueue.length >= CAP.queue, ufull = commander.uqueue.length >= CAP.queue;
    for (const type of Object.keys(UNIT)) {
      const b = $('build-' + type);
      if (!b) continue;
      const cost = unitCost(type);
      b.querySelector('.cost').innerHTML = costHtml(cost);
      b.disabled = !state.running || full || !canPay(cost) || (UNIT[type].tech && !tech);
    }
    for (const kind of Object.keys(BUILDINGS)) {
      const b = $('bld-' + kind);
      b.querySelector('.cost').innerHTML = costHtml(BUILDINGS[kind].cost);
      b.disabled = !state.running || bfull || !canPay(BUILDINGS[kind].cost);
    }
    for (const kind of Object.keys(UPGRADES)) {
      const u = UPGRADES[kind], max = u.costs.length;
      const lvl = state.up[kind] + commander.uqueue.filter((q) => q.type === kind).length;
      const b = $('up-' + kind);
      b.querySelector('.cost').innerHTML = lvl >= max ? 'max' : costHtml(u.costs[lvl]);
      b.querySelector('.lvl').textContent = max > 1 ? state.up[kind] : (state.up[kind] ? 'on' : '');
      b.disabled = !state.running || ufull || lvl >= max || !canPay(u.costs[lvl]) || (u.tech && !tech);
    }
    // the two queues: ships, and buildings + upgrades
    const showQ = (q, prog, label, el, bar, speed) => {
      if (q.length) {
        const item = q[0];
        el.textContent = label + ': ' + item.name + (q.length > 1 ? ' (+' + (q.length - 1) + ', ' + q.length + '/' + CAP.queue + ')' : '');
        bar.style.width = Math.min(100, prog / item.time * 100) + '%';
        bar.parentNode.style.display = 'block';
      } else { el.textContent = ''; bar.parentNode.style.display = 'none'; }
    };
    // the chips: one per queued item, rebuilt only when a queue changes
    for (const qName of Object.keys(QUEUES)) {
      const q = commander[qName], el = $(qName + '-chips');
      const sig = q.map((x) => x.name).join('|');
      if (el.dataset.sig === sig) continue;
      el.dataset.sig = sig;
      el.innerHTML = '';
      q.forEach((x, i) => {
        const c = document.createElement('span');
        c.className = 'chip' + (i === 0 ? ' first' : '');
        c.dataset.i = i;
        c.textContent = x.name.replace('Defence turret', 'Turret').replace('Solar plant', 'Solar');
        c.title = 'Click to cancel ' + x.name + ' (refunded)';
        el.appendChild(c);
      });
    }
    showQ(commander.queue, commander.progress, 'Ships', ui.queue, ui.queueBar);
    showQ(commander.bqueue, commander.bprogress, 'Base', ui.bqueue, ui.bqueueBar);
    showQ(commander.uqueue, commander.uprogress, 'Research', ui.uqueue, ui.uqueueBar);
  }

  const camUp = new THREE.Vector3(), camRight = new THREE.Vector3();
  function updateBars() {
    camUp.set(0, 1, 0).applyQuaternion(camera.quaternion);
    camRight.set(1, 0, 0).applyQuaternion(camera.quaternion);
    const list = units.concat(enemies, hives, buildings, outposts, rivals, enemyBuildings);
    if (alive(commander)) list.push(commander);
    for (const e of list) {
      if (e.dead) continue;
      const show = e.selected || e.hp < e.maxHp - 0.5;
      e.barBg.visible = e.barFg.visible = show;
      e.ring.position.copy(e.pos);
      if (e === pilot) { e.ring.visible = false; e.barBg.visible = e.barFg.visible = false; }   // nothing in front of the pilot's view
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
    const centre = pilot && !pilot.dead ? pilot.pos : (focus && alive(focus) ? focus.pos : commander.pos);
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
    for (const e of enemies) if (!e.dead) dot(e.pos, hex(e.colour), e.kind === 'flagship' ? 7 : (e.kind === 'light' ? 3 : 4));
    for (const r of rivals) if (!r.dead) dot(r.pos, hex(r.colour), 9, d2(r.pos, centre) < ACTIVE * ACTIVE);
    for (const b of enemyBuildings) if (!b.dead) dot(b.pos, hex(b.colour), 5);
    for (const b of buildings) if (!b.dead) dot(b.pos, '#ffc977', 5, networks.some((n) => n.colony && n.buildings.indexOf(b) >= 0));
    for (const o of outposts) if (!o.dead) dot(o.pos, '#f088e9', 8, true);
    for (const u of units) if (!u.dead) dot(u.pos, u.selected ? '#f088e9' : (isH(u.type) ? hex(RES_COLOUR[UNIT[u.type].res]) : '#34A9E3'), 3);
    for (const st of strikes) if (!st.dead) dot(st.mesh.position, '#ffffff', 6, true);
    for (const h of holes) if (!h.dead) dot(h.pos, '#ff8a3c', 7, true);
    if (pilot && !pilot.dead) dot(commander.pos, '#f088e9', 8, true);
    dot(centre, '#f088e9', 6);
    rctx.strokeStyle = '#34A9E3';
    rctx.beginPath(); rctx.moveTo(h, h); rctx.lineTo(h - 14, h - 26); rctx.moveTo(h, h); rctx.lineTo(h + 14, h - 26); rctx.stroke();
  }
  ui.radar.addEventListener('click', (e) => {
    const r = ui.radar.getBoundingClientRect();
    const h = r.width / 2, scale = (h - 4) / (R + 10);
    const c = focus && alive(focus) ? focus.pos : commander.pos;
    const p = new THREE.Vector3((e.clientX - r.left - h) / scale, 0, (e.clientY - r.top - h) / scale).applyQuaternion(camera.quaternion).add(c);
    if (p.distanceTo(c) > 5) lookTowards(p);
  });

  // ---------- World ----------
  function clearWorld() {
    for (const list of [units, enemies, hives, buildings, outposts, rivals, enemyBuildings]) { for (const e of list) e.remove(); list.length = 0; }
    nests.length = 0;
    focus = null; pilot = null; networks = []; netAt = -1;
    for (const h of holes) if (!h.dead) { h.dead = true; scene.remove(h.mesh); }
    holes.length = 0;
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
  // the world's layout version: 2 made fuel the easiest resource (more, nearer, bigger green fields). Saves from
  // before it carry no version and rebuild the old layout, so their rocks still line up.
  const WORLD = 2;
  let worldVersion = WORLD;
  function buildWorld(seed, saved) {
    clearWorld();
    worldVersion = saved ? (saved.world || 1) : WORLD;
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
    // green meteorites (fuel): the easiest resource: more fields than steel, near the sector centre, big rocks
    // (world 1, older saves: rarer and further out)
    const richFuel = worldVersion >= 2;
    for (const s of sectors) {
      const n = richFuel ? (s.level === 0 ? 5 : 3 + (s.level % 2)) : (s.level === 0 ? 1 : 1 + (s.level % 2));
      for (let f = 0; f < n; f++) {
        const far = richFuel ? (s.level === 0 ? rand(18, 50) : rand(25, 80)) : (s.level === 0 ? rand(70, 100) : rand(60, 115));
        const c = s.centre.clone().addScaledVector(randDir(), far);
        for (let i = 0; i < (richFuel ? 4 : 3); i++) {
          new Rock('fuel', s.centre, c.clone().addScaledVector(randDir(), rand(3, 7)), saved ? saved.rocks[rockIndex] : undefined);
          rockIndex++;
        }
      }
    }
    // aluminium: really rare; a couple of crystals far out in every other sector (one in the first)
    for (const s of sectors) {
      if (s.level > 0 && s.level % 2 === 0) continue;
      const c = s.centre.clone().addScaledVector(randDir(), rand(95, 125));
      if (c.length() > WORLD_R - 15) c.setLength(WORLD_R - 15);
      for (let i = 0; i < (s.level === 0 ? 1 : 2); i++) {
        new Rock('alu', s.centre, c.clone().addScaledVector(randDir(), rand(2, 5)), saved ? saved.rocks[rockIndex] : undefined);
        rockIndex++;
      }
    }
    // nests (capture them) and Overlords: after everything else, so older saves still build the same world
    let nestIndex = 0;
    for (const s of sectors) {
      for (let i = 0; i < NESTS_PER_SECTOR[s.level]; i++) {
        // well away from the spires (out of their guards' reach), and in the first sector away from the start too
        let pos = null;
        for (let k = 0; k < 12; k++) {
          const d = randDir();
          pos = s.centre.clone().addScaledVector(d, s.level === 0 ? rand(85, 115) : rand(40, 95));
          const clear = s.hives.every((h) => h.nest || h.pos.distanceTo(pos) > 75);
          const offStart = s.level > 0 || d.dot(s.centre.clone().normalize()) > -0.3;
          if (clear && offStart) break;
        }
        if (pos.length() > WORLD_R - 10) pos.setLength(WORLD_R - 10);
        const st = saved && saved.nests ? saved.nests[nestIndex] : undefined;
        const h = new Hive(s, pos, st && st.hp > 0 ? st.hp : undefined, true);
        if (st && st.captured) { h.dead = true; h.captured = true; h.remove(); if (st.outpost > 0) new Outpost(s, pos.clone(), st.outpost, nestIndex); }
        nestIndex++;
      }
    }
    for (const s of sectors) {
      if (RIVAL_LEVELS.indexOf(s.level) < 0) continue;
      const pos = s.centre.clone().addScaledVector(randDir(), rand(20, 50));
      const st = saved && saved.rivals ? saved.rivals[RIVAL_LEVELS.indexOf(s.level)] : undefined;
      if (st && st.hp <= 0) continue;
      new Rival(s, pos, st ? st.hp : undefined, st ? st.ore : undefined);
    }
    rng = Math.random;
    for (let i = hives.length - 1; i >= 0; i--) if (hives[i].dead) hives.splice(i, 1);
    const start = sectors[0].centre.clone().addScaledVector(sectors[0].centre.clone().normalize(), -25);
    commander = new Commander(saved ? new THREE.Vector3().fromArray(saved.commander.pos) : start);
    cam.target.copy(commander.pos);
  }

  function freshState(seed) {
    return { seed: seed, steel: 800, water: 300, fuel: 250, aluminium: 0, mined: 0, kills: 0, running: false, started: false, over: false, time: 0, lastFight: -99,
      nextStrike: STRIKE.first[0] + Math.random() * (STRIKE.first[1] - STRIKE.first[0]), current: null,
      nextRaid: RAIDS.first, raids: 0,
      up: { weapons: 0, hulls: 0, mining: 0, logistics: 0, armour: 0, guns: 0, tractor: 0 } };
  }

  function newGame() {
    const seed = Math.floor(Math.random() * 1e9);
    state = freshState(seed);
    buildWorld(seed);
    const c = commander.pos;
    ['harvester', 'harvester', 'hwater', 'hfuel'].forEach((t, i) => new Unit(t, c.clone().add(new THREE.Vector3(15 - i * 10, -3, 8))));
    for (let i = 0; i < 5; i++) new Unit('fighter', c.clone().add(new THREE.Vector3(-12 + i * 6, 7, 16)));
    new Unit('cruiser', c.clone().add(new THREE.Vector3(0, 3, -18)));
    sectors[0].visited = true;
    sectors[0].nextWave = WAVES.first;
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
      world: worldVersion, seed: state.seed, time: state.time, steel: state.steel, water: state.water, fuel: state.fuel, aluminium: state.aluminium, mined: state.mined, kills: state.kills, up: state.up, nextStrike: state.nextStrike,
      nextRaid: state.nextRaid, raids: state.raids,
      sectors: sectors.map((s) => ({ visited: s.visited, conquered: s.conquered, wave: s.wave, nextWave: s.nextWave })),
      hives: [].concat.apply([], sectors.map((s) => s.hives.filter((h) => !h.nest).map((h) => (h.dead ? 0 : Math.round(h.hp))))),
      nests: nests.map((n, i) => {
        const o = outposts.find((x) => x.nestIndex === i);
        return n.captured ? { captured: true, outpost: o && !o.dead ? Math.round(o.hp) : 0 } : { hp: Math.round(n.hp) };
      }),
      rivals: RIVAL_LEVELS.map((lvl) => { const r = rivals.find((x) => x.sector.level === lvl); return r && !r.dead ? { hp: Math.round(r.hp), ore: Math.round(r.ore) } : { hp: 0 }; }),
      buildings: buildings.filter(alive).map((b) => ({ kind: b.kind, pos: b.pos.toArray(), hp: Math.round(b.hp) })),
      rocks: rocks.map((r) => Math.round(r.amount)),
      commander: { pos: commander.pos.toArray(), hp: commander.hp, queue: commander.queue, bqueue: commander.bqueue, uqueue: commander.uqueue },
      // post: the building (b: its place in the list above) or captured nest (n: the nest's number) a ship stays by
      units: units.filter((u) => alive(u) && u.type !== 'turncoat').map((u) => {
        const s = { type: u.type, pos: u.pos.toArray(), hp: u.hp, cargo: u.cargo };
        if (u.post && alive(u.post)) {
          const bi = buildings.filter(alive).indexOf(u.post);
          if (bi >= 0) s.post = { b: bi, off: u.escort.toArray() };
          else if (u.post.nestIndex !== undefined) s.post = { n: u.post.nestIndex, off: u.escort.toArray() };
        }
        return s;
      })
    };
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(data)); } catch (e) { return; }
    if (announce) say('announce_saved', 60);
  }
  function continueGame() {
    let data = null;
    try { data = JSON.parse(localStorage.getItem(SAVE_KEY)); } catch (e) { data = null; }
    if (!data) { newGame(); return; }
    state = freshState(data.seed);
    Object.assign(state, { time: data.time, steel: data.steel !== undefined ? data.steel : (data.resources || 0), water: data.water || 0, fuel: data.fuel || 0, aluminium: data.aluminium || 0, mined: data.mined, kills: data.kills, up: data.up, nextStrike: data.nextStrike,
      nextRaid: data.nextRaid === undefined ? RAIDS.first : data.nextRaid, raids: data.raids || 0 });
    state.up = Object.assign(freshState(0).up, data.up);
    buildWorld(data.seed, { world: data.world, hives: data.hives, rocks: data.rocks, commander: data.commander, nests: data.nests, rivals: data.rivals });
    data.sectors.forEach((s, i) => Object.assign(sectors[i], s));
    commander.maxHp = 3000 * (1 + 0.25 * state.up.armour);
    commander.hp = data.commander.hp;
    for (const b of data.buildings || []) new Building(b.kind, new THREE.Vector3().fromArray(b.pos), b.hp);
    // older saves kept everything in one queue: split it
    const all = (data.commander.queue || []).concat(data.commander.bqueue || [], data.commander.uqueue || []);
    commander.queue = all.filter((q) => q.kind === 'unit');
    commander.bqueue = all.filter((q) => q.kind === 'building');
    commander.uqueue = all.filter((q) => q.kind === 'upgrade');
    for (const u of data.units) {
      const unit = new Unit(u.type, new THREE.Vector3().fromArray(u.pos));
      unit.hp = Math.min(unit.maxHp, u.hp); unit.cargo = u.cargo || 0;
      if (u.post) {   // the building or captured nest it was told to stay by
        const post = u.post.b !== undefined ? buildings[u.post.b] : outposts.find((o) => o.nestIndex === u.post.n);
        if (post && alive(post)) { unit.post = post; if (u.post.off) unit.escort = new THREE.Vector3().fromArray(u.post.off); }
      }
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
      ' Kills: ' + state.kills + '. Mined: ' + Math.round(state.mined) + '. Time: ' + mins + 'm ' + secs + 's.';
    setTimeout(() => openMenu(won ? 'Victory' : 'The Commander has fallen', text), 1500);
  }

  let checkTimer = 0, saveTimer = 30;
  function step(dt) {
    state.time += dt;
    checkTimer -= dt;
    if (checkTimer <= 0) { checkTimer = 0.5; checkSectors(); if (state.over) return; }
    updateWaves(dt);
    updateRaids(dt);
    if (state.time - netAt > 1) { netAt = state.time; updateNetworks(); }
    colonyIncome(dt);
    state.nextStrike -= dt;
    if (state.nextStrike <= 0) { state.nextStrike = STRIKE.gap[0] + Math.random() * (STRIKE.gap[1] - STRIKE.gap[0]); new Strike(); }
    for (const c of strikes) if (!c.dead) c.update(dt);
    for (let i = strikes.length - 1; i >= 0; i--) if (strikes[i].dead) strikes.splice(i, 1);

    for (const r of rocks) if (!r.dead && d2(r.pos, commander.pos) < 300 * 300) r.update(dt);
    commander.update(dt);
    if (state.over) return;
    for (const h of hives) if (!h.dead) h.update(dt);
    for (const r of rivals) if (!r.dead) r.update(dt);
    for (const b of buildings) if (!b.dead) b.update(dt);
    for (const b of enemyBuildings) if (!b.dead) b.update(dt);
    for (const o of outposts) if (!o.dead) o.update(dt);
    for (const u of units) if (!u.dead) u.update(dt);
    for (const e of enemies) if (!e.dead) e.update(dt);
    for (const h of holes) if (!h.dead) h.update(dt);
    for (let i = holes.length - 1; i >= 0; i--) if (holes[i].dead) holes.splice(i, 1);

    const all = units.concat(enemies.filter((e) => e.kind !== 'turret'));
    const bigs = [commander].concat(hives, rivals, outposts, buildings, enemyBuildings);
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
      for (const big of bigs) {
        if (big.dead) continue;
        v1.subVectors(a.pos, big.pos);
        const d = v1.length(), min = big.radius + a.radius * 0.6;
        if (d < min && d > 0.0001) a.pos.addScaledVector(v1, (min - d) / d);
      }
    }
    for (const list of [units, enemies, hives, buildings, outposts, rivals, enemyBuildings]) for (let i = list.length - 1; i >= 0; i--) if (list[i].dead) list.splice(i, 1);
    if (focus && focus.dead) focus = null;
    if (pilot && pilot.dead) pilot = null;

    // music: the battle track while enemies are close, the calm one otherwise
    if (enemies.some((e) => d2(e.pos, commander.pos) < 80 * 80)) state.lastFight = state.time;
    audio.music(state.time - state.lastFight < 12 ? 'battle' : 'calm');

    saveTimer -= dt;
    if (saveTimer <= 0) { saveTimer = 30; saveGame(); }
  }

  const camQ = new THREE.Quaternion();
  const behind = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.22, Math.PI, 0, 'YXZ'));   // turned round, tipped down

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
    if (pilot && !pilot.dead) {
      // third person: behind and a little above the Pathfinder, looking where it goes
      cam.target.lerp(pilot.pos, Math.min(1, dt * 8));
      camQ.copy(pilot.mesh.quaternion).multiply(behind);
      cam.q.slerp(camQ, Math.min(1, dt * 4));
      cam.dist += (20 - cam.dist) * Math.min(1, dt * 3);
      camTween = null;
    } else {
      const followed = focus && alive(focus) ? focus : commander;
      if (alive(followed)) cam.target.lerp(followed.pos, Math.min(1, dt * 3));   // follow the Commander (or the sphere you jumped to)
    }
    placeCamera();
    edge.position.copy(cam.target);
    updateSphereUnion();
    sky.position.copy(camera.position);
    for (const e of units.concat(enemies, hives, buildings, outposts, rivals, enemyBuildings, [commander])) if (e && e.shieldGlow > 0) e.shieldGlow -= dt;
    if (markerLife > 0) { markerLife -= dt; markerSprite.material.opacity = Math.max(0, markerLife / 0.7); markerSprite.scale.setScalar(3 + (0.7 - markerLife) * 6); if (markerLife <= 0) markerSprite.visible = false; }
    if (msgTimer > 0 && state.running) { msgTimer -= dt; if (msgTimer <= 0) ui.message.style.display = 'none'; }
    updateBars();
    if (state.started) updateHUD();
    drawRadar();
    if (!ui.map.hidden && Math.random() < 0.1) drawMap();
    renderer.render(scene, camera);
  }

  // the battlefield ends where the panel begins (Age of Empires style): the 3D view is the space above it
  let viewW = window.innerWidth, viewH = window.innerHeight;
  function fitView() {
    const panel = $('panel');
    const ph = panel && document.body.classList.contains('playing') ? panel.offsetHeight : 0;
    const w = window.innerWidth, h = Math.max(120, window.innerHeight - ph);
    ui.message.style.bottom = (ph + 10) + 'px';    // messages sit just above the panel
    if (w === viewW && h === viewH) return;
    viewW = w; viewH = h;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  }
  window.addEventListener('resize', fitView);
  setInterval(fitView, 400);                       // the panel's height changes with its contents
  window.addEventListener('pagehide', () => saveGame());

  // the Cursed splash: any key or click goes on to the menu (and starts the sound, which needs a gesture)
  const splash = $('splash');
  function leaveSplash() {
    if (!splash || splash.classList.contains('gone')) return;
    splash.classList.add('gone');
    audio.init();
    audio.music('theme');
    setTimeout(() => { splash.style.display = 'none'; }, 600);
  }
  if (splash) {
    splash.addEventListener('pointerdown', leaveSplash);
    window.addEventListener('keydown', leaveSplash, { once: true });
  }

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
    queueUnit: queueUnit, queueUpgrade: queueUpgrade, cancelItem: cancelItem, queueBuilding: queueBuilding, buildings: buildings, outposts: outposts, rivals: rivals,
    nests: nests, enemyBuildings: enemyBuildings, holes: holes, plantHole: plantHole, startPiloting: startPiloting, stopPiloting: stopPiloting,
    get pilot() { return pilot; }, keys: keys, power: power, nextSphere: nextSphere, Building: Building, Hive: Hive, Outpost: Outpost, select: select, command: command, step: step, newGame: newGame,
    continueGame: continueGame, saveGame: saveGame, toScreen: toScreen, camera: camera, cam: cam, placeCamera: placeCamera,
    lookTowards: lookTowards, travelTo: travelTo, toggleMap: toggleMap, Unit: Unit, Enemy: Enemy, Strike: Strike, fx: fx,
    renderer: renderer, scene: scene, updateWaves: updateWaves, updateRaids: updateRaids
  };
})(window.CC);

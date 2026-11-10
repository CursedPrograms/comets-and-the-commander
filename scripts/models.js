// Comets and the Commander - textures, ship models, backdrop and effects (three.js r128)
window.CC = window.CC || {};
(function (CC) {
  'use strict';

  const COL = { navy: 0x001725, dark: 0x005184, blue: 0x007ab7, light: 0x34a9e3, pink: 0xf088e9, white: 0xffffff, amber: 0xffc977 };

  // ---------- Canvas textures ----------
  function canvasTex(size, draw) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    draw(c.getContext('2d'), size);
    const t = new THREE.CanvasTexture(c);
    return t;
  }

  const glowTex = canvasTex(64, (g, s) => {
    const r = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    r.addColorStop(0, 'rgba(255,255,255,1)');
    r.addColorStop(0.25, 'rgba(255,255,255,0.6)');
    r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r; g.fillRect(0, 0, s, s);
  });

  const ringTex = canvasTex(128, (g, s) => {
    g.strokeStyle = 'rgba(255,255,255,0.9)';
    g.lineWidth = 6;
    g.beginPath(); g.arc(s / 2, s / 2, s / 2 - 8, 0, Math.PI * 2); g.stroke();
  });

  function cloudTex(seed) {
    return canvasTex(256, (g, s) => {
      let x = seed;
      const rnd = () => { x = (x * 9301 + 49297) % 233280; return x / 233280; };
      for (let i = 0; i < 60; i++) {
        const cx = s / 2 + (rnd() - 0.5) * s * 0.6, cy = s / 2 + (rnd() - 0.5) * s * 0.6, r = s * (0.08 + rnd() * 0.22);
        const grd = g.createRadialGradient(cx, cy, 0, cx, cy, r);
        grd.addColorStop(0, 'rgba(255,255,255,' + (0.05 + rnd() * 0.08) + ')');
        grd.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = grd; g.fillRect(0, 0, s, s);
      }
    });
  }

  const planetTex = canvasTex(512, (g, s) => {
    g.fillStyle = '#005184'; g.fillRect(0, 0, s, s);
    const bands = ['#007ab7', '#004068', '#34A9E3', '#00385c', '#0a6aa0', '#001f33'];
    for (let i = 0; i < 70; i++) {
      g.fillStyle = bands[i % bands.length];
      g.globalAlpha = 0.25 + Math.random() * 0.4;
      const y = Math.random() * s, h = 2 + Math.random() * 18;
      g.beginPath();
      g.moveTo(0, y);
      for (let x = 0; x <= s; x += 16) g.lineTo(x, y + Math.sin(x / 40 + i) * 4);
      g.lineTo(s, y + h); g.lineTo(0, y + h); g.closePath(); g.fill();
    }
    g.globalAlpha = 0.5; g.fillStyle = '#f088e9';
    g.beginPath(); g.ellipse(s * 0.62, s * 0.58, 30, 14, 0, 0, Math.PI * 2); g.fill();
    g.globalAlpha = 1;
  });

  function ringSprite(colour, scale) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: ringTex, color: colour, transparent: true, depthTest: false, depthWrite: false }));
    s.scale.set(scale, scale, 1);
    s.renderOrder = 20;
    return s;
  }

  function glowSprite(colour, scale, opacity) {
    const m = new THREE.SpriteMaterial({ map: glowTex, color: colour, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: opacity === undefined ? 1 : opacity });
    const s = new THREE.Sprite(m);
    s.scale.set(scale, scale, 1);
    return s;
  }

  // ---------- Materials ----------
  const matCache = {};
  function mat(colour, opts) {
    const key = colour + JSON.stringify(opts || {});
    if (!matCache[key]) matCache[key] = new THREE.MeshStandardMaterial(Object.assign({ color: colour, metalness: 0.55, roughness: 0.45, flatShading: true }, opts || {}));
    return matCache[key];
  }
  function lightMat(colour) { return mat(0x000000, { emissive: colour, emissiveIntensity: 1, metalness: 0, roughness: 1 }); }

  function mesh(geo, material, x, y, z) {
    const m = new THREE.Mesh(geo, material);
    m.position.set(x || 0, y || 0, z || 0);
    return m;
  }
  function alongZ(geo) { geo.rotateX(Math.PI / 2); return geo; }   // cylinders/cones point along +Z

  // ---------- Ship models (all face +Z, built once and cloned) ----------
  const ENEMY_GLOW = 0x8cff2e;   // acid green for the enemy
  const M = {};
  function materials() {
    if (M.hull) return M;
    M.hull = new THREE.MeshStandardMaterial({ color: 0xc9d6e0, metalness: 0.85, roughness: 0.32 });
    M.hullBlue = new THREE.MeshStandardMaterial({ color: COL.blue, metalness: 0.8, roughness: 0.35 });
    M.hullDark = new THREE.MeshStandardMaterial({ color: COL.dark, metalness: 0.8, roughness: 0.4 });
    M.panel = new THREE.MeshStandardMaterial({ color: 0x18262f, metalness: 0.6, roughness: 0.6 });
    M.glass = new THREE.MeshStandardMaterial({ color: 0x0b3550, metalness: 1, roughness: 0.05, emissive: 0x0a3f66, emissiveIntensity: 0.6 });
    M.stripe = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: COL.pink, emissiveIntensity: 1, metalness: 0, roughness: 1 });
    M.light = new THREE.MeshBasicMaterial({ color: COL.light });
    M.nozzle = new THREE.MeshStandardMaterial({ color: 0x8a98a3, metalness: 0.9, roughness: 0.3, side: THREE.DoubleSide });
    M.nozzleIn = new THREE.MeshBasicMaterial({ color: 0xbfeaff, side: THREE.BackSide });
    M.flame = new THREE.MeshBasicMaterial({ color: COL.light, blending: THREE.AdditiveBlending, transparent: true, opacity: 0.85, depthWrite: false });
    M.hazard = new THREE.MeshStandardMaterial({ color: 0xaab7c0, metalness: 0.7, roughness: 0.4 });
    M.drill = new THREE.MeshStandardMaterial({ color: 0x9aa7b0, metalness: 1, roughness: 0.2 });
    M.eHull = new THREE.MeshStandardMaterial({ color: 0x424a40, metalness: 0.6, roughness: 0.42 });
    M.eHull2 = new THREE.MeshStandardMaterial({ color: 0x232821, metalness: 0.7, roughness: 0.5 });
    M.eGlow = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: ENEMY_GLOW, emissiveIntensity: 1, metalness: 0, roughness: 1 });
    M.eFlame = new THREE.MeshBasicMaterial({ color: ENEMY_GLOW, blending: THREE.AdditiveBlending, transparent: true, opacity: 0.8, depthWrite: false });
    return M;
  }

  function part(geo, material, x, y, z, parent) {
    const m = new THREE.Mesh(geo, material);
    m.position.set(x || 0, y || 0, z || 0);
    if (parent) parent.add(m);
    return m;
  }

  // outline seen from above: pts are [x, z]; extruded to a thickness along Y
  function topHull(pts, thick, bevel) {
    const s = new THREE.Shape(pts.map((p) => new THREE.Vector2(p[0], p[1])));
    const g = new THREE.ExtrudeGeometry(s, { depth: thick, bevelEnabled: true, bevelThickness: bevel || 0.05, bevelSize: bevel || 0.05, bevelSegments: 2, curveSegments: 6 });
    g.rotateX(Math.PI / 2);          // shape y -> +z, depth -> -y
    g.translate(0, thick / 2, 0);
    return g;
  }
  // outline seen from the side: pts are [z, y]; extruded to a width along X
  function sideHull(pts, width, bevel) {
    const s = new THREE.Shape(pts.map((p) => new THREE.Vector2(p[0], p[1])));
    const g = new THREE.ExtrudeGeometry(s, { depth: width, bevelEnabled: true, bevelThickness: bevel || 0.06, bevelSize: bevel || 0.06, bevelSegments: 2, curveSegments: 6 });
    g.rotateY(-Math.PI / 2);         // shape x -> +z, depth -> -x
    g.translate(width / 2, 0, 0);
    return g;
  }
  // engine bell pointing backwards (-Z) with a glowing throat and a flame plume
  // fm: faction materials {hull, hull2, glow, flame, colour}; true = the default enemy look
  function fmats(enemy) {
    if (!enemy) return null;
    if (enemy === true) return { hull: M.eHull, hull2: M.eHull2, glow: M.eGlow, flame: M.eFlame, colour: ENEMY_GLOW };
    return enemy;
  }
  function engine(parent, x, y, z, r, len, enemy) {
    enemy = fmats(enemy);
    const e = new THREE.Group();
    const prof = [new THREE.Vector2(r * 0.75, 0), new THREE.Vector2(r, len * 0.3), new THREE.Vector2(r * 0.85, len * 0.6), new THREE.Vector2(r * 1.15, len)];
    const bell = new THREE.LatheGeometry(prof, 16); bell.rotateX(-Math.PI / 2);
    e.add(new THREE.Mesh(bell, M.nozzle));
    const throat = new THREE.CircleGeometry(r * 0.8, 16); throat.rotateY(Math.PI);
    part(throat, enemy ? enemy.glow : M.light, 0, 0, -len * 0.35, e);
    const flame = new THREE.LatheGeometry([new THREE.Vector2(r * 0.8, 0), new THREE.Vector2(r * 0.55, 0.4), new THREE.Vector2(0.01, 1)], 12);
    flame.rotateX(-Math.PI / 2);
    const plume = part(flame, enemy ? enemy.flame : M.flame, 0, 0, -len * 0.9, e);
    plume.scale.set(1, 1, len * 2.2);
    plume.userData.plume = len * 2.2;
    const glow = glowSprite(enemy ? enemy.colour : COL.light, r * 5, 0.8); glow.position.z = -len; e.add(glow);
    glow.userData.engineGlow = r * 5;
    e.position.set(x, y, z);
    e.userData.engine = true;
    parent.add(e);
    return e;
  }
  function turret(parent, x, y, z, s, enemy) {
    enemy = fmats(enemy);
    const t = new THREE.Group();
    part(new THREE.CylinderGeometry(0.45 * s, 0.55 * s, 0.25 * s, 12), enemy ? enemy.hull2 : M.hullDark, 0, 0, 0, t);
    const head = part(new THREE.BoxGeometry(0.7 * s, 0.35 * s, 0.75 * s), enemy ? enemy.hull : M.hull, 0, 0.25 * s, 0, t);
    for (const bx of [-0.15, 0.15]) part(alongZ(new THREE.CylinderGeometry(0.06 * s, 0.07 * s, 1.1 * s, 6)), M.panel, bx * s, 0.27 * s, 0.75 * s, t);
    head.add(part(new THREE.BoxGeometry(0.72 * s, 0.05 * s, 0.2 * s), enemy ? enemy.glow : M.stripe, 0, 0.12 * s, -0.2 * s));
    t.position.set(x, y, z);
    t.userData.turret = true;
    parent.add(t);
    return t;
  }

  function buildFighter() {
    const g = new THREE.Group();
    // delta wing
    part(topHull([[0, 2.0], [0.45, 0.6], [1.9, -0.9], [1.9, -1.25], [0.5, -1.0], [0, -1.3], [-0.5, -1.0], [-1.9, -1.25], [-1.9, -0.9], [-0.45, 0.6]], 0.12, 0.04), M.hull, 0, 0, 0, g);
    // raised fuselage
    part(sideHull([[2.2, 0], [1.2, 0.28], [0.2, 0.42], [-0.9, 0.45], [-1.4, 0.3], [-1.4, -0.15], [0.6, -0.2]], 0.62, 0.08), M.hullBlue, 0, 0, 0, g);
    // canopy
    const c = part(new THREE.SphereGeometry(0.28, 14, 10), M.glass, 0, 0.45, 0.55, g); c.scale.set(0.9, 0.7, 2.2);
    // pink stripes on the wings
    for (const sx of [-1, 1]) {
      const st = part(new THREE.BoxGeometry(1.25, 0.03, 0.12), M.stripe, sx * 1.0, 0.1, -0.35, g); st.rotation.y = sx * 0.55;
      const fin = part(sideHull([[0.0, 0], [-0.5, 0.75], [-0.8, 0.75], [-0.7, 0]], 0.06, 0.02), M.hullDark, sx * 0.42, 0.2, -0.45, g);
      fin.rotation.z = -sx * 0.35;
      // wingtip cannons
      part(alongZ(new THREE.CylinderGeometry(0.05, 0.07, 1.2, 6)), M.panel, sx * 1.8, 0, -0.4, g);
      part(new THREE.SphereGeometry(0.06, 6, 4), M.light, sx * 1.8, 0, 0.2, g);
    }
    // panel lines
    part(new THREE.BoxGeometry(0.64, 0.03, 0.05), M.panel, 0, 0.44, -0.3, g);
    part(new THREE.BoxGeometry(0.05, 0.03, 1.2), M.panel, 0, 0.46, -0.8, g);
    engine(g, 0.2, 0.1, -1.4, 0.16, 0.45);
    engine(g, -0.2, 0.1, -1.4, 0.16, 0.45);
    return g;
  }

  function buildCruiser() {
    const g = new THREE.Group();
    // main hull, side profile with a stepped superstructure
    part(sideHull([[4.6, -0.1], [3.4, 0.35], [1.0, 0.55], [-3.4, 0.55], [-3.8, 0.2], [-3.8, -0.6], [-1.0, -0.8], [3.0, -0.6]], 2.0, 0.12), M.hull, 0, 0, 0, g);
    // armoured prow / flank plates, top view
    part(topHull([[0, 5.2], [1.6, 2.6], [1.8, -1.5], [1.4, -3.6], [-1.4, -3.6], [-1.8, -1.5], [-1.6, 2.6]], 0.3, 0.08), M.hullBlue, 0, -0.35, 0, g);
    // superstructure and bridge
    part(sideHull([[0.4, 0.55], [-0.3, 1.35], [-2.0, 1.35], [-2.4, 0.55]], 1.1, 0.06), M.hull, 0, 0, 0, g);
    part(new THREE.BoxGeometry(1.0, 0.18, 0.3), M.glass, 0, 1.18, 0.05, g);
    part(new THREE.CylinderGeometry(0.03, 0.03, 1.2, 4), M.panel, 0.3, 1.9, -1.5, g);
    part(new THREE.CylinderGeometry(0.03, 0.03, 0.8, 4), M.panel, -0.3, 1.7, -1.8, g);
    part(new THREE.SphereGeometry(0.06, 6, 4), M.stripe, 0.3, 2.5, -1.5, g);
    // team stripes and panel lines
    for (const sx of [-1, 1]) {
      part(new THREE.BoxGeometry(0.05, 0.12, 6.2), M.stripe, sx * 1.07, 0.05, 0.4, g);
      part(new THREE.BoxGeometry(0.05, 0.05, 6.6), M.panel, sx * 1.07, -0.3, 0.2, g);
      for (let i = 0; i < 6; i++) part(new THREE.BoxGeometry(0.04, 0.1, 0.16), M.light, sx * 1.07, 0.3, 2.4 - i * 0.9, g);
      // engine pods
      part(alongZ(new THREE.CylinderGeometry(0.45, 0.5, 2.6, 12)), M.hullDark, sx * 1.55, -0.2, -2.6, g);
      engine(g, sx * 1.55, -0.2, -3.9, 0.42, 0.9);
    }
    for (let z = -0.6; z >= -3.2; z -= 0.65) part(new THREE.BoxGeometry(2.04, 0.04, 0.05), M.panel, 0, 0.56, z, g);
    engine(g, 0, 0, -3.9, 0.5, 1.0);
    turret(g, 0, 0.58, 2.6, 1.0);
    turret(g, 0, 0.62, 1.4, 0.9);
    turret(g, 0, 1.4, -1.0, 0.75);
    return g;
  }

  function buildHarvester() {
    const g = new THREE.Group();
    // chassis frame
    part(new THREE.BoxGeometry(1.6, 0.35, 3.0), M.hullDark, 0, -0.35, -0.2, g);
    // cab
    part(sideHull([[1.5, -0.2], [1.5, 0.4], [1.0, 0.8], [0.2, 0.8], [0.2, -0.2]], 1.2, 0.08), M.hazard, 0, 0, 0, g);
    part(sideHull([[1.47, 0.42], [1.02, 0.78], [0.95, 0.78], [1.4, 0.42]], 1.0, 0.02), M.glass, 0, 0.02, 0.05, g);
    // hazard stripes
    for (let i = 0; i < 4; i++) { const h = part(new THREE.BoxGeometry(0.12, 0.36, 0.03), M.stripe, -0.45 + i * 0.3, 0.1, 1.58, g); h.rotation.z = 0.6; }
    // cargo containers
    for (const sx of [-1, 1]) for (const z of [-0.4, -1.3]) {
      part(new THREE.BoxGeometry(0.7, 0.7, 0.8), M.hullBlue, sx * 0.42, 0.18, z, g);
      part(new THREE.BoxGeometry(0.72, 0.06, 0.82), M.panel, sx * 0.42, 0.42, z, g);
    }
    // drill on an arm
    const arm = new THREE.Group();
    part(new THREE.BoxGeometry(0.25, 0.25, 1.0), M.panel, 0, 0, 0.4, arm);
    const drill = new THREE.Group();
    const cone = new THREE.LatheGeometry([new THREE.Vector2(0.38, 0), new THREE.Vector2(0.3, 0.4), new THREE.Vector2(0.15, 0.85), new THREE.Vector2(0.01, 1.2)], 12);
    cone.rotateX(Math.PI / 2);
    part(cone, M.drill, 0, 0, 0, drill);
    for (let i = 0; i < 3; i++) { const r = part(new THREE.TorusGeometry(0.3 - i * 0.08, 0.035, 4, 14), M.stripe, 0, 0, 0.25 + i * 0.3, drill); }
    drill.position.z = 0.95;
    drill.userData.drill = true;
    arm.add(drill);
    arm.position.set(0, -0.35, 1.3);
    g.add(arm);
    // scoop jaws
    for (const sx of [-1, 1]) { const j = part(new THREE.BoxGeometry(0.1, 0.5, 1.0), M.hazard, sx * 0.7, -0.35, 1.8, g); j.rotation.y = -sx * 0.35; }
    engine(g, 0.5, -0.3, -1.8, 0.24, 0.5);
    engine(g, -0.5, -0.3, -1.8, 0.24, 0.5);
    return g;
  }

  function buildCarrier() {
    const g = new THREE.Group();
    // long hull, side profile
    part(sideHull([[11, -0.5], [8.5, 1.2], [-8, 1.2], [-10, 0.6], [-10, -1.6], [-6, -2.4], [7, -2.0]], 5.0, 0.25), M.hull, 0, 0, 0, g);
    // flight deck, top view
    part(topHull([[0, 12], [2.0, 9.5], [3.6, 3], [3.6, -9.5], [-3.6, -9.5], [-3.6, 3], [-2.0, 9.5]], 0.3, 0.1), M.hullDark, 0, 1.35, 0, g);
    // deck markings
    for (let z = 8; z > -8; z -= 2) part(new THREE.BoxGeometry(0.2, 0.02, 0.9), M.light, 0, 1.68, z, g);
    part(new THREE.BoxGeometry(0.08, 0.02, 18), M.stripe, 2.8, 1.68, 0, g);
    part(new THREE.BoxGeometry(0.08, 0.02, 18), M.stripe, -2.8, 1.68, 0, g);
    // island / bridge tower
    part(sideHull([[-1, 1.5], [-1.6, 4.4], [-4.6, 4.4], [-5.4, 1.5]], 1.6, 0.1), M.hullBlue, 3.3, 0, 0, g);
    part(new THREE.BoxGeometry(1.7, 0.4, 0.5), M.glass, 3.3, 3.9, -1.3, g);
    part(new THREE.CylinderGeometry(0.06, 0.06, 2.5, 5), M.panel, 3.3, 5.6, -3.4, g);
    const dish = part(new THREE.SphereGeometry(0.6, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), M.hull, 3.3, 4.7, -4.0, g); dish.rotation.x = 2.2;
    // hangar bays along the sides
    for (const sx of [-1, 1]) {
      part(new THREE.BoxGeometry(0.1, 0.8, 9), M.panel, sx * 2.56, -0.4, 1.5, g);
      for (let i = 0; i < 6; i++) part(new THREE.BoxGeometry(0.06, 0.5, 1.0), M.light, sx * 2.6, -0.4, 5.3 - i * 1.5, g);
      part(new THREE.BoxGeometry(0.06, 0.25, 19), M.stripe, sx * 2.6, 0.6, 0.5, g);
      // flank armour
      part(topHull([[0, 6], [1.2, 4], [1.2, -6], [0, -7]].map((p) => [p[0] * sx, p[1]]), 1.6, 0.12), M.hullBlue, sx * 2.6, -1.2, 0, g);
      turret(g, sx * 3.4, -0.3, 5, 1.2);
      turret(g, sx * 3.4, -0.3, -3, 1.2);
    }
    // deck modules, elevators and a keel
    for (const sx of [-1, 1]) {
      for (const z of [-2.5, -6]) {
        part(new THREE.BoxGeometry(1.0, 0.7, 2.4), M.hull, sx * 2.9, 1.95, z, g);
        part(new THREE.BoxGeometry(1.02, 0.08, 2.42), M.stripe, sx * 2.9, 2.0, z, g);
      }
      part(new THREE.BoxGeometry(1.6, 0.03, 1.6), M.hull, sx * 1.3, 1.67, 5.5, g);
    }
    part(topHull([[0, 9], [1.6, 6], [1.6, -8], [-1.6, -8], [-1.6, 6]], 1.0, 0.1), M.hullDark, 0, -2.6, 0, g);
    for (let i = 0; i < 5; i++) part(new THREE.BoxGeometry(1.4, 0.08, 0.1), M.light, 3.3, 2.0 + i * 0.45, -0.98, g);
    part(new THREE.BoxGeometry(0.1, 1.8, 0.1), M.panel, 3.3, 5.3, -2.2, g);
    part(new THREE.BoxGeometry(1.2, 0.1, 0.1), M.panel, 3.3, 5.8, -2.2, g);
    // bow hangar mouth
    part(new THREE.BoxGeometry(3.2, 0.9, 0.1), M.light, 0, 0.1, 9.35, g);
    // engine block
    part(new THREE.BoxGeometry(5.4, 2.8, 2.2), M.hullDark, 0, -0.2, -9.6, g);
    part(new THREE.BoxGeometry(5.5, 0.15, 2.25), M.stripe, 0, 0.6, -9.6, g);
    for (const ex of [-1.6, 0, 1.6]) engine(g, ex, -0.2, -10.7, 0.8, 1.6);
    return g;
  }

  function buildRaider() {
    const g = new THREE.Group();
    // crescent claw hull
    part(topHull([[0, 2.0], [0.5, 0.6], [1.9, 1.3], [1.4, -0.3], [2.1, -1.5], [0.5, -1.0], [0, -1.4], [-0.5, -1.0], [-2.1, -1.5], [-1.4, -0.3], [-1.9, 1.3], [-0.5, 0.6]], 0.16, 0.05), M.eHull, 0, 0, 0, g);
    part(sideHull([[2.0, 0], [0.8, 0.35], [-1.2, 0.3], [-1.4, -0.1], [0.5, -0.25]], 0.55, 0.06), M.eHull2, 0, 0, 0, g);
    const eye = part(new THREE.SphereGeometry(0.16, 10, 8), M.eGlow, 0, 0.3, 1.0, g); eye.scale.set(1.6, 0.6, 1);
    for (const sx of [-1, 1]) {
      const s = part(new THREE.BoxGeometry(0.06, 0.04, 1.3), M.eGlow, sx * 1.3, 0.12, 0.4, g); s.rotation.y = -sx * 0.6;
      part(new THREE.ConeGeometry(0.08, 0.6, 5), M.eHull2, sx * 1.9, 0, 1.6, g).rotation.x = Math.PI / 2;
    }
    engine(g, 0, 0.05, -1.3, 0.2, 0.45, true);
    return g;
  }

  function buildDestroyer() {
    const g = new THREE.Group();
    part(sideHull([[5, 0], [2.5, 0.9], [-3.5, 1.0], [-4.2, 0.2], [-4.2, -0.9], [2, -0.8]], 1.8, 0.14), M.eHull, 0, 0, 0, g);
    part(topHull([[0, 4.5], [2.6, -0.5], [3.4, -3.5], [1.4, -2.8], [0, -4.2], [-1.4, -2.8], [-3.4, -3.5], [-2.6, -0.5]], 0.25, 0.08), M.eHull2, 0, -0.2, 0, g);
    for (const sx of [-1, 1]) {
      part(new THREE.BoxGeometry(0.05, 0.1, 6), M.eGlow, sx * 0.95, 0.3, 0.3, g);
      for (let i = 0; i < 3; i++) {
        const sp = part(new THREE.ConeGeometry(0.18, 1.6, 5), M.eHull2, sx * (1.2 + i * 0.5), 0.2, 1.5 - i * 1.6, g);
        sp.rotation.z = -sx * 1.1;
      }
      engine(g, sx * 0.8, 0, -4.3, 0.4, 0.8, true);
    }
    turret(g, 0, 1.0, 1.5, 1.0, true);
    turret(g, 0, 1.0, -1.2, 1.0, true);
    return g;
  }

  const templates = {};
  function make(name, builder) {
    materials();
    if (!templates[name]) templates[name] = builder();
    const g = templates[name].clone(true);
    const info = { group: g, engines: [], turrets: [], drill: null };
    g.traverse((o) => {
      if (o.userData.engine) info.engines.push(o);
      if (o.userData.turret) info.turrets.push(o);
      if (o.userData.drill) info.drill = o;
    });
    return info;
  }
  function fighter() { const m = make('fighter', buildFighter); m.size = 1.9; return m; }
  function cruiser() { const m = make('cruiser', buildCruiser); m.size = 4.6; return m; }
  function harvester() { const m = make('harvester', buildHarvester); m.size = 2.2; return m; }
  function raider() { const m = make('raider', buildRaider); m.size = 2.0; return m; }
  function destroyer() { const m = make('destroyer', buildDestroyer); m.size = 4.6; return m; }
  function mothership() {
    const m = make('carrier', buildCarrier);
    m.size = 11;
    return m;
  }

  // ---------- Your buildings: they float where they're built (all face +Z) ----------
  function buildSolar() {
    const g = new THREE.Group();
    part(new THREE.CylinderGeometry(1.2, 1.4, 2.4, 10), M.hullDark, 0, 0, 0, g);
    part(new THREE.CylinderGeometry(1.25, 1.25, 0.2, 10), M.stripe, 0, 0.6, 0, g);
    const panelMat = new THREE.MeshStandardMaterial({ color: 0x0b2a4a, metalness: 0.9, roughness: 0.2, emissive: 0x062040, emissiveIntensity: 0.5 });
    for (let i = 0; i < 4; i++) {
      const arm = new THREE.Group();
      part(new THREE.BoxGeometry(0.25, 0.25, 3.2), M.panel, 0, 0, 2.6, arm);
      for (let k = 0; k < 3; k++) {
        part(new THREE.BoxGeometry(2.6, 0.08, 1.5), panelMat, 0, 0, 2.0 + k * 1.65, arm);
        part(new THREE.BoxGeometry(2.62, 0.09, 0.06), M.light, 0, 0, 2.0 + k * 1.65 + 0.76, arm);
        part(new THREE.BoxGeometry(0.05, 0.09, 1.5), M.hull, 0, 0, 2.0 + k * 1.65, arm);
      }
      arm.rotation.y = i * Math.PI / 2;
      g.add(arm);
    }
    const core = glowSprite(COL.amber, 6, 0.8); core.position.y = 1.6; g.add(core);
    part(new THREE.SphereGeometry(0.6, 12, 8), M.light, 0, 1.4, 0, g);
    return g;
  }
  function buildRefinery() {
    const g = new THREE.Group();
    part(new THREE.BoxGeometry(5, 2.6, 4), M.hull, 0, 0, 0, g);
    part(new THREE.BoxGeometry(5.05, 0.25, 4.05), M.stripe, 0, 0.9, 0, g);
    for (const sx of [-1.6, 0, 1.6]) {
      part(new THREE.CylinderGeometry(0.8, 0.8, 3.2, 12), M.hullBlue, sx, 2.6, -0.6, g);
      part(new THREE.SphereGeometry(0.8, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), M.hullBlue, sx, 4.2, -0.6, g);
      part(new THREE.TorusGeometry(0.82, 0.06, 4, 16), M.light, sx, 3.2, -0.6, g).rotation.x = Math.PI / 2;
    }
    part(new THREE.TorusGeometry(1.6, 0.25, 8, 24), M.hullDark, 0, 0, 2.4, g);
    part(new THREE.TorusGeometry(1.6, 0.08, 6, 24), M.stripe, 0, 0, 2.55, g);
    part(new THREE.BoxGeometry(0.4, 0.4, 3), M.panel, 2.8, -0.8, 0, g);
    return g;
  }
  function buildTech() {
    const g = new THREE.Group();
    part(new THREE.CylinderGeometry(2.6, 3.2, 1.4, 8), M.hullDark, 0, -0.6, 0, g);
    part(new THREE.SphereGeometry(2.3, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), M.glass, 0, 0, 0, g);
    for (let i = 0; i < 3; i++) {
      const r = part(new THREE.TorusGeometry(3.2 + i * 0.6, 0.08, 6, 40), i === 1 ? M.stripe : M.light, 0, 0.6, 0, g);
      r.rotation.x = Math.PI / 2 + i * 0.5; r.rotation.y = i * 0.8;
    }
    part(new THREE.CylinderGeometry(0.08, 0.08, 4, 5), M.panel, 0, 3, 0, g);
    const tip = glowSprite(COL.pink, 3, 0.9); tip.position.y = 5.1; g.add(tip);
    return g;
  }
  function buildTurretPlatform() {
    const g = new THREE.Group();
    part(new THREE.CylinderGeometry(2.2, 2.2, 0.5, 6), M.hullDark, 0, 0, 0, g);
    part(new THREE.CylinderGeometry(2.25, 2.25, 0.12, 6), M.stripe, 0, 0.2, 0, g);
    part(new THREE.ConeGeometry(1.2, 1.8, 6), M.hull, 0, -1.1, 0, g).rotation.x = Math.PI;
    turret(g, -0.9, 0.3, 0, 1.6); turret(g, 0.9, 0.3, 0, 1.6);
    return g;
  }
  function buildShipyard() {
    const g = new THREE.Group();
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) part(new THREE.BoxGeometry(0.35, 0.35, 10), M.hull, sx * 2.6, sy * 1.8, 0, g);
    for (let z = -4.5; z <= 4.5; z += 3) {
      part(new THREE.BoxGeometry(5.6, 0.3, 0.3), M.hullDark, 0, 1.8, z, g);
      part(new THREE.BoxGeometry(5.6, 0.3, 0.3), M.hullDark, 0, -1.8, z, g);
      for (const sx of [-1, 1]) part(new THREE.BoxGeometry(0.3, 3.6, 0.3), M.hullDark, sx * 2.6, 0, z, g);
      part(new THREE.BoxGeometry(0.15, 0.15, 0.15), M.light, 2.8, 1.9, z, g);
      part(new THREE.BoxGeometry(0.15, 0.15, 0.15), M.stripe, -2.8, 1.9, z, g);
    }
    part(new THREE.BoxGeometry(2.4, 1.4, 2.6), M.hullBlue, 0, 2.8, -4, g);
    part(new THREE.BoxGeometry(1.8, 0.3, 0.1), M.glass, 0, 2.9, -2.65, g);
    return g;
  }
  function buildRepairDock() {
    const g = new THREE.Group();
    part(new THREE.TorusGeometry(3, 0.45, 8, 32), M.hull, 0, 0, 0, g);
    part(new THREE.TorusGeometry(3, 0.12, 6, 32), M.light, 0, 0, 0.45, g);
    part(new THREE.SphereGeometry(1, 14, 10), M.hullBlue, 0, 0, 0, g);
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI / 2;
      const arm = part(new THREE.BoxGeometry(0.25, 2.2, 0.25), M.panel, Math.cos(a) * 1.9, Math.sin(a) * 1.9, 0, g);
      arm.rotation.z = a - Math.PI / 2;
    }
    g.add(glowSprite(COL.light, 5, 0.7));
    return g;
  }
  // your very special ship: twice a cruiser, with a lance at the bow
  function buildDreadnought() {
    const g = new THREE.Group();
    const c = buildCruiser(); c.scale.setScalar(2); g.add(c);
    part(alongZ(new THREE.CylinderGeometry(0.25, 0.5, 6, 8)), M.hullDark, 0, 0.3, 11, g);
    part(alongZ(new THREE.CylinderGeometry(0.12, 0.12, 6.2, 6)), M.stripe, 0, 0.75, 11, g);
    const tip = glowSprite(COL.pink, 4, 0.9); tip.position.set(0, 0.3, 14.2); g.add(tip);
    for (const sx of [-1, 1]) turret(g, sx * 2.6, 0.4, -2, 1.4);
    return g;
  }
  // the Usurper: takes over hives with its ring
  function buildCaptor() {
    const g = new THREE.Group();
    part(sideHull([[1.8, 0], [0.8, 0.5], [-1.4, 0.5], [-1.8, 0], [-1.4, -0.5], [0.8, -0.4]], 1.2, 0.08), M.hullBlue, 0, 0, 0, g);
    part(new THREE.TorusGeometry(1.5, 0.16, 8, 28), M.hull, 0, 0, 0.6, g);
    part(new THREE.TorusGeometry(1.5, 0.06, 6, 28), M.stripe, 0, 0, 0.75, g);
    part(alongZ(new THREE.ConeGeometry(0.35, 1.2, 8)), M.light, 0, 0, 2.2, g);
    engine(g, 0.4, 0, -1.9, 0.22, 0.45); engine(g, -0.4, 0, -1.9, 0.22, 0.45);
    return g;
  }
  function solar() { const m = make('solar', buildSolar); m.size = 5; return m; }
  function refinery() { const m = make('refinery', buildRefinery); m.size = 4.5; return m; }
  function tech() { const m = make('tech', buildTech); m.size = 4.5; return m; }
  function turretPlatform() { const m = make('turretPlatform', buildTurretPlatform); m.size = 3; return m; }
  function shipyard() { const m = make('shipyard', buildShipyard); m.size = 5.5; return m; }
  function repairDock() { const m = make('repairDock', buildRepairDock); m.size = 4; return m; }
  function dreadnought() { const m = make('dreadnought', buildDreadnought); m.size = 9; return m; }
  function captor() { const m = make('captor', buildCaptor); m.size = 2.4; return m; }
  // a rival Overlord: the carrier in its faction's colours
  const rivalTemplates = {};
  function rivalCarrier(f) {
    materials();
    if (!rivalTemplates[f.id]) {
      const g = buildCarrier();
      g.traverse((o) => {
        if (o.isSprite) { o.material = o.material.clone(); o.material.color.setHex(f.glow); return; }
        if (!o.isMesh) return;
        if (o.material === M.hull || o.material === M.hazard) o.material = f.mats.hull;
        else if (o.material === M.hullBlue || o.material === M.hullDark) o.material = f.mats.hull2;
        else if (o.material === M.stripe || o.material === M.light) o.material = f.mats.glow;
        else if (o.material === M.flame) o.material = f.mats.flame;
      });
      rivalTemplates[f.id] = g;
    }
    const g = rivalTemplates[f.id].clone(true);
    const info = { group: g, engines: [], turrets: [], drill: null, size: 11 };
    g.traverse((o) => { if (o.userData.engine) info.engines.push(o); if (o.userData.turret) info.turrets.push(o); });
    return info;
  }

  // kind 'nest': the hive you capture (pods round a glowing heart, a cage of rings); otherwise a spire to destroy
  function hive(f, kind) {
    materials();
    const fm = f ? f.mats : fmats(true);
    const nest = kind === 'nest';
    const shape = nest ? 'pods' : (f ? f.hive : 'spikes');
    const g = new THREE.Group();
    g.add(part(new THREE.IcosahedronGeometry(4.5, shape === 'smooth' ? 2 : 1), fm.hull));
    const dirs = new THREE.IcosahedronGeometry(1, 0).attributes.position;
    const seen = {};
    for (let i = 0; i < dirs.count; i++) {
      const v = new THREE.Vector3(dirs.getX(i), dirs.getY(i), dirs.getZ(i)).normalize();
      const k = v.toArray().map((n) => n.toFixed(2)).join();
      if (seen[k]) continue; seen[k] = 1;
      let spike;
      if (shape === 'pods') spike = part(new THREE.SphereGeometry(1.1, 10, 8), fm.hull2);
      else if (shape === 'blocks') spike = part(new THREE.BoxGeometry(1.4, 2.4, 1.4), fm.hull2);
      else spike = part(new THREE.ConeGeometry(0.8, 4.5, 6), fm.hull2);
      spike.position.copy(v).multiplyScalar(shape === 'spikes' ? 5.6 : 4.8);
      spike.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), v);
      g.add(spike);
      const tip = glowSprite(fm.colour, 1.8); tip.position.copy(v).multiplyScalar(shape === 'spikes' ? 8 : 6.2); g.add(tip);
    }
    g.add(part(new THREE.TorusGeometry(6.2, 0.3, 6, 40), fm.glow));
    const ring2 = part(new THREE.TorusGeometry(7.2, 0.15, 6, 40), fm.glow); ring2.rotation.x = Math.PI / 2; g.add(ring2);
    if (nest) {
      for (let i = 0; i < 3; i++) { const r = part(new THREE.TorusGeometry(9, 0.12, 6, 48), fm.glow); r.rotation.set(i * 1.05, i * 0.6, 0); g.add(r); }
      g.scale.setScalar(0.85);
    }
    const core = glowSprite(nest ? 0xffffff : fm.colour, nest ? 22 : 18, 0.55); g.add(core);
    return { group: g, core: core, size: nest ? 7.5 : 7 };
  }

  // ---------- Faction ships: shapes coloured by each sector's materials ----------
  function factionMats(hullColour, hull2Colour, glowColour) {
    materials();
    return {
      hull: new THREE.MeshStandardMaterial({ color: hullColour, metalness: 0.65, roughness: 0.4 }),
      hull2: new THREE.MeshStandardMaterial({ color: hull2Colour, metalness: 0.7, roughness: 0.5 }),
      glow: new THREE.MeshStandardMaterial({ color: 0x000000, emissive: glowColour, emissiveIntensity: 1, metalness: 0, roughness: 1 }),
      flame: new THREE.MeshBasicMaterial({ color: glowColour, blending: THREE.AdditiveBlending, transparent: true, opacity: 0.8, depthWrite: false }),
      colour: glowColour
    };
  }

  const SHAPES = {
    // light ships
    claw(m) {
      const g = new THREE.Group();
      part(topHull([[0, 2.0], [0.5, 0.6], [1.9, 1.3], [1.4, -0.3], [2.1, -1.5], [0.5, -1.0], [0, -1.4], [-0.5, -1.0], [-2.1, -1.5], [-1.4, -0.3], [-1.9, 1.3], [-0.5, 0.6]], 0.16, 0.05), m.hull, 0, 0, 0, g);
      part(sideHull([[2.0, 0], [0.8, 0.35], [-1.2, 0.3], [-1.4, -0.1], [0.5, -0.25]], 0.55, 0.06), m.hull2, 0, 0, 0, g);
      const eye = part(new THREE.SphereGeometry(0.16, 10, 8), m.glow, 0, 0.3, 1.0, g); eye.scale.set(1.6, 0.6, 1);
      for (const sx of [-1, 1]) { const st = part(new THREE.BoxGeometry(0.06, 0.04, 1.3), m.glow, sx * 1.3, 0.12, 0.4, g); st.rotation.y = -sx * 0.6; }
      engine(g, 0, 0.05, -1.3, 0.2, 0.45, m);
      return { g: g, size: 2.0 };
    },
    dart(m) {
      const g = new THREE.Group();
      part(sideHull([[2.6, 0], [1.0, 0.3], [-1.6, 0.35], [-1.8, -0.1], [-1.6, -0.3], [1.0, -0.2]], 0.5, 0.05), m.hull, 0, 0, 0, g);
      for (const sx of [-1, 1]) {
        const fin = part(topHull([[0, 0.4], [1.3, -1.2], [1.3, -1.5], [0, -1.0]].map((p) => [p[0] * sx, p[1]]), 0.08, 0.03), m.hull2, 0, 0, 0, g);
        fin.rotation.z = sx * 0.25;
        part(new THREE.BoxGeometry(0.05, 0.05, 1.0), m.glow, sx * 0.9, 0.12, -0.7, g);
      }
      part(new THREE.SphereGeometry(0.14, 8, 6), m.glow, 0, 0.3, 0.8, g);
      engine(g, 0, 0, -1.8, 0.22, 0.5, m);
      return { g: g, size: 1.9 };
    },
    saucer(m) {
      const g = new THREE.Group();
      const disc = new THREE.LatheGeometry([new THREE.Vector2(0.01, -0.35), new THREE.Vector2(1.4, -0.12), new THREE.Vector2(1.6, 0), new THREE.Vector2(1.2, 0.2), new THREE.Vector2(0.5, 0.45), new THREE.Vector2(0.01, 0.5)], 18);
      part(disc, m.hull, 0, 0, 0, g);
      part(new THREE.TorusGeometry(1.45, 0.06, 6, 30), m.glow, 0, 0, 0, g).rotation.x = Math.PI / 2;
      part(new THREE.SphereGeometry(0.42, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), m.glow, 0, 0.35, 0, g);
      for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; part(new THREE.BoxGeometry(0.2, 0.12, 0.5), m.hull2, Math.cos(a) * 1.0, 0.12, Math.sin(a) * 1.0, g).rotation.y = -a; }
      engine(g, 0, -0.1, -1.4, 0.2, 0.4, m);
      return { g: g, size: 1.9 };
    },
    spiky(m) {
      const g = new THREE.Group();
      const core = part(new THREE.OctahedronGeometry(0.9), m.hull, 0, 0, 0, g); core.scale.set(0.8, 0.6, 1.8);
      for (let i = 0; i < 8; i++) {
        const a = i / 8 * Math.PI * 2;
        const sp = part(new THREE.ConeGeometry(0.12, 1.4, 4), m.hull2, Math.cos(a) * 0.7, Math.sin(a) * 0.5, -0.2, g);
        sp.rotation.z = a - Math.PI / 2; sp.rotation.x = -0.4;
      }
      part(alongZ(new THREE.ConeGeometry(0.2, 1.2, 6)), m.glow, 0, 0, 1.9, g);
      engine(g, 0, 0, -1.6, 0.24, 0.45, m);
      return { g: g, size: 1.9 };
    },
    orb(m) {
      const g = new THREE.Group();
      part(new THREE.IcosahedronGeometry(1.1, 1), m.hull, 0, 0, 0, g);
      for (const sx of [-1, 1]) part(new THREE.TorusGeometry(1.25, 0.08, 6, 24), m.glow, 0, 0, 0, g).rotation.set(Math.PI / 2, sx * 0.5, 0);
      for (const sx of [-1, 1]) part(new THREE.BoxGeometry(0.3, 0.3, 1.2), m.hull2, sx * 1.2, 0, -0.4, g);
      part(new THREE.SphereGeometry(0.3, 10, 8), m.glow, 0, 0, 1.0, g);
      engine(g, 0, 0, -1.2, 0.25, 0.4, m);
      return { g: g, size: 1.9 };
    },
    // heavy ships
    wedge(m) {
      const g = new THREE.Group();
      part(sideHull([[5, 0], [2.5, 0.9], [-3.5, 1.0], [-4.2, 0.2], [-4.2, -0.9], [2, -0.8]], 1.8, 0.14), m.hull, 0, 0, 0, g);
      part(topHull([[0, 4.5], [2.6, -0.5], [3.4, -3.5], [1.4, -2.8], [0, -4.2], [-1.4, -2.8], [-3.4, -3.5], [-2.6, -0.5]], 0.25, 0.08), m.hull2, 0, -0.2, 0, g);
      for (const sx of [-1, 1]) { part(new THREE.BoxGeometry(0.05, 0.1, 6), m.glow, sx * 0.95, 0.3, 0.3, g); engine(g, sx * 0.8, 0, -4.3, 0.4, 0.8, m); }
      turret(g, 0, 1.0, 1.5, 1.0, m); turret(g, 0, 1.0, -1.2, 1.0, m);
      return { g: g, size: 4.6 };
    },
    block(m) {
      const g = new THREE.Group();
      part(new THREE.BoxGeometry(3, 2, 7), m.hull, 0, 0, 0, g);
      part(new THREE.BoxGeometry(3.4, 0.6, 5), m.hull2, 0, 1.2, -0.5, g);
      part(new THREE.BoxGeometry(2.4, 1.2, 1), m.hull2, 0, 0, 3.9, g);
      for (const sx of [-1, 1]) { part(new THREE.BoxGeometry(0.06, 0.3, 6.4), m.glow, sx * 1.52, 0.3, 0, g); for (const sy of [-0.5, 0.5]) engine(g, sx * 0.8, sy, -3.6, 0.35, 0.7, m); }
      turret(g, 0, 1.55, 1.2, 1.1, m); turret(g, 0, 1.55, -1.8, 1.1, m);
      return { g: g, size: 4.6 };
    },
    crescent(m) {
      const g = new THREE.Group();
      const arc = part(new THREE.TorusGeometry(3, 0.7, 8, 24, Math.PI * 1.3), m.hull, 0, 0, 0, g);
      arc.rotation.set(Math.PI / 2, 0, Math.PI * 0.85);
      part(new THREE.SphereGeometry(1.3, 14, 10), m.hull2, 0, 0, -1.6, g);
      part(new THREE.TorusGeometry(3, 0.12, 6, 24, Math.PI * 1.3), m.glow, 0, 0.6, 0, g).rotation.set(Math.PI / 2, 0, Math.PI * 0.85);
      engine(g, 0, 0, -2.9, 0.5, 0.8, m);
      turret(g, 0, 1.2, -1.6, 1.0, m);
      return { g: g, size: 4.4 };
    }
  };

  const factionTemplates = {};
  function factionShip(f, kind) {
    const shape = kind === 'heavy' ? f.heavyShape : f.lightShape;
    const key = f.id + ':' + shape;
    if (!factionTemplates[key]) factionTemplates[key] = SHAPES[shape](f.mats);
    const t = factionTemplates[key];
    const g = t.g.clone(true);
    const info = { group: g, engines: [], turrets: [], drill: null, size: t.size };
    g.traverse((o) => { if (o.userData.engine) info.engines.push(o); if (o.userData.turret) info.turrets.push(o); });
    return info;
  }

  // Environment map so the metal has something to reflect
  function environment(renderer, scene) {
    const tex = canvasTex(512, (g, s) => {
      g.fillStyle = '#001725'; g.fillRect(0, 0, s, s);
      g.fillStyle = '#00304f'; g.fillRect(0, s * 0.35, s, s * 0.3);
      const spot = (x, y, r, c) => { const grd = g.createRadialGradient(x, y, 0, x, y, r); grd.addColorStop(0, c); grd.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = grd; g.fillRect(0, 0, s, s); };
      spot(s * 0.15, s * 0.25, s * 0.18, 'rgba(255,248,235,1)');
      spot(s * 0.6, s * 0.4, s * 0.25, 'rgba(52,169,227,0.8)');
      spot(s * 0.85, s * 0.6, s * 0.2, 'rgba(240,136,233,0.6)');
      spot(s * 0.4, s * 0.8, s * 0.3, 'rgba(0,122,183,0.5)');
    });
    tex.mapping = THREE.EquirectangularReflectionMapping;
    const pm = new THREE.PMREMGenerator(renderer);
    scene.environment = pm.fromEquirectangular(tex).texture;
    pm.dispose();
  }

  function jitter(geo, amount) {
    const p = geo.attributes.position, map = {};
    for (let i = 0; i < p.count; i++) {
      const k = p.getX(i).toFixed(3) + p.getY(i).toFixed(3) + p.getZ(i).toFixed(3);
      if (!map[k]) map[k] = 1 + (Math.random() - 0.5) * amount;
      p.setXYZ(i, p.getX(i) * map[k], p.getY(i) * map[k], p.getZ(i) * map[k]);
    }
    geo.computeVertexNormals();
    return geo;
  }

  function comet() {
    const g = new THREE.Group();
    const rock = mesh(jitter(new THREE.IcosahedronGeometry(2, 1), 0.35), mat(0xcfeaf7, { emissive: 0x0a4a70, roughness: 0.8, metalness: 0.1 }));
    g.add(rock);
    g.add(glowSprite(COL.light, 9, 0.55));
    // tail: a line of glows pointing along -Z, the group is aimed away from the centre
    const tail = new THREE.Group();
    for (let i = 1; i <= 9; i++) {
      const s = glowSprite(i % 3 === 0 ? COL.pink : COL.light, 5 + i * 0.9, 0.38 - i * 0.035);
      s.position.z = -i * 1.6; tail.add(s);
    }
    g.add(tail);
    return { group: g, rock: rock, tail: tail, size: 2.2 };
  }

  function asteroid() {
    const g = new THREE.Group();
    const rock = mesh(jitter(new THREE.DodecahedronGeometry(2.2, 1), 0.5), mat(0x55606b, { roughness: 0.95, metalness: 0.2 }));
    g.add(rock);
    for (let i = 0; i < 5; i++) {
      const c = mesh(new THREE.OctahedronGeometry(0.45), lightMat(COL.pink));
      const v = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
      c.position.copy(v).multiplyScalar(2.1); c.scale.set(0.6, 1.4, 0.6);
      c.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), v);
      rock.add(c);
    }
    return { group: g, rock: rock, size: 2.4 };
  }

  // ---------- Backdrop ----------
  function backdrop(scene) {
    // stars in three sizes
    for (const [count, size, col] of [[5000, 1.2, 0xffffff], [900, 2.2, 0xcfeaf7], [160, 3.4, 0xf8c9f5]]) {
      const pos = [];
      for (let i = 0; i < count; i++) {
        const v = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar(1400 + Math.random() * 400);
        pos.push(v.x, v.y, v.z);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      scene.add(new THREE.Points(g, new THREE.PointsMaterial({ color: col, size: size, sizeAttenuation: false, depthWrite: false })));
    }
    // nebula clouds
    const clouds = [[0x34a9e3, 1], [0xf088e9, 2], [0x007ab7, 3], [0xf088e9, 4], [0x34a9e3, 5], [0x005184, 6], [0x34a9e3, 7], [0xf088e9, 8]];
    clouds.forEach(([c, seed], i) => {
      const m = new THREE.SpriteMaterial({ map: cloudTex(seed * 977), color: c, blending: THREE.AdditiveBlending, transparent: true, opacity: 0.55, depthWrite: false });
      const s = new THREE.Sprite(m);
      const a = i / clouds.length * Math.PI * 2 + 0.4;
      s.position.set(Math.cos(a) * 1100, (Math.random() - 0.4) * 700, Math.sin(a) * 1100);
      const sc = 900 + Math.random() * 600; s.scale.set(sc, sc, 1);
      scene.add(s);
    });
    // a gas giant and its moon
    const planet = new THREE.Mesh(new THREE.SphereGeometry(200, 48, 32), new THREE.MeshStandardMaterial({ map: planetTex, roughness: 1, metalness: 0 }));
    planet.position.set(-650, -180, -900);
    planet.rotation.z = 0.35;
    scene.add(planet);
    const atmo = glowSprite(COL.light, 520, 0.3); atmo.position.copy(planet.position); atmo.renderOrder = -1; scene.add(atmo);
    const moon = new THREE.Mesh(new THREE.SphereGeometry(40, 24, 16), mat(0x46525d, { roughness: 1, metalness: 0, flatShading: false }));
    moon.position.set(-250, 60, -760);
    scene.add(moon);
    // a distant sun glow
    const sun = glowSprite(0xfff3df, 260, 0.9); sun.position.set(900, 500, 700); scene.add(sun);
    const sun2 = glowSprite(COL.pink, 600, 0.25); sun2.position.copy(sun.position); scene.add(sun2);
    return planet;
  }

  // ---------- Effects ----------
  const fx = [];
  let scene = null;
  function setScene(s) { scene = s; }

  const boltGeo = alongZ(new THREE.CylinderGeometry(0.09, 0.09, 1.8, 5));
  const boltMats = {};
  function boltMat(c) {
    if (!boltMats[c]) boltMats[c] = new THREE.MeshBasicMaterial({ color: c, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false });
    return boltMats[c];
  }

  // a glowing bolt that flies to the target, then calls onHit
  function bolt(from, target, colour, speed, heavy, onHit) {
    const g = new THREE.Group();
    const m = new THREE.Mesh(boltGeo, boltMat(colour));
    if (heavy) m.scale.set(2, 2, 1.3);
    g.add(m);
    g.add(glowSprite(colour, heavy ? 2.6 : 1.6, 0.9));
    g.position.copy(from);
    scene.add(g);
    fx.push({ kind: 'bolt', obj: g, target: target, speed: speed, onHit: onHit, life: 3, colour: colour });
  }

  function spark(pos, colour, size) {
    const s = glowSprite(colour, size || 2, 1);
    s.position.copy(pos);
    scene.add(s);
    fx.push({ kind: 'flash', obj: s, life: 0.25, max: 0.25, grow: 1.5, base: size || 2 });
  }

  function shieldFlash(entity) {
    if (!entity.shield) {
      const r = entity.radius * 1.15;
      entity.shield = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), new THREE.MeshBasicMaterial({ color: entity.isEnemy ? ENEMY_GLOW : COL.light, blending: THREE.AdditiveBlending, transparent: true, opacity: 0, depthWrite: false, wireframe: false }));
      entity.shield.scale.set(r, r, r);
      entity.mesh.add(entity.shield);
    }
    entity.shieldGlow = 0.35;
  }

  function explosion(pos, size, colour) {
    // flash
    const f = glowSprite(0xffffff, size * 2, 1); f.position.copy(pos); scene.add(f);
    fx.push({ kind: 'flash', obj: f, life: 0.5, max: 0.5, grow: 4, base: size * 2 });
    const f2 = glowSprite(COL.amber, size * 3, 0.8); f2.position.copy(pos); scene.add(f2);
    fx.push({ kind: 'flash', obj: f2, life: 0.9, max: 0.9, grow: 2.5, base: size * 3 });
    // shockwave
    const ringM = new THREE.SpriteMaterial({ map: ringTex, color: colour || COL.light, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false });
    const ring = new THREE.Sprite(ringM); ring.position.copy(pos); ring.scale.set(size, size, 1); scene.add(ring);
    fx.push({ kind: 'flash', obj: ring, life: 0.7, max: 0.7, grow: 7, base: size });
    // sparks
    const n = Math.round(30 + size * 25);
    const p = new Float32Array(n * 3), vel = [];
    for (let i = 0; i < n; i++) {
      p[i * 3] = pos.x; p[i * 3 + 1] = pos.y; p[i * 3 + 2] = pos.z;
      vel.push(new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar((2 + Math.random() * 10) * (0.6 + size * 0.25)));
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(p, 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color: Math.random() < 0.5 ? COL.amber : (colour || COL.pink), size: 0.5 + size * 0.12, map: glowTex, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }));
    scene.add(pts);
    fx.push({ kind: 'sparks', obj: pts, vel: vel, life: 1.3, max: 1.3 });
    // debris
    const dn = Math.round(3 + size * 2);
    for (let i = 0; i < dn; i++) {
      const d = new THREE.Mesh(new THREE.TetrahedronGeometry(0.15 + Math.random() * Math.min(0.7, 0.1 * size)), mat(0x3a4a58, { emissive: 0x331100 }));
      d.position.copy(pos);
      scene.add(d);
      fx.push({ kind: 'debris', obj: d, vel: new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(6 + size * 2), spin: new THREE.Vector3(Math.random() * 6, Math.random() * 6, Math.random() * 6), life: 2.5 + Math.random(), max: 3.5 });
    }
  }

  // mining / repair line
  function line(a, b, colour) {
    const g = new THREE.BufferGeometry().setFromPoints([a.clone(), b.clone()]);
    const l = new THREE.Line(g, new THREE.LineBasicMaterial({ color: colour, blending: THREE.AdditiveBlending, transparent: true }));
    scene.add(l);
    fx.push({ kind: 'line', obj: l, life: 0.15, max: 0.15 });
  }

  // power: a jagged spark of electricity from a to b
  function zap(a, b, colour) {
    const pts = [a.clone()];
    const n = 7, d = a.distanceTo(b);
    for (let i = 1; i < n; i++) {
      const p = a.clone().lerp(b, i / n);
      p.x += (Math.random() - 0.5) * d * 0.06; p.y += (Math.random() - 0.5) * d * 0.06; p.z += (Math.random() - 0.5) * d * 0.06;
      pts.push(p);
    }
    pts.push(b.clone());
    const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: colour, blending: THREE.AdditiveBlending, transparent: true }));
    scene.add(l);
    fx.push({ kind: 'line', obj: l, life: 0.22, max: 0.22 });
  }

  // engine exhaust trails: one shared particle buffer
  const TRAIL_N = 2400;
  let trailPts = null, trailPos, trailCol, trailBase, trailLife, trailHead = 0;
  function trailInit() {
    trailPos = new Float32Array(TRAIL_N * 3).fill(99999);
    trailCol = new Float32Array(TRAIL_N * 3);
    trailBase = new Float32Array(TRAIL_N * 3);
    trailLife = new Float32Array(TRAIL_N);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(trailPos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(trailCol, 3));
    trailPts = new THREE.Points(g, new THREE.PointsMaterial({ size: 0.9, map: glowTex, vertexColors: true, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }));
    trailPts.frustumCulled = false;
    scene.add(trailPts);
  }
  const trailColour = new THREE.Color();
  function trail(pos, colour) {
    if (!trailPts) trailInit();
    const i = trailHead; trailHead = (trailHead + 1) % TRAIL_N;
    trailPos[i * 3] = pos.x + (Math.random() - 0.5) * 0.15; trailPos[i * 3 + 1] = pos.y + (Math.random() - 0.5) * 0.15; trailPos[i * 3 + 2] = pos.z + (Math.random() - 0.5) * 0.15;
    trailColour.setHex(colour);
    trailBase[i * 3] = trailColour.r; trailBase[i * 3 + 1] = trailColour.g; trailBase[i * 3 + 2] = trailColour.b;
    trailLife[i] = 1;
  }
  function trailUpdate(dt) {
    if (!trailPts) return;
    for (let i = 0; i < TRAIL_N; i++) {
      if (trailLife[i] <= 0) continue;
      trailLife[i] -= dt * 1.6;
      const k = Math.max(0, trailLife[i]) * 0.7;
      trailCol[i * 3] = trailBase[i * 3] * k; trailCol[i * 3 + 1] = trailBase[i * 3 + 1] * k; trailCol[i * 3 + 2] = trailBase[i * 3 + 2] * k;
      if (trailLife[i] <= 0) trailPos[i * 3 + 1] = 99999;
    }
    trailPts.geometry.attributes.position.needsUpdate = true;
    trailPts.geometry.attributes.color.needsUpdate = true;
  }

  const tmp = new THREE.Vector3();
  function update(dt) {
    trailUpdate(dt);
    for (let i = fx.length - 1; i >= 0; i--) {
      const f = fx[i];
      f.life -= dt;
      const k = f.max ? Math.max(0, f.life / f.max) : 1;
      if (f.kind === 'bolt') {
        const tp = f.target.dead ? f.lastPos || f.obj.position : f.target.pos;
        f.lastPos = tp.clone ? tp.clone() : tp;
        tmp.subVectors(tp, f.obj.position);
        const d = tmp.length(), stepLen = f.speed * dt;
        if (d <= stepLen + (f.target.radius || 0.5) * 0.6 || f.life <= 0) {
          scene.remove(f.obj); fx.splice(i, 1);
          if (!f.target.dead && f.onHit) f.onHit(f.obj.position.clone());
          continue;
        }
        tmp.multiplyScalar(stepLen / d);
        f.obj.position.add(tmp);
        f.obj.lookAt(tp);
        continue;
      }
      if (f.life <= 0) {
        scene.remove(f.obj);
        if (f.obj.geometry && f.kind !== 'flash') f.obj.geometry.dispose();
        if (f.obj.material && f.kind !== 'debris') f.obj.material.dispose();
        fx.splice(i, 1);
        continue;
      }
      if (f.kind === 'flash') {
        const s = f.base * (1 + (1 - k) * f.grow);
        f.obj.scale.set(s, s, 1);
        f.obj.material.opacity = k;
      } else if (f.kind === 'sparks') {
        const p = f.obj.geometry.attributes.position;
        for (let j = 0; j < f.vel.length; j++) {
          p.setXYZ(j, p.getX(j) + f.vel[j].x * dt, p.getY(j) + f.vel[j].y * dt, p.getZ(j) + f.vel[j].z * dt);
          f.vel[j].multiplyScalar(1 - dt * 1.2);
        }
        p.needsUpdate = true;
        f.obj.material.opacity = k;
      } else if (f.kind === 'debris') {
        f.obj.position.addScaledVector(f.vel, dt);
        f.obj.rotation.x += f.spin.x * dt; f.obj.rotation.y += f.spin.y * dt; f.obj.rotation.z += f.spin.z * dt;
        const s = Math.min(1, f.life); f.obj.scale.set(s, s, s);
      } else if (f.kind === 'line') {
        f.obj.material.opacity = k;
      }
    }
  }

  function clear() {
    for (const f of fx) scene.remove(f.obj);
    fx.length = 0;
    if (trailPts) { trailLife.fill(0); trailCol.fill(0); }
  }

  COL.enemy = ENEMY_GLOW;
  CC.COL = COL;
  CC.models = { factionMats: factionMats, factionShip: factionShip, environment: environment, fighter: fighter, cruiser: cruiser, harvester: harvester, mothership: mothership, raider: raider, destroyer: destroyer, hive: hive, solar: solar, refinery: refinery, tech: tech, turretPlatform: turretPlatform, shipyard: shipyard, repairDock: repairDock, dreadnought: dreadnought, captor: captor, rivalCarrier: rivalCarrier, comet: comet, asteroid: asteroid, glowSprite: glowSprite, ringSprite: ringSprite, backdrop: backdrop };
  CC.fx = { trail: trail, setScene: setScene, bolt: bolt, spark: spark, explosion: explosion, shieldFlash: shieldFlash, line: line, zap: zap, update: update, clear: clear };
})(window.CC);

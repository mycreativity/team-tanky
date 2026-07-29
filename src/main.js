// team-tanky — prototype spike
// Single-player, client-only. Jij + AI-team vs. de AI-bully.
// Alles draait in de browser (game-AI = simpele state machine, geen server).

import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const ARENA = 100;            // speler-clamp (half); terrein is groter
const CAM_OFFSET = new THREE.Vector3(0, 26, 18); // vaste, gekantelde hoge hoek
const GRAV_HOVER = 1.6;       // hoe hoog de tank boven het terrein 'zweeft'

const STATS = {
  player: { hp: 100, speed: 17, cd: 0.38, pspeed: 78, dmg: 6,  pradius: 0.35, scale: 1.0, radius: 2.4, color: 0x2ec4ff },
  ally:   { hp: 100, speed: 15, cd: 0.75, pspeed: 72, dmg: 5,  pradius: 0.35, scale: 1.0, radius: 2.4, color: 0x36e0a0 },
  bully:  { hp: 640, speed: 7,  cd: 1.35, pspeed: 68, dmg: 34, pradius: 0.8,  scale: 2.2, radius: 4.6, color: 0xff4d4d },
};
const SOFT_LOCK_CONE = 0.22; // rad (~13°): kleine aim-assist als je richting in de buurt van een target komt
const SOFT_LOCK_RANGE = 75;
const SOFT_LOCK_PULL = 0.5;  // hoe sterk de assist naar het doel trekt (0 = geen, 1 = volledige lock)

// ---------------------------------------------------------------------------
// Procedurale wereld (gedeeltelijk): seed -> deterministische map.
// Zelfde seed = zelfde map op elke client (belangrijk voor multiplayer-sync).
// Authored grenzen (arena, spawnzone, biome-regels) houden het eerlijk.
// ---------------------------------------------------------------------------
const _params = new URLSearchParams(location.search);
let SEED = _params.has('seed') ? (parseInt(_params.get('seed'), 10) >>> 0)
                               : (Math.floor(Math.random() * 1e9) >>> 0);

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hash2(ix, iz, seed) {
  let h = Math.imul(ix | 0, 374761393) + Math.imul(iz | 0, 668265263) + Math.imul(seed | 0, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
function vnoise(x, z, seed) {
  const x0 = Math.floor(x), z0 = Math.floor(z), fx = x - x0, fz = z - z0;
  const sx = fx * fx * (3 - 2 * fx), sz = fz * fz * (3 - 2 * fz);
  const n00 = hash2(x0, z0, seed), n10 = hash2(x0 + 1, z0, seed);
  const n01 = hash2(x0, z0 + 1, seed), n11 = hash2(x0 + 1, z0 + 1, seed);
  const a = n00 + (n10 - n00) * sx, b = n01 + (n11 - n01) * sx;
  return a + (b - a) * sz; // [0,1]
}
function fbm(x, z, seed) {
  let amp = 1, freq = 1, sum = 0, norm = 0;
  for (let o = 0; o < 4; o++) { sum += amp * vnoise(x * freq, z * freq, (seed + o * 1013) | 0); norm += amp; amp *= 0.5; freq *= 2; }
  return sum / norm; // [0,1]
}

// ---------------------------------------------------------------------------
// Renderer / scene / camera
// ---------------------------------------------------------------------------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x18202e);
scene.fog = new THREE.Fog(0x18202e, 130, 300);

const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 500);
camera.position.copy(CAM_OFFSET);
camera.lookAt(0, 0, 0);

// Licht — donker maar speels, met een warme zon voor leesbare schaduwen (toont hoogte)
scene.add(new THREE.HemisphereLight(0xbcd4ff, 0x40465a, 1.05));
const sun = new THREE.DirectionalLight(0xfff0d8, 1.5);
sun.position.set(60, 90, 40);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.camera.near = 10;
sun.shadow.camera.far = 260;
const sc = sun.shadow.camera;
sc.left = -130; sc.right = 130; sc.top = 130; sc.bottom = -130;
scene.add(sun);
scene.add(sun.target);

// ---------------------------------------------------------------------------
// Terrein — procedureel uit de seed. Zelfde functie voor mesh én tank-hoogte,
// zodat tanks exact op de grond staan.
// ---------------------------------------------------------------------------
function terrainHeight(x, z) {
  // brede glooiing (lage frequentie) + wat detail
  let h = (fbm(x * 0.012, z * 0.012, SEED) - 0.5) * 20;
  h += (fbm(x * 0.05, z * 0.05, (SEED + 7) | 0) - 0.5) * 4;
  // authored: rand van de arena iets omhoog -> natuurlijke 'kom' die spelers binnenhoudt
  const r = Math.hypot(x, z);
  if (r > ARENA) h += (r - ARENA) * 0.25;
  return h;
}

let terrainMesh = null;
let featureGroup = null;
let coverRocks = [];   // {x, z, r, topY} — blokkeren schoten (dekking)
let forestTrees = [];  // {x, z} — bos (camo/verbergen)

function buildTerrainMesh() {
  const size = 260, seg = 120, step = size / seg, half = size / 2;
  const geo = new THREE.BufferGeometry();
  const positions = [], colors = [], indices = [];
  const cGrass = new THREE.Color(0x568f4a);
  const cSand  = new THREE.Color(0xc0a35f);
  const cRock  = new THREE.Color(0x9095a0);
  const cWater = new THREE.Color(0x2e86a8);
  const tmp = new THREE.Color();
  const cr = mulberry32((SEED ^ 0x1234) >>> 0);

  for (let i = 0; i <= seg; i++) {
    for (let j = 0; j <= seg; j++) {
      const x = -half + i * step;
      const z = -half + j * step;
      const y = terrainHeight(x, z);
      positions.push(x, y, z);
      // kleur per hoogte -> water / gras / zand / rots
      if (y < -3.5) tmp.copy(cWater);
      else if (y < 2.5) tmp.copy(cGrass);
      else if (y < 6.5) tmp.copy(cSand);
      else tmp.copy(cRock);
      tmp.offsetHSL(0, 0, (cr() - 0.5) * 0.04);
      colors.push(tmp.r, tmp.g, tmp.b);
    }
  }
  const row = seg + 1;
  for (let i = 0; i < seg; i++) {
    for (let j = 0; j < seg; j++) {
      const a = i * row + j, b = a + 1, c = a + row, d = c + 1;
      indices.push(a, b, c, b, d, c); // winding zo dat normalen omhoog wijzen
    }
  }
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();

  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0.0 });
  terrainMesh = new THREE.Mesh(geo, mat);
  terrainMesh.receiveShadow = true;
  scene.add(terrainMesh);
}

// Procedureel strooien: bomen (bos/camo) op gras, rotsen (dekking) op hoogte.
// Rule-based binnen authored grenzen: buiten spawn-buffer en niet in het water.
function scatterFeatures() {
  const rand = mulberry32((SEED ^ 0x9e3779b9) >>> 0);
  featureGroup = new THREE.Group();
  const trees = [], rocks = [];
  coverRocks = []; forestTrees = [];
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), P = new THREE.Vector3(), S = new THREE.Vector3();

  // Rotsen (dekking): verspreid op hoger terrein.
  for (let n = 0; n < 700; n++) {
    const x = (rand() - 0.5) * 2 * (ARENA - 4);
    const z = (rand() - 0.5) * 2 * (ARENA - 4);
    if (Math.hypot(x, z) < 12) continue;
    const y = terrainHeight(x, z);
    if (y >= 4.0 && rand() < 0.7) rocks.push([x, y, z, 0.7 + rand() * 1.4, rand() * 6.28]);
  }

  // Bomen (camo): in dichte groves zodat "verbergen in het bos" echt werkt.
  const GROVES = 16;
  for (let gi = 0; gi < GROVES; gi++) {
    let cx, cz, tries = 0;
    if (gi === 0) { cx = (rand() - 0.5) * 40; cz = 46 + (rand() - 0.5) * 12; } // authored: grove bij team-spawn
    else {
      do { cx = (rand() - 0.5) * 2 * (ARENA - 14); cz = (rand() - 0.5) * 2 * (ARENA - 14); tries++; }
      while ((Math.hypot(cx, cz) < 16 || terrainHeight(cx, cz) < -1 || terrainHeight(cx, cz) > 3.5) && tries < 8);
    }
    const count = 12 + Math.floor(rand() * 16);
    for (let k = 0; k < count; k++) {
      const ang = rand() * 6.28, rad = 1.5 + rand() * 10;
      const x = cx + Math.cos(ang) * rad, z = cz + Math.sin(ang) * rad;
      if (Math.hypot(x, z) < 12) continue;
      const y = terrainHeight(x, z);
      if (y < -1.5 || y > 4) continue;
      trees.push([x, y, z, 0.7 + rand() * 0.9, rand() * 6.28]);
    }
  }

  if (trees.length) {
    const trunkGeo = new THREE.CylinderGeometry(0.22, 0.3, 1.6, 6);
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5b4326, roughness: 1 });
    const canopyGeo = new THREE.ConeGeometry(1.5, 3.2, 7);
    const canopyMat = new THREE.MeshStandardMaterial({ color: 0x2f6d3a, roughness: 1 });
    const trunkIM = new THREE.InstancedMesh(trunkGeo, trunkMat, trees.length);
    const canopyIM = new THREE.InstancedMesh(canopyGeo, canopyMat, trees.length);
    canopyIM.castShadow = true;
    trees.forEach((t, i) => {
      const [x, y, z, s, rot] = t;
      Q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rot);
      P.set(x, y + 0.8 * s, z); S.set(s, s, s); M.compose(P, Q, S); trunkIM.setMatrixAt(i, M);
      P.set(x, y + 2.4 * s, z); M.compose(P, Q, S); canopyIM.setMatrixAt(i, M);
      forestTrees.push({ x, z });
    });
    trunkIM.instanceMatrix.needsUpdate = true; canopyIM.instanceMatrix.needsUpdate = true;
    featureGroup.add(trunkIM, canopyIM);
  }

  if (rocks.length) {
    const rockGeo = new THREE.DodecahedronGeometry(1, 0);
    const rockMat = new THREE.MeshStandardMaterial({ color: 0x81858f, roughness: 0.9, flatShading: true });
    const rockIM = new THREE.InstancedMesh(rockGeo, rockMat, rocks.length);
    rockIM.castShadow = true; rockIM.receiveShadow = true;
    rocks.forEach((r, i) => {
      const [x, y, z, s, rot] = r;
      Q.setFromAxisAngle(new THREE.Vector3(0.2, 1, 0.1).normalize(), rot);
      P.set(x, y + 0.5 * s, z); S.set(s, s * 0.8, s); M.compose(P, Q, S); rockIM.setMatrixAt(i, M);
      coverRocks.push({ x, z, r: s * 1.25 + 0.6, topY: y + s * 1.7 + 1 });
    });
    rockIM.instanceMatrix.needsUpdate = true;
    featureGroup.add(rockIM);
  }
  scene.add(featureGroup);
}

function generateWorld() {
  if (terrainMesh) { scene.remove(terrainMesh); terrainMesh.geometry.dispose(); terrainMesh.material.dispose(); }
  if (featureGroup) {
    scene.remove(featureGroup);
    featureGroup.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
  }
  buildTerrainMesh();
  scatterFeatures();
}
generateWorld();

// ---------------------------------------------------------------------------
// Tank-fabriek (opgebouwd uit primitives)
// ---------------------------------------------------------------------------
function makeTank(colorHex, scale) {
  const group = new THREE.Group();
  // per-part materials -> onderdelen kunnen los verkleuren (locational damage)
  const bodyMat = () => new THREE.MeshStandardMaterial({ color: colorHex, roughness: 0.6, metalness: 0.25 });
  const darkMat = () => new THREE.MeshStandardMaterial({ color: 0x2a2f38, roughness: 0.8 });

  const hull = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.0, 3.4), bodyMat());
  hull.position.y = 0.9; hull.castShadow = true; group.add(hull);

  const trackL = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.8, 3.8), darkMat());
  trackL.position.set(-1.5, 0.5, 0); trackL.castShadow = true; group.add(trackL);
  const trackR = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.8, 3.8), darkMat());
  trackR.position.set(1.5, 0.5, 0); trackR.castShadow = true; group.add(trackR);

  // turret (los object zodat het onafhankelijk kan richten)
  const turret = new THREE.Group();
  const dome = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.8, 1.8), bodyMat());
  dome.castShadow = true; turret.add(dome);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 2.6, 12), darkMat());
  barrel.rotation.x = Math.PI / 2;    // langs +Z
  barrel.position.set(0, 0.05, 1.5);
  barrel.castShadow = true; turret.add(barrel);
  turret.position.y = 1.55;
  group.add(turret);

  // originele kleuren onthouden voor reset na respawn
  for (const m of [hull, trackL, trackR, dome, barrel]) m.userData.orig = m.material.color.getHex();

  group.scale.setScalar(scale);
  group.userData.turret = turret;
  group.userData.barrelLen = 2.9 * scale;
  group.userData.parts = { hull, trackL, trackR, turret, dome, barrel };
  scene.add(group);
  return group;
}

// Health-bar boven de tank (sprites -> altijd naar camera gericht)
function makeBar(width, colorHex) {
  const g = new THREE.Group();
  const bg = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0x220000, depthTest: false }));
  bg.center.set(0, 0.5); bg.scale.set(width, 0.4, 1); bg.position.x = -width / 2;
  const fg = new THREE.Sprite(new THREE.SpriteMaterial({ color: colorHex, depthTest: false }));
  fg.center.set(0, 0.5); fg.scale.set(width, 0.4, 1); fg.position.x = -width / 2;
  g.add(bg); g.add(fg);
  g.userData.fg = fg; g.userData.width = width;
  g.renderOrder = 999;
  scene.add(g);
  return g;
}

// ---------------------------------------------------------------------------
// Entities
// ---------------------------------------------------------------------------
const tanks = [];
function spawnTank(kind, faction, isPlayer = false) {
  const s = STATS[kind];
  const group = makeTank(s.color, s.scale);
  const bar = makeBar(kind === 'bully' ? 6 : 3, faction === 'boss' ? 0xff4d4d : 0x46e07a);
  const t = {
    kind, faction, isPlayer, group,
    turret: group.userData.turret,
    barrelLen: group.userData.barrelLen,
    stats: s, hp: s.hp, maxHp: s.hp,
    radius: s.radius, speed: s.speed,
    heading: 0, turretYaw: 0,
    fireTimer: 0, dead: false, respawn: 0,
    wander: new THREE.Vector3(), wanderT: 0,
    hidden: false, speedNow: 0, vel: { x: 0, z: 0 },
    bar,
  };
  // Bully: locational damage — losse onderdelen met eigen HP.
  if (kind === 'bully') {
    const P = group.userData.parts;
    t.parts = {
      hull:   { hp: 300, max: 300, meshes: [P.hull] },
      turret: { hp: 150, max: 150, meshes: [P.dome, P.barrel] },
      trackL: { hp: 120, max: 120, meshes: [P.trackL] },
      trackR: { hp: 120, max: 120, meshes: [P.trackR] },
    };
    t.bar.visible = false; // bully gebruikt de HUD-onderdeelbalken i.p.v. één balk
  }
  tanks.push(t);
  placeTank(t, kind === 'bully');
  return t;
}

function placeTank(t, center) {
  let x, z;
  if (center) { x = 0; z = 0; }
  else { x = (Math.random() - 0.5) * 90; z = 40 + Math.random() * 22; } // team spawnt aan één kant
  t.group.position.set(x, terrainHeight(x, z) + GRAV_HOVER, z);
  t.hp = t.maxHp; t.dead = false;
  t.group.visible = true;
  setTankHidden(t, false);
  if (t.parts) {
    for (const key in t.parts) {
      const part = t.parts[key];
      part.hp = part.max;
      for (const m of part.meshes) m.material.color.setHex(m.userData.orig);
    }
  } else {
    t.bar.visible = true;
  }
}

const player = spawnTank('player', 'team', true);
const allies = [spawnTank('ally', 'team'), spawnTank('ally', 'team'), spawnTank('ally', 'team')];
const bully = spawnTank('bully', 'boss');
bully.group.position.set(0, terrainHeight(0, 0) + GRAV_HOVER, 0);

// Klein vierkant richtertje dat toont waar je op mikt (rood = soft-lock op een doel).
function makeReticle() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  g.strokeStyle = '#ffffff'; g.lineWidth = 7;
  g.strokeRect(9, 9, 46, 46);
  const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false, transparent: true }));
  spr.scale.set(3, 3, 1); spr.renderOrder = 1000; spr.visible = false;
  scene.add(spr);
  return spr;
}
const reticle = makeReticle();

// Dev-hook (alleen met ?debug=1): stelt de tanks bloot voor inspectie/tuning.
if (new URLSearchParams(location.search).has('debug')) window.__tanks = tanks;

// ---------------------------------------------------------------------------
// Projectiles
// ---------------------------------------------------------------------------
const projectiles = [];
const effects = [];
const BULLY_SPLASH = 8;   // bully = artillery: explosion radius
const BULLY_VH = 46;      // horizontal speed of the arcing shell
const SHELL_GRAVITY = 34; // gravity on arcing shells
const PLAYER_VH = 44;     // horizontal speed of the player's arcing bombshell
const PLAYER_SPLASH = 3;  // small blast on the player's shell
let aimDistance = 34;     // range set by the slider (world units)

const projGeo = new THREE.SphereGeometry(1, 8, 8);
const boomGeo = new THREE.SphereGeometry(1, 14, 14);
const projMatTeam = new THREE.MeshBasicMaterial({ color: 0xbfefff });
const projMatBoss = new THREE.MeshBasicMaterial({ color: 0xffb0b0 });

// Mondingpositie in 3D (romp + torenhoogte + loop vooruit).
function muzzleOf(t, yaw) {
  const s = t.stats;
  return new THREE.Vector3(
    t.group.position.x + Math.sin(yaw) * t.barrelLen,
    t.group.position.y + 1.55 * s.scale,
    t.group.position.z + Math.cos(yaw) * t.barrelLen,
  );
}
function spawnProjectile(origin, vel, faction, dmg, splash, gravity, pradius) {
  const mesh = new THREE.Mesh(projGeo, faction === 'boss' ? projMatBoss : projMatTeam);
  mesh.scale.setScalar(pradius);
  mesh.position.copy(origin);
  scene.add(mesh);
  projectiles.push({ mesh, prev: origin.clone(), vel: vel.clone(), life: gravity ? 5 : 2.4, dmg, faction, splash, gravity });
}
// Ballistische oplossing: welke beginsnelheid landt op T vanaf S, met horizontale snelheid vH?
function ballistic(S, T, vH, g) {
  const dx = T.x - S.x, dz = T.z - S.z;
  const dxz = Math.hypot(dx, dz) || 0.001;
  const tf = dxz / vH;
  const vy = (T.y - S.y + 0.5 * g * tf * tf) / tf;
  const inv = vH / dxz;
  return new THREE.Vector3(dx * inv, vy, dz * inv);
}
// Kortste afstand van punt P tot lijnstuk A-B (voor swept-sphere collision).
function closestOnSeg(A, B, P) {
  const abx = B.x - A.x, aby = B.y - A.y, abz = B.z - A.z;
  const ab2 = abx * abx + aby * aby + abz * abz || 1e-6;
  let tt = ((P.x - A.x) * abx + (P.y - A.y) * aby + (P.z - A.z) * abz) / ab2;
  tt = Math.max(0, Math.min(1, tt));
  const cx = A.x + abx * tt, cy = A.y + aby * tt, cz = A.z + abz * tt;
  return { dist: Math.hypot(P.x - cx, P.y - cy, P.z - cz), point: new THREE.Vector3(cx, cy, cz) };
}

// AI schiet met lead + spreiding. Bully = boogschot (artillerie), rest = direct 3D-vuur.
function aiFire(shooter, target) {
  const s = shooter.stats;
  const isBully = shooter.faction === 'boss';
  const sp = shooter.group.position, tp = target.group.position;
  const dist = Math.hypot(tp.x - sp.x, tp.z - sp.z);
  const vH = isBully ? BULLY_VH : s.pspeed;
  const tf = dist / vH;
  // lead: voorspel positie na vluchttijd
  let ax = tp.x + target.vel.x * tf;
  let az = tp.z + target.vel.z * tf;
  // spreiding: laterale/diepte-fout die groeit met doelsnelheid, afstand, eigen beweging
  const err = Math.tan(aimSpread(shooter, target, dist)) * dist;
  ax += (Math.random() * 2 - 1) * err;
  az += (Math.random() * 2 - 1) * err;
  const ay = terrainHeight(ax, az) + GRAV_HOVER * target.stats.scale;
  const yaw = Math.atan2(ax - sp.x, az - sp.z);
  shooter.turretYaw = yaw;
  const muzzle = muzzleOf(shooter, yaw);
  const aim = new THREE.Vector3(ax, ay, az);
  if (isBully) {
    spawnProjectile(muzzle, ballistic(muzzle, aim, vH, SHELL_GRAVITY), 'boss', s.dmg, BULLY_SPLASH, SHELL_GRAVITY, 0.8);
  } else {
    const dir = aim.sub(muzzle).normalize();
    spawnProjectile(muzzle, dir.multiplyScalar(s.pspeed), shooter.faction, s.dmg, 0, 0, 0.35);
  }
}
// Player fires an ARCING bombshell that lands on the reticle point (direction × range).
function playerFire() {
  const s = player.stats;
  const muzzle = muzzleOf(player, player.turretYaw);
  const aim = reticle.position.clone(); // landing point (ground at dir×range, or a locked target)
  spawnProjectile(muzzle, ballistic(muzzle, aim, PLAYER_VH, SHELL_GRAVITY), 'team', s.dmg, PLAYER_SPLASH, SHELL_GRAVITY, 0.4);
}
// Nearest non-hidden enemy within radius r of a ground point (soft-lock for the range reticle).
function enemyNearPoint(x, z, r) {
  let best = null, bd = r * r;
  for (const e of aliveTargetsFor(player)) {
    if (e.hidden) continue;
    const dx = e.group.position.x - x, dz = e.group.position.z - z, d = dx * dx + dz * dz;
    if (d < bd) { bd = d; best = e; }
  }
  return best;
}

// Schade toepassen op een tank (bully via onderdelen, rest via hp).
function applyDamage(t, point, dmg) {
  if (t.parts) damageBully(t, point, dmg);
  else { t.hp -= dmg; if (t.hp <= 0) onKill(t); }
}
// Explosie met falloff: alles binnen de radius krijgt schade naar rato van nabijheid.
function explode(pos, pr) {
  for (const t of tanks) {
    if (t.dead || t.faction === pr.faction) continue;
    const d = pos.distanceTo(t.group.position);
    if (d < pr.splash) applyDamage(t, pos, pr.dmg * (1 - d / pr.splash));
  }
  const m = new THREE.Mesh(boomGeo, new THREE.MeshBasicMaterial({ color: 0xffb347, transparent: true, opacity: 0.7, depthWrite: false }));
  m.position.copy(pos); scene.add(m);
  effects.push({ mesh: m, life: 0.32, max: 0.32, r: pr.splash });
}
function updateEffects(dt) {
  for (let i = effects.length - 1; i >= 0; i--) {
    const e = effects[i]; e.life -= dt;
    const k = 1 - Math.max(0, e.life) / e.max;
    e.mesh.scale.setScalar(0.5 + e.r * k);
    e.mesh.material.opacity = 0.7 * (1 - k);
    if (e.life <= 0) { scene.remove(e.mesh); effects.splice(i, 1); }
  }
}

// ---------------------------------------------------------------------------
// Input — TWIN-STICK: links rijden, rechts turret richten (+ schieten).
// Desktop: WASD rijden, muis richt de turret, muisknop schiet.
// ---------------------------------------------------------------------------
const keys = {};
addEventListener('keydown', (e) => { keys[e.code] = true; });
addEventListener('keyup', (e) => { keys[e.code] = false; });

// Generieke touch-joystick binder
function bindStick(el, knob) {
  const state = { x: 0, y: 0, active: false, id: null };
  const move = (e) => {
    if (e.pointerId !== state.id) return;
    const r = el.getBoundingClientRect();
    let dx = e.clientX - (r.left + r.width / 2);
    let dy = e.clientY - (r.top + r.height / 2);
    const max = r.width / 2, len = Math.hypot(dx, dy);
    if (len > max) { dx = dx / len * max; dy = dy / len * max; }
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    state.x = dx / max; state.y = dy / max; state.active = true;
  };
  const end = (e) => {
    if (e.pointerId !== state.id) return;
    state.id = null; state.x = 0; state.y = 0; state.active = false;
    knob.style.transform = 'translate(0,0)';
  };
  el.addEventListener('pointerdown', (e) => { state.id = e.pointerId; el.setPointerCapture(e.pointerId); move(e); });
  el.addEventListener('pointermove', move);
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
  return state;
}
const leftStick = bindStick(document.getElementById('joystick'), document.getElementById('joystick-knob'));
const rightStick = bindStick(document.getElementById('aimstick'), document.getElementById('aimstick-knob'));

// Desktop muis-aim: raycast naar een grondvlak op spelerhoogte
const aimPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const aimRay = new THREE.Raycaster();
const mouseNDC = new THREE.Vector2();
let mouseAimActive = false, mouseDown = false;
renderer.domElement.addEventListener('mousemove', (e) => {
  mouseNDC.x = (e.clientX / window.innerWidth) * 2 - 1;
  mouseNDC.y = -(e.clientY / window.innerHeight) * 2 + 1;
  mouseAimActive = true;
});
renderer.domElement.addEventListener('mousedown', () => { mouseDown = true; });
addEventListener('mouseup', () => { mouseDown = false; });

function moveInput() {
  let x = 0, z = 0;
  if (keys['KeyW'] || keys['ArrowUp']) z -= 1;
  if (keys['KeyS'] || keys['ArrowDown']) z += 1;
  if (keys['KeyA'] || keys['ArrowLeft']) x -= 1;
  if (keys['KeyD'] || keys['ArrowRight']) x += 1;
  x += leftStick.x; z += leftStick.y;
  const len = Math.hypot(x, z);
  if (len > 1) { x /= len; z /= len; }
  return { x, z, len: Math.min(len, 1) };
}

// Aim DIRECTION (yaw) only — from the right stick or the mouse. Distance comes from the slider.
function aimDirection() {
  if (Math.hypot(rightStick.x, rightStick.y) > 0.25) return Math.atan2(rightStick.x, rightStick.y);
  if (mouseAimActive) {
    aimPlane.constant = -player.group.position.y;
    aimRay.setFromCamera(mouseNDC, camera);
    const hit = new THREE.Vector3();
    if (aimRay.ray.intersectPlane(aimPlane, hit)) {
      return Math.atan2(hit.x - player.group.position.x, hit.z - player.group.position.z);
    }
  }
  return null;
}

// FIRE is manual now: FIRE button, Space, or mouse click — never automatic while aiming.
let fireHeld = false;
const fireEl = document.getElementById('firebtn');
fireEl.addEventListener('pointerdown', (e) => { e.preventDefault(); fireHeld = true; });
fireEl.addEventListener('pointerup', () => { fireHeld = false; });
fireEl.addEventListener('pointercancel', () => { fireHeld = false; });
function firePressed() { return fireHeld || keys['Space'] || mouseDown; }

// RANGE slider sets the firing distance.
const distEl = document.getElementById('dist');
distEl.addEventListener('input', () => { aimDistance = parseFloat(distEl.value); });

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function aliveTargetsFor(t) {
  const wantBoss = t.faction === 'team';
  return tanks.filter((o) => !o.dead && (wantBoss ? o.faction === 'boss' : o.faction === 'team'));
}
function nearest(t, list) {
  let best = null, bd = Infinity;
  for (const o of list) {
    const d = t.group.position.distanceToSquared(o.group.position);
    if (d < bd) { bd = d; best = o; }
  }
  return best;
}
function yawTo(from, to) {
  return Math.atan2(to.x - from.x, to.z - from.z);
}
// Spreiding (half-hoek in rad): sneller/verder doel = minder raak; rijdend schieten = minder raak.
function aimSpread(shooter, target, dist) {
  return 0.03
    + Math.min(target.speedNow, 20) * 0.011   // bewegend doel is moeilijk
    + dist * 0.0016                            // afstand
    + Math.min(shooter.speedNow, 20) * 0.006;  // zelf rijden = minder precies
}
function lerpAngle(a, b, t) {
  return a + angleDelta(a, b) * t;
}
function angleDelta(a, b) {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}
// Kleine aim-assist: als de richt-yaw binnen een kegel van een vijand valt, trek 'm er een beetje naartoe.
let lockTarget = null; // door applySoftLock gezet; gebruikt door het richtertje
function applySoftLock(from, yaw) {
  let best = null, bestAbs = SOFT_LOCK_CONE;
  for (const e of aliveTargetsFor(player)) {
    if (e.hidden) continue; // verborgen doelen kun je niet locken (camo)
    if (from.distanceTo(e.group.position) > SOFT_LOCK_RANGE) continue;
    const d = Math.abs(angleDelta(yaw, yawTo(from, e.group.position)));
    if (d < bestAbs) { bestAbs = d; best = e; }
  }
  lockTarget = best;
  if (best) return lerpAngle(yaw, yawTo(from, best.group.position), SOFT_LOCK_PULL);
  return yaw;
}

// --- Camo (bos) & dekking (rots) ---
// Aantal bomen dicht bij (x,z); >=2 = in het bos.
function foliageAt(x, z) {
  let n = 0;
  for (let i = 0; i < forestTrees.length; i++) {
    const dx = forestTrees[i].x - x, dz = forestTrees[i].z - z;
    if (dx * dx + dz * dz < 49 && ++n >= 2) return n; // binnen 7u
  }
  return n;
}
// Doelen die de AI mag zien: verborgen doelen vallen weg, behalve heel dichtbij.
function visibleTargetsFor(t) {
  return aliveTargetsFor(t).filter((o) => !o.hidden || t.group.position.distanceTo(o.group.position) < 14);
}
// Zet camo-visuals aan/uit (half-transparant + HP-balk weg).
function setTankHidden(t, hidden) {
  if (t.hidden === hidden && t._hiddenInit) return;
  t.hidden = hidden; t._hiddenInit = true;
  const P = t.group.userData.parts;
  for (const m of [P.hull, P.trackL, P.trackR, P.dome, P.barrel]) {
    m.material.transparent = hidden;
    m.material.opacity = hidden ? 0.4 : 1;
  }
  if (!t.dead && !t.parts) t.bar.visible = !hidden;
}
// Blokkeert een rots dit punt? (verticale cilinder-benadering)
function rockBlocks(pos) {
  for (let i = 0; i < coverRocks.length; i++) {
    const rk = coverRocks[i];
    const dx = pos.x - rk.x, dz = pos.z - rk.z;
    if (dx * dx + dz * dz < rk.r * rk.r && pos.y < rk.topY) return true;
  }
  return false;
}
function clampArena(v) {
  v.x = Math.max(-ARENA, Math.min(ARENA, v.x));
  v.z = Math.max(-ARENA, Math.min(ARENA, v.z));
}

// ---------------------------------------------------------------------------
// HUD
// ---------------------------------------------------------------------------
let username = 'speler';
let score = 0;
const whoEl = document.getElementById('who');
const scoreEl = document.getElementById('score');
const phpFill = document.getElementById('playerhp-fill');
const partFills = {
  hull: document.getElementById('pb-hull'),
  turret: document.getElementById('pb-turret'),
  trackL: document.getElementById('pb-trackL'),
  trackR: document.getElementById('pb-trackR'),
};
const toastEl = document.getElementById('toast');
const stealthEl = document.getElementById('stealth');
let toastTimer = 0;
function toast(msg, color) {
  toastEl.textContent = msg;
  toastEl.style.color = color || '#fff';
  toastEl.classList.add('show');
  toastTimer = 1.6;
}
function updateHUD() {
  whoEl.textContent = `🎮 ${username}`;
  scoreEl.textContent = `Bully defeated: ${score}`;
  phpFill.style.width = `${Math.max(0, player.hp / player.maxHp * 100)}%`;
  for (const key in partFills) {
    const part = bully.parts[key], el = partFills[key];
    const frac = Math.max(0, part.hp / part.max);
    el.style.setProperty('--v', `${frac * 100}%`);
    el.classList.toggle('dead', part.hp <= 0);
  }
  stealthEl.style.display = (player.hidden && !player.dead) ? 'block' : 'none';
}

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------
function updateTank(t, dt) {
  if (t.dead) {
    t.respawn -= dt;
    if (t.respawn <= 0) placeTank(t, t.faction === 'boss');
    if (t.isPlayer) reticle.visible = false;
    return;
  }

  const s = t.stats;
  let dir = new THREE.Vector3();

  // Bully-onderdelen bepalen wat hij nog kan: rupsen = rijden, toren = richten/schieten.
  let speedMul = 1, canAim = true;
  if (t.parts) {
    const ld = t.parts.trackL.hp <= 0, rd = t.parts.trackR.hp <= 0;
    speedMul = (ld && rd) ? 0 : ((ld || rd) ? 0.4 : 1); // beide rupsen kapot = vast
    canAim = t.parts.turret.hp > 0;
  }

  if (t.isPlayer) {
    const inp = moveInput();
    dir.set(inp.x, 0, inp.z);
    if (inp.len > 0.01) t.heading = lerpAngle(t.heading, Math.atan2(inp.x, inp.z), 0.2);
  } else {
    // ---- game-AI: benader doel, houd afstand, omcirkel ----
    const target = nearest(t, visibleTargetsFor(t)); // verborgen doelen worden genegeerd
    t.wanderT -= dt;
    if (t.wanderT <= 0) { t.wanderT = 1 + Math.random() * 1.5; t.wander.set(Math.random() - 0.5, 0, Math.random() - 0.5); }
    if (target) {
      const toT = new THREE.Vector3().subVectors(target.group.position, t.group.position);
      const dist = toT.length(); toT.normalize();
      const desired = t.faction === 'boss' ? 16 : 22;
      let move = new THREE.Vector3();
      if (dist > desired + 3) move.add(toT);
      else if (dist < desired - 3) move.add(toT.clone().negate());
      // strafe (omcirkelen)
      move.add(new THREE.Vector3(-toT.z, 0, toT.x).multiplyScalar(0.6));
      move.add(t.wander.clone().multiplyScalar(0.3));
      if (move.lengthSq() > 0.001) { move.normalize(); dir.copy(move); t.heading = lerpAngle(t.heading, Math.atan2(move.x, move.z), 0.12); }
      // richten + schieten (alleen als de toren nog leeft)
      if (canAim) {
        t.turretYaw = yawTo(t.group.position, target.group.position); // toren volgt doel (visueel)
        t.fireTimer -= dt;
        const range = t.faction === 'boss' ? 75 : 55;
        if (t.fireTimer <= 0 && dist < range) {
          aiFire(t, target);
          t.fireTimer = s.cd * (0.85 + Math.random() * 0.4);
        }
      }
    } else {
      dir.copy(t.wander);
      if (dir.lengthSq() > 0.001) t.heading = lerpAngle(t.heading, Math.atan2(dir.x, dir.z), 0.1);
    }
  }

  // beweging (+ werkelijke snelheid bijhouden voor camo)
  const px0 = t.group.position.x, pz0 = t.group.position.z;
  if (dir.lengthSq() > 0.001 && speedMul > 0) {
    dir.normalize();
    t.group.position.addScaledVector(dir, s.speed * speedMul * dt);
    clampArena(t.group.position);
  }
  const p = t.group.position;
  p.y = terrainHeight(p.x, p.z) + GRAV_HOVER * s.scale;
  t.group.rotation.y = t.heading;
  const idt = 1 / Math.max(dt, 0.001);
  t.vel.x = (p.x - px0) * idt; t.vel.z = (p.z - pz0) * idt;
  t.speedNow = Math.hypot(t.vel.x, t.vel.z);

  // camo: stil in het bos = verborgen (bully is te groot om te verstoppen)
  if (!t.parts) {
    const hide = t.speedNow < 3.5 && foliageAt(p.x, p.z) >= 2;
    if (hide !== t.hidden) setTankHidden(t, hide);
  }

  // Player: aim DIRECTION manually, RANGE from the slider, FIRE with the button.
  if (t.isPlayer) {
    const dirYaw = aimDirection();
    if (dirYaw !== null) t.turretYaw = lerpAngle(t.turretYaw, dirYaw, 0.35);
    // landing point = direction × range
    const rx = t.group.position.x + Math.sin(t.turretYaw) * aimDistance;
    const rz = t.group.position.z + Math.cos(t.turretYaw) * aimDistance;
    // small soft-lock: snap the reticle onto an enemy near the aim point
    lockTarget = enemyNearPoint(rx, rz, 8);
    reticle.visible = true;
    if (lockTarget) {
      reticle.position.copy(lockTarget.group.position); reticle.position.y += 1.4 * lockTarget.stats.scale;
      reticle.material.color.setHex(0xff5a5a); reticle.scale.set(3.6, 3.6, 1);
    } else {
      reticle.position.set(rx, terrainHeight(rx, rz) + 1.0, rz);
      reticle.material.color.setHex(0xffffff); reticle.scale.set(3, 3, 1);
    }
    // manual fire (not automatic)
    t.fireTimer -= dt;
    if (firePressed() && t.fireTimer <= 0) { playerFire(); t.fireTimer = s.cd; }
  }
  // turret visueel richten (relatief t.o.v. de romp)
  t.turret.rotation.y = t.turretYaw - t.heading;

  // health-bar bijwerken
  t.bar.position.set(p.x, p.y + 3.4 * s.scale, p.z);
  t.bar.userData.fg.scale.x = t.bar.userData.width * Math.max(0, t.hp / t.maxHp);
}

function updateProjectiles(dt) {
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const pr = projectiles[i];
    pr.prev.copy(pr.mesh.position);
    if (pr.gravity) pr.vel.y -= pr.gravity * dt;
    pr.mesh.position.addScaledVector(pr.vel, dt);
    pr.life -= dt;
    const pos = pr.mesh.position;
    let done = false;

    // 1) grond-inslag (correcte hoogte!): kogel onder het terrein = geraakt de grond
    if (pos.y <= terrainHeight(pos.x, pos.z)) {
      if (pr.splash > 0) explode(pos, pr);
      done = true;
    }
    // 2) rots-dekking (blokkeert alleen als de kogel laag genoeg is; boog gaat eroverheen)
    if (!done && rockBlocks(pos)) { if (pr.splash > 0) explode(pos, pr); done = true; }

    // 3) tanks — swept-sphere over het traject van deze frame (geen tunnelen)
    if (!done) {
      for (const t of tanks) {
        if (t.dead || t.faction === pr.faction) continue;
        const cp = closestOnSeg(pr.prev, pos, t.group.position);
        if (cp.dist < t.radius) {
          if (pr.splash > 0) explode(cp.point, pr);
          else applyDamage(t, cp.point, pr.dmg);
          done = true; break;
        }
      }
    }
    // 4) uitgedoofd (te ver / te lang onderweg)
    if (!done && (pr.life <= 0 || Math.abs(pos.y) > 60)) {
      if (pr.splash > 0) explode(pos, pr);
      done = true;
    }
    if (done) { scene.remove(pr.mesh); projectiles.splice(i, 1); }
  }
}

// Schade naar het dichtstbijzijnde nog-levende onderdeel bij het inslagpunt.
const _wp = new THREE.Vector3();
function damageBully(t, point, dmg) {
  let best = null, bd = Infinity;
  for (const key in t.parts) {
    const part = t.parts[key];
    if (part.hp <= 0) continue;
    part.meshes[0].getWorldPosition(_wp);
    const d = _wp.distanceToSquared(point);
    if (d < bd) { bd = d; best = key; }
  }
  if (!best) return;
  const part = t.parts[best];
  part.hp -= dmg;
  if (part.hp <= 0) {
    part.hp = 0;
    for (const m of part.meshes) m.material.color.setHex(0x2b2e34); // verwoest -> donker
    if (best === 'hull') onKill(t);
    else toast(PART_LABELS[best] + ' destroyed!', '#ffd27a');
  }
}
const PART_LABELS = { hull: 'Hull', turret: 'Turret', trackL: 'Left track', trackR: 'Right track' };

function onKill(t) {
  t.dead = true;
  t.group.visible = false; t.bar.visible = false;
  t.respawn = t.faction === 'boss' ? 5 : 4;
  if (t.faction === 'boss') { score++; toast('BULLY DOWN! 🎉', '#46e07a'); }
  else if (t.isPlayer) { toast('Downed — reviving…', '#ff8080'); }
}

// ---------------------------------------------------------------------------
// Loop
// ---------------------------------------------------------------------------
let started = false;
const clock = new THREE.Clock();
const camPos = camera.position.clone();
const camLook = new THREE.Vector3();
const _dp = new THREE.Vector3(), _dl = new THREE.Vector3();
function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  if (started) {
    for (const t of tanks) updateTank(t, dt);
    updateProjectiles(dt);
    updateEffects(dt);
    updateHUD();
    if (toastTimer > 0) { toastTimer -= dt; if (toastTimer <= 0) toastEl.classList.remove('show'); }
  }
  // Camera: fixed tilted angle following the player. The set RANGE changes the framing —
  // longer range looks further ahead toward the landing point and pulls back a bit.
  const target = player.group.position;
  const zoom = 1 + (aimDistance - 10) / 95;               // ~1.0 .. ~1.65
  const lead = aimDistance * 0.5;
  _dl.set(target.x + Math.sin(player.turretYaw) * lead, target.y + 2, target.z + Math.cos(player.turretYaw) * lead);
  _dp.set(target.x + CAM_OFFSET.x * zoom, target.y + CAM_OFFSET.y * zoom, target.z + CAM_OFFSET.z * zoom);
  camPos.lerp(_dp, 0.08); camLook.lerp(_dl, 0.1);
  camera.position.copy(camPos);
  camera.lookAt(camLook);
  sun.target.position.copy(target);
  sun.position.set(target.x + 60, 90, target.z + 40);
  renderer.render(scene, camera);
}
camLook.copy(player.group.position);
animate();

// ---------------------------------------------------------------------------
// Onboarding / start
// ---------------------------------------------------------------------------
const overlay = document.getElementById('overlay');
const input = document.getElementById('username');
const startBtn = document.getElementById('start');
const saved = localStorage.getItem('tt_username');
if (saved) input.value = saved;

const seedLabel = document.getElementById('seedlabel');
function showSeed() { seedLabel.textContent = 'seed ' + SEED; }

function newMap() {
  SEED = Math.floor(Math.random() * 1e9) >>> 0;
  const u = new URL(location.href); u.searchParams.set('seed', SEED); history.replaceState(null, '', u);
  generateWorld();
  for (const t of tanks) placeTank(t, t.faction === 'boss');
  showSeed();
}
document.getElementById('newmap').addEventListener('click', newMap);

const fsEl = document.documentElement;
const reqFS = fsEl.requestFullscreen || fsEl.webkitRequestFullscreen || fsEl.mozRequestFullScreen || fsEl.msRequestFullscreen;
const exitFS = document.exitFullscreen || document.webkitExitFullscreen || document.mozCancelFullScreen || document.msExitFullscreen;
const fsActive = () => document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement;

async function goFullscreen() {
  if (!reqFS) return false; // niet ondersteund (o.a. iPhone Safari)
  try { await reqFS.call(fsEl); } catch (e) { return false; }
  try { if (screen.orientation && screen.orientation.lock) await screen.orientation.lock('landscape'); } catch (e) { /* alleen in FS op sommige toestellen */ }
  return true;
}
document.getElementById('fsbtn').addEventListener('click', async () => {
  if (fsActive()) { if (exitFS) exitFS.call(document); return; }
  const ok = await goFullscreen();
  if (!ok) toast('Fullscreen not supported in this browser', '#ffd27a');
});

function start() {
  const name = (input.value || '').trim() || 'speler';
  username = name.slice(0, 16);
  localStorage.setItem('tt_username', username);
  overlay.classList.add('hidden');
  document.getElementById('hud').classList.remove('hidden');
  document.getElementById('joystick').classList.remove('hidden');
  document.getElementById('aimstick').classList.remove('hidden');
  document.getElementById('rangebox').classList.remove('hidden');
  fireEl.classList.remove('hidden');
  aimDistance = parseFloat(distEl.value);
  showSeed();
  goFullscreen();   // fullscreen + landscape op de start-tap (user gesture)
  started = true;
}
startBtn.addEventListener('click', start);
input.addEventListener('keydown', (e) => { if (e.key === 'Enter') start(); });

// ---------------------------------------------------------------------------
// Resize
// ---------------------------------------------------------------------------
addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

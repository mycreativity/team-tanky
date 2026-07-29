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
  player: { hp: 100, speed: 27, cd: 0.38, pspeed: 78, dmg: 6,  pradius: 0.35, scale: 1.0, radius: 2.4, color: 0x2ec4ff },
  ally:   { hp: 100, speed: 24, cd: 0.75, pspeed: 72, dmg: 5,  pradius: 0.35, scale: 1.0, radius: 2.4, color: 0x36e0a0 },
  bully:  { hp: 640, speed: 13, cd: 1.7,  pspeed: 58, dmg: 22, pradius: 0.7,  scale: 2.2, radius: 4.6, color: 0xff4d4d },
};

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
// Terrein — analytische hoogte-functie zodat tanks exact op de grond staan
// ---------------------------------------------------------------------------
function terrainHeight(x, z) {
  return (
    3.0 * Math.sin(x * 0.05) * Math.cos(z * 0.045) +   // brede glooiing
    2.0 * Math.sin(x * 0.11 + 1.3) * Math.sin(z * 0.09 + 0.5) +
    1.0 +                                              // lift (minder water)
    5.5 * Math.exp(-(((x - 34) ** 2) + ((z + 26) ** 2)) / 700) +  // heuvel
    4.5 * Math.exp(-(((x + 40) ** 2) + ((z - 30) ** 2)) / 900)    // heuvel 2
  );
}

function buildTerrain() {
  const size = 260, seg = 120, step = size / seg, half = size / 2;
  const geo = new THREE.BufferGeometry();
  const positions = [], colors = [], indices = [];
  const cGrass = new THREE.Color(0x568f4a);
  const cSand  = new THREE.Color(0xc0a35f);
  const cRock  = new THREE.Color(0x9095a0);
  const cWater = new THREE.Color(0x2e86a8);
  const tmp = new THREE.Color();

  for (let i = 0; i <= seg; i++) {
    for (let j = 0; j <= seg; j++) {
      const x = -half + i * step;
      const z = -half + j * step;
      const y = terrainHeight(x, z);
      positions.push(x, y, z);
      // kleur per hoogte -> hint naar water / gras / zand / rots
      if (y < -1.5) tmp.copy(cWater);
      else if (y < 3.0) tmp.copy(cGrass);
      else if (y < 6.0) tmp.copy(cSand);
      else tmp.copy(cRock);
      tmp.offsetHSL(0, 0, (Math.random() - 0.5) * 0.04); // lichte ruis
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

  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0.0, flatShading: false });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  scene.add(mesh);
}
buildTerrain();

// ---------------------------------------------------------------------------
// Tank-fabriek (opgebouwd uit primitives)
// ---------------------------------------------------------------------------
function makeTank(colorHex, scale) {
  const group = new THREE.Group();
  const body = new THREE.MeshStandardMaterial({ color: colorHex, roughness: 0.6, metalness: 0.25 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x2a2f38, roughness: 0.8 });

  const hull = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.0, 3.4), body);
  hull.position.y = 0.9; hull.castShadow = true; group.add(hull);

  // tracks
  for (const sx of [-1.5, 1.5]) {
    const tr = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.8, 3.8), dark);
    tr.position.set(sx, 0.5, 0); tr.castShadow = true; group.add(tr);
  }

  // turret (los object zodat het onafhankelijk kan richten)
  const turret = new THREE.Group();
  const dome = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.8, 1.8), body);
  dome.castShadow = true; turret.add(dome);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 2.6, 12), dark);
  barrel.rotation.x = Math.PI / 2;    // langs +Z
  barrel.position.set(0, 0.05, 1.5);
  barrel.castShadow = true; turret.add(barrel);
  turret.position.y = 1.55;
  group.add(turret);

  group.scale.setScalar(scale);
  group.userData.turret = turret;
  group.userData.barrelLen = 2.9 * scale;
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
    bar,
  };
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
  t.group.visible = true; t.bar.visible = true;
}

const player = spawnTank('player', 'team', true);
const allies = [spawnTank('ally', 'team'), spawnTank('ally', 'team'), spawnTank('ally', 'team')];
const bully = spawnTank('bully', 'boss');
bully.group.position.set(0, terrainHeight(0, 0) + GRAV_HOVER, 0);

// ---------------------------------------------------------------------------
// Projectiles
// ---------------------------------------------------------------------------
const projectiles = [];
const projGeo = new THREE.SphereGeometry(1, 8, 8);
const projMatTeam = new THREE.MeshBasicMaterial({ color: 0xbfefff });
const projMatBoss = new THREE.MeshBasicMaterial({ color: 0xffb0b0 });

function fire(t, targetYaw) {
  const s = t.stats;
  const dir = new THREE.Vector3(Math.sin(targetYaw), 0, Math.cos(targetYaw));
  const origin = t.group.position.clone()
    .add(new THREE.Vector3(0, 1.55 * s.scale, 0))
    .add(dir.clone().multiplyScalar(t.barrelLen));
  const mesh = new THREE.Mesh(projGeo, t.faction === 'boss' ? projMatBoss : projMatTeam);
  mesh.scale.setScalar(s.pradius);
  mesh.position.copy(origin);
  scene.add(mesh);
  projectiles.push({ mesh, vel: dir.multiplyScalar(s.pspeed), life: 2.6, dmg: s.dmg, faction: t.faction });
}

// ---------------------------------------------------------------------------
// Input (keyboard + touch joystick + fire button)
// ---------------------------------------------------------------------------
const keys = {};
addEventListener('keydown', (e) => { keys[e.code] = true; });
addEventListener('keyup', (e) => { keys[e.code] = false; });

let joyVec = { x: 0, y: 0 }, joyId = null;
let firing = false;
const joyEl = document.getElementById('joystick');
const knobEl = document.getElementById('joystick-knob');
const fireEl = document.getElementById('firebtn');

function joyStart(e) { joyId = e.pointerId; joyEl.setPointerCapture(e.pointerId); joyMove(e); }
function joyMove(e) {
  if (e.pointerId !== joyId) return;
  const r = joyEl.getBoundingClientRect();
  let dx = e.clientX - (r.left + r.width / 2);
  let dy = e.clientY - (r.top + r.height / 2);
  const max = r.width / 2, len = Math.hypot(dx, dy);
  if (len > max) { dx = dx / len * max; dy = dy / len * max; }
  knobEl.style.transform = `translate(${dx}px, ${dy}px)`;
  joyVec.x = dx / max; joyVec.y = dy / max;
}
function joyEnd(e) { if (e.pointerId !== joyId) return; joyId = null; joyVec.x = 0; joyVec.y = 0; knobEl.style.transform = 'translate(0,0)'; }
joyEl.addEventListener('pointerdown', joyStart);
joyEl.addEventListener('pointermove', joyMove);
joyEl.addEventListener('pointerup', joyEnd);
joyEl.addEventListener('pointercancel', joyEnd);
fireEl.addEventListener('pointerdown', (e) => { e.preventDefault(); firing = true; });
fireEl.addEventListener('pointerup', () => { firing = false; });
fireEl.addEventListener('pointercancel', () => { firing = false; });

function moveInput() {
  let x = 0, z = 0;
  if (keys['KeyW'] || keys['ArrowUp']) z -= 1;
  if (keys['KeyS'] || keys['ArrowDown']) z += 1;
  if (keys['KeyA'] || keys['ArrowLeft']) x -= 1;
  if (keys['KeyD'] || keys['ArrowRight']) x += 1;
  x += joyVec.x; z += joyVec.y;
  const len = Math.hypot(x, z);
  if (len > 1) { x /= len; z /= len; }
  return { x, z, len: Math.min(len, 1) };
}

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
function lerpAngle(a, b, t) {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
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
const bbFill = document.getElementById('bullybar-fill');
const toastEl = document.getElementById('toast');
let toastTimer = 0;
function toast(msg, color) {
  toastEl.textContent = msg;
  toastEl.style.color = color || '#fff';
  toastEl.classList.add('show');
  toastTimer = 1.6;
}
function updateHUD() {
  whoEl.textContent = `🎮 ${username}`;
  scoreEl.textContent = `Bully verslagen: ${score}`;
  phpFill.style.width = `${Math.max(0, player.hp / player.maxHp * 100)}%`;
  bbFill.style.width = `${Math.max(0, bully.hp / bully.maxHp * 100)}%`;
}

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------
function updateTank(t, dt) {
  if (t.dead) {
    t.respawn -= dt;
    if (t.respawn <= 0) placeTank(t, t.faction === 'boss');
    return;
  }

  const s = t.stats;
  let dir = new THREE.Vector3();

  if (t.isPlayer) {
    const inp = moveInput();
    dir.set(inp.x, 0, inp.z);
    if (inp.len > 0.01) t.heading = lerpAngle(t.heading, Math.atan2(inp.x, inp.z), 0.2);
  } else {
    // ---- game-AI: benader doel, houd afstand, omcirkel ----
    const target = nearest(t, aliveTargetsFor(t));
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
      // richten + schieten
      t.turretYaw = yawTo(t.group.position, target.group.position);
      t.fireTimer -= dt;
      if (t.fireTimer <= 0 && dist < 60) { fire(t, t.turretYaw); t.fireTimer = s.cd * (0.85 + Math.random() * 0.4); }
    } else {
      dir.copy(t.wander);
      if (dir.lengthSq() > 0.001) t.heading = lerpAngle(t.heading, Math.atan2(dir.x, dir.z), 0.1);
    }
  }

  // beweging
  if (dir.lengthSq() > 0.001) {
    dir.normalize();
    t.group.position.addScaledVector(dir, s.speed * dt);
    clampArena(t.group.position);
  }
  const p = t.group.position;
  p.y = terrainHeight(p.x, p.z) + GRAV_HOVER * s.scale;
  t.group.rotation.y = t.heading;

  // speler-turret: auto-lock op dichtstbijzijnde vijand
  if (t.isPlayer) {
    const tgt = nearest(t, aliveTargetsFor(t));
    if (tgt) t.turretYaw = yawTo(t.group.position, tgt.group.position);
    t.fireTimer -= dt;
    if (firing && tgt && t.fireTimer <= 0) { fire(t, t.turretYaw); t.fireTimer = s.cd; }
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
    pr.mesh.position.addScaledVector(pr.vel, dt);
    pr.life -= dt;
    let hit = false;
    for (const t of tanks) {
      if (t.dead || t.faction === pr.faction) continue;
      if (pr.mesh.position.distanceTo(t.group.position) < t.radius) {
        t.hp -= pr.dmg; hit = true;
        if (t.hp <= 0) onKill(t);
        break;
      }
    }
    if (hit || pr.life <= 0 || Math.abs(pr.mesh.position.y) > 40) {
      scene.remove(pr.mesh); projectiles.splice(i, 1);
    }
  }
}

function onKill(t) {
  t.dead = true;
  t.group.visible = false; t.bar.visible = false;
  t.respawn = t.faction === 'boss' ? 5 : 4;
  if (t.faction === 'boss') { score++; toast('BULLY VERSLAGEN! 🎉', '#46e07a'); }
  else if (t.isPlayer) { toast('Uitgeschakeld — reviven…', '#ff8080'); }
}

// ---------------------------------------------------------------------------
// Loop
// ---------------------------------------------------------------------------
let started = false;
const clock = new THREE.Clock();
function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  if (started) {
    for (const t of tanks) updateTank(t, dt);
    updateProjectiles(dt);
    updateHUD();
    if (toastTimer > 0) { toastTimer -= dt; if (toastTimer <= 0) toastEl.classList.remove('show'); }
  }
  // vaste, gekantelde camera die de speler volgt (geen meedraaien)
  const target = player.dead ? player.group.position : player.group.position;
  camera.position.set(target.x + CAM_OFFSET.x, target.y + CAM_OFFSET.y, target.z + CAM_OFFSET.z);
  camera.lookAt(target.x, target.y + 2, target.z);
  sun.target.position.copy(target); // schaduw meebewegen
  sun.position.set(target.x + 60, 90, target.z + 40);
  renderer.render(scene, camera);
}
animate();

// ---------------------------------------------------------------------------
// Onboarding / start
// ---------------------------------------------------------------------------
const overlay = document.getElementById('overlay');
const input = document.getElementById('username');
const startBtn = document.getElementById('start');
const saved = localStorage.getItem('tt_username');
if (saved) input.value = saved;

function start() {
  const name = (input.value || '').trim() || 'speler';
  username = name.slice(0, 16);
  localStorage.setItem('tt_username', username);
  overlay.classList.add('hidden');
  document.getElementById('hud').classList.remove('hidden');
  joyEl.classList.remove('hidden');
  fireEl.classList.remove('hidden');
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

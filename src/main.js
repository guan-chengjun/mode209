import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

/* ----------------------------- 基础场景 ----------------------------- */

const app = document.querySelector('#app');
const loadingEl = document.querySelector('#loading');
const toggleBtn = document.querySelector('#toggleBtn');
const resetBtn = document.querySelector('#resetBtn');
const frequencyInput = document.querySelector('#frequency');
const frequencyValue = document.querySelector('#frequencyValue');
const statusText = document.querySelector('#statusText');

const FLOW_Y = 1.72;          // 气体流动轴线高度
const START_X = -4.85;
const END_X = 4.85;
const PARTICLE_MAX = 620;

const state = {
  running: true,
  frequency: 1.2,
  dischargeTimer: 0.35,
  pulse: 0,
  pulseDuration: 0.26,
  spawnAccumulator: 0,
};

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xe9eef4);
scene.fog = new THREE.Fog(0xe9eef4, 12, 25);

const camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, 0.1, 80);
camera.position.set(7.4, 4.1, 8.5);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
app.appendChild(renderer.domElement);

// 中性反射环境仅用于改善金属 GLB 材质，不添加可见装饰物。
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 1.45, 0);
controls.enableDamping = true;
controls.dampingFactor = 0.07;
controls.minDistance = 4.2;
controls.maxDistance = 15;
controls.maxPolarAngle = Math.PI * 0.49;

scene.add(new THREE.AmbientLight(0xffffff, 0.62));
const sun = new THREE.DirectionalLight(0xffffff, 2.35);
sun.position.set(-4.5, 8, 5.5);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -7;
sun.shadow.camera.right = 7;
sun.shadow.camera.top = 7;
sun.shadow.camera.bottom = -4;
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 20;
sun.shadow.bias = -0.00025;
sun.shadow.normalBias = 0.025;
scene.add(sun);

const fillLight = new THREE.DirectionalLight(0xbfd8ff, 0.55);
fillLight.position.set(5, 4, -5);
scene.add(fillLight);

/* ----------------------------- 模型工具 ----------------------------- */

const loader = new GLTFLoader();

async function loadGLB(url) {
  const gltf = await loader.loadAsync(url);
  return gltf.scene;
}

function applyMaterial(root, material) {
  root.traverse((obj) => {
    if (obj.isMesh) obj.material = material;
  });
}

function setShadows(root, cast = true, receive = true) {
  root.traverse((obj) => {
    if (obj.isMesh) {
      obj.castShadow = cast;
      obj.receiveShadow = receive;
    }
  });
}

// 将模型指定轴向缩放到目标长度，并把几何中心移到 Group 原点，便于摆放。
function fitToLength(source, axis, targetLength) {
  const wrapper = new THREE.Group();
  wrapper.add(source);
  wrapper.updateMatrixWorld(true);

  const axisIndex = { x: 0, y: 1, z: 2 }[axis];
  let box = new THREE.Box3().setFromObject(source);
  const size = box.getSize(new THREE.Vector3());
  source.scale.multiplyScalar(targetLength / size.getComponent(axisIndex));

  wrapper.updateMatrixWorld(true);
  box = new THREE.Box3().setFromObject(source);
  const center = box.getCenter(new THREE.Vector3());
  source.position.sub(center);
  return wrapper;
}

/* ----------------------------- 设备搭建 ----------------------------- */

const baseMat = new THREE.MeshStandardMaterial({ color: 0x536170, roughness: 0.72, metalness: 0.16 });
const steelMat = new THREE.MeshStandardMaterial({ color: 0xaab6c2, roughness: 0.28, metalness: 0.82 });
const electrodeMat = new THREE.MeshStandardMaterial({
  color: 0xd7e0ea,
  roughness: 0.34,
  metalness: 0.48,
  emissive: 0x0ea5e9,
  emissiveIntensity: 0,
});
const shellMat = new THREE.MeshStandardMaterial({
  color: 0x9fb2c2,
  roughness: 0.24,
  metalness: 0.55,
  transparent: true,
  opacity: 0.26,
  side: THREE.DoubleSide,
  depthWrite: false,
});
const tubeMat = new THREE.MeshStandardMaterial({
  color: 0xaee8ff,
  roughness: 0.08,
  metalness: 0,
  transparent: true,
  opacity: 0.22,
  side: THREE.DoubleSide,
  depthWrite: false,
  emissive: 0x0b63b6,
  emissiveIntensity: 0.1,
});

function makeLabel(text, color) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'rgba(255,255,255,0.82)';
  ctx.roundRect(18, 24, 476, 80, 24);
  ctx.fill();
  ctx.font = '700 46px "Microsoft YaHei", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = color;
  ctx.fillText(text, 256, 65);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
    fog: false,
    toneMapped: false,
  }));
  sprite.scale.set(1.75, 0.44, 1);
  return sprite;
}

async function buildMachine() {
  const [baseRaw, shellRaw, tubeRaw, fittingRaw, electrodeRaw] = await Promise.all([
    loadGLB('/assets/models/base.glb'),
    loadGLB('/assets/models/shell.glb'),
    loadGLB('/assets/models/tube.glb'),
    loadGLB('/assets/models/fitting.glb'),
    loadGLB('/assets/models/electrode.glb'),
  ]);

  // 轻量化底座 GLB：原始尺寸约 2 × 0.1 × 2。
  const base = baseRaw;
  base.scale.set(4.7, 1.8, 1.55);
  applyMaterial(base, baseMat);
  setShadows(base, true, true);
  scene.add(base);

  // 工业管段 GLB 作为卧式放电腔体外壳，旋转后长轴沿 X。
  const shell = fitToLength(shellRaw, 'z', 6.25);
  shell.rotation.y = Math.PI / 2;
  applyMaterial(shell, shellMat);
  shell.position.set(0, 0, 0);
  scene.add(shell);
  shell.updateMatrixWorld(true);
  const shellBox = new THREE.Box3().setFromObject(shell);
  shell.position.y += 0.2 - shellBox.min.y;
  shell.traverse((obj) => {
    if (obj.isMesh) obj.castShadow = false;
  });

  // X-ray Tube 模型中只保留玻璃罩网格，作为透明放电管。
  const removed = [];
  tubeRaw.traverse((obj) => {
    if (obj.isMesh && !obj.name.includes('envelope_glass')) removed.push(obj);
  });
  removed.forEach((obj) => obj.removeFromParent());
  const tube = fitToLength(tubeRaw, 'x', 3.85);
  applyMaterial(tube, tubeMat);
  tube.position.set(0, FLOW_Y, 0);
  scene.add(tube);

  // 两端法兰接头 GLB，Y 轴旋转到 X 轴。
  for (const side of [-1, 1]) {
    const fitting = fitToLength(fittingRaw.clone(true), 'y', 0.78);
    applyMaterial(fitting, steelMat);
    setShadows(fitting, true, true);
    fitting.rotation.z = Math.PI / 2;
    fitting.position.set(side * 3.22, FLOW_Y, 0);
    scene.add(fitting);
  }

  // 两根螺杆 GLB 充当高压电极，端头朝外、尖端在中央相对。
  for (const side of [-1, 1]) {
    const electrode = fitToLength(electrodeRaw.clone(true), 'y', 2.55);
    applyMaterial(electrode, electrodeMat);
    setShadows(electrode, true, true);
    electrode.rotation.z = side < 0 ? Math.PI / 2 : -Math.PI / 2;
    electrode.position.set(side * 1.58, FLOW_Y, 0);
    scene.add(electrode);
  }

  const inletLabel = makeLabel('干燥 O₂ 入口', '#1267b1');
  inletLabel.position.set(-4.25, 2.72, 0);
  scene.add(inletLabel);

  const outletLabel = makeLabel('O₃ 混合气体出口', '#6d28d9');
  outletLabel.position.set(4.25, 2.72, 0);
  scene.add(outletLabel);
}

/* ----------------------------- 气体粒子 ----------------------------- */

function makeRadialTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.45, 'rgba(255,255,255,0.95)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 64, 64);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

const particleGeometry = new THREE.BufferGeometry();
const positions = new Float32Array(PARTICLE_MAX * 3);
const colors = new Float32Array(PARTICLE_MAX * 3);
positions.fill(-99);
particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
particleGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

const particleMaterial = new THREE.PointsMaterial({
  size: 0.13,
  map: makeRadialTexture(),
  vertexColors: true,
  transparent: true,
  depthWrite: false,
  alphaTest: 0.02,
});
const particles = new THREE.Points(particleGeometry, particleMaterial);
particles.frustumCulled = false;
scene.add(particles);

const active = new Uint8Array(PARTICLE_MAX);
const converted = new Uint8Array(PARTICLE_MAX);
const speedFactor = new Float32Array(PARTICLE_MAX);
const convertX = new Float32Array(PARTICLE_MAX);
const freeIndices = [];
const oxygenColor = new THREE.Color(0x1f8fff);
const ozoneColor = new THREE.Color(0x8a3ffc);
const tmpColor = new THREE.Color();

function placeParticle(i, x, prewarm = false) {
  const i3 = i * 3;
  const radius = Math.sqrt(Math.random()) * 0.25;
  const angle = Math.random() * Math.PI * 2;
  positions[i3] = x;
  positions[i3 + 1] = FLOW_Y + Math.cos(angle) * radius * 0.72;
  positions[i3 + 2] = Math.sin(angle) * radius;
  speedFactor[i] = 0.84 + Math.random() * 0.32;
  convertX[i] = -0.72 + Math.random() * 1.44;
  converted[i] = prewarm && x > convertX[i] ? 1 : 0;
  const color = converted[i] ? ozoneColor : oxygenColor;
  colors[i3] = color.r;
  colors[i3 + 1] = color.g;
  colors[i3 + 2] = color.b;
}

function resetParticles(prewarm = true) {
  active.fill(0);
  converted.fill(0);
  freeIndices.length = 0;
  for (let i = PARTICLE_MAX - 1; i >= 0; i--) freeIndices.push(i);

  positions.fill(-99);
  if (prewarm) {
    for (let n = 0; n < 270; n++) {
      const i = freeIndices.pop();
      active[i] = 1;
      placeParticle(i, START_X + Math.random() * (END_X - START_X), true);
    }
  }
  particleGeometry.attributes.position.needsUpdate = true;
  particleGeometry.attributes.color.needsUpdate = true;
}

function spawnParticle() {
  if (!freeIndices.length) return;
  const i = freeIndices.pop();
  active[i] = 1;
  placeParticle(i, START_X);
}

function updateParticles(dt) {
  const flowSpeed = 0.72 + state.frequency * 0.42;
  const spawnRate = 13 + state.frequency * 11;
  state.spawnAccumulator += dt * spawnRate;
  while (state.spawnAccumulator >= 1) {
    spawnParticle();
    state.spawnAccumulator -= 1;
  }

  for (let i = 0; i < PARTICLE_MAX; i++) {
    if (!active[i]) continue;
    const i3 = i * 3;
    positions[i3] += dt * flowSpeed * speedFactor[i];

    if (!converted[i] && positions[i3] >= convertX[i]) converted[i] = 1;
    const target = converted[i] ? ozoneColor : oxygenColor;
    tmpColor.fromBufferAttribute(particleGeometry.attributes.color, i);
    tmpColor.lerp(target, Math.min(1, dt * 5.5));
    colors[i3] = tmpColor.r;
    colors[i3 + 1] = tmpColor.g;
    colors[i3 + 2] = tmpColor.b;

    if (positions[i3] > END_X) {
      active[i] = 0;
      positions[i3 + 1] = -99;
      freeIndices.push(i);
    }
  }
  particleGeometry.attributes.position.needsUpdate = true;
  particleGeometry.attributes.color.needsUpdate = true;
}

resetParticles(true);

/* ----------------------------- 放电特效 ----------------------------- */

const arcLines = [];
for (let a = 0; a < 4; a++) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(11 * 3), 3));
  const material = new THREE.LineBasicMaterial({
    color: a === 0 ? 0x075985 : 0x0284c7,
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });
  const line = new THREE.Line(geometry, material);
  line.frustumCulled = false;
  scene.add(line);
  arcLines.push(line);
}

const glowSprite = new THREE.Sprite(new THREE.SpriteMaterial({
  map: makeRadialTexture(),
  color: 0x67e8f9,
  transparent: true,
  opacity: 0,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
}));
glowSprite.position.set(0, FLOW_Y, 0);
glowSprite.scale.setScalar(0.75);
scene.add(glowSprite);

const flashLight = new THREE.PointLight(0x7dd3fc, 0, 6, 2);
flashLight.position.set(0, FLOW_Y, 0.2);
scene.add(flashLight);

function regenerateArcs() {
  arcLines.forEach((line, lineIndex) => {
    const attribute = line.geometry.attributes.position;
    const count = attribute.count;
    const lateral = 0.09 + lineIndex * 0.018;
    for (let j = 0; j < count; j++) {
      const t = j / (count - 1);
      const x = THREE.MathUtils.lerp(-0.34, 0.34, t);
      const endpoint = j === 0 || j === count - 1;
      const amplitude = endpoint ? 0 : lateral;
      attribute.setXYZ(
        j,
        x,
        FLOW_Y + (Math.random() - 0.5) * 2 * amplitude,
        (Math.random() - 0.5) * 2 * amplitude * 1.2
      );
    }
    attribute.needsUpdate = true;
  });
}

function setDischargeVisual(strength) {
  arcLines.forEach((line, i) => {
    line.material.opacity = strength * (i === 0 ? 0.95 : 0.62);
  });
  glowSprite.material.opacity = 0.2 * strength;
  glowSprite.scale.setScalar(0.55 + strength * 0.32);
  flashLight.intensity = 5.5 * strength;
  tubeMat.emissiveIntensity = 0.08 + 0.32 * strength;
  electrodeMat.emissiveIntensity = 0.55 * strength;
}

function triggerDischarge() {
  state.pulse = state.pulseDuration * (0.82 + Math.random() * 0.35);
  regenerateArcs();
}

function showFrozenDischarge() {
  regenerateArcs();
  state.pulse = state.pulseDuration;
  setDischargeVisual(0.86);
}

function updateDischarge(dt) {
  state.dischargeTimer -= dt;
  if (state.dischargeTimer <= 0) {
    triggerDischarge();
    state.dischargeTimer = (1 / state.frequency) * (0.72 + Math.random() * 0.55);
  }
  state.pulse = Math.max(0, state.pulse - dt);
  const normalized = THREE.MathUtils.clamp(state.pulse / state.pulseDuration, 0, 1);
  const flicker = normalized > 0 ? normalized * (0.62 + Math.random() * 0.38) : 0;
  setDischargeVisual(flicker);
}

/* ----------------------------- UI 与循环 ----------------------------- */

toggleBtn.addEventListener('click', () => {
  state.running = !state.running;
  toggleBtn.textContent = state.running ? '暂停仿真' : '继续仿真';
  statusText.textContent = state.running ? '● 运行中' : '● 已暂停（画面定格）';
  statusText.className = state.running ? 'status running' : 'status paused';
  if (!state.running) showFrozenDischarge();
});

resetBtn.addEventListener('click', () => resetParticles(true));

frequencyInput.addEventListener('input', () => {
  state.frequency = Number(frequencyInput.value);
  frequencyValue.textContent = `${state.frequency.toFixed(1)} 次/秒`;
});

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  if (state.running) {
    updateParticles(dt);
    updateDischarge(dt);
  }
  controls.update();
  renderer.render(scene, camera);
}

const debugParams = new URLSearchParams(location.search);
if (debugParams.has('paused')) {
  state.running = false;
  toggleBtn.textContent = '继续仿真';
  statusText.textContent = '● 已暂停（画面定格）';
  statusText.className = 'status paused';
}

buildMachine()
  .then(() => {
    loadingEl.classList.add('hidden');
    if (!state.running) showFrozenDischarge();
  })
  .catch((error) => {
    console.error(error);
    loadingEl.textContent = '模型加载失败：请运行 npm start 后通过 http://localhost:5173 访问。';
  });

animate();

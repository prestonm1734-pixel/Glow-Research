// ===================== Glow Research — real-time 3D hero vial =====================
// The vial is a surface of revolution, so it is built from a lathe profile rather
// than a downloaded model. Glass uses physical transmission against a procedural
// studio environment, which is what produces the actual refraction.

import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const stage = document.getElementById('orbitStage');
const heroEl = document.querySelector('.hero');
if (stage && heroEl) init();

function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')));
  } catch (e) {
    return false;
  }
}

function init() {
  // leave the PNG in place if 3D would be unwelcome or unsupported
  if (prefersReducedMotion() || !webglAvailable()) return;

  let renderer;
  const canvas = document.createElement('canvas');
  canvas.className = 'hero-canvas';
  canvas.setAttribute('aria-hidden', 'true');

  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  } catch (e) {
    return; // context creation failed — PNG stays
  }

  stage.appendChild(canvas);

  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
  camera.position.set(0, 0.12, 9.2);

  // ---- procedural studio environment: believable reflections, no HDR file ----
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envRT = pmrem.fromScene(new RoomEnvironment(), 0.04);
  scene.environment = envRT.texture;
  pmrem.dispose();

  // ---------------------------------------------------------------- geometry
  const group = new THREE.Group();
  scene.add(group);

  // Vial silhouette, traced to match assets/vial-bpc-157.png.
  // x = radius, y = height (centred so the vial sits about the origin).
  const R = 0.86;                       // body radius
  const profile = [
    [0.00, -1.70],
    [R * 0.55, -1.70],
    [R * 0.92, -1.66],                  // base fillet
    [R, -1.55],
    [R, 0.72],                          // straight body
    [R * 0.99, 0.86],
    [R * 0.74, 1.10],                   // shoulder
    [R * 0.52, 1.26],
    [R * 0.50, 1.62],                   // neck
    [R * 0.585, 1.70],                  // flange lip
    [R * 0.585, 1.80],
    [R * 0.50, 1.80],
    [R * 0.42, 1.74],
    [R * 0.42, 1.66],
  ].map(([x, y]) => new THREE.Vector2(x, y));

  const glassGeo = new THREE.LatheGeometry(profile, 128);
  const glass = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    metalness: 0,
    roughness: 0.02,
    transmission: 1,
    thickness: 0.35,
    ior: 1.5,
    envMapIntensity: 2.2,
    clearcoat: 1,
    clearcoatRoughness: 0.02,
    transparent: true,
    side: THREE.DoubleSide,   // see the far wall through the near one
  });
  const vial = new THREE.Mesh(glassGeo, glass);
  group.add(vial);

  // ---- lyophilised powder resting in the base ----
  const powderGeo = new THREE.CylinderGeometry(R * 0.93, R * 0.9, 0.3, 64, 1);
  const powder = new THREE.Mesh(
    powderGeo,
    new THREE.MeshStandardMaterial({ color: 0xf2f2ef, roughness: 1, metalness: 0 })
  );
  powder.position.y = -1.42;
  group.add(powder);

  // ---- crimp cap ----
  const capMat = new THREE.MeshStandardMaterial({ color: 0x1c1c1c, roughness: 0.42, metalness: 0.55 });
  const capProfile = [
    [0.00, 1.62],
    [R * 0.66, 1.62],
    [R * 0.70, 1.70],
    [R * 0.70, 2.16],
    [R * 0.66, 2.24],
    [R * 0.30, 2.26],
    [0.00, 2.26],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  group.add(new THREE.Mesh(new THREE.LatheGeometry(capProfile, 96), capMat));

  // ---- label drawn to a canvas so branding stays crisp and editable ----
  const label = new THREE.Mesh(
    new THREE.CylinderGeometry(R * 1.008, R * 1.008, 1.42, 128, 1, true),
    new THREE.MeshStandardMaterial({
      map: makeLabelTexture(),
      transparent: true,
      roughness: 0.62,
      metalness: 0,
      side: THREE.DoubleSide,
    })
  );
  label.position.y = -0.18;
  // texture band is centred at u=0.5, which maps to the back of the cylinder,
  // so turn it round to face the camera
  label.rotation.y = Math.PI;
  group.add(label);

  // ---------------------------------------------------------------- lighting
  const key = new THREE.DirectionalLight(0xffffff, 2.6);
  key.position.set(-3.2, 4.2, 4.6);
  scene.add(key);

  const rim = new THREE.DirectionalLight(0xffffff, 5.2);   // separates glass from black
  rim.position.set(2.6, 1.4, -4.2);
  scene.add(rim);

  const fill = new THREE.DirectionalLight(0xffffff, 0.7);
  fill.position.set(3.6, -1.6, 2.4);
  scene.add(fill);

  // ------------------------------------------------------------------ sizing
  function resize() {
    const w = stage.clientWidth;
    const h = stage.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  resize();
  window.addEventListener('resize', resize);

  // --------------------------------------------------------- interaction loop
  let tmx = 0, tmy = 0, mmx = 0, mmy = 0;   // target + smoothed pointer (-0.5..0.5)
  heroEl.addEventListener('mousemove', e => {
    const r = heroEl.getBoundingClientRect();
    tmx = (e.clientX - r.left) / r.width - 0.5;
    tmy = (e.clientY - r.top) / r.height - 0.5;
  });
  heroEl.addEventListener('mouseleave', () => { tmx = 0; tmy = 0; });

  // stop rendering once the hero is scrolled away
  let visible = true;
  new IntersectionObserver(
    ([entry]) => { visible = entry.isIntersecting; },
    { threshold: 0 }
  ).observe(heroEl);

  let scrollSpin = 0;
  window.addEventListener('scroll', () => {
    scrollSpin = window.scrollY / Math.max(1, window.innerHeight);
  }, { passive: true });

  const clock = new THREE.Clock();
  function frame() {
    requestAnimationFrame(frame);
    if (!visible) return;

    const t = clock.getElapsedTime();
    mmx += (tmx - mmx) * 0.055;
    mmy += (tmy - mmy) * 0.055;

    // No full spin: the label has to stay readable. A slow sway plus
    // cursor-driven turn keeps it alive without hiding the branding.
    const idle = Math.sin(t * 0.42) * 0.10;
    group.rotation.y = idle + mmx * 0.85 + scrollSpin * 0.35;
    group.rotation.x = mmy * 0.34;
    group.rotation.z = mmx * 0.05;
    group.position.y = Math.sin(t * 1.05) * 0.055;

    renderer.render(scene, camera);
  }
  frame();

  // only now hide the PNG — if anything above threw, the fallback stayed put
  stage.classList.add('is-3d');
}

// Label artwork, matching the printed vial: wordmark, compound, dose, disclaimer.
function makeLabelTexture() {
  const W = 2048, H = 1024;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const x = c.getContext('2d');

  // The cylinder wraps 360deg, so only paint the front arc and leave the rest
  // clear; that way the label reads as a wrapped sticker, not a full sleeve.
  x.clearRect(0, 0, W, H);
  const RW = W * 0.62, L = (W - RW) / 2;  // band centred at u = 0.5
  x.fillStyle = '#141414';
  x.fillRect(L, 0, RW, H);

  const cx = L + RW / 2;
  // Only ~70deg of arc faces the camera head-on. Texture width maps to arc
  // length, so type must be held to a narrow slice or it wraps round the
  // sides and foreshortens into the silhouette.
  const SAFE = RW * 0.36;
  x.textAlign = 'center';

  // shrink until the line fits the safe width, then draw
  function line(text, weight, size, y, colour, family) {
    let px = Math.round(H * size);
    const fam = family || 'Inter, system-ui, sans-serif';
    do {
      x.font = `${weight} ${px}px ${fam}`;
      if (x.measureText(text).width <= SAFE) break;
      px -= 4;
    } while (px > 12);
    x.fillStyle = colour;
    x.fillText(text, cx, y);
    return px;
  }

  const brandPx = line('Glow ✦', 600, 0.145, H * 0.265, '#ffffff', 'Fraunces, Georgia, serif');

  x.strokeStyle = 'rgba(255,255,255,.32)';
  x.lineWidth = 3;
  x.beginPath();
  x.moveTo(cx - SAFE * 0.5, H * 0.345);
  x.lineTo(cx + SAFE * 0.5, H * 0.345);
  x.stroke();

  line('BPC-157', 700, 0.155, H * 0.545, '#ffffff');
  line('5 MG · 99.8%', 400, 0.092, H * 0.675, '#e2e2e0');
  line('FOR RESEARCH USE ONLY', 400, 0.062, H * 0.800, '#c2c2bf');
  line('glowresearch', 400, 0.070, H * 0.925, '#9d9d9a');
  void brandPx;

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

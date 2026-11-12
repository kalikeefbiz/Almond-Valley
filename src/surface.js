// Shared surface system: one procedural detail-texture array and the materials built on it.
// Every procedural mesh in the valley (buildings, Heartwell, props, viaduct, terrain) uses these, so
// timber, masonry, corrugated iron, riveted plate, dirt and canyon rock look the same everywhere.
// Textures are generated in code at start-up: no downloads, about 2.4 MB of GPU memory with mipmaps.
import * as THREE from 'three';
import { N, CELL } from './data.js';

export const LAYER = { plain: 0, wood: 1, stone: 2, corrugated: 3, plate: 4, dirt: 5, rock: 6, cloth: 7, emblem: 8 };
const NL = 9, S = 256;

export const glowUniform = { value: 0.6 };
// Uniform objects are shared by reference between all materials.
export const U = {
  uDet: { value: null }, uMask: { value: null }, uGlow: glowUniform, uTime: { value: 0 },
  uRim: { value: new THREE.Color(0x40362c) }, uHaze: { value: 0.35 }, uDetail: { value: 1 },
  uNight: { value: 0 }, uWater: { value: 1 },
};

// ---------------------------------------------------------------- tileable noise
const H = (x, y, s) => { let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 1274126177) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967295; };
function tn(x, y, px, py, s) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const wx = a => ((a % px) + px) % px, wy = a => ((a % py) + py) % py;
  const a = H(wx(xi), wy(yi), s), b = H(wx(xi + 1), wy(yi), s), c = H(wx(xi), wy(yi + 1), s), d = H(wx(xi + 1), wy(yi + 1), s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
// cx, cy: lattice cells across the tile at the first octave
function fbm(x, y, cx, cy, s, oct = 4) {
  let f = 0, a = 0.5, t = 0;
  for (let o = 0; o < oct; o++) { f += a * tn(x / S * cx, y / S * cy, cx, cy, s + o); t += a; a *= 0.5; cx *= 2; cy *= 2; }
  return f / t;
}
const ss = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// Each layer returns [r, g, b, height]; rgb is a multiplier around 0.5 (the shader doubles it), height drives bump shading.
const GEN = [
  // 0 plain: faint mottling. Alpha is a clean fbm also used for clouds, water and terrain macro variation.
  (x, y) => { const n = fbm(x, y, 4, 4, 1, 5), f = fbm(x, y, 32, 32, 2, 2), v = 0.5 + (f - 0.5) * 0.1 + (n - 0.5) * 0.06; return [v, v, v, n]; },
  // 1 wood: vertical boards with grain, gaps, butt joints and nail heads
  (x, y) => {
    const pw = 32, pi = Math.floor(x / pw), px = x - pi * pw, pr = H(pi, 7, 3), grain = fbm(x, y, 48, 3, 11, 3);
    let v = 0.5 + (pr - 0.5) * 0.24 + (grain - 0.5) * 0.26, h = 0.62 + (pr - 0.5) * 0.3 + (grain - 0.5) * 0.2;
    if (px < 1.6 || px > pw - 1.6) { v *= 0.42; h = 0.08; }
    const jy = H(pi, 3, 9) * S; if (Math.abs(y - jy) < 1.3) { v *= 0.5; h = 0.15; }
    for (const ny of [22, 234]) { const dx = px - 16, dy = y - ny; if (dx * dx + dy * dy < 5) v *= 0.45; }
    return [v * 1.05, v, v * 0.93, h];
  },
  // 2 masonry: ashlar blocks in running bond
  (x, y) => {
    const r = Math.floor(y / 64), xo = (r % 2) * 64, bx0 = Math.floor((x + xo) / 128), split = H(bx0, r, 5) > 0.55;
    const bw = split ? 64 : 128, bx = Math.floor((x + xo) / bw), lx = (x + xo) - bx * bw, ly = y - r * 64, tone = H(bx, r * 3 + (split ? 1 : 0), 6), sp = fbm(x, y, 40, 40, 7, 2);
    let v = 0.5 + (tone - 0.5) * 0.3 + (sp - 0.5) * 0.16, h = 0.7 + (tone - 0.5) * 0.3 + (sp - 0.5) * 0.15;
    const e = Math.min(lx, ly, bw - lx, 64 - ly);
    if (e < 2.6) { v *= 0.45; h = 0.05; } else if (e < 7) h *= 0.55 + 0.45 * (e - 2.6) / 4.4;
    const warm = (H(bx, r, 8) - 0.5) * 0.07;
    return [v + warm, v, v - warm, h];
  },
  // 3 corrugated iron with rust and sheet seams
  (x, y) => {
    const s = Math.sin(x / 32 * Math.PI * 2), rust = ss(0.48, 0.74, fbm(x, y, 6, 3, 21, 4)), st = fbm(x, y, 40, 1, 22, 2);
    let v = 0.5 + s * 0.1 - (st - 0.5) * 0.2, h = 0.5 + s * 0.45;
    const ly = y % 128; if (ly < 2.2) { v *= 0.55; h *= 0.5; } else if (ly < 7 && ((x + 4) % 32) < 3.5) v *= 0.6;
    return [v + rust * 0.15, v - rust * 0.02, v - rust * 0.11, h];
  },
  // 4 riveted plate
  (x, y) => {
    const lx = x % 128, ly = y % 128, n = fbm(x, y, 3, 3, 31, 4), st = fbm(x, y, 48, 2, 32, 2);
    let v = 0.5 + (n - 0.5) * 0.16 - (st - 0.5) * 0.12, h = 0.6;
    if (lx < 2.2 || ly < 2.2) { v = 0.36; h = 0.1; }
    else {
      if (lx < 5.5 || ly < 5.5) v += 0.07;
      const rx = ((lx + 16) % 32) - 16, ry = ((ly + 16) % 32) - 16;
      const d = Math.min(Math.hypot(rx, ly - 9), Math.hypot(lx - 9, ry), Math.hypot(rx, ly - 119), Math.hypot(lx - 119, ry));
      if (d < 3) { v = 0.57; h = 1; } else if (d < 4.6) { v *= 0.7; h = 0.45; }
    }
    return [v, v, v * 1.02, h];
  },
  // 5 dirt with pebbles
  (x, y) => {
    const n = fbm(x, y, 8, 8, 41, 5), n2 = fbm(x, y, 40, 40, 42, 2);
    let v = 0.5 + (n - 0.5) * 0.34 + (n2 - 0.5) * 0.14, h = n * 0.7 + n2 * 0.3;
    const gx = Math.floor(x / 16), gy = Math.floor(y / 16);
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
      const cx = ((gx + i) % 16 + 16) % 16, cy = ((gy + j) % 16 + 16) % 16; if (H(cx, cy, 43) < 0.8) continue;
      const px = (gx + i + H(cx, cy, 44)) * 16, py = (gy + j + H(cx, cy, 45)) * 16, r = 1.4 + H(cx, cy, 46) * 2.4, d = Math.hypot(x - px, y - py);
      if (d < r) { v = 0.52 + (H(cx, cy, 47) - 0.4) * 0.22; h = 1; } else if (d < r + 1.2) v *= 0.9;
    }
    return [v * 1.03, v, v * 0.95, h];
  },
  // 6 canyon rock: horizontal bedding with cracks
  (x, y) => {
    const st = fbm(x, y, 2, 14, 51, 4), c = fbm(x, y, 6, 5, 52, 3), n2 = fbm(x, y, 48, 48, 53, 2);
    let v = 0.5 + (st - 0.5) * 0.42 + (n2 - 0.5) * 0.12, h = st * 0.55 + Math.floor(st * 7) / 7 * 0.45;
    if (Math.abs(c - 0.5) < 0.017) { v *= 0.58; h *= 0.4; }
    return [v * 1.03, v, v * 0.96, h];
  },
  // 7 cloth: weave and soft folds
  (x, y) => { const w = Math.sin(x * Math.PI / 2) * Math.sin(y * Math.PI / 2) * 0.035, f = Math.sin(x / 64 * Math.PI * 2 + Math.sin(y / S * Math.PI * 2) * 1.5), n = fbm(x, y, 5, 5, 61, 3); const v = 0.5 + w + f * 0.07 + (n - 0.5) * 0.12; return [v, v, v, 0.5 + f * 0.5]; },
  // 8 banner: the water-drop-in-gear emblem, gold on oxblood (stored at half intensity; mesh colour is white)
  (x, y) => {
    const dx = x - 128, dy = y - 132, r = Math.hypot(dx, dy), a = Math.atan2(dy, dx), n = fbm(x, y, 6, 6, 71, 3);
    let c = [0.42, 0.1, 0.07];
    const gold = [0.92, 0.66, 0.16];
    const tooth = Math.cos(a * 10) > 0.25 ? 86 : 74;
    if (r > 50 && r < tooth) c = gold;
    const drop = Math.hypot(dx, dy - 8) < 27 || (dy < 8 && dy > -40 && Math.abs(dx) < (dy + 42) * 0.52);
    if (drop && r < 46) c = gold;
    if (x < 10 || x > 246 || y < 10 || y > 246) c = gold;
    const k = 0.5 * (0.85 + (n - 0.5) * 0.3);
    return [c[0] * k, c[1] * k, c[2] * k, 0.5];
  },
];

export function initSurface(renderer) {
  if (U.uDet.value) return;
  const data = new Uint8Array(S * S * 4 * NL);
  for (let l = 0; l < NL; l++) {
    const g = GEN[l], o0 = l * S * S * 4;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const p = g(x, y), o = o0 + (y * S + x) * 4;
      data[o] = Math.max(0, Math.min(255, p[0] * 255)); data[o + 1] = Math.max(0, Math.min(255, p[1] * 255)); data[o + 2] = Math.max(0, Math.min(255, p[2] * 255)); data[o + 3] = Math.max(0, Math.min(255, p[3] * 255));
    }
  }
  const t = new THREE.DataArrayTexture(data, S, S, NL);
  t.format = THREE.RGBAFormat; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
  t.generateMipmaps = true; t.anisotropy = renderer ? Math.min(4, renderer.capabilities.getMaxAnisotropy()) : 1; t.needsUpdate = true;
  U.uDet.value = t;
}

// ---------------------------------------------------------------- shader pieces
const V_PARS = `
attribute float glow; attribute float layer; uniform float uTime;
varying float vGlow; varying float vLayer; varying vec2 vDuv; varying vec3 vWPos; varying vec2 vBM; varying vec3 vWN;`;
const V_BEGIN = `
vGlow = glow; vLayer = layer; vDuv = uv; vWN = normal;
int li_ = int(layer + 0.5);
vBM = vec2(li_ == 1 ? 0.9 : li_ == 2 ? 1.2 : li_ == 3 ? 1.5 : li_ == 4 ? 0.45 : li_ == 5 ? 0.8 : li_ == 6 ? 1.0 : li_ == 7 ? 0.5 : li_ == 8 ? 0.0 : 0.2, li_ == 4 ? 1.0 : (li_ == 3 ? 0.45 : 0.0));
if (li_ == 8 && glow < 0.01) transformed += normal * sin(uTime * 2.3 + position.y * 2.1 + position.x * 1.3 + position.z) * 0.07 * (1.0 - uv.y);`;
const V_WORLD = `
vec4 wp_ = vec4(transformed, 1.0);
#ifdef USE_INSTANCING
wp_ = instanceMatrix * wp_;
#endif
vWPos = (modelMatrix * wp_).xyz;`;
const F_PARS = `
uniform sampler2DArray uDet; uniform sampler2D uMask; uniform float uGlow; uniform vec3 uRim; uniform float uHaze; uniform float uDetail; uniform float uNight; uniform float uTime; uniform float uWater;
varying float vGlow; varying float vLayer; varying vec2 vDuv; varying vec3 vWPos; varying vec2 vBM; varying vec3 vWN;
vec3 perturbN_(vec3 sp, vec3 sn, vec2 dH) {
  vec3 sx = dFdx(sp), sy = dFdy(sp), r1 = cross(sy, sn), r2 = cross(sn, sx);
  float det = dot(sx, r1);
  vec3 g = sign(det) * (dH.x * r1 + dH.y * r2);
  return normalize(abs(det) * sn - g);
}
vec3 sr_(vec3 c) { return c * c * (c * 0.305 + 0.695); }`;   // fast sRGB -> linear
// distance fog plus a ground-hugging haze, so far canyon walls fade and the valley floor keeps depth
const F_FOG = `
#ifdef USE_FOG
float fF_ = smoothstep(fogNear, fogFar, vFogDepth);
float hF_ = exp(-max(vWPos.y, 0.0) * 0.04);
fF_ = clamp(max(fF_, uHaze * hF_ * smoothstep(40.0, 320.0, vFogDepth)), 0.0, 1.0);
gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, fF_);
#endif`;
const patchV = (v) => v.replace('#include <common>', '#include <common>' + V_PARS).replace('#include <begin_vertex>', '#include <begin_vertex>' + V_BEGIN).replace('#include <project_vertex>', '#include <project_vertex>' + V_WORLD);

// Standard surface: vertex colour x detail layer, bump from the layer's height, night glow, rim sheen.
export function makeMaterial(opts = {}) {
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, ...opts });
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = patchV(sh.vertexShader);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>' + F_PARS)
      .replace('#include <color_fragment>', '#include <color_fragment>\nfloat fw_ = max(length(dFdx(vDuv)), length(dFdy(vDuv)));\nfloat df_ = 1.0 - smoothstep(0.02, 0.075, fw_);\nvec4 det_ = texture(uDet, vec3(vDuv, floor(vLayer + 0.5)));\ndiffuseColor.rgb *= mix(vec3(1.0), det_.rgb * 2.0, 0.12 + 0.88 * df_);')
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\nif (uDetail > 0.0) normal = perturbN_(-vViewPosition, normal, vec2(dFdx(det_.a), dFdy(det_.a)) * vBM.x * uDetail * df_ * 0.11);')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * vGlow * uGlow;\nfloat rim_ = pow(1.0 - saturate(dot(normal, normalize(vViewPosition))), 3.0);\ntotalEmissiveRadiance += uRim * rim_ * (0.12 + 0.5 * vBM.y);')
      .replace('#include <fog_fragment>', F_FOG);
  };
  mat.customProgramCacheKey = () => 'av-surface';
  return mat;
}

// Canyon and valley floor. Colour is computed per pixel from world position: stepped sandstone strata on the
// cliffs, talus on the ledges, scrub on the rim, packed dirt on the floor with roads, building aprons and
// lamp-light pools read from the settlement mask (R roads, G aprons, B lamp light).
export function makeTerrainMaterial() {
  const mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const GW = (N * CELL).toFixed(1);
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = patchV(sh.vertexShader);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>' + F_PARS + `
float tH_; vec3 tE_;
vec3 terrain_() {
  vec3 p = vWPos; vec3 n = normalize(vWN);
  float slope = clamp(1.0 - n.y, 0.0, 1.0);
  float n1 = texture(uDet, vec3(p.xz * 0.0043, 0.0)).a, n2 = texture(uDet, vec3(p.xz * 0.023 + 0.37, 0.0)).a;
  vec4 dg = texture(uDet, vec3(p.xz * 0.21, 5.0));
  vec2 suv = abs(n.x) > abs(n.z) ? p.zy : p.xy;
  vec4 dr = texture(uDet, vec3(suv * 0.085, 6.0));
  // strata: warped height bands, each with its own tone
  float sy = p.y * 0.36 + n1 * 2.6 + n2 * 0.5 + p.x * 0.004;
  float bi = floor(sy), bf = fract(sy), r = fract(sin(bi * 12.9898) * 43758.5453);
  vec3 rock = mix(vec3(0.58, 0.29, 0.20), vec3(0.78, 0.48, 0.31), r);
  rock = mix(rock, vec3(0.88, 0.66, 0.46), step(0.80, r));
  rock = mix(rock, vec3(0.42, 0.18, 0.13), step(r, 0.13));
  rock *= 1.0 - 0.38 * smoothstep(0.86, 1.0, bf);
  rock *= 0.82 + 0.3 * n2;
  vec3 dirt = mix(vec3(0.54, 0.41, 0.31), vec3(0.70, 0.56, 0.42), n2 * 0.6 + n1 * 0.5);
  float cliff = smoothstep(0.10, 0.36, slope);
  vec3 col = mix(mix(dirt, rock, 0.3 * smoothstep(1.0, 6.0, p.y)) * dg.rgb * 2.0, rock * dr.rgb * 2.0, cliff);
  // scrub and dry grass on the high ground
  float top = smoothstep(38.0, 46.0, p.y) * (1.0 - cliff) * smoothstep(0.35, 0.6, n1 * 0.6 + n2 * 0.5);
  col = mix(col, mix(vec3(0.36, 0.40, 0.20), vec3(0.60, 0.52, 0.30), n2) * dg.rgb * 2.0, top);
  tH_ = mix(dg.a, dr.a, cliff); tE_ = vec3(0.0);
  // the settlement floor
  vec2 muv = p.xz / ${GW} + 0.5;
  if (p.y < 0.6 && muv.x > 0.0 && muv.x < 1.0 && muv.y > 0.0 && muv.y < 1.0) {
    vec4 m = texture2D(uMask, muv + (vec2(dg.a, n2) - 0.5) * 0.0035);
    float rd = m.r + (dg.a - 0.5) * 0.42;
    float road = smoothstep(0.40, 0.58, rd);
    float rut = smoothstep(0.02, 0.0, abs(fract(n2 * 3.0 + dg.a * 0.3) - 0.5) - 0.42);
    vec3 roadCol = mix(vec3(0.82, 0.70, 0.54), vec3(0.70, 0.57, 0.43), dg.a) * (0.92 + 0.16 * dg.a) * (1.0 - 0.12 * rut);
    col = mix(col, roadCol, road * 0.92);
    col *= 1.0 - 0.3 * smoothstep(0.30, 0.42, rd) * (1.0 - road);
    col *= 1.0 - 0.42 * m.g * (1.0 - road * 0.6);
    tE_ = sr_(vec3(1.0, 0.62, 0.28)) * m.b * m.b * uNight * 1.7 * (0.75 + 0.5 * dg.a);
  }
  return sr_(col);
}`)
      .replace('#include <color_fragment>', 'diffuseColor.rgb = terrain_();')
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\nif (uDetail > 0.0) normal = perturbN_(-vViewPosition, normal, vec2(dFdx(tH_), dFdy(tH_)) * uDetail * 0.16);')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * tE_;')
      .replace('#include <fog_fragment>', F_FOG);
  };
  mat.customProgramCacheKey = () => 'av-terrain';
  return mat;
}

// Reserve pools and turbine basins: glowing cyan water with drifting caustics.
export function makeWaterMaterial(hex = 0x2fb6d8, opts = {}) {
  const mat = new THREE.MeshBasicMaterial({ color: hex, transparent: true, opacity: 0.94, ...opts });
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = patchV(sh.vertexShader);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>' + F_PARS)
      .replace('#include <color_fragment>', `
vec2 wuv_ = vWPos.xz * 0.13;
float wa_ = texture(uDet, vec3(wuv_ + vec2(uTime * 0.021, uTime * 0.013), 0.0)).a;
float wb_ = texture(uDet, vec3(wuv_ * 1.7 - vec2(uTime * 0.017, -uTime * 0.023), 0.0)).a;
float wl_ = 1.0 - smoothstep(0.0, 0.085, abs(wa_ - wb_));
diffuseColor.rgb = mix(diffuseColor.rgb * (0.5 + 0.5 * wa_), vec3(0.55, 0.92, 0.95), wl_ * 0.32) * uWater;`)
      .replace('#include <fog_fragment>', F_FOG);
  };
  mat.customProgramCacheKey = () => 'av-water';
  return mat;
}

// Bring a textured (Meshy) material into the same atmosphere: shared haze, and window light recovered from
// the baked texture (bright warm texels glow at night) so imported models light up like the procedural ones.
export function joinAtmosphere(mat, { windows = true } = {}) {
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWPos;').replace('#include <project_vertex>', '#include <project_vertex>' + V_WORLD);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uGlow; uniform float uHaze; uniform vec3 uRim; varying vec3 vWPos;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n' + (windows ? 'float wm_ = smoothstep(0.42, 0.75, diffuseColor.r) * smoothstep(0.08, 0.3, diffuseColor.r - diffuseColor.b) * smoothstep(0.18, 0.4, diffuseColor.g);\ntotalEmissiveRadiance += diffuseColor.rgb * wm_ * uGlow * 1.1;\n' : '') + 'diffuseColor.rgb *= 1.22;')
      .replace('#include <fog_fragment>', F_FOG);
  };
  mat.customProgramCacheKey = () => 'av-join' + (windows ? 1 : 0);
  return mat;
}

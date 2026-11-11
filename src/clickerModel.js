// Master Clicker model test: a Meshy-generated GLB, optimised offline, split into rigid parts at load time
// so the legs and crane can be animated without a skeleton.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

const MODEL_MIN_Y = -0.6205; // lowest point of the original Meshy model, used to map the rig description
const SCALE = 2.1;            // model is ~1.86 units long; in game the Master Clicker is ~3.9 units (~6.5 m)
// Rig description in the model's own coordinates (front = -x, up = +y, side = z).
const RIG = {
  hipY: -0.12, kneeY: -0.36, legZ: 0.26,
  front: { x: -0.33, hip: [-0.45, -0.12], knee: [-0.63, -0.36] },
  rear: { x: 0.12, hip: [0.28, -0.12], knee: [0.43, -0.36] },
  crane: { x: 0.15, y: 0.13, slope: 0, z: 0.24, pivot: [0.2, 0.2, 0.3], keepSide: 1 }, // Meshy mirrored the crane; the reference has one
};

function floatAttr(a, n) {
  const out = new Float32Array(a.count * n);
  for (let i = 0; i < a.count; i++) { out[i * n] = a.getX(i); out[i * n + 1] = a.getY(i); if (n > 2) out[i * n + 2] = a.getZ(i); }
  return new THREE.BufferAttribute(out, n);
}

// Which rigid part does a triangle (by centroid, model coordinates) belong to?
function classify(x, y, z) {
  const s = z > 0 ? 1 : 0, az = Math.abs(z), c = RIG.crane;
  // crane arm: the diagonal band rising toward the rear, outside the body's centre line
  if (x > c.x && y > c.y + c.slope * x && az > c.z) return (z > 0 ? 1 : -1) === c.keepSide ? 'crane' : null;
  if (y < RIG.hipY && az > RIG.legZ) {
    const fr = x < RIG.front.x ? 'f' : x > RIG.rear.x ? 'r' : null;
    if (fr) return (y < RIG.kneeY ? 'shin_' : 'thigh_') + fr + s;
  }
  return 'body';
}

export async function loadMasterClicker(url, mode = 'lit') {
  const loader = new GLTFLoader(); loader.setMeshoptDecoder(MeshoptDecoder);
  const gltf = await loader.loadAsync(url);
  let src = null; gltf.scene.updateMatrixWorld(true); gltf.scene.traverse(o => { if (o.isMesh && !src) src = o; });
  const g0 = src.geometry;
  // The baked file is already in game orientation (forward +z, feet at y=0); only scale it here.
  const pos = floatAttr(g0.attributes.position, 3).applyMatrix4(src.matrixWorld), nrm = floatAttr(g0.attributes.normal, 3), uv = floatAttr(g0.attributes.uv, 2);
  const idx = g0.index.array, buckets = {}, mx = i => -pos.getZ(i), my = i => pos.getY(i) + MODEL_MIN_Y, mz = i => pos.getX(i);
  for (let i = 0; i < idx.length; i += 3) {
    const a = idx[i], b = idx[i + 1], c = idx[i + 2];
    const k = classify((mx(a) + mx(b) + mx(c)) / 3, (my(a) + my(b) + my(c)) / 3, (mz(a) + mz(b) + mz(c)) / 3);
    if (k) (buckets[k] || (buckets[k] = [])).push(a, b, c);
  }
  pos.applyMatrix4(new THREE.Matrix4().makeScale(SCALE, SCALE, SCALE));
  const P = (x, y, z) => new THREE.Vector3(z, y - MODEL_MIN_Y, -x).multiplyScalar(SCALE);
  const geo = {};
  for (const k in buckets) {
    const g = new THREE.BufferGeometry(); g.setAttribute('position', pos); g.setAttribute('normal', nrm); g.setAttribute('uv', uv);
    g.setIndex(buckets[k]); g.computeBoundingSphere(); geo[k] = g;
  }
  const m0 = src.material; let material;
  // The normal map is baked in object space from the 4.4M-triangle original, so the low-poly shades like the dense model.
  if (mode === 'pbr') material = new THREE.MeshStandardMaterial({ map: m0.map, normalMap: m0.normalMap, metalness: 0.55, roughness: 0.5, envMapIntensity: 0.9 });
  else material = new THREE.MeshLambertMaterial({ map: m0.map, normalMap: m0.normalMap });
  material.normalMapType = THREE.ObjectSpaceNormalMap;
  if (material.map) material.map.anisotropy = 4;
  const pivots = { crane: P(RIG.crane.pivot[0], RIG.crane.pivot[1], RIG.crane.pivot[2] * RIG.crane.keepSide) };
  for (const fr of ['f', 'r']) for (const s of [0, 1]) {
    const r = fr === 'f' ? RIG.front : RIG.rear, z = (s ? 1 : -1) * 0.42;
    pivots['thigh_' + fr + s] = P(r.hip[0], r.hip[1], z); pivots['shin_' + fr + s] = P(r.knee[0], r.knee[1], z + (s ? 0.03 : -0.03));
  }
  const tris = idx.length / 3;
  return { geo, material, pivots, tris, instantiate };
}

// Build one animated instance: body > (crane, thigh > shin) with pivot groups at the joints.
function instantiate() {
  const T = this, root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  const part = (key, parent, parentPivot) => {
    const piv = new THREE.Group(), p = T.pivots[key] || new THREE.Vector3(); piv.position.copy(p); if (parentPivot) piv.position.sub(parentPivot);
    if (T.geo[key]) { const m = new THREE.Mesh(T.geo[key], T.material); m.position.copy(p).multiplyScalar(-1); m.castShadow = true; piv.add(m); }
    parent.add(piv); return piv;
  };
  part('body', body);
  const crane = part('crane', body), legs = [];
  for (const fr of ['f', 'r']) for (const s of [0, 1]) {
    const thigh = part('thigh_' + fr + s, body), shin = part('shin_' + fr + s, thigh, T.pivots['thigh_' + fr + s]);
    legs.push({ thigh, shin, phase: (fr === 'f') === (s === 1) ? 0 : Math.PI, front: fr === 'f' });
  }
  return { root, body, crane, legs };
}

// Per-frame pose. `walk` is the gait phase (advances with distance), `act` the work-cycle phase.
export function poseMasterClicker(inst, { walk, moving, act, acting, broken, carry, dt }) {
  const k = Math.min(1, dt * 10), lerp = (o, key, v) => { o[key] += (v - o[key]) * k; };
  for (const L of inst.legs) {
    let hip = 0, knee = 0, lift = 0;
    if (moving) { const s = Math.sin(walk + L.phase), c = Math.cos(walk + L.phase); hip = s * 0.2; lift = Math.max(0, c) * 0.16; knee = -Math.max(0, c) * 0.3 - s * 0.06; }
    lerp(L.thigh.rotation, 'x', -hip); lerp(L.shin.rotation, 'x', -knee * (L.front ? 1 : -1)); lerp(L.thigh.position, 'y', (L.thigh.userData.y0 ??= L.thigh.position.y) + lift);
  }
  let by = 0, bx = 0, bz = 0, cr = 0;
  if (broken) { by = -0.22; bx = 0.07; cr = 0.5; }
  else if (moving) { by = Math.abs(Math.sin(walk)) * 0.05; bz = Math.sin(walk) * 0.018; cr = carry ? -0.12 : 0.05; }
  else if (acting) { by = Math.sin(act) * 0.03; cr = 0.28 + Math.sin(act * 0.8) * 0.3; }
  lerp(inst.body.position, 'y', by); lerp(inst.body.rotation, 'x', bx); lerp(inst.body.rotation, 'z', bz);
  lerp(inst.crane.rotation, 'x', -cr);
}

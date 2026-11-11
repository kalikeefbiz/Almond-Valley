// Building model test: Meshy low-poly GLBs that replace the built-in shapes for selected building types.
// Each model is centred, set on the ground and scaled uniformly to fit its footprint, so construction
// (vertical grow-in), picking, overlays and upgrades keep working unchanged.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { B, CELL } from './data.js';

export const MODEL_TYPES = ['workshop', 'smokehouse', 'market', 'warehouse', 'fabrication'];
const FILL = 0.97; // share of the footprint the model may cover

let loader = null;
export function loadBuildingModel(type) {
  if (!loader) { loader = new GLTFLoader(); loader.setMeshoptDecoder(MeshoptDecoder); }
  return loader.loadAsync(import.meta.env.BASE_URL + `models/${type}.glb`).then(gltf => {
    let src = null; gltf.scene.updateMatrixWorld(true); gltf.scene.traverse(o => { if (o.isMesh && !src) src = o; });
    // Meshopt stores positions as normalised 16-bit integers; expand to floats before transforming or they clamp to ±1.
    const geo = new THREE.BufferGeometry(); geo.setIndex(src.geometry.index);
    for (const [name, n] of [['position', 3], ['normal', 3], ['uv', 2]]) { const a = src.geometry.attributes[name]; if (!a) continue; const out = new Float32Array(a.count * n); for (let i = 0; i < a.count; i++) for (let k = 0; k < n; k++) out[i * n + k] = a.getComponent(i, k); geo.setAttribute(name, new THREE.BufferAttribute(out, n)); }
    geo.applyMatrix4(src.matrixWorld);
    geo.computeBoundingBox(); const bb = geo.boundingBox, size = new THREE.Vector3(); bb.getSize(size);
    const def = B[type], s = Math.min(def.w * CELL * FILL / size.x, def.d * CELL * FILL / size.z);
    geo.translate(-(bb.min.x + bb.max.x) / 2, -bb.min.y, -(bb.min.z + bb.max.z) / 2); geo.scale(s, s, s);
    geo.computeBoundingBox(); geo.computeBoundingSphere();
    const m0 = src.material;
    if (m0.map) m0.map.anisotropy = 4;
    // Lambert to match the rest of the valley; a faint self-light from the colour map keeps them readable at night.
    const material = new THREE.MeshLambertMaterial({ map: m0.map, normalMap: m0.normalMap, emissive: 0x30241a, emissiveMap: m0.map, side: THREE.DoubleSide }); // Meshy leaves some open faces (roof edges, awnings)
    m0.metalnessMap?.dispose?.();
    return { geo, material, tris: geo.index ? geo.index.count / 3 : geo.attributes.position.count / 3 };
  });
}

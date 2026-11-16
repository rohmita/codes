// FBX writer regression: every preset is written as FBX 7.4 binary and parsed back with three.js FBXLoader.
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { writeFBX } from '../src/fbx.js';
import { buildObject } from '../src/objects.js';
import { PRESETS } from '../src/params.js';

let fails = 0;
for (const [name, P] of Object.entries(PRESETS)) {
  const m = buildObject(P);
  const parts = m.parts.map(p => ({ name: p.name, pos: Float64Array.from(p.mesh.pos), idx: Uint32Array.from(p.mesh.idx), triMat: Uint8Array.from(p.mesh.tag) }));
  const bin = writeFBX(parts, [{ name: 'Body', color: [0.4, 0.6, 0.5] }, { name: 'Interior', color: [0.9, 0.9, 0.85] }]);
  try {
    const g = new FBXLoader().parse(bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength), '');
    let tris = 0, meshes = 0; g.traverse(o => { if (o.isMesh) { meshes++; tris += o.geometry.attributes.position.count / 3; } });
    const want = parts.reduce((a, p) => a + p.idx.length / 3, 0);
    if (meshes !== parts.length || tris !== want) { fails++; console.log('FAIL', name, { meshes, parts: parts.length, tris, want }); }
  } catch (e) { fails++; console.log('EXC', name, e.message); }
}
console.log(`${Object.keys(PRESETS).length - fails}/${Object.keys(PRESETS).length} presets round-trip through FBX`);
process.exit(fails ? 1 : 0);

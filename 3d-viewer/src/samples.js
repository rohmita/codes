// Builds a handful of demo models in different formats entirely in the browser,
// so the gallery can be tried without having any 3D files at hand.
import * as THREE from 'three';
import { OBJExporter } from 'three/examples/jsm/exporters/OBJExporter.js';
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js';
import { PLYExporter } from 'three/examples/jsm/exporters/PLYExporter.js';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';

const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.45, metalness: 0.1, ...extra });

function checkerPng() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
    g.fillStyle = (x + y) % 2 ? '#f2b33d' : '#20406a';
    g.fillRect(x * 32, y * 32, 32, 32);
  }
  g.fillStyle = '#fff';
  g.font = 'bold 64px sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('3D', 128, 132);
  return new Promise((res) => c.toBlob(res, 'image/png'));
}

async function crate() {
  const geo = new THREE.BoxGeometry(2, 2, 2);
  const mesh = new THREE.Mesh(geo, new THREE.MeshPhongMaterial({ name: 'papan' }));
  mesh.name = 'Peti';
  let obj = new OBJExporter().parse(mesh);
  obj = 'mtllib peti-kayu.mtl\n' + obj.replace(/^o .*$/m, 'o Peti\nusemtl papan');
  const mtl = 'newmtl papan\nKd 1 1 1\nKa 0 0 0\nKs 0.2 0.2 0.2\nNs 30\nmap_Kd tekstur-papan.png\n';
  return [
    new File([obj], 'peti-kayu.obj'),
    new File([mtl], 'peti-kayu.mtl'),
    new File([await checkerPng()], 'tekstur-papan.png'),
  ];
}

function knot() {
  const mesh = new THREE.Mesh(new THREE.TorusKnotGeometry(1, 0.32, 220, 28, 2, 3));
  const data = new STLExporter().parse(mesh, { binary: true });
  return [new File([data], 'simpul-torus.stl')];
}

function rainbowSphere() {
  const geo = new THREE.IcosahedronGeometry(1.2, 14);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const col = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i), x = pos.getX(i), z = pos.getZ(i);
    const bump = 1 + 0.12 * Math.sin(5 * x) * Math.sin(5 * y) * Math.sin(5 * z);
    pos.setXYZ(i, x * bump, y * bump, z * bump);
    col.setHSL((Math.atan2(z, x) / (2 * Math.PI) + 1) % 1, 0.75, 0.55 + 0.15 * y / 1.2);
    colors.set([col.r, col.g, col.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true }));
  return new Promise((res) => new PLYExporter().parse(mesh, (data) => res([new File([data], 'bola-pelangi.ply')]), { binary: true }));
}

async function robot() {
  const g = new THREE.Group();
  g.name = 'Robot';
  const add = (name, geo, m, x, y, z) => {
    const mesh = new THREE.Mesh(geo, m);
    mesh.name = name;
    mesh.position.set(x, y, z);
    g.add(mesh);
    return mesh;
  };
  const body = mat('#e4572e', { name: 'cat-merah' });
  const steel = mat('#c9ced6', { name: 'baja', metalness: 0.9, roughness: 0.25 });
  const dark = mat('#2b2d42', { name: 'karet' });
  const glow = mat('#7fdbff', { name: 'lampu', emissive: '#2aa9e0', emissiveIntensity: 0.8 });
  add('Badan', new THREE.BoxGeometry(1.4, 1.6, 1), body, 0, 1.6, 0);
  add('Kepala', new THREE.BoxGeometry(1, 0.8, 0.9), steel, 0, 2.85, 0);
  add('Mata kiri', new THREE.SphereGeometry(0.12, 24, 16), glow, -0.22, 2.9, 0.46);
  add('Mata kanan', new THREE.SphereGeometry(0.12, 24, 16), glow, 0.22, 2.9, 0.46);
  add('Antena', new THREE.CylinderGeometry(0.03, 0.03, 0.5, 12), steel, 0, 3.5, 0);
  add('Ujung antena', new THREE.SphereGeometry(0.09, 16, 12), body, 0, 3.78, 0);
  add('Lengan kiri', new THREE.CylinderGeometry(0.16, 0.16, 1.3, 20), steel, -0.95, 1.6, 0);
  add('Lengan kanan', new THREE.CylinderGeometry(0.16, 0.16, 1.3, 20), steel, 0.95, 1.6, 0);
  add('Kaki kiri', new THREE.BoxGeometry(0.45, 0.8, 0.5), dark, -0.35, 0.4, 0);
  add('Kaki kanan', new THREE.BoxGeometry(0.45, 0.8, 0.5), dark, 0.35, 0.4, 0);
  const glb = await new GLTFExporter().parseAsync(g, { binary: true });
  return [new File([glb], 'robot-mainan.glb')];
}

function gear() {
  // A gear extruded from a 2D outline, written as OFF by hand.
  const shape = new THREE.Shape();
  const teeth = 14, r1 = 1, r2 = 1.22;
  for (let i = 0; i <= teeth * 4; i++) {
    const a = (i / (teeth * 4)) * Math.PI * 2;
    const r = (i % 4 < 2) ? r2 : r1;
    const x = Math.cos(a) * r, y = Math.sin(a) * r;
    i === 0 ? shape.moveTo(x, y) : shape.lineTo(x, y);
  }
  const hole = new THREE.Path();
  hole.absarc(0, 0, 0.35, 0, Math.PI * 2, true);
  shape.holes.push(hole);
  const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.35, bevelEnabled: false, curveSegments: 32 });
  geo.rotateX(-Math.PI / 2);
  const p = geo.attributes.position;
  const lines = ['OFF', `${p.count} ${p.count / 3} 0`];
  for (let i = 0; i < p.count; i++) lines.push(`${p.getX(i).toFixed(5)} ${p.getY(i).toFixed(5)} ${p.getZ(i).toFixed(5)}`);
  for (let i = 0; i < p.count; i += 3) lines.push(`3 ${i} ${i + 1} ${i + 2} 160 170 185`);
  return [new File([lines.join('\n')], 'roda-gigi.off')];
}

function vase() {
  const pts = [];
  for (let i = 0; i <= 40; i++) {
    const t = i / 40;
    pts.push(new THREE.Vector2(0.55 + 0.35 * Math.sin(t * Math.PI * 1.4 + 0.3) + 0.08 * Math.sin(t * 18), t * 2.6));
  }
  const mesh = new THREE.Mesh(new THREE.LatheGeometry(pts, 72), mat('#2a9d8f', { name: 'keramik' }));
  mesh.name = 'Vas';
  return new GLTFExporter().parseAsync(mesh, { binary: false }).then((json) =>
    [new File([JSON.stringify(json)], 'vas-keramik.gltf')]);
}

export async function buildSamples() {
  const parts = await Promise.all([robot(), crate(), knot(), rainbowSphere(), gear(), vase()]);
  return parts.flat();
}

/** Merging many small meshes into one per material, so they cost a few draws instead of hundreds. */

import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

/** One mesh per material: a whole house in a dozen draws instead of hundreds. */
export function mergeByMaterial(root: THREE.Object3D): THREE.Group {
  root.updateMatrixWorld(true);
  const parts = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const push = (m: THREE.Material, g: THREE.BufferGeometry) => {
    const list = parts.get(m) ?? [];
    list.push(g);
    parts.set(m, list);
  };
  root.traverse((o) => {
    if (!(o instanceof THREE.Mesh) || o instanceof THREE.InstancedMesh || !o.visible) return;
    let g = (o.geometry as THREE.BufferGeometry).clone().applyMatrix4(o.matrixWorld);
    if (g.index) g = g.toNonIndexed();
    for (const name of Object.keys(g.attributes)) if (!["position", "normal", "uv"].includes(name)) g.deleteAttribute(name);
    if (!g.attributes.normal) g.computeVertexNormals();
    if (!g.attributes.uv) g.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    const mats = o.material as THREE.Material | THREE.Material[];
    if (!Array.isArray(mats)) return push(mats, g);
    // A box with a material per face: split it by face.
    for (const grp of g.groups) {
      const sub = new THREE.BufferGeometry();
      for (const name of ["position", "normal", "uv"]) {
        const attr = g.getAttribute(name) as THREE.BufferAttribute;
        const size = attr.itemSize;
        sub.setAttribute(name, new THREE.Float32BufferAttribute((attr.array as Float32Array).slice(grp.start * size, (grp.start + grp.count) * size), size));
      }
      push(mats[grp.materialIndex ?? 0], sub);
    }
  });
  const out = new THREE.Group();
  for (const [m, list] of parts) {
    const merged = mergeGeometries(list.map((g) => {
      g.clearGroups();
      return g;
    }));
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, m);
    mesh.castShadow = mesh.receiveShadow = true;
    out.add(mesh);
  }
  return out;
}


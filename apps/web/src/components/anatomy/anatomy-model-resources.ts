import * as THREE from "three";

/**
 * Clone the material and every texture it owns. The GLTF loader caches its
 * scenes (and their textures) for reuse, so disposing the cache's resources on
 * unmount would break a later visit. Owning our own copies makes disposal safe.
 */
export function cloneOwnedMaterial(material: THREE.Material): THREE.Material {
  const cloned = material.clone();
  const record = cloned as unknown as Record<string, unknown>;

  for (const [key, value] of Object.entries(cloned)) {
    if (!(value instanceof THREE.Texture)) continue;

    const texture = value.clone();
    // Texture.clone() shares its Source. Give the copy its own Source so
    // disposing it cannot evict the cached model's GPU texture.
    texture.source = new THREE.TextureSource(value.source.data);
    texture.source.dataReady = value.source.dataReady;
    texture.needsUpdate = true;
    record[key] = texture;
  }

  return cloned;
}

/**
 * Clone a cached GLTF scene and take ownership of every GPU resource it uses.
 * Geometries and textures are shared by Object3D.clone(), so they are copied
 * here as well; otherwise disposing this model would break the cached scene.
 */
export function cloneAnatomyModel(scene: THREE.Object3D): THREE.Object3D {
  const clone = scene.clone(true);

  clone.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;

    object.castShadow = true;
    object.receiveShadow = true;
    object.geometry = object.geometry.clone();

    const materials = Array.isArray(object.material)
      ? object.material
      : [object.material];
    const clonedMaterials = materials.map((material) => {
      const cloned = cloneOwnedMaterial(material);
      if (cloned instanceof THREE.MeshStandardMaterial) {
        cloned.userData.baseEmissive = cloned.emissive.clone();
        cloned.userData.baseEmissiveIntensity = cloned.emissiveIntensity;
      }
      return cloned;
    });
    object.material = Array.isArray(object.material)
      ? clonedMaterials
      : clonedMaterials[0];
  });

  return clone;
}

/** Release the geometry, material, and texture copies owned by one model. */
export function disposeModel(model: THREE.Object3D): void {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();

  model.traverse((object) => {
    const mesh = object as THREE.Mesh;

    if (mesh.geometry instanceof THREE.BufferGeometry) {
      geometries.add(mesh.geometry);
    }
    if (!mesh.material) return;

    const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of list) {
      materials.add(material);
      for (const value of Object.values(material)) {
        if (value instanceof THREE.Texture) textures.add(value);
      }
    }
  });

  for (const texture of textures) texture.dispose();
  for (const material of materials) material.dispose();
  for (const geometry of geometries) geometry.dispose();
}

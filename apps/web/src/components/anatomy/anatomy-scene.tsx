"use client";

import { Component, Suspense, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import * as THREE from "three";
import { Canvas } from "@react-three/fiber";
import { Bounds, OrbitControls, useGLTF } from "@react-three/drei";

interface AnatomySceneProps {
  modelUrl: string;
  selectedMeshName: string | null;
  onSelectMesh: (meshName: string | null) => void;
  onModelReady?: () => void;
}

interface AnatomyModelProps extends AnatomySceneProps {
  onHoverMesh: (meshName: string | null) => void;
}

function AnatomyModel({
  modelUrl,
  selectedMeshName,
  onSelectMesh,
  onHoverMesh,
  onModelReady,
}: AnatomyModelProps) {
  const { scene } = useGLTF(modelUrl);

  // The loader caches scenes. Clone before changing materials so selecting one
  // mesh never leaks into another viewer or a later mount.
  const model = useMemo(() => {
    const clone = scene.clone(true);
    clone.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;

      object.castShadow = true;
      object.receiveShadow = true;

      const materials = Array.isArray(object.material)
        ? object.material
        : [object.material];
      const clonedMaterials = materials.map((material) => {
        const cloned = material.clone();
        if (cloned instanceof THREE.MeshStandardMaterial) {
          object.userData.baseEmissive = cloned.emissive.clone();
          object.userData.baseEmissiveIntensity = cloned.emissiveIntensity;
        }
        return cloned;
      });
      object.material = Array.isArray(object.material)
        ? clonedMaterials
        : clonedMaterials[0];
    });
    return clone;
  }, [scene]);

  useEffect(() => {
    onModelReady?.();
  }, [model, onModelReady]);

  useEffect(() => {
    model.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      const materials = Array.isArray(object.material)
        ? object.material
        : [object.material];

      for (const material of materials) {
        if (!(material instanceof THREE.MeshStandardMaterial)) continue;
        const baseEmissive = object.userData.baseEmissive as
          | THREE.Color
          | undefined;
        material.emissive.copy(baseEmissive ?? new THREE.Color("#000000"));
        material.emissiveIntensity =
          (object.userData.baseEmissiveIntensity as number | undefined) ?? 0;

        if (object.name === selectedMeshName) {
          material.emissive.set("#2dd4bf");
          material.emissiveIntensity = 0.55;
        }
      }
    });
  }, [model, selectedMeshName]);

  return (
    <primitive
      object={model}
      onClick={(event: { stopPropagation: () => void; object: THREE.Object3D }) => {
        event.stopPropagation();
        if (event.object.name) onSelectMesh(event.object.name);
      }}
      onPointerMove={(event: {
        stopPropagation: () => void;
        object: THREE.Object3D;
      }) => {
        event.stopPropagation();
        onHoverMesh(event.object.name || null);
      }}
      onPointerOut={() => onHoverMesh(null)}
    />
  );
}

class ModelErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.error("Anatomy model failed to load", error);
  }

  render() {
    if (this.state.failed) {
      return null;
    }

    return this.props.children;
  }
}

export function AnatomyScene({
  modelUrl,
  selectedMeshName,
  onSelectMesh,
  onModelReady,
}: AnatomySceneProps) {
  const [hoveredMesh, setHoveredMesh] = useState<string | null>(null);

  useEffect(() => {
    document.body.style.cursor = hoveredMesh ? "pointer" : "auto";
    return () => {
      document.body.style.cursor = "auto";
    };
  }, [hoveredMesh]);

  return (
    <Canvas
      frameloop="always"
      camera={{ position: [0, 0, 7], fov: 45, near: 0.01, far: 100 }}
      dpr={[1, 2]}
      gl={{ antialias: true, alpha: true }}
      onPointerMissed={() => onSelectMesh(null)}
      style={{ touchAction: "none" }}
    >
      <ambientLight intensity={1.1} />
      <directionalLight position={[4, 6, 8]} intensity={2.2} />
      <directionalLight position={[-4, -2, -6]} intensity={0.7} />
      <pointLight position={[0, 0, 5]} intensity={0.8} color="#2dd4bf" />

      <Suspense fallback={null}>
        <ModelErrorBoundary>
          <Bounds fit clip observe margin={1.25}>
            <AnatomyModel
              modelUrl={modelUrl}
              selectedMeshName={selectedMeshName}
              onSelectMesh={onSelectMesh}
              onHoverMesh={setHoveredMesh}
              onModelReady={onModelReady}
            />
          </Bounds>
        </ModelErrorBoundary>
      </Suspense>

      <OrbitControls
        makeDefault
        enablePan={false}
        enableDamping
        dampingFactor={0.08}
        minDistance={2.2}
        maxDistance={14}
      />
    </Canvas>
  );
}

"use client";

import { Component, Suspense, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import * as THREE from "three";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Bounds, OrbitControls, useGLTF } from "@react-three/drei";

interface AnatomySceneProps {
  modelUrl: string;
  selectedMeshName: string | null;
  hiddenMeshNames: string[];
  onSelectMesh: (meshName: string | null) => void;
  onModelReady?: () => void;
  onModelError?: (message: string) => void;
}

interface AnatomyModelProps extends AnatomySceneProps {
  onHoverMesh: (meshName: string | null) => void;
}

interface OrbitControlsLike {
  target: THREE.Vector3;
  update: () => void;
}

function AnatomyModel({
  modelUrl,
  selectedMeshName,
  hiddenMeshNames,
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
    const hidden = new Set(hiddenMeshNames);
    model.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      object.visible = !hidden.has(object.name);
    });
  }, [model, hiddenMeshNames]);

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
    <>
      <primitive
        object={model}
        onClick={(event: {
          stopPropagation: () => void;
          object: THREE.Object3D;
        }) => {
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
      <CameraFocus model={model} selectedMeshName={selectedMeshName} />
    </>
  );
}

/**
 * Ease the orbit target toward the selected structure (or the whole model when
 * nothing is selected). Keeping the current viewing direction avoids a jarring
 * camera jump while still bringing the selected mesh to the centre.
 */
function CameraFocus({
  model,
  selectedMeshName,
}: {
  model: THREE.Object3D;
  selectedMeshName: string | null;
}) {
  const camera = useThree((state) => state.camera);
  const controls = useThree(
    (state) => state.controls,
  ) as unknown as OrbitControlsLike | null;
  const animation = useRef<{
    fromTarget: THREE.Vector3;
    toTarget: THREE.Vector3;
    fromPosition: THREE.Vector3;
    toPosition: THREE.Vector3;
    progress: number;
  } | null>(null);
  const previousSelection = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    if (!controls) return;
    // Skip the initial fit so Bounds can frame the whole model uninterrupted.
    if (previousSelection.current === undefined) {
      previousSelection.current = selectedMeshName;
      return;
    }
    if (previousSelection.current === selectedMeshName) return;
    previousSelection.current = selectedMeshName;

    const target = selectedMeshName
      ? model.getObjectByName(selectedMeshName)
      : model;
    if (!target) return;

    const box = new THREE.Box3().setFromObject(target);
    if (box.isEmpty()) return;

    const center = box.getCenter(new THREE.Vector3());
    const radius = Math.max(box.getSize(new THREE.Vector3()).length() / 2, 0.03);
    const distance = THREE.MathUtils.clamp(radius * 3.1, 0.28, 12);
    const direction = camera.position
      .clone()
      .sub(controls.target)
      .normalize();

    // Do not start an animation while the model is still being framed by
    // Bounds; the first fitted view would otherwise be overridden.
    if (direction.lengthSq() === 0) return;

    animation.current = {
      fromTarget: controls.target.clone(),
      toTarget: center,
      fromPosition: camera.position.clone(),
      toPosition: center.clone().add(direction.multiplyScalar(distance)),
      progress: 0,
    };
  }, [selectedMeshName, model, controls, camera]);

  useFrame((_, delta) => {
    const current = animation.current;
    if (!current || !controls) return;

    current.progress = Math.min(1, current.progress + delta * 3.5);
    const eased = 1 - Math.pow(1 - current.progress, 3);

    controls.target.lerpVectors(
      current.fromTarget,
      current.toTarget,
      eased,
    );
    camera.position.lerpVectors(
      current.fromPosition,
      current.toPosition,
      eased,
    );
    controls.update();

    if (current.progress >= 1) animation.current = null;
  });

  return null;
}

class ModelErrorBoundary extends Component<
  { children: ReactNode; onError?: (message: string) => void },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.error("Anatomy model failed to load", error);
    this.props.onError?.(
      error instanceof Error ? error.message : "The 3D model could not load.",
    );
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
  hiddenMeshNames,
  onSelectMesh,
  onModelReady,
  onModelError,
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

      <ModelErrorBoundary onError={onModelError}>
        <Suspense fallback={null}>
          <Bounds fit clip observe margin={1.25}>
            <AnatomyModel
              modelUrl={modelUrl}
              selectedMeshName={selectedMeshName}
              hiddenMeshNames={hiddenMeshNames}
              onSelectMesh={onSelectMesh}
              onHoverMesh={setHoveredMesh}
              onModelReady={onModelReady}
            />
          </Bounds>
        </Suspense>
      </ModelErrorBoundary>

      <OrbitControls
        makeDefault
        enablePan={false}
        enableDamping
        dampingFactor={0.08}
        minDistance={0.2}
        maxDistance={14}
      />
    </Canvas>
  );
}

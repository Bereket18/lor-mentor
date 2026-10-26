"use client";

import { Component, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import * as THREE from "three";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Bounds, OrbitControls, useGLTF } from "@react-three/drei";
import {
  cloneAnatomyModel,
  disposeModel,
} from "@/components/anatomy/anatomy-model-resources";

interface AnatomySceneProps {
  modelUrl: string;
  selectedMeshName: string | null;
  selectedIsTextOnly?: boolean;
  hiddenMeshNames: string[];
  onSelectMesh: (meshName: string | null) => void;
  onModelReady?: () => void;
  onModelMeshesLoaded?: (meshNames: string[]) => void;
  onModelError?: (message: string) => void;
  onRendererUnavailable?: () => void;
  onRendererRestored?: () => void;
}

interface AnatomyModelProps extends AnatomySceneProps {
  onHoverMesh: (meshName: string | null) => void;
}

interface OrbitControlsLike {
  target: THREE.Vector3;
  update: () => void;
  dampingFactor: number;
}

const BASE_DAMPING_FACTOR = 0.08;

function applyTimeBasedDamping(
  controls: OrbitControlsLike,
  delta: number,
): void {
  const seconds = THREE.MathUtils.clamp(delta, 1 / 120, 0.1);
  controls.dampingFactor =
    1 - Math.pow(1 - BASE_DAMPING_FACTOR, seconds * 60);
}

/**
 * OrbitControls damps once per rendered frame, so on a slow device the tail
 * can keep requesting frames for tens of seconds after the user lets go. Scale
 * the per-frame factor by elapsed time to keep the settle time consistent.
 */
function ControlsDamping() {
  const controls = useThree(
    (state) => state.controls,
  ) as unknown as OrbitControlsLike | null;

  useFrame((_, delta) => {
    if (!controls) return;
    applyTimeBasedDamping(controls, delta);
  }, -2);

  return null;
}

/**
 * A lost WebGL context (driver reset, GPU process crash, tab suspended) is
 * recoverable. Preventing the default lets the browser restore it; the parent
 * shows the existing "3D view unavailable" overlay in the meantime and clears
 * it when the context comes back.
 */
function ContextLossHandler({
  onLost,
  onRestored,
}: {
  onLost?: () => void;
  onRestored?: () => void;
}) {
  const gl = useThree((state) => state.gl);
  const invalidate = useThree((state) => state.invalidate);

  useEffect(() => {
    const canvas = gl.domElement;

    const handleLost = (event: Event) => {
      event.preventDefault();
      onLost?.();
    };
    const handleRestored = () => {
      onRestored?.();
      invalidate();
    };

    canvas.addEventListener("webglcontextlost", handleLost);
    canvas.addEventListener("webglcontextrestored", handleRestored);

    return () => {
      canvas.removeEventListener("webglcontextlost", handleLost);
      canvas.removeEventListener("webglcontextrestored", handleRestored);
    };
  }, [gl, onLost, onRestored, invalidate]);

  return null;
}

interface HighlightTransition {
  material: THREE.MeshStandardMaterial;
  from: number;
  to: number;
  baseEmissive: THREE.Color;
  baseIntensity: number;
  restoreOnFinish: boolean;
}

/**
 * three.js materials are imperative objects. Mutating them from a helper (not
 * from the component body) keeps React's immutability lint rule happy while
 * still letting the render loop animate the highlight.
 */
function advanceHighlight(
  items: HighlightTransition[],
  eased: number,
): void {
  for (const item of items) {
    item.material.emissiveIntensity = THREE.MathUtils.lerp(
      item.from,
      item.to,
      eased,
    );
  }
}

function settleHighlight(items: HighlightTransition[]): void {
  for (const item of items) {
    if (item.restoreOnFinish) {
      item.material.emissive.copy(item.baseEmissive);
      item.material.emissiveIntensity = item.baseIntensity;
    } else {
      item.material.emissiveIntensity = item.to;
    }
  }
}

/** Every standard material attached to a mesh below `object`. */
function collectStandardMaterials(
  object: THREE.Object3D | null | undefined,
): THREE.MeshStandardMaterial[] {
  if (!object) return [];

  const materials = new Set<THREE.MeshStandardMaterial>();
  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    const list = Array.isArray(child.material)
      ? child.material
      : [child.material];
    for (const material of list) {
      if (material instanceof THREE.MeshStandardMaterial) {
        materials.add(material);
      }
    }
  });
  return [...materials];
}

const pendingDisposals = new WeakMap<
  THREE.Object3D,
  ReturnType<typeof setTimeout>
>();

function cancelModelDisposal(model: THREE.Object3D): void {
  const pending = pendingDisposals.get(model);
  if (!pending) return;
  clearTimeout(pending);
  pendingDisposals.delete(model);
}

function scheduleModelDisposal(model: THREE.Object3D): void {
  cancelModelDisposal(model);
  const timer = setTimeout(() => {
    pendingDisposals.delete(model);
    disposeModel(model);
  }, 0);
  pendingDisposals.set(model, timer);
}

function AnatomyModel({
  modelUrl,
  selectedMeshName,
  selectedIsTextOnly = false,
  hiddenMeshNames,
  onSelectMesh,
  onHoverMesh,
  onModelReady,
  onModelMeshesLoaded,
}: AnatomyModelProps) {
  const invalidate = useThree((state) => state.invalidate);
  const { scene } = useGLTF(modelUrl);

  // The loader caches scenes. Clone before changing materials so selecting one
  // mesh never leaks into another viewer or a later mount.
  const model = useMemo(() => cloneAnatomyModel(scene), [scene]);

  // Dispose only when the model is really gone. StrictMode unmounts and
  // remounts effects in development, so the disposal is deferred one tick and
  // cancelled by the remount.
  useEffect(() => {
    cancelModelDisposal(model);
    return () => scheduleModelDisposal(model);
  }, [model]);

  useEffect(() => {
    onModelReady?.();
    invalidate();
  }, [model, onModelReady, invalidate]);

  useEffect(() => {
    const meshNames = new Set<string>();
    model.traverse((object) => {
      if (object.name) meshNames.add(object.name);
    });
    onModelMeshesLoaded?.([...meshNames]);
  }, [model, onModelMeshesLoaded]);

  useEffect(() => {
    const hidden = new Set(hiddenMeshNames);
    model.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      object.visible = !hidden.has(object.name);
    });
    invalidate();
  }, [model, hiddenMeshNames, invalidate]);

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
      <CameraFocus
        model={model}
        selectedMeshName={selectedMeshName}
        selectedIsTextOnly={selectedIsTextOnly}
      />
      <SelectionHighlight model={model} selectedMeshName={selectedMeshName} />
    </>
  );
}

/**
 * Ease the orbit target toward the selected structure (or the whole model when
 * nothing is selected). Keeping the current viewing direction avoids a jarring
 * camera jump while still bringing the selected mesh to the centre.
 *
 * A text-only structure has no mesh, so selecting it must not move the camera.
 * That is different from clearing the selection, which returns to the whole
 * model.
 */
function CameraFocus({
  model,
  selectedMeshName,
  selectedIsTextOnly,
}: {
  model: THREE.Object3D;
  selectedMeshName: string | null;
  selectedIsTextOnly: boolean;
}) {
  const camera = useThree((state) => state.camera);
  const invalidate = useThree((state) => state.invalidate);
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
  const previousSelection = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!controls) return;

    const selectionKey = selectedIsTextOnly
      ? "text-only"
      : selectedMeshName
        ? `mesh:${selectedMeshName}`
        : "none";

    // Skip the initial fit so Bounds can frame the whole model uninterrupted.
    if (previousSelection.current === undefined) {
      previousSelection.current = selectionKey;
      return;
    }
    if (previousSelection.current === selectionKey) return;
    previousSelection.current = selectionKey;

    // A text-only structure has no mesh to frame. Cancel any in-flight focus
    // and leave the camera exactly where the learner left it.
    if (selectedIsTextOnly) {
      animation.current = null;
      return;
    }

    // Stop an in-flight animation before starting a new one. If the new target
    // is missing from the GLB, the camera should stay put rather than finish
    // the previous move.
    animation.current = null;

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
    invalidate();
  }, [selectedMeshName, selectedIsTextOnly, model, controls, camera, invalidate]);

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

    if (current.progress >= 1) {
      animation.current = null;
    } else {
      invalidate();
    }
  });

  return null;
}

/**
 * Fade the teal emissive highlight in/out without touching every mesh on every
 * frame. Only the materials belonging to the outgoing and incoming selection
 * are animated, and the loop stops as soon as the fade settles.
 */
function SelectionHighlight({
  model,
  selectedMeshName,
}: {
  model: THREE.Object3D;
  selectedMeshName: string | null;
}) {
  const invalidate = useThree((state) => state.invalidate);
  const transition = useRef<{
    items: HighlightTransition[];
    progress: number;
  } | null>(null);
  const previousMaterials = useRef<THREE.MeshStandardMaterial[]>([]);

  useEffect(() => {
    previousMaterials.current = [];
    transition.current = null;
  }, [model]);

  useEffect(() => {
    const target = selectedMeshName
      ? model.getObjectByName(selectedMeshName)
      : null;
    const nextMaterials = collectStandardMaterials(target);
    const nextSet = new Set(nextMaterials);
    const items: HighlightTransition[] = [];

    for (const material of previousMaterials.current) {
      if (nextSet.has(material)) continue;
      items.push({
        material,
        from: material.emissiveIntensity,
        to: 0,
        baseEmissive:
          (material.userData.baseEmissive as THREE.Color | undefined)?.clone() ??
          new THREE.Color("#000000"),
        baseIntensity:
          (material.userData.baseEmissiveIntensity as number | undefined) ?? 0,
        restoreOnFinish: true,
      });
    }

    for (const material of nextMaterials) {
      material.emissive.set("#2dd4bf");
      items.push({
        material,
        from: material.emissiveIntensity,
        to: 0.55,
        baseEmissive:
          (material.userData.baseEmissive as THREE.Color | undefined)?.clone() ??
          new THREE.Color("#000000"),
        baseIntensity:
          (material.userData.baseEmissiveIntensity as number | undefined) ?? 0,
        restoreOnFinish: false,
      });
    }

    previousMaterials.current = nextMaterials;

    if (items.length === 0) {
      transition.current = null;
      return;
    }

    transition.current = { items, progress: 0 };
    invalidate();
  }, [model, selectedMeshName, invalidate]);

  useFrame((_, delta) => {
    const current = transition.current;
    if (!current) return;

    current.progress = Math.min(1, current.progress + delta / 0.18);
    const eased = 1 - Math.pow(1 - current.progress, 3);

    advanceHighlight(current.items, eased);

    if (current.progress >= 1) {
      settleHighlight(current.items);
      transition.current = null;
    } else {
      invalidate();
    }
  });

  return null;
}

/**
 * R3F resizes the canvas itself, but an explicit invalidation guarantees a
 * demand-mode render after the container (for example the mobile viewport)
 * changes size.
 */
function ResizeInvalidator() {
  const size = useThree((state) => state.size);
  const invalidate = useThree((state) => state.invalidate);

  useEffect(() => {
    invalidate();
  }, [size.width, size.height, invalidate]);

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

class SceneErrorBoundary extends Component<
  { children: ReactNode; onError?: () => void },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.error("Anatomy renderer failed to start", error);
    this.props.onError?.();
  }

  render() {
    if (this.state.failed) {
      return null;
    }

    return this.props.children;
  }
}

/**
 * The Canvas creates its WebGL renderer during mount. Checking first keeps a
 * browser with WebGL disabled from throwing an uncaught error and taking the
 * whole page down with it.
 */
function canCreateWebGLContext() {
  try {
    const canvas = document.createElement("canvas");
    const context =
      canvas.getContext("webgl2") ?? canvas.getContext("webgl");
    if (!context) return false;

    context.getExtension("WEBGL_lose_context")?.loseContext();
    return true;
  } catch {
    return false;
  }
}

export function AnatomyScene({
  modelUrl,
  selectedMeshName,
  selectedIsTextOnly = false,
  hiddenMeshNames,
  onSelectMesh,
  onModelReady,
  onModelMeshesLoaded,
  onModelError,
  onRendererUnavailable,
  onRendererRestored,
}: AnatomySceneProps) {
  // The scene is client-only, so the probe can run during the first render.
  const [webglSupported] = useState<boolean | null>(() =>
    typeof document === "undefined" ? null : canCreateWebGLContext(),
  );
  const hoveredMesh = useRef<string | null>(null);

  const handleHoverMesh = useCallback((meshName: string | null) => {
    if (hoveredMesh.current === meshName) return;
    hoveredMesh.current = meshName;
    document.body.style.cursor = meshName ? "pointer" : "auto";
  }, []);

  useEffect(() => {
    if (webglSupported === false) onRendererUnavailable?.();
  }, [webglSupported, onRendererUnavailable]);

  useEffect(() => {
    return () => {
      document.body.style.cursor = "auto";
    };
  }, []);

  // Wait for the capability check so the Canvas is never mounted in a browser
  // that cannot create a WebGL context.
  if (webglSupported !== true) return null;

  return (
    <SceneErrorBoundary onError={onRendererUnavailable}>
      <Canvas
        frameloop="demand"
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

        <ResizeInvalidator />
        <ControlsDamping />
        <ContextLossHandler
          onLost={onRendererUnavailable}
          onRestored={onRendererRestored}
        />

        <ModelErrorBoundary onError={onModelError}>
          <Suspense fallback={null}>
            <Bounds fit clip observe margin={1.25}>
              <AnatomyModel
                modelUrl={modelUrl}
                selectedMeshName={selectedMeshName}
                selectedIsTextOnly={selectedIsTextOnly}
                hiddenMeshNames={hiddenMeshNames}
                onSelectMesh={onSelectMesh}
                onHoverMesh={handleHoverMesh}
                onModelReady={onModelReady}
                onModelMeshesLoaded={onModelMeshesLoaded}
              />
            </Bounds>
          </Suspense>
        </ModelErrorBoundary>

        <OrbitControls
          makeDefault
          enablePan={false}
          enableDamping
          dampingFactor={BASE_DAMPING_FACTOR}
          minDistance={0.2}
          maxDistance={14}
        />
      </Canvas>
    </SceneErrorBoundary>
  );
}

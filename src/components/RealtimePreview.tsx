import { Canvas, useFrame, useThree } from '@react-three/fiber';
import type { ThreeEvent } from '@react-three/fiber';
import { MeshReflectorMaterial, useGLTF, useTexture } from '@react-three/drei';
import type { MeshReflectorMaterial as ReflectorMaterial } from '@react-three/drei/materials/MeshReflectorMaterial';
import { Bloom, EffectComposer, Noise, SMAA } from '@react-three/postprocessing';
import { BlendFunction, Pass } from 'postprocessing';
import { ArrowLeft, ArrowUpRight, Eye, EyeOff, RotateCcw } from 'lucide-react';
import { Component, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { MutableRefObject, ReactNode } from 'react';
import {
  AdditiveBlending, AgXToneMapping, Box3, BufferAttribute, BufferGeometry, Color, DoubleSide,
  InstancedBufferAttribute, InstancedMesh, Matrix4, MathUtils, Mesh,
  MeshStandardMaterial, PerspectiveCamera, Quaternion, ShaderMaterial,
  SRGBColorSpace, Vector3,
} from 'three';
import type { DirectionalLight, Texture } from 'three';
import { RectAreaLightUniformsLib } from 'three/examples/jsm/lights/RectAreaLightUniformsLib.js';
import { portfolio, stages } from '../config/portfolio';
import type { PortfolioProject, Stage } from '../config/portfolio';
import FinalPortfolio from './FinalPortfolio';
import { createSkyGlowTexture } from '../utils/skyGlowTexture';
import { createPaperTexture, paperLinkAt } from '../utils/paperTexture';
import { assetUrl } from '../utils/assetUrl';
import type { PaperLink } from '../utils/paperTexture';
import RealtimeFog, { createAtmosphere } from './RealtimeFog';
import type { AtmosphereData } from './RealtimeFog';
import RealtimeGrade from './RealtimeGrade';
import CinematicFocus from './CinematicFocus';
import { createLightingTexture, createPaperMaterial } from './realtimePaperMaterial';
import type { LightingTexture } from './realtimePaperMaterial';
import { PAPER_SWAY, paperSwayParameters } from './realtimePaperMotion';
import { configureFloorMaterial } from './realtimeFloorMaterial';
import { createRenderSchedule, FrameSchedule, StaticSceneCache } from './realtimeRenderSchedule';
import type { RenderSchedule } from './realtimeRenderSchedule';
import { applyNavigation, cameraProjection, createResourceCache, requestNavigation, startBoundedLoad } from './realtimeJourney';
import type { NavigationRequest } from './realtimeJourney';
import './realtime-preview.css';

RectAreaLightUniformsLib.init();
class FogLensBoundary extends Pass {
  // Resolve world-space fog before lens effects read their input texture.
  // Merging them in one EffectPass makes DOF sample the un-fogged scene.
  constructor() { super('FogLensBoundary'); this.needsSwap = false; }
  render() {}
}
const chapters = stages;
type Chapter = Stage;
const chapterTitle = (entry: Chapter) => entry === 'intro' ? '纸上的起点' : entry === 'screen' ? '完整作品集' :
  portfolio.projects.find(item => item.id === entry)?.category ?? entry;
type Quality = 'cinema' | 'balanced';
type GeometryData = { positions: number[]; normals: number[]; uvs: number[]; indices: number[] };
type CameraSample = { frame: number; position: number[]; quaternion: number[]; landscapeLens: number; portraitLens: number };
type SceneData = {
  instanceCount: number; instanceStride: number; assetVersion: string; sourceSha256: string;
  groups: { name: string; offset: number; count: number; prototype: { ground: boolean; texture: string; levels: GeometryData[] } }[];
  stops: Record<Chapter, number>;
  camera: { sensorWidth: number; frames: CameraSample[] };
};
type LightingData = { sourceSha256: string; bakedPapers: number; grid: [number, number] };
type HeroLightingData = { sourceSha256: string; names: string[]; frames: number[]; grid: [number, number]; weights: [number, number, number][] };
type SceneBundle = { data: SceneData; binary: ArrayBuffer; lighting: LightingData; lightBinary: ArrayBuffer;
  atmosphere: AtmosphereData; volumeBinary: ArrayBuffer; heroLighting: HeroLightingData; heroBinary: ArrayBuffer };
type PreviewStats = { ready: boolean; frame: number; fps: number; renderFrames: number; cachedFrames: number; presentedFrames: number; triangles: number; drawCalls: number; instances: number; moving: boolean; quality: Quality; paperSwayTime: number; paperSwayStrength: number };
declare global { interface Window { __PAPER_3D?: PreviewStats } }

const params = new URLSearchParams(window.location.search);
const sceneOnly = params.get('view') === 'scene';
const still = params.get('still') === '1';
// A/B-only route for visual regression; production always uses the refined look.
const tunedPostFx = params.get('postfx') !== '0';
const requested = params.get('chapter') as Chapter;
const textureUrls = Array.from({ length: 7 }, (_, i) => assetUrl(`/assets/realtime/cotton-print-${i + 1}.png`));
const monitorUrl = assetUrl(portfolio.monitorImage);
const resourceCache = createResourceCache();
let preloadedVersion: string | undefined;
function loadBundle(signal: AbortSignal, onProgress: (completed: number) => void) {
  let completed = 0;
  async function resource<T>(url: string, decode: (response: Response) => Promise<T>) {
    const value = await resourceCache.load(url, async () => {
      const response = await fetch(assetUrl(url), { signal });
      return decode(response);
    });
    if (!signal.aborted) onProgress(++completed);
    return value;
  }
  return Promise.all([
    resource('/assets/realtime/scene.json', async response => {
      if (!response.ok) throw new Error('The 3D scene could not be loaded.');
      return response.json() as Promise<SceneData>;
    }).then(data => {
      if (signal.aborted) throw new Error('Scene loading cancelled.');
      preloadedVersion = data.assetVersion;
      // Start the GLB and PNG decoders while the light fields are downloading.
      // Drei's cache is shared with the matching useGLTF/useTexture calls.
      useGLTF.preload(assetUrl(`/assets/realtime/room.glb?v=${data.assetVersion}`));
      useTexture.preload(textureUrls);
      useTexture.preload(monitorUrl);
      useTexture.preload(assetUrl(`/assets/realtime/source-grade.png?v=${data.assetVersion}`));
      return data;
    }),
    resource('/assets/realtime/papers.bin', async response => {
      if (!response.ok) throw new Error('The paper geometry could not be loaded.');
      return response.arrayBuffer();
    }),
    resource('/assets/realtime/lighting.json', async response => {
      if (!response.ok) throw new Error('The scene lighting could not be loaded.');
      return response.json() as Promise<LightingData>;
    }),
    resource('/assets/realtime/lighting.bin', async response => {
      if (!response.ok) throw new Error('The surface lighting could not be loaded.');
      return response.arrayBuffer();
    }),
    resource('/assets/realtime/atmosphere.json', async response => {
      if (!response.ok) throw new Error('The atmosphere could not be loaded.');
      return response.json() as Promise<AtmosphereData>;
    }),
    resource('/assets/realtime/atmosphere.bin', async response => {
      if (!response.ok) throw new Error('The atmosphere lighting could not be loaded.');
      return response.arrayBuffer();
    }),
    resource('/assets/realtime/hero-lighting.json', async response => {
      if (!response.ok) throw new Error('The paper lighting could not be loaded.');
      return response.json() as Promise<HeroLightingData>;
    }),
    resource('/assets/realtime/hero-lighting.bin', async response => {
      if (!response.ok) throw new Error('The paper illumination could not be loaded.');
      return response.arrayBuffer();
    }),
  ]).then(([data, binary, lighting, lightBinary, atmosphere, volumeBinary, heroLighting, heroBinary]) => {
    if (data.instanceCount !== 10436 || data.instanceStride !== 23 || binary.byteLength !== data.instanceCount * 23 * 4) {
      throw new Error('The 3D scene is incomplete.');
    }
    if (lighting.sourceSha256 !== data.sourceSha256 || lighting.bakedPapers !== data.instanceCount ||
        lightBinary.byteLength !== data.instanceCount * 2 * lighting.grid[0] * lighting.grid[1] * 3 * 2) {
      throw new Error('The surface lighting belongs to another scene.');
    }
    if (atmosphere.sourceSha256 !== data.sourceSha256 || volumeBinary.byteLength !== atmosphere.grid.reduce((a, b) => a * b, 1) * 32) {
      throw new Error('The atmosphere belongs to another scene.');
    }
    if (heroLighting.sourceSha256 !== data.sourceSha256 || heroBinary.byteLength !==
        heroLighting.frames.length * heroLighting.names.length * 2 * heroLighting.grid[0] * heroLighting.grid[1] * 6 ||
        heroLighting.weights?.length !== data.camera.frames.length) {
      throw new Error('The paper lighting belongs to another scene.');
    }
    if (chapters.some(chapter => !data.camera.frames.some(sample => sample.frame === data.stops[chapter]))) {
      throw new Error('The camera journey is incomplete.');
    }
    return { data, binary, lighting, lightBinary, atmosphere, volumeBinary, heroLighting, heroBinary };
  });
}

function createGeometry(data: GeometryData) {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(data.positions), 3));
  geometry.setAttribute('normal', new BufferAttribute(new Float32Array(data.normals), 3));
  geometry.setAttribute('uv', new BufferAttribute(new Float32Array(data.uvs), 2));
  geometry.setIndex(data.indices);
  return geometry;
}

function PaperInstances({ data, binary, textures, lighting, grid, schedule }: {
  data: SceneData; binary: ArrayBuffer; textures: Texture[]; lighting: LightingTexture; grid: [number, number];
  schedule: RenderSchedule;
}) {
  const collection = useMemo(() => {
    const materials: ShaderMaterial[] = [];
    const swayMaterials: ShaderMaterial[] = [];
    const meshes: InstancedMesh[] = [];
    const matrix = new Matrix4();
    const cameraPoints = data.camera.frames.filter((_, i) => i % 12 === 0).map(f => f.position);
    for (const group of data.groups) {
      const number = Number(group.prototype.texture.match(/(\d+)/)![1]) - 1;
      const material = createPaperMaterial(textures[number], lighting, grid, true, .42);
      materials.push(material);
      if (!group.prototype.ground) swayMaterials.push(material);
      const records = new Float32Array(binary, group.offset, group.count * data.instanceStride);
      const sets: number[][] = [[], [], []];
      for (let i = 0; i < group.count; i++) {
        const start = i * data.instanceStride;
        const x = records[start + 12], y = records[start + 13], z = records[start + 14];
        let nearestSquared = Infinity;
        for (const p of cameraPoints) {
          const dx = x - p[0], dy = y - p[1], dz = z - p[2];
          nearestSquared = Math.min(nearestSquared, dx * dx + dy * dy + dz * dz);
        }
        const level = nearestSquared < 2.7 * 2.7 ? 2 : nearestSquared < 36 ? 1 : 0;
        sets[level].push(i);
      }
      for (let level = 0; level < 3; level++) {
        const indices = sets[level];
        if (!indices.length) continue;
        const geometry = createGeometry(group.prototype.levels[level]);
        const offsets = new Float32Array(indices.length);
        const sway = new Float32Array(indices.length * 3);
        const mesh = new InstancedMesh(geometry, material, indices.length);
        indices.forEach((record, index) => {
          const start = record * data.instanceStride;
          matrix.fromArray(records, start);
          mesh.setMatrixAt(index, matrix);
          const originalRecord = group.offset / (data.instanceStride * 4) + record;
          offsets[index] = originalRecord * grid[0] * grid[1] * 2;
          sway.set(paperSwayParameters(originalRecord, group.prototype.ground), index * 3);
        });
        geometry.setAttribute('aLightingOffset', new InstancedBufferAttribute(offsets, 1));
        geometry.setAttribute('aPaperSway', new InstancedBufferAttribute(sway, 3));
        mesh.name = `${group.name} / detail ${level}`;
        mesh.instanceMatrix.needsUpdate = true;
        mesh.computeBoundingSphere();
        // CPU frustum culling must include the small displacement done on the GPU.
        if (!group.prototype.ground && mesh.boundingSphere) mesh.boundingSphere.radius += PAPER_SWAY.boundsPadding;
        meshes.push(mesh);
      }
    }
    return { meshes, materials, swayMaterials, users: 0 };
  }, [binary, data, textures, lighting, grid]);
  useEffect(() => {
    collection.users++;
    return () => {
      collection.users--;
      queueMicrotask(() => {
        if (collection.users) return;
        collection.meshes.forEach(mesh => { mesh.geometry.dispose(); mesh.dispose(); });
        collection.materials.forEach(material => material.dispose());
      });
    };
  }, [collection]);
  useFrame(() => {
    for (const material of collection.swayMaterials) {
      material.uniforms.uSwayTime.value = schedule.paperMotion.time;
      material.uniforms.uSwayStrength.value = schedule.paperMotion.strength;
    }
  }, -1);
  return <group>{collection.meshes.map(mesh => <primitive key={mesh.name} object={mesh} />)}</group>;
}

function ReflectiveFloor({ height, screen }: { height: number; screen: Vector3 }) {
  const floor = useRef<ReflectorMaterial>(null);
  useEffect(() => {
    if (floor.current) configureFloorMaterial(floor.current, screen, true);
  }, [screen]);
  return <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, height + .0001, 0]}>
    <planeGeometry args={[36, 42]} />
    <MeshReflectorMaterial ref={floor} resolution={1024} blur={[28, 44]} mixBlur={2} mixStrength={.74}
      mirror={0} roughness={.20} metalness={0} color="#070d0f" depthScale={.16}
      minDepthThreshold={.7} maxDepthThreshold={1.4} />
  </mesh>;
}

function LiteFloor({ height, screen }: { height: number; screen: Vector3 }) {
  const floor = useRef<MeshStandardMaterial>(null);
  useEffect(() => {
    if (floor.current) configureFloorMaterial(floor.current, screen, false);
  }, [screen]);
  return <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, height + .0001, 0]}>
    <planeGeometry args={[36, 42]} />
    <meshStandardMaterial ref={floor} color="#070d0f" roughness={.12} metalness={0} />
  </mesh>;
}

function Room({ quality, version, lighting, metadata, frame, chapter, linksEnabled, onOpenLink, onOpenScreen }: { quality: Quality; version: string;
  lighting: LightingTexture; metadata: HeroLightingData; frame: MutableRefObject<number>; chapter: Chapter;
  linksEnabled: boolean; onOpenLink: (url: string) => void; onOpenScreen: () => void }) {
  const gltf = useGLTF(assetUrl(`/assets/realtime/room.glb?v=${version}`));
  const monitor = useTexture(monitorUrl);
  const { gl } = useThree();
  monitor.colorSpace = SRGBColorSpace;
  monitor.flipY = false;
  monitor.anisotropy = Math.min(8, gl.capabilities.getMaxAnisotropy());
  const room = useMemo(() => {
    const scene = gltf.scene.clone(true);
    let floorHeight = -.08;
    const screen = new Vector3(0, 1.3, 0);
    const heroMaterials: ShaderMaterial[] = [];
    const ownedGeometries: BufferGeometry[] = [];
    const ownedMaterials: (MeshStandardMaterial | ShaderMaterial)[] = [];
    const ownedTextures: Texture[] = [];
    scene.traverse(object => {
      if (!(object as Mesh).isMesh) return;
      const mesh = object as Mesh;
      const name = mesh.name.replace(/_/g, ' ');
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      if (name === 'Polished concrete floor') {
        floorHeight = new Box3().setFromObject(mesh).max.y;
        mesh.visible = false; return;
      }
      const originals = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      const materials = originals.map(original => {
        const material = original.clone() as MeshStandardMaterial;
        material.side = DoubleSide;
        if (name.includes('hero surface')) {
          const index = metadata.names.findIndex(entry => entry === name);
          if (index < 0 || !material.map) throw new Error('The printed paper is incomplete.');
          const geometry = mesh.geometry.clone();
          const count = geometry.getAttribute('position').count;
          const offset = new Float32Array(count).fill(index * metadata.grid[0] * metadata.grid[1] * 2);
          const sides = new Float32Array(count);
          const normals = geometry.getAttribute('normal');
          for (let i = 0; i < count; i++) sides[i] = normals.getY(i) > 0 ? 0 : 1;
          geometry.setAttribute('aLightingOffset', new BufferAttribute(offset, 1));
          geometry.setAttribute('aLightingSide', new BufferAttribute(sides, 1));
          mesh.geometry = geometry; ownedGeometries.push(geometry);
          const project: PortfolioProject | undefined = portfolio.projects[index];
          const print = project?.editablePrint ? createPaperTexture(project) : material.map;
          if (print !== material.map) ownedTextures.push(print);
          const emission = project?.editablePrint ? createPaperTexture(project, true) : undefined;
          if (emission) ownedTextures.push(emission);
          mesh.userData.paperId = project?.id;
          mesh.userData.paperLinks = print.userData.paperLinks ?? [];
          const paper = createPaperMaterial(print, lighting, metadata.grid, false, .38, true, emission);
          heroMaterials.push(paper); ownedMaterials.push(paper); material.dispose();
          return paper;
        }
        if (name.includes('Monitor warm display')) {
          new Box3().setFromObject(mesh).getCenter(screen);
          material.map = monitor;
          // V4's display is an emission surface. It does not receive the
          // skylight's glossy highlight, which would obscure the profile.
          material.color.setRGB(0, 0, 0);
          material.roughness = 1;
          material.metalness = 0;
          material.onBeforeCompile = shader => {
            shader.fragmentShader = shader.fragmentShader.replace(
              'vec3 totalSpecular = reflectedLight.directSpecular + reflectedLight.indirectSpecular;',
              'vec3 totalSpecular = vec3(0.0);');
          };
          material.customProgramCacheKey = () => 'v4-emission-display';
          material.emissive = new Color('#fff4df');
          material.emissiveMap = monitor;
          material.emissiveIntensity = 2.5;
        } else if (!name.includes('charcoal hall')) {
          material.roughness = Math.max(material.roughness, .52);
          // The V4 sky lights exclude furniture. Reduce the realtime rig's
          // direct contribution on the desk while retaining screen bounce.
          material.onBeforeCompile = shader => {
            shader.fragmentShader = shader.fragmentShader.replace(
              'vec3 totalDiffuse = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse;',
              'vec3 totalDiffuse = .32*reflectedLight.directDiffuse + .8*reflectedLight.indirectDiffuse;');
          };
          material.customProgramCacheKey = () => 'v4-furniture-light-link-compensation';
        }
        ownedMaterials.push(material);
        return material;
      });
      mesh.material = Array.isArray(mesh.material) ? materials : materials[0];
    });
    return { scene, floorHeight, screen, heroMaterials, ownedMaterials, ownedGeometries, ownedTextures, users: 0 };
  }, [gltf.scene, lighting, metadata, monitor]);
  useEffect(() => {
    room.users++;
    return () => {
      room.users--;
      queueMicrotask(() => {
        if (room.users) return;
        room.ownedMaterials.forEach(material => material.dispose());
        room.ownedGeometries.forEach(geometry => geometry.dispose());
        room.ownedTextures.forEach(texture => texture.dispose());
      });
    };
  }, [room]);
  useFrame(() => {
    const offset = MathUtils.clamp(frame.current - metadata.weights[0][0], 0, metadata.weights.length - 1);
    const lower = Math.floor(offset);
    const next = Math.min(lower + 1, metadata.weights.length - 1);
    const blend = offset - lower;
    const reading = MathUtils.lerp(metadata.weights[lower][1], metadata.weights[next][1], blend);
    const fill = MathUtils.lerp(metadata.weights[lower][2], metadata.weights[next][2], blend);
    const stride = metadata.names.length * metadata.grid[0] * metadata.grid[1] * 2;
    room.heroMaterials.forEach(material => {
      material.uniforms.uFrameBase.value = 0;
      material.uniforms.uNextFrameBase.value = stride;
      material.uniforms.uFrameBlend.value = reading;
      material.uniforms.uFillFrameBase.value = 2 * stride;
      material.uniforms.uFillBlend.value = fill;
    });
  }, -1);
  const linkFor = (event: ThreeEvent<PointerEvent> | ThreeEvent<MouseEvent>) =>
    linksEnabled && event.uv && event.object.userData.paperId === chapter
      ? paperLinkAt(event.object.userData.paperLinks as PaperLink[], event.uv) : undefined;
  const isMonitorLink = (event: ThreeEvent<PointerEvent> | ThreeEvent<MouseEvent>) =>
    linksEnabled && chapter === 'screen' && event.object.name.replace(/_/g, ' ').includes('Monitor warm display');
  useEffect(() => {
    gl.domElement.style.cursor = '';
    return () => { gl.domElement.style.cursor = ''; };
  }, [chapter, gl, linksEnabled]);
  return <>
    <primitive object={room.scene} dispose={null}
      onPointerMove={(event: ThreeEvent<PointerEvent>) => {
        if (linkFor(event) || isMonitorLink(event)) { event.stopPropagation(); gl.domElement.style.cursor = 'pointer'; }
        else gl.domElement.style.cursor = '';
      }}
      onPointerOut={() => { gl.domElement.style.cursor = ''; }}
      onClick={(event: ThreeEvent<MouseEvent>) => {
        const link = linkFor(event);
        if (link) {
          event.stopPropagation(); event.nativeEvent.stopPropagation(); onOpenLink(link.url); return;
        }
        if (isMonitorLink(event)) {
          event.stopPropagation(); event.nativeEvent.stopPropagation(); onOpenScreen();
        }
      }} />
    {quality === 'cinema' ? <ReflectiveFloor height={room.floorHeight} screen={room.screen} /> :
      <LiteFloor height={room.floorHeight} screen={room.screen} />}
  </>;
}

function World({ bundle, navigation, quality, reducedMotion, schedule, linksEnabled, onOpenLink, onReady, onArrive, onOpenScreen }: {
  bundle: SceneBundle; navigation: NavigationRequest<Chapter>; quality: Quality;
  schedule: RenderSchedule;
  linksEnabled: boolean; onOpenLink: (url: string) => void;
  reducedMotion: boolean; onReady: () => void; onArrive: () => void; onOpenScreen: () => void;
}) {
  const { camera, size, gl, invalidate } = useThree();
  const light = useRef<DirectionalLight>(null);
  const fogLensBoundary = useMemo(() => new FogLensBoundary(), []);
  const chapter = navigation.chapter;
  const frame = useRef(bundle.data.stops[chapter]);
  const flight = useRef<{ from: number; to: number; elapsed: number; duration: number } | null>(null);
  const textures = useTexture(textureUrls);
  const lighting = useMemo(() => createLightingTexture(bundle.lightBinary), [bundle.lightBinary]);
  const heroLighting = useMemo(() => createLightingTexture(bundle.heroBinary), [bundle.heroBinary]);
  const atmosphere = useMemo(() => createAtmosphere(bundle.atmosphere, bundle.volumeBinary), [bundle.atmosphere, bundle.volumeBinary]);
  const ownedLighting = useMemo(() => ({ users: 0, lighting, heroLighting, atmosphere }), [lighting, heroLighting, atmosphere]);
  useEffect(() => {
    ownedLighting.users++;
    return () => {
      ownedLighting.users--;
      queueMicrotask(() => {
        if (ownedLighting.users) return;
        ownedLighting.lighting.texture.dispose();
        ownedLighting.heroLighting.texture.dispose();
        ownedLighting.atmosphere.textures.forEach(texture => texture.dispose());
      });
    };
  }, [ownedLighting]);
  textures.forEach(texture => { texture.colorSpace = SRGBColorSpace; texture.anisotropy = Math.min(8, gl.capabilities.getMaxAnisotropy()); });
  const glow = useMemo(() => createSkyGlowTexture(), []);
  const point = useMemo(() => new Vector3(), []);
  const nextPoint = useMemo(() => new Vector3(), []);
  const rotation = useMemo(() => new Quaternion(), []);
  const nextRotation = useMemo(() => new Quaternion(), []);
  const sceneFrames = useRef(0);
  const parallax = useRef({ x: 0, y: 0 });
  const ready = useRef(false);

  useEffect(() => {
    schedule.warmFrames = 3;
    invalidate();
    const next = applyNavigation(navigation, frame.current, bundle.data.stops, reducedMotion);
    frame.current = next.frame; flight.current = next.flight;
    if (!next.flight) onArrive();
  }, [bundle.data.stops, invalidate, navigation, onArrive, reducedMotion, schedule]);

  useFrame((state, delta) => {
    if (!ready.current) { ready.current = true; onReady(); }
    const motionDelta = Math.min(delta, .1, Math.max(0, (performance.now() - schedule.lastPresentation) / 1000));
    const moving = flight.current;
    if (moving) {
      moving.elapsed += motionDelta;
      const portion = Math.min(1, moving.elapsed / moving.duration);
      frame.current = MathUtils.lerp(moving.from, moving.to, portion);
      if (portion === 1) { flight.current = null; onArrive(); }
    }
    const frames = bundle.data.camera.frames;
    const f = frame.current - frames[0].frame;
    const index = MathUtils.clamp(Math.floor(f), 0, frames.length - 1);
    const from = frames[index], to = frames[Math.min(index + 1, frames.length - 1)];
    const blend = f - Math.floor(f);
    point.fromArray(from.position).lerp(nextPoint.fromArray(to.position), blend);
    rotation.fromArray(from.quaternion).slerp(nextRotation.fromArray(to.quaternion), blend);
    camera.position.copy(point); camera.quaternion.copy(rotation);
    const aspect = size.width / size.height;
    const lens = MathUtils.lerp(aspect >= 1 ? from.landscapeLens : from.portraitLens,
      aspect >= 1 ? to.landscapeLens : to.portraitLens, blend);
    const projection = cameraProjection(size.width, size.height, lens, bundle.data.camera.sensorWidth, frame.current, bundle.data.stops);
    const perspective = camera as PerspectiveCamera;
    const offset = perspective.view?.enabled ? perspective.view.offsetY : 0;
    if (Math.abs(perspective.fov - projection.fov) > 1e-8 || Math.abs(perspective.zoom - projection.zoom) > 1e-8 ||
        Math.abs(offset - projection.offsetY) > 1e-8 || (perspective.view?.enabled &&
        (perspective.view.fullWidth !== size.width || perspective.view.fullHeight !== size.height))) {
      perspective.fov = projection.fov; perspective.zoom = projection.zoom;
      if (projection.offsetY) perspective.setViewOffset(size.width, size.height, 0, projection.offsetY, size.width, size.height);
      else perspective.clearViewOffset();
      perspective.updateProjectionMatrix();
    }
    let settling = false;
    if (!still && !reducedMotion && !flight.current) {
      const targetX = state.pointer.x * .010, targetY = state.pointer.y * .006;
      // R3F's delta includes the idle interval; clamp it to keep pointer
      // motion smooth when the complete scene wakes from its cached view.
      parallax.current.x = MathUtils.damp(parallax.current.x, targetX, 3, motionDelta);
      parallax.current.y = MathUtils.damp(parallax.current.y, targetY, 3, motionDelta);
      settling = Math.abs(parallax.current.x - targetX) > 1e-8 || Math.abs(parallax.current.y - targetY) > 1e-8;
      if (!settling) { parallax.current.x = targetX; parallax.current.y = targetY; }
      camera.translateX(parallax.current.x); camera.translateY(parallax.current.y);
      camera.rotateY(-parallax.current.x * .07); camera.rotateX(parallax.current.y * .07);
    }
    schedule.moving = !!flight.current || settling;
    camera.updateMatrixWorld();
    if (light.current) {
      light.current.target.position.set(0, 3, 1);
      light.current.target.updateMatrixWorld();
    }
    sceneFrames.current++;
    window.__PAPER_3D = {
      ready: true, frame: frame.current, fps: schedule.fps, renderFrames: sceneFrames.current,
      cachedFrames: schedule.cachedFrames, presentedFrames: schedule.presentedFrames,
      triangles: gl.info.render.triangles, drawCalls: gl.info.render.calls,
      instances: bundle.data.instanceCount, moving: !!flight.current, quality,
      paperSwayTime: schedule.paperMotion.time, paperSwayStrength: schedule.paperMotion.strength,
    };
    gl.info.reset();
  }, -2);

  return <>
    <color attach="background" args={['#080f13']} />
    <ambientLight intensity={.12} color="#a4bec4" />
    <hemisphereLight args={['#b8d7dc', '#080d10', .30]} />
    {/* Source shadows are included in the baked surface/volume fields. No
        mesh receives a second, realtime shadow map. */}
    <directionalLight ref={light} position={[-.4, 12, -8]} color="#c0dae1" intensity={3.2} />
    <directionalLight position={[-1, 13, 1]} color="#a4c1cf" intensity={.38} />
    <directionalLight position={[-5, 7, 7]} color="#a4c0c5" intensity={.10} />
    <rectAreaLight position={[0, 5.5, 7]} rotation={[-.5, 0, 0]} color="#c2d0d3"
      intensity={chapter === 'intro' ? .12 : .56} width={5} height={5} />
    <pointLight position={[0, 1, -.7]} color="#ffe5b7" intensity={2.4} distance={3.2} decay={2} />
    <mesh position={[-.4, 12.8, -9]} rotation={[-.62, 0, 0]}>
      <planeGeometry args={[9, 8]} />
      <meshBasicMaterial map={glow} color={new Color().setRGB(5.4, 7.1, 7.4)} transparent
        depthWrite={false} side={DoubleSide} blending={AdditiveBlending} toneMapped={false} />
    </mesh>
    <PaperInstances data={bundle.data} binary={bundle.binary} textures={textures} lighting={lighting} grid={bundle.lighting.grid} schedule={schedule} />
    <Room quality={quality} version={bundle.data.assetVersion} lighting={heroLighting} metadata={bundle.heroLighting} frame={frame}
      chapter={chapter} linksEnabled={linksEnabled} onOpenLink={onOpenLink} onOpenScreen={onOpenScreen} />
    <EffectComposer enabled={false} multisampling={0} enableNormalPass={false}>
      <RealtimeFog field={atmosphere} quality={quality} tuned={tunedPostFx} />
      <primitive object={fogLensBoundary} dispose={null} />
      <CinematicFocus enabled={quality === 'cinema'} frame={frame} stops={bundle.data.stops} version={bundle.data.assetVersion} />
      <Bloom mipmapBlur luminanceThreshold={1.8} luminanceSmoothing={.28} intensity={.14} />
      <RealtimeGrade version={bundle.data.assetVersion} quality={quality} tuned={tunedPostFx} />
      <SMAA />
      <StaticSceneCache schedule={schedule} />
      <Noise opacity={.008} blendFunction={BlendFunction.SOFT_LIGHT} />
    </EffectComposer>
  </>;
}

class PreviewBoundary extends Component<{ children: ReactNode; onError: (message: string) => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: Error) { this.props.onError(error.message); }
  render() { return this.state.failed ? null : this.props.children; }
}

export default function RealtimePreview() {
  const schedule = useMemo(createRenderSchedule, []);
  const [bundle, setBundle] = useState<SceneBundle>();
  const [navigation, setNavigation] = useState<NavigationRequest<Chapter>>({ chapter: chapters.includes(requested) ? requested : 'intro', instant: false, id: 0 });
  const chapter = navigation.chapter;
  const [ready, setReady] = useState(false);
  const [moving, setMoving] = useState(false);
  const [webEntered, setWebEntered] = useState(params.get('view') === 'collection');
  const activeChapterButton = useRef<HTMLButtonElement>(null);
  const previouslyInCollection = useRef(webEntered);
  const [attemptId, setAttemptId] = useState(0);
  const [error, setError] = useState('');
  const [completed, setCompleted] = useState(0);
  const presentation = useRef<{ resolve: () => void; reject: (error: Error) => void }>();
  const readyRef = useRef(false);
  const [quality, setQuality] = useState<Quality>(() => window.innerWidth < 720 ? 'balanced' : 'cinema');
  const [reducedMotion, setReducedMotion] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const onReady = useCallback(() => { readyRef.current = true; setReady(true); presentation.current?.resolve(); }, []);
  const onArrive = useCallback(() => setMoving(false), []);
  const onError = useCallback((message: string) => {
    setError(message); setMoving(false);
    presentation.current?.reject(new Error(message));
  }, []);
  const index = chapters.indexOf(chapter);
  const project = portfolio.projects.find(project => project.id === chapter);
  const goTo = useCallback((next: Chapter, skipFlight = false) => {
    if (!ready || error || (moving && !skipFlight)) return;
    setWebEntered(false);
    setMoving(!reducedMotion && !skipFlight && next !== chapter);
    setNavigation(previous => requestNavigation(previous, next, skipFlight));
  }, [chapter, error, moving, ready, reducedMotion]);
  const openCollection = useCallback(() => setWebEntered(true), []);
  useEffect(() => {
    if (!webEntered && previouslyInCollection.current) activeChapterButton.current?.focus();
    previouslyInCollection.current = webEntered;
  }, [webEntered]);
  const retryScene = useCallback(() => {
    // Explicit error retry also evicts logically invalid completed core data.
    // The cache epoch prevents a late previous attempt from restoring stale data.
    // Ordinary collection revisits retain successful data and decoder caches.
    if (error) {
      resourceCache.invalidate();
      useTexture.clear(textureUrls);
      useTexture.clear(monitorUrl);
      const version = bundle?.data.assetVersion ?? preloadedVersion;
      if (version) {
        useGLTF.clear(assetUrl(`/assets/realtime/room.glb?v=${version}`));
        useTexture.clear(assetUrl(`/assets/realtime/source-grade.png?v=${version}`));
      }
    }
    readyRef.current = false; setReady(false); setError(''); setBundle(undefined);
    setWebEntered(false); setAttemptId(value => value + 1);
  }, [bundle, error]);
  const revisitScene = useCallback(() => {
    setNavigation(previous => requestNavigation(previous, chapters[chapters.length - 2], true));
    if (!ready || error) retryScene();
    else { setMoving(false); setWebEntered(false); }
  }, [error, ready, retryScene]);
  const onOpenScreen = useCallback(() => {
    if (chapter === 'screen' && ready && !moving) window.open(portfolio.github, '_blank', 'noopener,noreferrer');
  }, [chapter, moving, ready]);
  const onOpenLink = useCallback((url: string) => {
    if (ready && !moving && !webEntered) window.open(url, '_blank', 'noopener,noreferrer');
  }, [moving, ready, webEntered]);
  useEffect(() => {
    if (webEntered || readyRef.current) return;
    let active = true;
    setCompleted(0);
    const attempt = startBoundedLoad(async signal => {
      const value = await loadBundle(signal, count => { if (active) setCompleted(count); });
      if (!active || signal.aborted) return;
      const presented = new Promise<void>((resolve, reject) => { presentation.current = { resolve, reject }; });
      setBundle(value);
      await presented;
    }, 25000);
    void attempt.promise.catch(err => { if (active) onError(err instanceof Error ? err.message : String(err)); });
    return () => { active = false; attempt.cancel(); presentation.current = undefined; };
  }, [attemptId, onError, webEntered]);
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(media.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || document.querySelector('[role="dialog"]')) return;
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest('input,textarea,select,[contenteditable="true"]')) return;
      if (event.key === 'Escape' && webEntered) { event.preventDefault(); revisitScene(); return; }
      if (webEntered || target?.closest('button,a,summary')) return;
      if (chapter === 'screen' && (event.key === 'Enter' || event.key === ' ')) {
        event.preventDefault();
        if (ready && !moving && !error) openCollection();
        return;
      }
      if (event.key === 'ArrowRight' || event.key === ' ' || event.key === 'Enter') {
        event.preventDefault(); goTo(chapters[Math.min(index + 1, chapters.length - 1)]);
      }
      if (event.key === 'ArrowLeft') { event.preventDefault(); goTo(chapters[Math.max(0, index - 1)]); }
      if (event.key === 'Home') { event.preventDefault(); goTo('intro', true); }
      if (event.key === 'End') { event.preventDefault(); goTo('screen', true); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [chapter, error, goTo, index, moving, openCollection, ready, revisitScene, webEntered]);
  return <div className={`experience experience--rendered realtime-preview${sceneOnly && !webEntered ? ' experience--scene-only' : ''}${webEntered ? ' experience--web' : ''}`}>
    <div className="scene-canvas" aria-hidden="true" onClick={() => {
      if (!sceneOnly && chapter !== 'screen') goTo(chapters[index + 1]);
    }}>
      {bundle && !error && (ready || !webEntered) && <PreviewBoundary key={attemptId} onError={onError}>
        <Canvas frameloop="demand" dpr={quality === 'cinema' ? [1, 1.25] : [0.75, 1]}
          gl={{ antialias: false, powerPreference: 'high-performance', toneMapping: AgXToneMapping, toneMappingExposure: .9 }}
          onCreated={({ gl }) => { gl.info.autoReset = false; }}
          camera={{ near: .025, far: 55, position: [0, 2, 8] }}>
          <FrameSchedule active={!webEntered} motionEnabled={!reducedMotion && !still} quality={quality} schedule={schedule} />
          <Suspense fallback={null}>
            <World bundle={bundle} navigation={navigation} quality={quality} reducedMotion={reducedMotion} schedule={schedule}
              linksEnabled={ready && !moving && !webEntered} onOpenLink={onOpenLink}
              onReady={onReady} onArrive={onArrive} onOpenScreen={onOpenScreen} />
          </Suspense>
        </Canvas>
      </PreviewBoundary>}
    </div>
    <header className={`site-header${webEntered || !ready || !!error ? ' site-header--hidden' : ''}`}>
      <div className="header-actions">
        <button type="button" className="quality-toggle" onClick={() => setQuality(quality === 'cinema' ? 'balanced' : 'cinema')} aria-label="高清画质"
          aria-pressed={quality === 'cinema'} title={quality === 'cinema' ? '当前为高清画质，点击切换流畅模式' : '当前为流畅模式，点击切换高清画质'}>
          {quality === 'cinema' ? <Eye size={16} /> : <EyeOff size={16} />}
        </button>
      </div>
    </header>
    {!webEntered && ready && chapter === 'intro' && <div className="scene-introduction" aria-hidden="true">
      <h2>让想法<br />走出纸面。</h2>
      <p className="journey-hint">点击画面 · 方向键 →</p>
    </div>}
    {!webEntered && <section className="visually-hidden" aria-live="polite" aria-atomic="true">
      <h1>{project ? project.title.replace('\n', ' ') : chapter === 'screen' ? '完整作品集' : 'Corden 的项目与实验'}</h1>
      {project && <>
        <p>{project.category}</p>
        {project.works?.map(work => <div key={work.title}><h2>{work.title}</h2><p>{work.description}</p></div>)}
        <ul>{project.achievements?.map(achievement => <li key={achievement}>{achievement}</li>)}</ul>
        <p>{project.subtitle}</p><p>{project.keywords.join(' / ')}</p>
        {project.website && <p>{project.website}</p>}
      </>}
    </section>}
    {!webEntered && project && ready && !moving && <nav className="paper-keyboard-links" aria-label="当前项目链接">
      {project.works?.filter(work => work.url).map(work => <a key={work.title} href={work.url} target="_blank" rel="noopener noreferrer">{work.title} ↗</a>)}
      {project.website && <a href={'https://' + project.website} target="_blank" rel="noopener noreferrer">{project.website} ↗</a>}
    </nav>}
    {!webEntered && ready && !error && <footer className="scene-footer">
      <p className="scene-chapter-label" aria-live="polite"><span>{String(index).padStart(2, '0')} / {String(chapters.length - 1).padStart(2, '0')}</span>{chapterTitle(chapter)}</p>
      <nav className="footer-chapters" aria-label="场景章节">
        {chapters.map(entry => <button className={`chapter-marker${entry === chapter ? ' chapter-marker--active' : ''}`}
          ref={entry === chapter ? activeChapterButton : undefined}
          key={entry} type="button" disabled={!ready || !!error} onClick={() => goTo(entry, true)} aria-current={entry === chapter ? 'step' : undefined}
          aria-label={`跳转到${chapterTitle(entry)}`} title={chapterTitle(entry)}>
          <span className="chapter-marker__bar" />
          <span className="chapter-tooltip" aria-hidden="true">{chapterTitle(entry)}</span>
        </button>)}
      </nav>
      <div className="footer-actions">
        <button className="back-button" type="button" aria-label="前一章" disabled={index === 0 || moving} onClick={() => goTo(chapters[index - 1])}><ArrowLeft size={18} /></button>
        {chapter === 'screen' && <button type="button" className="replay-button" disabled={!ready || moving} onClick={() => goTo('intro', true)} aria-label="重新浏览"><span>重新浏览</span><RotateCcw size={16} /></button>}
      </div>
    </footer>}
    {!webEntered && ready && !error && chapter === 'screen' && <div className="scene-ending">
      <button type="button" className="scene-collection-cta" disabled={moving} onClick={openCollection}>查看完整作品集 <ArrowUpRight size={17} /></button>
      <a href={portfolio.github} target="_blank" rel="noopener noreferrer">在 GitHub 查看源码 <ArrowUpRight size={13} /></a>
    </div>}
    {webEntered && <div className="portfolio-transition"><FinalPortfolio onRevisit={revisitScene} /></div>}
    {!webEntered && !ready && !error && <div className="loading-screen">
      <div role="status" aria-live="polite" className="loading-status">
        <span className="loading-wordmark">{portfolio.name}</span>
        <p>{completed < 8 ? '正在准备纸张与光影' : '正在绘制第一帧'}</p>
        <progress value={completed < 8 ? completed : undefined} max={8} aria-label="场景加载进度" />
        <span className="loading-hint">也可以先查看作品，稍后再进入场景。</span>
      </div>
      <button type="button" className="text-link" onClick={openCollection}>先看作品集 <ArrowUpRight size={16} /></button>
    </div>}
    {!webEntered && error && <div className="error-screen">
      <div role="alert"><h2>场景暂时未能打开</h2><p>可以直接浏览完整作品集，也可以重新加载场景。</p></div>
      <button type="button" className="next-button" onClick={openCollection}>查看作品集 <ArrowUpRight size={16} /></button>
      <div className="error-actions">
        <button type="button" className="text-link" onClick={retryScene}>重新加载 <RotateCcw size={16} /></button>
        <a className="text-link" href={assetUrl('/?render=video')}>查看视频版场景 <ArrowUpRight size={16} /></a>
      </div>
      <details className="error-details"><summary>查看错误详情</summary><p>{error}</p></details>
    </div>}
  </div>;
}

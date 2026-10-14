import {
  DataTexture, DoubleSide, HalfFloatType, NearestFilter, RGBAFormat, ShaderMaterial, Vector2,
} from 'three';
import type { Texture } from 'three';
import { PAPER_SWAY } from './realtimePaperMotion';

export type LightingTexture = { texture: DataTexture; size: Vector2 };

export function createLightingTexture(binary: ArrayBuffer): LightingTexture {
  const source = new Uint16Array(binary);
  if (source.length % 3) throw new Error('The surface lighting is incomplete.');
  const width = 1024;
  const height = Math.ceil(source.length / 3 / width);
  const pixels = new Uint16Array(width * height * 4);
  for (let i = 0; i < source.length / 3; i++) {
    pixels.set(source.subarray(i * 3, i * 3 + 3), i * 4);
    pixels[i * 4 + 3] = 0x3c00;
  }
  const texture = new DataTexture(pixels, width, height, RGBAFormat, HalfFloatType);
  texture.minFilter = texture.magFilter = NearestFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return { texture, size: new Vector2(width, height) };
}

const vertex = /* glsl */ `
attribute float aLightingOffset;
#ifdef V4_INSTANCED
attribute vec3 aPaperSway;
uniform float uSwayTime;
uniform float uSwayStrength;
#endif
attribute float aLightingSide;
varying vec2 vUv;
varying float vLightingOffset;
varying float vPaperDepth;
varying float vLightingSide;
varying vec3 vPaperWorld;
void main() {
  vUv = uv;
  vLightingOffset = aLightingOffset;
  vLightingSide = aLightingSide;
  vec4 p = vec4(position,1.0);
  #ifdef V4_INSTANCED
    vec3 drift = vec3(0.0);
    if (uSwayStrength > 0.0) {
      float phase = uSwayTime * aPaperSway.y + aPaperSway.x;
      float amount = uSwayStrength * aPaperSway.z;
      float tiltX = sin(phase) * ${PAPER_SWAY.tiltX.toFixed(6)} * amount;
      float tiltY = sin(phase * .73 + 1.7) * ${PAPER_SWAY.tiltY.toFixed(6)} * amount;
      float cx = cos(tiltX), sx = sin(tiltX);
      float cy = cos(tiltY), sy = sin(tiltY);
      // Rigid motion around each paper's local origin preserves its authored curl.
      p.yz = vec2(cx * p.y - sx * p.z, sx * p.y + cx * p.z);
      p.xz = vec2(cy * p.x + sy * p.z, -sy * p.x + cy * p.z);
      drift = vec3(sin(phase * .83 + .5) * ${PAPER_SWAY.driftX.toFixed(6)},
                   sin(phase * .67 + 2.4) * ${PAPER_SWAY.driftY.toFixed(6)},
                   cos(phase * .71) * ${PAPER_SWAY.driftZ.toFixed(6)}) * amount;
    }
    p = instanceMatrix * p;
    p.xyz += drift;
  #endif
  vPaperDepth = -(modelMatrix * p).z;
  vPaperWorld = (modelMatrix * p).xyz;
  gl_Position = projectionMatrix * modelViewMatrix * p;
}`;

const fragment = /* glsl */ `
uniform sampler2D uPrint;
uniform sampler2D uEmission;
uniform sampler2D uIrradiance;
uniform vec2 uLightingSize;
uniform vec2 uGrid;
uniform float uTransmission;
uniform float uFrameBase;
uniform float uNextFrameBase;
uniform float uFrameBlend;
uniform float uFillFrameBase;
uniform float uFillBlend;
varying vec2 vUv;
varying float vLightingOffset;
varying float vPaperDepth;
varying float vLightingSide;
varying vec3 vPaperWorld;
float fiberHash(vec2 p) { return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
float fiberNoise(vec2 p) {
  vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(fiberHash(i),fiberHash(i+vec2(1.0,0.0)),f.x),
    mix(fiberHash(i+vec2(0.0,1.0)),fiberHash(i+vec2(1.0)),f.x),f.y);
}
float cottonHeight(vec2 uv) {
  return .62*fiberNoise(uv*vec2(360.0,190.0))+
    .38*fiberNoise(uv*vec2(145.0,520.0));
}
vec3 probeAt(float side, vec2 xy, float frameBase) {
  float offset = vLightingOffset + frameBase + side*uGrid.x*uGrid.y + xy.x + xy.y*uGrid.x;
  vec2 pixel = vec2(mod(offset,uLightingSize.x),floor(offset/uLightingSize.x));
  return texture2D(uIrradiance,(pixel+.5)/uLightingSize).rgb;
}
vec3 probe(float side, vec2 xy) {
  #ifdef V4_HERO
    // All paper lighting coefficients are already baked. Select only the
    // nonzero contributors; these weights are uniform across every fragment.
    // At any authored frame, at most two of the three bases contribute.
    if (uFrameBlend >= 1.0 && uFillBlend >= 1.0)
      return probeAt(side,xy,uFillFrameBase);
    if (uFrameBlend >= 1.0) {
      vec3 reading = probeAt(side,xy,uNextFrameBase);
      if (uFillBlend > 0.0)
        return reading + (probeAt(side,xy,uFillFrameBase)-reading)*uFillBlend;
      return reading;
    }
    vec3 ambient = probeAt(side,xy,uFrameBase);
    if (uFrameBlend <= 0.0 && uFillBlend <= 0.0) return ambient;
    vec3 reading = probeAt(side,xy,uNextFrameBase);
    vec3 value = mix(ambient,reading,uFrameBlend);
    if (uFillBlend > 0.0)
      value += (probeAt(side,xy,uFillFrameBase)-reading)*uFillBlend;
    return value;
  #else
    return probeAt(side,xy,uFrameBase);
  #endif
}
vec3 hemisphere(float side) {
  vec2 lightingUv = vUv;
  #ifdef V4_HERO
    lightingUv.y = 1.0-lightingUv.y;
  #endif
  vec2 position = clamp((lightingUv-.025)/.95,0.0,1.0)*(uGrid-1.0);
  vec2 a = min(floor(position),uGrid-2.0), f = position-a;
  return mix(mix(probe(side,a),probe(side,a+vec2(1.,0.)),f.x),
             mix(probe(side,a+vec2(0.,1.)),probe(side,a+vec2(1.,1.)),f.x),f.y);
}
void main() {
  float side = gl_FrontFacing ? 0.0 : 1.0;
  #ifdef V4_HERO
    side = gl_FrontFacing ? vLightingSide : 1.0-vLightingSide;
  #endif
  vec3 front = hemisphere(side);
  vec3 back = hemisphere(1.0-side);
  float through = uTransmission;
  #ifdef V4_INSTANCED
    through = mix(.36,.70,clamp((vPaperDepth+7.0)/15.0,0.0,1.0));
  #endif
  // V4's solidified cotton has a second shell. Shadow rays crossing that
  // shell transmit 13 percent; omitting it washes out the foreground pages.
  float shell = .13;
  #ifdef V4_HERO
    shell = .48;
  #endif
  vec3 irradiance = front*(1.0-through) + back*through*shell;
  vec3 ink = texture2D(uPrint,vUv).rgb;
  #ifdef V4_INSTANCED
    ink = pow(ink,vec3(1.35));
    ink *= vec3(.84,.96,1.0);
  #endif
  #ifdef V4_HERO
    // Keep the baked curvature and reading-light gradient on warm cotton.
    // Surface light lifts the paper while the ink retains its contrast.
    ink *= vec3(1.02,1.0,.94);
    irradiance *= 2.35;
    float cotton=cottonHeight(vUv);
    ink *= .985+.03*cotton;
  #endif
  vec3 color = ink * irradiance;
  #ifdef V4_HERO
    vec3 dpdx=dFdx(vPaperWorld), dpdy=dFdy(vPaperWorld);
    vec3 normal=normalize(cross(dpdx,dpdy));
    vec3 eyeDirection=normalize(cameraPosition-vPaperWorld);
    if (dot(normal,eyeDirection)<0.0) normal=-normal;
    float heightField=cottonHeight(vUv)*.0007;
    vec3 r1=cross(dpdy,normal), r2=cross(normal,dpdx);
    float determinant=dot(dpdx,r1);
    vec3 gradient=sign(determinant)*(dFdx(heightField)*r1+dFdy(heightField)*r2);
    vec3 perturbedNormal=abs(determinant)*normal-gradient;
    float normalLengthSquared=dot(perturbedNormal,perturbedNormal);
    vec3 fiberNormal=normalLengthSquared>1e-20 ? perturbedNormal*inversesqrt(normalLengthSquared) : normal;
    vec3 keyDirection=normalize(vec3(-.4,12.0,-8.0)-vPaperWorld);
    float microContrast=clamp(dot(fiberNormal,keyDirection)-dot(normal,keyDirection),-.4,.4);
    color *= 1.0+microContrast*.17;
    float rim=pow(1.0-clamp(dot(fiberNormal,eyeDirection),0.0,1.0),3.0);
    color += vec3(.026,.024,.019)*rim;
  #endif
  #ifdef V4_GLOW
    // Only the lettering emits light. Keep the cotton's baked shading intact.
    float lettering = texture2D(uEmission,vUv).r;
    color += lettering * vec3(1.0,.94,.82) * .035;
  #endif
  gl_FragColor = vec4(color,1.0);
  #include <colorspace_fragment>
}`;

export function createPaperMaterial(print: Texture, lighting: LightingTexture,
  grid: [number, number], instanced: boolean, transmission: number, hero = false, emission?: Texture) {
  return new ShaderMaterial({
    name: 'V4 | Cycles sampled thin paper',
    vertexShader: vertex, fragmentShader: fragment, side: DoubleSide,
    defines: { ...(instanced ? { V4_INSTANCED: 1 } : hero ? { V4_HERO: 1 } : {}), ...(emission ? { V4_GLOW: 1 } : {}) },
    uniforms: {
      uPrint: { value: print }, uIrradiance: { value: lighting.texture },
      uEmission: { value: emission ?? print },
      uLightingSize: { value: lighting.size }, uGrid: { value: new Vector2(...grid) },
      uTransmission: { value: transmission },
      uSwayTime: { value: 0 }, uSwayStrength: { value: 0 },
      uFrameBase: { value: 0 }, uNextFrameBase: { value: 0 }, uFrameBlend: { value: 0 },
      uFillFrameBase: { value: 0 }, uFillBlend: { value: 0 },
    },
  });
}

import { useMemo } from 'react';
import { useTexture } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { BlendFunction, Effect } from 'postprocessing';
import { LinearFilter, SRGBColorSpace, Uniform, Vector2 } from 'three';
import type { Texture } from 'three';
import { assetUrl } from '../utils/assetUrl';
import { FILM_LOOK } from './realtimeLook';

// The original 48³ Cycles-matched grade stays the color baseline. The warm
// highlight fringe, split toning and restrained vignette share its same pass:
// no additional framebuffer, pass, or stationary-cache invalidation.
const fragment = /* glsl */ `
uniform sampler2D sourceGrade;
uniform vec2 uFilmTexel;
uniform float uFilmEnabled;
uniform float uHalationAmount;
uniform float uHalationCinema;
vec3 gradeSlice(vec3 p,float slice) {
  vec2 uv=vec2((p.x+slice*48.0+.5)/(48.0*48.0),(p.y+.5)/48.0);
  return texture2D(sourceGrade,uv).rgb;
}
float halationSource(vec2 uv) {
  vec3 sampleColor=max(texture2D(inputBuffer,uv).rgb,vec3(0.0));
  float brightness=max(max(sampleColor.r,sampleColor.g),sampleColor.b);
  float selected=smoothstep(${FILM_LOOK.halationThreshold.toFixed(3)},${FILM_LOOK.halationSoftEnd.toFixed(3)},brightness);
  return selected*min(brightness,5.0)/(1.0+brightness*.30);
}
void mainImage(const in vec4 inputColor,const in vec2 uv,out vec4 outputColor) {
  vec3 hdr=inputColor.rgb;
  if (uFilmEnabled>.5) {
    // A narrow reddish fringe outside intense light, not a blurred paper
    // texture. Eight taps in cinema; four in balanced. Existing Bloom stays.
    vec2 nearStep=uFilmTexel*${FILM_LOOK.halationRadiusNear.toFixed(2)};
    float fringe=(halationSource(uv+vec2(nearStep.x,0.0))+
                  halationSource(uv-vec2(nearStep.x,0.0))+
                  halationSource(uv+vec2(0.0,nearStep.y))+
                  halationSource(uv-vec2(0.0,nearStep.y)))*.25;
    if (uHalationCinema>.5) {
      vec2 farStep=uFilmTexel*${FILM_LOOK.halationRadiusFar.toFixed(1)};
      float wide=(halationSource(uv+vec2(farStep.x,farStep.y))+
                  halationSource(uv+vec2(-farStep.x,farStep.y))+
                  halationSource(uv+vec2(farStep.x,-farStep.y))+
                  halationSource(uv-vec2(farStep.x,farStep.y)))*.25;
      fringe=mix(fringe,wide,.38);
    }
    float core=max(max(hdr.r,hdr.g),hdr.b);
    fringe*=1.0-.32*smoothstep(1.4,3.5,core);
    hdr+=fringe*uHalationAmount*vec3(1.0,.43,.23);
  }
  vec3 p=clamp((log2(max(hdr,vec3(exp2(-12.0))))+12.0)/18.0,0.0,1.0)*47.0;
  float slice=floor(p.z);
  vec3 color=mix(gradeSlice(p,slice),gradeSlice(p,min(47.0,slice+1.0)),fract(p.z));
  if (uFilmEnabled>.5) {
    float light=dot(color,vec3(.2126,.7152,.0722));
    float shadows=1.0-smoothstep(.08,.44,light);
    float highlights=smoothstep(.38,.84,light)*(1.0-smoothstep(.92,1.05,light));
    // Multiplicative tints preserve near-black ink and avoid clipping whites.
    color*=mix(vec3(1.0),vec3(.968,1.007,1.025),shadows*${FILM_LOOK.shadowTintStrength.toFixed(2)});
    color*=mix(vec3(1.0),vec3(1.028,1.008,.967),highlights*${FILM_LOOK.highlightTintStrength.toFixed(2)});
    vec2 q=(uv-.5)*2.0;
    float radial=dot(q*q,vec2(.53,.47));
    color*=1.0-${FILM_LOOK.vignetteStrength.toFixed(3)}*smoothstep(.28,.98,radial);
  }
  outputColor=vec4(color,inputColor.a);
}`;

class SourceGradeEffect extends Effect {
  constructor(texture: Texture, enabled: boolean) {
    super('V4SourceAgXFilm', fragment, {
      blendFunction: BlendFunction.NORMAL,
      uniforms: new Map<string, Uniform>([
        ['sourceGrade', new Uniform(texture)],
        ['uFilmTexel', new Uniform(new Vector2())],
        ['uFilmEnabled', new Uniform(enabled ? 1 : 0)],
        ['uHalationAmount', new Uniform(0)],
        ['uHalationCinema', new Uniform(0)],
      ]),
    });
  }
}

export default function RealtimeGrade({ version, quality, tuned }: {
  version: string; quality: 'cinema' | 'balanced'; tuned: boolean;
}) {
  const { gl } = useThree();
  const texture=useTexture(assetUrl(`/assets/realtime/source-grade.png?v=${version}`));
  texture.colorSpace=SRGBColorSpace;
  texture.minFilter=texture.magFilter=LinearFilter;
  texture.generateMipmaps=false;
  const effect=useMemo(()=>new SourceGradeEffect(texture,tuned),[texture,tuned]);
  const drawing=useMemo(()=>new Vector2(),[]);
  useFrame(()=>{
    // Keep the same Effect instance when toggling CINEMA/LITE or resizing.
    // Match the postprocessing target's actual pixel density on every full frame.
    gl.getDrawingBufferSize(drawing);
    (effect.uniforms.get('uFilmTexel')!.value as Vector2).set(
      1/Math.max(1,drawing.x),1/Math.max(1,drawing.y));
    effect.uniforms.get('uHalationAmount')!.value=quality==='cinema'
      ? FILM_LOOK.halationStrengthCinema : FILM_LOOK.halationStrengthBalanced;
    effect.uniforms.get('uHalationCinema')!.value=quality==='cinema'?1:0;
  },-1);
  return <primitive object={effect} dispose={null} />;
}

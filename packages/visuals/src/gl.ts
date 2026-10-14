/**
 * Thin WebGL2 helpers. Every failure throws a VisualsError carrying the GL
 * info log and the program name; nothing here returns null.
 */
import { VisualsError } from './errors.js';
import { UNIFORM_TYPES, type UniformName } from './uniforms.js';

function compile(gl: WebGL2RenderingContext, type: number, source: string, name: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new VisualsError('gl-resource', `${name}: could not create a shader object (context lost?)`);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS) && !gl.isContextLost()) {
    const log = gl.getShaderInfoLog(shader) ?? '(no info log)';
    gl.deleteShader(shader);
    const stage = type === gl.VERTEX_SHADER ? 'vertex' : 'fragment';
    throw new VisualsError('shader-compile', `Visuals: the ${stage} shader of "${name}" failed to compile:\n${log}`);
  }
  return shader;
}

export interface Program {
  name: string;
  program: WebGLProgram;
  /** null = the uniform is unused by this program and was optimized away (normal). */
  locations: Map<UniformName, WebGLUniformLocation | null>;
}

export function createProgram(gl: WebGL2RenderingContext, vertexSource: string, fragmentSource: string, name: string): Program {
  const vs = compile(gl, gl.VERTEX_SHADER, vertexSource, name);
  const fs = compile(gl, gl.FRAGMENT_SHADER, fragmentSource, name);
  const program = gl.createProgram();
  if (!program) throw new VisualsError('gl-resource', `${name}: could not create a program object (context lost?)`);
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS) && !gl.isContextLost()) {
    const log = gl.getProgramInfoLog(program) ?? '(no info log)';
    gl.deleteProgram(program);
    throw new VisualsError('shader-link', `Visuals: the shader program "${name}" failed to link:\n${log}`);
  }
  const locations = new Map<UniformName, WebGLUniformLocation | null>();
  for (const u of Object.keys(UNIFORM_TYPES) as UniformName[]) locations.set(u, gl.getUniformLocation(program, u));
  return { name, program, locations };
}

/** Uploads values for the given uniforms to the bound program. */
export function setUniforms(gl: WebGL2RenderingContext, p: Program, values: Partial<Record<UniformName, number | readonly number[]>>): void {
  for (const [name, value] of Object.entries(values) as [UniformName, number | readonly number[]][]) {
    const loc = p.locations.get(name);
    if (loc === undefined) throw new VisualsError('invalid-argument', `${p.name}: ${name} is not in the uniform table`);
    if (loc === null) continue;
    const type = UNIFORM_TYPES[name];
    switch (type) {
      case 'float':
        gl.uniform1f(loc, value as number);
        break;
      case 'int':
      case 'sampler2D':
        gl.uniform1i(loc, value as number);
        break;
      case 'vec2': {
        const v = value as readonly number[];
        gl.uniform2f(loc, v[0] as number, v[1] as number);
        break;
      }
      case 'vec3': {
        const v = value as readonly number[];
        gl.uniform3f(loc, v[0] as number, v[1] as number, v[2] as number);
        break;
      }
    }
  }
}

export interface RenderTarget {
  texture: WebGLTexture;
  framebuffer: WebGLFramebuffer;
  width: number;
  height: number;
}

export function createTarget(gl: WebGL2RenderingContext, width: number, height: number, name: string): RenderTarget {
  const texture = gl.createTexture();
  const framebuffer = gl.createFramebuffer();
  if (!texture || !framebuffer) throw new VisualsError('gl-resource', `${name}: could not create a render target (context lost?)`);
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
  const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  if (status !== gl.FRAMEBUFFER_COMPLETE && !gl.isContextLost()) {
    throw new VisualsError('framebuffer', `${name}: framebuffer incomplete (status 0x${status.toString(16)}) at ${width}x${height}`);
  }
  return { texture, framebuffer, width, height };
}

export function deleteTarget(gl: WebGL2RenderingContext, t: RenderTarget): void {
  gl.deleteTexture(t.texture);
  gl.deleteFramebuffer(t.framebuffer);
}

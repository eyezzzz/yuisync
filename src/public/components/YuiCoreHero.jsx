import { useEffect, useRef, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { Bot, Building2, Sparkles, Users2, Workflow } from 'lucide-react'

const CALLOUTS = [
  {
    title: 'Empresa',
    text: 'Gestão completa do negócio',
    icon: Building2,
    position: 'left-0 top-[14%]',
    line: 'left-[22%] top-[25%] w-[22%] bg-gradient-to-r from-cyan-200/70 via-cyan-200/35 to-transparent',
    anchor: 'left-[43.2%] top-[24.45%] bg-cyan-200 shadow-[0_0_14px_rgba(165,243,252,0.95)]',
    accent: 'border-cyan-300/30 bg-cyan-300/10 text-cyan-100',
  },
  {
    title: 'Equipe',
    text: 'Colaboração e produtividade',
    icon: Users2,
    position: 'right-0 top-[12%]',
    line: 'right-[22%] top-[24%] w-[22%] bg-gradient-to-l from-emerald-200/70 via-emerald-200/35 to-transparent',
    anchor: 'right-[43.2%] top-[23.45%] bg-emerald-200 shadow-[0_0_14px_rgba(167,243,208,0.95)]',
    accent: 'border-emerald-300/30 bg-emerald-300/10 text-emerald-100',
  },
  {
    title: 'Clientes',
    text: 'Experiência integrada e personalizada',
    icon: Bot,
    position: 'bottom-[14%] left-[2%]',
    line: 'bottom-[27%] left-[24%] w-[21%] bg-gradient-to-r from-violet-200/65 via-violet-200/32 to-transparent',
    anchor: 'bottom-[26.45%] left-[44.2%] bg-violet-200 shadow-[0_0_14px_rgba(221,214,254,0.9)]',
    accent: 'border-violet-300/30 bg-violet-300/10 text-violet-100',
  },
  {
    title: 'Automações',
    text: 'Processos inteligentes em movimento',
    icon: Workflow,
    position: 'bottom-[13%] right-0',
    line: 'bottom-[26%] right-[23%] w-[21%] bg-gradient-to-l from-sky-200/65 via-sky-200/32 to-transparent',
    anchor: 'bottom-[25.45%] right-[43.2%] bg-sky-200 shadow-[0_0_14px_rgba(186,230,253,0.9)]',
    accent: 'border-sky-300/30 bg-sky-300/10 text-sky-100',
  },
]

const MESH_VERTEX = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPosition;
layout(location=1) in vec3 aNormal;
uniform mat4 uModel;
uniform mat4 uViewProjection;
out vec3 vWorld;
out vec3 vNormal;
void main() {
  vec4 world = uModel * vec4(aPosition, 1.0);
  vWorld = world.xyz;
  vNormal = normalize(mat3(uModel) * aNormal);
  gl_Position = uViewProjection * world;
}`

const MESH_FRAGMENT = `#version 300 es
precision highp float;
in vec3 vWorld;
in vec3 vNormal;
uniform vec3 uColor;
uniform vec3 uCamera;
uniform vec3 uLight;
uniform float uTime;
uniform float uOpacity;
uniform float uMaterial;
out vec4 outColor;

float hash31(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.yzx + 33.33);
  return fract((p.x + p.y) * p.z);
}

float noise3(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(hash31(i), hash31(i + vec3(1,0,0)), f.x),
        mix(hash31(i + vec3(0,1,0)), hash31(i + vec3(1,1,0)), f.x), f.y),
    mix(mix(hash31(i + vec3(0,0,1)), hash31(i + vec3(1,0,1)), f.x),
        mix(hash31(i + vec3(0,1,1)), hash31(i + vec3(1,1,1)), f.x), f.y),
    f.z
  );
}

void main() {
  vec3 N = normalize(vNormal);
  vec3 V = normalize(uCamera - vWorld);
  vec3 L = normalize(uLight - vWorld);
  float diffuse = max(dot(N, L), 0.0);
  float fresnel = pow(1.0 - max(dot(N, V), 0.0), 3.0);
  float specular = pow(max(dot(reflect(-L, N), V), 0.0), 68.0);

  if (uMaterial < 0.5) {
    float plasma = noise3(vWorld * 2.25 + vec3(uTime * .17, -uTime * .12, uTime * .09));
    float veins = smoothstep(.5, .84, plasma);
    vec3 deep = vec3(.012, .035, .15);
    vec3 lit = uColor * (.28 + diffuse * .48 + veins * .36);
    vec3 color = mix(deep, lit, .72);
    color += vec3(.08, .42, 1.0) * fresnel * 1.55;
    color += vec3(.78, .96, 1.0) * specular * 2.2;
    color += vec3(.04, .24, .8) * plasma * .42;
    outColor = vec4(color, uOpacity);
    return;
  }

  if (uMaterial < 1.5) {
    float flow = noise3(vWorld * 4.2 + vec3(-uTime * .22, uTime * .15, uTime * .09));
    float pulse = .74 + .18 * sin(uTime * 2.0 + vWorld.x * 2.8 + vWorld.z * 2.2);
    vec3 color = uColor * (1.05 + flow * .48 + fresnel * .5) * pulse;
    color += vec3(.5, .88, 1.0) * specular * 1.7;
    outColor = vec4(color, uOpacity);
    return;
  }

  if (uMaterial < 2.5) {
    float pulse = .88 + .12 * sin(uTime * 2.55 + vWorld.y * 3.0);
    vec3 color = mix(uColor, vec3(.96, 1.0, 1.0), .62 + specular * .25);
    color *= 1.62 * pulse;
    color += vec3(.18, .72, 1.0) * fresnel * 1.3;
    outColor = vec4(color, uOpacity);
    return;
  }

  vec3 color = uColor * (.22 + fresnel * 1.5 + specular * 2.0);
  outColor = vec4(color, uOpacity * (.25 + fresnel * .75));
}`

const POINT_VERTEX = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPosition;
layout(location=1) in float aSize;
uniform mat4 uViewProjection;
uniform float uTime;
out float vGlow;
void main() {
  vec3 p = aPosition;
  p.x += sin(uTime * .19 + aPosition.y * 1.8) * .045;
  p.y += cos(uTime * .16 + aPosition.x * 1.6) * .034;
  vec4 clip = uViewProjection * vec4(p, 1.0);
  gl_Position = clip;
  gl_PointSize = aSize * (10.0 / max(1.0, clip.w));
  vGlow = .55 + .45 * sin(uTime * 1.8 + aPosition.x * 5.0 + aPosition.y * 3.2);
}`

const POINT_FRAGMENT = `#version 300 es
precision highp float;
in float vGlow;
out vec4 outColor;
void main() {
  vec2 uv = gl_PointCoord * 2.0 - 1.0;
  float d = dot(uv, uv);
  if (d > 1.0) discard;
  float alpha = smoothstep(1.0, 0.0, d) * (.35 + .65 * vGlow);
  vec3 color = mix(vec3(.18, .58, 1.0), vec3(.72, 1.0, .9), vGlow);
  outColor = vec4(color, alpha);
}`

function createShader(gl, type, source) {
  const shader = gl.createShader(type)
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader) || 'Falha ao compilar shader.'
    gl.deleteShader(shader)
    throw new Error(message)
  }
  return shader
}

function createProgram(gl, vertexSource, fragmentSource) {
  const program = gl.createProgram()
  const vertex = createShader(gl, gl.VERTEX_SHADER, vertexSource)
  const fragment = createShader(gl, gl.FRAGMENT_SHADER, fragmentSource)
  gl.attachShader(program, vertex)
  gl.attachShader(program, fragment)
  gl.linkProgram(program)
  gl.deleteShader(vertex)
  gl.deleteShader(fragment)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const message = gl.getProgramInfoLog(program) || 'Falha ao linkar programa WebGL.'
    gl.deleteProgram(program)
    throw new Error(message)
  }
  return program
}

function mat4Identity() {
  return new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1])
}

function mat4Multiply(a, b) {
  const out = new Float32Array(16)
  for (let c = 0; c < 4; c += 1) {
    for (let r = 0; r < 4; r += 1) {
      out[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3]
    }
  }
  return out
}

function mat4Translation(x, y, z) {
  const out = mat4Identity()
  out[12] = x
  out[13] = y
  out[14] = z
  return out
}

function mat4Scale(x, y, z) {
  const out = mat4Identity()
  out[0] = x
  out[5] = y
  out[10] = z
  return out
}

function mat4RotationX(angle) {
  const c = Math.cos(angle)
  const s = Math.sin(angle)
  return new Float32Array([1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1])
}

function mat4RotationY(angle) {
  const c = Math.cos(angle)
  const s = Math.sin(angle)
  return new Float32Array([c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1])
}

function mat4RotationZ(angle) {
  const c = Math.cos(angle)
  const s = Math.sin(angle)
  return new Float32Array([c, s, 0, 0, -s, c, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1])
}

function mat4Perspective(fov, aspect, near, far) {
  const f = 1 / Math.tan(fov / 2)
  const range = 1 / (near - far)
  return new Float32Array([f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (near + far) * range, -1, 0, 0, near * far * 2 * range, 0])
}

function normalize(v) {
  const length = Math.hypot(v[0], v[1], v[2]) || 1
  return [v[0] / length, v[1] / length, v[2] / length]
}

function cross(a, b) {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
}

function mat4Segment(start, end, radius) {
  const direction = [end[0] - start[0], end[1] - start[1], end[2] - start[2]]
  const length = Math.hypot(...direction)
  const up = normalize(direction)
  const helper = Math.abs(up[1]) > 0.92 ? [1, 0, 0] : [0, 1, 0]
  const right = normalize(cross(helper, up))
  const forward = normalize(cross(up, right))
  const midpoint = [(start[0] + end[0]) / 2, (start[1] + end[1]) / 2, (start[2] + end[2]) / 2]
  return new Float32Array([
    right[0] * radius, right[1] * radius, right[2] * radius, 0,
    up[0] * length / 2, up[1] * length / 2, up[2] * length / 2, 0,
    forward[0] * radius, forward[1] * radius, forward[2] * radius, 0,
    midpoint[0], midpoint[1], midpoint[2], 1,
  ])
}

function createSphere(radius = 1, lat = 40, lon = 56) {
  const positions = []
  const normals = []
  const indices = []
  for (let y = 0; y <= lat; y += 1) {
    const v = y / lat
    const phi = v * Math.PI
    for (let x = 0; x <= lon; x += 1) {
      const u = x / lon
      const theta = u * Math.PI * 2
      const nx = Math.sin(phi) * Math.cos(theta)
      const ny = Math.cos(phi)
      const nz = Math.sin(phi) * Math.sin(theta)
      positions.push(nx * radius, ny * radius, nz * radius)
      normals.push(nx, ny, nz)
    }
  }
  for (let y = 0; y < lat; y += 1) {
    for (let x = 0; x < lon; x += 1) {
      const a = y * (lon + 1) + x
      const b = a + lon + 1
      indices.push(a, b, a + 1, b, b + 1, a + 1)
    }
  }
  return { positions, normals, indices }
}

function createTorus(major = 2.2, minor = 0.03, radial = 16, tubular = 160) {
  const positions = []
  const normals = []
  const indices = []
  for (let j = 0; j <= radial; j += 1) {
    const v = j / radial * Math.PI * 2
    for (let i = 0; i <= tubular; i += 1) {
      const u = i / tubular * Math.PI * 2
      const cu = Math.cos(u)
      const su = Math.sin(u)
      const cv = Math.cos(v)
      const sv = Math.sin(v)
      positions.push((major + minor * cv) * cu, minor * sv, (major + minor * cv) * su)
      normals.push(cv * cu, sv, cv * su)
    }
  }
  for (let j = 0; j < radial; j += 1) {
    for (let i = 0; i < tubular; i += 1) {
      const a = j * (tubular + 1) + i
      const b = (j + 1) * (tubular + 1) + i
      indices.push(a, b, a + 1, b, b + 1, a + 1)
    }
  }
  return { positions, normals, indices }
}

function createCylinder(radial = 24) {
  const positions = []
  const normals = []
  const indices = []
  for (let y = 0; y <= 1; y += 1) {
    const py = y * 2 - 1
    for (let i = 0; i <= radial; i += 1) {
      const angle = i / radial * Math.PI * 2
      const x = Math.cos(angle)
      const z = Math.sin(angle)
      positions.push(x, py, z)
      normals.push(x, 0, z)
    }
  }
  for (let i = 0; i < radial; i += 1) {
    const a = i
    const b = i + radial + 1
    indices.push(a, b, a + 1, b, b + 1, a + 1)
  }
  return { positions, normals, indices }
}

function createMesh(gl, geometry) {
  const vao = gl.createVertexArray()
  gl.bindVertexArray(vao)
  const positionBuffer = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(geometry.positions), gl.STATIC_DRAW)
  gl.enableVertexAttribArray(0)
  gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0)
  const normalBuffer = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, normalBuffer)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(geometry.normals), gl.STATIC_DRAW)
  gl.enableVertexAttribArray(1)
  gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0)
  const indexBuffer = gl.createBuffer()
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer)
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint32Array(geometry.indices), gl.STATIC_DRAW)
  gl.bindVertexArray(null)
  return { vao, count: geometry.indices.length, buffers: [positionBuffer, normalBuffer, indexBuffer] }
}

function createParticles(gl, count = 170) {
  const data = []
  for (let i = 0; i < count; i += 1) {
    const angle = i * 2.399963
    const radius = 2.0 + (i % 17) / 17 * 2.2
    const y = ((i * 37) % 100) / 100 * 5.0 - 2.5
    const z = Math.sin(angle * 1.7) * 1.55 + ((i % 9) - 4) * 0.08
    data.push(Math.cos(angle) * radius, y, z, 7 + (i % 5) * 2.6)
  }
  const vao = gl.createVertexArray()
  gl.bindVertexArray(vao)
  const buffer = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STATIC_DRAW)
  gl.enableVertexAttribArray(0)
  gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 16, 0)
  gl.enableVertexAttribArray(1)
  gl.vertexAttribPointer(1, 1, gl.FLOAT, false, 16, 12)
  gl.bindVertexArray(null)
  return { vao, buffer, count }
}

function CalloutCard({ item }) {
  const Icon = item.icon
  return (
    <>
      <div className={`pointer-events-none absolute z-0 hidden h-px xl:block ${item.line}`} />
      <span className={`pointer-events-none absolute z-10 hidden h-1.5 w-1.5 rounded-full xl:block ${item.anchor}`} />
      <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.55, delay: 0.18, ease: 'easeOut' }} className={`pointer-events-none absolute z-40 hidden w-[210px] select-none rounded-2xl border border-white/12 bg-[#06101f]/95 px-4 py-3 shadow-[0_22px_65px_rgba(0,0,0,0.46)] backdrop-blur-xl xl:block ${item.position}`}>
        <div className="flex items-center gap-3">
          <div className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl border ${item.accent}`}><Icon size={18} /></div>
          <div><p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/90">{item.title}</p><p className="mt-1 text-xs leading-5 text-white/62">{item.text}</p></div>
        </div>
      </motion.div>
    </>
  )
}

function WebGLCore({ reducedMotion, onUnavailable }) {
  const canvasRef = useRef(null)
  const pointerRef = useRef({ x: 0, y: 0, targetX: 0, targetY: 0 })

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return undefined
    const gl = canvas.getContext('webgl2', { alpha: true, antialias: true, premultipliedAlpha: false })
    if (!gl) { onUnavailable(); return undefined }
    let frameId = 0
    let disposed = false
    let meshProgram
    let pointProgram
    try {
      meshProgram = createProgram(gl, MESH_VERTEX, MESH_FRAGMENT)
      pointProgram = createProgram(gl, POINT_VERTEX, POINT_FRAGMENT)
    } catch (error) {
      console.error('Yui Core WebGL:', error)
      onUnavailable()
      return undefined
    }

    const sphere = createMesh(gl, createSphere())
    const torusA = createMesh(gl, createTorus(2.28, 0.032))
    const torusB = createMesh(gl, createTorus(2.02, 0.026))
    const torusC = createMesh(gl, createTorus(2.48, 0.022))
    const cylinder = createMesh(gl, createCylinder())
    const jointSphere = createMesh(gl, createSphere(1, 20, 28))
    const particles = createParticles(gl)
    const meshUniforms = {
      model: gl.getUniformLocation(meshProgram, 'uModel'), viewProjection: gl.getUniformLocation(meshProgram, 'uViewProjection'), color: gl.getUniformLocation(meshProgram, 'uColor'), camera: gl.getUniformLocation(meshProgram, 'uCamera'), light: gl.getUniformLocation(meshProgram, 'uLight'), time: gl.getUniformLocation(meshProgram, 'uTime'), opacity: gl.getUniformLocation(meshProgram, 'uOpacity'), material: gl.getUniformLocation(meshProgram, 'uMaterial'),
    }
    const pointUniforms = { viewProjection: gl.getUniformLocation(pointProgram, 'uViewProjection'), time: gl.getUniformLocation(pointProgram, 'uTime') }
    gl.enable(gl.DEPTH_TEST)
    gl.depthFunc(gl.LEQUAL)
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)
    gl.clearColor(0, 0, 0, 0)
    const camera = [0, 0, 7.2]
    const light = [-3.4, 4.2, 5.4]
    const colors = { core: [0.08, 0.36, 0.98], shell: [0.22, 0.72, 1], cyan: [0.14, 0.83, 1], green: [0.21, 0.95, 0.72], violet: [0.6, 0.38, 1], glyph: [0.36, 0.87, 1] }

    function resize() {
      const rect = canvas.getBoundingClientRect()
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const width = Math.max(1, Math.round(rect.width * dpr))
      const height = Math.max(1, Math.round(rect.height * dpr))
      if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; gl.viewport(0, 0, width, height) }
      return width / height
    }

    function drawMesh(mesh, model, color, material, opacity) {
      gl.useProgram(meshProgram)
      gl.uniformMatrix4fv(meshUniforms.model, false, model)
      gl.uniform3fv(meshUniforms.color, color)
      gl.uniform1f(meshUniforms.material, material)
      gl.uniform1f(meshUniforms.opacity, opacity)
      gl.bindVertexArray(mesh.vao)
      gl.drawElements(gl.TRIANGLES, mesh.count, gl.UNSIGNED_INT, 0)
    }

    const observer = new ResizeObserver(resize)
    observer.observe(canvas)
    function render(now) {
      if (disposed) return
      const time = now * 0.001
      const aspect = resize()
      const projection = mat4Perspective(Math.PI / 4.25, aspect, 0.1, 100)
      const viewProjection = mat4Multiply(projection, mat4Translation(0, 0, -camera[2]))
      const pointer = pointerRef.current
      pointer.x += (pointer.targetX - pointer.x) * 0.045
      pointer.y += (pointer.targetY - pointer.y) * 0.045
      const rootRotation = mat4Multiply(mat4RotationY(pointer.x * 0.28), mat4RotationX(pointer.y * 0.2))
      const breathing = reducedMotion ? 1 : 1 + Math.sin(time * 1.1) * 0.012
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
      gl.useProgram(meshProgram)
      gl.uniformMatrix4fv(meshUniforms.viewProjection, false, viewProjection)
      gl.uniform3fv(meshUniforms.camera, camera)
      gl.uniform3fv(meshUniforms.light, light)
      gl.uniform1f(meshUniforms.time, time)
      drawMesh(sphere, mat4Multiply(rootRotation, mat4Scale(1.42 * breathing, 1.42 * breathing, 1.42 * breathing)), colors.core, 0, 0.98)
      gl.depthMask(false)
      drawMesh(sphere, mat4Multiply(rootRotation, mat4Scale(1.51 * breathing, 1.51 * breathing, 1.51 * breathing)), colors.shell, 3, 0.42)
      const spin = reducedMotion ? 0 : time
      drawMesh(torusA, mat4Multiply(rootRotation, mat4Multiply(mat4RotationY(spin * 0.16), mat4Multiply(mat4RotationX(0.68), mat4RotationZ(0.15)))), colors.cyan, 1, 0.94)
      drawMesh(torusB, mat4Multiply(rootRotation, mat4Multiply(mat4RotationY(-spin * 0.12), mat4Multiply(mat4RotationX(-0.78), mat4RotationZ(1.02)))), colors.green, 1, 0.82)
      drawMesh(torusC, mat4Multiply(rootRotation, mat4Multiply(mat4RotationY(spin * 0.09), mat4Multiply(mat4RotationX(1.18), mat4RotationZ(-0.48)))), colors.violet, 1, 0.7)
      const glyphRoot = mat4Multiply(rootRotation, mat4Translation(0, -0.02, 1.08))
      const joint = [0, 0.15, 0]
      const upperLeft = [-0.58, 0.78, 0]
      const upperRight = [0.58, 0.78, 0]
      const lower = [0, -0.82, 0]
      const segmentPulse = reducedMotion ? 0.112 : 0.112 + Math.sin(time * 2.4) * 0.006
      ;[mat4Segment(joint, upperLeft, segmentPulse), mat4Segment(joint, upperRight, segmentPulse), mat4Segment(joint, lower, segmentPulse)].forEach((segment) => drawMesh(cylinder, mat4Multiply(glyphRoot, segment), colors.glyph, 2, 1))
      const nodeScale = mat4Scale(0.17, 0.17, 0.17)
      ;[joint, upperLeft, upperRight, lower].forEach((point) => drawMesh(jointSphere, mat4Multiply(glyphRoot, mat4Multiply(mat4Translation(...point), nodeScale)), colors.glyph, 2, 1))
      gl.depthMask(true)
      gl.useProgram(pointProgram)
      gl.uniformMatrix4fv(pointUniforms.viewProjection, false, viewProjection)
      gl.uniform1f(pointUniforms.time, time)
      gl.bindVertexArray(particles.vao)
      gl.drawArrays(gl.POINTS, 0, particles.count)
      gl.bindVertexArray(null)
      frameId = requestAnimationFrame(render)
    }
    frameId = requestAnimationFrame(render)
    return () => {
      disposed = true
      cancelAnimationFrame(frameId)
      observer.disconnect()
      gl.deleteProgram(meshProgram)
      gl.deleteProgram(pointProgram)
      ;[sphere, torusA, torusB, torusC, cylinder, jointSphere].forEach((mesh) => { gl.deleteVertexArray(mesh.vao); mesh.buffers.forEach((buffer) => gl.deleteBuffer(buffer)) })
      gl.deleteVertexArray(particles.vao)
      gl.deleteBuffer(particles.buffer)
    }
  }, [onUnavailable, reducedMotion])

  const handlePointerMove = (event) => {
    if (reducedMotion) return
    const rect = event.currentTarget.getBoundingClientRect()
    pointerRef.current.targetX = ((event.clientX - rect.left) / rect.width - 0.5) * 2
    pointerRef.current.targetY = ((event.clientY - rect.top) / rect.height - 0.5) * -2
  }

  return <canvas ref={canvasRef} onPointerMove={handlePointerMove} onPointerLeave={() => { pointerRef.current.targetX = 0; pointerRef.current.targetY = 0 }} className="absolute inset-0 h-full w-full cursor-default" aria-label="Yui Core tridimensional com núcleo, órbitas e partículas" />
}

function StaticFallback() {
  return <div className="absolute inset-0 flex items-center justify-center"><div className="relative h-[330px] w-[330px] rounded-full border border-cyan-100/25 bg-[radial-gradient(circle_at_30%_22%,rgba(255,255,255,.28),rgba(36,126,255,.36)_30%,rgba(4,16,56,.96)_76%)] shadow-[0_0_100px_rgba(41,137,255,.55),inset_0_0_64px_rgba(255,255,255,.1)]"><span className="absolute inset-0 flex items-center justify-center font-display text-[148px] font-black text-cyan-50 drop-shadow-[0_0_30px_rgba(125,220,255,.9)]">Y</span></div></div>
}

export default function YuiCoreHero() {
  const reducedMotion = useReducedMotion()
  const [unavailable, setUnavailable] = useState(false)
  const markUnavailable = useRef(() => setUnavailable(true)).current
  return (
    <div className="relative mx-auto h-[500px] w-full max-w-[840px] select-none sm:h-[570px] xl:h-[615px]">
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-[78%] w-[82%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(34,145,255,.22),rgba(77,52,205,.1)_42%,transparent_72%)] blur-3xl" />
      {CALLOUTS.map((item) => <CalloutCard key={item.title} item={item} />)}
      <div className="absolute inset-[1%] z-20">{unavailable ? <StaticFallback /> : <WebGLCore reducedMotion={reducedMotion} onUnavailable={markUnavailable} />}</div>
      <motion.div className="pointer-events-none absolute bottom-[6%] left-1/2 z-40 flex -translate-x-1/2 items-center gap-2 whitespace-nowrap rounded-full border border-white/12 bg-[#06101f]/88 px-4 py-2 text-[9px] uppercase tracking-[0.2em] text-white/64 shadow-[0_12px_36px_rgba(0,0,0,0.32)] backdrop-blur-md sm:text-[10px]" animate={reducedMotion ? undefined : { opacity: [0.72, 1, 0.72] }} transition={{ duration: 3.4, repeat: Infinity, ease: 'easeInOut' }}><Sparkles size={13} className="text-cyan-200" />Yui Core · cena WebGL tridimensional</motion.div>
    </div>
  )
}

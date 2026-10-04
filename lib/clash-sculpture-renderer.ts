import { CLASH_BRAND } from "./clash-brand";

type Point = [number, number, number];
type Face = { points: Point[]; material: number };

const subtract = (a: Point, b: Point): Point => a.map((value, axis) => value - b[axis]) as Point;
const cross = (a: Point, b: Point): Point => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: Point, b: Point) => a.reduce((sum, value, axis) => sum + value * b[axis], 0);
const unit = (point: Point): Point => point.map(value => value / Math.hypot(...point)) as Point;

function foldedSolid(outline: Point[], ridge: Point, material: number): Face[] {
  const center = outline.reduce((sum, point) => sum.map((value, axis) => value + point[axis] / outline.length) as Point, [0, 0, 0] as Point);
  const inset = (point: Point, z: number): Point => [center[0] + (point[0] - center[0]) * .976, center[1] + (point[1] - center[1]) * .976, z];
  const front = outline.map(point => inset(point, point[2] + 2));
  const back = outline.map(([x, y, z]): Point => [x, y, z - 40]);
  const backInset = back.map(point => inset(point, point[2] - 2));
  const faces = outline.flatMap((point, index): Face[] => {
    const next = (index + 1) % outline.length;
    return [
      { points: [front[index], front[next], ridge], material },
      { points: [point, outline[next], front[next], front[index]], material },
      { points: [back[index], back[next], outline[next], point], material },
      { points: [backInset[index], backInset[next], back[next], back[index]], material },
    ];
  });
  faces.push({ points: backInset, material });
  const interior: Point = [center[0], center[1], -2];
  return faces.map(face => {
    const normal = cross(subtract(face.points[1], face.points[0]), subtract(face.points[2], face.points[0]));
    return dot(normal, subtract(face.points[0], interior)) < 0 ? { ...face, points: [...face.points].reverse() } : face;
  });
}

function geometry() {
  const vertices: number[] = [];
  const push = (position: Point, normal: Point, material: number) => vertices.push(...position, ...normal, material);
  const crownedFace = (a: Point, b: Point, c: Point, material: number) => {
    const across = subtract(b,a), down = subtract(c,a);
    const normal = unit(cross(across,down));
    const divisions = 12;
    const curvature = material === 1 ? 3.5 : 1.1;
    const sample = (i: number,j: number) => {
      const u = i/divisions, v = j/divisions, w = 1-u-v;
      // A gently crowned glaze surface catches a continuous reflection across each fold.
      const crown = curvature*27*u*v*w;
      const position = a.map((value,axis) => value + across[axis]*u + down[axis]*v + normal[axis]*crown) as Point;
      const tangentU = across.map((value,axis) => value + normal[axis]*curvature*27*v*(1-2*u-v)) as Point;
      const tangentV = down.map((value,axis) => value + normal[axis]*curvature*27*u*(1-u-2*v)) as Point;
      push(position,unit(cross(tangentU,tangentV)),material);
    };
    for (let i = 0; i < divisions; i++) for (let j = 0; j < divisions-i; j++) {
      sample(i,j); sample(i+1,j); sample(i,j+1);
      if (i+j < divisions-1) { sample(i+1,j); sample(i+1,j+1); sample(i,j+1); }
    }
  };
  const faces = [
    ...foldedSolid([[-12, -171, 18], [-152, -18, 18], [-22, 87, 18]], [-16, -32, 52], 0),
    ...foldedSolid([[28, -76, 18], [166, 30, 18], [20, 179, 18]], [25, 45, 52], 1),
  ];
  for (const face of faces) {
    const normal = unit(cross(subtract(face.points[1], face.points[0]), subtract(face.points[2], face.points[0])));
    for (let i = 1; i < face.points.length - 1; i++) {
      if (face.points.length === 3) {
        crownedFace(face.points[0],face.points[i],face.points[i+1],face.material);
        continue;
      }
      for (const point of [face.points[0], face.points[i], face.points[i + 1]]) push(point, normal, face.material);
    }
  }
  const pointAt = (latitude: number, longitude: number): Point => [Math.sin(latitude) * Math.cos(longitude), Math.cos(latitude), Math.sin(latitude) * Math.sin(longitude)];
  for (let row = 0; row < 24; row++) {
    for (let col = 0; col < 40; col++) {
      const a = pointAt(row * Math.PI / 24, col * Math.PI / 20);
      const b = pointAt((row + 1) * Math.PI / 24, col * Math.PI / 20);
      const c = pointAt((row + 1) * Math.PI / 24, (col + 1) * Math.PI / 20);
      const d = pointAt(row * Math.PI / 24, (col + 1) * Math.PI / 20);
      for (const normal of [a, c, b, a, d, c]) push(normal.map(value => value * 19) as Point, normal, 2);
    }
  }
  return new Float32Array(vertices);
}

const vertexSource = `
attribute vec3 aPosition;
attribute vec3 aNormal;
attribute float aMaterial;
uniform vec3 uAngles;
uniform float uSphereY;
varying vec3 vPosition;
varying vec3 vNormal;
varying vec3 vLocal;
varying float vMaterial;
vec3 rotate(vec3 p) {
  vec3 c = cos(uAngles), s = sin(uAngles);
  p = vec3(p.x*c.y+p.z*s.y, p.y, p.z*c.y-p.x*s.y);
  p = vec3(p.x, p.y*c.x-p.z*s.x, p.y*s.x+p.z*c.x);
  return vec3(p.x*c.z-p.y*s.z, p.x*s.z+p.y*c.z, p.z);
}
void main() {
  vec3 position = aPosition;
  if (aMaterial > 1.5) position += vec3(0., uSphereY, 52.);
  vPosition = rotate(position);
  vNormal = rotate(aNormal);
  vLocal = aPosition;
  vMaterial = aMaterial;
  float depth = 850. - vPosition.z;
  gl_Position = vec4(vPosition.x * 850./260., -(vPosition.y-2.) * 850./260., 1.105263 * depth - 210.5263, depth);
}`;

const fragmentSource = `
precision highp float;
uniform vec3 uCyan;
uniform vec3 uPurple;
varying vec3 vPosition;
varying vec3 vNormal;
varying vec3 vLocal;
varying float vMaterial;
const float PI = 3.14159265;
float noise(vec3 p) { return fract(sin(dot(p, vec3(12.9898,78.233,37.719))) * 43758.5453); }
vec3 fresnel(float angle, vec3 f0) { return f0 + (1.-f0) * pow(1.-angle,5.); }
vec3 light(vec3 n, vec3 v, vec3 l, vec3 radiance, vec3 base, float metal, float rough) {
  vec3 h = normalize(v+l);
  float nl = max(dot(n,l),0.), nv = max(dot(n,v),.001), nh = max(dot(n,h),0.);
  float alpha = rough*rough, a2 = alpha*alpha;
  float denominator = nh*nh*(a2-1.)+1.;
  float distribution = a2/(PI*denominator*denominator);
  float k = (rough+1.)*(rough+1.)/8.;
  float masking = nv/(nv*(1.-k)+k) * nl/(nl*(1.-k)+k);
  vec3 f = fresnel(max(dot(h,v),0.), mix(vec3(.04),base,metal));
  vec3 specular = distribution*masking*f/(4.*nv*max(nl,.001));
  vec3 diffuse = (1.-f)*(1.-metal)*base/PI;
  return (diffuse+specular)*radiance*nl;
}
// Analytic studio softboxes in reflected world space; rough materials blur their edges.
vec3 studio(vec3 r, float rough) {
  vec3 room = mix(vec3(.035,.045,.065),vec3(.58,.61,.65),smoothstep(-.8,.65,-r.y));
  float blur = .04 + rough*.6;
  vec3 key = normalize(vec3(-.5,-.65,.56));
  vec3 rim = normalize(vec3(.76,-.1,-.62));
  float keyBox = smoothstep(.89-blur,.98,dot(r,key));
  float rimBox = smoothstep(.94-blur*.45,.99,dot(r,rim));
  float lower = smoothstep(.95-blur,.995,dot(r,normalize(vec3(.15,.75,.6))));
  float panelBlur = .018 + rough*.48;
  float vertical = smoothstep(-.38-panelBlur,-.38+panelBlur,r.x) * (1.-smoothstep(-.12-panelBlur,-.12+panelBlur,r.x));
  vertical *= smoothstep(-.8,-.6,r.y) * (1.-smoothstep(.38,.58,r.y)) * smoothstep(.35,.7,r.z);
  float overhead = smoothstep(-.58-panelBlur,-.58+panelBlur,r.y) * (1.-smoothstep(-.44-panelBlur,-.44+panelBlur,r.y));
  overhead *= smoothstep(.3,.65,r.z);
  return room + vec3(2.6,2.5,2.35)*keyBox + vec3(1.5,1.65,1.9)*rimBox + vec3(.42,.36,.3)*lower
    + vec3(7.5,7.3,7.)*vertical + vec3(5.,5.1,5.4)*overhead;
}
void main() {
  bool aluminum = vMaterial < .5;
  bool sphere = vMaterial > 1.5;
  vec3 base = sphere ? vec3(.66,.71,.76) : pow(aluminum ? uCyan : uPurple,vec3(2.2));
  float metal = aluminum ? .92 : .0;
  float rough = aluminum ? .43 : .16;
  if (sphere) { metal = 1.; rough = .19; }
  vec3 n = normalize(vNormal);
  if (!gl_FrontFacing) n = -n;
  vec3 v = normalize(vec3(0.,0.,850.)-vPosition);
  if (aluminum) {
    float grain = noise(floor(vLocal*3.));
    float brush = noise(vec3(floor(vLocal.x*.2),floor(vLocal.y*14.),floor(vLocal.z*.2)));
    base *= .92 + grain*.06 + brush*.1;
    rough += (grain-.5)*.045;
  }
  vec3 reflection = reflect(-v,n);
  float nv = max(dot(n,v),0.);
  vec3 f0 = mix(vec3(.04),base,metal);
  vec3 f = fresnel(nv,f0);
  vec3 color = base*(1.-metal)*(.22+.16*max(-n.y,0.));
  color += studio(reflection,rough)*f*(1.-rough*.55);
  color += light(n,v,normalize(vec3(-.45,-.6,.66)),vec3(4.5,4.35,4.1),base,metal,max(rough,.28));
  color += light(n,v,normalize(vec3(.72,.2,.66)),vec3(.75,.85,1.15),base,metal,max(rough,.35));
  if (sphere) color += vec3(.02,.12,.14)*max(-n.x,0.) + vec3(.09,.035,.14)*max(n.x,0.);
  // A soft contact shade where the two folds approach the floating core.
  if (!sphere) color *= .86 + .14*smoothstep(16.,80.,length(vLocal.xy-vec2(0.,-19.)));
  color = color/(color+vec3(1.));
  gl_FragColor = vec4(pow(color,vec3(1./2.2)),1.);
}`;

/** A small GPU renderer: real surface normals, depth testing and distinct material responses. */
export function createClashSculptureRenderer(canvas: HTMLCanvasElement) {
  const gl = canvas.getContext("webgl", { alpha: true, antialias: true, premultipliedAlpha: false });
  if (!gl) return null;
  const compile = (type: number, source: string) => {
    const shader = gl.createShader(type)!;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error("Clash sculpture shader:", gl.getShaderInfoLog(shader));
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  };
  const vertex = compile(gl.VERTEX_SHADER, vertexSource);
  const fragment = compile(gl.FRAGMENT_SHADER, fragmentSource);
  if (!vertex || !fragment) {
    if (vertex) gl.deleteShader(vertex);
    if (fragment) gl.deleteShader(fragment);
    return null;
  }
  const program = gl.createProgram()!;
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error("Clash sculpture program:", gl.getProgramInfoLog(program));
    gl.deleteProgram(program);
    return null;
  }
  const vertices = geometry();
  const buffer = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
  gl.useProgram(program);
  for (const [name, size, offset] of [["aPosition",3,0],["aNormal",3,12],["aMaterial",1,24]] as const) {
    const location = gl.getAttribLocation(program, name);
    gl.enableVertexAttribArray(location);
    gl.vertexAttribPointer(location, size, gl.FLOAT, false, 28, offset);
  }
  const angles = gl.getUniformLocation(program,"uAngles");
  const sphereY = gl.getUniformLocation(program,"uSphereY");
  gl.uniform3fv(gl.getUniformLocation(program,"uCyan"),CLASH_BRAND.cyan.rgbLight.map((value,axis) => (value*.35+CLASH_BRAND.cyan.rgbDark[axis]*.65)/255));
  gl.uniform3fv(gl.getUniformLocation(program,"uPurple"),CLASH_BRAND.purple.rgbDark.map(value => value/255));
  gl.enable(gl.DEPTH_TEST);
  // The brand geometry uses screen-space Y, so projection reverses winding.
  gl.frontFace(gl.CW);
  gl.clearColor(0,0,0,0);
  return {
    draw(pitch: number, yaw: number, roll: number, coreY: number) {
      gl.viewport(0,0,canvas.width,canvas.height);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.uniform3f(angles,pitch,yaw,roll);
      gl.uniform1f(sphereY,coreY);
      gl.drawArrays(gl.TRIANGLES,0,vertices.length/7);
    },
    dispose() { gl.deleteBuffer(buffer); gl.deleteProgram(program); },
  };
}

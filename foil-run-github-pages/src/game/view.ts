import * as THREE from "three";
import { poseOnTrack, type Obstacle, type Track } from "./track";

export interface ViewPose {
  x: number;
  z: number;
  yaw: number;
  speed: number;
  time: number;
  shake: number;
  dead: boolean;
  finished: boolean;
}

const CREAM = 0xf3ecdf;
const GOLD = 0xe2a53a;
const OXIDE = 0xe24b3a;
const ROAD = 0x2a241c;
const SHOULDER = 0x17130f;
const BG = 0x100e0c;

export class RaceWorld {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(68, 1, 0.1, 900);
  private car = new THREE.Group();
  private wheels: THREE.Mesh[] = [];
  private look = new THREE.Vector3();
  private desired = new THREE.Vector3();
  private sweeps: { meshIndex: number; s: number; phase: number }[] = [];
  private sweepMesh: THREE.InstancedMesh | null = null;
  private dummy = new THREE.Object3D();
  private disposed = false;
  private exhaust: THREE.Points | null = null;
  private exhaustGeo: THREE.BufferGeometry | null = null;
  private exhaustVel: Float32Array | null = null;
  private headlightL: THREE.PointLight | null = null;
  private headlightR: THREE.PointLight | null = null;
  private skidMarks: THREE.Group | null = null;
  readonly ok: boolean;

  constructor(
    private canvas: HTMLCanvasElement,
    private track: Track,
  ) {
    let renderer: THREE.WebGLRenderer | null = null;
    try {
      renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: true,
        alpha: false,
        powerPreference: "high-performance",
      });
    } catch {
      renderer = null;
    }
    if (!renderer) {
      this.ok = false;
      this.renderer = null as unknown as THREE.WebGLRenderer;
      return;
    }
    this.ok = true;
    this.renderer = renderer;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(BG, 1);
    renderer.shadowMap.enabled = false;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;

    this.scene.fog = new THREE.Fog(BG, 36, 220);
    this.scene.background = new THREE.Color(BG);

    // Lighting
    const hemi = new THREE.HemisphereLight(0xf5e0b8, 0x1a120c, 0.85);
    const sun = new THREE.DirectionalLight(0xffe8c4, 1.55);
    sun.position.set(40, 90, 25);
    const fill = new THREE.DirectionalLight(0x6a8cff, 0.18);
    fill.position.set(-30, 20, -40);
    this.scene.add(hemi, sun, fill);

    // Ground plane with subtle variation
    const groundMat = new THREE.MeshStandardMaterial({
      color: 0x12100e,
      roughness: 1,
      metalness: 0,
    });
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(12000, 12000), groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.06;
    this.scene.add(ground);

    // Soft horizon glow
    const horizon = new THREE.Mesh(
      new THREE.CylinderGeometry(380, 380, 18, 48, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0x2a1f14,
        side: THREE.BackSide,
        transparent: true,
        opacity: 0.55,
      }),
    );
    horizon.position.y = 4;
    this.scene.add(horizon);

    this.scene.add(buildRibbon(track, track.width + 6.2, 0.01, SHOULDER));
    this.scene.add(buildRibbon(track, track.width, 0.045, ROAD));
    this.scene.add(buildDashes(track));
    this.addBarriers();
    this.addObstacles();
    this.addGates();
    this.buildCar();
    this.buildExhaust();
    this.scene.add(this.car);
    this.resize();
  }

  resize() {
    if (!this.ok) return;
    const parent = this.canvas.parentElement;
    const w = parent?.clientWidth || this.canvas.clientWidth || 800;
    const h = parent?.clientHeight || this.canvas.clientHeight || 450;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = Math.max(0.4, w / Math.max(1, h));
    this.camera.updateProjectionMatrix();
  }

  update(dt: number, pose: ViewPose) {
    if (!this.ok || this.disposed) return;
    const fx = -Math.sin(pose.yaw);
    const fz = -Math.cos(pose.yaw);
    this.car.position.set(pose.x, 0, pose.z);
    this.car.rotation.y = pose.yaw + Math.PI;
    const spin = pose.speed * dt * 0.55;
    for (const w of this.wheels) w.rotation.x += spin;

    // Exhaust particles
    if (this.exhaust && this.exhaustGeo && this.exhaustVel) {
      const pos = this.exhaustGeo.attributes.position as THREE.BufferAttribute;
      const arr = pos.array as Float32Array;
      const n = arr.length / 3;
      const backX = pose.x + Math.sin(pose.yaw) * 1.55;
      const backZ = pose.z + Math.cos(pose.yaw) * 1.55;
      const emit = Math.min(1, Math.abs(pose.speed) / 18);
      for (let i = 0; i < n; i++) {
        const i3 = i * 3;
        arr[i3]! += this.exhaustVel[i3]! * dt;
        arr[i3 + 1]! += this.exhaustVel[i3 + 1]! * dt;
        arr[i3 + 2]! += this.exhaustVel[i3 + 2]! * dt;
        this.exhaustVel[i3 + 1]! -= 1.8 * dt;
        // recycle
        if (arr[i3 + 1]! < 0.05 || Math.random() < 0.04 * emit) {
          const side = (Math.random() - 0.5) * 0.55;
          arr[i3] = backX + side * Math.cos(pose.yaw);
          arr[i3 + 1] = 0.28 + Math.random() * 0.12;
          arr[i3 + 2] = backZ + side * Math.sin(pose.yaw);
          this.exhaustVel[i3] = (Math.random() - 0.5) * 1.2 + Math.sin(pose.yaw) * (1.5 + emit * 3);
          this.exhaustVel[i3 + 1] = 0.6 + Math.random() * 1.4;
          this.exhaustVel[i3 + 2] = (Math.random() - 0.5) * 1.2 + Math.cos(pose.yaw) * (1.5 + emit * 3);
        }
      }
      pos.needsUpdate = true;
      const mat = this.exhaust.material as THREE.PointsMaterial;
      mat.opacity = 0.22 + emit * 0.35;
    }

    // Headlight intensity follows speed a bit
    if (this.headlightL && this.headlightR) {
      const inten = 0.9 + Math.min(1.4, Math.abs(pose.speed) * 0.035);
      this.headlightL.intensity = inten;
      this.headlightR.intensity = inten;
    }

    const dist = 11.2 + Math.min(14, Math.abs(pose.speed) * 0.075);
    const height = 4.6 + Math.min(3.6, Math.abs(pose.speed) * 0.022);
    this.desired.set(pose.x - fx * dist, height, pose.z - fz * dist);
    const k = 1 - Math.exp(-5.8 * Math.max(0.001, dt));
    if (this.camera.position.lengthSq() < 1) this.camera.position.copy(this.desired);
    this.camera.position.lerp(this.desired, k);
    const shake = pose.shake;
    if (shake > 0) {
      this.camera.position.x += (Math.random() - 0.5) * shake * 0.48;
      this.camera.position.y += (Math.random() - 0.5) * shake * 0.28;
    }
    this.look.set(pose.x + fx * 9, 1.2, pose.z + fz * 9);
    this.camera.lookAt(this.look);
    this.camera.fov = 64 + Math.min(24, Math.abs(pose.speed) * 0.24);
    this.camera.updateProjectionMatrix();

    if (this.sweepMesh) {
      for (const sw of this.sweeps) {
        const lat = Math.sin(pose.time * 1.35 + sw.phase) * (this.track.width * 0.36);
        const p = poseOnTrack(this.track, sw.s, lat);
        this.dummy.position.set(p.x, 0.7, p.z);
        this.dummy.rotation.set(0, p.yaw, pose.time * 3 + sw.phase);
        this.dummy.scale.set(1, 1, 1);
        this.dummy.updateMatrix();
        this.sweepMesh.setMatrixAt(sw.meshIndex, this.dummy.matrix);
      }
      this.sweepMesh.instanceMatrix.needsUpdate = true;
    }

    const fog = this.scene.fog as THREE.Fog;
    if (pose.dead) fog.color.setHex(0x3a1410);
    else if (pose.finished) fog.color.setHex(0x3a2c12);
    else fog.color.setHex(BG);

    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.disposed = true;
    if (!this.ok) return;
    this.scene.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      const mat = mesh.material;
      if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
      else mat?.dispose();
    });
    this.renderer.dispose();
  }

  private buildCar() {
    const bodyMat = new THREE.MeshStandardMaterial({
      color: CREAM,
      roughness: 0.38,
      metalness: 0.22,
    });
    const goldMat = new THREE.MeshStandardMaterial({
      color: GOLD,
      roughness: 0.28,
      metalness: 0.55,
      emissive: 0x3a2808,
      emissiveIntensity: 0.15,
    });
    const oxideMat = new THREE.MeshStandardMaterial({
      color: OXIDE,
      roughness: 0.32,
      metalness: 0.35,
      emissive: 0x4a1208,
      emissiveIntensity: 0.25,
    });
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x14110e, roughness: 0.55, metalness: 0.3 });
    const glassMat = new THREE.MeshStandardMaterial({
      color: 0x1a2838,
      roughness: 0.08,
      metalness: 0.85,
      transparent: true,
      opacity: 0.72,
    });
    const chromeMat = new THREE.MeshStandardMaterial({
      color: 0xc8c0b0,
      roughness: 0.18,
      metalness: 0.92,
    });

    // Main body
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.58, 0.38, 3.25), bodyMat);
    body.position.set(0, 0.52, 0);
    // Slightly tapered cabin
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.22, 0.38, 1.35), goldMat);
    cabin.position.set(0, 0.92, -0.18);
    // Nose / splitter
    const nose = new THREE.Mesh(new THREE.BoxGeometry(1.42, 0.14, 0.42), oxideMat);
    nose.position.set(0, 0.42, 1.58);
    // Rear wing
    const wing = new THREE.Mesh(new THREE.BoxGeometry(1.48, 0.08, 0.38), oxideMat);
    wing.position.set(0, 1.05, -1.45);
    const wingPostsL = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.28, 0.08), darkMat);
    wingPostsL.position.set(-0.55, 0.9, -1.4);
    const wingPostsR = wingPostsL.clone();
    wingPostsR.position.x = 0.55;
    // Side skirts
    const skirtL = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.18, 2.6), darkMat);
    skirtL.position.set(-0.82, 0.28, 0.05);
    const skirtR = skirtL.clone();
    skirtR.position.x = 0.82;
    // Windshield
    const glass = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.28, 0.9), glassMat);
    glass.position.set(0, 1.02, 0.25);
    // Headlights
    const hlGeo = new THREE.BoxGeometry(0.28, 0.12, 0.08);
    const hlL = new THREE.Mesh(hlGeo, chromeMat);
    hlL.position.set(-0.48, 0.52, 1.62);
    const hlR = hlL.clone();
    hlR.position.x = 0.48;
    // Taillights
    const tlMat = new THREE.MeshStandardMaterial({
      color: OXIDE,
      emissive: OXIDE,
      emissiveIntensity: 0.8,
      roughness: 0.3,
    });
    const tlL = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.1, 0.06), tlMat);
    tlL.position.set(-0.5, 0.58, -1.62);
    const tlR = tlL.clone();
    tlR.position.x = 0.5;

    this.car.add(body, cabin, nose, wing, wingPostsL, wingPostsR, skirtL, skirtR, glass, hlL, hlR, tlL, tlR);

    // Point lights as headlights
    this.headlightL = new THREE.PointLight(0xfff0d0, 1.1, 28, 1.6);
    this.headlightL.position.set(-0.45, 0.55, 1.9);
    this.headlightR = new THREE.PointLight(0xfff0d0, 1.1, 28, 1.6);
    this.headlightR.position.set(0.45, 0.55, 1.9);
    this.car.add(this.headlightL, this.headlightR);

    // Wheels
    const geo = new THREE.CylinderGeometry(0.34, 0.34, 0.26, 12);
    geo.rotateZ(Math.PI / 2);
    for (const [x, z] of [
      [-0.8, 1.08],
      [0.8, 1.08],
      [-0.8, -1.08],
      [0.8, -1.08],
    ] as const) {
      const wheel = new THREE.Mesh(geo, darkMat);
      wheel.position.set(x, 0.34, z);
      this.wheels.push(wheel);
      this.car.add(wheel);
      // simple rim accent
      const rim = new THREE.Mesh(
        new THREE.CylinderGeometry(0.16, 0.16, 0.28, 8),
        chromeMat,
      );
      rim.rotation.z = Math.PI / 2;
      rim.position.set(x, 0.34, z);
      this.car.add(rim);
    }
  }

  private buildExhaust() {
    const n = 48;
    const positions = new Float32Array(n * 3);
    this.exhaustVel = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      positions[i * 3] = 0;
      positions[i * 3 + 1] = -10;
      positions[i * 3 + 2] = 0;
    }
    this.exhaustGeo = new THREE.BufferGeometry();
    this.exhaustGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      color: 0xc8b090,
      size: 0.22,
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
      sizeAttenuation: true,
    });
    this.exhaust = new THREE.Points(this.exhaustGeo, mat);
    this.scene.add(this.exhaust);
  }

  private addBarriers() {
    const posts: { s: number; side: number }[] = [];
    for (let s = 0; s <= this.track.length; s += 14) posts.push({ s, side: 1 }, { s, side: -1 });
    const mesh = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.32, 1.05, 0.65),
      new THREE.MeshStandardMaterial({
        color: OXIDE,
        roughness: 0.48,
        metalness: 0.25,
        emissive: 0x2a0a06,
        emissiveIntensity: 0.15,
      }),
      posts.length,
    );
    posts.forEach((post, i) => {
      const p = poseOnTrack(this.track, post.s, post.side * (this.track.width / 2 + 0.42));
      this.dummy.position.set(p.x, 0.55, p.z);
      this.dummy.rotation.set(0, p.yaw, 0);
      this.dummy.scale.set(1, 1, 1);
      this.dummy.updateMatrix();
      mesh.setMatrixAt(i, this.dummy.matrix);
    });
    this.scene.add(mesh);

    // Rail between posts for a more solid barrier feel
    const railMat = new THREE.MeshStandardMaterial({
      color: 0x3a2e24,
      roughness: 0.6,
      metalness: 0.2,
    });
    for (const side of [-1, 1]) {
      const rail = buildRibbon(this.track, 0.22, 0.72, 0x3a2e24);
      // offset laterally
      const pts = this.track.points;
      const positions: number[] = [];
      const indices: number[] = [];
      const half = 0.12;
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i]!;
        const lat = side * (this.track.width / 2 + 0.42);
        const rx = Math.cos(p.yaw);
        const rz = -Math.sin(p.yaw);
        const cx = p.x + rx * lat;
        const cz = p.z + rz * lat;
        positions.push(cx + rx * half, 0.72, cz + rz * half);
        positions.push(cx - rx * half, 0.72, cz - rz * half);
        if (i > 0) {
          const b = i * 2;
          indices.push(b - 2, b - 1, b, b - 1, b + 1, b);
        }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
      geo.setIndex(indices);
      geo.computeVertexNormals();
      this.scene.add(new THREE.Mesh(geo, railMat));
    }
  }

  private addObstacles() {
    const groups: Record<string, Obstacle[]> = { crate: [], sweep: [], oil: [], bump: [] };
    for (const o of this.track.obstacles) groups[o.kind]!.push(o);
    this.addKind(groups.crate!, new THREE.BoxGeometry(2.15, 1.35, 2.15), 0.72, OXIDE, 0.2);
    this.addKind(groups.bump!, new THREE.BoxGeometry(2.5, 0.3, 1.35), 0.2, GOLD, 0.35);
    this.addKind(groups.oil!, new THREE.CylinderGeometry(1.05, 1.05, 0.05, 16), 0.04, 0x161412, 0);
    const sweeps = groups.sweep!;
    if (sweeps.length) {
      const mesh = new THREE.InstancedMesh(
        new THREE.BoxGeometry(3.15, 0.38, 0.48),
        new THREE.MeshStandardMaterial({
          color: GOLD,
          emissive: 0x5a3e10,
          roughness: 0.32,
          metalness: 0.5,
        }),
        sweeps.length,
      );
      sweeps.forEach((o, i) => {
        this.sweeps.push({ meshIndex: i, s: o.s, phase: o.phase });
      });
      this.sweepMesh = mesh;
      this.scene.add(mesh);
    }
  }

  private addKind(
    list: Obstacle[],
    geo: THREE.BufferGeometry,
    y: number,
    color: number,
    metal: number,
  ) {
    if (!list.length) return;
    const mesh = new THREE.InstancedMesh(
      geo,
      new THREE.MeshStandardMaterial({
        color,
        roughness: 0.48,
        metalness: metal,
        emissive: color === OXIDE ? 0x2a0806 : 0x000000,
        emissiveIntensity: color === OXIDE ? 0.12 : 0,
      }),
      list.length,
    );
    list.forEach((o, i) => {
      const lat = o.lat * (this.track.width / 2);
      const p = poseOnTrack(this.track, o.s, lat);
      this.dummy.position.set(p.x, y, p.z);
      this.dummy.rotation.set(0, p.yaw, 0);
      this.dummy.scale.set(1, 1, 1);
      this.dummy.updateMatrix();
      mesh.setMatrixAt(i, this.dummy.matrix);
    });
    this.scene.add(mesh);
  }

  private addGates() {
    const mat = new THREE.MeshStandardMaterial({
      color: GOLD,
      emissive: 0x6a4a12,
      roughness: 0.28,
      metalness: 0.55,
    });
    for (const s of [0, this.track.length - 6]) {
      const left = poseOnTrack(this.track, s, -this.track.width / 2);
      const right = poseOnTrack(this.track, s, this.track.width / 2);
      const mid = poseOnTrack(this.track, s, 0);
      for (const p of [left, right]) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.42, 3.4, 0.42), mat);
        post.position.set(p.x, 1.7, p.z);
        this.scene.add(post);
      }
      const bar = new THREE.Mesh(new THREE.BoxGeometry(this.track.width, 0.3, 0.3), mat);
      bar.position.set(mid.x, 3.25, mid.z);
      bar.rotation.y = mid.yaw;
      this.scene.add(bar);
      // hanging lights
      const lightMat = new THREE.MeshStandardMaterial({
        color: 0xfff0c0,
        emissive: 0xffd080,
        emissiveIntensity: 1.2,
        roughness: 0.2,
      });
      for (const lat of [-this.track.width * 0.28, 0, this.track.width * 0.28]) {
        const lp = poseOnTrack(this.track, s, lat);
        const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 8), lightMat);
        bulb.position.set(lp.x, 3.05, lp.z);
        this.scene.add(bulb);
      }
    }
  }
}

function buildRibbon(track: Track, width: number, y: number, color: number) {
  const pts = track.points;
  const positions: number[] = [];
  const indices: number[] = [];
  const half = width / 2;
  for (let i = 0; i < pts.length; i += 1) {
    const p = pts[i]!;
    const rx = Math.cos(p.yaw);
    const rz = -Math.sin(p.yaw);
    positions.push(p.x + rx * half, y, p.z + rz * half);
    positions.push(p.x - rx * half, y, p.z - rz * half);
    if (i > 0) {
      const b = i * 2;
      indices.push(b - 2, b - 1, b, b - 1, b + 1, b);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(
    geo,
    new THREE.MeshStandardMaterial({ color, roughness: 0.9, metalness: 0.03 }),
  );
  return mesh;
}

function buildDashes(track: Track) {
  const count = Math.floor(track.length / 12);
  const mesh = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.2, 0.045, 2.4),
    new THREE.MeshStandardMaterial({
      color: GOLD,
      roughness: 0.35,
      emissive: 0x3a2a0c,
      emissiveIntensity: 0.35,
    }),
    count,
  );
  const dummy = new THREE.Object3D();
  for (let i = 0; i < count; i += 1) {
    const p = poseOnTrack(track, i * 12 + 5, 0);
    dummy.position.set(p.x, 0.08, p.z);
    dummy.rotation.set(0, p.yaw, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  }
  return mesh;
}

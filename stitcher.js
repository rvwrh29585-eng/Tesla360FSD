import * as THREE from "https://cdnjs.cloudflare.com/ajax/libs/three.js/0.180.0/three.module.min.js";
import { OrbitControls } from "./OrbitControls.js";
import { state, CAMS, RAD } from "./state.js";
import { updateVisForCurrentTime, getCurrentSpeed } from "./telemetry.js";
import { calculateCameraMotion, applySphereMotion, resetMotionEffects, calculateAutoSteerYaw } from "./motionEffects.js";

function createVideoElement(src) {
  const video = document.createElement("video");
  video.src = src;
  video.crossOrigin = "anonymous";
  video.playsInline = true;
  video.muted = true;
  video.loop = true;
  video.preload = "auto";
  video.style.display = "none";
  document.body.appendChild(video);
  return video;
}

function waitForCanPlay(video) {
  return new Promise((resolve, reject) => {
    const onCanPlay = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error(`Failed to load ${video.src}`));
    };
    const cleanup = () => {
      video.removeEventListener("canplaythrough", onCanPlay);
      video.removeEventListener("error", onError);
    };
    video.addEventListener("canplaythrough", onCanPlay, { once: true });
    video.addEventListener("error", onError, { once: true });
  });
}

function computeVerticalFov(hfovRad, aspect) {
  return 2 * Math.atan(Math.tan(hfovRad / 2) / aspect);
}

function buildTexturesAndUniforms() {
  if (!state.transparentTexture) {
    state.transparentTexture = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1);
    state.transparentTexture.needsUpdate = true;
  }

  state.videoTextures = state.videoElements.map((video) => {
    if (video) {
      const tex = new THREE.VideoTexture(video);
      tex.minFilter = THREE.LinearFilter;
      tex.magFilter = THREE.LinearFilter;
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.generateMipmaps = false;
      tex.wrapS = THREE.ClampToEdgeWrapping;
      tex.wrapT = THREE.ClampToEdgeWrapping;
      return tex;
    }
    return state.transparentTexture;
  });

  const yawArr = CAMS.map((c) => RAD(c.yawDeg));
  const fovHArr = CAMS.map((c) => RAD(c.fovH));
  const fovVArr = CAMS.map((c) => computeVerticalFov(RAD(c.fovH), c.width / c.height));

  return {
    texUniforms: {
      cam0: { value: state.videoTextures[0] },
      cam1: { value: state.videoTextures[1] },
      cam2: { value: state.videoTextures[2] },
      cam3: { value: state.videoTextures[3] },
      cam4: { value: state.videoTextures[4] },
      cam5: { value: state.videoTextures[5] },
    },
    yawArr,
    fovHArr,
    fovVArr,
  };
}

export async function loadVideos(seekSlider, currentTimeLabel, durationTimeLabel, setStatus) {
  setStatus("Loading videos…");
  state.videoElements = CAMS.map((cam, idx) => {
    if (state.enabledFlags[idx] && cam.file) {
      return createVideoElement(cam.file);
    }
    return null;
  });

  const playable = state.videoElements.filter(Boolean);
  await Promise.all(playable.map(waitForCanPlay));

  state.leaderIndex = state.videoElements.findIndex((v) => v);
  const durations = playable.map((v) => v.duration || 0).filter((d) => d > 0);
  state.masterDuration = durations.length ? Math.min(...durations) : 0;
  if (seekSlider) {
    seekSlider.max = state.masterDuration || 0;
    seekSlider.value = 0;
  }
  if (currentTimeLabel) currentTimeLabel.textContent = "00:00";
  if (durationTimeLabel) durationTimeLabel.textContent = formatTime(state.masterDuration);
  setStatus("Syncing & starting playback…");

  for (const video of playable) video.currentTime = 0;
  await Promise.all(playable.map((v) => v.play().catch(() => {})));
}

export function initThree(viewerEl) {
  state.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  state.renderer.setPixelRatio(window.devicePixelRatio);
  state.renderer.setSize(window.innerWidth, window.innerHeight);
  state.renderer.outputColorSpace = THREE.SRGBColorSpace;

  viewerEl.appendChild(state.renderer.domElement);

  state.scene = new THREE.Scene();
  state.camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 100);
  state.camera.position.set(-0.01, 0, 0);

  state.controls = new OrbitControls(state.camera, state.renderer.domElement);
  state.controls.enableDamping = true;
  state.controls.rotateSpeed = state.invertDrag ? -0.25 : 0.25;
  state.controls.enableZoom = true;
  state.controls.minDistance = 0.01;
  state.controls.maxDistance = 2;
  if (state.lockPitch) {
    state.controls.minPolarAngle = Math.PI / 2;
    state.controls.maxPolarAngle = Math.PI / 2;
  } else {
    state.controls.minPolarAngle = 0;
    state.controls.maxPolarAngle = Math.PI;
  }
  state.controls.target.set(0, 0, 0);
  state.controls.update();

  const { texUniforms, yawArr, fovHArr, fovVArr } = buildTexturesAndUniforms();

  state.material = new THREE.ShaderMaterial({
    uniforms: {
      ...texUniforms,
      yaw: { value: yawArr },
      fovH: { value: fovHArr },
      fovV: { value: fovVArr },
      overlap: { value: RAD(state.defaultOverlapDeg) },
      enabled: { value: state.enabledFlags },
      priorityCam: { value: state.priorityCam },
    },
    vertexShader: vertShader,
    fragmentShader: fragShader,
    side: THREE.BackSide,
    depthWrite: false,
  });

  const geometry = new THREE.SphereGeometry(5, 96, 64);
  state.sphere = new THREE.Mesh(geometry, state.material);
  state.scene.add(state.sphere);

  window.addEventListener("resize", onResize);
  onResize();
}

function onResize() {
  if (!state.renderer || !state.camera) return;
  state.camera.aspect = window.innerWidth / window.innerHeight;
  state.camera.updateProjectionMatrix();
  state.renderer.setSize(window.innerWidth, window.innerHeight);
}

export function renderLoop(seekSlider, currentTimeLabel, formatTimeFn) {
  state.animationHandle = requestAnimationFrame(() => renderLoop(seekSlider, currentTimeLabel, formatTimeFn));
  
  // Update orbit controls first
  state.controls.update();
  
  // Get current playback time and update telemetry
  if (!state.isSeeking && state.leaderIndex >= 0 && state.videoElements[state.leaderIndex]) {
    const t = state.videoElements[state.leaderIndex].currentTime || 0;
    if (seekSlider) seekSlider.value = t;
    if (currentTimeLabel) currentTimeLabel.textContent = formatTimeFn(t);
    updateVisForCurrentTime(t);
  }
  
  // Calculate and apply motion effects to the sphere (not camera)
  // This avoids conflicts with OrbitControls
  // All effects (shake, roll, pitch, yaw) go through the sphere
  const speed = getCurrentSpeed();
  calculateCameraMotion(speed);
  calculateAutoSteerYaw(speed);
  applySphereMotion(state.sphere);
  
  // Render the scene
  state.renderer.render(state.scene, state.camera);
}

export function pauseExperience(setStatus) {
  state.videoElements.forEach((v) => v?.pause());
  if (state.animationHandle) {
    cancelAnimationFrame(state.animationHandle);
    state.animationHandle = null;
  }
  state.isPaused = true;
  setStatus("Paused");
}

export function resumeExperience(setStatus, seekSlider, currentTimeLabel, formatTimeFn) {
  state.videoElements.forEach((v) => v?.play().catch(() => {}));
  renderLoop(seekSlider, currentTimeLabel, formatTimeFn);
  state.isPaused = false;
  setStatus("Playing");
}

export function teardownExperience() {
  if (state.animationHandle) {
    cancelAnimationFrame(state.animationHandle);
    state.animationHandle = null;
  }
  state.videoElements.forEach((v) => v?.pause());
  state.videoElements = [];
  state.videoTextures = [];
  state.masterDuration = 0;
  state.leaderIndex = -1;
  if (state.renderer) {
    state.renderer.domElement?.parentNode?.removeChild(state.renderer.domElement);
    state.renderer.dispose();
    state.renderer = null;
  }
  if (state.material) {
    state.material.dispose();
    state.material = null;
  }
  if (state.sphere?.geometry) state.sphere.geometry.dispose();
  state.sphere = null;
  state.scene = null;
  state.camera = null;
  state.controls = null;
  state.isInitialized = false;
  state.uiCollapsed = false;
  
  // Reset motion effects
  resetMotionEffects();
}

// Shaders (same as before)
const fragShader = `
precision mediump float;

uniform sampler2D cam0;
uniform sampler2D cam1;
uniform sampler2D cam2;
uniform sampler2D cam3;
uniform sampler2D cam4;
uniform sampler2D cam5;
uniform float yaw[6];
uniform float fovH[6];
uniform float fovV[6];
uniform float overlap;
uniform bool enabled[6];
uniform int priorityCam;

varying vec2 vUv;

const float PI = 3.14159265358979323846264;

vec3 rotateY(vec3 dir, float angle) {
  float s = sin(angle);
  float c = cos(angle);
  return vec3(c * dir.x - s * dir.z, dir.y, s * dir.x + c * dir.z);
}

vec4 sampleCam(int idx, vec2 uv) {
  if (idx == 0) return texture2D(cam0, uv);
  if (idx == 1) return texture2D(cam1, uv);
  if (idx == 2) return texture2D(cam2, uv);
  if (idx == 3) return texture2D(cam3, uv);
  if (idx == 4) return texture2D(cam4, uv);
  return texture2D(cam5, uv);
}

void main() {
  float lon = ((1.0 - vUv.x) * 2.0 - 1.0) * PI;
  float lat = (vUv.y * PI) - (PI * 0.5);

  vec3 dir;
  dir.x = cos(lat) * sin(lon);
  dir.y = sin(lat);
  dir.z = cos(lat) * cos(lon);

  vec3 color = vec3(0.0);
  float weightSum = 0.0;

  for (int i = 0; i < 6; i++) {
    if (!enabled[i]) continue;
    vec3 local = rotateY(dir, -yaw[i]);
    float hAng = atan(local.x, local.z);
    float vAng = atan(local.y, length(vec2(local.x, local.z)));

    float hHalf = fovH[i] * 0.5;
    float vHalf = fovV[i] * 0.5;

    // Horizontal: strict bounds with overlap blending
    if (abs(hAng) > (hHalf + overlap)) {
      continue;
    }
    
    // Vertical: extend beyond native FOV to fill poles
    // Allow sampling up to 80% beyond the FOV edge
    float vStretchFactor = 0.8;
    float maxVAng = vHalf + (vHalf * vStretchFactor);
    
    if (abs(vAng) > maxVAng) {
      continue;
    }

    // Horizontal blending: sharp cutoff at overlap boundary
    float hBlend = 1.0 - smoothstep(hHalf, hHalf + overlap, abs(hAng));
    
    // Vertical blending: within FOV = full weight, beyond = fade to zero
    float vBlend = 1.0;
    float vOverage = abs(vAng) - vHalf;
    
    if (vOverage > 0.0) {
      // Beyond the native FOV edge: smooth fade over stretch region
      float stretchRange = vHalf * vStretchFactor;
      vBlend = 1.0 - smoothstep(0.0, stretchRange, vOverage);
      vBlend = max(vBlend, 0.0);
    }
    
    float w = hBlend * vBlend;
    if (w < 0.001) {
      continue;
    }

    // Sample position: clamp V to camera's native boundaries to get edge pixel
    float u = 0.5 + (tan(hAng) / tan(hHalf)) * 0.5;
    float sampleVAng = clamp(vAng, -vHalf, vHalf);
    float v = 0.5 - (tan(sampleVAng) / tan(vHalf)) * 0.5;

    if (u < 0.0 || u > 1.0 || v < 0.0 || v > 1.0) {
      continue;
    }

    vec4 texel = sampleCam(i, vec2(u, 1.0 - v));
    if (priorityCam == i) {
      gl_FragColor = vec4(texel.rgb, 1.0);
      return;
    }
    
    color += texel.rgb * w;
    weightSum += w;
  }

  if (weightSum > 0.0) {
    color /= weightSum;
  }

  gl_FragColor = vec4(color, 1.0);
}
`;

const vertShader = `
precision mediump float;
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const formatTime = (t) => {
  if (!Number.isFinite(t)) return "00:00";
  const mins = Math.floor(t / 60);
  const secs = Math.floor(t % 60);
  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
};


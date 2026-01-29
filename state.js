// Shared mutable state and base camera definitions

export const state = {
  defaultOverlapDeg: 15,
  defaultFovScale: 1.0,
  invertDrag: true,
  lockPitch: true,
  uiCollapsed: true,
  isPaused: false,
  isInitialized: false,
  fovScale: 1.0,
  priorityCam: -1,
  currentYawDeg: [],
  currentFovHDeg: [],
  enabledFlags: [],
  yawInputs: [],
  yawValues: [],
  fovInputs: [],
  fovValues: [],
  toggleInputs: [],
  objectUrls: [],
  eventMap: new Map(),
  dateEventMap: new Map(),
  calendarInstance: null,
  calendarSelectedDate: null,
  currentEventKey: null,
  transparentTexture: null,
  videoElements: [],
  videoTextures: [],
  renderer: null,
  scene: null,
  camera: null,
  controls: null,
  sphere: null,
  material: null,
  animationHandle: null,
  masterDuration: 0,
  leaderIndex: -1,
  isSeeking: false,
  presets: [],
  telemetryFrames: [],
  frameTimes: [], // Cumulative time in seconds for each frame
  
  // Motion effects state
  motionEffectsEnabled: true,
  motionIntensity: 1.0, // 0-2 multiplier
  
  // Auto-steer view tracking
  autoSteerEnabled: true,      // View follows steering direction
  autoSteerIntensity: 0.5,     // How much steering affects view (0-1)
  currentSteerYaw: 0,          // Current steering-induced yaw offset
  
  // Smoothed G-force values (updated each frame)
  smoothedGForce: {
    x: 0, // lateral (turning)
    y: 0, // longitudinal (accel/brake)
    z: 0, // vertical (bumps)
  },
  
  // Current camera offsets from motion effects
  cameraMotion: {
    roll: 0,   // lean into turns (radians)
    pitch: 0,  // tilt forward/back (radians)
    shakeX: 0, // horizontal shake
    shakeY: 0, // vertical shake
  },
  
  // Motion effect configuration
  motionConfig: {
    rollMultiplier: 0.025,   // how much lateral G affects roll
    pitchMultiplier: 0.018,  // how much longitudinal G affects pitch
    shakeMultiplier: 0.003,  // how much vertical G affects shake (bumps)
    smoothingFactor: 0.12,   // lower = smoother (0-1)
    maxRoll: 0.12,           // max roll in radians (~7 degrees)
    maxPitch: 0.08,          // max pitch in radians (~4.5 degrees)
    speedShakeBase: 0.0004,  // base shake from speed (road texture)
    roadTextureFreq: 0.4,    // how fast the road shake oscillates
  },
};

export const CAMS = [
  { id: "front", file: "2025-12-01_16-59-15-front.mp4", yawDeg: 0, fovH: 100, width: 2896, height: 1876 },
  { id: "left_pillar", file: "2025-12-01_16-59-15-left_pillar.mp4", yawDeg: 100, fovH: 100, width: 1448, height: 938 },
  { id: "left_repeater", file: "2025-12-01_16-59-15-left_repeater.mp4", yawDeg: 200, fovH: 100, width: 1448, height: 938 },
  { id: "back", file: "2025-12-01_16-59-15-back.mp4", yawDeg: 180, fovH: 90, width: 1448, height: 938 },
  { id: "right_repeater", file: "2025-12-01_16-59-15-right_repeater.mp4", yawDeg: -160, fovH: 100, width: 1448, height: 938 },
  { id: "right_pillar", file: "2025-12-01_16-59-15-right_pillar.mp4", yawDeg: -100, fovH: 100, width: 1448, height: 938 },
];

export const RAD = (deg) => (deg * Math.PI) / 180;


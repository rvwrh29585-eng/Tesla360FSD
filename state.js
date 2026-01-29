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


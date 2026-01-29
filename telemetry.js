import { state } from "./state.js";
import { updateGForceFromTelemetry } from "./motionEffects.js";

// DOM Elements
const dashboardVis = document.getElementById("dashboardVis");
const telemetryToggle = document.getElementById("telemetryToggle");
const toggleExtra = document.getElementById("toggleExtra");
const extraDataContainer = document.querySelector(".extra-data-container");

// Visualization Elements
const speedValue = document.getElementById("speedValue");
const gearP = document.getElementById("gearP");
const gearR = document.getElementById("gearR");
const gearN = document.getElementById("gearN");
const gearD = document.getElementById("gearD");
const blinkLeft = document.getElementById("blinkLeft");
const blinkRight = document.getElementById("blinkRight");
const steeringIcon = document.getElementById("steeringIcon");
const autopilotStatus = document.getElementById("autopilotStatus");
const apText = document.getElementById("apText");
const brakeInd = document.getElementById("brakeInd");
const accelBar = document.getElementById("accelBar");

// Extra Data Elements
const valLat = document.getElementById("valLat");
const valLon = document.getElementById("valLon");
const valHeading = document.getElementById("valHeading");
const valAccX = document.getElementById("valAccX");
const valAccY = document.getElementById("valAccY");
const valAccZ = document.getElementById("valAccZ");

let SeiMetadata = null;
let enumFields = null;
let mp4Parser = null;

const MPS_TO_MPH = 2.23694;

// Current frame SEI data (exposed for motion effects)
let currentSei = null;

export function getCurrentSei() {
  return currentSei;
}

export function getCurrentSpeed() {
  // Protobuf.js converts snake_case to camelCase
  return currentSei?.vehicleSpeedMps || 0;
}

export async function initTelemetry() {
  try {
    // Load Protobuf
    const response = await fetch("lib/dashcam.proto");
    const protoText = await response.text();
    const root = protobuf.parse(protoText).root;
    SeiMetadata = root.lookupType("SeiMetadata");
    enumFields = {
      gearState: SeiMetadata.lookup("Gear"),
      autopilotState: SeiMetadata.lookup("AutopilotState"),
    };
    console.log("Telemetry: Protobuf initialized");
  } catch (e) {
    console.error("Telemetry: Failed to init protobuf", e);
  }

  setupUI();
}

function setupUI() {
  // Toggle Visibility
  if (telemetryToggle) {
    telemetryToggle.addEventListener("click", () => {
      dashboardVis.classList.toggle("hidden");
      const isHidden = dashboardVis.classList.contains("hidden");
      telemetryToggle.style.opacity = isHidden ? "0.5" : "1";
    });
  }

  // Toggle Extra Data
  if (toggleExtra) {
    toggleExtra.addEventListener("click", () => {
      extraDataContainer.classList.toggle("expanded");
      updateVisForCurrentTime(); // Refresh in case we paused
    });
  }

  // Drag Logic
  let isDragging = false;
  let currentX;
  let currentY;
  let initialX;
  let initialY;
  let xOffset = 0;
  let yOffset = 0;

  const dragHandle = document.querySelector(".vis-header");

  dragHandle.addEventListener("mousedown", dragStart);
  document.addEventListener("mouseup", dragEnd);
  document.addEventListener("mousemove", drag);

  function dragStart(e) {
    initialX = e.clientX - xOffset;
    initialY = e.clientY - yOffset;
    isDragging = true;
  }

  function dragEnd(e) {
    initialX = currentX;
    initialY = currentY;
    isDragging = false;
  }

  function drag(e) {
    if (isDragging) {
      e.preventDefault();
      currentX = e.clientX - initialX;
      currentY = e.clientY - initialY;
      xOffset = currentX;
      yOffset = currentY;
      setTranslate(currentX, currentY, dashboardVis);
    }
  }

  function setTranslate(xPos, yPos, el) {
    el.style.transform = `translate3d(${xPos}px, ${yPos}px, 0)`;
  }
}

export async function loadTelemetryForFile(file) {
  if (!file || !SeiMetadata) return;

  console.log("Telemetry: Parsing file", file.name);
  try {
    const buffer = await file.arrayBuffer();
    mp4Parser = new window.DashcamMP4(buffer);
    const frames = mp4Parser.parseFrames(SeiMetadata);
    state.telemetryFrames = frames;

    // Build time index
    const config = mp4Parser.getConfig();
    let time = 0;
    const frameTimes = [];
    // durations are in ms
    config.durations.forEach((d) => {
      frameTimes.push(time);
      time += d / 1000;
    });

    // Store frameTimes in state for motion effects to access
    state.frameTimes = frameTimes;

    // Ensure we have times for all frames
    if (frameTimes.length < frames.length) {
       // If durations are missing, assume 30fps?
       // Usually config.durations matches frame count or is close.
    }
    
    // Show overlay if hidden? Or let user toggle. 
    // Maybe auto-show if data found.
    if (frames.length > 0) {
        dashboardVis.classList.remove("hidden");
    }

    console.log(`Telemetry: Loaded ${frames.length} frames`);
  } catch (err) {
    console.error("Telemetry: Error parsing file", err);
    state.telemetryFrames = [];
    state.frameTimes = [];
  }
}

export function updateVisForCurrentTime(currentTime) {
  if (!state.telemetryFrames || state.telemetryFrames.length === 0) {
    currentSei = null;
    updateGForceFromTelemetry(null);
    return;
  }
  if (currentTime === undefined) {
      // Try to grab from state logic if needed, but usually passed in
      // For now, return if undefined
      return; 
  }

  const frameTimes = state.frameTimes || [];
  if (frameTimes.length === 0) {
    currentSei = null;
    updateGForceFromTelemetry(null);
    return;
  }

  // Find frame index using binary search
  let frameIndex = 0;
  let low = 0, high = frameTimes.length - 1;
  while (low <= high) {
    const mid = (low + high) >>> 1;
    if (frameTimes[mid] <= currentTime) {
      frameIndex = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  const frame = state.telemetryFrames[frameIndex];
  if (frame && frame.sei) {
    currentSei = frame.sei;
    updateVisualization(frame.sei);
    // Update motion effects with current G-force data
    updateGForceFromTelemetry(frame.sei);
  } else {
    currentSei = null;
    updateGForceFromTelemetry(null);
  }
}

function updateVisualization(sei) {
  if (!sei) return;

  // NOTE: Protobuf.js converts snake_case to camelCase!
  // proto: vehicle_speed_mps -> JS: vehicleSpeedMps

  // Speed
  const mps = sei.vehicleSpeedMps || 0;
  const mph = Math.round(mps * MPS_TO_MPH);
  if (speedValue) speedValue.textContent = mph;

  // Gear
  const gear = sei.gearState;
  [gearP, gearR, gearN, gearD].forEach((el) => el?.classList.remove("active"));
  if (gear === 0) gearP?.classList.add("active");
  else if (gear === 1) gearD?.classList.add("active");
  else if (gear === 2) gearR?.classList.add("active");
  else if (gear === 3) gearN?.classList.add("active");

  // Blinkers
  blinkLeft?.classList.toggle("active", !!sei.blinkerOnLeft);
  blinkRight?.classList.toggle("active", !!sei.blinkerOnRight);

  // Steering
  const angle = sei.steeringWheelAngle || 0;
  if (steeringIcon) steeringIcon.style.transform = `rotate(${angle}deg)`;

  // Autopilot
  const apState = sei.autopilotState;
  if (autopilotStatus) {
    autopilotStatus.className = "autopilot-status"; // Reset
    if (apState === 2 || apState === 3) {
      autopilotStatus.classList.add("active-ap");
      if (apText) apText.textContent = apState === 3 ? "TACC" : "Autosteer";
    } else if (apState === 1) {
      autopilotStatus.classList.add("active-fsd");
      if (apText) apText.textContent = "FSD";
    } else {
      if (apText) apText.textContent = "Manual";
    }
  }

  // Brake
  if (sei.brakeApplied) {
    brakeInd?.classList.add("active");
  } else {
    brakeInd?.classList.remove("active");
  }

  // Accelerator
  let accel = sei.acceleratorPedalPosition || 0;
  if (accel > 100) accel = 100;
  if (accel < 0) accel = 0;
  if (accelBar) accelBar.style.width = `${accel}%`;

  // Extra Data
  if (extraDataContainer && extraDataContainer.classList.contains("expanded")) {
    if (valLat) valLat.textContent = (sei.latitudeDeg || 0).toFixed(6);
    if (valLon) valLon.textContent = (sei.longitudeDeg || 0).toFixed(6);
    if (valHeading) valHeading.textContent = (sei.headingDeg || 0).toFixed(1) + "°";
    if (valAccX) valAccX.textContent = (sei.linearAccelerationMps2X || 0).toFixed(2);
    if (valAccY) valAccY.textContent = (sei.linearAccelerationMps2Y || 0).toFixed(2);
    if (valAccZ) valAccZ.textContent = (sei.linearAccelerationMps2Z || 0).toFixed(2);
  }
}

/**
 * Motion Effects Module
 * Applies immersive camera effects based on vehicle telemetry data.
 * Uses G-force data to create roll, pitch, and shake effects.
 */

import { state } from "./state.js";

// Noise generator for organic shake effect
let shakePhase = 0;

/**
 * Smooth interpolation (exponential moving average)
 */
function lerp(current, target, factor) {
  return current + (target - current) * factor;
}

/**
 * Clamp value between min and max
 */
function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

/**
 * Generate organic noise for shake effect
 */
function noise(phase) {
  // Simple pseudo-random noise using sine waves at different frequencies
  return (
    Math.sin(phase * 1.0) * 0.5 +
    Math.sin(phase * 2.3) * 0.3 +
    Math.sin(phase * 4.7) * 0.2
  );
}

/**
 * Get current telemetry frame data
 * Returns null if no data available
 */
export function getCurrentTelemetry(currentTime) {
  if (!state.telemetryFrames || state.telemetryFrames.length === 0) {
    return null;
  }

  // Find the frame for current time using binary search
  // This mirrors the logic in telemetry.js
  const frameTimes = state.frameTimes || [];
  if (frameTimes.length === 0) return null;

  let frameIndex = 0;
  let low = 0;
  let high = frameTimes.length - 1;
  
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
  return frame?.sei || null;
}

/**
 * Update smoothed G-force values from telemetry
 * Call this each frame with the current SEI data
 */
export function updateGForceFromTelemetry(sei) {
  if (!sei || !state.motionEffectsEnabled) {
    // Smoothly return to neutral when disabled or no data
    const decay = 0.05;
    state.smoothedGForce.x = lerp(state.smoothedGForce.x, 0, decay);
    state.smoothedGForce.y = lerp(state.smoothedGForce.y, 0, decay);
    state.smoothedGForce.z = lerp(state.smoothedGForce.z, 0, decay);
    return;
  }

  const config = state.motionConfig;
  const factor = config.smoothingFactor;

  // Get raw G-force values from SEI
  // X = lateral (positive = right turn)
  // Y = longitudinal (positive = acceleration, negative = braking)
  // Z = vertical (positive = upward, bumps)
  const rawX = sei.linear_acceleration_mps2_x || 0;
  const rawY = sei.linear_acceleration_mps2_y || 0;
  const rawZ = sei.linear_acceleration_mps2_z || 0;

  // Smooth the values
  state.smoothedGForce.x = lerp(state.smoothedGForce.x, rawX, factor);
  state.smoothedGForce.y = lerp(state.smoothedGForce.y, rawY, factor);
  state.smoothedGForce.z = lerp(state.smoothedGForce.z, rawZ, factor);
}

/**
 * Calculate camera motion offsets based on current G-force
 * Returns { roll, pitch, shakeX, shakeY }
 */
export function calculateCameraMotion(speed = 0) {
  if (!state.motionEffectsEnabled) {
    // Smoothly return to neutral
    const decay = 0.1;
    state.cameraMotion.roll = lerp(state.cameraMotion.roll, 0, decay);
    state.cameraMotion.pitch = lerp(state.cameraMotion.pitch, 0, decay);
    state.cameraMotion.shakeX = lerp(state.cameraMotion.shakeX, 0, decay);
    state.cameraMotion.shakeY = lerp(state.cameraMotion.shakeY, 0, decay);
    return state.cameraMotion;
  }

  const config = state.motionConfig;
  const intensity = state.motionIntensity;
  const g = state.smoothedGForce;

  // --- Roll (lean into turns) ---
  // Lateral G-force causes the camera to roll
  // Negative X (left turn) = roll left (negative roll)
  // Positive X (right turn) = roll right (positive roll)
  const targetRoll = clamp(
    -g.x * config.rollMultiplier * intensity,
    -config.maxRoll,
    config.maxRoll
  );

  // --- Pitch (tilt forward/back) ---
  // Longitudinal G-force causes pitch
  // Positive Y (acceleration) = pitch back slightly (positive pitch)
  // Negative Y (braking) = pitch forward (negative pitch)
  const targetPitch = clamp(
    -g.y * config.pitchMultiplier * intensity,
    -config.maxPitch,
    config.maxPitch
  );

  // --- Shake (road vibration) ---
  // Combine vertical G-force bumps with speed-based shake
  shakePhase += 0.3; // Advance noise phase
  
  // Base shake from vertical acceleration (bumps)
  const bumpShake = Math.abs(g.z - 9.8) * config.shakeMultiplier * intensity;
  
  // Speed-based continuous micro-shake (faster = more vibration)
  const speedMps = speed; // Already in m/s
  const speedShake = speedMps * config.speedShakeBase * intensity;
  
  // Combined shake magnitude
  const shakeMagnitude = bumpShake + speedShake;
  
  const targetShakeX = noise(shakePhase) * shakeMagnitude;
  const targetShakeY = noise(shakePhase + 100) * shakeMagnitude;

  // Smooth the camera motion
  const motionSmooth = 0.2;
  state.cameraMotion.roll = lerp(state.cameraMotion.roll, targetRoll, motionSmooth);
  state.cameraMotion.pitch = lerp(state.cameraMotion.pitch, targetPitch, motionSmooth);
  state.cameraMotion.shakeX = lerp(state.cameraMotion.shakeX, targetShakeX, 0.5);
  state.cameraMotion.shakeY = lerp(state.cameraMotion.shakeY, targetShakeY, 0.5);

  return state.cameraMotion;
}

/**
 * Apply camera motion to Three.js camera
 * Should be called in the render loop after controls.update()
 */
export function applyCameraMotion(camera) {
  if (!camera || !state.motionEffectsEnabled) return;

  const motion = state.cameraMotion;

  // Apply roll (Z-axis rotation)
  camera.rotation.z = motion.roll;

  // Apply pitch offset by adjusting the camera's up direction slightly
  // This creates a subtle "tilt" effect without breaking orbit controls
  // We do this by rotating the camera around its local X axis
  camera.rotateX(motion.pitch * 0.5);

  // Apply shake as small position offsets
  camera.position.x += motion.shakeX;
  camera.position.y += motion.shakeY;
}

/**
 * Reset all motion effects to neutral
 */
export function resetMotionEffects() {
  state.smoothedGForce.x = 0;
  state.smoothedGForce.y = 0;
  state.smoothedGForce.z = 0;
  state.cameraMotion.roll = 0;
  state.cameraMotion.pitch = 0;
  state.cameraMotion.shakeX = 0;
  state.cameraMotion.shakeY = 0;
  shakePhase = 0;
}

/**
 * Toggle motion effects on/off
 */
export function setMotionEffectsEnabled(enabled) {
  state.motionEffectsEnabled = enabled;
  if (!enabled) {
    // Effects will smoothly fade out via calculateCameraMotion
  }
}

/**
 * Set motion intensity multiplier (0-2)
 */
export function setMotionIntensity(intensity) {
  state.motionIntensity = clamp(intensity, 0, 2);
}

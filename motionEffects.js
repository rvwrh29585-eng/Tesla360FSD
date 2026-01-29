/**
 * Motion Effects Module
 * Applies immersive camera effects based on vehicle telemetry data.
 * Uses G-force data to create roll, pitch, and shake effects.
 * 
 * IMPORTANT: We rotate the SPHERE (video mesh), not the camera.
 * This avoids conflicts with OrbitControls which manages camera rotation.
 */

import { state } from "./state.js";

// Noise generator for organic shake effect
let shakePhase = 0;

// Baseline Z acceleration (gravity) - calibrated on first valid reading
let baselineZ = null;
let hasValidTelemetry = false;

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
 * Combines multiple frequencies for realistic road vibration
 */
function noise(phase) {
  // Low frequency sway (body roll from road undulation)
  const lowFreq = Math.sin(phase * 0.7) * 0.3;
  // Medium frequency (road texture)
  const medFreq = Math.sin(phase * 2.3) * 0.4;
  // High frequency (fine vibration)
  const highFreq = Math.sin(phase * 5.7) * 0.2 + Math.sin(phase * 8.3) * 0.1;
  
  return lowFreq + medFreq + highFreq;
}

/**
 * Generate high-frequency road texture vibration
 * More aggressive than regular noise, simulates tire on asphalt
 */
function roadTexture(phase, intensity) {
  const vibration = 
    Math.sin(phase * 12.0) * 0.3 +
    Math.sin(phase * 17.3) * 0.25 +
    Math.sin(phase * 23.7) * 0.2 +
    Math.sin(phase * 31.1) * 0.15 +
    Math.sin(phase * 41.9) * 0.1;
  
  return vibration * intensity;
}

/**
 * Check if SEI data contains valid telemetry
 * Tesla only includes SEI data in certain conditions
 * NOTE: Protobuf.js converts snake_case to camelCase!
 */
function isValidTelemetry(sei) {
  if (!sei) return false;
  
  // Check if we have meaningful acceleration data
  // If all acceleration values are 0, telemetry wasn't recorded
  const hasAccel = (
    sei.linearAccelerationMps2X !== undefined ||
    sei.linearAccelerationMps2Y !== undefined ||
    sei.linearAccelerationMps2Z !== undefined
  );
  
  // Also check for speed or other indicators
  const hasSpeed = sei.vehicleSpeedMps !== undefined;
  
  return hasAccel || hasSpeed;
}

/**
 * Update smoothed G-force values from telemetry
 * Call this each frame with the current SEI data
 */
export function updateGForceFromTelemetry(sei) {
  // Check if we have valid telemetry
  hasValidTelemetry = isValidTelemetry(sei);
  
  if (!hasValidTelemetry || !state.motionEffectsEnabled) {
    // Smoothly return to neutral when disabled or no data
    const decay = 0.1;
    state.smoothedGForce.x = lerp(state.smoothedGForce.x, 0, decay);
    state.smoothedGForce.y = lerp(state.smoothedGForce.y, 0, decay);
    state.smoothedGForce.z = lerp(state.smoothedGForce.z, 0, decay);
    return;
  }

  const config = state.motionConfig;
  const factor = config.smoothingFactor;

  // Get raw G-force values from SEI (camelCase from protobuf.js)
  // X = lateral (positive = right turn)
  // Y = longitudinal (positive = acceleration, negative = braking)
  // Z = vertical (includes gravity ~9.8 m/s²)
  const rawX = sei.linearAccelerationMps2X || 0;
  const rawY = sei.linearAccelerationMps2Y || 0;
  const rawZ = sei.linearAccelerationMps2Z || 0;

  // Calibrate baseline Z on first valid reading
  // This accounts for gravity and sensor mounting
  if (baselineZ === null && rawZ !== 0) {
    baselineZ = rawZ;
  }

  // Subtract baseline from Z to get bump-only component
  const adjustedZ = baselineZ !== null ? (rawZ - baselineZ) : 0;

  // Smooth the values
  state.smoothedGForce.x = lerp(state.smoothedGForce.x, rawX, factor);
  state.smoothedGForce.y = lerp(state.smoothedGForce.y, rawY, factor);
  state.smoothedGForce.z = lerp(state.smoothedGForce.z, adjustedZ, factor);
}

/**
 * Calculate motion offsets based on current G-force
 * Returns { roll, pitch, shakeX, shakeY }
 */
export function calculateCameraMotion(speed = 0) {
  const config = state.motionConfig;
  const decay = 0.15;
  
  // If effects disabled or no valid telemetry, smoothly return to neutral
  if (!state.motionEffectsEnabled || !hasValidTelemetry) {
    state.cameraMotion.roll = lerp(state.cameraMotion.roll, 0, decay);
    state.cameraMotion.pitch = lerp(state.cameraMotion.pitch, 0, decay);
    state.cameraMotion.shakeX = lerp(state.cameraMotion.shakeX, 0, decay);
    state.cameraMotion.shakeY = lerp(state.cameraMotion.shakeY, 0, decay);
    return state.cameraMotion;
  }

  const intensity = state.motionIntensity;
  const g = state.smoothedGForce;

  // --- Roll (lean into turns) ---
  // Lateral G-force causes the view to roll
  // Positive X (right turn) = roll right
  const targetRoll = clamp(
    g.x * config.rollMultiplier * intensity,
    -config.maxRoll,
    config.maxRoll
  );

  // --- Pitch (tilt forward/back) ---
  // Longitudinal G-force causes pitch
  // Positive Y (acceleration) = pitch back slightly
  // Negative Y (braking) = pitch forward
  const targetPitch = clamp(
    g.y * config.pitchMultiplier * intensity,
    -config.maxPitch,
    config.maxPitch
  );

  // --- Shake (road vibration) ---
  // Only apply shake when moving
  const isMoving = speed > 0.5; // More than ~1 mph
  
  if (isMoving) {
    // Advance noise phase based on speed (faster = more vibration cycles)
    const phaseSpeed = config.roadTextureFreq || 0.4;
    shakePhase += phaseSpeed * (1 + speed * 0.02);
    
    // Base shake from vertical acceleration (bumps) - already baseline-adjusted
    const bumpShake = Math.abs(g.z) * config.shakeMultiplier * intensity;
    
    // Speed-based continuous micro-shake (faster = more vibration)
    // This simulates road texture felt through the chassis
    const speedFactor = Math.min(speed / 30, 1); // Normalize to ~67 mph max effect
    const speedShake = speedFactor * config.speedShakeBase * intensity * 10;
    
    // High-frequency road texture vibration (subtle but constant when moving)
    const textureX = roadTexture(shakePhase, speedShake * 0.5);
    const textureY = roadTexture(shakePhase + 50, speedShake * 0.5);
    
    // Lower frequency body movement from bumps
    const bumpX = noise(shakePhase * 0.3) * bumpShake;
    const bumpY = noise(shakePhase * 0.3 + 100) * bumpShake;
    
    // Combined shake
    const targetShakeX = textureX + bumpX;
    const targetShakeY = textureY + bumpY;
    
    // Quick response for road texture, slower for bumps
    state.cameraMotion.shakeX = lerp(state.cameraMotion.shakeX, targetShakeX, 0.4);
    state.cameraMotion.shakeY = lerp(state.cameraMotion.shakeY, targetShakeY, 0.4);
  } else {
    // Not moving - no shake
    state.cameraMotion.shakeX = lerp(state.cameraMotion.shakeX, 0, decay);
    state.cameraMotion.shakeY = lerp(state.cameraMotion.shakeY, 0, decay);
  }

  // Smooth the roll and pitch
  const motionSmooth = 0.12;
  state.cameraMotion.roll = lerp(state.cameraMotion.roll, targetRoll, motionSmooth);
  state.cameraMotion.pitch = lerp(state.cameraMotion.pitch, targetPitch, motionSmooth);

  return state.cameraMotion;
}

/**
 * Apply motion effects to the sphere mesh (NOT the camera!)
 * This avoids conflicts with OrbitControls
 */
export function applySphereMotion(sphere) {
  if (!sphere) return;
  
  const motion = state.cameraMotion;
  
  // Apply roll and pitch to the sphere
  // Since the camera looks at the sphere from inside, rotating the sphere
  // creates the effect of the view tilting
  sphere.rotation.z = motion.roll;
  sphere.rotation.x = motion.pitch;
  
  // Apply shake as small position offsets to the sphere
  sphere.position.x = motion.shakeX;
  sphere.position.y = motion.shakeY;
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
  baselineZ = null;
  hasValidTelemetry = false;
  
  // Reset sphere position/rotation if it exists
  if (state.sphere) {
    state.sphere.rotation.x = 0;
    state.sphere.rotation.z = 0;
    state.sphere.position.x = 0;
    state.sphere.position.y = 0;
  }
}

/**
 * Toggle motion effects on/off
 */
export function setMotionEffectsEnabled(enabled) {
  state.motionEffectsEnabled = enabled;
  if (!enabled) {
    // Reset sphere immediately when disabled
    if (state.sphere) {
      state.sphere.rotation.x = 0;
      state.sphere.rotation.z = 0;
      state.sphere.position.x = 0;
      state.sphere.position.y = 0;
    }
  }
}

/**
 * Set motion intensity multiplier (0-2)
 */
export function setMotionIntensity(intensity) {
  state.motionIntensity = clamp(intensity, 0, 2);
}

// ============================================================
// AUTO-STEER VIEW TRACKING
// Makes the 360 view naturally follow where the car is going
// ============================================================

let targetSteerYaw = 0;
let currentSteeringAngle = 0;

/**
 * Update steering angle from telemetry
 */
export function updateSteeringFromTelemetry(sei) {
  if (!sei || !state.autoSteerEnabled) {
    // Smoothly return to center when disabled
    currentSteeringAngle = lerp(currentSteeringAngle, 0, 0.05);
    return;
  }
  
  // Get steering wheel angle (degrees, positive = right turn)
  const rawAngle = sei.steeringWheelAngle || 0;
  
  // Smooth the steering input
  currentSteeringAngle = lerp(currentSteeringAngle, rawAngle, 0.1);
}

/**
 * Calculate auto-steer yaw offset
 * Returns the yaw angle to apply to the view (radians)
 */
export function calculateAutoSteerYaw(speed = 0) {
  if (!state.autoSteerEnabled || !hasValidTelemetry) {
    // Smoothly return to center
    state.currentSteerYaw = lerp(state.currentSteerYaw, 0, 0.03);
    return state.currentSteerYaw;
  }
  
  // Only apply steering-based yaw when moving
  // (no point tracking steering in a parked car)
  const isMoving = speed > 1.0; // ~2.2 mph
  
  if (!isMoving) {
    state.currentSteerYaw = lerp(state.currentSteerYaw, 0, 0.05);
    return state.currentSteerYaw;
  }
  
  // Convert steering angle to view yaw
  // Steering wheel typically has ~540 degrees lock-to-lock
  // We want a max view rotation of about 45 degrees (0.78 rad) at full lock
  const maxSteeringAngle = 270; // Half of full lock
  const maxViewYaw = 0.6; // ~35 degrees max view rotation
  
  // Normalize steering to -1 to 1
  const normalizedSteering = clamp(currentSteeringAngle / maxSteeringAngle, -1, 1);
  
  // Apply intensity and convert to radians
  const targetYaw = normalizedSteering * maxViewYaw * state.autoSteerIntensity;
  
  // Speed-based scaling: more effect at higher speeds
  // At low speed (parking), less view movement
  // At highway speed, full effect
  const speedFactor = clamp(speed / 20, 0.3, 1.0); // 20 m/s ≈ 45 mph for full effect
  const scaledTargetYaw = targetYaw * speedFactor;
  
  // Smooth the transition (slower for natural feel)
  state.currentSteerYaw = lerp(state.currentSteerYaw, scaledTargetYaw, 0.04);
  
  return state.currentSteerYaw;
}

/**
 * Apply auto-steer yaw to OrbitControls
 * This rotates the view target so the user looks where the car is going
 */
export function applyAutoSteerToControls(controls, camera) {
  if (!controls || !camera || !state.autoSteerEnabled) return;
  
  const yawOffset = state.currentSteerYaw;
  
  // Rotate the controls target around the camera
  // This makes the view pan in the direction of the turn
  const targetDistance = 10; // Distance to look-at point
  
  // Calculate new target position based on yaw offset
  // We're inside a sphere, looking outward
  const baseYaw = Math.atan2(controls.target.x - camera.position.x, 
                             controls.target.z - camera.position.z);
  const newYaw = baseYaw + yawOffset;
  
  // Only update if there's meaningful change
  if (Math.abs(yawOffset) > 0.001) {
    // Gently nudge the target toward the steering direction
    // This creates a natural "look where you're going" effect
    controls.target.x = camera.position.x + Math.sin(newYaw) * targetDistance * 0.01;
    controls.target.z = camera.position.z + Math.cos(newYaw) * targetDistance * 0.01;
  }
}

/**
 * Toggle auto-steer view tracking
 */
export function setAutoSteerEnabled(enabled) {
  state.autoSteerEnabled = enabled;
}

/**
 * Set auto-steer intensity (0-1)
 */
export function setAutoSteerIntensity(intensity) {
  state.autoSteerIntensity = clamp(intensity, 0, 1);
}

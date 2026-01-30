# Immersive Viewing Experience Feature

## Overview

The Tesla 360 viewer includes an **Immersion Mode** that attempts to make the 360-degree dashcam experience feel more like sitting in the car by applying motion effects based on vehicle telemetry data. Instead of a static 360 sphere, the view reacts to acceleration, braking, turning, and road vibrations—creating a more visceral, embodied viewing experience.

## Current Implementation

### 1. G-Force Motion Effects

The viewer reads three-axis acceleration data from the embedded SEI (Supplemental Enhancement Information) metadata:

- **Lateral (X-axis)**: Acceleration perpendicular to driving direction
  - Positive = turning right
  - Negative = turning left
  - Applied as **roll rotation** (tilting the view sideways into the turn)

- **Longitudinal (Y-axis)**: Acceleration along the driving direction
  - Positive = accelerating/speeding up
  - Negative = braking
  - Applied as **pitch rotation** (tilting the view forward/backward)

- **Vertical (Z-axis)**: Acceleration up/down (includes gravity ~9.8 m/s²)
  - Road bumps, suspension compression
  - Applied as **camera shake** (translational jitter)

### 2. Auto-Follow Steering View

The viewer attempts to make the view naturally follow where the car is heading:

- **Steering Wheel Input**: Reads `steeringWheelAngle` for immediate response to driver input
- **GPS Heading Tracking**: Monitors `headingDeg` to track the car's actual compass direction
- **Blended Tracking**: Combines both signals:
  - At low speeds (parking): Steering dominates (responds to driver intent)
  - At high speeds (highway): GPS heading dominates (follows actual car rotation)
- Applied as **yaw rotation** (turning left/right view)

### 3. Motion Configuration System

Users can customize immersion through several settings:

- **Mode Selection**: Off, Subtle, Auto, Intense, Custom
- **Follow Steering Toggle**: Enable/disable view rotation with steering
- **Follow Intensity Slider**: Control how much the view rotates (0-100%)
- **G-Force Effects Toggle**: Enable/disable roll/pitch/shake
- **Intensity Multiplier**: Scale all motion effects (0-2x)

## Current Limitations

### 1. Motion Effects Feel Disconnected

**Problem**: The roll/pitch/shake effects don't feel synchronized with the visual experience. When you look at the road tilting in a turn, seeing the view also roll can feel redundant or disorienting rather than immersive.

**Why it happens**:
- The motion is applied to the entire sphere, including the part you're looking at
- G-force data from accelerometers is offset from visual perception (eyes perceive motion before the body fully experiences it)
- The effects are uniform across all zoom levels, so extreme zooms feel exaggerated

### 2. Auto-Follow Steering is Unreliable

**Problem**: The steering-following feature only works reliably at certain zoom levels, and updates inconsistently. Sometimes looking up requires multiple scroll events to update.

**Why it happens**:
- The blending between steering and heading signals can create dead zones
- At certain zoom levels, the perspective makes small rotations hard to perceive
- Numerical precision issues in shader calculations cause discontinuities
- The accumulated heading change decay logic can get stuck or overshoot

### 3. Gravity Baseline Calibration Issues

**Problem**: The vertical shake effect often feels random or unrelated to actual bumps, especially when videos lack consistent SEI metadata.

**Why it happens**:
- Gravity baseline (9.8 m/s²) is calibrated on first valid reading, but only once per playback
- Different dashcam positions or sensor orientations mean different baseline Z values
- Some Tesla videos have gaps in SEI data, causing jitter
- No dynamic re-calibration when baseline changes

### 4. Pole Coverage Still Has Artifacts

**Problem**: Looking directly up or down shows stretched/blurred edges from the camera feeds, and this isn't always smooth.

**Why it happens**:
- Tesla cameras don't have 360° coverage (top/bottom poles are dark in real dashcams)
- We extend the vertical FOV by 80% and clamp to edge pixels, but this creates a "edge smear" effect
- The shader fade calculation can have subtle discontinuities at different viewing angles
- No actual data to fill the poles, so blurring is the best we can do

### 5. No Haptic/Audio Integration

**Problem**: The immersion is purely visual. No haptic feedback on desktop, and audio cues don't sync with motion.

**Why it happens**:
- Haptic API requires specific hardware and browser support (mostly mobile)
- Audio integration would require extracting and syncing dashcam audio, which isn't currently available

### 6. Motion Sickness Risk at High Intensity

**Problem**: The feature can cause motion sickness at maximum intensity, especially with complex maneuvers (e.g., navigating tight urban streets).

**Why it happens**:
- Roll + pitch + shake applied simultaneously can be disorienting
- No perception-based damping for intense maneuvers
- Visual motion is decoupled from actual physical motion (user is stationary)

## Proposed Improvements

### Short-Term (Achievable)

#### 1. **Perceptual Damping**
- Apply different smoothing/intensity to roll vs. pitch vs. shake based on viewing angle
- When zoomed in close, reduce effects (perspective is less immersive, so effects feel wrong)
- Fade out extreme effects at high intensity to prevent motion sickness

#### 2. **Improved Steering Tracking**
- Replace accumulated heading change with proper quaternion-based rotation tracking
- Add predictive steering: slight pre-rotation based on steering wheel angle before car actually turns
- Implement hysteresis to prevent jitter when steering hovers near zero

#### 3. **Dynamic Gravity Calibration**
- Use running average of Z-axis over 1-2 seconds instead of single first reading
- Detect and ignore outliers (bumps, potholes) during calibration
- Allow manual baseline adjustment via UI slider

#### 4. **Better Pole Handling**
- Instead of stretching edges, use gradient filling:
  - At top: blend to sky color (light gray)
  - At bottom: blend to road color (dark gray)
- Read average color from top/bottom edge of cameras and use that for pole gradient

#### 5. **Immersion Preset Improvements**
- Create context-aware presets based on driving scenario:
  - "Parking": High steering response, minimal G-forces
  - "Highway": Smooth heading tracking, moderate shake
  - "City": Balanced steering + G-forces, reduced intensity
  - "Track": Maximum effects with reduced damping
- Save/load custom presets per video

### Medium-Term (Requires Refactoring)

#### 1. **Separate Effect Channels**
- Apply effects to different components:
  - **Horizon line**: Only yaw (steering), keeps horizon stable
  - **Camera position**: Only shake (bumps), not rotational
  - **Sphere rotation**: G-force roll/pitch, but damped based on viewing angle
- This way, different effects don't compound in confusing ways

#### 2. **Perspective-Aware Effect Scaling**
- Track camera distance from sphere center
- Scale effects inversely with zoom:
  - Zoomed in (close to 360°): Minimal effects (feels wrong at that perspective)
  - Zoomed out (far from sphere): Full effects (natural immersive view)

#### 3. **Latency Compensation**
- Add configurable delay/lead to account for perception lag
- Allow user to shift effects earlier/later to sync with visual perception
- Example: Road bump happens, but eyes perceive vertical motion slightly before body feels it

#### 4. **Sensor Fusion Improvements**
- Use multiple data sources for heading:
  - GPS heading (smooth, accurate, delayed)
  - Steering wheel angle (quick, accurate, but indirect)
  - Wheel speed differentials (very accurate for sharp turns)
- Weight signals based on confidence and recency

#### 5. **Audio Sync (if dashcam audio available)**
- Extract audio from dashcam feed
- Use audio to validate motion detection
- Sync rumble/vibration effects to engine/tire sounds

### Long-Term (New Capabilities)

#### 1. **ML-Based Motion Prediction**
- Train a model on typical Tesla driving patterns
- Predict upcoming motion changes before they happen
- Slightly pre-rotate view before car actually turns (feels more responsive)

#### 2. **Haptic Integration**
- Support modern haptic APIs (Gamepad Vibration API)
- Map effects to phone vibration for mobile viewers
- Synchronized haptic pulses with bumps detected in Z-axis

#### 3. **Eye-Tracking Integration**
- If browser supports eye tracking, reduce effects when user isn't looking at horizon
- Increase effects when looking at dashboard or windows (more immersive perspective)

#### 4. **Machine Learning-Based Baseline Detection**
- Train on known good baselines from many Tesla videos
- Auto-detect correct gravity baseline without relying on first reading
- Automatically detect and ignore bad telemetry frames

#### 5. **Pole Reconstruction**
- Use AI upsampling (ESRGAN, Real-ESRGAN) to inpaint pole regions from adjacent cameras
- Train a neural network on the side cameras to predict what the top/bottom would look like
- Creates more natural pole coverage instead of gradient smears

#### 6. **Multiplayer Sync**
- Allow multiple viewers to synchronize on same video
- Apply effects based on aggregate vehicle state across all viewers
- Share telemetry streams for collaborative analysis

## Testing & Validation

### Current Testing Gaps

1. **No motion sickness testing** - Should test with users across different intensity levels
2. **Limited telemetry variety** - Only tested with a few video samples; need broader dataset
3. **No A/B comparison** - Haven't compared against other 360 dashcam viewers
4. **No user feedback loop** - Feature was built without external user testing

### Recommended Tests

- [ ] Motion sickness evaluation at each intensity level
- [ ] Comparison with stationary 360 viewer (control group)
- [ ] Testing on various devices (desktop, phone, VR headset)
- [ ] Compatibility testing with different Tesla models (different sensor arrays)
- [ ] Long-term viewing comfort (how long before fatigue sets in?)

## Architecture Notes

### Key Files

- **`motionEffects.js`**: Core motion calculation engine
- **`telemetry.js`**: SEI data parsing and visualization
- **`stitcher.js`**: Sphere rendering and shader application
- **`controls.js`**: UI and user interaction
- **`state.js`**: Global application state

### Critical Paths

1. **Telemetry → Motion**: `updateVisForCurrentTime()` → `updateGForceFromTelemetry()` → `calculateCameraMotion()`
2. **Rendering**: `renderLoop()` → `applySphereMotion()` → `state.renderer.render()`
3. **Steering Tracking**: `updateSteeringFromTelemetry()` → `calculateAutoSteerYaw()` → sphere Y-rotation

## Conclusion

The immersion feature is a promising start, but needs refinement to feel truly natural. The biggest wins would come from:

1. Better steering tracking (quaternion-based, hysteresis-damped)
2. Perceptual damping based on zoom/viewing angle
3. Improved pole rendering (gradients instead of stretching)
4. Context-aware presets

The feature demonstrates the potential of motion-synchronized media, but the current implementation often feels gimmicky rather than genuinely immersive. With the proposed improvements—especially perspective-aware effect scaling and improved steering tracking—it could become a genuinely compelling way to experience dashcam footage.

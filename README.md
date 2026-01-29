# Tesla 360 Viewer

A specialized in-browser viewer for Tesla dashcam/Sentry footage. It stitches the six camera streams (front, back, left/right pillars, left/right repeaters) into a navigable 360° panoramic experience and now features a real-time telemetry overlay.

## Features

- **360° Stitching**: Uses WebGL (Three.js) to map 6 video streams onto a sphere with custom shaders for blending and overlap handling.
- **Telemetry Overlay**: Real-time visualization of vehicle data extracted from the video file (Speed, Gear, Accelerator/Brake, Steering Angle, Autopilot status, Turn Signals, and G-Force/GPS data).
- **Event Browser**: Point it to your TeslaCam folder to instantly browse events by date/time.
- **Synchronized Playback**: Plays all 6 cameras in sync.
- **Customizable View**: Adjust Yaw, FOV, and visibility per camera. Save and load presets.
- **Privacy First**: Everything runs locally in your browser. No video data is uploaded.

## Usage

1.  Open `index.html` in a modern web browser (Chrome, Edge, Firefox, Safari).
    *   *Note: Due to browser security policies, you may need to run a local web server if you want to load `presets.csv` correctly. e.g., `python3 -m http.server`.*
2.  Click **Choose TeslaCam folder** and select the folder containing your footage (e.g., `SavedClips` or a specific event folder).
3.  Use the controls to navigate the 360 view (drag to look around, scroll to zoom).
4.  **Spacebar** to play/pause.
5.  Click **Telemetry** to toggle the data dashboard overlay.

## Controls

- **Drag**: Look around the 360° view.
- **Scroll**: Zoom in/out (adjust Global FOV scale).
- **Spacebar**: Play/Pause.
- **Gear Icon**: Toggle UI visibility.
- **Telemetry Overlay**:
    - **Drag header (:::)**: Move the overlay around the screen.
    - **Arrow button**: Expand/collapse extra details (GPS, G-Force).

## Structure

- `index.html`: Entry point.
- `controls.js`: UI logic and event handling.
- `stitcher.js`: Three.js scene setup and rendering loop.
- `state.js`: Shared state management.
- `telemetry.js`: Telemetry parsing (Protobuf/MP4) and UI updates.
- `presets.js`: Preset loading and parsing logic.
- `lib/`: External dependencies and parsers (`dashcam-mp4.js`, `protobuf.min.js`, `dashcam.proto`).

## Credits

- **TeslaCam Blackbox**: Telemetry parsing and visualization logic adapted from [TeslaCam Blackbox](https://github.com/fpgan/teslacamblackbox).
- **Three.js**: 3D rendering engine.
- **Flatpickr**: Date picker component.

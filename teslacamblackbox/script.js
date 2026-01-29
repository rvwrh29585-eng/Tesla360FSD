// State
let mp4 = null;
let frames = null;
let firstKeyframe = 0;
let decoder = null;
let decoding = false;
let pendingFrame = null;
let playing = false;
let playTimer = null;
let seiType = null;
let enumFields = null;

// DOM Elements
const $ = id => document.getElementById(id);
const dropOverlay = $('dropOverlay');
const fileInput = $('fileInput');
const canvas = $('videoCanvas');
const ctx = canvas.getContext('2d');
const progressBar = $('progressBar');
const playBtn = $('playBtn');
const timeDisplay = $('timeDisplay');
const dashboardVis = $('dashboardVis');
const videoContainer = $('videoContainer');

// Visualization Elements
const speedValue = $('speedValue');
const gearP = $('gearP');
const gearR = $('gearR');
const gearN = $('gearN');
const gearD = $('gearD');
const blinkLeft = $('blinkLeft');
const blinkRight = $('blinkRight');
const steeringIcon = $('steeringIcon');
const autopilotStatus = $('autopilotStatus');
const apText = $('apText');
const brakeInd = $('brakeInd');
const accelBar = $('accelBar');
const toggleExtra = $('toggleExtra');
const extraDataContainer = document.querySelector('.extra-data-container');

// Extra Data Elements
const valLat = $('valLat');
const valLon = $('valLon');
const valHeading = $('valHeading');
const valAccX = $('valAccX');
const valAccY = $('valAccY');
const valAccZ = $('valAccZ');

// Constants
const MPS_TO_MPH = 2.23694;

// Initialize
(async function init() {
    try {
        const { SeiMetadata, enumFields: ef } = await DashcamHelpers.initProtobuf();
        seiType = SeiMetadata;
        enumFields = ef;
    } catch (e) {
        console.error('Failed to init protobuf:', e);
        alert('Failed to initialize metadata parser.');
    }
})();

// Drag & Drop Logic for Floating Vis
let isDragging = false;
let currentX;
let currentY;
let initialX;
let initialY;
let xOffset = 0;
let yOffset = 0;

const dragHandle = document.querySelector('.vis-header');
videoContainer.addEventListener('mousedown', dragStart);
videoContainer.addEventListener('mouseup', dragEnd);
videoContainer.addEventListener('mousemove', drag);

function dragStart(e) {
    if (e.target === dragHandle || dragHandle.contains(e.target)) {
        initialX = e.clientX - xOffset;
        initialY = e.clientY - yOffset;
        isDragging = true;
    }
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

// File Handling
dropOverlay.onclick = () => fileInput.click();
fileInput.onchange = e => handleFile(e.target.files[0]);
dropOverlay.ondragover = e => { e.preventDefault(); dropOverlay.classList.add('hover'); };
dropOverlay.ondragleave = e => { dropOverlay.classList.remove('hover'); };
dropOverlay.ondrop = e => {
    e.preventDefault();
    dropOverlay.classList.remove('hover');
    if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
};

async function handleFile(file) {
    if (!file || !file.name.toLowerCase().endsWith('.mp4')) {
        alert('Please select a valid MP4 file.');
        return;
    }

    // Reset state
    pause();
    if (decoder) { try { decoder.close(); } catch { } decoder = null; }
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // UI Reset
    dropOverlay.classList.add('hidden');
    dashboardVis.classList.remove('visible');
    playBtn.disabled = true;
    progressBar.disabled = true;

    try {
        const buffer = await file.arrayBuffer();
        mp4 = new DashcamMP4(buffer);
        frames = mp4.parseFrames(seiType);
        
        firstKeyframe = frames.findIndex(f => f.keyframe);
        if (firstKeyframe === -1) throw new Error('No keyframes found in MP4');

        const config = mp4.getConfig();
        canvas.width = config.width;
        canvas.height = config.height;
        
        // Setup Progress Bar
        progressBar.min = 0;
        progressBar.max = frames.length - 1;
        progressBar.value = firstKeyframe;
        
        // Enable UI
        playBtn.disabled = false;
        progressBar.disabled = false;
        dashboardVis.classList.add('visible');
        
        showFrame(firstKeyframe);
    } catch (err) {
        console.error(err);
        alert('Error loading file: ' + err.message);
        dropOverlay.classList.remove('hidden');
    }
}

// Playback Logic
playBtn.onclick = () => playing ? pause() : play();
progressBar.oninput = () => {
    pause();
    showFrame(+progressBar.value);
};

// Keyboard controls
document.addEventListener('keydown', (e) => {
    if (!frames) return;
    if (e.code === 'Space') {
        e.preventDefault();
        playing ? pause() : play();
    } else if (e.code === 'ArrowLeft') {
        pause();
        const prev = Math.max(0, +progressBar.value - 15); // ~0.5s jump
        progressBar.value = prev;
        showFrame(prev);
    } else if (e.code === 'ArrowRight') {
        pause();
        const next = Math.min(frames.length - 1, +progressBar.value + 15);
        progressBar.value = next;
        showFrame(next);
    }
});

function play() {
    if (!frames || playing) return;
    playing = true;
    updatePlayButton();
    playNext();
}

function pause() {
    playing = false;
    updatePlayButton();
    if (playTimer) { clearTimeout(playTimer); playTimer = null; }
}

function updatePlayButton() {
    playBtn.innerHTML = playing 
        ? '<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>'
        : '<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
}

function playNext() {
    if (!playing) return;
    let next = +progressBar.value + 1;
    if (next >= frames.length) {
        pause();
        return;
    }
    progressBar.value = next;
    showFrame(next);
    
    // Calculate delay based on frame duration
    const duration = mp4.getConfig().durations[next] || 33; // Default ~30fps
    playTimer = setTimeout(playNext, duration);
}

function showFrame(index) {
    if (!frames[index]) return;
    
    // Update Vis
    updateVisualization(frames[index].sei);
    updateTimeDisplay(index);

    // Decode & Render Video
    if (decoding) {
        pendingFrame = index;
    } else {
        decodeFrame(index);
    }
}

async function decodeFrame(index) {
    decoding = true;
    try {
        // Find preceding keyframe
        let keyIdx = index;
        while (keyIdx >= 0 && !frames[keyIdx].keyframe) keyIdx--;
        if (keyIdx < 0) return; // Should not happen if firstKeyframe is correct

        if (decoder) try { decoder.close(); } catch { }
        
        const targetCount = index - keyIdx + 1;
        let count = 0;

        await new Promise((resolve, reject) => {
            decoder = new VideoDecoder({
                output: frame => {
                    count++;
                    if (count === targetCount) {
                        ctx.drawImage(frame, 0, 0);
                    }
                    frame.close();
                    if (count >= targetCount) resolve();
                },
                error: reject
            });

            const config = mp4.getConfig();
            decoder.configure({
                codec: config.codec,
                width: config.width,
                height: config.height
            });

            for (let i = keyIdx; i <= index; i++) {
                decoder.decode(createChunk(frames[i]));
            }
            decoder.flush().catch(reject);
        });
    } catch (e) {
        console.error('Decode error:', e);
    } finally {
        decoding = false;
        if (pendingFrame !== null) {
            const next = pendingFrame;
            pendingFrame = null;
            decodeFrame(next);
        }
    }
}

function createChunk(frame) {
    const sc = new Uint8Array([0, 0, 0, 1]);
    const config = mp4.getConfig();
    const data = frame.keyframe
        ? DashcamMP4.concat(sc, frame.sps || config.sps, sc, frame.pps || config.pps, sc, frame.data)
        : DashcamMP4.concat(sc, frame.data);
        
    return new EncodedVideoChunk({
        type: frame.keyframe ? 'key' : 'delta',
        timestamp: frame.index * 33333, // approx timestamp
        data
    });
}

// Visualization Logic
function updateVisualization(sei) {
    if (!sei) return;

    // Speed
    const mps = sei.vehicle_speed_mps || 0;
    const mph = Math.round(mps * MPS_TO_MPH);
    speedValue.textContent = mph;

    // Gear
    // Protocol: 0=Park, 1=Drive, 2=Reverse, 3=Neutral (Check proto definition)
    // From file read: GEAR_PARK=0, GEAR_DRIVE=1, GEAR_REVERSE=2, GEAR_NEUTRAL=3
    const gear = sei.gear_state; 
    // Reset gears
    [gearP, gearR, gearN, gearD].forEach(el => el.classList.remove('active'));
    
    if (gear === 0) gearP.classList.add('active'); // P
    else if (gear === 1) gearD.classList.add('active'); // D
    else if (gear === 2) gearR.classList.add('active'); // R
    else if (gear === 3) gearN.classList.add('active'); // N

    // Blinkers
    blinkLeft.classList.toggle('active', !!sei.blinker_on_left);
    blinkRight.classList.toggle('active', !!sei.blinker_on_right);

    // Steering
    // steering_wheel_angle is likely degrees.
    const angle = sei.steering_wheel_angle || 0;
    steeringIcon.style.transform = `rotate(${angle}deg)`;

    // Autopilot
    // 0=NONE, 1=SELF_DRIVING, 2=AUTOSTEER, 3=TACC
    const apState = sei.autopilot_state;
    autopilotStatus.className = 'autopilot-status'; // Reset
    if (apState === 2 || apState === 3) {
        autopilotStatus.classList.add('active-ap');
        apText.textContent = apState === 3 ? 'TACC' : 'Autosteer';
    } else if (apState === 1) {
        autopilotStatus.classList.add('active-fsd'); // Or just use same blue/rainbow
        apText.textContent = 'FSD';
    } else {
        apText.textContent = 'Manual';
    }

    // Pedals
    // Brake
    if (sei.brake_applied) {
        brakeInd.classList.add('active');
    } else {
        brakeInd.classList.remove('active');
    }

    // Accelerator
    // Value is typically 0-100 or 0-1.
    // Assuming 0-100 based on protobuf float type common usage, but will clamp.
    let accel = sei.accelerator_pedal_position || 0;
    // Heuristic: if value is consistently <= 1.0 and user is moving, it might be 0-1.
    // But dashcam data usually stores % as 0-100.
    if (accel > 100) accel = 100;
    if (accel < 0) accel = 0;
    
    // If we suspect 0-1 range (e.g. max observed is 1.0), we might need to multiply.
    // However, existing knowledge of Tesla data suggests 0-100.
    accelBar.style.width = `${accel}%`;

    // Extra Data
    if (extraDataContainer.classList.contains('expanded')) {
        valLat.textContent = (sei.latitude_deg || 0).toFixed(6);
        valLon.textContent = (sei.longitude_deg || 0).toFixed(6);
        valHeading.textContent = (sei.heading_deg || 0).toFixed(1) + '°';
        
        valAccX.textContent = (sei.linear_acceleration_mps2_x || 0).toFixed(2);
        valAccY.textContent = (sei.linear_acceleration_mps2_y || 0).toFixed(2);
        valAccZ.textContent = (sei.linear_acceleration_mps2_z || 0).toFixed(2);
    }
}

// Toggle Extra Data
toggleExtra.onclick = () => {
    extraDataContainer.classList.toggle('expanded');
    // Refresh data if expanding while paused
    if (extraDataContainer.classList.contains('expanded') && frames && progressBar.value) {
         updateVisualization(frames[+progressBar.value].sei);
    }
};

function updateTimeDisplay(frameIndex) {
    // Crude time display based on frame count (approx 30fps)
    const seconds = Math.floor(frameIndex / 30);
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    timeDisplay.textContent = `${m}:${s}`;
}


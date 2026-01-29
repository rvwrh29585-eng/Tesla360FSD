import { state, CAMS } from "./state.js";
import { loadPresets, applyPreset, applyPresetByName } from "./presets.js";
import { initTelemetry, loadTelemetryForFile, updateVisForCurrentTime } from "./telemetry.js";
import {
  loadVideos,
  initThree,
  renderLoop,
  pauseExperience,
  resumeExperience,
  teardownExperience,
} from "./stitcher.js";

const statusText = document.getElementById("statusText");
const togglePlayButton = document.getElementById("togglePlayButton");
const camToggle = document.getElementById("camToggle");
const camControlsWrap = document.getElementById("camControlsWrap");
const viewToggle = document.getElementById("viewToggle");
const viewControlsWrap = document.getElementById("viewControlsWrap");
const collapseUiBtn = document.getElementById("collapseUiBtn");
const uiRoot = document.getElementById("ui");
const fovScaleSlider = document.getElementById("fovScaleSlider");
const fovScaleValue = document.getElementById("fovScaleValue");
const presetSelect = document.getElementById("presetSelect");
const prioritySelect = document.getElementById("prioritySelect");
const invertControlsToggle = document.getElementById("invertControlsToggle");
const lockPitchToggle = document.getElementById("lockPitchToggle");
const chooseFolderBtn = document.getElementById("chooseFolderBtn");
const folderInput = document.getElementById("folderInput");
const eventSelect = document.getElementById("eventSelect");
const seekSlider = document.getElementById("seekSlider");
const currentTimeLabel = document.getElementById("currentTime");
const durationTimeLabel = document.getElementById("durationTime");
const viewerEl = document.getElementById("viewer");
const ffmpegHelpBtn = document.getElementById("ffmpegHelpBtn");
const calendarToggle = document.getElementById("calendarToggle");
const calendarPopover = document.getElementById("calendarPopover");
const calendarContainer = document.getElementById("calendarContainer");
const calendarEventsList = document.getElementById("calendarEventsList");
const exportPresetBtn = document.getElementById("exportPresetBtn");
const presetExportText = document.getElementById("presetExportText");
const exportStatus = document.getElementById("exportStatus");
const resetViewBtn = document.getElementById("resetViewBtn");
const resetCamsBtn = document.getElementById("resetCamsBtn");
const advancedToggle = document.getElementById("advancedToggle");
const advancedWrap = document.getElementById("advancedWrap");

function setStatus(text) {
  if (statusText) statusText.textContent = text;
}

function formatTime(t) {
  if (!Number.isFinite(t)) return "00:00";
  const mins = Math.floor(t / 60);
  const secs = Math.floor(t % 60);
  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}

function normalizeCamId(name) {
  return name.toLowerCase().replace(/[\s_-]/g, "") === "rear" ? "back" : name.toLowerCase().replace(/[\s_-]/g, "");
}

function buildCamControls() {
  const container = document.getElementById("camControls");
  if (!container) return;

  state.currentYawDeg = CAMS.map((c) => c.yawDeg);
  state.currentFovHDeg = CAMS.map((c) => c.fovH);
  state.enabledFlags = CAMS.map(() => true);
  state.yawInputs = [];
  state.yawValues = [];
  state.fovInputs = [];
  state.fovValues = [];
  state.toggleInputs = [];

  CAMS.forEach((cam, idx) => {
    const group = document.createElement("div");
    group.className = "cam-group";

    const title = document.createElement("div");
    title.className = "cam-title";
    title.textContent = `${cam.id.replace("_", " ").toUpperCase()}`;
    group.appendChild(title);

    const yawRow = document.createElement("div");
    yawRow.className = "cam-slider-row";
    const yawLabel = document.createElement("label");
    yawLabel.textContent = `Yaw: `;
    const yawValue = document.createElement("span");
    yawValue.textContent = `${cam.yawDeg}°`;
    yawLabel.appendChild(yawValue);
    const yawInput = document.createElement("input");
    yawInput.type = "range";
    yawInput.min = 0;
    yawInput.max = 360;
    yawInput.step = 1;
    yawInput.value = cam.yawDeg;
    yawInput.addEventListener("input", (e) => {
      const val = parseFloat(e.target.value);
      state.currentYawDeg[idx] = val;
      yawValue.textContent = `${val}°`;
      updateCamUniforms();
    });
    yawRow.appendChild(yawLabel);
    yawRow.appendChild(yawInput);
    group.appendChild(yawRow);
    state.yawInputs.push(yawInput);
    state.yawValues.push(yawValue);

    const fovRow = document.createElement("div");
    fovRow.className = "cam-slider-row";
    const fovLabel = document.createElement("label");
    fovLabel.textContent = `FOV: `;
    const fovValue = document.createElement("span");
    fovValue.textContent = `${cam.fovH}°`;
    fovLabel.appendChild(fovValue);
    const fovInput = document.createElement("input");
    fovInput.type = "range";
    fovInput.min = 80;
    fovInput.max = 160;
    fovInput.step = 1;
    fovInput.value = cam.fovH;
    fovInput.addEventListener("input", (e) => {
      const val = parseFloat(e.target.value);
      state.currentFovHDeg[idx] = val;
      fovValue.textContent = `${val}°`;
      updateCamUniforms();
    });
    fovRow.appendChild(fovLabel);
    fovRow.appendChild(fovInput);
    group.appendChild(fovRow);
    state.fovInputs.push(fovInput);
    state.fovValues.push(fovValue);

    const toggleRow = document.createElement("div");
    toggleRow.className = "cam-toggle-row";
    const toggleInput = document.createElement("input");
    toggleInput.type = "checkbox";
    toggleInput.checked = true;
    toggleInput.addEventListener("change", (e) => {
      state.enabledFlags[idx] = e.target.checked;
      updateCamUniforms();
    });
    const toggleLabel = document.createElement("label");
    toggleLabel.textContent = "Enabled";
    toggleRow.appendChild(toggleInput);
    toggleRow.appendChild(toggleLabel);
    group.appendChild(toggleRow);
    state.toggleInputs.push(toggleInput);

    container.appendChild(group);
  });
}

function updateCamUniforms() {
  if (!state.material?.uniforms) return;
  const yawArr = state.currentYawDeg.map((d) => (d * Math.PI) / 180);
  const fovHArr = state.currentFovHDeg.map((deg) => {
    const scaled = deg * state.fovScale;
    const clamped = Math.max(5, Math.min(170, scaled));
    return (clamped * Math.PI) / 180;
  });
  const fovVArr = state.currentFovHDeg.map((deg, idx) => {
    const scaled = deg * state.fovScale;
    const clamped = Math.max(5, Math.min(170, scaled));
    const aspect = CAMS[idx].width / CAMS[idx].height;
    return 2 * Math.atan(Math.tan((clamped * Math.PI) / 180 / 2) / aspect);
  });
  state.material.uniforms.yaw.value = yawArr;
  state.material.uniforms.fovH.value = fovHArr;
  state.material.uniforms.fovV.value = fovVArr;
  state.material.uniforms.enabled.value = state.enabledFlags;
  if (state.material.uniforms.priorityCam) {
    state.material.uniforms.priorityCam.value = state.priorityCam;
  }
  state.material.needsUpdate = true;
}

function setUiCollapsed(next) {
  state.uiCollapsed = next;
  if (!uiRoot) return;
  if (state.uiCollapsed) {
    uiRoot.classList.add("collapsed");
  } else {
    uiRoot.classList.remove("collapsed");
  }
}

function clearObjectUrls() {
  state.objectUrls.forEach((url) => URL.revokeObjectURL(url));
  state.objectUrls = [];
}

function deriveCamId(name) {
  const match = name.match(/^(.*)-(front|back|left_pillar|left_repeater|right_pillar|right_repeater)\.mp4$/i);
  if (!match) return null;
  return match[2].toLowerCase();
}

function parseFolderFiles(fileList) {
  state.eventMap = new Map();
  for (const f of fileList) {
    if (!f.name.toLowerCase().endsWith(".mp4")) continue;
    const camId = deriveCamId(f.name);
    if (!camId) continue;
    const prefix = f.name.replace(/-(front|back|left_pillar|left_repeater|right_pillar|right_repeater)\.mp4$/i, "");
    if (!state.eventMap.has(prefix)) {
      state.eventMap.set(prefix, {});
    }
    state.eventMap.get(prefix)[camId] = f;
  }
  rebuildDateEventMap();
  initCalendar();
}

function populateEventSelect() {
  if (!eventSelect) return;
  eventSelect.innerHTML = "";
  const entries = Array.from(state.eventMap.keys()).sort();
  if (entries.length === 0) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "No events found";
    eventSelect.appendChild(opt);
    return;
  }
  entries.forEach((key) => {
    const opt = document.createElement("option");
    opt.value = key;
    opt.textContent = key;
    eventSelect.appendChild(opt);
  });
  state.currentEventKey = entries[0];
  eventSelect.value = state.currentEventKey;
}

function deriveDateKey(prefix) {
  const match = prefix.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : null;
}

function rebuildDateEventMap() {
  state.dateEventMap = new Map();
  for (const key of state.eventMap.keys()) {
    const dateKey = deriveDateKey(key);
    if (!dateKey) continue;
    if (!state.dateEventMap.has(dateKey)) {
      state.dateEventMap.set(dateKey, { count: 0, events: [] });
    }
    const entry = state.dateEventMap.get(dateKey);
    entry.count += 1;
    entry.events.push(key);
  }
}

function renderEventListForDate(dateKey) {
  if (!calendarEventsList) return;
  calendarEventsList.innerHTML = "";
  const entry = state.dateEventMap.get(dateKey);
  if (!entry) {
    calendarEventsList.textContent = "No events for this day.";
    return;
  }
  const sorted = [...entry.events].sort();
  sorted.forEach((key) => {
    const row = document.createElement("div");
    row.className = "event-row";
    row.dataset.eventKey = key;
    const timePart = key.split("_")[1] || key;
    row.innerHTML = `<div>${key}</div><div class="time">${timePart}</div>`;
    row.addEventListener("click", () => {
      if (eventSelect) eventSelect.value = key;
      applyEventSources(key);
      hideCalendarPopover();
    });
    calendarEventsList.appendChild(row);
  });
}

function heatTier(count) {
  if (count >= 5) return 4;
  if (count >= 3) return 3;
  if (count >= 2) return 2;
  if (count >= 1) return 1;
  return 0;
}

function initCalendar() {
  if (!calendarContainer || typeof flatpickr === "undefined") return;
  if (state.calendarInstance) {
    state.calendarInstance.destroy();
    state.calendarInstance = null;
  }
  state.calendarInstance = flatpickr(calendarContainer, {
    inline: true,
    static: true,
    defaultDate: state.calendarSelectedDate || "today",
    onDayCreate: (_dObj, _dStr, fp, dayElem) => {
      const dateKey = dayElem.dateObj.toISOString().slice(0, 10);
      const entry = state.dateEventMap.get(dateKey);
      const tier = heatTier(entry?.count || 0);
      dayElem.classList.add(`heat-${tier}`);
      if (entry?.count) {
        dayElem.title = `${entry.count} event${entry.count > 1 ? "s" : ""}`;
      }
    },
    onChange: (selectedDates) => {
      if (!selectedDates.length) return;
      const dateKey = selectedDates[0].toISOString().slice(0, 10);
      state.calendarSelectedDate = dateKey;
      renderEventListForDate(dateKey);
    },
  });
  if (state.calendarSelectedDate) {
    renderEventListForDate(state.calendarSelectedDate);
  } else if (state.dateEventMap.size > 0) {
    const firstDate = [...state.dateEventMap.keys()].sort()[0];
    state.calendarSelectedDate = firstDate;
    state.calendarInstance?.setDate(firstDate, true);
    renderEventListForDate(firstDate);
  } else if (calendarEventsList) {
    calendarEventsList.textContent = "No events loaded.";
  }
}

function toggleCalendarPopover() {
  if (!calendarPopover) return;
  calendarPopover.classList.toggle("hidden");
}

function hideCalendarPopover() {
  if (!calendarPopover) return;
  calendarPopover.classList.add("hidden");
}

function applyEventSources(key) {
  if (!key || !state.eventMap.has(key)) return;
  state.currentEventKey = key;
  const dateKey = deriveDateKey(key);
  if (dateKey) {
    state.calendarSelectedDate = dateKey;
    if (state.calendarInstance && typeof state.calendarInstance.setDate === "function") {
      state.calendarInstance.setDate(dateKey, true);
    }
    renderEventListForDate(dateKey);
  }
  clearObjectUrls();
  const cams = state.eventMap.get(key);
  if (cams["front"]) {
    loadTelemetryForFile(cams["front"]);
  }
  CAMS.forEach((cam, idx) => {
    const file = cams[cam.id];
    if (file) {
      const url = URL.createObjectURL(file);
      state.objectUrls.push(url);
      cam.file = url;
      state.enabledFlags[idx] = true;
      if (state.toggleInputs[idx]) {
        state.toggleInputs[idx].checked = true;
        state.toggleInputs[idx].disabled = false;
      }
    } else {
      cam.file = "";
      state.enabledFlags[idx] = false;
      if (state.toggleInputs[idx]) {
        state.toggleInputs[idx].checked = false;
        state.toggleInputs[idx].disabled = true;
      }
    }
  });
  updateCamUniforms();
  startExperience();
  setUiCollapsed(true);
}

function setFovScale(val) {
  if (!fovScaleSlider) return;
  const min = parseFloat(fovScaleSlider.min) || 0.1;
  const max = parseFloat(fovScaleSlider.max) || 1.1;
  const clamped = Math.max(min, Math.min(max, val));
  state.fovScale = clamped;
  fovScaleSlider.value = clamped;
  if (fovScaleValue) fovScaleValue.textContent = `${clamped.toFixed(2)}x`;
  updateCamUniforms();
}

function startExperience() {
  if (state.isInitialized) {
    teardownExperience();
  }
  if (togglePlayButton) togglePlayButton.disabled = false;
  if (togglePlayButton) togglePlayButton.textContent = "Pause";
  state.isPaused = false;
  setStatus("Initializing…");
  loadVideos(seekSlider, currentTimeLabel, durationTimeLabel, setStatus)
    .then(() => {
      initThree(viewerEl);
      updateCamUniforms();
      renderLoop(seekSlider, currentTimeLabel, formatTime);
      setStatus("Playing");
      state.isInitialized = true;
      setUiCollapsed(true);
    })
    .catch((err) => {
      console.error(err);
      setStatus(err.message || "Failed to start");
    });
}

function pauseExperienceLocal() {
  pauseExperience(setStatus);
  state.isPaused = true;
  if (togglePlayButton) togglePlayButton.textContent = "Resume";
}

function resumeExperienceLocal() {
  resumeExperience(setStatus, seekSlider, currentTimeLabel, formatTime);
  state.isPaused = false;
  if (togglePlayButton) togglePlayButton.textContent = "Pause";
}

// --- UI wiring ---

initTelemetry();

buildCamControls();

if (camToggle && camControlsWrap) {
  let collapsed = true;
  const updateLabel = () => {
    camToggle.textContent = collapsed ? "Camera settings ▸" : "Camera settings ▾";
  };
  updateLabel();
  camControlsWrap.classList.toggle("collapsed", collapsed);
  camToggle.addEventListener("click", () => {
    collapsed = !collapsed;
    camControlsWrap.classList.toggle("collapsed", collapsed);
    updateLabel();
  });
}

if (viewToggle && viewControlsWrap) {
  let collapsed = false;
  const updateLabel = () => {
    viewToggle.textContent = collapsed ? "View settings ▸" : "View settings ▾";
  };
  updateLabel();
  viewControlsWrap.classList.toggle("collapsed", collapsed);
  viewToggle.addEventListener("click", () => {
    collapsed = !collapsed;
    viewControlsWrap.classList.toggle("collapsed", collapsed);
    updateLabel();
  });
}

if (collapseUiBtn) {
  collapseUiBtn.addEventListener("click", () => {
    setUiCollapsed(!state.uiCollapsed);
  });
}

if (fovScaleSlider) {
  fovScaleSlider.value = state.defaultFovScale;
  if (fovScaleValue) fovScaleValue.textContent = `${state.defaultFovScale.toFixed(2)}x`;
  fovScaleSlider.addEventListener("input", (e) => {
    setFovScale(parseFloat(e.target.value));
  });
}

if (invertControlsToggle) {
  invertControlsToggle.checked = true;
  invertControlsToggle.addEventListener("change", (e) => {
    state.invertDrag = e.target.checked;
    if (state.controls) {
      state.controls.rotateSpeed = state.invertDrag ? -Math.abs(state.controls.rotateSpeed) : Math.abs(state.controls.rotateSpeed);
    }
  });
}

if (lockPitchToggle) {
  lockPitchToggle.checked = state.lockPitch;
  lockPitchToggle.addEventListener("change", (e) => {
    state.lockPitch = e.target.checked;
    if (state.controls) {
      if (state.lockPitch) {
        state.controls.minPolarAngle = Math.PI / 2;
        state.controls.maxPolarAngle = Math.PI / 2;
      } else {
        state.controls.minPolarAngle = 0;
        state.controls.maxPolarAngle = Math.PI;
      }
    }
  });
}

if (prioritySelect) {
  prioritySelect.innerHTML = "";
  const noneOpt = document.createElement("option");
  noneOpt.value = "-1";
  noneOpt.textContent = "None";
  prioritySelect.appendChild(noneOpt);
  CAMS.forEach((cam, idx) => {
    const opt = document.createElement("option");
    opt.value = idx.toString();
    opt.textContent = cam.id.replace("_", " ");
    prioritySelect.appendChild(opt);
  });
  prioritySelect.value = "-1";
  prioritySelect.addEventListener("change", (e) => {
    state.priorityCam = parseInt(e.target.value, 10);
    if (Number.isNaN(state.priorityCam)) state.priorityCam = -1;
    if (state.material?.uniforms?.priorityCam) {
      state.material.uniforms.priorityCam.value = state.priorityCam;
      state.material.needsUpdate = true;
    }
  });
}

if (togglePlayButton) {
  togglePlayButton.addEventListener("click", () => {
    if (!state.isInitialized) return;
    if (state.isPaused) {
      resumeExperienceLocal();
    } else {
      pauseExperienceLocal();
    }
  });
}

if (seekSlider) {
  seekSlider.addEventListener("input", (e) => {
    state.isSeeking = true;
    const val = parseFloat(e.target.value);
    if (currentTimeLabel) currentTimeLabel.textContent = formatTime(val);
    updateVisForCurrentTime(val);
  });
  seekSlider.addEventListener("change", (e) => {
    const val = parseFloat(e.target.value);
    state.isSeeking = false;
    state.videoElements.forEach((v) => {
      if (v) v.currentTime = val;
    });
    if (currentTimeLabel) currentTimeLabel.textContent = formatTime(val);
    updateVisForCurrentTime(val);
  });
}

const viewerElDiv = document.getElementById("viewer");
if (viewerElDiv && fovScaleSlider) {
  viewerElDiv.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      const delta = -e.deltaY * 0.001;
      setFovScale(state.fovScale + delta);
    },
    { passive: false }
  );
}

if (chooseFolderBtn && folderInput) {
  chooseFolderBtn.addEventListener("click", () => {
    folderInput.click();
  });
  folderInput.addEventListener("change", (e) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    parseFolderFiles(files);
    populateEventSelect();
    if (state.currentEventKey) {
      applyEventSources(state.currentEventKey);
    }
  });
}

if (eventSelect) {
  eventSelect.addEventListener("change", (e) => {
    const key = e.target.value;
    applyEventSources(key);
  });
}

if (calendarToggle) {
  calendarToggle.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleCalendarPopover();
  });
}

if (calendarPopover) {
  calendarPopover.addEventListener("click", (e) => e.stopPropagation());
  document.addEventListener("click", () => hideCalendarPopover());
}

if (advancedToggle && advancedWrap) {
  let collapsed = true;
  const syncAdvanced = () => {
    advancedWrap.classList.toggle("hidden", collapsed);
    advancedToggle.textContent = collapsed ? "Advanced ▸" : "Advanced ▾";
  };
  // Force initial collapsed state
  collapsed = true;
  syncAdvanced();
  advancedToggle.addEventListener("click", () => {
    collapsed = !collapsed;
    syncAdvanced();
  });
}

if (exportPresetBtn && presetExportText) {
  exportPresetBtn.addEventListener("click", async () => {
    const csv = buildPresetCsv("CustomPreset");
    presetExportText.value = csv;
    presetExportText.focus();
    presetExportText.select();
    if (exportStatus) {
      exportStatus.classList.remove("hidden");
      exportStatus.textContent = "Copied to clipboard";
    }
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(csv);
        if (exportStatus) exportStatus.textContent = "Copied to clipboard";
      }
    } catch {
      if (exportStatus) exportStatus.textContent = "Copy unavailable in this browser";
    }
    if (exportStatus) {
      setTimeout(() => {
        exportStatus.classList.add("hidden");
      }, 1600);
    }
  });
}

if (resetViewBtn) {
  resetViewBtn.addEventListener("click", () => {
    const domRefs = { fovScaleSlider, fovScaleValue, lockPitchToggle, prioritySelect, updateCamUniforms };
    if (presetSelect && presetSelect.value !== "custom") {
      const idx = parseInt(presetSelect.value, 10);
      if (!Number.isNaN(idx) && state.presets && state.presets[idx]) {
        applyPreset(state.presets[idx], domRefs);
        updateCamUniforms();
        return;
      }
    }
    // Fallback if custom or invalid
    applyPresetByName("Default View", domRefs);
  });
}

if (resetCamsBtn) {
  resetCamsBtn.addEventListener("click", () => {
    applyPresetByName("Default View", { camsOnly: true });
  });
}

function titleCaseId(id) {
  return id
    .split("_")
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join("");
}

function buildPresetCsv(name = "Custom") {
  const lines = [];
  const fovScale = state.fovScale ?? state.defaultFovScale ?? 1;
  lines.push(`Name,${name}`);
  lines.push(`GlobalFOVscale,${fovScale.toFixed(2)}`);
  const priorityCamIdx = Number.isInteger(state.priorityCam) ? state.priorityCam : -1;
  const priorityLabel = priorityCamIdx >= 0 && CAMS[priorityCamIdx] ? CAMS[priorityCamIdx].id : "None";
  lines.push(`PriorityCam,${priorityLabel}`);
  CAMS.forEach((cam, idx) => {
    const yaw = (state.currentYawDeg?.[idx] ?? cam.yawDeg ?? 0).toFixed(0);
    const fov = (state.currentFovHDeg?.[idx] ?? cam.fovH ?? 100).toFixed(0);
    const enabled = state.enabledFlags?.[idx] ?? true;
    const label = titleCaseId(cam.id);
    lines.push(`${label},Yaw,${yaw},FOV,${fov},${enabled ? "Enabled" : "Disabled"}`);
  });
  lines.push(`LockPitch,${state.lockPitch ? "true" : "false"}`);
  return lines.join("\n");
}

// Load presets and apply first
loadPresets(presetSelect, { fovScaleSlider, fovScaleValue, lockPitchToggle, prioritySelect, updateCamUniforms });

// Default collapsed on initial load
setUiCollapsed(true);

if (ffmpegHelpBtn) {
  ffmpegHelpBtn.addEventListener("click", () => {
    const evt = eventSelect?.value || "2025-12-05_15-56-45";
    const base = "/Volumes/TESLADRIVE/TeslaCam/RecentClips";
    const cmd = [
      `# Offline FFmpeg template (recommended for quality & speed)`,
      `# 1) Update EVENT path to your TeslaCam event folder`,
      `# 2) Replace the placeholder overlay chain with your real projection (or a LUT/GLSL filter)`,
      `# 3) Inject 360 metadata, then upload to YouTube`,
      ``,
      `EVENT="${base}/${evt}"`,
      `OUT="output-360.mp4"`,
      `ffmpeg \\`,
      ` -i "$EVENT/${evt}-front.mp4" \\`,
      ` -i "$EVENT/${evt}-back.mp4" \\`,
      ` -i "$EVENT/${evt}-left_pillar.mp4" \\`,
      ` -i "$EVENT/${evt}-left_repeater.mp4" \\`,
      ` -i "$EVENT/${evt}-right_repeater.mp4" \\`,
      ` -i "$EVENT/${evt}-right_pillar.mp4" \\`,
      ` -filter_complex "\\`,
      `  nullsrc=size=4096x2048[base]; \\`,
      `  [0:v]setpts=PTS-STARTPTS[front]; \\`,
      `  [1:v]setpts=PTS-STARTPTS[back]; \\`,
      `  [2:v]setpts=PTS-STARTPTS[lpi]; \\`,
      `  [3:v]setpts=PTS-STARTPTS[lre]; \\`,
      `  [4:v]setpts=PTS-STARTPTS[rre]; \\`,
      `  [5:v]setpts=PTS-STARTPTS[rpi]; \\`,
      `  # TODO: replace this tiling with your actual spherical mapping (like your GLSL shader)`,
      `  [base][front]overlay=0:0[tmp1]; \\`,
      `  [tmp1][back]overlay=2048:0[tmp2]; \\`,
      `  [tmp2][lpi]overlay=0:1024[tmp3]; \\`,
      `  [tmp3][lre]overlay=1024:1024[tmp4]; \\`,
      `  [tmp4][rre]overlay=2048:1024[tmp5]; \\`,
      `  [tmp5][rpi]overlay=3072:1024 \\`,
      `" \\`,
      ` -c:v libx264 -crf 18 -preset medium -pix_fmt yuv420p "$OUT"`,
      ``,
      `# Inject 360 metadata (YouTube requires it)`,
      `# Option A: Spatial Media Metadata Injector (GUI)`,
      `# Option B (may not set all flags):`,
      `# ffmpeg -i "$OUT" -c copy \\`,
      `#   -metadata:s:v:0 spherical_video=true -metadata:s:v:0 stereo_mode=mono \\`,
      `#   output-360-meta.mp4`,
      ``,
      `# About web ffmpeg (ffmpeg.wasm):`,
      `# - It can run in-browser but is slow and memory-heavy for six HD streams;`,
      `# - Practical only for short clips / low resolutions;`,
      `# - Still need a metadata injection step (likely off-browser).`,
    ].join("\n");
    alert(cmd);
  });
}

// Spacebar to toggle play/pause
document.addEventListener("keydown", (e) => {
  if (e.code === "Space" && e.target.tagName !== "INPUT" && e.target.tagName !== "TEXTAREA") {
    e.preventDefault();
    if (!state.isInitialized) return;
    if (state.isPaused) {
      resumeExperienceLocal();
    } else {
      pauseExperienceLocal();
    }
  }
});

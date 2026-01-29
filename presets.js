import { state, CAMS } from "./state.js";

function normalizeCamId(name) {
  return name.toLowerCase().replace(/[\s_-]/g, "") === "rear" ? "back" : name.toLowerCase().replace(/[\s_-]/g, "");
}

function findCamIndex(name) {
  const key = normalizeCamId(name);
  return CAMS.findIndex((c) => normalizeCamId(c.id) === key);
}

export function applyPreset(preset, domRefs) {
  if (!preset) return;
  const { fovScaleSlider, fovScaleValue, lockPitchToggle, prioritySelect, updateCamUniforms } = domRefs;

  if (preset.globalFovScale !== undefined) {
    state.fovScale = preset.globalFovScale;
    if (fovScaleSlider) fovScaleSlider.value = state.fovScale;
    if (fovScaleValue) fovScaleValue.textContent = `${state.fovScale.toFixed(2)}x`;
  }

  preset.cams.forEach((p) => {
    const idx = findCamIndex(p.id);
    if (idx === -1) return;
    if (p.yaw !== undefined) {
      state.currentYawDeg[idx] = p.yaw;
      if (state.yawInputs[idx]) state.yawInputs[idx].value = p.yaw;
      if (state.yawValues[idx]) state.yawValues[idx].textContent = `${p.yaw}°`;
    }
    if (p.fov !== undefined) {
      state.currentFovHDeg[idx] = p.fov;
      if (state.fovInputs[idx]) state.fovInputs[idx].value = p.fov;
      if (state.fovValues[idx]) state.fovValues[idx].textContent = `${p.fov}°`;
    }
    if (p.enabled !== undefined) {
      state.enabledFlags[idx] = p.enabled;
      if (state.toggleInputs[idx]) state.toggleInputs[idx].checked = p.enabled;
    }
  });

  if (preset.lockPitch !== undefined) {
    state.lockPitch = preset.lockPitch;
    if (lockPitchToggle) lockPitchToggle.checked = state.lockPitch;
    if (state.controls) {
      if (state.lockPitch) {
        state.controls.minPolarAngle = Math.PI / 2;
        state.controls.maxPolarAngle = Math.PI / 2;
      } else {
        state.controls.minPolarAngle = 0;
        state.controls.maxPolarAngle = Math.PI;
      }
    }
  }

  const nextPriority = Number.isInteger(preset.priorityCam) ? preset.priorityCam : -1;
  state.priorityCam = nextPriority;
  if (prioritySelect) {
    prioritySelect.value = state.priorityCam.toString();
  }
  if (state.material?.uniforms?.priorityCam) {
    state.material.uniforms.priorityCam.value = state.priorityCam;
    state.material.needsUpdate = true;
  }
  updateCamUniforms?.();
}

export function applyPresetByName(name, domRefs, options = {}) {
  if (!state.presets || !state.presets.length) return false;
  const target = state.presets.find((p) => (p.name || "").toLowerCase() === (name || "").toLowerCase());
  if (!target) return false;
  if (options.camsOnly) {
    const stripped = {
      name: target.name,
      cams: target.cams,
      // keep current global values
    };
    applyPreset(stripped, domRefs);
    domRefs.updateCamUniforms?.();
    return true;
  }
  applyPreset(target, domRefs);
  domRefs.updateCamUniforms?.();
  return true;
}

function parsePresetCsvText(text) {
  const lines = text.split(/\r?\n/).map((l) => l.trim());
  const presets = [];
  let current = null;

  const pushCurrent = () => {
    if (current && current.name) presets.push(current);
  };

  for (const line of lines) {
    if (!line) continue;
    const parts = line.split(",");
    const head = parts[0].toLowerCase();
    if (head === "name") {
      pushCurrent();
      current = { name: parts[1] || "Preset", globalFovScale: undefined, cams: [], lockPitch: undefined, priorityCam: undefined };
    } else if (head === "globalfovscale") {
      if (!current) current = { name: "Preset", globalFovScale: undefined, cams: [], lockPitch: undefined, priorityCam: undefined };
      current.globalFovScale = parseFloat(parts[1]);
    } else if (head === "lockpitch") {
      if (!current) current = { name: "Preset", globalFovScale: undefined, cams: [], lockPitch: undefined, priorityCam: undefined };
      current.lockPitch = parts[1]?.toLowerCase() === "true";
    } else if (head === "priority" || head === "prioritycam") {
      if (!current) current = { name: "Preset", globalFovScale: undefined, cams: [], lockPitch: undefined, priorityCam: undefined };
      const raw = (parts[1] || "").toLowerCase();
      if (raw === "none" || raw === "") {
        current.priorityCam = -1;
      } else {
        const idxFromId = findCamIndex(parts[1]);
        const numeric = parseInt(parts[1], 10);
        current.priorityCam = Number.isInteger(idxFromId) && idxFromId >= 0 ? idxFromId : Number.isNaN(numeric) ? -1 : numeric;
      }
    } else {
      if (!current) current = { name: "Preset", globalFovScale: undefined, cams: [], lockPitch: undefined, priorityCam: undefined };
      const camId = parts[0];
      const yawIdx = parts.findIndex((p) => p.toLowerCase() === "yaw");
      const fovIdx = parts.findIndex((p) => p.toLowerCase() === "fov");
      const yaw = yawIdx >= 0 ? parseFloat(parts[yawIdx + 1]) : undefined;
      const fov = fovIdx >= 0 ? parseFloat(parts[fovIdx + 1]) : undefined;
      const enabled = parts.some((p) => p.toLowerCase() === "enabled")
        ? true
        : parts.some((p) => p.toLowerCase() === "disabled")
        ? false
        : true;
      current.cams.push({ id: camId, yaw, fov, enabled });
    }
  }
  pushCurrent();
  return presets;
}

export async function loadPresets(presetSelect, domRefs) {
  try {
    const resp = await fetch("./presets.csv");
    const text = await resp.text();
    state.presets = parsePresetCsvText(text);

    if (presetSelect) {
      presetSelect.innerHTML = "";
      state.presets.forEach((p, idx) => {
        const opt = document.createElement("option");
        opt.value = idx.toString();
        opt.textContent = p.name;
        presetSelect.appendChild(opt);
      });
      const customOpt = document.createElement("option");
      customOpt.value = "custom";
      customOpt.textContent = "Custom…";
      presetSelect.appendChild(customOpt);

      presetSelect.addEventListener("change", (e) => {
        if (e.target.value === "custom") {
          const pasted = window.prompt("Paste a presets.csv snippet for your custom preset:", "");
          if (!pasted) return;
          const customPresets = parsePresetCsvText(pasted);
          if (!customPresets.length) {
            alert("Could not parse that CSV. Please check the format.");
            return;
          }
          applyPreset(customPresets[0], domRefs);
          domRefs.updateCamUniforms?.();
          return;
        }
        const idx = parseInt(e.target.value, 10);
        if (!Number.isNaN(idx) && state.presets[idx]) {
          applyPreset(state.presets[idx], domRefs);
          domRefs.updateCamUniforms?.();
        }
      });
    }

    if (state.presets.length > 0) {
      applyPreset(state.presets[0], domRefs);
      domRefs.updateCamUniforms?.();
    }
  } catch (err) {
    console.warn("Failed to load presets", err);
  }
}


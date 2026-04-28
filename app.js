const defaults = {
  camera: {
    model: "bbx60",
    resolutionMode: "full",
    resW: 2048,
    resH: 1536,
    x: 0,
    y: 1.6,
    z: 0,
    yaw: 0,
    pitch: 12,
  },
  stereo: {
    mode: "stereoRight",
    manualX: 0.24,
    manualY: 1.6,
    manualZ: 0,
    manualYaw: 0,
    manualPitch: 12,
  },
  object: {
    mode: "box",
    x: 1.2,
    z: 12,
    yaw: 18,
    w: 1.8,
    h: 1.2,
    d: 2.8,
    lift: 0,
  },
  ground: {
    y: 0,
    type: "flat",
    slope: 8,
    sideSlope: 14,
    roadWidth: 6,
    sideWidth: 8,
  },
  bev: {
    extent: 30,
    pixelTol: 1,
    unitsX: 300,
    unitsZ: 300,
    unitLength: 0.1,
    autoObjectCenter: true,
    lockMode: "unit",
  },
};

let state = structuredClone(defaults);

const objectZSlider = {
  sliderMin: 0,
  sliderMax: 1000,
  valueMin: 1,
  valueMid: 120,
  valueMax: 300,
};

const layerColors = {
  roadTruthFill: "rgba(74, 82, 86, 0.74)",
  roadTruthStroke: "rgba(246, 248, 241, 0.80)",
  shoulderFill: "rgba(132, 144, 99, 0.45)",
  roadEstimateFill: "rgba(131, 82, 214, 0.18)",
  roadEstimateStroke: "#b592ff",
  bboxFill: "rgba(217, 109, 47, 0.26)",
  bboxStroke: "#ffb088",
  bboxPartialFill: "rgba(255, 95, 95, 0.18)",
  bboxPartialStroke: "#ff5f5f",
  bboxStrokeHidden: "#ff5f5f",
  nearestFill: "rgba(0, 127, 122, 0.24)",
  nearestStroke: "#58c7bd",
  truthFill: "rgba(217, 109, 47, 0.24)",
  truthStroke: "#d96d2f",
  truthCenter: "#ffd166",
  imagePoint: "#315dba",
};

const uiSampleCounts = {
  bboxBottom: 5,
};

const cameraModels = {
  bbx60: {
    label: "Bumblebee X 60",
    hFovDeg: 60,
    baselineM: 0.24,
    resolutions: {
      full: { width: 2048, height: 1536 },
      quarter: { width: 1024, height: 768 },
    },
  },
  bbx80: {
    label: "Bumblebee X 80",
    hFovDeg: 80,
    baselineM: 0.24,
    resolutions: {
      full: { width: 2048, height: 1536 },
      quarter: { width: 1024, height: 768 },
    },
  },
  bbx105: {
    label: "Bumblebee X 105",
    hFovDeg: 105,
    baselineM: 0.24,
    resolutions: {
      full: { width: 2048, height: 1152 },
      quarter: { width: 1024, height: 576 },
    },
  },
};

const canvases = {
  world: document.getElementById("worldCanvas"),
  image: document.getElementById("imageCanvas"),
  bev: document.getElementById("bevCanvas"),
  bevZoom: document.getElementById("bevZoomCanvas"),
};

const plots = {
  world: document.getElementById("worldPlot"),
  image: document.getElementById("imagePlot"),
  imageSub: document.getElementById("imagePlotSub"),
  bev: document.getElementById("bevPlot"),
  bevZoom: document.getElementById("bevZoomPlot"),
};

const outputs = {
  fov: document.getElementById("fovOutput"),
  cameraModel: document.getElementById("cameraModelOutput"),
  subCamera: document.getElementById("subCameraOutput"),
  bbox: document.getElementById("bboxOutput"),
  area: document.getElementById("areaOutput"),
  bevConfig: document.getElementById("bevConfigOutput"),
  contact: document.getElementById("contactOutput"),
  metrics: document.getElementById("metrics"),
};

const inputs = Array.from(document.querySelectorAll("[data-key]"));

function cameraModel() {
  return cameraModels[state.camera.model] || cameraModels.bbx60;
}

function leftCameraPose() {
  return {
    x: state.camera.x,
    y: state.camera.y,
    z: state.camera.z,
    yaw: state.camera.yaw,
    pitch: state.camera.pitch,
  };
}

function cameraBasisFromPose(pose) {
  const yaw = degToRad(pose.yaw);
  const pitch = degToRad(pose.pitch);
  const forward = normalize(vec(Math.sin(yaw) * Math.cos(pitch), -Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)));
  const right = normalize(vec(Math.cos(yaw), 0, -Math.sin(yaw)));
  const up = normalize(cross(forward, right));
  return { right, up, forward };
}

function subCameraPose() {
  if (state.stereo.mode === "manual") {
    return {
      x: state.stereo.manualX,
      y: state.stereo.manualY,
      z: state.stereo.manualZ,
      yaw: state.stereo.manualYaw,
      pitch: state.stereo.manualPitch,
    };
  }
  const left = leftCameraPose();
  const basis = cameraBasisFromPose(left);
  const baseline = cameraModel().baselineM || 0.24;
  return {
    x: left.x + basis.right.x * baseline,
    y: left.y + basis.right.y * baseline,
    z: left.z + basis.right.z * baseline,
    yaw: left.yaw,
    pitch: left.pitch,
  };
}

function applyCameraResolution() {
  const model = cameraModel();
  const resolution = model.resolutions[state.camera.resolutionMode] || model.resolutions.full;
  state.camera.resW = resolution.width;
  state.camera.resH = resolution.height;
}

function currentResolutionK() {
  return clamp(Math.round(state.camera.resW / 1024), 1, 16);
}

function dynamicLimitsForK(k) {
  return {
    "camera.x": { min: -20 * k, max: 20 * k },
    "camera.y": { max: 4 + k * 2 },
    "camera.z": { min: -300, max: 300 },
    "stereo.manualX": { min: -20 * k, max: 20 * k },
    "stereo.manualY": { max: 4 + k * 2 },
    "stereo.manualZ": { min: -300, max: 300 },
    "stereo.manualYaw": { min: -180, max: 180 },
    "stereo.manualPitch": { min: 0, max: 75 },
    "object.x": { min: -20 * k, max: 20 * k },
    "object.z": { min: objectZSlider.valueMin, max: objectZSlider.valueMax },
    "object.w": { max: 4 + k * 3 },
    "object.h": { max: 4 + k * 3 },
    "object.d": { max: 4 + k * 3 },
    "object.lift": { max: 2 + k * 2 },
    "ground.y": { min: -2 * k, max: 2 * k },
    "ground.slope": { min: 0, max: 25 },
    "ground.sideSlope": { max: 35 },
    "ground.roadWidth": { max: 5 * k + 10 },
    "ground.sideWidth": { max: 6 * k + 12 },
    "bev.extent": { max: 80 * k },
    "bev.pixelTol": { max: 8 * k },
    "bev.unitsX": { max: Math.min(4096, 256 * k + 512) },
    "bev.unitsZ": { max: Math.min(4096, 256 * k + 512) },
    "bev.unitLength": { min: 0.01, max: Math.min(5, 0.5 + k * 0.25) },
  };
}

function applyDynamicLimits() {
  const k = currentResolutionK();
  const limits = dynamicLimitsForK(k);

  for (const input of inputs) {
    const limit = limits[input.dataset.key];
    if (!limit) continue;

    if (input.dataset.sliderMode === "object-z-log") {
      input.min = String(objectZSlider.sliderMin);
      input.max = String(objectZSlider.sliderMax);
      input.step = "1";
      const clamped = clamp(getValue(input.dataset.key), limit.min, limit.max);
      if (clamped !== getValue(input.dataset.key)) setValue(input.dataset.key, clamped);
      continue;
    }

    if (limit.min !== undefined) input.min = String(limit.min);
    if (limit.max !== undefined) input.max = String(limit.max);

    const value = getValue(input.dataset.key);
    const min = input.min === "" ? -Infinity : Number(input.min);
    const max = input.max === "" ? Infinity : Number(input.max);
    const clamped = clamp(value, min, max);
    if (clamped !== value) setValue(input.dataset.key, clamped);
  }

}

function degToRad(deg) {
  return (deg * Math.PI) / 180;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function objectZFromSlider(sliderValue) {
  const cfg = objectZSlider;
  const t = clamp((sliderValue - cfg.sliderMin) / (cfg.sliderMax - cfg.sliderMin), 0, 1);
  if (t <= 0.5) {
    return cfg.valueMin * ((cfg.valueMid / cfg.valueMin) ** (t / 0.5));
  }
  return cfg.valueMid * ((cfg.valueMax / cfg.valueMid) ** ((t - 0.5) / 0.5));
}

function sliderFromObjectZ(value) {
  const cfg = objectZSlider;
  const z = clamp(value, cfg.valueMin, cfg.valueMax);
  let t;
  if (z <= cfg.valueMid) {
    t = 0.5 * (Math.log(z / cfg.valueMin) / Math.log(cfg.valueMid / cfg.valueMin));
  } else {
    t = 0.5 + 0.5 * (Math.log(z / cfg.valueMid) / Math.log(cfg.valueMax / cfg.valueMid));
  }
  return cfg.sliderMin + t * (cfg.sliderMax - cfg.sliderMin);
}

function vec(x = 0, y = 0, z = 0) {
  return { x, y, z };
}

function add(a, b) {
  return vec(a.x + b.x, a.y + b.y, a.z + b.z);
}

function sub(a, b) {
  return vec(a.x - b.x, a.y - b.y, a.z - b.z);
}

function mul(a, s) {
  return vec(a.x * s, a.y * s, a.z * s);
}

function dot(a, b) {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function cross(a, b) {
  return vec(
    a.y * b.z - a.z * b.y,
    a.z * b.x - a.x * b.z,
    a.x * b.y - a.y * b.x,
  );
}

function length(a) {
  return Math.hypot(a.x, a.y, a.z);
}

function normalize(a) {
  const len = length(a) || 1;
  return mul(a, 1 / len);
}

function getValue(path) {
  return path.split(".").reduce((obj, key) => obj[key], state);
}

function setValue(path, value) {
  const keys = path.split(".");
  const last = keys.pop();
  const parent = keys.reduce((obj, key) => obj[key], state);
  parent[last] = value;
}

function cameraBasis(pose = leftCameraPose()) {
  return cameraBasisFromPose(pose);
}

function intrinsics() {
  const { resW, resH } = state.camera;
  const model = cameraModel();
  const hFovRad = degToRad(model.hFovDeg);
  const fx = (resW / 2) / Math.tan(hFovRad / 2);
  const fy = fx;
  const vFovDeg = (2 * Math.atan((resH / 2) / fy) * 180) / Math.PI;
  return {
    fx,
    fy,
    cx: resW / 2,
    cy: resH / 2,
    hFovDeg: model.hFovDeg,
    vFovDeg,
    modelLabel: model.label,
    resolutionMode: state.camera.resolutionMode,
  };
}

function worldToCamera(point, pose = leftCameraPose()) {
  const basis = cameraBasis(pose);
  const camera = vec(pose.x, pose.y, pose.z);
  const rel = sub(point, camera);
  return vec(dot(rel, basis.right), dot(rel, basis.up), dot(rel, basis.forward));
}

function cameraToWorld(direction, pose = leftCameraPose()) {
  const basis = cameraBasis(pose);
  return normalize(add(add(mul(basis.right, direction.x), mul(basis.up, direction.y)), mul(basis.forward, direction.z)));
}

function project(point, pose = leftCameraPose()) {
  const p = worldToCamera(point, pose);
  const k = intrinsics();
  if (p.z <= 0.01) return null;
  return {
    u: k.cx + (k.fx * p.x) / p.z,
    v: k.cy - (k.fy * p.y) / p.z,
    depth: p.z,
  };
}

function rayFromPixel(u, v, pose = leftCameraPose()) {
  const k = intrinsics();
  const dirCam = normalize(vec((u - k.cx) / k.fx, -(v - k.cy) / k.fy, 1));
  return cameraToWorld(dirCam, pose);
}

function pointFromPixelDepth(u, v, depth, pose = leftCameraPose()) {
  const k = intrinsics();
  const basis = cameraBasis(pose);
  const origin = vec(pose.x, pose.y, pose.z);
  const xCam = ((u - k.cx) / k.fx) * depth;
  const yCam = (-(v - k.cy) / k.fy) * depth;
  return add(add(add(origin, mul(basis.right, xCam)), mul(basis.up, yCam)), mul(basis.forward, depth));
}

function cameraPointFromPixelDepth(u, v, depth) {
  const k = intrinsics();
  const xCam = ((u - k.cx) / k.fx) * depth;
  const yCam = (-(v - k.cy) / k.fy) * depth;
  return vec(xCam, yCam, depth);
}

function cameraXFromPixelDepth(u, depth) {
  const k = intrinsics();
  return ((u - k.cx) / k.fx) * depth;
}

function worldPointFromCameraXZ(xCam, depth, pose = leftCameraPose()) {
  const basis = bevGroundBasis(pose);
  const origin = vec(pose.x, pose.y, pose.z);
  return add(add(origin, mul(basis.right, xCam)), mul(basis.forward, depth));
}

function groundPlanePointFromPixelDepth(u, depth, pose = leftCameraPose()) {
  const cameraPoint = cameraPointFromPixelDepth(u, intrinsics().cy, depth);
  return worldPointFromCameraXZ(cameraPoint.x, cameraPoint.z, pose);
}

function convexHull(points) {
  if (!points || points.length <= 3) return points || null;
  const sorted = [...points]
    .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.z))
    .sort((a, b) => (a.x === b.x ? a.z - b.z : a.x - b.x));
  if (sorted.length <= 3) return sorted;

  const cross2 = (o, a, b) => (a.x - o.x) * (b.z - o.z) - (a.z - o.z) * (b.x - o.x);
  const lower = [];
  for (const p of sorted) {
    while (lower.length >= 2 && cross2(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper = [];
  for (let i = sorted.length - 1; i >= 0; i -= 1) {
    const p = sorted[i];
    while (upper.length >= 2 && cross2(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

function smoothstep(edge0, edge1, value) {
  const t = clamp((value - edge0) / Math.max(1e-6, edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function groundHeightAt(x, z) {
  const g = state.ground;
  const slopeAbs = Math.abs(g.slope);
  const side = Math.tan(degToRad(g.sideSlope));
  const halfRoad = g.roadWidth / 2;
  const shoulder = Math.max(0, Math.abs(x) - halfRoad);
  const bank = Math.min(shoulder, g.sideWidth);

  if (g.type === "uphillRoad") return g.y + Math.tan(degToRad(slopeAbs)) * z;
  if (g.type === "downhillRoad") return g.y - Math.tan(degToRad(slopeAbs)) * z;
  if (g.type === "sideUp") return g.y + bank * side;
  if (g.type === "sideDown") return g.y - bank * side;
  return g.y;
}

function terrainLabel() {
  return {
    flat: "平面",
    uphillRoad: "上り坂道",
    downhillRoad: "下り坂道",
    sideUp: "両脇上り坂",
    sideDown: "両脇下り坂",
  }[state.ground.type] || "平面";
}

function bevSizeMeters() {
  return {
    width: state.bev.unitsX * state.bev.unitLength,
    depth: state.bev.unitsZ * state.bev.unitLength,
    extent: Math.max(state.bev.unitsX, state.bev.unitsZ) * state.bev.unitLength,
  };
}

function roundToStep(value, step, min = step, max = Infinity) {
  return clamp(Math.round(value / step) * step, min, max);
}

function objectForwardDistance() {
  return Math.max(0.5, state.object.z - state.camera.z);
}

function applyBevAutoFit() {
  if (!state.bev.autoObjectCenter) return;

  const distance = objectForwardDistance();
  const targetDepth = Math.max(1, distance * 2);

  if (state.bev.lockMode === "unit") {
    const nextUnitsZ = roundToStep(targetDepth / state.bev.unitLength, 16, 32, 4096);
    state.bev.unitsZ = nextUnitsZ;
    state.bev.unitsX = Math.max(state.bev.unitsX, nextUnitsZ);
  } else {
    state.bev.unitLength = clamp(targetDepth / state.bev.unitsZ, 0.01, 5);
  }
}

function bevCenter() {
  const size = bevSizeMeters();
  return {
    x: state.camera.x,
    z: state.camera.z + size.depth / 2,
  };
}

function worldToBevUnit(point, center = bevCenter()) {
  if (!point) return null;
  return {
    col: state.bev.unitsX / 2 + (point.x - center.x) / state.bev.unitLength,
    row: (point.z - state.camera.z) / state.bev.unitLength,
  };
}

function intersectGroundFromPixel(u, v, pose = leftCameraPose()) {
  const origin = vec(pose.x, pose.y, pose.z);
  const dir = rayFromPixel(u, v, pose);
  const maxT = Math.max(800, state.bev.extent * 5);
  let prevT = 0;
  let prevValue = origin.y - groundHeightAt(origin.x, origin.z);
  const steps = 120;

  for (let i = 1; i <= steps; i += 1) {
    const t = (maxT * i) / steps;
    const p = add(origin, mul(dir, t));
    const value = p.y - groundHeightAt(p.x, p.z);
    if (prevValue >= 0 && value <= 0) {
      let lo = prevT;
      let hi = t;
      for (let iter = 0; iter < 24; iter += 1) {
        const mid = (lo + hi) / 2;
        const q = add(origin, mul(dir, mid));
        const midValue = q.y - groundHeightAt(q.x, q.z);
        if (midValue > 0) lo = mid;
        else hi = mid;
      }
      const hit = add(origin, mul(dir, hi));
      hit.y = groundHeightAt(hit.x, hit.z);
      return hit;
    }
    prevT = t;
    prevValue = value;
  }
  return null;
}

function objectLocalToWorld(localX, localZ) {
  const o = state.object;
  const yaw = degToRad(o.yaw);
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  return {
    x: o.x + localX * cos + localZ * sin,
    z: o.z - localX * sin + localZ * cos,
  };
}

function objectFootprintSamples(divisions = 4) {
  const o = state.object;
  if (o.mode === "point") return [{ x: o.x, z: o.z }];
  const samples = [];
  for (let ix = 0; ix <= divisions; ix += 1) {
    const lx = -o.w / 2 + (o.w * ix) / divisions;
    for (let iz = 0; iz <= divisions; iz += 1) {
      const lz = -o.d / 2 + (o.d * iz) / divisions;
      samples.push(objectLocalToWorld(lx, lz));
    }
  }
  return samples;
}

function objectSupportInfo() {
  const samples = objectFootprintSamples(5);
  const heights = samples.map((p) => groundHeightAt(p.x, p.z));
  const minGround = Math.min(...heights);
  const maxGround = Math.max(...heights);
  const bottomY = maxGround + state.object.lift;
  const minGap = bottomY - maxGround;
  const maxGap = bottomY - minGround;
  return {
    bottomY,
    minGround,
    maxGround,
    minGap,
    maxGap,
    contact: minGap <= 0.01,
    unevenGap: maxGap,
  };
}

function objectCorners() {
  const o = state.object;
  if (o.mode === "point") {
    const support = objectSupportInfo();
    return [vec(o.x, support.bottomY, o.z)];
  }
  const yaw = degToRad(o.yaw);
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  const baseY = objectSupportInfo().bottomY;
  const xs = [-o.w / 2, o.w / 2];
  const ys = [0, o.h];
  const zs = [-o.d / 2, o.d / 2];
  const corners = [];
  for (const x of xs) {
    for (const y of ys) {
      for (const z of zs) {
        corners.push(
          vec(
            o.x + x * cos + z * sin,
            baseY + y,
            o.z - x * sin + z * cos,
          ),
        );
      }
    }
  }
  return corners;
}

function objectSurfacePoints() {
  const o = state.object;
  if (o.mode === "point") return objectCorners();

  const yaw = degToRad(o.yaw);
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  const baseY = objectSupportInfo().bottomY;
  const xs = [-o.w / 2, 0, o.w / 2];
  const ys = [0, o.h / 2, o.h];
  const zs = [-o.d / 2, 0, o.d / 2];
  const points = [];

  for (const x of xs) {
    for (const y of ys) {
      for (const z of zs) {
        const onSurface = x === xs[0] || x === xs[2] || y === ys[0] || y === ys[2] || z === zs[0] || z === zs[2];
        if (!onSurface) continue;
        points.push(
          vec(
            o.x + x * cos + z * sin,
            baseY + y,
            o.z - x * sin + z * cos,
          ),
        );
      }
    }
  }
  return points;
}

function objectDisplayPoints() {
  const o = state.object;
  if (o.mode === "point") return objectCorners();

  const support = objectSupportInfo();
  const center = vec(o.x, support.bottomY + o.h / 2, o.z);
  return [...objectCorners(), center];
}

function objectFootprint(expand = 0) {
  const o = state.object;
  if (o.mode === "point") {
    const radius = Math.max(expand, state.bev.unitLength * 0.5);
    return [
      { x: o.x - radius, z: o.z - radius },
      { x: o.x + radius, z: o.z - radius },
      { x: o.x + radius, z: o.z + radius },
      { x: o.x - radius, z: o.z + radius },
    ];
  }
  const yaw = degToRad(o.yaw);
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  const w = o.w / 2 + expand;
  const d = o.d / 2 + expand;
  return [
    { x: -w, z: -d },
    { x: w, z: -d },
    { x: w, z: d },
    { x: -w, z: d },
  ].map((p) => ({
    x: o.x + p.x * cos + p.z * sin,
    z: o.z - p.x * sin + p.z * cos,
  }));
}

function bboxFromProjectedPoints(projectedPoints, halfPx = Math.max(0.5, state.bev.pixelTol + 0.5)) {
  if (!projectedPoints || projectedPoints.length === 0) return null;
  if (projectedPoints.length === 1) {
    const p = projectedPoints[0];
    return {
      left: p.u - halfPx,
      right: p.u + halfPx,
      top: p.v - halfPx,
      bottom: p.v + halfPx,
      width: halfPx * 2,
      height: halfPx * 2,
    };
  }
  const minU = Math.min(...projectedPoints.map((p) => p.u));
  const maxU = Math.max(...projectedPoints.map((p) => p.u));
  const minV = Math.min(...projectedPoints.map((p) => p.v));
  const maxV = Math.max(...projectedPoints.map((p) => p.v));
  return {
    left: minU,
    right: maxU,
    top: minV,
    bottom: maxV,
    width: maxU - minU,
    height: maxV - minV,
  };
}

function bboxVisibleInImage(bbox) {
  return Boolean(bbox)
    && bbox.right >= 0
    && bbox.left <= state.camera.resW
    && bbox.bottom >= 0
    && bbox.top <= state.camera.resH;
}

function bboxFullyVisibleInImage(bbox) {
  return Boolean(bbox)
    && bbox.left >= 0
    && bbox.right <= state.camera.resW
    && bbox.top >= 0
    && bbox.bottom <= state.camera.resH;
}

function projectedObject() {
  const samplePoints = objectSurfacePoints();
  const displayPointsWorld = objectDisplayPoints();
  const points = displayPointsWorld.map((p) => project(p, leftCameraPose())).filter(Boolean);
  const subPose = subCameraPose();
  const subPoints = displayPointsWorld.map((p) => project(p, subPose)).filter(Boolean);
  const bboxPoints = samplePoints.map((p) => project(p, leftCameraPose())).filter(Boolean);
  const subBboxPoints = samplePoints.map((p) => project(p, subPose)).filter(Boolean);
  if (state.object.mode === "point") {
    const p = points[0];
    const pSub = subPoints[0];
    const halfPx = Math.max(0.5, state.bev.pixelTol + 0.5);
    const bbox = p ? bboxFromProjectedPoints([p], halfPx) : null;
    const subBbox = pSub ? bboxFromProjectedPoints([pSub], halfPx) : null;
    const visible = bboxVisibleInImage(bbox);
    const fullyVisible = bboxFullyVisibleInImage(bbox);
    const subVisible = bboxVisibleInImage(subBbox);
    const subFullyVisible = bboxFullyVisibleInImage(subBbox);
    return {
      visible,
      fullyVisible,
      subVisible,
      subFullyVisible,
      points,
      subPoints,
      bbox,
      subBbox,
    };
  }
  const bbox = bboxFromProjectedPoints(bboxPoints);
  const subBbox = bboxFromProjectedPoints(subBboxPoints);
  const visible = bboxVisibleInImage(bbox);
  const fullyVisible = bboxFullyVisibleInImage(bbox);
  const subVisible = bboxVisibleInImage(subBbox);
  const subFullyVisible = bboxFullyVisibleInImage(subBbox);
  return {
    visible,
    fullyVisible,
    subVisible,
    subFullyVisible,
    points,
    subPoints,
    bbox,
    subBbox,
  };
}

function triangulateRays(originA, dirA, originB, dirB) {
  const w0 = sub(originA, originB);
  const a = dot(dirA, dirA);
  const b = dot(dirA, dirB);
  const c = dot(dirB, dirB);
  const d = dot(dirA, w0);
  const e = dot(dirB, w0);
  const denom = a * c - b * b;
  if (Math.abs(denom) < 1e-8) return null;
  const s = (b * e - c * d) / denom;
  const t = (a * e - b * d) / denom;
  if (s < 0 || t < 0) return null;
  const pa = add(originA, mul(dirA, s));
  const pb = add(originB, mul(dirB, t));
  return mul(add(pa, pb), 0.5);
}

function triangulateFromPixels(leftPixel, subPixel) {
  if (!leftPixel || !subPixel) return null;
  const leftPose = leftCameraPose();
  const rightPose = subCameraPose();
  const originA = vec(leftPose.x, leftPose.y, leftPose.z);
  const originB = vec(rightPose.x, rightPose.y, rightPose.z);
  const dirA = rayFromPixel(leftPixel.u, leftPixel.v, leftPose);
  const dirB = rayFromPixel(subPixel.u, subPixel.v, rightPose);
  return triangulateRays(originA, dirA, originB, dirB);
}

function rectifiedStereoBaseline() {
  const leftPose = leftCameraPose();
  const rightPose = subCameraPose();
  const leftBasis = cameraBasis(leftPose);
  const delta = sub(vec(rightPose.x, rightPose.y, rightPose.z), vec(leftPose.x, leftPose.y, leftPose.z));
  const baselineRight = dot(delta, leftBasis.right);
  const baselineUp = dot(delta, leftBasis.up);
  const baselineForward = dot(delta, leftBasis.forward);
  const aligned = Math.abs(leftPose.yaw - rightPose.yaw) < 1e-6
    && Math.abs(leftPose.pitch - rightPose.pitch) < 1e-6
    && Math.abs(baselineUp) < 1e-6
    && Math.abs(baselineForward) < 1e-6;
  return {
    aligned,
    baseline: baselineRight,
  };
}

function objectBottomFacePoints(divisions = 16) {
  const o = state.object;
  const support = objectSupportInfo();
  if (o.mode === "point") return [vec(o.x, support.bottomY, o.z)];
  const points = [];
  const count = Math.max(2, divisions);
  for (let ix = 0; ix < count; ix += 1) {
    const tx = count === 1 ? 0.5 : ix / (count - 1);
    const lx = -o.w / 2 + o.w * tx;
    for (let iz = 0; iz < count; iz += 1) {
      const tz = count === 1 ? 0.5 : iz / (count - 1);
      const lz = -o.d / 2 + o.d * tz;
      const world = objectLocalToWorld(lx, lz);
      points.push(vec(world.x, support.bottomY, world.z));
    }
  }
  return points;
}

function bottomDisparityMatches(leftBBox, subBBox, extraPx = state.bev.pixelTol) {
  if (!leftBBox || !subBBox) return [];
  const toleranceV = Math.max(2, extraPx + 2);
  const toleranceU = Math.max(2, extraPx + 2);
  const leftPose = leftCameraPose();
  const rightPose = subCameraPose();
  const matches = [];
  for (const world of objectBottomFacePoints()) {
    const left = project(world, leftPose);
    const right = project(world, rightPose);
    if (!left || !right) continue;
    const insideLeft = left.u >= leftBBox.left - toleranceU && left.u <= leftBBox.right + toleranceU;
    const insideRight = right.u >= subBBox.left - toleranceU && right.u <= subBBox.right + toleranceU;
    const insideVLeft = left.v >= leftBBox.top - toleranceV && left.v <= leftBBox.bottom + toleranceV;
    const insideVRight = right.v >= subBBox.top - toleranceV && right.v <= subBBox.bottom + toleranceV;
    if (!insideLeft || !insideRight || !insideVLeft || !insideVRight) continue;
    if (Math.abs(left.v - right.v) > toleranceV * 2) continue;
    const tri = triangulateFromPixels({ u: left.u, v: left.v }, { u: right.u, v: right.v });
    if (!tri || !Number.isFinite(tri.x) || !Number.isFinite(tri.z)) continue;
    if (tri.z < state.camera.z) continue;
    const bottomGap = Math.abs(left.v - leftBBox.bottom) + Math.abs(right.v - subBBox.bottom);
    matches.push({
      left,
      right,
      disparity: left.u - right.u,
      tri,
      world,
      score: bottomGap,
    });
  }
  matches.sort((a, b) => a.score - b.score || a.left.u - b.left.u);
  return matches;
}

function bboxDisparityBounds(leftBBox, subBBox) {
  if (!leftBBox || !subBBox) return null;
  const rectified = rectifiedStereoBaseline();
  if (!rectified.aligned || Math.abs(rectified.baseline) <= 1e-9) return null;
  const k = intrinsics();
  const tol = Math.max(0.25, state.bev.pixelTol);
  const centerDisparity = ((leftBBox.left + leftBBox.right) * 0.5) - ((subBBox.left + subBBox.right) * 0.5);
  if (!Number.isFinite(centerDisparity)) return null;
  if (Math.sign(centerDisparity) !== Math.sign(rectified.baseline)) return null;
  const absBaseline = Math.abs(rectified.baseline);
  const absDisparity = Math.abs(centerDisparity);
  const safeCenter = Math.max(1e-6, absDisparity);
  const centerNearDisparity = safeCenter + tol;
  const centerFarDisparity = Math.max(1e-6, safeCenter - tol);
  return {
    centerDisparity: safeCenter,
    nearDepth: (k.fx * absBaseline) / centerNearDisparity,
    centerDepth: (k.fx * absBaseline) / safeCenter,
    farDepth: (k.fx * absBaseline) / centerFarDisparity,
  };
}

function bboxPixels(bbox) {
  if (!bbox) return [];
  return [
    { u: bbox.left, v: bbox.top },
    { u: bbox.right, v: bbox.top },
    { u: bbox.right, v: bbox.bottom },
    { u: bbox.left, v: bbox.bottom },
  ];
}

function disparityDepthEstimate(match, disparityTolerancePx = state.bev.pixelTol) {
  if (!match) return null;
  const rectified = rectifiedStereoBaseline();
  if (!rectified.aligned || Math.abs(rectified.baseline) <= 1e-9) return null;
  const k = intrinsics();
  const signedDisparity = match.left.u - match.right.u;
  if (!Number.isFinite(signedDisparity)) return null;
  if (Math.sign(signedDisparity) !== Math.sign(rectified.baseline)) return null;
  const absBaseline = Math.abs(rectified.baseline);
  const disparity = Math.abs(signedDisparity);
  if (disparity <= 1e-6) return null;
  const tol = Math.max(0.25, disparityTolerancePx);
  const disparityNear = disparity + tol;
  const disparityFar = Math.max(1e-6, disparity - tol);
  const centerDepth = (k.fx * absBaseline) / disparity;
  const nearDepth = (k.fx * absBaseline) / disparityNear;
  const farDepth = (k.fx * absBaseline) / disparityFar;
  const center = pointFromPixelDepth(match.left.u, match.left.v, centerDepth, leftCameraPose());
  const near = pointFromPixelDepth(match.left.u, match.left.v, nearDepth, leftCameraPose());
  const far = pointFromPixelDepth(match.left.u, match.left.v, farDepth, leftCameraPose());
  return {
    disparity,
    centerDepth,
    nearDepth,
    farDepth,
    center,
    near,
    far,
    match,
  };
}

function stereoDepthEstimate(leftBBox, subBBox) {
  const bounds = bboxDisparityBounds(leftBBox, subBBox);
  if (!bounds) return null;
  const centerU = (leftBBox.left + leftBBox.right) * 0.5;
  const centerV = (leftBBox.top + leftBBox.bottom) * 0.5;
  const nearLeftX = cameraXFromPixelDepth(leftBBox.left, bounds.nearDepth);
  const nearRightX = cameraXFromPixelDepth(leftBBox.right, bounds.nearDepth);
  const farLeftX = cameraXFromPixelDepth(leftBBox.left, bounds.farDepth);
  const farRightX = cameraXFromPixelDepth(leftBBox.right, bounds.farDepth);
  const regionBev = [
    { x: nearLeftX, z: bounds.nearDepth },
    { x: nearRightX, z: bounds.nearDepth },
    { x: farRightX, z: bounds.farDepth },
    { x: farLeftX, z: bounds.farDepth },
  ].filter((point) => Number.isFinite(point.x) && Number.isFinite(point.z));
  const regionWorld = (regionBev || [])
    .map((point) => worldPointFromCameraXZ(point.x, point.z, leftCameraPose()))
    .filter((point) => Number.isFinite(point?.x) && Number.isFinite(point?.z))
    .map((point) => ({ x: point.x, z: point.z }));
  const centerCam = cameraPointFromPixelDepth(centerU, centerV, bounds.centerDepth);
  const nearCam = cameraPointFromPixelDepth(centerU, centerV, bounds.nearDepth);
  const farCam = cameraPointFromPixelDepth(centerU, centerV, bounds.farDepth);
  const center = worldPointFromCameraXZ(centerCam.x, centerCam.z, leftCameraPose());
  const near = worldPointFromCameraXZ(nearCam.x, nearCam.z, leftCameraPose());
  const far = worldPointFromCameraXZ(farCam.x, farCam.z, leftCameraPose());
  return {
    bottom: center || null,
    depthBand: near && center && far ? { near, center, far } : null,
    depthBandBev: nearCam && centerCam && farCam ? {
      near: { x: nearCam.x, z: nearCam.z },
      center: { x: centerCam.x, z: centerCam.z },
      far: { x: farCam.x, z: farCam.z },
    } : null,
    region: regionWorld,
    regionBev,
    regionCenter: polygonCenter(regionWorld),
    regionCenterBev: polygonCenter(regionBev),
    samples: [],
    representative: null,
    depthMin: bounds.nearDepth,
    depthMax: bounds.farDepth,
    nearPoly: regionWorld.slice(0, 2),
    farPoly: regionWorld.slice(2, 4),
    nearPolyBev: regionBev.slice(0, 2),
    farPolyBev: regionBev.slice(2, 4),
  };
}

function stereoSplatPoints(imageEstimate) {
  if (!imageEstimate) return [];
  return [...(imageEstimate.nearPoly || []), ...(imageEstimate.farPoly || []), ...(imageEstimate.region || [])];
}

function stereoImageSplatPoints(imageEstimate, side = "left") {
  return [];
}

function sortImagePointsByU(points) {
  return [...points].sort((a, b) => a.u - b.u || a.v - b.v);
}

function polygonCenter(poly) {
  if (!poly || poly.length === 0) return null;
  return {
    x: poly.reduce((sum, p) => sum + p.x, 0) / poly.length,
    z: poly.reduce((sum, p) => sum + p.z, 0) / poly.length,
  };
}

function estimateFromImageBbox(leftBBox, subBBox) {
  if (!leftBBox || !subBBox) return null;
  const estimate = stereoDepthEstimate(leftBBox, subBBox);
  if (!estimate) return null;
  return estimate;
}

function sampleBboxBottomGround(bbox, samples = 9, extraPx = state.bev.pixelTol) {
  if (!bbox) return null;
  const l = clamp(bbox.left - extraPx, 0, state.camera.resW);
  const r = clamp(bbox.right + extraPx, 0, state.camera.resW);
  const bottomVs = [
    clamp(bbox.bottom - extraPx, 0, state.camera.resH),
    clamp(bbox.bottom, 0, state.camera.resH),
    clamp(bbox.bottom + extraPx, 0, state.camera.resH),
  ];
  const points = [];
  const count = Math.max(2, samples);
  for (let i = 0; i < count; i += 1) {
    const u = l + ((r - l) * i) / (count - 1);
    for (const v of bottomVs) {
      const p = intersectGroundFromPixel(u, v);
      if (p) points.push({ x: p.x, z: p.z });
    }
  }
  return points;
}

function objectFootprintOffsets() {
  if (state.object.mode === "point") {
    const radius = Math.max(0.15, state.bev.unitLength * 0.5);
    return [
      { x: -radius, z: -radius },
      { x: radius, z: -radius },
      { x: radius, z: radius },
      { x: -radius, z: radius },
    ];
  }

  const yaw = degToRad(state.object.yaw);
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  const halfW = state.object.w / 2;
  const halfD = state.object.d / 2;
  return [
    { lx: -halfW, lz: -halfD },
    { lx: halfW, lz: -halfD },
    { lx: halfW, lz: halfD },
    { lx: -halfW, lz: halfD },
  ].map((p) => ({
    x: p.lx * cos + p.lz * sin,
    z: -p.lx * sin + p.lz * cos,
  }));
}


function objectTruthPosition() {
  const support = objectSupportInfo();
  const nearestFootprint = objectFootprintSamples(state.object.mode === "point" ? 1 : 24).reduce((best, point) => {
    const distance = Math.hypot(point.x - state.camera.x, point.z - state.camera.z);
    if (!best || distance < best.distance) {
      return { point, distance };
    }
    return best;
  }, null)?.point;
  return {
    center: {
      x: state.object.x,
      y: state.object.mode === "point" ? support.bottomY : support.bottomY + state.object.h / 2,
      z: state.object.z,
    },
    bottomCenter: {
      x: state.object.x,
      y: support.bottomY,
      z: state.object.z,
    },
    nearest: nearestFootprint
      ? {
        x: nearestFootprint.x,
        y: support.bottomY,
        z: nearestFootprint.z,
      }
      : null,
    footprint: objectFootprint(),
    footprintCenter: polygonCenter(objectFootprint()),
  };
}

function polygonArea(poly) {
  if (!poly || poly.length < 3) return 0;
  let area = 0;
  for (let i = 0; i < poly.length; i += 1) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    area += a.x * b.z - b.x * a.z;
  }
  return Math.abs(area) / 2;
}

function sampleBboxBottomContacts(leftBBox, subBBox, samples = 11) {
  const points = stereoSplatPoints(estimateFromImageBbox(leftBBox, subBBox));
  if (points.length <= samples) return points;
  const picked = [];
  const last = points.length - 1;
  for (let i = 0; i < samples; i += 1) {
    const index = Math.round((last * i) / Math.max(1, samples - 1));
    picked.push(points[index]);
  }
  return picked;
}

function setupCanvas(canvas) {
  const ratio = window.devicePixelRatio || 1;
  const cssW = canvas.clientWidth || canvas.width;
  const cssH = canvas.clientHeight || canvas.height;
  const width = Math.round(cssW * ratio);
  const height = Math.round(cssH * ratio);
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  const ctx = canvas.getContext("2d");
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  return { ctx, w: cssW, h: cssH };
}

function clear(ctx, w, h) {
  ctx.clearRect(0, 0, w, h);
}

function makeMapTransform(w, h, extent, centerX = state.camera.x, centerZ = state.camera.z + extent * 0.32) {
  const scale = Math.min(w, h) / extent;
  return {
    centerX,
    centerZ,
    extent,
    toScreen(p) {
      return {
        x: w / 2 + (p.x - centerX) * scale,
        y: h / 2 - (p.z - centerZ) * scale,
      };
    },
    scale,
  };
}

function drawGrid(ctx, tr, w, h, extent) {
  const step = extent > 300 ? 100 : extent > 150 ? 50 : extent > 80 ? 20 : extent > 50 ? 10 : extent > 25 ? 5 : 2;
  ctx.save();
  ctx.lineWidth = 1;
  ctx.strokeStyle = "#dfe6ec";
  ctx.fillStyle = "#6a7580";
  ctx.font = "12px system-ui, sans-serif";
  const halfW = w / tr.scale / 2 + step;
  const halfH = h / tr.scale / 2 + step;
  const minX = tr.centerX - halfW;
  const maxX = tr.centerX + halfW;
  const minZ = tr.centerZ - halfH;
  const maxZ = tr.centerZ + halfH;
  for (let x = Math.ceil(minX / step) * step; x <= maxX; x += step) {
    const a = tr.toScreen({ x, z: minZ });
    const b = tr.toScreen({ x, z: maxZ });
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
  for (let z = Math.ceil(minZ / step) * step; z <= maxZ; z += step) {
    const a = tr.toScreen({ x: minX, z });
    const b = tr.toScreen({ x: maxX, z });
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
  const x0a = tr.toScreen({ x: minX, z: 0 });
  const x0b = tr.toScreen({ x: maxX, z: 0 });
  const z0a = tr.toScreen({ x: 0, z: minZ });
  const z0b = tr.toScreen({ x: 0, z: maxZ });
  ctx.strokeStyle = "#aebac4";
  ctx.beginPath();
  ctx.moveTo(x0a.x, x0a.y);
  ctx.lineTo(x0b.x, x0b.y);
  ctx.moveTo(z0a.x, z0a.y);
  ctx.lineTo(z0b.x, z0b.y);
  ctx.stroke();
  ctx.restore();
}

function visibleBounds(tr, w, h, padding = 0) {
  const halfW = w / tr.scale / 2 + padding;
  const halfH = h / tr.scale / 2 + padding;
  return {
    minX: tr.centerX - halfW,
    maxX: tr.centerX + halfW,
    minZ: tr.centerZ - halfH,
    maxZ: tr.centerZ + halfH,
  };
}

function terrainColor(t) {
  const low = [226, 235, 218];
  const mid = [196, 205, 172];
  const high = [154, 139, 101];
  const a = t < 0.5 ? low : mid;
  const b = t < 0.5 ? mid : high;
  const f = t < 0.5 ? t * 2 : (t - 0.5) * 2;
  const r = Math.round(a[0] + (b[0] - a[0]) * f);
  const g = Math.round(a[1] + (b[1] - a[1]) * f);
  const bch = Math.round(a[2] + (b[2] - a[2]) * f);
  return `rgb(${r}, ${g}, ${bch})`;
}

function drawTerrain(ctx, tr, w, h) {
  const bounds = visibleBounds(tr, w, h);
  const cols = 46;
  const rows = 34;
  const dx = (bounds.maxX - bounds.minX) / cols;
  const dz = (bounds.maxZ - bounds.minZ) / rows;
  const heights = [];
  let minH = Infinity;
  let maxH = -Infinity;

  for (let ix = 0; ix < cols; ix += 1) {
    for (let iz = 0; iz < rows; iz += 1) {
      const x = bounds.minX + dx * (ix + 0.5);
      const z = bounds.minZ + dz * (iz + 0.5);
      const y = groundHeightAt(x, z);
      heights.push({ ix, iz, x, z, y });
      minH = Math.min(minH, y);
      maxH = Math.max(maxH, y);
    }
  }

  ctx.save();
  ctx.globalAlpha = 0.82;
  for (const cell of heights) {
    const t = (cell.y - minH) / Math.max(0.001, maxH - minH);
    const p0 = tr.toScreen({ x: bounds.minX + dx * cell.ix, z: bounds.minZ + dz * cell.iz });
    const p1 = tr.toScreen({ x: bounds.minX + dx * (cell.ix + 1), z: bounds.minZ + dz * (cell.iz + 1) });
    ctx.fillStyle = terrainColor(t);
    ctx.fillRect(p0.x, p1.y, p1.x - p0.x + 1, p0.y - p1.y + 1);
  }

  if (state.ground.type !== "flat") {
    const roadLeft = -state.ground.roadWidth / 2;
    const roadRight = state.ground.roadWidth / 2;
    const a = tr.toScreen({ x: roadLeft, z: bounds.minZ });
    const b = tr.toScreen({ x: roadRight, z: bounds.maxZ });
    ctx.globalAlpha = 0.58;
    ctx.fillStyle = "#59636a";
    ctx.fillRect(a.x, b.y, b.x - a.x, a.y - b.y);
    ctx.globalAlpha = 0.9;
    ctx.strokeStyle = "rgba(255,255,255,0.72)";
    ctx.lineWidth = 1.5;
    for (const x of [roadLeft, 0, roadRight]) {
      const p0 = tr.toScreen({ x, z: bounds.minZ });
      const p1 = tr.toScreen({ x, z: bounds.maxZ });
      ctx.beginPath();
      ctx.moveTo(p0.x, p0.y);
      ctx.lineTo(p1.x, p1.y);
      ctx.stroke();
    }
  }
  ctx.restore();
}

function drawRoadOverlay(ctx, tr, w, h) {
  const bounds = visibleBounds(tr, w, h);
  const halfRoad = state.ground.roadWidth / 2;
  const sideWidth = state.ground.sideWidth;
  const road = [
    { x: -halfRoad, z: bounds.minZ },
    { x: halfRoad, z: bounds.minZ },
    { x: halfRoad, z: bounds.maxZ },
    { x: -halfRoad, z: bounds.maxZ },
  ];
  const leftShoulder = [
    { x: -halfRoad - sideWidth, z: bounds.minZ },
    { x: -halfRoad, z: minZ },
    { x: -halfRoad, z: bounds.maxZ },
    { x: -halfRoad - sideWidth, z: bounds.maxZ },
  ];
  const rightShoulder = [
    { x: halfRoad, z: bounds.minZ },
    { x: halfRoad + sideWidth, z: bounds.minZ },
    { x: halfRoad + sideWidth, z: bounds.maxZ },
    { x: halfRoad, z: bounds.maxZ },
  ];

  drawPolygon(ctx, tr, leftShoulder, layerColors.shoulderFill, "rgba(132, 144, 99, 0.70)", 1);
  drawPolygon(ctx, tr, rightShoulder, layerColors.shoulderFill, "rgba(132, 144, 99, 0.70)", 1);
  drawPolygon(ctx, tr, road, layerColors.roadTruthFill, layerColors.roadTruthStroke, 2);

  ctx.save();
  ctx.strokeStyle = "rgba(255, 230, 132, 0.92)";
  ctx.setLineDash([10, 8]);
  ctx.lineWidth = 1.5;
  const a = tr.toScreen({ x: 0, z: bounds.minZ });
  const b = tr.toScreen({ x: 0, z: bounds.maxZ });
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
  ctx.restore();
}

function drawPolygon(ctx, tr, poly, fill, stroke, lineWidth = 2) {
  if (!poly || poly.length < 2) return;
  ctx.save();
  ctx.beginPath();
  poly.forEach((p, i) => {
    const s = tr.toScreen(p);
    if (i === 0) ctx.moveTo(s.x, s.y);
    else ctx.lineTo(s.x, s.y);
  });
  ctx.closePath();
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke) {
    ctx.lineWidth = lineWidth;
    ctx.strokeStyle = stroke;
    ctx.stroke();
  }
  ctx.restore();
}

function drawCamera(ctx, tr) {
  const cam = { x: state.camera.x, z: state.camera.z };
  const c = tr.toScreen(cam);
  const basis = cameraBasis();
  const f = { x: basis.forward.x, z: basis.forward.z };
  const r = { x: basis.right.x, z: basis.right.z };
  const size = 13;
  ctx.save();
  ctx.translate(c.x, c.y);
  ctx.beginPath();
  ctx.moveTo(f.x * size, -f.z * size);
  ctx.lineTo((-f.x + r.x * 0.75) * size, -(-f.z + r.z * 0.75) * size);
  ctx.lineTo((-f.x - r.x * 0.75) * size, -(-f.z - r.z * 0.75) * size);
  ctx.closePath();
  ctx.fillStyle = "#17202a";
  ctx.fill();
  ctx.restore();
}

function drawFrustumOnGround(ctx, tr) {
  const corners = [
    [0, 0],
    [state.camera.resW, 0],
    [state.camera.resW, state.camera.resH],
    [0, state.camera.resH],
  ]
    .map(([u, v]) => intersectGroundFromPixel(u, v))
    .filter(Boolean)
    .map((p) => ({ x: p.x, z: p.z }));
  if (corners.length >= 3) {
    drawPolygon(ctx, tr, corners, "rgba(0, 127, 122, 0.08)", "rgba(0, 127, 122, 0.55)", 1.5);
  }
}

function drawSamples(ctx, tr, points) {
  ctx.save();
  ctx.fillStyle = "rgba(49, 93, 186, 0.26)";
  for (const p of points) {
    const s = tr.toScreen(p);
    ctx.beginPath();
    ctx.arc(s.x, s.y, 2.2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawPointMarker(ctx, tr, point, color, label) {
  if (!point) return;
  const s = tr.toScreen(point);
  ctx.save();
  ctx.fillStyle = color;
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(s.x, s.y, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#17202a";
  ctx.font = "12px system-ui, sans-serif";
  ctx.fillText(label, s.x + 9, s.y - 7);
  ctx.restore();
}

function renderWorld(proj, region, truth, imageEstimate, nearestImageEstimate, roadEstimate) {
  const { ctx, w, h } = setupCanvas(canvases.world);
  clear(ctx, w, h);
  const tr = makeMapTransform(w, h, state.bev.extent);
  drawTerrain(ctx, tr, w, h);
  drawRoadOverlay(ctx, tr, w, h);
  drawGrid(ctx, tr, w, h, state.bev.extent);
  drawFrustumOnGround(ctx, tr);
  drawPolygon(ctx, tr, roadEstimate?.region, layerColors.roadEstimateFill, layerColors.roadEstimateStroke, 2.5);
  drawPolygon(ctx, tr, region, layerColors.bboxFill, layerColors.bboxStroke, 2);
  drawPolygon(ctx, tr, nearestImageEstimate?.region, layerColors.nearestFill, layerColors.nearestStroke, 2.5);
  drawSamples(ctx, tr, sampleBboxBottomContacts(proj.bbox), 9);
  drawPolygon(ctx, tr, objectFootprint(), layerColors.truthFill, layerColors.truthStroke, 2.5);
  drawPointMarker(ctx, tr, truth.nearest, layerColors.truthStroke, "truth");
  drawPointMarker(ctx, tr, imageEstimate?.bottom, layerColors.imagePoint, "image");
  drawCamera(ctx, tr);
  drawLegend(ctx, [
    ["#17202a", "Camera"],
    [layerColors.truthStroke, "True object"],
    [layerColors.bboxStroke, "bbox bottom + size -> BEV"],
    [layerColors.nearestStroke, "nearest image -> depth"],
    [layerColors.roadEstimateStroke, "road image -> BEV"],
  ]);
}

function drawLegend(ctx, items) {
  ctx.save();
  ctx.font = "12px system-ui, sans-serif";
  ctx.textBaseline = "middle";
  let x = 14;
  const y = 18;
  for (const [color, label] of items) {
    ctx.fillStyle = color;
    ctx.fillRect(x, y - 5, 10, 10);
    ctx.fillStyle = "#38444f";
    ctx.fillText(label, x + 15, y);
    x += ctx.measureText(label).width + 38;
  }
  ctx.restore();
}

function imageCanvasPoint(projected, ox, oy, scale) {
  return {
    x: ox + projected.u * scale,
    y: oy + projected.v * scale,
  };
}

function drawProjectedQuad(ctx, ox, oy, scale, points, fill, stroke = null, lineWidth = 1) {
  const projected = points.map((point) => project(point, leftCameraPose()));
  if (projected.some((p) => !p)) return;
  ctx.beginPath();
  projected.forEach((p, i) => {
    const s = imageCanvasPoint(p, ox, oy, scale);
    if (i === 0) ctx.moveTo(s.x, s.y);
    else ctx.lineTo(s.x, s.y);
  });
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
  }
}

function drawProjectedTerrainImage(ctx, ox, oy, scale, imgW, imgH) {
  const halfRoad = state.ground.roadWidth / 2;
  const shoulder = Math.max(0.5, state.ground.sideWidth);
  const zStart = state.camera.z - state.bev.extent * 0.15;
  const zEnd = state.camera.z + state.bev.extent * 1.35;
  const segments = 52;
  const zStep = (zEnd - zStart) / segments;

  ctx.save();
  ctx.beginPath();
  ctx.rect(ox, oy, imgW * scale, imgH * scale);
  ctx.clip();

  for (let i = segments - 1; i >= 0; i -= 1) {
    const z0 = zStart + zStep * i;
    const z1 = z0 + zStep;
    const road = [
      vec(-halfRoad, groundHeightAt(-halfRoad, z0) + 0.01, z0),
      vec(halfRoad, groundHeightAt(halfRoad, z0) + 0.01, z0),
      vec(halfRoad, groundHeightAt(halfRoad, z1) + 0.01, z1),
      vec(-halfRoad, groundHeightAt(-halfRoad, z1) + 0.01, z1),
    ];
    drawProjectedQuad(ctx, ox, oy, scale, road, layerColors.roadTruthFill, "rgba(246, 248, 241, 0.16)", 0.8);

    const leftShoulder = [
      vec(-halfRoad - shoulder, groundHeightAt(-halfRoad - shoulder, z0) + 0.005, z0),
      vec(-halfRoad, groundHeightAt(-halfRoad, z0) + 0.005, z0),
      vec(-halfRoad, groundHeightAt(-halfRoad, z1) + 0.005, z1),
      vec(-halfRoad - shoulder, groundHeightAt(-halfRoad - shoulder, z1) + 0.005, z1),
    ];
    const rightShoulder = [
      vec(halfRoad, groundHeightAt(halfRoad, z0) + 0.005, z0),
      vec(halfRoad + shoulder, groundHeightAt(halfRoad + shoulder, z0) + 0.005, z0),
      vec(halfRoad + shoulder, groundHeightAt(halfRoad + shoulder, z1) + 0.005, z1),
      vec(halfRoad, groundHeightAt(halfRoad, z1) + 0.005, z1),
    ];
    drawProjectedQuad(ctx, ox, oy, scale, leftShoulder, layerColors.shoulderFill);
    drawProjectedQuad(ctx, ox, oy, scale, rightShoulder, layerColors.shoulderFill);
  }

  const lineZs = Array.from({ length: 36 }, (_, i) => zStart + ((zEnd - zStart) * i) / 35);
  for (const x of [-halfRoad, 0, halfRoad]) {
    ctx.beginPath();
    let started = false;
    for (const z of lineZs) {
      const p = project(vec(x, groundHeightAt(x, z) + 0.04, z));
      if (!p) {
        started = false;
        continue;
      }
      const s = imageCanvasPoint(p, ox, oy, scale);
      if (!started) {
        ctx.moveTo(s.x, s.y);
        started = true;
      } else {
        ctx.lineTo(s.x, s.y);
      }
    }
    ctx.strokeStyle = x === 0 ? "rgba(255, 244, 174, 0.86)" : "rgba(255, 255, 255, 0.72)";
    ctx.lineWidth = x === 0 ? 1.6 : 1.2;
    ctx.setLineDash(x === 0 ? [8, 7] : []);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  ctx.restore();
}

function drawBevFrame(ctx, tr, center, bevSize) {
  const halfW = bevSize.width / 2;
  const halfD = bevSize.depth / 2;
  const frame = [
    { x: center.x - halfW, z: center.z - halfD },
    { x: center.x + halfW, z: center.z - halfD },
    { x: center.x + halfW, z: center.z + halfD },
    { x: center.x - halfW, z: center.z + halfD },
  ];
  drawPolygon(ctx, tr, frame, "rgba(255, 255, 255, 0.12)", "rgba(23, 32, 42, 0.65)", 2);

  const unitStep = state.bev.unitLength;
  const targetPx = 22;
  const skip = Math.max(1, Math.ceil(targetPx / Math.max(1e-6, unitStep * tr.scale)));
  const step = unitStep * skip;
  ctx.save();
  ctx.strokeStyle = "rgba(23, 32, 42, 0.16)";
  ctx.lineWidth = 1;
  for (let x = center.x - halfW; x <= center.x + halfW + 1e-6; x += step) {
    const a = tr.toScreen({ x, z: center.z - halfD });
    const b = tr.toScreen({ x, z: center.z + halfD });
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
  for (let z = center.z - halfD; z <= center.z + halfD + 1e-6; z += step) {
    const a = tr.toScreen({ x: center.x - halfW, z });
    const b = tr.toScreen({ x: center.x + halfW, z });
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
  ctx.restore();
}

function drawBevDistanceRuler(ctx, tr) {
  const size = bevSizeMeters();
  const minX = state.camera.x - size.width / 2;
  const maxX = state.camera.x + size.width / 2;
  const minZ = state.camera.z;
  const maxZ = state.camera.z + size.depth;
  const major = size.depth > 250 ? 50 : size.depth > 120 ? 20 : size.depth > 60 ? 10 : 5;
  const minor = major / 2;

  ctx.save();
  ctx.font = "12px system-ui, sans-serif";
  ctx.textBaseline = "middle";

  for (let d = 0; d <= size.depth + 1e-6; d += minor) {
    const z = state.camera.z + d;
    const a = tr.toScreen({ x: minX, z });
    const b = tr.toScreen({ x: maxX, z });
    const isMajor = Math.abs(d / major - Math.round(d / major)) < 1e-6;
    ctx.strokeStyle = isMajor ? "rgba(23, 32, 42, 0.34)" : "rgba(23, 32, 42, 0.14)";
    ctx.lineWidth = isMajor ? 1.25 : 1;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    if (isMajor) {
      ctx.fillStyle = "#17202a";
      ctx.fillText(`${format(d, 0)}m`, a.x + 6, a.y - 8);
    }
  }

  const lateralStep = size.width > 250 ? 50 : size.width > 120 ? 20 : size.width > 60 ? 10 : 5;
  for (let x = Math.ceil((minX - state.camera.x) / lateralStep) * lateralStep; x <= size.width / 2 + 1e-6; x += lateralStep) {
    const worldX = state.camera.x + x;
    const a = tr.toScreen({ x: worldX, z: minZ });
    const b = tr.toScreen({ x: worldX, z: maxZ });
    ctx.strokeStyle = Math.abs(x) < 1e-6 ? "rgba(23, 32, 42, 0.44)" : "rgba(23, 32, 42, 0.18)";
    ctx.lineWidth = Math.abs(x) < 1e-6 ? 1.4 : 1;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    ctx.fillStyle = "#17202a";
    ctx.fillText(`${format(x, 0)}m`, a.x + 3, a.y - 10);
  }

  ctx.restore();
}

function drawImageCenterDepthCue(ctx, tr) {
  const k = intrinsics();
  const line = bevDepthLineForPixel(k.cx, k.cy);
  const a = tr.toScreen(line.start);
  const b = tr.toScreen(line.end);

  ctx.save();
  ctx.strokeStyle = "rgba(181, 50, 50, 0.9)";
  ctx.fillStyle = "#b53232";
  ctx.lineWidth = 3;
  ctx.setLineDash([10, 7]);
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
  ctx.setLineDash([]);

  const sampleStep = line.maxDepth > 250 ? 50 : line.maxDepth > 120 ? 20 : 10;
  for (let depth = Math.ceil(line.minDepth / sampleStep) * sampleStep; depth <= line.maxDepth + 1e-6; depth += sampleStep) {
    const p = pointFromPixelDepth(k.cx, k.cy, depth);
    const s = tr.toScreen({ x: p.x, z: p.z });
    ctx.beginPath();
    ctx.arc(s.x, s.y, 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = "12px system-ui, sans-serif";
    ctx.fillText(`${format(depth, 0)}m`, s.x + 7, s.y - 7);
  }
  ctx.font = "12px system-ui, sans-serif";
  ctx.fillText("image center depth line", b.x + 8, b.y);
  ctx.restore();
}

function drawBevCenterMarker(ctx, tr, center) {
  const s = tr.toScreen(center);
  ctx.save();
  ctx.strokeStyle = "#17202a";
  ctx.fillStyle = "#17202a";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(s.x - 14, s.y);
  ctx.lineTo(s.x + 14, s.y);
  ctx.moveTo(s.x, s.y - 14);
  ctx.lineTo(s.x, s.y + 14);
  ctx.stroke();
  ctx.font = "12px system-ui, sans-serif";
  ctx.fillText("BEV center", s.x + 9, s.y + 18);
  ctx.restore();
}

function drawRoadImageEstimateOverlay(ctx, ox, oy, scale, roadEstimate) {
  if (!roadEstimate?.projected) return;
  ctx.save();
  ctx.beginPath();
  roadEstimate.projected.forEach((p, i) => {
    const s = imageCanvasPoint(p, ox, oy, scale);
    if (i === 0) ctx.moveTo(s.x, s.y);
    else ctx.lineTo(s.x, s.y);
  });
  ctx.closePath();
  ctx.fillStyle = layerColors.roadEstimateFill;
  ctx.strokeStyle = layerColors.roadEstimateStroke;
  ctx.lineWidth = 2;
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function renderImage(proj, nearestImageEstimate, roadEstimate) {
  const { ctx, w, h } = setupCanvas(canvases.image);
  clear(ctx, w, h);
  const imgW = state.camera.resW;
  const imgH = state.camera.resH;
  const scale = Math.min((w - 36) / imgW, (h - 58) / imgH);
  const ox = (w - imgW * scale) / 2;
  const oy = 34;
  ctx.save();
  ctx.fillStyle = "#101820";
  ctx.fillRect(ox, oy, imgW * scale, imgH * scale);
  const grd = ctx.createLinearGradient(0, oy, 0, oy + imgH * scale);
  grd.addColorStop(0, "#24313d");
  grd.addColorStop(0.52, "#33424e");
  grd.addColorStop(0.53, "#596655");
  grd.addColorStop(1, "#7b815d");
  ctx.fillStyle = grd;
  ctx.fillRect(ox, oy, imgW * scale, imgH * scale);
  drawProjectedTerrainImage(ctx, ox, oy, scale, imgW, imgH);
  drawRoadImageEstimateOverlay(ctx, ox, oy, scale, roadEstimate);
  ctx.strokeStyle = "rgba(255,255,255,0.16)";
  ctx.lineWidth = 1;
  for (let i = 1; i < 4; i += 1) {
    ctx.beginPath();
    ctx.moveTo(ox + (imgW * scale * i) / 4, oy);
    ctx.lineTo(ox + (imgW * scale * i) / 4, oy + imgH * scale);
    ctx.moveTo(ox, oy + (imgH * scale * i) / 4);
    ctx.lineTo(ox + imgW * scale, oy + (imgH * scale * i) / 4);
    ctx.stroke();
  }
  ctx.strokeStyle = "rgba(255,255,255,0.55)";
  ctx.strokeRect(ox, oy, imgW * scale, imgH * scale);

  if (proj.bbox) {
    const b = proj.bbox;
    const x = ox + b.left * scale;
    const y = oy + b.top * scale;
    const bw = b.width * scale;
    const bh = b.height * scale;
    ctx.fillStyle = layerColors.bboxFill;
    ctx.strokeStyle = proj.visible ? layerColors.bboxStroke : layerColors.bboxStrokeHidden;
    ctx.lineWidth = 2;
    ctx.fillRect(x, y, bw, bh);
    ctx.strokeRect(x, y, bw, bh);
  }

  if (nearestImageEstimate?.projected) {
    const p = nearestImageEstimate.projected;
    const x = ox + (p.u - nearestImageEstimate.halfPx) * scale;
    const y = oy + (p.v - nearestImageEstimate.halfPx) * scale;
    const size = nearestImageEstimate.halfPx * 2 * scale;
    ctx.strokeStyle = layerColors.nearestStroke;
    ctx.fillStyle = layerColors.nearestFill;
    ctx.lineWidth = 2;
    ctx.fillRect(x, y, size, size);
    ctx.strokeRect(x, y, size, size);
    ctx.beginPath();
    ctx.arc(ox + p.u * scale, oy + p.v * scale, 4, 0, Math.PI * 2);
    ctx.fillStyle = layerColors.nearestStroke;
    ctx.fill();
  }

  ctx.save();
  ctx.strokeStyle = "rgba(181, 50, 50, 0.9)";
  ctx.fillStyle = "rgba(181, 50, 50, 0.18)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(ox + imgW * scale / 2 - 10, oy + imgH * scale / 2);
  ctx.lineTo(ox + imgW * scale / 2 + 10, oy + imgH * scale / 2);
  ctx.moveTo(ox + imgW * scale / 2, oy + imgH * scale / 2 - 10);
  ctx.lineTo(ox + imgW * scale / 2, oy + imgH * scale / 2 + 10);
  ctx.stroke();
  ctx.font = "12px system-ui, sans-serif";
  ctx.fillStyle = "#b53232";
  ctx.fillText("image center", ox + imgW * scale / 2 + 12, oy + imgH * scale / 2 - 12);
  ctx.restore();

  ctx.fillStyle = "#17202a";
  ctx.font = "13px system-ui, sans-serif";
  ctx.fillText(`${imgW} x ${imgH} px`, ox, 20);
  if (!proj.visible) {
    ctx.fillStyle = "#b53232";
    ctx.fillText("物体が画角外または一部のみ表示されています", ox + 130, 20);
  }
  ctx.restore();
}

function boundsFromPoints(points) {
  const valid = points.filter((p) => Number.isFinite(p?.x) && Number.isFinite(p?.z));
  if (valid.length === 0) return null;
  return valid.reduce(
    (bounds, p) => ({
      minX: Math.min(bounds.minX, p.x),
      maxX: Math.max(bounds.maxX, p.x),
      minZ: Math.min(bounds.minZ, p.z),
      maxZ: Math.max(bounds.maxZ, p.z),
    }),
    { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity },
  );
}

function regionBounds(region) {
  if (!region || region.length === 0) return null;
  const xs = region.map((p) => p.x);
  const zs = region.map((p) => p.z);
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minZ: Math.min(...zs),
    maxZ: Math.max(...zs),
    width: Math.max(...xs) - Math.min(...xs),
    depth: Math.max(...zs) - Math.min(...zs),
  };
}

function bevZoomView(truth, imageEstimate, bboxRegion) {
  const points = [
    ...(imageEstimate?.regionBev || []),
    imageEstimate?.depthBandBev?.near,
    imageEstimate?.depthBandBev?.center,
    imageEstimate?.depthBandBev?.far,
  ];
  const bounds = boundsFromPoints(points);
  if (!bounds) return { center: bevCenter(), centerBev: { lateral: 0, forward: 15 }, extent: 30, objectBboxOnly: true };

  const width = bounds.maxX - bounds.minX;
  const depth = bounds.maxZ - bounds.minZ;
  const centerBev = {
    lateral: (bounds.minX + bounds.maxX) / 2,
    forward: (bounds.minZ + bounds.maxZ) / 2,
  };
  const extent = clamp(Math.max(width, depth, 4) * 1.45, 8, 180);
  return {
    center: bevCenter(),
    centerBev,
    extent,
    objectBboxOnly: true,
  };
}

function plotlyReady() {
  if (window.Plotly) return true;
  for (const plot of Object.values(plots)) {
    if (!plot) continue;
    plot.innerHTML = '<div class="plot-message">Plotlyを読み込めませんでした。ネットワークまたはCDN設定を確認してください。</div>';
  }
  return false;
}

function plotTickStep(extent) {
  const target = Math.max(1, extent / 8);
  const base = 10 ** Math.floor(Math.log10(target));
  const scaled = target / base;
  if (scaled <= 1) return base;
  if (scaled <= 2) return base * 2;
  if (scaled <= 5) return base * 5;
  return base * 10;
}

function closePolygon(poly) {
  if (!poly || poly.length === 0) return [];
  return [...poly, poly[0]];
}

function roundPx(value) {
  return Math.round(value);
}

function mapXZ(point) {
  return {
    x: point.x,
    y: point.z,
    text: `x=${format(point.x, 2)}m<br>z=${format(point.z, 2)}m`,
  };
}

function mapCameraXZ(point) {
  return {
    x: point.x,
    y: point.z,
    text: `lateral=${format(point.x, 2)}m<br>depth=${format(point.z, 2)}m`,
  };
}

function bevGroundBasis(pose = leftCameraPose()) {
  const basis = cameraBasis(pose);
  const right = normalize(vec(basis.right.x, 0, basis.right.z));
  const forward = normalize(vec(basis.forward.x, 0, basis.forward.z));
  return { right, forward };
}

function pointToBev(point, pose = leftCameraPose()) {
  const origin = vec(pose.x, pose.y, pose.z);
  const rel = sub(vec(point.x, point.y ?? pose.y, point.z), origin);
  const basis = bevGroundBasis(pose);
  const lateral = dot(rel, basis.right);
  const forward = dot(rel, basis.forward);
  return { lateral, forward };
}

function mapBev(point) {
  const bev = pointToBev(point, leftCameraPose());
  return {
    x: bev.lateral,
    y: bev.forward,
    text: `lateral=${format(bev.lateral, 2)}m<br>forward=${format(bev.forward, 2)}m<br>world x=${format(point.x, 2)}m<br>world z=${format(point.z, 2)}m`,
  };
}

function polyTrace(name, poly, color, fill, mapper = mapXZ, width = 2, dash = "solid") {
  if (!poly || poly.length < 2) return null;
  const pts = closePolygon(poly).map(mapper);
  return {
    type: "scatter",
    mode: "lines",
    name,
    x: pts.map((p) => p.x),
    y: pts.map((p) => p.y),
    text: pts.map((p) => p.text),
    hovertemplate: `%{text}<extra>${name}</extra>`,
    line: { color, width, dash },
    fill: fill ? "toself" : "none",
    fillcolor: fill || undefined,
  };
}

function lineTrace(name, points, color, mapper = mapXZ, width = 2, dash = "solid") {
  if (!points || points.length < 2) return null;
  const pts = points.map(mapper);
  return {
    type: "scatter",
    mode: "lines",
    name,
    x: pts.map((p) => p.x),
    y: pts.map((p) => p.y),
    text: pts.map((p) => p.text),
    hovertemplate: `%{text}<extra>${name}</extra>`,
    line: { color, width, dash },
  };
}

function pointTrace(name, point, color, mapper = mapXZ, size = 10, symbol = "circle") {
  if (!point) return null;
  const p = mapper(point);
  return {
    type: "scatter",
    mode: "markers+text",
    name,
    x: [p.x],
    y: [p.y],
    text: [name],
    customdata: [p.text],
    hovertemplate: `%{customdata}<extra>${name}</extra>`,
    textposition: "top right",
    marker: { color, size, symbol, line: { color: "#ffffff", width: 1.5 } },
  };
}

function sampleTrace(name, points, color, mapper = mapXZ, size = 4) {
  if (!points || points.length === 0) return null;
  const pts = points.map(mapper);
  return {
    type: "scatter",
    mode: "markers",
    name,
    x: pts.map((p) => p.x),
    y: pts.map((p) => p.y),
    text: pts.map((p) => p.text),
    hovertemplate: `%{text}<extra>${name}</extra>`,
    marker: { color, size, opacity: 0.55 },
  };
}

function compactTraces(traces) {
  return traces.filter(Boolean);
}

function basePlotLayout({ xTitle, yTitle, xRange, yRange, extent, scaleAnchor = true }) {
  const tick = plotTickStep(extent);
  return {
    margin: { l: 58, r: 22, t: 18, b: 94 },
    paper_bgcolor: "#ffffff",
    plot_bgcolor: "#f9fbfc",
    hovermode: "closest",
    legend: {
      orientation: "h",
      y: -0.18,
      x: 0,
      bgcolor: "rgba(255,255,255,0.72)",
      font: { size: 11 },
    },
    xaxis: {
      title: xTitle,
      range: xRange,
      dtick: tick,
      zeroline: true,
      zerolinecolor: "#8fa0ad",
      gridcolor: "rgba(23, 32, 42, 0.13)",
      linecolor: "#b7c2cb",
      mirror: true,
      ticksuffix: "m",
    },
    yaxis: {
      title: yTitle,
      range: yRange,
      dtick: tick,
      scaleanchor: scaleAnchor ? "x" : undefined,
      scaleratio: scaleAnchor ? 1 : undefined,
      zeroline: true,
      zerolinecolor: "#8fa0ad",
      gridcolor: "rgba(23, 32, 42, 0.13)",
      linecolor: "#b7c2cb",
      mirror: true,
      ticksuffix: "m",
    },
  };
}

function plotConfig() {
  return {
    responsive: true,
    displaylogo: false,
    modeBarButtonsToRemove: ["lasso2d", "select2d"],
  };
}

function reactPlot(plot, data, layout) {
  if (!plot || !plotlyReady()) return;
  window.Plotly.react(plot, data, layout, plotConfig());
}

function terrainHeatmapTrace(center, extent, mapper = mapXZ) {
  const count = 38;
  const half = extent / 2;
  const xs = Array.from({ length: count }, (_, i) => center.x - half + (extent * i) / (count - 1));
  const zs = Array.from({ length: count }, (_, i) => center.z - half + (extent * i) / (count - 1));
  return {
    type: "heatmap",
    name: "terrain height",
    x: xs.map((x) => mapper({ x, z: center.z }).x),
    y: zs.map((z) => mapper({ x: center.x, z }).y),
    z: zs.map((z) => xs.map((x) => groundHeightAt(x, z))),
    colorscale: [
      [0, "#e2ebda"],
      [0.5, "#c4cdac"],
      [1, "#9a8b65"],
    ],
    opacity: 0.6,
    showscale: false,
    hovertemplate: "height=%{z:.2f}m<extra>terrain</extra>",
  };
}

function roadPolygonsForBounds(minZ, maxZ) {
  const halfRoad = state.ground.roadWidth / 2;
  const sideWidth = state.ground.sideWidth;
  return {
    road: [
      { x: -halfRoad, z: minZ },
      { x: halfRoad, z: minZ },
      { x: halfRoad, z: maxZ },
      { x: -halfRoad, z: maxZ },
    ],
    leftShoulder: [
      { x: -halfRoad - sideWidth, z: minZ },
      { x: -halfRoad, z: minZ },
      { x: -halfRoad, z: maxZ },
      { x: -halfRoad - sideWidth, z: maxZ },
    ],
    rightShoulder: [
      { x: halfRoad, z: minZ },
      { x: halfRoad + sideWidth, z: minZ },
      { x: halfRoad + sideWidth, z: maxZ },
      { x: halfRoad, z: maxZ },
    ],
  };
}

function frustumGroundPolygon(pose = leftCameraPose()) {
  return [
    [0, 0],
    [state.camera.resW, 0],
    [state.camera.resW, state.camera.resH],
    [0, state.camera.resH],
  ]
    .map(([u, v]) => intersectGroundFromPixel(u, v, pose))
    .filter(Boolean)
    .map((p) => ({ x: p.x, z: p.z }));
}

function cameraTraces(mapper = mapXZ) {
  const left = leftCameraPose();
  const subCam = subCameraPose();
  const leftBasis = cameraBasis(left);
  const subBasis = cameraBasis(subCam);
  const cam1 = { x: left.x, z: left.z };
  const cam2 = { x: subCam.x, z: subCam.z };
  const forward1 = { x: cam1.x + leftBasis.forward.x * Math.max(4, state.bev.extent * 0.12), z: cam1.z + leftBasis.forward.z * Math.max(4, state.bev.extent * 0.12) };
  const forward2 = { x: cam2.x + subBasis.forward.x * Math.max(4, state.bev.extent * 0.12), z: cam2.z + subBasis.forward.z * Math.max(4, state.bev.extent * 0.12) };
  const dir1 = lineTrace("Camera1 dir", [cam1, forward1], "#17202a", mapper, 2.5);
  const dir2 = lineTrace("Camera2 dir", [cam2, forward2], "#315dba", mapper, 2.2);
  if (dir1) dir1.showlegend = false;
  if (dir2) dir2.showlegend = false;
  return [
    pointTrace("Camera1", cam1, "#17202a", mapper, 12, "triangle-up"),
    pointTrace("Camera2", cam2, "#315dba", mapper, 11, "triangle-up"),
    dir1,
    dir2,
  ];
}

function renderWorldPlot(proj, region, truth, imageEstimate) {
  const center = { x: state.camera.x, z: state.camera.z + state.bev.extent * 0.32 };
  const extent = Math.max(10, state.bev.extent);
  const half = extent / 2;
  const roads = roadPolygonsForBounds(center.z - half, center.z + half);
  const frustum = convexHull([
    ...frustumGroundPolygon(leftCameraPose()),
    ...frustumGroundPolygon(subCameraPose()),
  ]);
  const data = compactTraces([
    terrainHeatmapTrace(center, extent),
    polyTrace("left shoulder", roads.leftShoulder, "rgba(132, 144, 99, 0.70)", layerColors.shoulderFill),
    polyTrace("right shoulder", roads.rightShoulder, "rgba(132, 144, 99, 0.70)", layerColors.shoulderFill),
    polyTrace("road truth", roads.road, layerColors.roadTruthStroke, layerColors.roadTruthFill),
    lineTrace("road center", [{ x: 0, z: center.z - half }, { x: 0, z: center.z + half }], "#f4d35e", mapXZ, 1.5, "dash"),
    polyTrace("all", frustum, "rgba(0, 127, 122, 0.55)", "rgba(0, 127, 122, 0.08)"),
    polyTrace("true footprint", truth?.footprint, layerColors.truthStroke, layerColors.truthFill, mapXZ, 3),
    pointTrace("object center", truth?.bottomCenter, layerColors.truthCenter, mapXZ, 9, "diamond"),
    pointTrace("truth nearest", truth?.nearest, layerColors.truthStroke, mapXZ, 8, "circle"),
    ...cameraTraces(),
  ]);
  const layout = basePlotLayout({
    xTitle: "World X [m]",
    yTitle: "World Z [m]",
    xRange: [center.x - half, center.x + half],
    yRange: [center.z - half, center.z + half],
    extent,
  });
  reactPlot(plots.world, data, layout);
}

function projectedLineTrace(name, points, color, width = 2, dash = "solid", pose = leftCameraPose()) {
  const projected = points.map((point) => project(point, pose)).filter(Boolean);
  if (projected.length < 2) return null;
  return {
    type: "scatter",
    mode: "lines",
    name,
    x: projected.map((p) => roundPx(p.u)),
    y: projected.map((p) => roundPx(p.v)),
    hovertemplate: "u=%{x:.0f}px<br>v=%{y:.0f}px<extra>" + name + "</extra>",
    line: { color, width, dash },
  };
}

function imagePolygonTrace(name, projected, color, fill, width = 2) {
  if (!projected || projected.length < 2) return null;
  const closed = [...projected, projected[0]];
  return {
    type: "scatter",
    mode: "lines",
    name,
    x: closed.map((p) => roundPx(p.u)),
    y: closed.map((p) => roundPx(p.v)),
    fill: fill ? "toself" : "none",
    fillcolor: fill || undefined,
    hovertemplate: "u=%{x:.0f}px<br>v=%{y:.0f}px<extra>" + name + "</extra>",
    line: { color, width },
  };
}

function clippedImageBbox(bbox) {
  if (!bbox) return null;
  const left = clamp(bbox.left, 0, state.camera.resW);
  const right = clamp(bbox.right, 0, state.camera.resW);
  const top = clamp(bbox.top, 0, state.camera.resH);
  const bottom = clamp(bbox.bottom, 0, state.camera.resH);
  if (right <= left || bottom <= top) return null;
  return { left, right, top, bottom };
}

function imageBboxTraces(bbox, fullyVisible) {
  const b = bbox;
  if (!b) return [];
  const fullTrace = imagePolygonTrace(
    fullyVisible ? "object bbox" : "object bbox (full)",
    [
      { u: b.left, v: b.top },
      { u: b.right, v: b.top },
      { u: b.right, v: b.bottom },
      { u: b.left, v: b.bottom },
    ],
    fullyVisible ? layerColors.bboxStroke : layerColors.bboxPartialStroke,
    fullyVisible ? layerColors.bboxFill : layerColors.bboxPartialFill,
    2.5,
  );
  if (fullyVisible) return [fullTrace];

  const clipped = clippedImageBbox(b);
  if (!clipped) return [fullTrace];
  const visibleTrace = imagePolygonTrace(
    "object bbox (visible)",
    [
      { u: clipped.left, v: clipped.top },
      { u: clipped.right, v: clipped.top },
      { u: clipped.right, v: clipped.bottom },
      { u: clipped.left, v: clipped.bottom },
    ],
    layerColors.bboxStroke,
    layerColors.bboxFill,
    2.5,
  );
  return [fullTrace, visibleTrace];
}

function bboxRegionColors(proj) {
  return proj?.fullyVisible
    ? { stroke: layerColors.bboxStroke, fill: layerColors.bboxFill }
    : { stroke: layerColors.bboxPartialStroke, fill: layerColors.bboxPartialFill };
}

function imageTerrainTraces(pose = leftCameraPose()) {
  const halfRoad = state.ground.roadWidth / 2;
  const shoulder = Math.max(0.5, state.ground.sideWidth);
  const zStart = state.camera.z - state.bev.extent * 0.15;
  const zEnd = state.camera.z + state.bev.extent * 1.35;
  const segments = 24;
  const zStep = (zEnd - zStart) / segments;
  const traces = [];
  for (let i = segments - 1; i >= 0; i -= 1) {
    const z0 = zStart + zStep * i;
    const z1 = z0 + zStep;
    const road = [
      vec(-halfRoad, groundHeightAt(-halfRoad, z0) + 0.01, z0),
      vec(halfRoad, groundHeightAt(halfRoad, z0) + 0.01, z0),
      vec(halfRoad, groundHeightAt(halfRoad, z1) + 0.01, z1),
      vec(-halfRoad, groundHeightAt(-halfRoad, z1) + 0.01, z1),
    ].map((point) => project(point, pose));
    const leftShoulder = [
      vec(-halfRoad - shoulder, groundHeightAt(-halfRoad - shoulder, z0) + 0.005, z0),
      vec(-halfRoad, groundHeightAt(-halfRoad, z0) + 0.005, z0),
      vec(-halfRoad, groundHeightAt(-halfRoad, z1) + 0.005, z1),
      vec(-halfRoad - shoulder, groundHeightAt(-halfRoad - shoulder, z1) + 0.005, z1),
    ].map((point) => project(point, pose));
    const rightShoulder = [
      vec(halfRoad, groundHeightAt(halfRoad, z0) + 0.005, z0),
      vec(halfRoad + shoulder, groundHeightAt(halfRoad + shoulder, z0) + 0.005, z0),
      vec(halfRoad + shoulder, groundHeightAt(halfRoad + shoulder, z1) + 0.005, z1),
      vec(halfRoad, groundHeightAt(halfRoad, z1) + 0.005, z1),
    ].map((point) => project(point, pose));
    for (const trace of [
      imagePolygonTrace("road truth", road.filter(Boolean), "rgba(246, 248, 241, 0.16)", layerColors.roadTruthFill, 0.7),
      imagePolygonTrace("left shoulder", leftShoulder.filter(Boolean), "rgba(132, 144, 99, 0.28)", layerColors.shoulderFill, 0.4),
      imagePolygonTrace("right shoulder", rightShoulder.filter(Boolean), "rgba(132, 144, 99, 0.28)", layerColors.shoulderFill, 0.4),
    ]) {
      if (trace) trace.showlegend = false;
      traces.push(trace);
    }
  }

  const lineZs = Array.from({ length: 36 }, (_, i) => zStart + ((zEnd - zStart) * i) / 35);
  for (const x of [-halfRoad, 0, halfRoad]) {
    const trace = projectedLineTrace(
      x === 0 ? "road center" : "road edge",
      lineZs.map((z) => vec(x, groundHeightAt(x, z) + 0.04, z)),
      x === 0 ? "rgba(255, 244, 174, 0.9)" : "rgba(255, 255, 255, 0.72)",
      x === 0 ? 1.8 : 1.2,
      x === 0 ? "dash" : "solid",
      pose,
    );
    if (trace) trace.showlegend = x === 0;
    traces.push(trace);
  }
  return traces;
}

function renderSingleImagePlot(plot, pose, points, bbox, visible, fullyVisible, title, splatPoints = []) {
  const imgW = state.camera.resW;
  const imgH = state.camera.resH;
  const centerU = imgW / 2;
  const centerV = imgH / 2;
  const objectPoints = points || [];
  const orderedSplatPoints = sortImagePointsByU(splatPoints);
  const cornerPoints = state.object.mode === "point" ? objectPoints : objectPoints.slice(0, 8);
  const centerPoint = state.object.mode === "point" ? null : objectPoints[8] || null;
  const data = compactTraces([
    ...imageTerrainTraces(pose),
    ...imageBboxTraces(bbox, fullyVisible),
    cornerPoints.length
      ? {
        type: "scatter",
        mode: "markers",
        name: "projected object corners",
        x: cornerPoints.map((p) => roundPx(p.u)),
        y: cornerPoints.map((p) => roundPx(p.v)),
        marker: { color: layerColors.truthStroke, size: 5 },
        hovertemplate: "u=%{x:.0f}px<br>v=%{y:.0f}px<extra>object corner</extra>",
      }
      : null,
    centerPoint
      ? {
        type: "scatter",
        mode: "markers",
        name: "projected object center",
        x: [roundPx(centerPoint.u)],
        y: [roundPx(centerPoint.v)],
        marker: { color: layerColors.truthCenter, size: 7, line: { color: "#ffffff", width: 1 } },
        hovertemplate: "u=%{x:.0f}px<br>v=%{y:.0f}px<extra>object center</extra>",
      }
      : null,
    orderedSplatPoints.length >= 2
      ? {
        type: "scatter",
        mode: "lines",
        name: "bbox splat band",
        x: orderedSplatPoints.map((p) => roundPx(p.u)),
        y: orderedSplatPoints.map((p) => roundPx(p.v)),
        line: { color: "#ff4fd8", width: 3 },
        hovertemplate: "u=%{x:.0f}px<br>v=%{y:.0f}px<extra>bbox splat band</extra>",
      }
      : null,
    orderedSplatPoints.length
      ? {
        type: "scatter",
        mode: "markers",
        name: "bbox splat",
        x: orderedSplatPoints.map((p) => roundPx(p.u)),
        y: orderedSplatPoints.map((p) => roundPx(p.v)),
        marker: {
          color: "#ff4fd8",
          size: 10,
          opacity: 0.95,
          symbol: "diamond",
          line: { color: "#ffffff", width: 1.2 },
        },
        hovertemplate: "u=%{x:.0f}px<br>v=%{y:.0f}px<extra>bbox splat</extra>",
      }
      : null,
    lineTrace("image center H", [{ x: centerU - imgW * 0.03, z: centerV }, { x: centerU + imgW * 0.03, z: centerV }], "#b53232", (p) => ({ x: p.x, y: p.z, text: "" }), 1.8),
    lineTrace("image center V", [{ x: centerU, z: centerV - imgH * 0.03 }, { x: centerU, z: centerV + imgH * 0.03 }], "#b53232", (p) => ({ x: p.x, y: p.z, text: "" }), 1.8),
  ]);
  const layout = {
    margin: { l: 58, r: 22, t: 18, b: 94 },
    paper_bgcolor: "#ffffff",
    plot_bgcolor: "#182431",
    hovermode: "closest",
    legend: { orientation: "h", y: -0.18, x: 0, bgcolor: "rgba(255,255,255,0.72)", font: { size: 11 } },
    xaxis: {
      title: `${title} u [px]  ${imgW} x ${imgH}`,
      range: [0, imgW],
      gridcolor: "rgba(255, 255, 255, 0.14)",
      linecolor: "#b7c2cb",
      mirror: true,
      zeroline: false,
    },
    yaxis: {
      title: "v [px]",
      range: [imgH, 0],
      scaleanchor: "x",
      scaleratio: 1,
      gridcolor: "rgba(255, 255, 255, 0.14)",
      linecolor: "#b7c2cb",
      mirror: true,
      zeroline: false,
    },
    annotations: visible
      ? []
      : [{ x: imgW * 0.5, y: imgH * 0.08, text: "物体が画角外または一部のみ表示", showarrow: false, font: { color: "#ff8a8a", size: 13 } }],
  };
  reactPlot(plot, data, layout);
}

function renderImagePlot(proj, imageEstimate) {
  renderSingleImagePlot(
    plots.image,
    leftCameraPose(),
    proj.points,
    proj.bbox,
    proj.visible,
    proj.fullyVisible,
    "Camera1",
    stereoImageSplatPoints(imageEstimate, "left"),
  );
  renderSingleImagePlot(
    plots.imageSub,
    subCameraPose(),
    proj.subPoints,
    proj.subBbox,
    proj.subVisible,
    proj.subFullyVisible,
    "Camera2",
    stereoImageSplatPoints(imageEstimate, "right"),
  );
}

function bevFramePoly(center) {
  const size = bevSizeMeters();
  const halfW = size.width / 2;
  const halfD = size.depth / 2;
  return [
    { x: center.x - halfW, z: center.z - halfD },
    { x: center.x + halfW, z: center.z - halfD },
    { x: center.x + halfW, z: center.z + halfD },
    { x: center.x - halfW, z: center.z + halfD },
  ];
}

// BBOX格子をBEVにスプラットしてヒートマップを生成する関数
function bboxSplatHeatmapTrace(proj, imageEstimate, view) {
  if (!proj || !proj.bbox || !imageEstimate) return null;

  const { left, right } = proj.bbox;
  const { depthMin, depthMax } = imageEstimate;

  if (depthMin >= depthMax || right <= left) return null;

  const centerBev = view?.centerBev || pointToBev({ x: bevCenter().x, y: state.camera.y, z: bevCenter().z }, leftCameraPose());
  const extent = view?.extent || Math.max(10, bevSizeMeters().extent);

  const gridSize = 150;
  const halfExt = extent / 2;
  const minLat = centerBev.lateral - halfExt;
  const maxLat = centerBev.lateral + halfExt;
  const minFwd = centerBev.forward - halfExt;
  const maxFwd = centerBev.forward + halfExt;
  const dLat = extent / gridSize;
  const dFwd = extent / gridSize;

  const zData = Array(gridSize).fill(0).map(() => Array(gridSize).fill(null));

  const uSteps = 100;
  const dSteps = 100;
  const k = intrinsics();

  for (let i = 0; i <= uSteps; i++) {
    const u = left + (right - left) * (i / uSteps);
    for (let j = 0; j <= dSteps; j++) {
      const d = depthMin + (depthMax - depthMin) * (j / dSteps);

      const xCam = ((u - k.cx) / k.fx) * d;
      const zCam = d;

      const xIdx = Math.floor((xCam - minLat) / dLat);
      const zIdx = Math.floor((zCam - minFwd) / dFwd);

      if (xIdx >= 0 && xIdx < gridSize && zIdx >= 0 && zIdx < gridSize) {
        zData[zIdx][xIdx] = 1;
      }
    }
  }

  const xData = Array.from({ length: gridSize }, (_, i) => minLat + dLat * (i + 0.5));
  const yData = Array.from({ length: gridSize }, (_, i) => minFwd + dFwd * (i + 0.5));

  return {
    type: "heatmap",
    name: "BBOX Splat Area",
    x: xData,
    y: yData,
    z: zData,
    colorscale: [
      [0, "rgba(255, 79, 216, 0)"],
      [1, "rgba(255, 79, 216, 0.45)"]
    ],
    showscale: false,
    hoverinfo: "skip"
  };
}

function renderBevPlot(proj, region, truth, imageEstimate, view = null) {
  const bevSize = bevSizeMeters();
  const center = view?.center || bevCenter();
  const extent = view?.extent || Math.max(10, bevSize.extent);
  const objectBboxOnly = Boolean(view?.objectBboxOnly);
  const half = extent / 2;
  const centerBev = view?.centerBev || pointToBev({ x: center.x, y: state.camera.y, z: center.z }, leftCameraPose());
  const roads = roadPolygonsForBounds(center.z - half, center.z + half);
  const depthBand = imageEstimate?.depthBandBev || null;
  const data = compactTraces([
    objectBboxOnly ? null : terrainHeatmapTrace(center, extent, mapBev),
    objectBboxOnly ? null : polyTrace("left shoulder", roads.leftShoulder, "rgba(132, 144, 99, 0.70)", layerColors.shoulderFill, mapBev),
    objectBboxOnly ? null : polyTrace("right shoulder", roads.rightShoulder, "rgba(132, 144, 99, 0.70)", layerColors.shoulderFill, mapBev),
    objectBboxOnly ? null : polyTrace("road truth", roads.road, layerColors.roadTruthStroke, layerColors.roadTruthFill, mapBev),
    objectBboxOnly ? null : polyTrace("BEV frame", bevFramePoly(bevCenter()), "rgba(23, 32, 42, 0.65)", "rgba(255, 255, 255, 0.10)", mapBev, 2),
    lineTrace("stereo depth band", depthBand ? [depthBand.near, depthBand.far] : null, bboxRegionColors(proj).stroke, mapCameraXZ, 3),

    // スプラットでのヒートマップ描画
    bboxSplatHeatmapTrace(proj, imageEstimate, view),
    // BBOX境界の輪郭線描画
    polyTrace("BBOX existence range (bounds)", imageEstimate?.regionBev, "#ff4fd8", null, mapCameraXZ, 2, "dot"),

    pointTrace("stereo depth", depthBand?.center, bboxRegionColors(proj).stroke, mapCameraXZ, 9, "circle"),
    objectBboxOnly ? null : pointTrace("camera", { x: state.camera.x, z: state.camera.z }, "#17202a", mapBev, 12, "triangle-up"),
    objectBboxOnly ? null : pointTrace("camera2", { x: subCameraPose().x, z: subCameraPose().z }, "#315dba", mapBev, 11, "triangle-up"),
  ]);
  const layout = basePlotLayout({
    xTitle: "Lateral from camera [m]",
    yTitle: "Forward from camera [m]",
    xRange: [centerBev.lateral - half, centerBev.lateral + half],
    yRange: [centerBev.forward - half, centerBev.forward + half],
    extent,
  });
  layout.xaxis.tick0 = 0;
  layout.yaxis.tick0 = 0;
  layout.annotations = depthBand
    ? [
      {
        x: depthBand.center.x,
        y: depthBand.center.z,
        text: `${format(imageEstimate.depthBand?.center?.z, 1)}m<br><span style="font-size:11px">BBOX range ${format(imageEstimate.depthMin, 1)}-${format(imageEstimate.depthMax, 1)}m</span>`,
        showarrow: false,
        yshift: 14,
        font: { color: bboxRegionColors(proj).stroke, size: 12 },
        bgcolor: "rgba(255,255,255,0.82)",
      },
    ]
    : [];
  reactPlot(objectBboxOnly ? plots.bevZoom : plots.bev, data, layout);
}

function renderBev(proj, region, truth, imageEstimate, nearestImageEstimate, roadEstimate, canvas = canvases.bev, view = null) {
  const { ctx, w, h } = setupCanvas(canvas);
  clear(ctx, w, h);
  const bevSize = bevSizeMeters();
  const center = view?.center || bevCenter();
  const extent = view?.extent || Math.max(10, bevSize.extent);
  const objectBboxOnly = Boolean(view?.objectBboxOnly);
  const tr = makeMapTransform(w, h, extent, center.x, center.z);
  if (!objectBboxOnly) {
    drawTerrain(ctx, tr, w, h);
    drawRoadOverlay(ctx, tr, w, h);
  }
  drawGrid(ctx, tr, w, h, extent);
  if (!objectBboxOnly) {
    drawBevFrame(ctx, tr, center, bevSize);
    drawBevDistanceRuler(ctx, tr);
    drawImageCenterDepthCue(ctx, tr);
    drawBevCenterMarker(ctx, tr, center);
    drawPolygon(ctx, tr, roadEstimate?.region, layerColors.roadEstimateFill, layerColors.roadEstimateStroke, 2.5);
  }
  drawPolygon(ctx, tr, region, layerColors.bboxFill, layerColors.bboxStroke, 2.5);
  if (!objectBboxOnly) {
    drawPolygon(ctx, tr, nearestImageEstimate?.region, layerColors.nearestFill, layerColors.nearestStroke, 2.5);
    drawSamples(ctx, tr, sampleBboxBottomContacts(proj.bbox), 13);
  }
  drawPolygon(ctx, tr, objectFootprint(), layerColors.truthFill, layerColors.truthStroke, 2.5);
  const expanded = objectFootprint(Math.sqrt(state.object.w ** 2 + state.object.d ** 2) * 0.08);
  drawPolygon(ctx, tr, expanded, null, "rgba(217, 109, 47, 0.45)", 1);
  drawPointMarker(ctx, tr, truth.nearest, layerColors.truthStroke, "truth nearest");
  drawPointMarker(ctx, tr, imageEstimate?.bottom, layerColors.imagePoint, objectBboxOnly ? "bbox bottom" : "image");
  if (!objectBboxOnly) {
    drawPointMarker(ctx, tr, { x: state.camera.x, z: state.camera.z }, "#17202a", "camera");
  }
  const legend = objectBboxOnly
    ? [
      [layerColors.bboxStroke, "bbox bottom + size -> BEV"],
      [layerColors.truthStroke, "true footprint"],
    ]
    : [
      ["#17202a", "BEV meter grid"],
      ["#b53232", "image center depth"],
      [layerColors.bboxStroke, "bbox bottom + size -> BEV"],
      [layerColors.nearestStroke, "nearest image -> depth"],
      [layerColors.roadEstimateStroke, "road image -> BEV"],
      [layerColors.truthStroke, "true footprint"],
    ];
  drawLegend(ctx, legend);
}

function format(value, digits = 2) {
  if (!Number.isFinite(value)) return "--";
  return value.toFixed(digits);
}

function formatXZ(point, digits = 2) {
  if (!point) return "--";
  return `x=${format(point.x, digits)}, z=${format(point.z, digits)}`;
}

function formatXYZ(point, digits = 2) {
  if (!point) return "--";
  return `x=${format(point.x, digits)}, y=${format(point.y, digits)}, z=${format(point.z, digits)}`;
}

function formatBevUnit(unit, digits = 1) {
  if (!unit) return "--";
  return `col=${format(unit.col, digits)}, row=${format(unit.row, digits)}`;
}

function distanceXZ(a, b) {
  if (!a || !b) return NaN;
  return Math.hypot(a.x - b.x, a.z - b.z);
}

function distance3D(a, b) {
  if (!a || !b) return NaN;
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

function updateOutputs(proj, region, truth, imageEstimate) {
  const k = intrinsics();
  const subPose = subCameraPose();
  const support = objectSupportInfo();
  const bevSize = bevSizeMeters();
  const center = bevCenter();
  outputs.fov.textContent = `${k.modelLabel} / ${state.camera.resW}x${state.camera.resH} / FOV ${format(k.hFovDeg, 1)} x ${format(k.vFovDeg, 1)} deg`;
  outputs.cameraModel.textContent = `${k.modelLabel}: ${k.resolutionMode === "full" ? "Full" : "Quarter"} ${state.camera.resW} x ${state.camera.resH} / H-FOV ${format(k.hFovDeg, 0)} deg`;
  outputs.subCamera.textContent = state.stereo.mode === "manual"
    ? `Manual / x=${format(subPose.x, 2)} z=${format(subPose.z, 2)} / yaw ${format(subPose.yaw, 1)}`
    : `Stereo Right / baseline ${format(cameraModel().baselineM, 3)} m`;

  const bbox = proj.bbox;
  if (bbox) {
    outputs.bbox.textContent = `${roundPx(bbox.width)} x ${roundPx(bbox.height)} px`;
  } else {
    outputs.bbox.textContent = "bbox --";
  }

  const area = polygonArea(region);
  const bboxBevBounds = regionBounds(imageEstimate?.regionBev);
  const areaUnits = area / Math.max(1e-9, state.bev.unitLength ** 2);
  outputs.area.textContent = `${format(area, 1)} m2 / ${format(areaUnits, 0)} unit`;
  outputs.bevConfig.textContent = `${state.bev.unitsX}x${state.bev.unitsZ} / ${format(state.bev.unitLength, 2)}m/unit / camera row=0`;

  const modeLabel = state.object.mode === "point" ? "Point" : "3D直方体";
  const contactLabel = support.contact && support.maxGap > 0.05 ? "接触（一部に隙間）" : "接触";
  outputs.contact.textContent = support.contact
    ? `${modeLabel}: ${contactLabel}  Y=${format(support.bottomY, 2)}m / 地形 ${format(support.minGround, 2)}-${format(support.maxGround, 2)}m / 最大隙間 ${format(support.maxGap, 2)}m`
    : `${modeLabel}: 浮上  最小隙間=${format(support.minGap, 2)}m / 最大隙間 ${format(support.maxGap, 2)}m`;
  outputs.contact.classList.toggle("contact", support.contact);
  outputs.contact.classList.toggle("floating", !support.contact);

  const groundPts = sampleBboxBottomContacts(proj.bbox, proj.subBbox, uiSampleCounts.bboxBottom);
  const sampleZs = groundPts.map((p) => p.z);
  const minSampleZ = sampleZs.length ? Math.min(...sampleZs) : NaN;
  const maxSampleZ = sampleZs.length ? Math.max(...sampleZs) : NaN;
  const sampleRanges = groundPts.map((p) => Math.hypot(p.x - state.camera.x, p.z - state.camera.z));
  const minSampleRange = sampleRanges.length ? Math.min(...sampleRanges) : NaN;
  const maxSampleRange = sampleRanges.length ? Math.max(...sampleRanges) : NaN;
  const bboxCenterY = state.object.mode === "point" ? support.bottomY : support.bottomY + state.object.h / 2;
  const bboxCenterDepth = bbox ? worldToCamera(vec(state.object.x, bboxCenterY, state.object.z), leftCameraPose()).z : NaN;
  const quantizedWidth = bbox && state.object.mode !== "point" ? state.object.w / Math.max(1, bbox.width) : NaN;
  const imagePositionError = distanceXZ(truth.bottomCenter, imageEstimate?.bottom);
  const cameraPos = vec(state.camera.x, state.camera.y, state.camera.z);
  const nearestRange3d = distance3D(cameraPos, truth.nearest);
  const nearestRangeGround = distanceXZ(cameraPos, truth.nearest);
  const cameraBevUnit = worldToBevUnit({ x: state.camera.x, z: state.camera.z }, center);
  const truthBevUnit = worldToBevUnit(truth.nearest, center);
  const imageBevUnit = worldToBevUnit(imageEstimate?.bottom, center);
  const centerCell = { col: state.bev.unitsX / 2, row: state.bev.unitsZ / 2 };

  outputs.metrics.innerHTML = [
    ["カメラモデル", `${k.modelLabel} / ${k.resolutionMode === "full" ? "Full" : "Quarter"}`],
    ["サブカメラ", state.stereo.mode === "manual" ? `Manual / ${formatXYZ(subPose)}` : `Stereo Right / baseline ${format(cameraModel().baselineM, 3)} m`],
    ["内部パラメータ", `fx=${format(k.fx, 0)} px / fy=${format(k.fy, 0)} px`],
    ["bbox画素量", bbox ? `${roundPx(bbox.width)} x ${roundPx(bbox.height)} px` : "--"],
    ["Camera2 bbox画素量", proj.subBbox ? `${roundPx(proj.subBbox.width)} x ${roundPx(proj.subBbox.height)} px` : "--"],
    ["BBOX存在範囲", `${format(area, 2)} m2`],
    ["BBOX存在範囲 z offset", bboxBevBounds ? `${format(bboxBevBounds.minZ - state.camera.z, 1)} - ${format(bboxBevBounds.maxZ - state.camera.z, 1)} m` : "--"],
    ["BBOX存在範囲 lateral", bboxBevBounds ? `${format(bboxBevBounds.minX - state.camera.x, 1)} - ${format(bboxBevBounds.maxX - state.camera.x, 1)} m` : "--"],
    ["bbox下端サンプル z範囲", `${format(minSampleZ, 2)} - ${format(maxSampleZ, 2)} m`],
    ["bbox下端サンプル水平距離", `${format(minSampleRange, 2)} - ${format(maxSampleRange, 2)} m`],
    ["Stereo camera depth範囲", imageEstimate ? `${format(imageEstimate.depthMin, 2)} - ${format(imageEstimate.depthMax, 2)} m` : "--"],
    ["物体中心 Camera depth", `${format(bboxCenterDepth, 2)} m`],
    ["物体表現", modeLabel],
    ["接地状態", support.contact ? `${contactLabel} / 最大隙間 ${format(support.maxGap, 2)} m` : `浮上 ${format(support.minGap, 2)} m`],
    ["幅の1px相当", `${format(quantizedWidth * 100, 1)} cm/px`],
    ["地形", `${terrainLabel()} / 道幅 ${format(state.ground.roadWidth, 1)} m`],
    ["地形高さ", `${format(support.minGround, 2)} - ${format(support.maxGround, 2)} m`],
    ["BEV解像度", `${state.bev.unitsX} x ${state.bev.unitsZ} unit`],
    ["BEV実寸", `${format(bevSize.width, 1)} x ${format(bevSize.depth, 1)} m / ${format(state.bev.unitLength, 2)} m/unit`],
    ["BEV中心セル", `${formatBevUnit(centerCell)} / 物体奥行中央 ${state.bev.autoObjectCenter ? "ON" : "OFF"}`],
    ["BEV固定", state.bev.lockMode === "unit" ? "1Unit長を固定" : "解像度を固定"],
    ["BEV中心の世界座標", formatXZ(center)],
    ["カメラ BEV unit", formatBevUnit(cameraBevUnit)],
    ["truth BEV unit", formatBevUnit(truthBevUnit)],
    ["image BEV unit", formatBevUnit(imageBevUnit)],
    ["真値 最近傍底面", formatXYZ(truth.nearest)],
    ["真値 底面中心", formatXYZ(truth.bottomCenter)],
    ["撮像由来 物体候補", formatXYZ(imageEstimate?.bottom)],
    ["撮像由来 領域中心", formatXZ(imageEstimate?.regionCenter)],
    ["真値-撮像 誤差", `${format(imagePositionError, 2)} m / ${format(imagePositionError / state.bev.unitLength, 1)} unit`],
    ["最近傍まで距離", `3D ${format(nearestRange3d, 2)} m / 水平 ${format(nearestRangeGround, 2)} m`],
    ["道路 真値", `幅 ${format(state.ground.roadWidth, 2)} m / 脇坂 ${format(state.ground.sideWidth, 2)} m`],
    ["画素誤差", `+/- ${format(state.bev.pixelTol, 2)} px`],
  ]
    .map(([label, value]) => `<div class="metric"><strong>${label}</strong><span>${value}</span></div>`)
    .join("");
}

function render() {
  applyCameraResolution();
  applyDynamicLimits();
  applyBevAutoFit();
  syncInputs();
  const proj = projectedObject();
  const truth = objectTruthPosition();
  const imageEstimate = estimateFromImageBbox(proj.bbox, proj.subBbox);
  const region = imageEstimate?.region || null;
  renderWorldPlot(proj, region, truth, imageEstimate);
  renderImagePlot(proj, imageEstimate);
  renderBevPlot(proj, region, truth, imageEstimate);
  renderBevPlot(proj, region, truth, imageEstimate, bevZoomView(truth, imageEstimate, region));
  updateOutputs(proj, region, truth, imageEstimate);
}

function setActivePhase(target) {
  document.querySelectorAll("[data-tab]").forEach((button) => {
    button.classList.toggle("active", button.dataset.tab === target);
  });
  document.querySelectorAll("[data-panel]").forEach((panel) => {
    panel.classList.toggle("active", panel.dataset.panel === target);
  });
}

function syncInputs() {
  const manualStereo = state.stereo.mode === "manual";
  document.querySelectorAll(".stereo-manual").forEach((label) => {
    label.classList.toggle("hidden", !manualStereo);
  });
  for (const input of inputs) {
    const value = getValue(input.dataset.key);
    if (input.type === "checkbox") {
      if (document.activeElement !== input) input.checked = Boolean(value);
      continue;
    }
    if (document.activeElement !== input) {
      input.value = input.dataset.sliderMode === "object-z-log"
        ? String(Math.round(sliderFromObjectZ(value)))
        : String(value);
    }
    if (input.type === "range") {
      const label = input.closest("label")?.querySelector("span");
      const base = label?.dataset.base || label?.textContent?.replace(/\s+[-+]?\d+(\.\d+)?$/, "");
      if (label && base) {
        label.dataset.base = base;
        label.textContent = `${base} ${Number(value).toFixed(input.step.includes(".") ? 2 : 0)}`;
      }
    }
  }
}

function attachEvents() {
  for (const input of inputs) {
    input.addEventListener("input", () => {
      let value;
      if (input.type === "checkbox") value = input.checked;
      else if (input.tagName === "SELECT") value = input.value;
      else if (input.dataset.sliderMode === "object-z-log") value = objectZFromSlider(Number(input.value));
      else value = Number(input.value);
      setValue(input.dataset.key, value);
      render();
    });
  }

  document.getElementById("resetButton").addEventListener("click", () => {
    state = structuredClone(defaults);
    render();
  });

  document.getElementById("centerButton").addEventListener("click", () => {
    const basis = cameraBasis();
    const distance = clamp(state.bev.extent * 0.45, 14, 220);
    state.object.x = state.camera.x + basis.forward.x * distance;
    state.object.z = state.camera.z + basis.forward.z * distance;
    state.object.yaw = state.camera.yaw;
    render();
  });

  for (const tab of document.querySelectorAll("[data-tab]")) {
    tab.addEventListener("click", () => {
      setActivePhase(tab.dataset.tab);
      render();
    });
  }

  for (const heading of document.querySelectorAll(".control-section .section-heading")) {
    heading.addEventListener("click", () => {
      const section = heading.closest(".control-section");
      const collapsed = section.classList.toggle("collapsed");
      heading.setAttribute("aria-expanded", String(!collapsed));
      if (window.Plotly) {
        requestAnimationFrame(() => {
          Object.values(plots).forEach((plot) => {
            if (plot) window.Plotly.Plots.resize(plot);
          });
        });
      }
    });
  }

  window.addEventListener("resize", render);
}

attachEvents();
setActivePhase("layout");
render();

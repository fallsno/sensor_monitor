const HEAT_LEVEL_CLASS_MAP = Object.freeze({
    高: 'text-rose-400',
    中: 'text-amber-400',
    低: 'text-sky-400',
    无: 'text-zinc-500'
});

const HEATMAP_VISIBLE_VIEWS = new Set(['global', 'pressure', 'rpm']);

const HOTSPOT_VIEW_MAP = Object.freeze({
    'hotspot-motor-1': 'motor',
    'hotspot-motor-2': 'motor',
    'hotspot-motor-3': 'motor',
    'hotspot-motor-4': 'motor',
    'hotspot-upper-press': 'pressure',
    'hotspot-lower-press': 'pressure',
    'hotspot-upper-rpm': 'rpm',
    'hotspot-lower-rpm': 'rpm',
    'hotspot-displacement': 'global',
    'hotspot-tire': 'pressure'
});

const HEAT_COLOR_STOPS = Object.freeze([
    { value: 0.0, color: [0.0, 0.0, 0.0] },
    { value: 0.25, color: [0.1, 0.45, 0.95] },
    { value: 0.55, color: [0.1, 0.85, 0.55] },
    { value: 0.8, color: [0.98, 0.82, 0.15] },
    { value: 1.0, color: [1.0, 0.32, 0.1] }
]);

const VIEW_TARGET_OFFSETS = Object.freeze({
    global: [0, 0, 0],
    pressure: [0, 0.08, 0.18],
    rpm: [0, 0.02, -0.12],
    motor: [0.12, 0.04, 0]
});

const SURFACE_STYLE_PRESETS = Object.freeze({
    drum: {
        baseColor: [0.64, 0.66, 0.7],
        metalness: 0.88,
        roughness: 0.2,
        emissive: [0.02, 0.024, 0.03],
        envMapIntensity: 1.42,
        clearcoat: 0.22
    },
    tire: {
        baseColor: [0.52, 0.56, 0.62],
        metalness: 0.82,
        roughness: 0.22,
        emissive: [0.018, 0.022, 0.03],
        envMapIntensity: 1.32,
        clearcoat: 0.14
    },
    thrust: {
        baseColor: [0.5, 0.53, 0.6],
        metalness: 0.78,
        roughness: 0.24,
        emissive: [0.018, 0.022, 0.028],
        envMapIntensity: 1.18,
        clearcoat: 0.12
    },
    drive: {
        baseColor: [0.46, 0.49, 0.55],
        metalness: 0.78,
        roughness: 0.28,
        emissive: [0.014, 0.018, 0.022],
        envMapIntensity: 1.08,
        clearcoat: 0.1
    },
    sensor: {
        baseColor: [0.2, 0.25, 0.33],
        metalness: 0.38,
        roughness: 0.4,
        emissive: [0.0, 0.0, 0.0],
        envMapIntensity: 0.74,
        clearcoat: 0
    },
    other: {
        baseColor: [0.57, 0.6, 0.64],
        metalness: 0.64,
        roughness: 0.32,
        emissive: [0.0, 0.0, 0.0],
        envMapIntensity: 0.94,
        clearcoat: 0.05
    }
});

function clamp01(value) {
    return Math.max(0, Math.min(1, value));
}

function lerp(from, to, t) {
    return from + (to - from) * t;
}

function brightenColor(color, factor) {
    return color.map((channel) => Number(clamp01(channel * factor).toFixed(3)));
}

function formatNumber(value) {
    return value.toFixed(3);
}

export function resolveHeatCarrierSide(meshName = '') {
    const normalizedName = String(meshName);

    if (normalizedName.includes('Part_Thrust_Upper') || normalizedName.includes('Part_Tire_Upper')) {
        return 'upper';
    }

    if (normalizedName.includes('Part_Thrust_Lower') || normalizedName.includes('Part_Tire_Lower')) {
        return 'lower';
    }

    return null;
}

export function resolveSurfaceStyleRole(meshName = '') {
    const normalizedName = String(meshName);

    if (normalizedName.includes('Part_Drum')) return 'drum';
    if (normalizedName.includes('Part_Tire')) return 'tire';
    if (normalizedName.includes('Part_Thrust')) return 'thrust';
    if (normalizedName.includes('Part_Drive')) return 'drive';
    if (normalizedName.includes('Sens_')) return 'sensor';

    return 'other';
}

export function buildMaterialStyle({ viewId = 'global', isTargetMesh = false, meshName = '' } = {}) {
    const role = resolveSurfaceStyleRole(meshName);
    const preset = SURFACE_STYLE_PRESETS[role] || SURFACE_STYLE_PRESETS.other;
    const isFocusedView = viewId !== 'global';
    const shouldDim = isFocusedView && !isTargetMesh;
    const baseColor = [...preset.baseColor];
    const emissive = [...preset.emissive];

    if (shouldDim) {
        return {
            transparent: true,
            opacity: 0.18,
            depthWrite: false,
            baseColor: brightenColor(baseColor, 0.65),
            emissive: [0, 0, 0],
            metalness: Number((preset.metalness * 0.82).toFixed(2)),
            roughness: Number(Math.min(1, preset.roughness + 0.14).toFixed(2)),
            emissiveIntensity: 0,
            envMapIntensity: Number((preset.envMapIntensity * 0.52).toFixed(2)),
            clearcoat: Number((preset.clearcoat * 0.45).toFixed(2))
        };
    }

    return {
        transparent: false,
        opacity: 1,
        depthWrite: true,
        baseColor,
        emissive,
        metalness: preset.metalness,
        roughness: preset.roughness,
        emissiveIntensity: isFocusedView && isTargetMesh ? 0.16 : 0.05,
        envMapIntensity: preset.envMapIntensity,
        clearcoat: preset.clearcoat
    };
}

export function buildViewTargetOffset(viewId = 'global') {
    return [...(VIEW_TARGET_OFFSETS[viewId] || VIEW_TARGET_OFFSETS.global)];
}

export function resolveHotspotView(slotName) {
    return HOTSPOT_VIEW_MAP[slotName] || null;
}

export function isHeatmapVisibleView(viewId) {
    return HEATMAP_VISIBLE_VIEWS.has(viewId);
}

export function getHeatLevelClass(level) {
    return HEAT_LEVEL_CLASS_MAP[level] || HEAT_LEVEL_CLASS_MAP.无;
}

export function interpolateHeatColor(value) {
    const clampedValue = clamp01(Number(value) || 0);

    for (let index = 1; index < HEAT_COLOR_STOPS.length; index += 1) {
        const previousStop = HEAT_COLOR_STOPS[index - 1];
        const nextStop = HEAT_COLOR_STOPS[index];

        if (clampedValue <= nextStop.value) {
            const range = nextStop.value - previousStop.value || 1;
            const t = (clampedValue - previousStop.value) / range;

            return previousStop.color.map((channel, channelIndex) =>
                Number(lerp(channel, nextStop.color[channelIndex], t).toFixed(3))
            );
        }
    }

    return [...HEAT_COLOR_STOPS[HEAT_COLOR_STOPS.length - 1].color];
}

export function buildHeatColorGlsl() {
    const declarations = HEAT_COLOR_STOPS.map((stop, index) => {
        const [r, g, b] = stop.color;
        return `    vec3 c${index} = vec3(${formatNumber(r)}, ${formatNumber(g)}, ${formatNumber(b)});`;
    }).join('\n');

    const branches = HEAT_COLOR_STOPS.slice(1).map((stop, index) => {
        const previousStop = HEAT_COLOR_STOPS[index];
        const branchPrefix = index === 0 ? 'if' : 'else if';

        return [
            `    ${branchPrefix} (v <= ${formatNumber(stop.value)}) {`,
            `        float t = (v - ${formatNumber(previousStop.value)}) / ${formatNumber(stop.value - previousStop.value)};`,
            `        return mix(c${index}, c${index + 1}, clamp(t, 0.0, 1.0));`,
            '    }'
        ].join('\n');
    }).join('\n');

    return [
        'vec3 getHeatColor(float value) {',
        '    float v = clamp(value, 0.0, 1.0);',
        declarations,
        branches,
        `    return c${HEAT_COLOR_STOPS.length - 1};`,
        '}',
        '',
        'float buildAnalysisHeatMask(vec2 uv, float weight) {',
        '    vec2 centeredUv = uv - vec2(0.5, 0.5);',
        '    float radialMask = smoothstep(0.58, 0.12, length(centeredUv));',
        '    float meshBand = abs(fract(uv.x * 18.0) - 0.5) + abs(fract(uv.y * 18.0) - 0.5);',
        '    float cellMask = 1.0 - smoothstep(0.18, 0.46, meshBand);',
        '    float diagonalWave = 0.5 + 0.5 * sin((uv.x + uv.y) * 24.0);',
        '    return clamp(radialMask * (0.72 + cellMask * 0.18 + diagonalWave * 0.1) * weight, 0.0, 1.0);',
        '}'
    ].join('\n');
}

export const CONTACT_ON_RPM_THRESHOLD = 1;
export const CONTACT_OFF_RPM_THRESHOLD = 0.5;
export const PRESSURE_MAX_MPA = 3;

function toNumber(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
}

function clamp01(value) {
    return Math.max(0, Math.min(1, value));
}

function resolveContact(rpm, wasContacting = false) {
    if (rpm >= CONTACT_ON_RPM_THRESHOLD) {
        return true;
    }

    if (rpm <= CONTACT_OFF_RPM_THRESHOLD) {
        return false;
    }

    return Boolean(wasContacting);
}

function getHeatLevelLabel(normalizedIntensity) {
    if (normalizedIntensity >= 0.75) {
        return '高';
    }

    if (normalizedIntensity >= 0.35) {
        return '中';
    }

    if (normalizedIntensity > 0) {
        return '低';
    }

    return '无';
}

function buildSideState({ pressure, rpm, wasContacting }) {
    const safePressure = Math.max(0, toNumber(pressure));
    const safeRpm = Math.abs(toNumber(rpm));
    const isContacting = resolveContact(safeRpm, wasContacting);
    const normalizedIntensity = isContacting ? clamp01(safePressure / PRESSURE_MAX_MPA) : 0;

    return {
        pressure: safePressure,
        rpm: safeRpm,
        isContacting,
        normalizedIntensity,
        levelLabel: getHeatLevelLabel(normalizedIntensity),
        statusText: isContacting ? '接触中' : '未接触'
    };
}

export function buildHeatmapState(avg = {}, previousContact = {}) {
    return {
        upper: buildSideState({
            pressure: avg.upper_pressure,
            rpm: avg.left_rpm,
            wasContacting: Boolean(previousContact.upper)
        }),
        lower: buildSideState({
            pressure: avg.lower_pressure,
            rpm: avg.right_rpm,
            wasContacting: Boolean(previousContact.lower)
        })
    };
}

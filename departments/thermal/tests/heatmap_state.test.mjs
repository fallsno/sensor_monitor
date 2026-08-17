import test from 'node:test';
import assert from 'node:assert/strict';

import {
    CONTACT_OFF_RPM_THRESHOLD,
    CONTACT_ON_RPM_THRESHOLD,
    PRESSURE_MAX_MPA,
    buildHeatmapState
} from '../static/js/heatmap_state.mjs';

test('upper side becomes active only when upper rpm reaches threshold', () => {
    const state = buildHeatmapState(
        {
            upper_pressure: 2.4,
            lower_pressure: 0.8,
            left_rpm: CONTACT_ON_RPM_THRESHOLD + 2,
            right_rpm: 0
        },
        {
            upper: false,
            lower: false
        }
    );

    assert.equal(state.upper.isContacting, true);
    assert.equal(state.lower.isContacting, false);
    assert.equal(state.upper.normalizedIntensity, 2.4 / PRESSURE_MAX_MPA);
    assert.equal(state.lower.normalizedIntensity, 0);
});

test('pressure above max is clamped and labeled high', () => {
    const state = buildHeatmapState(
        {
            upper_pressure: PRESSURE_MAX_MPA * 2,
            lower_pressure: 0,
            left_rpm: CONTACT_ON_RPM_THRESHOLD + 1,
            right_rpm: 0
        },
        {
            upper: false,
            lower: false
        }
    );

    assert.equal(state.upper.normalizedIntensity, 1);
    assert.equal(state.upper.levelLabel, '高');
    assert.equal(state.upper.statusText, '接触中');
});

test('both sides stay cold when rpm is missing even if pressure exists', () => {
    const state = buildHeatmapState(
        {
            upper_pressure: 2.1,
            lower_pressure: 2.6,
            left_rpm: 0,
            right_rpm: undefined
        },
        {
            upper: false,
            lower: false
        }
    );

    assert.equal(state.upper.isContacting, false);
    assert.equal(state.lower.isContacting, false);
    assert.equal(state.upper.levelLabel, '无');
    assert.equal(state.lower.levelLabel, '无');
});

test('contact hysteresis keeps the side active while rpm stays between off and on thresholds', () => {
    const state = buildHeatmapState(
        {
            upper_pressure: 1.5,
            lower_pressure: 0,
            left_rpm: (CONTACT_ON_RPM_THRESHOLD + CONTACT_OFF_RPM_THRESHOLD) / 2,
            right_rpm: 0
        },
        {
            upper: true,
            lower: false
        }
    );

    assert.equal(state.upper.isContacting, true);
    assert.equal(state.upper.levelLabel, '中');
    assert.equal(state.upper.statusText, '接触中');
});

test('middle rpm band preserves the previous side contact state independently', () => {
    const state = buildHeatmapState(
        {
            upper_pressure: 1.2,
            lower_pressure: 1.8,
            left_rpm: 0.7,
            right_rpm: 0.8
        },
        {
            upper: true,
            lower: false
        }
    );

    assert.equal(state.upper.isContacting, true);
    assert.equal(state.lower.isContacting, false);
    assert.equal(state.upper.levelLabel, '中');
    assert.equal(state.lower.levelLabel, '无');
});

import test from 'node:test';
import assert from 'node:assert/strict';

import { getMappingSelects } from '../static/js/config_selectors.mjs';

test('returns compact-select elements when legacy selectors are absent', () => {
    const compactMatches = [{ value: 'upper_pressure' }, { value: 'lower_pressure' }];
    const requestedSelectors = [];

    const root = {
        querySelectorAll(selector) {
            requestedSelectors.push(selector);
            if (selector === '.channel-select[data-type="ai"]') {
                return [];
            }
            if (selector === '.sensor-select[data-type="ai"]') {
                return [];
            }
            if (selector === '.compact-select[data-type="ai"]') {
                return compactMatches;
            }
            return [];
        }
    };

    const matches = getMappingSelects(root, 'ai');

    assert.equal(matches.length, 2);
    assert.deepEqual(matches, compactMatches);
    assert.deepEqual(requestedSelectors, [
        '.channel-select[data-type="ai"]',
        '.sensor-select[data-type="ai"]',
        '.compact-select[data-type="ai"]'
    ]);
});

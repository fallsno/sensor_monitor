export function getMappingSelects(root, type) {
    const selectors = [
        `.channel-select[data-type="${type}"]`,
        `.sensor-select[data-type="${type}"]`,
        `.compact-select[data-type="${type}"]`
    ];

    for (const selector of selectors) {
        const matches = root.querySelectorAll(selector);
        if (matches.length > 0) {
            return matches;
        }
    }

    return [];
}

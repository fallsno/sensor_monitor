// file-worker.js
self.onmessage = function(e) {
    const { chunk, filename, startLine, isLast } = e.data;
    try {
        const result = parseChunk(chunk, filename);
        self.postMessage({
            success: true,
            data: result,
            startLine: startLine,
            isLast: isLast
        });
    } catch (error) {
        self.postMessage({ success: false, error: error.message });
    }
};

function parseChunk(chunk, filename) {
    if (!filename.endsWith('.csv')) return { points: [], totalRows: 0 };

    const lines = chunk.split('\n');
    const firstLine = lines[0]?.trim() || '';
    const delimiter = firstLine.includes(',') ? ',' : '\t';

    const points = [];
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        const values = line.split(delimiter);
        if (values.length < 15) continue;

        try {
            const dataPoint = parseDataPointByPosition(values);
            points.push(dataPoint);
        } catch (err) {
            // 跳过解析失败的行
        }
    }
    return {
        points: points,
        totalRows: points.length
    };
}

function parseDataPointByPosition(values) {
    const timeStr = values[0]?.trim() || '';
    let timestampSec = 0;
    if (timeStr.includes(':')) {
        const parts = timeStr.split(':');
        if (parts.length === 3) {
            timestampSec = parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60 + parseFloat(parts[2]);
        } else if (parts.length === 2) {
            timestampSec = parseInt(parts[0]) * 60 + parseFloat(parts[1]);
        }
    } else {
        timestampSec = parseFloat(timeStr) || 0;
    }

    return {
        timestamp: timestampSec,
        left_rpm: fastParseFloat(values[1]),
        right_rpm: fastParseFloat(values[2]),
        left_rpm_voltage: fastParseFloat(values[3]),
        right_rpm_voltage: fastParseFloat(values[4]),
        upper_pressure: Math.max(0, fastParseFloat(values[7])),
        lower_pressure: Math.max(0, fastParseFloat(values[8])),
        eddy_current: fastParseFloat(values[9]),
        motor1: Math.max(0, fastParseFloat(values[10])),
        motor2: Math.max(0, fastParseFloat(values[11])),
        motor3: Math.max(0, fastParseFloat(values[12])),
        motor4: Math.max(0, fastParseFloat(values[13]))
    };
}

function fastParseFloat(str) {
    if (!str) return 0;
    const cleaned = str.trim();
    if (cleaned === '') return 0;
    const num = Number(cleaned);
    return isNaN(num) ? 0 : num;
}
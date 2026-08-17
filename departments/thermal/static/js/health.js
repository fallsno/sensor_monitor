import { store } from './core.js';
import { i18n, currentLang, mapPressure, pressureUnit,
        upperPreloadPressure, upperCriticalPressure,
        lowerPreloadPressure, lowerCriticalPressure,
        cycleSeconds, initialDisplacement } from './config.js';
import { updateHealthDisplay } from './ui.js'; // 需要实现

// ==================== 健康度计算 ====================
export function computeWheelHealth(cycleAvg, hasRpm, criticalAvg, preload, critical) {
    if (!hasRpm) return 100;
    const criticalPoint = criticalAvg !== null ? criticalAvg : critical;
    if (cycleAvg <= preload) {
        return 100;
    } else if (cycleAvg < criticalPoint) {
        let health = 40 * (1 - (cycleAvg - preload) / (criticalPoint - preload)) + 60;
        return Math.max(0, Math.min(100, health));
    } else if (cycleAvg == criticalPoint) {
        return 60;
    } else {
        let health = 60 * ((8 - cycleAvg) / (8 - criticalPoint));
        return Math.max(0, Math.min(100, health));
    }
}

// ==================== 更新健康度 ====================
// export function updateHealth() {
//     const upperCycleAvg = store.cycleCount > 0 ? store.lastCycleUpperAvg : 0;
//     const lowerCycleAvg = store.cycleCount > 0 ? store.lastCycleLowerAvg : 0;

//     const leftHasRpm = store.leftRpmData[store.leftRpmData.length-1] > 0;
//     const rightHasRpm = store.rightRpmData[store.rightRpmData.length-1] > 0;

//     const upperHealth = computeWheelHealth(upperCycleAvg, rightHasRpm, store.upperCriticalAvg, upperPreloadPressure, upperCriticalPressure);
//     const lowerHealth = computeWheelHealth(lowerCycleAvg, leftHasRpm, store.lowerCriticalAvg, lowerPreloadPressure, lowerCriticalPressure);

//     let systemHealth = 100;
//     if (leftHasRpm && rightHasRpm) {
//         systemHealth = Math.min(upperHealth, lowerHealth);
//     } else if (leftHasRpm) {
//         systemHealth = lowerHealth;
//     } else if (rightHasRpm) {
//         systemHealth = upperHealth;
//     } else {
//         systemHealth = 100;
//     }

//     console.log(`[HEALTH] 周期数=${store.cycleCount}, 上轮平均=${upperCycleAvg.toFixed(3)}, 下轮平均=${lowerCycleAvg.toFixed(3)}, 上轮健康=${upperHealth.toFixed(1)}%, 下轮健康=${lowerHealth.toFixed(1)}%, 系统健康=${systemHealth.toFixed(1)}%`);
//     store.currentUpperHealth = upperHealth;
//     store.currentLowerHealth = lowerHealth;
//     updateHealthDisplay(systemHealth, upperHealth, lowerHealth);
//     updateWheelStatusFromHealth(upperHealth, lowerHealth);
//     updateHealthTrend(systemHealth);
// }

// ==================== 更新故障关键信息图表 ====================
export function updateFaultKeyChart() {
    if (!store.faultKeyChart) return;
    if (store.cycleTimes.length === 0) {
        store.faultKeyChart.setOption({
            xAxis: { data: [] },
            series: []
        });
        return;
    }

    const leftHasRpm = store.leftRpmData[store.leftRpmData.length-1] > 0;
    const rightHasRpm = store.rightRpmData[store.rightRpmData.length-1] > 0;

    let seriesNames, colors;
    let avgData, minData, criticalData;

    if (rightHasRpm) {
        avgData = store.upperCycleAvgHistory;
        minData = store.upperCycleMinHistory;
        criticalData = new Array(store.cycleTimes.length).fill(upperPreloadPressure);
        seriesNames = [i18n[currentLang].upperCycleAvg, i18n[currentLang].upperCycleMin, i18n[currentLang].upperPreload];
        colors = ['#38bdf8', '#ef4444', '#38bdf8'];
    } else if (leftHasRpm) {
        avgData = store.lowerCycleAvgHistory;
        minData = store.lowerCycleMinHistory;
        criticalData = new Array(store.cycleTimes.length).fill(lowerPreloadPressure);
        seriesNames = [i18n[currentLang].lowerCycleAvg, i18n[currentLang].lowerCycleMin, i18n[currentLang].lowerPreload];
        colors = ['#f97316', '#a78bfa', '#f97316'];
    } else {
        avgData = store.upperCycleAvgHistory;
        minData = store.upperCycleMinHistory;
        criticalData = new Array(store.cycleTimes.length).fill(upperPreloadPressure);
        seriesNames = [i18n[currentLang].upperCycleAvg, i18n[currentLang].upperCycleMin, i18n[currentLang].upperPreload];
        colors = ['#38bdf8', '#ef4444', '#38bdf8'];
    }

    avgData = avgData.map(mapPressure);
    minData = minData.map(mapPressure);
    criticalData = criticalData.map(mapPressure);

    let allData = [...avgData, ...minData, ...criticalData].filter(v => typeof v === 'number' && !isNaN(v));
    let minVal = Math.min(...allData);
    let maxVal = Math.max(...allData);
    let margin = Math.max((maxVal - minVal) * 0.1, 0.2);
    let yMin = Math.max(0, minVal - margin);
    let yMax = maxVal + margin;
    if (yMax - yMin < 0.01) {
        yMin = Math.max(0, yMin - 0.1);
        yMax = yMax + 0.1;
    }

    store.faultKeyChart.setOption({
        xAxis: { data: store.cycleTimes },
        yAxis: {
            min: yMin,
            max: yMax,
            name: pressureUnit,
            axisLabel: { formatter: (value) => value.toFixed(1) }
        },
        legend: { data: seriesNames },
        series: [
            { name: seriesNames[0], type: 'line', data: avgData, lineStyle: { color: colors[0], width: 2 }, smooth: false, showSymbol: true, symbol: 'circle', symbolSize: 4 },
            { name: seriesNames[1], type: 'line', data: minData, lineStyle: { color: colors[1], width: 2 }, smooth: false, showSymbol: true, symbol: 'circle', symbolSize: 4 },
            { name: seriesNames[2], type: 'line', data: criticalData, lineStyle: { type: 'dashed', color: colors[2], width: 2 }, showSymbol: false }
        ]
    });
}

// ==================== 更新健康度趋势 ====================
export function updateHealthTrend(systemHealth) {
    if (!store.healthTrendChart) return;

    const timestamp = new Date().toLocaleTimeString('zh-CN', {
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });

    store.healthTimes.push(timestamp);
    store.healthHistory.push(systemHealth);

    if (store.healthTimes.length > 50) {
        store.healthTimes.shift();
        store.healthHistory.shift();
    }

    store.healthTrendChart.setOption({
        xAxis: { data: store.healthTimes },
        series: [{ data: store.healthHistory }]
    });
}

// ==================== 更新轮状态（基于健康度）====================
export function updateWheelStatusFromHealth(upperHealth, lowerHealth) {
    const upperCard = document.getElementById('upperWheelCard');
    const upperStatus = document.getElementById('upperWheelStatus');
    if (upperCard && upperStatus) {
        if (upperHealth < 50) {
            upperCard.className = 'wheel-card fault';
            upperStatus.innerText = i18n[currentLang].statusFault;
        } else if (upperHealth < 60) {
            upperCard.className = 'wheel-card warning';
            upperStatus.innerText = i18n[currentLang].statusWarning;
        } else {
            upperCard.className = 'wheel-card normal';
            upperStatus.innerText = i18n[currentLang].statusNormal;
        }
    }

    const lowerCard = document.getElementById('lowerWheelCard');
    const lowerStatus = document.getElementById('lowerWheelStatus');
    if (lowerCard && lowerStatus) {
        if (lowerHealth < 50) {
            lowerCard.className = 'wheel-card fault';
            lowerStatus.innerText = i18n[currentLang].statusFault;
        } else if (lowerHealth < 60) {
            lowerCard.className = 'wheel-card warning';
            lowerStatus.innerText = i18n[currentLang].statusWarning;
        } else {
            lowerCard.className = 'wheel-card normal';
            lowerStatus.innerText = i18n[currentLang].statusNormal;
        }
    }
}

// ==================== 重置周期累积器 ====================
export function resetCycleAccumulators() {
    store.currentCycleUpperSum = 0;
    store.currentCycleUpperCount = 0;
    store.currentCycleMinUpper = Infinity;
    store.currentCycleLowerSum = 0;
    store.currentCycleLowerCount = 0;
    store.currentCycleMinLower = Infinity;
    store.lastCycleUpperAvg = 0;
    store.lastCycleLowerAvg = 0;
    store.cycleCount = 0;
    store.upperCriticalAvg = null;
    store.lowerCriticalAvg = null;
    store.prevUpperHasBelowPreload = null;
    store.prevLowerHasBelowPreload = null;
    store.cycleTimes = [];
    store.upperCycleAvgHistory = [];
    store.upperCycleMinHistory = [];
    store.lowerCycleAvgHistory = [];
    store.lowerCycleMinHistory = [];
}
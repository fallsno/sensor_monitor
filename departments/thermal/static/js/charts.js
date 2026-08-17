/**
 * 图表模块
 * 全部使用 ECharts 实现，无网络依赖
 */

import { store } from './core.js';
import { i18n, currentLang, mapPressure, pressureUnit } from './config.js';
import { updateHealthParamDisplay, updateDisplacementIndicator } from './ui.js';
import { updateFaultKeyChart as updateFaultKey } from './health.js';
import { resetCycleAccumulators } from './health.js';
import { getCurrentData } from './dataManager.js';

// ECharts 图表主题配置
const chartTheme = {
    grid: { left: '8%', right: '5%', top: '15%', bottom: '15%', containLabel: true },
    xAxis: {
        type: 'category',
        axisLabel: { fontSize: 10, color: '#94a3b8', interval: 'auto', margin: 6 },
        axisLine: { lineStyle: { color: '#334155' } },
        axisTick: { show: false }
    },
    yAxis: {
        type: 'value',
        axisLabel: { 
            fontSize: 10, 
            color: '#94a3b8', 
            interval: 0,
            formatter: (value) => value.toFixed(2)
        },
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine: {
            show: true,
            lineStyle: { color: '#334155', width: 0.5, type: 'dashed' },
            interval: 0
        }
    },
    tooltip: {
        trigger: 'axis',
        backgroundColor: '#1e293b',
        borderColor: '#38bdf8',
        textStyle: { color: '#e2e8f0', fontSize: 11 },
        valueFormatter: (value) => (value !== undefined && value !== null) ? value.toFixed(2) : '--'
    },
    legend: {
        textStyle: { color: '#94a3b8', fontSize: 11 },
        itemWidth: 10,
        itemHeight: 6,
        bottom: 0
    },
    animation: false
};

// 初始化所有图表
export function initCharts() {
    console.log('[CHARTS] 开始初始化图表');
    
    initCoaxialChart();
    initRunoutChart();
    initVibrationChart();
    
    // 初始化实时图表（全部用 ECharts）
    initMotorCharts();
    initPressureUpperChart();
    initPressureLowerChart();
    initRpmUpperChart();
    initRpmLowerChart();
    initDisplacementChart();
    
    initFaultKeyChart();
    initHealthTrendChart();
    console.log('[CHARTS] 图表初始化完成');
}

// ========== ECharts 图表 ==========

function initCoaxialChart() {
    const chartDom = document.getElementById('coaxialChart');
    if (!chartDom) return;
    store.charts.coaxial = echarts.init(chartDom);
    const data = getCurrentData();
    const coaxialHistory = data.coaxialHistory || [];
    const times = coaxialHistory.map(item => item.time);
    const coaxialInData = coaxialHistory.map(item => item.coaxialIn);
    const verticalOutData = coaxialHistory.map(item => item.verticalOut);
    store.charts.coaxial.setOption({
        ...chartTheme,
        xAxis: { ...chartTheme.xAxis, data: times },
        yAxis: { ...chartTheme.yAxis, name: 'mm' },
        series: [
            { name: i18n[currentLang].coaxialIn, type: 'line', data: coaxialInData, lineStyle: { color: '#38bdf8', width: 2 }, showSymbol: false, smooth: true },
            { name: i18n[currentLang].verticalOut, type: 'line', data: verticalOutData, lineStyle: { color: '#f97316', width: 2 }, showSymbol: false, smooth: true }
        ]
    });
}

function initRunoutChart() {
    const chartDom = document.getElementById('runoutChart');
    if (!chartDom) return;
    store.charts.runout = echarts.init(chartDom);
    const data = getCurrentData();
    const runoutHistory = data.runoutHistory || [];
    const times = runoutHistory.map(item => item.time);
    const runoutData = [
        runoutHistory.map(item => item.wheel1),
        runoutHistory.map(item => item.wheel2),
        runoutHistory.map(item => item.wheel3),
        runoutHistory.map(item => item.wheel4)
    ];
    store.charts.runout.setOption({
        ...chartTheme,
        xAxis: { ...chartTheme.xAxis, data: times },
        yAxis: { ...chartTheme.yAxis, name: 'mm' },
        series: [
            { name: i18n[currentLang].wheel1, type: 'line', data: runoutData[0], lineStyle: { color: '#ef4444', width: 2 }, showSymbol: false, smooth: true },
            { name: i18n[currentLang].wheel2, type: 'line', data: runoutData[1], lineStyle: { color: '#f97316', width: 2 }, showSymbol: false, smooth: true },
            { name: i18n[currentLang].wheel3, type: 'line', data: runoutData[2], lineStyle: { color: '#4ade80', width: 2 }, showSymbol: false, smooth: true },
            { name: i18n[currentLang].wheel4, type: 'line', data: runoutData[3], lineStyle: { color: '#a78bfa', width: 2 }, showSymbol: false, smooth: true }
        ]
    });
}

function initVibrationChart() {
    const chartDom = document.getElementById('vibrationChart');
    if (!chartDom) return;
    store.charts.vibration = echarts.init(chartDom);
    store.charts.vibration.setOption({
        ...chartTheme,
        xAxis: { ...chartTheme.xAxis, data: store.timePoints },
        yAxis: { ...chartTheme.yAxis, name: 'mm' },
        series: [{ name: i18n[currentLang].displacementSensor, type: 'line', data: store.vibrationData, lineStyle: { color: '#f87171', width: 2 }, showSymbol: false, smooth: true }]
    });
}

export function initFaultKeyChart() {
    const dom = document.getElementById('faultKeyChart');
    if (!dom) return;
    store.faultKeyChart = echarts.init(dom);
    store.faultKeyChart.setOption({
        tooltip: { 
            trigger: 'axis',
            valueFormatter: (value) => (value !== undefined && value !== null) ? value.toFixed(2) : '--'
        },
        legend: { data: [], textStyle: { color: '#94a3b8' } },
        grid: { left: '10%', right: '8%', top: '15%', bottom: '12%', containLabel: true },
        xAxis: { type: 'category', data: [], axisLabel: { color: '#94a3b8' } },
        yAxis: { 
            type: 'value', 
            name: pressureUnit, 
            nameTextStyle: { color: '#94a3b8' },
            axisLabel: {
                color: '#94a3b8',
                formatter: (value) => value.toFixed(2)
            }
        },
        series: [],
        animation: false
    });
}

function initHealthTrendChart() {
    const dom = document.getElementById('healthTrendChart');
    if (!dom) return;
    store.healthTrendChart = echarts.init(dom);
    store.healthTrendChart.setOption({
        tooltip: { trigger: 'axis' },
        grid: { left: '5%', right: '5%', top: '25%', bottom: '5%', containLabel: true },
        xAxis: { type: 'category', data: [], axisLabel: { color: '#94a3b8' }, axisLine: { lineStyle: { color: '#334155' } } },
        yAxis: { type: 'value', name: '%', max: 100, nameTextStyle: { color: '#94a3b8' }, axisLabel: { color: '#94a3b8' }, splitLine: { lineStyle: { color: '#334155' } } },
        series: [{ type: 'line', data: [], lineStyle: { color: '#4ade80', width: 2 }, areaStyle: { color: '#4ade8040' }, smooth: false, showSymbol: true, symbol: 'circle', symbolSize: 4 }],
        animation: true
    });
}

// ========== 实时图表（用 Highcharts） ==========

const hcTheme = {
    chart: { backgroundColor: 'transparent', style: { fontFamily: 'inherit' } },
    title: { text: null }, credits: { enabled: false },
    accessibility: { enabled: false },
    xAxis: { 
        gridLineColor: '#334155', lineColor: '#334155', tickColor: '#334155',
        labels: { style: { color: '#94a3b8', fontSize: '10px' } }
    },
    yAxis: { 
        gridLineColor: '#334155', title: { text: null },
        labels: { 
            style: { color: '#94a3b8', fontSize: '10px' },
            formatter: function() { return this.value.toFixed(2); }
        }
    },
    legend: { itemStyle: { color: '#94a3b8', fontSize: '11px' } },
    plotOptions: { series: { animation: false, marker: { enabled: false } } },
    tooltip: { 
        backgroundColor: 'rgba(30, 41, 59, 0.9)', 
        borderColor: '#38bdf8', 
        style: { color: '#f1f5f9' },
        valueDecimals: 2
    }
};

function initMotorCharts() {
    const motors = ['motor1', 'motor2', 'motor3', 'motor4'];
    const colors = ['#ef4444', '#f97316', '#4ade80', '#a78bfa'];
    const names = ['电机1', '电机2', '电机3', '电机4'];
    
    motors.forEach((id, idx) => {
        const chartDom = document.getElementById(id + 'Chart');
        if (!chartDom) return;
        
        store.charts[id] = Highcharts.chart(chartDom, Highcharts.merge(hcTheme, {
            series: [{ name: names[idx], data: store.motorChartData[id] || [], color: colors[idx] }]
        }));
    });
}

function initPressureUpperChart() {
    const chartDom = document.getElementById('pressureUpperChart');
    if (!chartDom) return;
    store.charts.pressureUpper = Highcharts.chart(chartDom, Highcharts.merge(hcTheme, {
        yAxis: { ...hcTheme.yAxis, title: { text: pressureUnit, style: { color: '#94a3b8' } } },
        series: [{ name: '上压力', data: store.pressureChartData.upper || [], color: '#f87171' }]
    }));
}

function initPressureLowerChart() {
    const chartDom = document.getElementById('pressureLowerChart');
    if (!chartDom) return;
    store.charts.pressureLower = Highcharts.chart(chartDom, Highcharts.merge(hcTheme, {
        yAxis: { ...hcTheme.yAxis, title: { text: pressureUnit, style: { color: '#94a3b8' } } },
        series: [{ name: '下压力', data: store.pressureChartData.lower || [], color: '#a78bfa' }]
    }));
}

function initRpmUpperChart() {
    const chartDom = document.getElementById('rpmUpperChart');
    if (!chartDom) return;
    store.charts.rpmUpper = Highcharts.chart(chartDom, Highcharts.merge(hcTheme, {
        yAxis: { ...hcTheme.yAxis, title: { text: 'RPM', style: { color: '#94a3b8' } } },
        series: [{ name: '左转速', data: store.rpmChartData.left || [], color: '#fcd34d' }]
    }));
}

function initRpmLowerChart() {
    const chartDom = document.getElementById('rpmLowerChart');
    if (!chartDom) return;
    store.charts.rpmLower = Highcharts.chart(chartDom, Highcharts.merge(hcTheme, {
        yAxis: { ...hcTheme.yAxis, title: { text: 'RPM', style: { color: '#94a3b8' } } },
        series: [{ name: '右转速', data: store.rpmChartData.right || [], color: '#f97316' }]
    }));
}

function initDisplacementChart() {
    const chartDom = document.getElementById('displacementChart');
    if (!chartDom) return;
    store.charts.displacement = Highcharts.chart(chartDom, Highcharts.merge(hcTheme, {
        yAxis: { ...hcTheme.yAxis, title: { text: 'mm', style: { color: '#94a3b8' } } },
        series: [{ name: '位移', data: store.vibrationData || [], color: '#38bdf8' }]
    }));
}

// ========== 更新图表函数 ==========

export function updateCharts() {
    if (store.charts.vibration && store.charts.vibration.setOption) {
        store.charts.vibration.setOption({ xAxis: { data: store.timePoints }, series: [{ data: store.vibrationData }] });
    }
}

export function updateSensorCharts() {
    const now = new Date();
    const timeStr = now.toLocaleTimeString('zh-CN', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
    
    // 更新压力图表
    if (store.charts.pressureUpper && store.charts.pressureUpper.series) {
        const currentUpper = store.upperPressureData[store.upperPressureData.length - 1];
        const currentLower = store.lowerPressureData[store.lowerPressureData.length - 1];
        const upperSeries = store.charts.pressureUpper.series[0];
        const shiftUpper = upperSeries.data.length > store.maxDataPoints;
        upperSeries.addPoint([timeStr, currentUpper], true, shiftUpper);
        
        if (store.charts.pressureLower && store.charts.pressureLower.series) {
            const lowerSeries = store.charts.pressureLower.series[0];
            const shiftLower = lowerSeries.data.length > store.maxDataPoints;
            lowerSeries.addPoint([timeStr, currentLower], true, shiftLower);
        }
    }
    
    // 更新转速图表
    if (store.charts.rpmUpper && store.charts.rpmUpper.series) {
        const currentLeft = store.leftRpmData[store.leftRpmData.length - 1];
        const currentRight = store.rightRpmData[store.rightRpmData.length - 1];
        const leftSeries = store.charts.rpmUpper.series[0];
        const shiftLeft = leftSeries.data.length > store.maxDataPoints;
        leftSeries.addPoint([timeStr, currentLeft], true, shiftLeft);
        
        if (store.charts.rpmLower && store.charts.rpmLower.series) {
            const rightSeries = store.charts.rpmLower.series[0];
            const shiftRight = rightSeries.data.length > store.maxDataPoints;
            rightSeries.addPoint([timeStr, currentRight], true, shiftRight);
        }
    }
    
    // 更新电机图表
    for (let i = 1; i <= 4; i++) {
        const id = `motor${i}`;
        if (store.charts[id] && store.charts[id].series) {
            const currentVal = store.motorDataMap[id][store.motorDataMap[id].length - 1];
            const series = store.charts[id].series[0];
            const shift = series.data.length > store.maxDataPoints;
            series.addPoint([timeStr, currentVal], true, shift);
        }
    }
    
    // 更新位移图表
    if (store.charts.displacement && store.charts.displacement.series) {
        const currentVib = store.vibrationData[store.vibrationData.length - 1];
        const series = store.charts.displacement.series[0];
        const shift = series.data.length > store.maxDataPoints;
        series.addPoint([timeStr, currentVib], true, shift);
    }
}

// ========== 其他辅助函数 ==========

export function updateWheelCards(avg) {
    const upperWheelValue = document.getElementById('upperWheelValue');
    const lowerWheelValue = document.getElementById('lowerWheelValue');
    const upperPressureValue = document.getElementById('upperPressureValue');
    const lowerPressureValue = document.getElementById('lowerPressureValue');
    const upperWheelSpeed = document.getElementById('upperWheelSpeed');
    const lowerWheelSpeed = document.getElementById('lowerWheelSpeed');
    const leftRpmValue = document.getElementById('leftRpmValue');
    const rightRpmValue = document.getElementById('rightRpmValue');
    if (upperWheelValue && avg.upper_pressure !== undefined) upperWheelValue.innerText = mapPressure(avg.upper_pressure).toFixed(2);
    if (lowerWheelValue && avg.lower_pressure !== undefined) lowerWheelValue.innerText = mapPressure(avg.lower_pressure).toFixed(2);
    if (upperPressureValue && avg.upper_pressure !== undefined) upperPressureValue.innerText = mapPressure(avg.upper_pressure).toFixed(2);
    if (lowerPressureValue && avg.lower_pressure !== undefined) lowerPressureValue.innerText = mapPressure(avg.lower_pressure).toFixed(2);
    if (upperWheelSpeed && avg.right_rpm !== undefined) upperWheelSpeed.innerHTML = `${i18n[currentLang].rpm} <span>${avg.right_rpm.toFixed(2)} RPM</span>`;
    if (lowerWheelSpeed && avg.left_rpm !== undefined) lowerWheelSpeed.innerHTML = `${i18n[currentLang].rpm} <span>${avg.left_rpm.toFixed(2)} RPM</span>`;
    if (leftRpmValue && avg.left_rpm !== undefined) leftRpmValue.innerText = avg.left_rpm.toFixed(2);
    if (rightRpmValue && avg.right_rpm !== undefined) rightRpmValue.innerText = avg.right_rpm.toFixed(2);
}

export function setDefaultValues() {
    const motorDefaults = [5.2, 5.1, 5.3, 5.0];
    for (let i = 1; i <= 4; i++) {
        const currentEl = document.getElementById(`motor${i}Current`);
        const maxEl = document.getElementById(`motor${i}Max`);
        const avgEl = document.getElementById(`motor${i}Avg`);
        if (currentEl) currentEl.innerText = motorDefaults[i-1].toFixed(2);
        if (maxEl) maxEl.innerText = (motorDefaults[i-1] + 1.5).toFixed(2);
        if (avgEl) avgEl.innerText = motorDefaults[i-1].toFixed(2);
        const badge = document.getElementById(`motor${i}Status`);
        if (badge) {
            badge.className = 'sensor-badge disconnected';
            badge.innerText = i18n[currentLang].disconnected;
        }
    }
    const upperPressureValue = document.getElementById('upperPressureValue');
    const lowerPressureValue = document.getElementById('lowerPressureValue');
    if (upperPressureValue) upperPressureValue.innerText = mapPressure(2.34).toFixed(2);
    if (lowerPressureValue) lowerPressureValue.innerText = mapPressure(2.28).toFixed(2);
    const upperStatus = document.getElementById('upperPressureStatus');
    const lowerStatus = document.getElementById('lowerPressureStatus');
    if (upperStatus) { upperStatus.className = 'sensor-badge disconnected'; upperStatus.innerText = i18n[currentLang].disconnected; }
    if (lowerStatus) { lowerStatus.className = 'sensor-badge disconnected'; lowerStatus.innerText = i18n[currentLang].disconnected; }
    const leftRpmValue = document.getElementById('leftRpmValue');
    const rightRpmValue = document.getElementById('rightRpmValue');
    if (leftRpmValue) leftRpmValue.innerText = '1452';
    if (rightRpmValue) rightRpmValue.innerText = '1438';
    const leftStatus = document.getElementById('leftRpmStatus');
    const rightStatus = document.getElementById('rightRpmStatus');
    if (leftStatus) { leftStatus.className = 'sensor-badge disconnected'; leftStatus.innerText = i18n[currentLang].disconnected; }
    if (rightStatus) { rightStatus.className = 'sensor-badge disconnected'; rightStatus.innerText = i18n[currentLang].disconnected; }
    const dispValue = document.getElementById('displacementValue');
    const dispStatus = document.getElementById('displacementStatus');
    const vibStatus = document.getElementById('vibrationStatus');
    if (dispValue) dispValue.innerText = '1.25';
    if (dispStatus) { dispStatus.className = 'sensor-badge disconnected'; dispStatus.innerText = i18n[currentLang].disconnected; }
    if (vibStatus) { vibStatus.className = 'sensor-badge disconnected'; vibStatus.innerText = i18n[currentLang].disconnected; }
    const vibCurrent = document.getElementById('vibrationCurrent');
    const vibMax = document.getElementById('vibrationMax');
    const vibMin = document.getElementById('vibrationMin');
    const vibAvg = document.getElementById('vibrationAvg');
    if (vibCurrent) vibCurrent.innerText = '0.18';
    if (vibMax) vibMax.innerText = '0.25';
    if (vibMin) vibMin.innerText = '0.12';
    if (vibAvg) vibAvg.innerText = '0.18';
    for (let i = 1; i <= 4; i++) {
        const dataArray = store.motorDataMap[`motor${i}`];
        dataArray.fill(0);
        dataArray[dataArray.length - 1] = motorDefaults[i-1];
    }
    store.vibrationData.fill(0);
    store.vibrationData[store.vibrationData.length - 1] = 1.25;
}

export function updateDisplayWithSecondAverage(avg) {
    console.log('[UPDATE] 收到更新请求, avg=', avg);
    if (avg) {
        // 更新滚动数组
        store.upperPressureData.shift(); store.upperPressureData.push(avg.upper_pressure);
        store.lowerPressureData.shift(); store.lowerPressureData.push(avg.lower_pressure);
        store.leftRpmData.shift(); store.leftRpmData.push(avg.left_rpm);
        store.rightRpmData.shift(); store.rightRpmData.push(avg.right_rpm);
        store.vibrationData.shift(); store.vibrationData.push(avg.eddy_current);
        store.motor1Data.shift(); store.motor1Data.push(avg.motor1);
        store.motor2Data.shift(); store.motor2Data.push(avg.motor2);
        store.motor3Data.shift(); store.motor3Data.push(avg.motor3);
        store.motor4Data.shift(); store.motor4Data.push(avg.motor4);

        // 周期累积
        store.currentCycleUpperSum += avg.upper_pressure;
        store.currentCycleUpperCount++;
        store.currentCycleMinUpper = Math.min(store.currentCycleMinUpper, avg.upper_pressure);
        store.currentCycleLowerSum += avg.lower_pressure;
        store.currentCycleLowerCount++;
        store.currentCycleMinLower = Math.min(store.currentCycleMinLower, avg.lower_pressure);

        // 更新传感器状态UI
        updateSensorStatusUI(avg);
        updateWheelCards(avg);
        updateCharts();
        updateHealthParamDisplay();
        updateDisplacementIndicator(avg);
        updateSensorCharts();
        updateFaultKey();
    } else {
        // avg 为 null，推入0值
        store.upperPressureData.shift(); store.upperPressureData.push(0);
        store.lowerPressureData.shift(); store.lowerPressureData.push(0);
        store.leftRpmData.shift(); store.leftRpmData.push(0);
        store.rightRpmData.shift(); store.rightRpmData.push(0);
        store.vibrationData.shift(); store.vibrationData.push(0);
        store.motor1Data.shift(); store.motor1Data.push(0);
        store.motor2Data.shift(); store.motor2Data.push(0);
        store.motor3Data.shift(); store.motor3Data.push(0);
        store.motor4Data.shift(); store.motor4Data.push(0);
        // 周期累积（推入0）
        store.currentCycleUpperSum += 0;
        store.currentCycleUpperCount++;
        store.currentCycleMinUpper = Math.min(store.currentCycleMinUpper, 0);
        store.currentCycleLowerSum += 0;
        store.currentCycleLowerCount++;
        store.currentCycleMinLower = Math.min(store.currentCycleMinLower, 0);
    }
}

function updateSensorStatusUI(avg) {
    // 电机状态
    for (let i = 1; i <= 4; i++) {
        const motorVal = avg[`motor${i}`];
        const motorKey = `motor${i}`;
        const isConfigured = store.channelConfig.ai.includes(motorKey);
        const hasData = motorVal !== null && motorVal !== undefined && motorVal !== 0;
        const active = isConfigured && hasData;
        store.sensorData[motorKey] = store.sensorData[motorKey] || { active: false, value: 0 };
        store.sensorData[motorKey].active = active;
        store.sensorData[motorKey].value = motorVal;
        const currentEl = document.getElementById(`motor${i}Current`);
        const maxEl = document.getElementById(`motor${i}Max`);
        const avgEl = document.getElementById(`motor${i}Avg`);
        const dataArray = store.motorDataMap[motorKey];
        if (currentEl) currentEl.innerText = active ? motorVal.toFixed(2) : '--';
        if (maxEl) maxEl.innerText = active ? Math.max(...dataArray).toFixed(2) : '--';
        if (avgEl) avgEl.innerText = active ? (dataArray.reduce((a,b) => a+b, 0) / dataArray.length).toFixed(2) : '--';
        const badge = document.getElementById(`motor${i}Status`);
        if (badge) {
            badge.className = `sensor-badge ${active ? 'connected' : 'disconnected'}`;
            badge.innerText = active ? i18n[currentLang].connected : i18n[currentLang].disconnected;
        }
    }
    // 压力传感器
    const upperPressureConfigured = store.channelConfig.ai.includes('upper_pressure');
    const lowerPressureConfigured = store.channelConfig.ai.includes('lower_pressure');
    const upperPressureHasData = avg.upper_pressure !== null && avg.upper_pressure !== undefined && avg.upper_pressure !== 0;
    const lowerPressureHasData = avg.lower_pressure !== null && avg.lower_pressure !== undefined && avg.lower_pressure !== 0;
    const upperActive = upperPressureConfigured && upperPressureHasData;
    const lowerActive = lowerPressureConfigured && lowerPressureHasData;
    store.sensorData.upper_pressure = store.sensorData.upper_pressure || { active: false, value: 0, voltage: 0 };
    store.sensorData.lower_pressure = store.sensorData.lower_pressure || { active: false, value: 0, voltage: 0 };
    store.sensorData.upper_pressure.active = upperActive;
    store.sensorData.upper_pressure.value = avg.upper_pressure;
    store.sensorData.lower_pressure.active = lowerActive;
    store.sensorData.lower_pressure.value = avg.lower_pressure;
    const upperStatusEl = document.getElementById('upperPressureStatus');
    const lowerStatusEl = document.getElementById('lowerPressureStatus');
    if (upperStatusEl) { upperStatusEl.className = `sensor-badge ${upperActive ? 'connected' : 'disconnected'}`; upperStatusEl.innerText = upperActive ? i18n[currentLang].connected : i18n[currentLang].disconnected; }
    if (lowerStatusEl) { lowerStatusEl.className = `sensor-badge ${lowerActive ? 'connected' : 'disconnected'}`; lowerStatusEl.innerText = lowerActive ? i18n[currentLang].connected : i18n[currentLang].disconnected; }
    // 转速传感器
    const leftRpmConfigured = store.channelConfig.ctr.includes('left_rpm');
    const rightRpmConfigured = store.channelConfig.ctr.includes('right_rpm');
    const leftRpmHasData = avg.left_rpm !== null && avg.left_rpm !== undefined && avg.left_rpm !== 0;
    const rightRpmHasData = avg.right_rpm !== null && avg.right_rpm !== undefined && avg.right_rpm !== 0;
    const leftActive = leftRpmConfigured && leftRpmHasData;
    const rightActive = rightRpmConfigured && rightRpmHasData;
    store.sensorData.left_rpm = store.sensorData.left_rpm || { active: false, value: 0, voltage: 0 };
    store.sensorData.right_rpm = store.sensorData.right_rpm || { active: false, value: 0, voltage: 0 };
    store.sensorData.left_rpm.active = leftActive;
    store.sensorData.left_rpm.value = avg.left_rpm;
    store.sensorData.right_rpm.active = rightActive;
    store.sensorData.right_rpm.value = avg.right_rpm;
    const leftStatusEl = document.getElementById('leftRpmStatus');
    const rightStatusEl = document.getElementById('rightRpmStatus');
    if (leftStatusEl) { leftStatusEl.className = `sensor-badge ${leftActive ? 'connected' : 'disconnected'}`; leftStatusEl.innerText = leftActive ? i18n[currentLang].connected : i18n[currentLang].disconnected; }
    if (rightStatusEl) { rightStatusEl.className = `sensor-badge ${rightActive ? 'connected' : 'disconnected'}`; rightStatusEl.innerText = rightActive ? i18n[currentLang].connected : i18n[currentLang].disconnected; }
    // 位移传感器
    const eddyCurrentConfigured = store.channelConfig.ai.includes('eddy_current');
    const eddyCurrentHasData = avg.eddy_current !== null && avg.eddy_current !== undefined && avg.eddy_current !== 0;
    const vibActive = eddyCurrentConfigured && eddyCurrentHasData;
    store.sensorData.eddy_current = store.sensorData.eddy_current || { active: false, value: 0, voltage: 0 };
    store.sensorData.eddy_current.active = vibActive;
    store.sensorData.eddy_current.value = avg.eddy_current;
    const dispStatusEl = document.getElementById('displacementStatus');
    if (dispStatusEl) { dispStatusEl.className = `sensor-badge ${vibActive ? 'connected' : 'disconnected'}`; dispStatusEl.innerText = vibActive ? i18n[currentLang].connected : i18n[currentLang].disconnected; }
    const dispValueEl = document.getElementById('displacementValue');
    if (dispValueEl) dispValueEl.innerText = vibActive ? store.vibrationData[store.vibrationData.length - 1].toFixed(2) : '0.00';
    const dispCurrentEl = document.getElementById('displacementCurrent');
    const dispMaxEl = document.getElementById('displacementMax');
    const dispAvgEl = document.getElementById('displacementAvg');
    if (dispCurrentEl) dispCurrentEl.innerText = vibActive ? store.vibrationData[store.vibrationData.length - 1].toFixed(2) : '--';
    if (dispMaxEl) dispMaxEl.innerText = vibActive ? Math.max(...store.vibrationData).toFixed(2) : '--';
    if (dispAvgEl) dispAvgEl.innerText = vibActive ? (store.vibrationData.reduce((a,b) => a+b, 0) / store.vibrationData.length).toFixed(2) : '--';
    const activeVals = store.vibrationData.filter(v => v > 0);
    if (activeVals.length > 0) {
        const vibCurrentEl = document.getElementById('vibrationCurrent');
        const vibMaxEl = document.getElementById('vibrationMax');
        const vibMinEl = document.getElementById('vibrationMin');
        const vibAvgEl = document.getElementById('vibrationAvg');
        if (vibCurrentEl) vibCurrentEl.innerText = store.vibrationData[store.vibrationData.length - 1].toFixed(2);
        if (vibMaxEl) vibMaxEl.innerText = Math.max(...store.vibrationData).toFixed(2);
        if (vibMinEl) vibMinEl.innerText = Math.min(...store.vibrationData).toFixed(2);
        if (vibAvgEl) vibAvgEl.innerText = (store.vibrationData.reduce((a,b) => a+b, 0) / store.vibrationData.length).toFixed(2);
    }
}

export function resetDisplayData() {
    console.log('[RESET] 重置所有数据数组为0');
    store.vibrationData.fill(0);
    store.motor1Data.fill(0);
    store.motor2Data.fill(0);
    store.motor3Data.fill(0);
    store.motor4Data.fill(0);
    store.upperPressureData.fill(0);
    store.lowerPressureData.fill(0);
    store.leftRpmData.fill(0);
    store.rightRpmData.fill(0);
    store.leftRpmVoltageData.fill(0);
    store.rightRpmVoltageData.fill(0);

    resetCycleAccumulators();
}


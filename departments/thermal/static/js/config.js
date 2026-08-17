/**
 * 配置管理模块
 * 包含所有可调参数、语言包、配置加载/保存函数、工具函数
 */
import { showToast, updateAllUnits, refreshAllPressureValues, updateHealthParamDisplay } from './ui.js';
import { resetCycleAccumulators } from './health.js';
import {
    initDataManager,
    getCurrentData,
    saveHealthParams as saveHealthParamsToData,
    savePortConfig as savePortConfigToData,
    savePressureMapping as savePressureMappingToData,
    saveBasicInfo as saveBasicInfoToData
} from './dataManager.js';

// ==================== 压力映射与单位 ====================
export let pressureOriginalMax = 10;
export let pressureDisplayMax = 10;
export let pressureUnit = 'MPa';

// ==================== 健康度参数 ====================
export let upperPreloadPressure = 2.0;
export let upperCriticalPressure = 3.5;
export let lowerPreloadPressure = 2.0;
export let lowerCriticalPressure = 3.5;
export let cycleSeconds = 60;
export let initialDisplacement = 0.0;

// ==================== 语言 ====================
export let currentLang = 'zh';
export const i18n = {
    zh: {
        pageTitle: '滚筒监测系统',
        systemTitle: '滚筒监测系统',
        statusIdle: '就绪',
        statusCollecting: '检测中...',
        statusSaving: '保存中...',
        navOverview: '系统总览',
        navHome: '系统主页',
        navMonitor: '数据监测',
        navRealtime: '综合数据',
        navSystem: '系统设置',
        navSettings: '系统设置',
        upperWheel: '上限位轮',
        lowerWheel: '下限位轮',
        ringDisplacement: '滚圈位移',
        ringSpeed: '',
        basicInfo: '基本信息',
        customerName: '客户名称',
        machineNo: '机台编号',
        orderNo: '生成订单',
        modelNo: '设备型号',
        keyIndicators: '关键指标',
        envTemp: '环境温度',
        contactArea: '接触面积',
        wheelGap: '限位轮间距',
        vibrationVal: '振动值',
        testTime: '累积试机时间',
        save: '保存',
        healthTitle: '健康度',
        monitorCharts: '监测图表',
        faultKeyInfo: '故障关键信息',
        healthTrend: '健康度趋势',
        systemHealth: '系统健康度',
        criticalValue: '临界值 60%',
        statusNormal: '正常',
        statusWarning: '警告',
        statusFault: '故障',
        cycleAvg: '周期平均',
        cycleMin: '周期最低点',
        criticalLine: '临界基准',
        systemSettings: '系统设置',
        language: '语言',
        healthParams: '健康度参数',
        preloadPressure: '预紧力',
        criticalPressure: '临界压力',
        cycleSeconds: '周期',
        start: '开始',
        saveData: '采集',
        stop: '结束',
        browse: '浏览',
        loadFile: '加载文件',
        motorCurrent: '电机电流',
        sensorData: '传感器数据',
        motor: '电机',
        current: '当前',
        max: '最大',
        min: '最小',
        avg: '平均',
        connected: '已连接',
        disconnected: '未连接',
        pressureSensor: '压力传感器',
        rpmSensor: '转速传感器',
        displacementSensor: '位移传感器',
        rpm: '',
        voltage: '电压',
        mm: 'mm',
        MPa: 'MPa',
        um: 'um',
        h: 'h',
        coaxialTitle: '同轴度与垂直度',
        coaxialIn: '进料侧同轴度',
        verticalOut: '出料侧垂直度',
        runoutTitle: '滚轮跳动度',
        wheel1: '滚轮1',
        wheel2: '滚轮2',
        wheel3: '滚轮3',
        wheel4: '滚轮4',
        vibrationTitle: '振动实时',
        add: '添加',
        currentDisplacement: '当前位移',
        parsing: '正在解析',
        chunks: '块',
        preparing: '准备加载',
        fileLoaded: '文件加载完成',
        playing: '正在播放',
        chunk: '块',
        portConfig: '端口配置',
        device: '设备名',
        aiChannels: 'AI通道',
        counter1: '计数器1',
        counter2: '计数器2',
        freqMin: '最小频率(Hz)',
        freqMax: '最大频率(Hz)',
        pulsesPerRev: '每转脉冲数',
        noDataToPlay: '没有可播放的数据',
        playbackComplete: '文件数据播放完成',
        startPlay: '开始播放文件数据',
        parseError: '解析错误',
        fileProgress: '文件处理进度',
        rowsPerSec: '条/秒',
        upperPreloadLabel: '上预紧力',
        upperCriticalLabel: '上临界压力',
        lowerPreloadLabel: '下预紧力',
        lowerCriticalLabel: '下临界压力',
        cycleLabel: '周期',
        initialDispLabel: '初始位移',
        upperWheelTitle: '上限位轮',
        lowerWheelTitle: '下限位轮',
        initialDisplacement: '滚圈初始位移',
        monitor: '实时监控',
        motor1: '电机1',
        motor2: '电机2',
        motor3: '电机3',
        motor4: '电机4',
        health: '健康度',
        upperCycleAvg: '上限周期平均压力',
        upperCycleMin: '上限周期最低压力',
        upperPreload: '上预紧力',
        lowerCycleAvg: '下限周期平均压力',
        lowerCycleMin: '下限周期最低压力',
        lowerPreload: '下预紧力',
    },
    en: {
        pageTitle: 'Drum Monitoring System',
        systemTitle: 'Drum Monitoring System',
        statusIdle: 'Idle',
        statusCollecting: 'Collecting...',
        statusSaving: 'Saving...',
        navOverview: 'Overview',
        navHome: 'Home',
        navMonitor: 'Monitoring',
        navRealtime: 'Real-time',
        navSystem: 'System',
        navSettings: 'Settings',
        upperWheel: 'Upper Thrust Roller',
        lowerWheel: 'Lower Thrust Roller',
        ringDisplacement: 'Drum Position',
        ringSpeed: '',
        basicInfo: 'Basic Info',
        customerName: 'Customer',
        machineNo: 'Machine No.',
        orderNo: 'Order No.',
        modelNo: 'Model No.',
        keyIndicators: 'Key Indicators',
        envTemp: 'Ambient Temp',
        contactArea: 'Contact Area',
        wheelGap: 'Wheel Gap',
        vibrationVal: 'Vibration',
        testTime: 'Test Time',
        save: 'Save',
        healthTitle: 'Health',
        monitorCharts: 'Charts',
        faultKeyInfo: 'Fault Key Info',
        healthTrend: 'Health Trend',
        systemHealth: 'System Health',
        criticalValue: 'Threshold 60%',
        statusNormal: 'Normal',
        statusWarning: 'Warning',
        statusFault: 'Fault',
        cycleAvg: 'Cycle Avg',
        cycleMin: 'Cycle Min',
        criticalLine: 'Critical Line',
        systemSettings: 'System Settings',
        language: 'Language',
        healthParams: 'Health Parameters',
        preloadPressure: 'Preload',
        criticalPressure: 'Critical',
        cycleSeconds: 'Cycle',
        start: 'Start',
        saveData: 'Save',
        stop: 'Stop',
        browse: 'Browse',
        loadFile: 'Load File',
        motorCurrent: 'Motor Current',
        sensorData: 'Sensor Data',
        motor: 'Motor',
        current: 'Current',
        max: 'Max',
        min: 'Min',
        avg: 'Avg',
        connected: 'Connected',
        disconnected: 'Disconnected',
        pressureSensor: 'Pressure',
        rpmSensor: 'RPM',
        displacementSensor: 'Position',
        rpm: '',
        voltage: 'Voltage',
        mm: 'mm',
        MPa: 'N',
        um: 'um',
        h: 'h',
        coaxialTitle: 'Coaxiality & Verticality',
        coaxialIn: 'Inlet Coaxial',
        verticalOut: 'Outlet Vertical',
        runoutTitle: 'Wheel Runout',
        wheel1: 'Support Roller 1',
        wheel2: 'Support Roller 2',
        wheel3: 'Support Roller 3',
        wheel4: 'Support Roller 4',
        vibrationTitle: 'Vibration',
        add: 'Add',
        currentDisplacement: 'Current Position',
        parsing: 'Parsing',
        chunks: 'chunks',
        preparing: 'Preparing',
        fileLoaded: 'File loaded',
        playing: 'Playing',
        chunk: 'chunk',
        portConfig: 'Port Config',
        device: 'Device',
        aiChannels: 'AI Channels',
        counter1: 'Counter 1',
        counter2: 'Counter 2',
        freqMin: 'Min Freq (Hz)',
        freqMax: 'Max Freq (Hz)',
        pulsesPerRev: 'Pulses/Rev',
        noDataToPlay: 'No data to play',
        playbackComplete: 'Playback complete',
        startPlay: 'Start playing file',
        parseError: 'Parse error',
        fileProgress: 'File Progress',
        rowsPerSec: 'rows/s',
        upperPreloadLabel: 'Up.Preload',
        upperCriticalLabel: 'Up.Critical',
        lowerPreloadLabel: 'Low.Preload',
        lowerCriticalLabel: 'Low.Critical',
        cycleLabel: 'Cycle',
        initialDispLabel: 'Init.Position',
        upperWheelTitle: 'Upper Thrust Roller',
        lowerWheelTitle: 'Lower Thrust Roller',
        initialDisplacement: 'Tire Initial Position',
        monitor: 'Live Monitor',
        motor1: 'Motor 1',
        motor2: 'Motor 2',
        motor3: 'Motor 3',
        motor4: 'Motor 4',
        health: 'Health',
        upperCycleAvg: 'Upper Cycle Avg',
        upperCycleMin: 'Upper Cycle Min',
        upperPreload: 'Upper Preload',
        lowerCycleAvg: 'Lower Cycle Avg',
        lowerCycleMin: 'Lower Cycle Min',
        lowerPreload: 'Lower Preload',
    }
};

// ==================== 工具函数 ====================
export function mapPressure(original) {
    if (pressureOriginalMax === 0) return 0;
    return (original / pressureOriginalMax) * pressureDisplayMax;
}

// ==================== 加载所有配置 ====================
export async function loadAllConfigs() {
    await initDataManager();
    const data = getCurrentData();

    // 更新压力、健康等全局变量
    pressureOriginalMax = data.pressure.originalMax;
    pressureDisplayMax = data.pressure.displayMax;
    pressureUnit = data.pressure.unit;

    upperPreloadPressure = data.health.upperPreloadPressure;
    upperCriticalPressure = data.health.upperCriticalPressure;
    lowerPreloadPressure = data.health.lowerPreloadPressure;
    lowerCriticalPressure = data.health.lowerCriticalPressure;
    cycleSeconds = data.health.cycleSeconds;
    initialDisplacement = data.health.initialDisplacement;

    // 更新 UI 输入框（原有代码，保持不变）
    const inputs = {
        upperPreloadPressure: document.getElementById('upperPreloadPressure'),
        upperCriticalPressure: document.getElementById('upperCriticalPressure'),
        lowerPreloadPressure: document.getElementById('lowerPreloadPressure'),
        lowerCriticalPressure: document.getElementById('lowerCriticalPressure'),
        healthCycle: document.getElementById('healthCycle'),
        initialDisplacementInput: document.getElementById('initialDisplacementInput'),
        pressureOriginalMax: document.getElementById('pressureOriginalMax'),
        pressureDisplayMax: document.getElementById('pressureDisplayMax'),
        unitSelector: document.getElementById('unitSelector'),
        portDevice: document.getElementById('portDevice'),
        portAiChannels: document.getElementById('portAiChannels'),
        portCounter1: document.getElementById('portCounter1'),
        portCounter2: document.getElementById('portCounter2'),
        portFreqMin: document.getElementById('portFreqMin'),
        portFreqMax: document.getElementById('portFreqMax'),
        portPulsesPerRev: document.getElementById('portPulsesPerRev')
    };
    if (inputs.upperPreloadPressure) inputs.upperPreloadPressure.value = data.health.upperPreloadPressure;
    if (inputs.upperCriticalPressure) inputs.upperCriticalPressure.value = data.health.upperCriticalPressure;
    if (inputs.lowerPreloadPressure) inputs.lowerPreloadPressure.value = data.health.lowerPreloadPressure;
    if (inputs.lowerCriticalPressure) inputs.lowerCriticalPressure.value = data.health.lowerCriticalPressure;
    if (inputs.healthCycle) inputs.healthCycle.value = data.health.cycleSeconds;
    if (inputs.initialDisplacementInput) inputs.initialDisplacementInput.value = data.health.initialDisplacement;
    if (inputs.pressureOriginalMax) inputs.pressureOriginalMax.value = data.pressure.originalMax;
    if (inputs.pressureDisplayMax) inputs.pressureDisplayMax.value = data.pressure.displayMax;
    if (inputs.unitSelector) inputs.unitSelector.value = data.pressure.unit;
    if (inputs.portDevice) inputs.portDevice.value = data.port.device;
    if (inputs.portAiChannels) inputs.portAiChannels.value = data.port.ai_channels;
    if (inputs.portCounter1) inputs.portCounter1.value = data.port.counter1;
    if (inputs.portCounter2) inputs.portCounter2.value = data.port.counter2;
    if (inputs.portFreqMin) inputs.portFreqMin.value = data.port.freq_min;
    if (inputs.portFreqMax) inputs.portFreqMax.value = data.port.freq_max;
    if (inputs.portPulsesPerRev) inputs.portPulsesPerRev.value = data.port.pulses_per_rev;

    // 刷新 UI
    updateAllUnits();
    refreshAllPressureValues();
    updateHealthParamDisplay();

    // 关键：加载并应用语言（不保存，避免覆盖）
    if (data.language && typeof data.language === 'string') {
        currentLang = data.language;
        const { applyLanguage } = await import('./ui.js');
        applyLanguage(currentLang, true);
        // 设置语言选择器的值，使其与当前语言一致
        const langSelector = document.getElementById('langSelector');
        if (langSelector) {
            langSelector.value = currentLang;
        }
    }
}

// ==================== 保存健康参数 ====================
export async function saveHealthConfig() {
    const params = {
        upperPreloadPressure: parseFloat(document.getElementById('upperPreloadPressure').value),
        upperCriticalPressure: parseFloat(document.getElementById('upperCriticalPressure').value),
        lowerPreloadPressure: parseFloat(document.getElementById('lowerPreloadPressure').value),
        lowerCriticalPressure: parseFloat(document.getElementById('lowerCriticalPressure').value),
        cycleSeconds: parseInt(document.getElementById('healthCycle').value),
        initialDisplacement: parseFloat(document.getElementById('initialDisplacementInput').value)
    };
    await saveHealthParamsToData(params);
    // 更新全局变量
    upperPreloadPressure = params.upperPreloadPressure;
    upperCriticalPressure = params.upperCriticalPressure;
    lowerPreloadPressure = params.lowerPreloadPressure;
    lowerCriticalPressure = params.lowerCriticalPressure;
    cycleSeconds = params.cycleSeconds;
    initialDisplacement = params.initialDisplacement;
    // 重置周期累积器
    resetCycleAccumulators();
    updateHealthParamDisplay();
    showToast(i18n[currentLang].save + ' ' + i18n[currentLang].healthParams, 'success');
}

// ==================== 保存端口配置 ====================
export async function savePortConfig() {
    const config = {
        device: document.getElementById('portDevice').value,
        ai_channels: document.getElementById('portAiChannels').value,
        counter1: document.getElementById('portCounter1').value,
        counter2: document.getElementById('portCounter2').value,
        freq_min: parseFloat(document.getElementById('portFreqMin').value),
        freq_max: parseFloat(document.getElementById('portFreqMax').value),
        pulses_per_rev: parseInt(document.getElementById('portPulsesPerRev').value)
    };
    await savePortConfigToData(config);
    showToast(i18n[currentLang].save + ' ' + i18n[currentLang].portConfig, 'success');
}

// ==================== 保存压力映射 ====================
export async function savePressureMapping() {
    const orig = parseFloat(document.getElementById('pressureOriginalMax').value);
    const disp = parseFloat(document.getElementById('pressureDisplayMax').value);
    if (isNaN(orig) || isNaN(disp) || orig <= 0 || disp <= 0) {
        showToast('请输入有效的正数', 'error');
        return;
    }
    const mapping = { originalMax: orig, displayMax: disp, unit: pressureUnit };
    await savePressureMappingToData(mapping);
    pressureOriginalMax = orig;
    pressureDisplayMax = disp;
    refreshAllPressureValues();
    updateAllUnits();
    showToast('压力映射已保存', 'success');
}

// ==================== 保存基本信息 ====================
export async function saveBasicInfoFromSettings() {
    const basic = {
        customerName: document.getElementById('settingsCustomerName').value,
        machineNo: document.getElementById('settingsMachineNo').value,
        orderNo: document.getElementById('settingsOrderNo').value,
        modelNo: document.getElementById('settingsModelNo').value
    };
    await saveBasicInfoToData(basic);
    // 更新导航栏显示
    document.getElementById('navCustomerName').innerText = basic.customerName;
    document.getElementById('navMachineNo').innerText = basic.machineNo;
    document.getElementById('navOrderNo').innerText = basic.orderNo;
    document.getElementById('navModelNo').innerText = basic.modelNo;
    showToast(i18n[currentLang].save + ' ' + i18n[currentLang].basicInfo, 'success');
}

// ==================== 语言切换（保持不变） ====================
export async function saveLanguageConfig(lang) {
    try {
        await fetch('/api/config/language', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ language: lang })
        });
    } catch (err) {
        console.error('保存语言配置失败', err);
    }
}

export function setCurrentLang(lang) {
    currentLang = lang;
}

export function changeUnit(unit) {
    pressureUnit = unit;
    fetch('/api/config/pressure/unit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ unit: unit })
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            updateAllUnits();
            refreshAllPressureValues();
            showToast('单位已更新', 'success');
        } else {
            showToast('单位保存失败', 'error');
        }
    })
    .catch(err => {
        console.error(err);
        showToast('单位保存失败', 'error');
    });
}


// 保存通道映射
export async function saveChannelMapping(mapping) {
    try {
        const res = await fetch('/api/config/channel_mapping', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(mapping)
        });
        const data = await res.json();
        if (data.success) {
            showToast('通道映射已保存', 'success');
        } else {
            showToast('保存失败: ' + data.error, 'error');
        }
    } catch (err) {
        console.error(err);
        showToast('保存失败', 'error');
    }
}
/**
 * 主JavaScript文件 - 最终优化版（流式文件读取，健康度联动，中英文切换）
 * 支持超大文件流式处理，按秒聚合，健康度双图布局
 * 修改：监控模式下，无数据时保持上一秒值，不填充零；增加详细日志；修复电机电流显示
 */

// ==================== 全局变量 ====================
let socket;
let charts = {};
let currentPage = 'home';
let currentHomeChart = 'health';
let currentTab = 'motor';

let fileMonitorActive = false; // 是否处于文件监控模式

// 压力映射与单位
let pressureOriginalMax = 10;
let pressureDisplayMax = 10;
let pressureUnit = 'MPa';
// 临界点状态（独立于上下轮）
let upperCriticalAvg = null;
let lowerCriticalAvg = null;
// 上下轮独立预紧力与临界压力
let upperPreloadPressure = 2.0;
let upperCriticalPressure = 3.5;
let lowerPreloadPressure = 2.0;
let lowerCriticalPressure = 3.5;
let cycleSeconds = 60; // 周期通用
let initialDisplacement = 0.0; // 滚圈初始位移


// 当前健康度（用于位移指示器联动）
let currentUpperHealth = 100;
let currentLowerHealth = 100;

// 传感器数据
let sensorData = {
    upper_pressure: { active: false, value: 0, voltage: 0 },
    lower_pressure: { active: false, value: 0, voltage: 0 },
    left_rpm: { active: false, value: 0, voltage: 0 },
    right_rpm: { active: false, value: 0, voltage: 0 },
    eddy_current: { active: false, value: 0, voltage: 0 },
    motor1: { active: false, value: 0 },
    motor2: { active: false, value: 0 },
    motor3: { active: false, value: 0 },
    motor4: { active: false, value: 0 }
};

let systemStatus = {
    collecting: false,
    saving: false,
    statusText: '就绪',
    statusType: 'idle'
};

let rpmDisplayMode = 'value';

// 时间轴数据 - 固定30秒
let maxDataPoints = 30;
let timePoints = [];

// 数据数组
let vibrationData = new Array(maxDataPoints).fill(0);
let motor1Data = new Array(maxDataPoints).fill(0);
let motor2Data = new Array(maxDataPoints).fill(0);
let motor3Data = new Array(maxDataPoints).fill(0);
let motor4Data = new Array(maxDataPoints).fill(0);
let upperPressureData = new Array(maxDataPoints).fill(0);
let lowerPressureData = new Array(maxDataPoints).fill(0);
let leftRpmData = new Array(maxDataPoints).fill(0);
let rightRpmData = new Array(maxDataPoints).fill(0);
let leftRpmVoltageData = new Array(maxDataPoints).fill(0);
let rightRpmVoltageData = new Array(maxDataPoints).fill(0);

// 手动输入数据
let coaxialTimes = [];
let coaxialData = [];
let verticalData = [];
let runoutTimes = [];
let runoutData = [[], [], [], []];

// 健康度历史
let healthHistory = [];
let healthTimes = [];

// 图片帧动画
let upperWheelFrame = 0;
let lowerWheelFrame = 0;
let ringFrame = 0;
let ringPosition = 0;

// 周期累积变量
let currentCycleUpperSum = 0;
let currentCycleUpperCount = 0;
let currentCycleMinUpper = Infinity;
let currentCycleLowerSum = 0;
let currentCycleLowerCount = 0;
let currentCycleMinLower = Infinity;
let lastCycleUpperAvg = 0;
let lastCycleLowerAvg = 0;
let cycleCount = 0;
let prevUpperHasBelowPreload = null;
let prevLowerHasBelowPreload = null;


// 周期数据记录（用于故障关键信息图表）- 扩展为四组
let cycleTimes = [];
let upperCycleAvgHistory = [];
let lowerCycleAvgHistory = [];
let upperCycleMinHistory = [];
let lowerCycleMinHistory = [];

// 文件数据缓存 - 流式分块处理
let fileDataQueue = [];             // 主队列，存放已解析的数据点数组
let pendingChunks = [];             // 待加入主队列的块（解析完成但主队列已满）
let fileDataPlaying = false;
let filePlaybackInterval = null;
let fileCurrentSecond = 0;          // 当前播放的秒数（用于聚合）
let fileTotalPoints = 0;            // 总点数（估算）
let fileWorker = null;
let isWorkerProcessing = false;
let fileAllChunksReceived = false;  // 是否所有块已接收
let fileCurrentChunkIndex = 0;      // 当前正在播放的块索引
let fileCurrentDataIndex = 0;       // 当前块内索引

// 缓存控制参数
const MAX_MAIN_QUEUE_CHUNKS = 5;    // 主队列最大块数，防止内存堆积
const MAX_PENDING_CHUNKS = 10;      // 待处理队列最大块数，超过则暂停读取

// 图表缓存数据
let pressureChartData = {
    upper: [],
    lower: [],
    timestamps: []
};
let rpmChartData = {
    left: [],
    right: [],
    timestamps: []
};
let motorChartData = {
    motor1: [],
    motor2: [],
    motor3: [],
    motor4: [],
    timestamps: []
};

// 引出线控制点坐标（相对于 container 的像素）
// 引出线控制点坐标（每条线三个点：start, control, end）
let controlPoints = {
    upper: { start: { x: 0, y: 0 }, control: { x: 0, y: 0 }, end: { x: 0, y: 0 } },
    lower: { start: { x: 0, y: 0 }, control: { x: 0, y: 0 }, end: { x: 0, y: 0 } },
    ring: { start: { x: 0, y: 0 }, control: { x: 0, y: 0 }, end: { x: 0, y: 0 } }
};
let draggingPoint = null; // 当前拖拽的点标识，如 'upper-start', 'upper-control', 'upper-end' 等

let draggingControl = null; // 当前拖拽的控制点标识 'upper' / 'lower' / 'ring'
// 新增图表实例
let faultKeyChart, healthTrendChart;

// 语言包
const i18n = {
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

let currentLang = 'zh';

// ==================== 图表统一主题（有动画） ====================
const chartTheme = {
    grid: { left: '8%', right: '5%', top: '15%', bottom: '15%', containLabel: true },
    xAxis: {
        type: 'category',
        axisLabel: { fontSize: 11, color: '#94a3b8', interval: 'auto', margin: 8 },
        axisLine: { lineStyle: { color: '#334155' } },
        axisTick: { show: false }
    },
    yAxis: {
        type: 'value',
        axisLabel: { fontSize: 11, color: '#94a3b8', interval: 0 },
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
        textStyle: { color: '#e2e8f0', fontSize: 11 }
    },
    legend: {
        textStyle: { color: '#94a3b8', fontSize: 11 },
        itemWidth: 10,
        itemHeight: 6,
        bottom: 0
    },
    animation: true
};


// 线宽滑块事件
const slider = document.getElementById('lineWidthSlider');
const valueSpan = document.getElementById('lineWidthValue');
if (slider) {
    slider.addEventListener('input', (e) => {
        const val = e.target.value;
        valueSpan.innerText = val;
        window.lineWidth = parseFloat(val);
        updateAnnotationLines(); // 重绘
    });
}
// ==================== 初始化 ====================
document.addEventListener('DOMContentLoaded', function() {
    initWebSocket();
    initEventListeners();
    initCharts();
    initHealthCharts();
    loadInitialData();
    loadSavedData();
    updateDateTime();
    setInterval(updateDateTime, 1000);
    generateTimePoints();
    startDataSimulation();
    loadImages();
    startAnimations();

    createProgressBar();

    setTimeout(() => {
        Object.values(charts).forEach(chart => chart?.resize());
        faultKeyChart?.resize();
        healthTrendChart?.resize();
    }, 500);

    document.getElementById('langSelector')?.addEventListener('change', (e) => {
        const lang = e.target.value;
        applyLanguage(lang);
        saveLanguageConfig(lang);
    });
});

// 应用语言
function applyLanguage(lang) {
    currentLang = lang;
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (i18n[lang] && i18n[lang][key]) {
            if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') {
                el.placeholder = i18n[lang][key];
            } else {
                el.innerText = i18n[lang][key];
            }
        }
    });

    // 更新所有图表的系列名
    if (charts.coaxial) {
        charts.coaxial.setOption({
            series: [
                { name: i18n[lang].coaxialIn },
                { name: i18n[lang].verticalOut }
            ]
        });
    }
    if (charts.runout) {
        charts.runout.setOption({
            series: [
                { name: i18n[lang].wheel1 },
                { name: i18n[lang].wheel2 },
                { name: i18n[lang].wheel3 },
                { name: i18n[lang].wheel4 }
            ]
        });
    }
    if (charts.vibration) {
        charts.vibration.setOption({
            series: [{ name: i18n[lang].displacementSensor }]
        });
    }
    if (charts.displacement) {
        charts.displacement.setOption({
            series: [{ name: i18n[lang].displacementSensor }]
        });
    }

    // 更新故障关键信息图表
    if (faultKeyChart) updateFaultKeyChart();
    // 更新健康度趋势图表（系列名无需翻译，但可重绘）
    if (healthTrendChart) healthTrendChart.setOption({}); // 触发重绘

    // 更新状态文本（基于当前健康度）
    updateWheelStatusFromHealth(currentUpperHealth, currentLowerHealth);
    // 刷新健康度参数显示（临界值可能为 '--'，但 '--' 不随语言变，其他文字已变）
    updateHealthParamDisplay();

    updateSystemStatus();
}


// 初始化健康度双图表
function initHealthCharts() {
    const faultDom = document.getElementById('faultKeyChart');
    if (faultDom) {
        faultKeyChart = echarts.init(faultDom);
        faultKeyChart.setOption({
            tooltip: { trigger: 'axis' },
            legend: { data: [i18n[currentLang].cycleAvg, i18n[currentLang].cycleMin, i18n[currentLang].criticalLine], textStyle: { color: '#94a3b8' } },
            grid: { left: '5%', right: '5%', top: '25%', bottom: '5%', containLabel: true },
            xAxis: { type: 'category', data: [], axisLabel: { color: '#94a3b8' }, axisLine: { lineStyle: { color: '#334155' } } },
            yAxis: { type: 'value', name: 'MPa', nameTextStyle: { color: '#94a3b8' }, axisLabel: { color: '#94a3b8' }, splitLine: { lineStyle: { color: '#334155' } } },
            series: [
                { name: i18n[currentLang].cycleAvg, type: 'line', data: [], lineStyle: { color: '#38bdf8', width: 2 }, smooth: false, showSymbol: true, symbol: 'circle', symbolSize: 4 },
                { name: i18n[currentLang].cycleMin, type: 'line', data: [], lineStyle: { color: '#f97316', width: 2 }, smooth: false, showSymbol: true, symbol: 'circle', symbolSize: 4 },
                { name: i18n[currentLang].criticalLine, type: 'line', data: [], lineStyle: { type: 'dashed', color: '#ef4444', width: 2 }, smooth: false, showSymbol: false }
            ],
            animation: true
        });
    }

    const trendDom = document.getElementById('healthTrendChart');
    if (trendDom) {
        healthTrendChart = echarts.init(trendDom);
        healthTrendChart.setOption({
            tooltip: { trigger: 'axis' },
            grid: { left: '5%', right: '5%', top: '25%', bottom: '5%', containLabel: true },
            xAxis: { type: 'category', data: [], axisLabel: { color: '#94a3b8' }, axisLine: { lineStyle: { color: '#334155' } } },
            yAxis: { type: 'value', name: '%', max: 100, nameTextStyle: { color: '#94a3b8' }, axisLabel: { color: '#94a3b8' }, splitLine: { lineStyle: { color: '#334155' } } },
            series: [
                { type: 'line', data: [], lineStyle: { color: '#4ade80', width: 2 }, areaStyle: { color: '#4ade8040' }, smooth: false, showSymbol: true, symbol: 'circle', symbolSize: 4 }
            ],
            animation: true
        });
    }
}

// 更新健康度趋势

// 更新健康度趋势图表
function updateHealthTrend(systemHealth) {
    if (!healthTrendChart) return;

    const timestamp = new Date().toLocaleTimeString('zh-CN', {
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });

    // 将系统健康度添加到历史数组
    healthTimes.push(timestamp);
    healthHistory.push(systemHealth);

    // 限制数组长度（例如保留最近50个点）
    if (healthTimes.length > 50) {
        healthTimes.shift();
        healthHistory.shift();
    }

    healthTrendChart.setOption({
        xAxis: { data: healthTimes },
        series: [{ data: healthHistory }]
    });
}


// 更新故障关键信息图表
function updateFaultKeyChart() {
    if (!faultKeyChart) return;

    const leftHasRpm = leftRpmData[leftRpmData.length-1] > 0;
    const rightHasRpm = rightRpmData[rightRpmData.length-1] > 0;

    let seriesNames, colors;
    let avgData, minData, criticalData;

    if (rightHasRpm) {
        // 上限位轮转动
        avgData = upperCycleAvgHistory;
        minData = upperCycleMinHistory;
        criticalData = new Array(cycleTimes.length).fill(upperPreloadPressure);
        seriesNames = [i18n[currentLang].upperCycleAvg, i18n[currentLang].upperCycleMin, i18n[currentLang].upperPreload];
        colors = ['#38bdf8', '#ef4444', '#38bdf8'];
    } else if (leftHasRpm) {
        // 下限位轮转动
        avgData = lowerCycleAvgHistory;
        minData = lowerCycleMinHistory;
        criticalData = new Array(cycleTimes.length).fill(lowerPreloadPressure);
        seriesNames = [i18n[currentLang].lowerCycleAvg, i18n[currentLang].lowerCycleMin, i18n[currentLang].lowerPreload];
        colors = ['#f97316', '#a78bfa', '#f97316'];
    } else {
        // 都不转，默认显示上轮
        avgData = upperCycleAvgHistory;
        minData = upperCycleMinHistory;
        criticalData = new Array(cycleTimes.length).fill(upperPreloadPressure);
        seriesNames = [i18n[currentLang].upperCycleAvg, i18n[currentLang].upperCycleMin, i18n[currentLang].upperPreload];
        colors = ['#38bdf8', '#ef4444', '#38bdf8'];
    }

    // 应用压力映射
    avgData = avgData.map(mapPressure);
    minData = minData.map(mapPressure);
    criticalData = criticalData.map(mapPressure);
    // ---- 新增：动态计算 Y 轴范围 ----
    let allData = [...avgData, ...minData, ...criticalData].filter(v => typeof v === 'number' && !isNaN(v));
    let minVal = Math.min(...allData);
    let maxVal = Math.max(...allData);
    let margin = Math.max((maxVal - minVal) * 0.1, 0.2); // 10% 边距，至少 0.2
    let yMin = Math.max(0, minVal - margin);
    let yMax = maxVal + margin;
    if (yMax - yMin < 0.01) { // 防止范围过小
        yMin = Math.max(0, yMin - 0.1);
        yMax = yMax + 0.1;
    }

    faultKeyChart.setOption({
        xAxis: { data: cycleTimes },
        yAxis: {
            min: yMin,
            max: yMax,
            name: pressureUnit,// 保持单位显示
            axisLabel: {
                formatter: (value) => value.toFixed(1)   // 强制显示一位小数
            }
        },
        legend: { data: seriesNames },
        series: [
            {
                name: seriesNames[0],
                type: 'line',
                data: avgData,
                lineStyle: { color: colors[0], width: 2 },
                smooth: false,
                showSymbol: true,
                symbol: 'circle',
                symbolSize: 4
            },
            {
                name: seriesNames[1],
                type: 'line',
                data: minData,
                lineStyle: { color: colors[1], width: 2 },
                smooth: false,
                showSymbol: true,
                symbol: 'circle',
                symbolSize: 4
            },
            {
                name: seriesNames[2],
                type: 'line',
                data: criticalData,
                lineStyle: { type: 'dashed', color: colors[2], width: 2 },
                showSymbol: false
            }
        ]
    });
}

// 创建进度条
function createProgressBar() {
    const progressContainer = document.createElement('div');
    progressContainer.id = 'fileProgressContainer';
    progressContainer.style.cssText = `
        position: fixed;
        top: 60px;
        right: 20px;
        width: 340px;
        background: #1e293b;
        border-radius: 8px;
        padding: 15px;
        box-shadow: 0 4px 20px rgba(0,0,0,0.5);
        z-index: 10000;
        display: none;
        border: 1px solid #38bdf8;
        font-family: 'Microsoft YaHei', sans-serif;
        cursor: move;
        user-select: none;
    `;

    progressContainer.innerHTML = `
        <div style="display: flex; justify-content: space-between; margin-bottom: 10px; cursor: move;">
            <span style="color: #e2e8f0; font-size: 14px; font-weight: 500;">
                <i class="fas fa-file-import" style="color: #38bdf8; margin-right: 6px;"></i><span data-i18n="fileProgress">文件处理进度</span>
            </span>
            <span id="fileProgressPercent" style="color: #38bdf8; font-size: 14px; font-weight: 600;">0%</span>
        </div>
        <div style="background: #0f172a; height: 8px; border-radius: 4px; overflow: hidden; margin-bottom: 10px;">
            <div id="fileProgressBar" style="background: linear-gradient(90deg, #38bdf8, #4ade80); height: 100%; width: 0%; transition: width 0.3s;"></div>
        </div>
        <div id="fileProgressInfo" style="color: #94a3b8; font-size: 12px; margin-bottom: 5px; text-align: center;">
            <span data-i18n="preparing">准备加载...</span>
        </div>
        <div id="fileMemoryInfo" style="color: #4ade80; font-size: 11px; text-align: center; display: flex; justify-content: space-between;">
            <span><i class="fas fa-microchip"></i> <span id="fileSpeed">--</span> <span data-i18n="rowsPerSec">条/秒</span></span>
            <span><i class="fas fa-memory"></i> <span id="fileMemory">0</span> MB</span>
        </div>
    `;

    document.body.appendChild(progressContainer);

    let isDragging = false;
    let offsetX, offsetY;
    const header = progressContainer.querySelector('div:first-child');
    header.addEventListener('mousedown', (e) => {
        isDragging = true;
        offsetX = e.clientX - progressContainer.offsetLeft;
        offsetY = e.clientY - progressContainer.offsetTop;
        progressContainer.style.cursor = 'grabbing';
    });
    document.addEventListener('mousemove', (e) => {
        if (isDragging) {
            progressContainer.style.left = (e.clientX - offsetX) + 'px';
            progressContainer.style.top = (e.clientY - offsetY) + 'px';
        }
    });
    document.addEventListener('mouseup', () => {
        isDragging = false;
        progressContainer.style.cursor = 'move';
    });
}

// 显示进度条
function showProgress(percent, info) {
    const container = document.getElementById('fileProgressContainer');
    const bar = document.getElementById('fileProgressBar');
    const percentEl = document.getElementById('fileProgressPercent');
    const infoEl = document.getElementById('fileProgressInfo');

    if (container && bar && percentEl && infoEl) {
        container.style.display = 'block';
        bar.style.width = percent + '%';
        percentEl.innerText = percent + '%';
        infoEl.innerText = info;

        const memoryEl = document.getElementById('fileMemory');
        if (memoryEl && window.performance && window.performance.memory) {
            const usedMB = Math.round(window.performance.memory.usedJSHeapSize / (1024 * 1024));
            memoryEl.innerText = usedMB;
        }
    }
}

// 隐藏进度条
function hideProgress() {
    const container = document.getElementById('fileProgressContainer');
    if (container) {
        setTimeout(() => {
            container.style.display = 'none';
        }, 1000);
    }
}

// 加载图片
function loadImages() {
    const rollerImg = document.getElementById('rollerImage');
    if (rollerImg) {
        rollerImg.src = '/static/images/output_drum/RT300B.ZT_01.PNG';
        rollerImg.onerror = () => {
            rollerImg.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjE0MCIgdmlld0JveD0iMCAwIDIwMCAxNDAiPjxyZWN0IHdpZHRoPSIyMDAiIGhlaWdodD0iMTQwIiBmaWxsPSIjMjQzYjVhIi8+PHRleHQgeD0iMTAwIiB5PSI3MCIgZm9udC1mYW1pbHk9IkFyaWFsIiBmb250LXNpemU9IjE2IiBmaWxsPSIjZmZmIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIj7msojnvqQ8L3RleHQ+PC9zdmc+';
        };
    }
    for (let i = 0; i <= 10; i++) {
        const img = new Image();
        img.src = `/static/images/output_drum/RT300B.ZT_0${i}.PNG?v=1`;
    }

    for (let i = 0; i <= 11; i++) {
        const img = new Image();
        img.src = `/static/images/${i}.png?v=1`;
    }
    for (let i = 11; i <= 21; i++) {
        const img = new Image();
        img.src = `/static/images/gq-${i}.png?v=1`;
    }
}

// 动画循环
function startAnimations() {
    const ringFrames = 11;       // 滚圈帧数（11~21）
    const wheelFrames = 12;      // 上下轮帧数（0~11）
    const rollerFrames = 13;     // 滚筒示意图帧数（0~21）
    
    let lastWheelUpdate = 0;
    let lastRingUpdate = 0;
    let lastRollerUpdate = 0;
    const baseFrameInterval = 1000 / 30; // 30fps

    function updateAnimation() {
        const now = Date.now();

        // 判断电机是否工作（任意电机电流 >0）
        const anyMotorActive = motor1Data.some(v => v > 0) || motor2Data.some(v => v > 0) ||
                               motor3Data.some(v => v > 0) || motor4Data.some(v => v > 0);

        // 1. 滚筒示意图动画（使用 output_drum 图片）
        if (anyMotorActive && now - lastRollerUpdate >= baseFrameInterval) {
            rollerFrame = (rollerFrame + 1) % rollerFrames; // rollerFrame 需定义为全局变量，初始0
            const rollerImg = document.getElementById('rollerImage');
            if (rollerImg) {
                rollerImg.src = `/static/images/output_drum/RT300B.ZT_0${rollerFrame}.PNG?v=1`;//RT300B.ZT_0${i}
            }
            lastRollerUpdate = now;
        } else if (!anyMotorActive) {
            // 电机停止时，将滚筒图重置为第一帧（静止）
            const rollerImg = document.getElementById('rollerImage');
            if (rollerImg && rollerImg.src.indexOf('RT300B.ZT_01.PNG') === -1) {
                rollerImg.src = '/static/images/output_drum/RT300B.ZT_01.PNG';
            }
        }

        // 2. 上下轮动画（原有逻辑，使用 ${i}.png 和 gq-${i}.png）
        if (rightRpmData[rightRpmData.length-1] > 0 && now - lastWheelUpdate >= baseFrameInterval) {
            upperWheelFrame = (upperWheelFrame + 1) % 12;
            const upperImg = document.getElementById('upperWheelImage');
            if (upperImg) {
                upperImg.src = `/static/images/${upperWheelFrame}.png?v=1`;
            }
            lastWheelUpdate = now;
        }
        if (leftRpmData[leftRpmData.length-1] > 0 && now - lastWheelUpdate >= baseFrameInterval) {
            lowerWheelFrame = (lowerWheelFrame + 1) % 12;
            const lowerImg = document.getElementById('lowerWheelImage');
            if (lowerImg) {
                lowerImg.src = `/static/images/${lowerWheelFrame}.png?v=1`;
            }
            lastWheelUpdate = now;
        }

        // 3. 滚圈动画（原有逻辑，使用 gq-${i}.png）
        if ((leftRpmData[leftRpmData.length-1] > 0 || rightRpmData[rightRpmData.length-1] > 0) && now - lastRingUpdate >= baseFrameInterval) {
            ringFrame = (ringFrame + 1) % 11;
            const ringImg = document.getElementById('ringImage');
            if (ringImg) {
                ringImg.src = `/static/images/gq-${11+ringFrame}.png?t=${Date.now()}`;
            }
            lastRingUpdate = now;
        }

        requestAnimationFrame(updateAnimation);
    }

    // 定义滚筒动画帧计数器（如果尚未定义）
    if (typeof rollerFrame === 'undefined') {
        window.rollerFrame = 5;
    }

    requestAnimationFrame(updateAnimation);
}

// 更新位移指示器
function updateDisplacementIndicator(avg) {
    if (!avg) return;
    const rawDisplacement = avg.eddy_current;
    const leftHasRpm = avg.left_rpm > 0.1;
    const rightHasRpm = avg.right_rpm > 0.1;

    let displayPositionPercent;
    let actualDisplacement;

    // 特殊规则：健康度低于60时强制位移
    if (rightHasRpm && currentUpperHealth < 60) {
        // 上限位轮故障，强制显示在-4mm（左侧）
        displayPositionPercent = 0;
        actualDisplacement = 0;
    } else if (leftHasRpm && currentLowerHealth < 60) {
        // 下限位轮故障，强制显示在+4mm（右侧）
        displayPositionPercent = 100;
        actualDisplacement = 8;
    } else {
        // 正常情况，计算实际位移
        actualDisplacement = rawDisplacement - initialDisplacement;
        // 限制在0-8mm范围内
        actualDisplacement = Math.max(0, Math.min(8, actualDisplacement));
        displayPositionPercent = (actualDisplacement / 8) * 100;
    }

    const indicator = document.getElementById('positionIndicator');
    const valueDisplay = document.getElementById('positionValue');
    const ringImg = document.getElementById('ringImage');

    if (indicator) {
        indicator.style.left = displayPositionPercent + '%';
    }
    if (valueDisplay) {
        valueDisplay.innerText = actualDisplacement.toFixed(2) + 'mm';
    }
    if (ringImg) {
        // 图片移动：实际位移0-8映射到-50px~+50px（可根据实际需要调整系数）
        const moveOffset = (actualDisplacement - 4) * 12.5; // 范围 -50 到 50
        ringImg.style.transform = `translateX(${moveOffset}px)`;
    }
}

// 生成时间点
function generateTimePoints() {
    const now = new Date();
    timePoints = [];
    for (let i = maxDataPoints - 1; i >= 0; i--) {
        const time = new Date(now.getTime() - i * 1000);
        timePoints.push(time.toLocaleTimeString('zh-CN', {
            hour12: false,
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        }));
    }
}

// 初始化WebSocket
function initWebSocket() {
    socket = io({
        reconnection: true,
        reconnectionAttempts: 5,
        timeout: 30000
    });
    socket.on('connect', () => {
        console.log('WebSocket已连接');
        socket.emit('request_data');
    });
    socket.on('data_update', (data) => {
        sensorData = { ...sensorData, ...data };
    });

    // 监控模式下，累积数据点，每秒更新，并打印详细日志
    socket.on('file_data_update', (dataPoint) => {
        if (fileMonitorActive) {
            console.log('[RECV] 收到数据点:', dataPoint);
            if (!window.monitorAccumulator) {
                window.monitorAccumulator = {
                    points: [],
                    timer: null,
                    lastAvg: null
                };
            }
            window.monitorAccumulator.points.push(dataPoint);
            if (!window.monitorAccumulator.timer) {
                window.monitorAccumulator.timer = setInterval(() => {
                    const pointsCount = window.monitorAccumulator.points.length;
                    console.log(`[ACCUM] 定时器触发，当前累积点数: ${pointsCount}`);
                    if (pointsCount > 0) {
                        // 计算平均值
                        const sum = window.monitorAccumulator.points.reduce((acc, p) => {
                            acc.upper_pressure += p.upper_pressure;
                            acc.lower_pressure += p.lower_pressure;
                            acc.left_rpm += p.left_rpm;
                            acc.right_rpm += p.right_rpm;
                            acc.eddy_current += p.eddy_current;
                            acc.motor1 += p.motor1;
                            acc.motor2 += p.motor2;
                            acc.motor3 += p.motor3;
                            acc.motor4 += p.motor4;
                            return acc;
                        }, { upper_pressure:0, lower_pressure:0, left_rpm:0, right_rpm:0, eddy_current:0,
                            motor1:0, motor2:0, motor3:0, motor4:0 });
                        const count = pointsCount;
                        const avg = {
                            upper_pressure: sum.upper_pressure / count,
                            lower_pressure: sum.lower_pressure / count,
                            left_rpm: sum.left_rpm / count,
                            right_rpm: sum.right_rpm / count,
                            eddy_current: sum.eddy_current / count,
                            motor1: sum.motor1 / count,
                            motor2: sum.motor2 / count,
                            motor3: sum.motor3 / count,
                            motor4: sum.motor4 / count
                        };
                        console.log(`[ACCUM] 计算平均值: 收到 ${count} 个点, avg=`, avg);
                        // 保存本次平均值
                        window.monitorAccumulator.lastAvg = avg;
                        updateDisplayWithSecondAverage(avg);
                        window.monitorAccumulator.points = []; // 清空，准备下一秒
                    } else {
                        // 本秒无数据，如果有上一秒的值，则使用它保持更新
                        if (window.monitorAccumulator.lastAvg) {
                            console.log('[ACCUM] 本秒无数据，使用上一秒值保持');
                            updateDisplayWithSecondAverage(window.monitorAccumulator.lastAvg);
                        } else {
                            console.log('[ACCUM] 本秒无数据且无上一秒值，不更新');
                        }
                    }
                }, 1000);
            }
        }
    });
    socket.on('disconnect', () => {
        console.log('WebSocket断开连接');
    });
}

// 初始化事件监听
function initEventListeners() {
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', function() {
            switchPage(this.dataset.page);
        });
    });

    document.querySelectorAll('.switcher-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            switchHomeChart(this.dataset.chart);
        });
    });

    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            switchTab(this.dataset.tab);
        });
    });

    document.getElementById('startBtn')?.addEventListener('click', startCollection);
    document.getElementById('saveBtn')?.addEventListener('click', saveData);
    document.getElementById('stopBtn')?.addEventListener('click', stopCollection);
    document.getElementById('browseBtn')?.addEventListener('click', browseFile);
    document.getElementById('loadFileBtn')?.addEventListener('click', loadFileData);
    document.getElementById('saveHealthConfig')?.addEventListener('click', saveHealthConfig);
    document.getElementById('savePortConfig')?.addEventListener('click', savePortConfig);

    document.getElementById('monitorBtn')?.addEventListener('click', startFileMonitor);
    document.getElementById('savePressureMapping')?.addEventListener('click', savePressureMapping);
    document.getElementById('unitSelector')?.addEventListener('change', (e) => changeUnit(e.target.value));
}

// 切换主页图表
function switchHomeChart(chart) {
    currentHomeChart = chart;
    document.querySelectorAll('.switcher-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.chart === chart);
    });
    document.querySelectorAll('.chart-page').forEach(page => {
        page.classList.toggle('active', page.id === chart + 'Page');
    });

    setTimeout(() => {
        Object.values(charts).forEach(chart => chart?.resize());
    }, 100);
}

// 切换标签页
function switchTab(tab) {
    currentTab = tab;
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tab);
    });
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.toggle('active', content.id === tab + 'Tab');
    });

    setTimeout(() => {
        Object.values(charts).forEach(chart => chart?.resize());
    }, 100);
}

// 新增函数：开始实时监控文件
function startFileMonitor() {
    const filePath = document.getElementById('savePath').value;
    if (!filePath) {
        showToast('请先输入或浏览选择要监控的文件路径', 'warning');
        return;
    }
    fetch('/api/monitor/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filepath: filePath })
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            fileMonitorActive = true;
            systemStatus.collecting = true;
            systemStatus.status_type = 'monitoring';
            systemStatus.status_text = i18n[currentLang].statusMonitoring || '监控中...';
            updateSystemStatus();
            document.getElementById('startBtn').disabled = true;
            document.getElementById('saveBtn').disabled = false;
            document.getElementById('stopBtn').disabled = false;
            document.getElementById('monitorBtn').disabled = true;
            showToast('开始实时监控文件: ' + filePath, 'success');
            // 重置显示数据（可选）
            resetDisplayData();
        } else {
            showToast('启动监控失败: ' + data.message, 'error');
        }
    })
    .catch(err => {
        console.error('启动监控失败:', err);
        showToast('启动监控失败', 'error');
    });
}

// ==================== 图表初始化（修复默认数据为空问题） ====================
function initCharts() {
    initCoaxialChart();
    initRunoutChart();
    initVibrationChart();
    initMotorCharts();
    initPressureUpperChart();
    initPressureLowerChart();
    initRpmUpperChart();
    initRpmLowerChart();
    initDisplacementChart();
    initFaultKeyChart();

}


function initFaultKeyChart() {
    const dom = document.getElementById('faultKeyChart');
    if (!dom) return;
    faultKeyChart = echarts.init(dom);
    // 初始化为空，后续由 updateFaultKeyChart 填充
    faultKeyChart.setOption({
        tooltip: { trigger: 'axis' },
        legend: { data: [], textStyle: { color: '#94a3b8' } },
        grid: { left: '10%', right: '8%', top: '15%', bottom: '12%', containLabel: true },
        xAxis: { type: 'category', data: [], axisLabel: { color: '#94a3b8' } },
        yAxis: { type: 'value', name: 'nameTextStyle', nameTextStyle: { color: '#94a3b8' } },
        series: [],
        animation: false
    });
}

function initCoaxialChart() {
    const chartDom = document.getElementById('coaxialChart');
    if (!chartDom) return;

    charts.coaxial = echarts.init(chartDom);
    const times = coaxialTimes.length ? coaxialTimes : Array(11).fill('').map((_, i) => {
        const d = new Date(Date.now() - (10-i) * 60000);
        return `${d.getHours()}:${d.getMinutes()}`;
    });

    const option = {
        ...chartTheme,
        xAxis: { ...chartTheme.xAxis, data: times },
        yAxis: { ...chartTheme.yAxis, name: 'mm' },
        series: [
            {
                name: i18n[currentLang].coaxialIn,
                type: 'line',
                data: coaxialData.length ? coaxialData : Array(11).fill(0),
                lineStyle: { color: '#38bdf8', width: 2 },
                smooth: false,
                showSymbol: true,
                symbol: 'circle',
                symbolSize: 4
            },
            {
                name: i18n[currentLang].verticalOut,
                type: 'line',
                data: verticalData.length ? verticalData : Array(11).fill(0),
                lineStyle: { color: '#f97316', width: 2 },
                smooth: false,
                showSymbol: true,
                symbol: 'circle',
                symbolSize: 4
            }
        ]
    };

    charts.coaxial.setOption(option);
}

function initRunoutChart() {
    const chartDom = document.getElementById('runoutChart');
    if (!chartDom) return;

    charts.runout = echarts.init(chartDom);
    const times = runoutTimes.length ? runoutTimes : Array(11).fill('').map((_, i) => {
        const d = new Date(Date.now() - (10-i) * 60000);
        return `${d.getHours()}:${d.getMinutes()}`;
    });

    if (!runoutData[0].length) {
        runoutData = [Array(11).fill(0), Array(11).fill(0), Array(11).fill(0), Array(11).fill(0)];
    }

    const option = {
        ...chartTheme,
        xAxis: { ...chartTheme.xAxis, data: times },
        yAxis: { ...chartTheme.yAxis, name: 'mm' },
        series: [
            {
                name: i18n[currentLang].wheel1,
                type: 'line',
                data: runoutData[0],
                lineStyle: { color: '#ef4444', width: 2 },
                smooth: false,
                showSymbol: true,
                symbol: 'circle',
                symbolSize: 4
            },
            {
                name: i18n[currentLang].wheel2,
                type: 'line',
                data: runoutData[1],
                lineStyle: { color: '#f97316', width: 2 },
                smooth: false,
                showSymbol: true,
                symbol: 'circle',
                symbolSize: 4
            },
            {
                name: i18n[currentLang].wheel3,
                type: 'line',
                data: runoutData[2],
                lineStyle: { color: '#4ade80', width: 2 },
                smooth: false,
                showSymbol: true,
                symbol: 'circle',
                symbolSize: 4
            },
            {
                name: i18n[currentLang].wheel4,
                type: 'line',
                data: runoutData[3],
                lineStyle: { color: '#a78bfa', width: 2 },
                smooth: false,
                showSymbol: true,
                symbol: 'circle',
                symbolSize: 4
            }
        ]
    };

    charts.runout.setOption(option);
}

function initVibrationChart() {
    const chartDom = document.getElementById('vibrationChart');
    if (!chartDom) return;

    charts.vibration = echarts.init(chartDom);

    const option = {
        ...chartTheme,
        xAxis: { ...chartTheme.xAxis, data: timePoints },
        yAxis: { ...chartTheme.yAxis, name: 'mm' },
        series: [{
            name: i18n[currentLang].displacementSensor,
            type: 'line',
            data: vibrationData,
            lineStyle: { color: '#f87171', width: 2 },
            areaStyle: { color: 'rgba(248, 113, 113, 0.1)' },
            smooth: false,
            showSymbol: true,
            symbol: 'circle',
            symbolSize: 4
        }]
    };

    charts.vibration.setOption(option);
}

function initMotorCharts() {
    const motors = ['motor1', 'motor2', 'motor3', 'motor4'];
    const colors = ['#ef4444', '#f97316', '#4ade80', '#a78bfa'];

    if (motorChartData.timestamps.length === 0 && timePoints.length > 0) {
        motorChartData.timestamps = [...timePoints];
        for (let i = 1; i <= 4; i++) {
            motorChartData[`motor${i}`] = new Array(maxDataPoints).fill(0);
        }
    }

    motors.forEach((id, idx) => {
        const chartDom = document.getElementById(id + 'Chart');
        if (!chartDom) return;

        charts[id] = echarts.init(chartDom);

        const option = {
            tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
            grid: { left: '5%', right: '3%', top: '10%', bottom: '10%' },
            xAxis: {
                type: 'category',
                data: motorChartData.timestamps,
                axisLabel: { fontSize: 9, color: '#94a3b8', interval: 5, rotate: 30 },
                axisLine: { lineStyle: { color: '#334155' } }
            },
            yAxis: { type: 'value', show: false },
            series: [{
                data: motorChartData[id],
                type: 'line',
                smooth: false,
                lineStyle: { color: colors[idx], width: 2 },
                showSymbol: true,
                symbol: 'circle',
                symbolSize: 4,
                areaStyle: { color: colors[idx] + '20' }
            }],
            animation: true
        };

        charts[id].setOption(option);
    });
}

function initPressureUpperChart() {
    const chartDom = document.getElementById('pressureUpperChart');
    if (!chartDom) return;

    if (pressureChartData.timestamps.length === 0 && timePoints.length > 0) {
        pressureChartData.timestamps = [...timePoints];
        pressureChartData.upper = new Array(maxDataPoints).fill(0);
        pressureChartData.lower = new Array(maxDataPoints).fill(0);
    }

    charts.pressureUpper = echarts.init(chartDom);
    const option = {
        tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
        grid: { left: '5%', right: '3%', top: '10%', bottom: '10%' },
        xAxis: {
            type: 'category',
            data: pressureChartData.timestamps,
            axisLabel: { fontSize: 9, color: '#94a3b8', interval: 5, rotate: 30 },
            axisLine: { lineStyle: { color: '#334155' } }
        },
        yAxis: { type: 'value', show: false },
        series: [{
            data: pressureChartData.upper,
            type: 'line',
            lineStyle: { color: '#f87171', width: 2 },
            smooth: false,
            showSymbol: true,
            symbol: 'circle',
            symbolSize: 4
        }],
        animation: true
    };
    charts.pressureUpper.setOption(option);
}

function initPressureLowerChart() {
    const chartDom = document.getElementById('pressureLowerChart');
    if (!chartDom) return;

    if (pressureChartData.timestamps.length === 0 && timePoints.length > 0) {
        pressureChartData.timestamps = [...timePoints];
        pressureChartData.upper = new Array(maxDataPoints).fill(0);
        pressureChartData.lower = new Array(maxDataPoints).fill(0);
    }

    charts.pressureLower = echarts.init(chartDom);
    const option = {
        tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
        grid: { left: '5%', right: '3%', top: '10%', bottom: '10%' },
        xAxis: {
            type: 'category',
            data: pressureChartData.timestamps,
            axisLabel: { fontSize: 9, color: '#94a3b8', interval: 5, rotate: 30 },
            axisLine: { lineStyle: { color: '#334155' } }
        },
        yAxis: { type: 'value', show: false },
        series: [{
            data: pressureChartData.lower,
            type: 'line',
            lineStyle: { color: '#a78bfa', width: 2 },
            smooth: false,
            showSymbol: true,
            symbol: 'circle',
            symbolSize: 4
        }],
        animation: true
    };
    charts.pressureLower.setOption(option);
}

function initRpmUpperChart() {
    const chartDom = document.getElementById('rpmUpperChart');
    if (!chartDom) return;

    if (rpmChartData.timestamps.length === 0 && timePoints.length > 0) {
        rpmChartData.timestamps = [...timePoints];
        rpmChartData.left = new Array(maxDataPoints).fill(0);
        rpmChartData.right = new Array(maxDataPoints).fill(0);
    }

    charts.rpmUpper = echarts.init(chartDom);
    const option = {
        tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
        grid: { left: '5%', right: '3%', top: '10%', bottom: '10%' },
        xAxis: {
            type: 'category',
            data: rpmChartData.timestamps,
            axisLabel: { fontSize: 9, color: '#94a3b8', interval: 5, rotate: 30 },
            axisLine: { lineStyle: { color: '#334155' } }
        },
        yAxis: { type: 'value', show: false },
        series: [{
            data: rpmChartData.left,
            type: 'line',
            lineStyle: { color: '#fcd34d', width: 2 },
            smooth: false,
            showSymbol: true,
            symbol: 'circle',
            symbolSize: 4
        }],
        animation: true
    };
    charts.rpmUpper.setOption(option);
}

function initRpmLowerChart() {
    const chartDom = document.getElementById('rpmLowerChart');
    if (!chartDom) return;

    if (rpmChartData.timestamps.length === 0 && timePoints.length > 0) {
        rpmChartData.timestamps = [...timePoints];
        rpmChartData.left = new Array(maxDataPoints).fill(0);
        rpmChartData.right = new Array(maxDataPoints).fill(0);
    }

    charts.rpmLower = echarts.init(chartDom);
    const option = {
        tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
        grid: { left: '5%', right: '3%', top: '10%', bottom: '10%' },
        xAxis: {
            type: 'category',
            data: rpmChartData.timestamps,
            axisLabel: { fontSize: 9, color: '#94a3b8', interval: 5, rotate: 30 },
            axisLine: { lineStyle: { color: '#334155' } }
        },
        yAxis: { type: 'value', show: false },
        series: [{
            data: rpmChartData.right,
            type: 'line',
            lineStyle: { color: '#f97316', width: 2 },
            smooth: false,
            showSymbol: true,
            symbol: 'circle',
            symbolSize: 4
        }],
        animation: true
    };
    charts.rpmLower.setOption(option);
}
// 位移传感器初始化
function initDisplacementChart() {
    const chartDom = document.getElementById('displacementChart');
    if (!chartDom) return;

    charts.displacement = echarts.init(chartDom);

    const option = {
        tooltip: { trigger: 'axis' },
        grid: { left: '5%', right: '3%', top: '10%', bottom: '10%' },
        xAxis: {
            type: 'category',
            data: timePoints,
            axisLabel: { fontSize: 9, color: '#94a3b8', interval: 5, rotate: 30 },
            axisLine: { lineStyle: { color: '#334155' } }
        },
        yAxis: {
            type: 'value',
            name: 'mm',
            axisLabel: { fontSize: 9, color: '#94a3b8' },
            splitLine: { lineStyle: { color: '#334155' } }
        },
        series: [{
            name: i18n[currentLang].displacementSensor,
            type: 'line',
            data: vibrationData,
            lineStyle: { color: '#38bdf8', width: 2 },
            smooth: false,
            showSymbol: true,
            symbol: 'circle',
            symbolSize: 2
        }],
        animation: true
    };

    charts.displacement.setOption(option);
}

// 切换转速显示模式
function switchRpmMode(mode) {
    rpmDisplayMode = mode;
    document.querySelectorAll('[data-rpm-mode]').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.rpmMode === mode);
    });

    document.getElementById('leftRpmUnit').innerText = mode === 'value' ? 'RPM' : 'V';
    document.getElementById('rightRpmUnit').innerText = mode === 'value' ? 'RPM' : 'V';
}

// ==================== 健康度计算 ====================
function computeWheelHealth(cycleAvg, hasRpm, criticalAvg, preload, critical) {
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

function resetCycleAccumulators() {
    currentCycleUpperSum = 0;
    currentCycleUpperCount = 0;
    currentCycleMinUpper = Infinity;
    currentCycleLowerSum = 0;
    currentCycleLowerCount = 0;
    currentCycleMinLower = Infinity;
    lastCycleUpperAvg = 0;
    lastCycleLowerAvg = 0;
    cycleCount = 0;
    upperCriticalAvg = null;
    lowerCriticalAvg = null;
    prevUpperHasBelowPreload = null;
    prevLowerHasBelowPreload = null;
    cycleTimes = [];
    cycleAvgHistory = [];
    cycleMinHistory = [];
}

function updateHealth() {
    const upperCycleAvg = cycleCount > 0 ? lastCycleUpperAvg : 0;
    const lowerCycleAvg = cycleCount > 0 ? lastCycleLowerAvg : 0;

    const leftHasRpm = leftRpmData[leftRpmData.length-1] > 0;
    const rightHasRpm = rightRpmData[rightRpmData.length-1] > 0;

    const upperHealth = computeWheelHealth(upperCycleAvg, rightHasRpm, upperCriticalAvg, upperPreloadPressure, upperCriticalPressure);
    const lowerHealth = computeWheelHealth(lowerCycleAvg, leftHasRpm, lowerCriticalAvg, lowerPreloadPressure, lowerCriticalPressure);

    let systemHealth = 100;
    if (leftHasRpm && rightHasRpm) {
        systemHealth = Math.min(upperHealth, lowerHealth);
    } else if (leftHasRpm) {
        systemHealth = lowerHealth;
        currentLowerHealth = lowerHealth;
    } else if (rightHasRpm) {
        systemHealth = upperHealth;
        
    } else {
        systemHealth = 100;
    }
    
    console.log(`[HEALTH] 周期数=${cycleCount}, 上轮平均=${upperCycleAvg.toFixed(3)}, 下轮平均=${lowerCycleAvg.toFixed(3)}, 上轮健康=${upperHealth.toFixed(1)}%, 下轮健康=${lowerHealth.toFixed(1)}%, 系统健康=${systemHealth.toFixed(1)}%`);
    currentUpperHealth = upperHealth;
    currentLowerHealth = lowerHealth;
    updateHealthDisplay(systemHealth, upperHealth, lowerHealth);
    updateWheelStatusFromHealth(upperHealth, lowerHealth);
    updateHealthTrend(systemHealth);
}


// 更新健康度显示（系统健康度进度条）
function updateHealthDisplay(systemHealth, upperHealth, lowerHealth) {
    const healthValueEl = document.getElementById('healthValue');
    if (healthValueEl) healthValueEl.innerText = systemHealth.toFixed(1) + '%';

    const healthValueLargeEl = document.getElementById('healthValueLarge');
    if (healthValueLargeEl) healthValueLargeEl.innerText = systemHealth.toFixed(1) + '%';

    const healthBarEl = document.getElementById('healthBar');
    if (healthBarEl) healthBarEl.style.width = systemHealth + '%';

    let status = 'normal';
    let statusText = i18n[currentLang].statusNormal;
    if (systemHealth < 50) {
        status = 'fault';
        statusText = i18n[currentLang].statusFault;
    } else if (systemHealth < 60) {
        status = 'warning';
        statusText = i18n[currentLang].statusWarning;
    }

    const statusEl = document.getElementById('healthStatus');
    if (statusEl) {
        statusEl.className = `health-status-badge status-${status}`;
        statusEl.innerText = statusText;
    }

    const healthEl = document.getElementById('healthValueLarge');
    if (healthEl) {
        const hue = (systemHealth / 100) * 120;
        healthEl.style.color = `hsl(${hue}, 80%, 50%)`;
    }

    const healthBar = document.getElementById('healthBar');
    if (healthBar) {
        healthBar.style.background = `linear-gradient(90deg, #ff4444 0%, #ffaa00 50%, #4ade80 100%)`;
    }
}

function updateWheelStatusFromHealth(upperHealth, lowerHealth) {
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

// ==================== 数据模拟和更新 ====================
function startDataSimulation() {
    setInterval(() => {
        if (!systemStatus.collecting || fileDataPlaying) return;

        const avg = {
            upper_pressure: sensorData.upper_pressure?.active ? sensorData.upper_pressure.value : 0,
            lower_pressure: sensorData.lower_pressure?.active ? sensorData.lower_pressure.value : 0,
            left_rpm: sensorData.left_rpm?.active ? sensorData.left_rpm.value : 0,
            right_rpm: sensorData.right_rpm?.active ? sensorData.right_rpm.value : 0,
            eddy_current: sensorData.eddy_current?.active ? sensorData.eddy_current.value : 0,
            motor1: sensorData.motor1?.active ? sensorData.motor1.value : 0,
            motor2: sensorData.motor2?.active ? sensorData.motor2.value : 0,
            motor3: sensorData.motor3?.active ? sensorData.motor3.value : 0,
            motor4: sensorData.motor4?.active ? sensorData.motor4.value : 0
        };

        updateDisplayWithSecondAverage(avg);

        const now = new Date();
        timePoints.shift();
        timePoints.push(now.toLocaleTimeString('zh-CN', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }));

        // 更新电机状态
        for (let i = 1; i <= 4; i++) {
            const motorActive = sensorData[`motor${i}`]?.active || false;
            const motorVal = motorActive ? (sensorData[`motor${i}`]?.value || 0) : 0;
            const dataArray = eval(`motor${i}Data`);

            const currentEl = document.getElementById(`motor${i}Current`);
            const maxEl = document.getElementById(`motor${i}Max`);
            const avgEl = document.getElementById(`motor${i}Avg`);
            if (currentEl) currentEl.innerText = motorActive ? motorVal.toFixed(1) : '--';
            if (maxEl) maxEl.innerText = motorActive ? Math.max(...dataArray).toFixed(1) : '--';
            if (avgEl) avgEl.innerText = motorActive ? (dataArray.reduce((a,b) => a+b, 0) / dataArray.length).toFixed(1) : '--';

            const badge = document.getElementById(`motor${i}Status`);
            if (badge) {
                badge.className = `sensor-badge ${motorActive ? 'connected' : 'disconnected'}`;
                badge.innerText = motorActive ? i18n[currentLang].connected : i18n[currentLang].disconnected;
            }
        }

        // 压力传感器状态
        const upperActive = sensorData.upper_pressure?.active || false;
        const lowerActive = sensorData.lower_pressure?.active || false;
        const upperStatusEl = document.getElementById('upperPressureStatus');
        const lowerStatusEl = document.getElementById('lowerPressureStatus');
        if (upperStatusEl) {
            upperStatusEl.className = `sensor-badge ${upperActive ? 'connected' : 'disconnected'}`;
            upperStatusEl.innerText = upperActive ? i18n[currentLang].connected : i18n[currentLang].disconnected;
        }
        if (lowerStatusEl) {
            lowerStatusEl.className = `sensor-badge ${lowerActive ? 'connected' : 'disconnected'}`;
            lowerStatusEl.innerText = lowerActive ? i18n[currentLang].connected : i18n[currentLang].disconnected;
        }

        // 转速传感器状态
        const leftActive = sensorData.left_rpm?.active || false;
        const rightActive = sensorData.right_rpm?.active || false;
        const leftStatusEl = document.getElementById('leftRpmStatus');
        const rightStatusEl = document.getElementById('rightRpmStatus');
        if (leftStatusEl) {
            leftStatusEl.className = `sensor-badge ${leftActive ? 'connected' : 'disconnected'}`;
            leftStatusEl.innerText = leftActive ? i18n[currentLang].connected : i18n[currentLang].disconnected;
        }
        if (rightStatusEl) {
            rightStatusEl.className = `sensor-badge ${rightActive ? 'connected' : 'disconnected'}`;
            rightStatusEl.innerText = rightActive ? i18n[currentLang].connected : i18n[currentLang].disconnected;
        }

        // 位移传感器状态与统计
        const vibActive = sensorData.eddy_current?.active || false;
        const dispStatusEl = document.getElementById('displacementStatus');
        if (dispStatusEl) {
            dispStatusEl.className = `sensor-badge ${vibActive ? 'connected' : 'disconnected'}`;
            dispStatusEl.innerText = vibActive ? i18n[currentLang].connected : i18n[currentLang].disconnected;
        }
        const dispValueEl = document.getElementById('displacementValue');
        if (dispValueEl) dispValueEl.innerText = vibActive ? vibrationData[vibrationData.length-1].toFixed(2) : '0.00';
        const dispCurrentEl = document.getElementById('displacementCurrent');
        const dispMaxEl = document.getElementById('displacementMax');
        const dispAvgEl = document.getElementById('displacementAvg');
        if (dispCurrentEl) dispCurrentEl.innerText = vibActive ? vibrationData[vibrationData.length-1].toFixed(2) : '--';
        if (dispMaxEl) dispMaxEl.innerText = vibActive ? Math.max(...vibrationData).toFixed(2) : '--';
        if (dispAvgEl) dispAvgEl.innerText = vibActive ? (vibrationData.reduce((a,b) => a+b, 0) / vibrationData.length).toFixed(2) : '--';

        const activeVals = vibrationData.filter(v => v > 0);
        if (activeVals.length > 0) {
            const vibCurrentEl = document.getElementById('vibrationCurrent');
            const vibMaxEl = document.getElementById('vibrationMax');
            const vibMinEl = document.getElementById('vibrationMin');
            const vibAvgEl = document.getElementById('vibrationAvg');
            if (vibCurrentEl) vibCurrentEl.innerText = vibrationData[vibrationData.length-1].toFixed(2);
            if (vibMaxEl) vibMaxEl.innerText = Math.max(...vibrationData).toFixed(2);
            if (vibMinEl) vibMinEl.innerText = Math.min(...vibrationData).toFixed(2);
            if (vibAvgEl) vibAvgEl.innerText = (vibrationData.reduce((a,b) => a+b, 0) / vibrationData.length).toFixed(2);
        }
    }, 1000);
}

// 更新限位轮卡片
function updateWheelCards(avg) {
    const upperWheelValue = document.getElementById('upperWheelValue');
    const lowerWheelValue = document.getElementById('lowerWheelValue');
    const upperPressureValue = document.getElementById('upperPressureValue');
    const lowerPressureValue = document.getElementById('lowerPressureValue');
    const upperWheelSpeed = document.getElementById('upperWheelSpeed');
    const lowerWheelSpeed = document.getElementById('lowerWheelSpeed');
    const leftRpmValue = document.getElementById('leftRpmValue');
    const rightRpmValue = document.getElementById('rightRpmValue');

    if (upperWheelValue) upperWheelValue.innerText = mapPressure(avg.upper_pressure).toFixed(2);
    if (lowerWheelValue) lowerWheelValue.innerText = mapPressure(avg.lower_pressure).toFixed(2);
    if (upperPressureValue) upperPressureValue.innerText = mapPressure(avg.upper_pressure).toFixed(2);
    if (lowerPressureValue) lowerPressureValue.innerText = mapPressure(avg.lower_pressure).toFixed(2);


    if (upperWheelSpeed) upperWheelSpeed.innerHTML = `${i18n[currentLang].rpm} <span>${avg.right_rpm.toFixed(1)} RPM</span>`;
    if (lowerWheelSpeed) lowerWheelSpeed.innerHTML = `${i18n[currentLang].rpm} <span>${avg.left_rpm.toFixed(1)} RPM</span>`;

    if (leftRpmValue) leftRpmValue.innerText = avg.left_rpm.toFixed(1);
    if (rightRpmValue) rightRpmValue.innerText = avg.right_rpm.toFixed(1);
}

// 更新所有图表
function updateCharts() {
    if (charts.vibration) {
        charts.vibration.setOption({
            xAxis: { data: timePoints },
            series: [{ data: vibrationData }]
        });
    }

    if (charts.pressureUpper) {
        charts.pressureUpper.setOption({ series: [{ data: upperPressureData }] });
    }
    if (charts.pressureLower) {
        charts.pressureLower.setOption({ series: [{ data: lowerPressureData }] });
    }
    if (charts.rpmUpper) {
        const data = rpmDisplayMode === 'value' ? leftRpmData : leftRpmVoltageData;
        charts.rpmUpper.setOption({ series: [{ data: data }] });
    }
    if (charts.rpmLower) {
        const data = rpmDisplayMode === 'value' ? rightRpmData : rightRpmVoltageData;
        charts.rpmLower.setOption({ series: [{ data: data }] });
    }

    if (charts.displacement) {
        charts.displacement.setOption({ series: [{ data: vibrationData }] });
    }

    for (let i = 1; i <= 4; i++) {
        if (charts[`motor${i}`]) {
            const dataArray = eval(`motor${i}Data`);
            charts[`motor${i}`].setOption({ series: [{ data: dataArray }] });
        }
    }
}

// 更新传感器页面图表
function updateSensorCharts() {
    const now = new Date();
    const timeStr = now.toLocaleTimeString('zh-CN', {
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });

    if (charts.pressureUpper || charts.pressureLower) {
        pressureChartData.upper.push(upperPressureData[upperPressureData.length-1]);
        pressureChartData.lower.push(lowerPressureData[lowerPressureData.length-1]);
        pressureChartData.timestamps.push(timeStr);

        if (pressureChartData.upper.length > maxDataPoints) {
            pressureChartData.upper.shift();
            pressureChartData.lower.shift();
            pressureChartData.timestamps.shift();
        }

        if (charts.pressureUpper) {
            charts.pressureUpper.setOption({
                xAxis: { data: pressureChartData.timestamps },
                series: [{ data: pressureChartData.upper }]
            });
        }
        if (charts.pressureLower) {
            charts.pressureLower.setOption({
                xAxis: { data: pressureChartData.timestamps },
                series: [{ data: pressureChartData.lower }]
            });
        }
    }

    if (charts.rpmUpper || charts.rpmLower) {
        rpmChartData.left.push(leftRpmData[leftRpmData.length-1]);
        rpmChartData.right.push(rightRpmData[rightRpmData.length-1]);
        rpmChartData.timestamps.push(timeStr);

        if (rpmChartData.left.length > maxDataPoints) {
            rpmChartData.left.shift();
            rpmChartData.right.shift();
            rpmChartData.timestamps.shift();
        }

        if (charts.rpmUpper) {
            charts.rpmUpper.setOption({
                xAxis: { data: rpmChartData.timestamps },
                series: [{ data: rpmChartData.left }]
            });
        }
        if (charts.rpmLower) {
            charts.rpmLower.setOption({
                xAxis: { data: rpmChartData.timestamps },
                series: [{ data: rpmChartData.right }]
            });
        }
    }

    motorChartData.timestamps.push(timeStr);
    if (motorChartData.timestamps.length > maxDataPoints) {
        motorChartData.timestamps.shift();
    }

    for (let i = 1; i <= 4; i++) {
        const motorData = eval(`motor${i}Data`);
        const currentVal = motorData[motorData.length-1];

        motorChartData[`motor${i}`].push(currentVal);
        if (motorChartData[`motor${i}`].length > maxDataPoints) {
            motorChartData[`motor${i}`].shift();
        }

        if (charts[`motor${i}`]) {
            charts[`motor${i}`].setOption({
                xAxis: { data: motorChartData.timestamps },
                series: [{ data: motorChartData[`motor${i}`] }]
            });
        }
    }
}

// ==================== 手动数据更新 ====================
function updateCoaxialChart() {
    const coaxialIn = parseFloat(document.getElementById('coaxialIn').value);
    const verticalOut = parseFloat(document.getElementById('verticalOut').value);

    if (isNaN(coaxialIn) || isNaN(verticalOut)) {
        showToast(i18n[currentLang].invalidInput, 'error');
        return;
    }

    const now = new Date();
    const timeStr = now.toLocaleTimeString('zh-CN', { hour12: false, hour: '2-digit', minute: '2-digit' });

    coaxialTimes.push(timeStr);
    coaxialData.push(coaxialIn);
    verticalData.push(verticalOut);

    if (coaxialTimes.length > 20) {
        coaxialTimes.shift();
        coaxialData.shift();
        verticalData.shift();
    }

    charts.coaxial.setOption({
        xAxis: { data: coaxialTimes },
        series: [{ data: coaxialData }, { data: verticalData }]
    });

    saveManualData({
        type: 'coaxial',
        coaxial_in: coaxialIn,
        vertical_out: verticalOut,
        timestamp: now.toISOString()
    });

    document.getElementById('coaxialIn').value = '';
    document.getElementById('verticalOut').value = '';
}

function updateRunoutChart() {
    const runout1 = parseFloat(document.getElementById('runout1').value);
    const runout2 = parseFloat(document.getElementById('runout2').value);
    const runout3 = parseFloat(document.getElementById('runout3').value);
    const runout4 = parseFloat(document.getElementById('runout4').value);

    if (isNaN(runout1) || isNaN(runout2) || isNaN(runout3) || isNaN(runout4)) {
        showToast(i18n[currentLang].invalidInput, 'error');
        return;
    }

    const now = new Date();
    const timeStr = now.toLocaleTimeString('zh-CN', { hour12: false, hour: '2-digit', minute: '2-digit' });

    runoutTimes.push(timeStr);
    runoutData[0].push(runout1);
    runoutData[1].push(runout2);
    runoutData[2].push(runout3);
    runoutData[3].push(runout4);

    if (runoutTimes.length > 20) {
        runoutTimes.shift();
        runoutData.forEach(arr => arr.shift());
    }

    charts.runout.setOption({
        xAxis: { data: runoutTimes },
        series: [
            { data: runoutData[0] },
            { data: runoutData[1] },
            { data: runoutData[2] },
            { data: runoutData[3] }
        ]
    });

    saveManualData({
        type: 'runout',
        runout_1: runout1,
        runout_2: runout2,
        runout_3: runout3,
        runout_4: runout4,
        timestamp: now.toISOString()
    });

    document.getElementById('runout1').value = '';
    document.getElementById('runout2').value = '';
    document.getElementById('runout3').value = '';
    document.getElementById('runout4').value = '';
}

// ==================== 数据保存 ====================
function saveBasicInfo() {
    const data = {
        customerName: document.getElementById('customerName').value,
        machineNo: document.getElementById('machineNo').value,
        orderNo: document.getElementById('orderNo').value,
        modelNo: document.getElementById('modelNo').value,
        type: 'basic_info',
        timestamp: new Date().toISOString()
    };
    saveManualData(data);
    showToast(i18n[currentLang].save + ' ' + i18n[currentLang].basicInfo, 'success');
}

function saveKeyIndicators() {
    const data = {
        environment_temp: parseFloat(document.getElementById('envTemp').value) || 0,
        contact_area: parseFloat(document.getElementById('contactArea').value) || 0,
        wheel_gap: parseFloat(document.getElementById('wheelGap').value) || 0,
        vibration_value: parseFloat(document.getElementById('vibrationVal').value) || 0,
        test_time: parseFloat(document.getElementById('testTime').value) || 0,
        type: 'key_indicators',
        timestamp: new Date().toISOString()
    };
    saveManualData(data);
    showToast(i18n[currentLang].save + ' ' + i18n[currentLang].keyIndicators, 'success');
}

function saveManualData(data) {
    fetch('/api/manual/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    }).catch(err => console.error('保存失败:', err));
}

// ==================== 数据加载 ====================
function loadSavedData() {
    fetch('/api/history/coaxial?limit=20')
        .then(res => res.json())
        .then(data => {
            if (data && data.length) {
                coaxialTimes = data.map(d => {
                    const date = new Date(d.timestamp);
                    return `${date.getHours()}:${date.getMinutes()}`;
                });
                coaxialData = data.map(d => d.coaxial_in || 0);
                verticalData = data.map(d => d.vertical_out || 0);
                if (charts.coaxial) {
                    charts.coaxial.setOption({
                        xAxis: { data: coaxialTimes },
                        series: [{ data: coaxialData }, { data: verticalData }]
                    });
                }
            }
        })
        .catch(err => console.log('无历史同轴度数据'));

    fetch('/api/history/runout?limit=20')
        .then(res => res.json())
        .then(data => {
            if (data && data.length) {
                runoutTimes = data.map(d => {
                    const date = new Date(d.timestamp);
                    return `${date.getHours()}:${date.getMinutes()}`;
                });
                runoutData = [
                    data.map(d => d.runout_1 || 0),
                    data.map(d => d.runout_2 || 0),
                    data.map(d => d.runout_3 || 0),
                    data.map(d => d.runout_4 || 0)
                ];
                if (charts.runout) {
                    charts.runout.setOption({
                        xAxis: { data: runoutTimes },
                        series: [
                            { data: runoutData[0] },
                            { data: runoutData[1] },
                            { data: runoutData[2] },
                            { data: runoutData[3] }
                        ]
                    });
                }
            }
        })
        .catch(err => console.log('无历史跳动度数据'));
}

function loadInitialData() {
    fetch('/api/status')
        .then(res => res.json())
        .then(data => {
            systemStatus = data;
            updateSystemStatus();
        })
        .catch(err => console.log('获取状态失败'));

    fetch('/api/config/basic')
        .then(res => res.json())
        .then(data => {
            if (data.success && data.data) {
                // 导航栏
                const navCustomer = document.getElementById('navCustomerName');
                const navMachine = document.getElementById('navMachineNo');
                const navOrder = document.getElementById('navOrderNo');
                const navModel = document.getElementById('navModelNo');
                if (navCustomer) navCustomer.innerText = data.data.customerName || '';
                if (navMachine) navMachine.innerText = data.data.machineNo || '';
                if (navOrder) navOrder.innerText = data.data.orderNo || '';
                if (navModel) navModel.innerText = data.data.modelNo || '';

                // 设置页面输入框
                const setCust = document.getElementById('settingsCustomerName');
                const setMachine = document.getElementById('settingsMachineNo');
                const setOrder = document.getElementById('settingsOrderNo');
                const setModel = document.getElementById('settingsModelNo');
                if (setCust) setCust.value = data.data.customerName || '';
                if (setMachine) setMachine.value = data.data.machineNo || '';
                if (setOrder) setOrder.value = data.data.orderNo || '';
                if (setModel) setModel.value = data.data.modelNo || '';
            }
        })
        .catch(err => console.error('加载基本信息失败:', err));

    fetch('/api/config/indicators')
        .then(res => res.json())
        .then(data => {
            if (data.success && data.data) {
                // 图表页面输入框
                const envTemp = document.getElementById('chartsEnvTemp');
                const contactArea = document.getElementById('chartsContactArea');
                const wheelGap = document.getElementById('chartsWheelGap');
                const vibrationVal = document.getElementById('chartsVibrationVal');
                const testTime = document.getElementById('chartsTestTime');
                if (envTemp) envTemp.value = data.data.environment_temp || 0;
                if (contactArea) contactArea.value = data.data.contact_area || 0;
                if (wheelGap) wheelGap.value = data.data.wheel_gap || 0;
                if (vibrationVal) vibrationVal.value = data.data.vibration_value || 0;
                if (testTime) testTime.value = data.data.test_time || 0;
            }
        })
        .catch(err => console.error('加载关键指标失败:', err));

    loadHealthConfig();
    loadPortConfig();
    loadPressureConfig();
    loadLineWidthConfig();
    loadLanguageConfig();  // 新增

}


function loadHealthConfig() {
    fetch('/api/config/health')
        .then(res => res.json())
        .then(data => {
            if (data.success && data.data) {
                document.getElementById('upperPreloadPressure').value = data.data.upperPreloadPressure || 2.0;
                document.getElementById('upperCriticalPressure').value = data.data.upperCriticalPressure || 3.5;
                document.getElementById('lowerPreloadPressure').value = data.data.lowerPreloadPressure || 2.0;
                document.getElementById('lowerCriticalPressure').value = data.data.lowerCriticalPressure || 3.5;
                document.getElementById('healthCycle').value = data.data.cycleSeconds || 60;
                document.getElementById('initialDisplacementInput').value = data.data.initialDisplacement || 0.0;

                upperPreloadPressure = parseFloat(data.data.upperPreloadPressure) || 2.0;
                upperCriticalPressure = parseFloat(data.data.upperCriticalPressure) || 3.5;
                lowerPreloadPressure = parseFloat(data.data.lowerPreloadPressure) || 2.0;
                lowerCriticalPressure = parseFloat(data.data.lowerCriticalPressure) || 3.5;
                cycleSeconds = parseInt(data.data.cycleSeconds) || 60;
                initialDisplacement = parseFloat(data.data.initialDisplacement) || 0.0;

                updateHealthParamDisplay();
            }
        })
        .catch(err => console.error('加载健康度配置失败:', err));
}


function loadPortConfig() {
    fetch('/api/config/ports')
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                const device = document.getElementById('portDevice');
                const aiChannels = document.getElementById('portAiChannels');
                const counter1 = document.getElementById('portCounter1');
                const counter2 = document.getElementById('portCounter2');
                const freqMin = document.getElementById('portFreqMin');
                const freqMax = document.getElementById('portFreqMax');
                const pulsesPerRev = document.getElementById('portPulsesPerRev');
                if (device) device.value = data.data.device || 'Dev1';
                if (aiChannels) aiChannels.value = data.data.ai_channels || 'ai2:9';
                if (counter1) counter1.value = data.data.counter1 || 'ctr0';
                if (counter2) counter2.value = data.data.counter2 || 'ctr1';
                if (freqMin) freqMin.value = data.data.freq_min || 0.1;
                if (freqMax) freqMax.value = data.data.freq_max || 1000.0;
                if (pulsesPerRev) pulsesPerRev.value = data.data.pulses_per_rev || 1;
            }
        })
        .catch(err => console.error('加载端口配置失败:', err));
}

function updateHealthParamDisplay() {
    const upperPreloadSpan = document.getElementById('healthDisplayUpperPreload');
    const upperCriticalSpan = document.getElementById('healthDisplayUpperCritical');
    const lowerPreloadSpan = document.getElementById('healthDisplayLowerPreload');
    const lowerCriticalSpan = document.getElementById('healthDisplayLowerCritical');
    const cycleSpan = document.getElementById('healthDisplayCycle');
    const initDispSpan = document.getElementById('healthDisplayInitialDisplacement');

    // 预紧力、周期、初始位移始终显示设置值
    if (upperPreloadSpan) upperPreloadSpan.innerText = mapPressure(upperPreloadPressure).toFixed(1);
    if (lowerPreloadSpan) lowerPreloadSpan.innerText = mapPressure(lowerPreloadPressure).toFixed(1);
    if (cycleSpan) cycleSpan.innerText = cycleSeconds;
    if (initDispSpan) initDispSpan.innerText = initialDisplacement.toFixed(1); // 一位小数

    // 临界压力：有动态临界值则显示它，否则显示设置值
    if (upperCriticalSpan) {
        upperCriticalSpan.innerText = upperCriticalAvg !== null 
            ? mapPressure(upperCriticalAvg).toFixed(1) 
            : mapPressure(upperCriticalPressure).toFixed(1);
    }
    if (lowerCriticalSpan) {
        lowerCriticalSpan.innerText = lowerCriticalAvg !== null 
            ? mapPressure(lowerCriticalAvg).toFixed(1) 
            : mapPressure(lowerCriticalPressure).toFixed(1);
    }
}
// ==================== 保存健康度配置 ====================
// 保存健康度配置（需修改后端接口）
function saveHealthConfig() {
    const config = {
        upperPreloadPressure: parseFloat(document.getElementById('upperPreloadPressure').value) || 2.0,
        upperCriticalPressure: parseFloat(document.getElementById('upperCriticalPressure').value) || 3.5,
        lowerPreloadPressure: parseFloat(document.getElementById('lowerPreloadPressure').value) || 2.0,
        lowerCriticalPressure: parseFloat(document.getElementById('lowerCriticalPressure').value) || 3.5,
        cycleSeconds: parseInt(document.getElementById('healthCycle').value) || 60,
        initialDisplacement: parseFloat(document.getElementById('initialDisplacementInput').value) || 0.0
    };
    fetch('/api/config/health/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            showToast(i18n[currentLang].save + ' ' + i18n[currentLang].healthParams, 'success');
            upperPreloadPressure = config.upperPreloadPressure;
            upperCriticalPressure = config.upperCriticalPressure;
            lowerPreloadPressure = config.lowerPreloadPressure;
            lowerCriticalPressure = config.lowerCriticalPressure;
            cycleSeconds = config.cycleSeconds;
            initialDisplacement = config.initialDisplacement;
            resetCycleAccumulators();
            updateHealthParamDisplay();
        } else {
            showToast(i18n[currentLang].save + ' ' + i18n[currentLang].failed + ': ' + (data.error || ''), 'error');
        }
    })
    .catch(err => {
        console.error('保存健康度配置失败:', err);
        showToast(i18n[currentLang].save + ' ' + i18n[currentLang].failed, 'error');
    });
}

// ==================== 保存端口配置 ====================
function savePortConfig() {
    const config = {
        device: document.getElementById('portDevice').value,
        ai_channels: document.getElementById('portAiChannels').value,
        counter1: document.getElementById('portCounter1').value,
        counter2: document.getElementById('portCounter2').value,
        freq_min: parseFloat(document.getElementById('portFreqMin').value),
        freq_max: parseFloat(document.getElementById('portFreqMax').value),
        pulses_per_rev: parseInt(document.getElementById('portPulsesPerRev').value)
    };
    fetch('/api/config/ports/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            showToast(i18n[currentLang].save + ' ' + i18n[currentLang].portConfig, 'success');
        } else {
            showToast(i18n[currentLang].save + ' ' + i18n[currentLang].failed + ': ' + data.error, 'error');
        }
    })
    .catch(err => showToast(i18n[currentLang].save + ' ' + i18n[currentLang].failed, 'error'));
}

// ==================== 控制函数 ====================
function startCollection() {
    fetch('/api/control/start', { method: 'POST' })
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                systemStatus.collecting = true;
                systemStatus.status_type = 'collecting';
                systemStatus.status_text = i18n[currentLang].statusCollecting;
                updateSystemStatus();
                document.getElementById('startBtn').disabled = true;
                document.getElementById('saveBtn').disabled = false;
                document.getElementById('stopBtn').disabled = false;

                setDefaultValues();

                showToast('✅ ' + i18n[currentLang].start + ' - ' + i18n[currentLang].statusCollecting, 'success');
            } else {
                showToast('❌ ' + i18n[currentLang].start + ' ' + i18n[currentLang].failed + ': ' + data.message, 'error');
                setDefaultValues();
            }
        })
        .catch(err => {
            console.error('开始检测失败:', err);
            setDefaultValues();
            showToast('⚠️ ' + i18n[currentLang].start + ' ' + i18n[currentLang].failed, 'warning');
        });
}

function setDefaultValues() {
    const motorDefaults = [5.2, 5.1, 5.3, 5.0];
    for (let i = 1; i <= 4; i++) {
        const currentEl = document.getElementById(`motor${i}Current`);
        const maxEl = document.getElementById(`motor${i}Max`);
        const avgEl = document.getElementById(`motor${i}Avg`);
        if (currentEl) currentEl.innerText = motorDefaults[i-1].toFixed(1);
        if (maxEl) maxEl.innerText = (motorDefaults[i-1] + 1.5).toFixed(1);
        if (avgEl) avgEl.innerText = motorDefaults[i-1].toFixed(1);

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
    if (upperStatus) {
        upperStatus.className = 'sensor-badge disconnected';
        upperStatus.innerText = i18n[currentLang].disconnected;
    }
    if (lowerStatus) {
        lowerStatus.className = 'sensor-badge disconnected';
        lowerStatus.innerText = i18n[currentLang].disconnected;
    }

    const leftRpmValue = document.getElementById('leftRpmValue');
    const rightRpmValue = document.getElementById('rightRpmValue');
    if (leftRpmValue) leftRpmValue.innerText = '1452';
    if (rightRpmValue) rightRpmValue.innerText = '1438';

    const leftStatus = document.getElementById('leftRpmStatus');
    const rightStatus = document.getElementById('rightRpmStatus');
    if (leftStatus) {
        leftStatus.className = 'sensor-badge disconnected';
        leftStatus.innerText = i18n[currentLang].disconnected;
    }
    if (rightStatus) {
        rightStatus.className = 'sensor-badge disconnected';
        rightStatus.innerText = i18n[currentLang].disconnected;
    }

    const dispValue = document.getElementById('displacementValue');
    const dispStatus = document.getElementById('displacementStatus');
    const vibStatus = document.getElementById('vibrationStatus');
    if (dispValue) dispValue.innerText = '1.25';
    if (dispStatus) {
        dispStatus.className = 'sensor-badge disconnected';
        dispStatus.innerText = i18n[currentLang].disconnected;
    }
    if (vibStatus) {
        vibStatus.className = 'sensor-badge disconnected';
        vibStatus.innerText = i18n[currentLang].disconnected;
    }

    const vibCurrent = document.getElementById('vibrationCurrent');
    const vibMax = document.getElementById('vibrationMax');
    const vibMin = document.getElementById('vibrationMin');
    const vibAvg = document.getElementById('vibrationAvg');
    if (vibCurrent) vibCurrent.innerText = '0.18';
    if (vibMax) vibMax.innerText = '0.25';
    if (vibMin) vibMin.innerText = '0.12';
    if (vibAvg) vibAvg.innerText = '0.18';

    for (let i = 1; i <= 4; i++) {
        const dataArray = eval(`motor${i}Data`);
        dataArray.fill(0);
        dataArray[dataArray.length-1] = motorDefaults[i-1];
    }

    vibrationData.fill(0);
    vibrationData[vibrationData.length-1] = 1.25;

    updateCharts();
}

function browseFile() {
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.csv,.txt,.json';
    fileInput.style.display = 'none';
    document.body.appendChild(fileInput);

    fileInput.onchange = function(e) {
        const file = e.target.files[0];
        if (file) {
            document.getElementById('savePath').value = file.name;
            localStorage.setItem('selectedFile', file.name);
            showToast(i18n[currentLang].browse + ': ' + file.name, 'success');
        }
        document.body.removeChild(fileInput);
    };

    fileInput.click();
}

// ==================== 流式文件读取（带内存控制） ====================
function loadFileData() {
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.csv';
    fileInput.style.display = 'none';
    document.body.appendChild(fileInput);

    fileInput.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) {
            document.body.removeChild(fileInput);
            return;
        }

        showProgress(0, i18n[currentLang].preparing + ': ' + file.name);
        fileDataPlaying = false;
        if (filePlaybackInterval) clearInterval(filePlaybackInterval);
        fileDataQueue = [];
        pendingChunks = [];
        fileTotalPoints = 0;
        isWorkerProcessing = true;
        fileAllChunksReceived = false;
        fileCurrentChunkIndex = 0;
        fileCurrentDataIndex = 0;

        const CHUNK_SIZE = 1024 * 1024; // 1MB
        const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
        let chunksProcessed = 0;

        if (fileWorker) fileWorker.terminate();
        fileWorker = new Worker('/static/js/file-worker.js');

        fileWorker.onmessage = (msg) => {
            if (msg.data.success) {
                const { data, isLast } = msg.data;
                const points = data.points;
                if (points.length > 0) {
                    pendingChunks.push(points);
                    fileTotalPoints += points.length;

                    if (!fileDataPlaying && fileDataQueue.length === 0 && pendingChunks.length > 0) {
                        fileDataQueue.push(pendingChunks.shift());
                        startChunkedPlayback();
                    }
                }
                if (isLast) {
                    fileAllChunksReceived = true;
                    isWorkerProcessing = false;
                    showProgress(100, i18n[currentLang].fileLoaded + `，共 ${fileTotalPoints} 条记录`);
                } else {
                    chunksProcessed++;
                    const percent = Math.floor((chunksProcessed / totalChunks) * 100);
                    showProgress(percent, i18n[currentLang].parsing + ` ${chunksProcessed}/${totalChunks} ` + i18n[currentLang].chunks);
                }
            } else {
                showToast(i18n[currentLang].parseError + ': ' + msg.data.error, 'error');
                isWorkerProcessing = false;
                hideProgress();
            }
        };

        let offset = 0;
        while (offset < file.size) {
            while (pendingChunks.length >= MAX_PENDING_CHUNKS) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
            const blob = file.slice(offset, offset + CHUNK_SIZE);
            const text = await blob.text();
            fileWorker.postMessage({
                chunk: text,
                filename: file.name,
                startLine: 0,
                isLast: offset + CHUNK_SIZE >= file.size
            });
            offset += CHUNK_SIZE;
        }
        document.body.removeChild(fileInput);

        console.log('文件加载完成，总数据点数:', fileTotalPoints, '待处理块数:', pendingChunks.length);
    };

    fileInput.click();
}

function resetDisplayData() {
    console.log('[RESET] 重置所有数据数组为0');
    vibrationData.fill(0);
    motor1Data.fill(0);
    motor2Data.fill(0);
    motor3Data.fill(0);
    motor4Data.fill(0);
    upperPressureData.fill(0);
    lowerPressureData.fill(0);
    leftRpmData.fill(0);
    rightRpmData.fill(0);
    leftRpmVoltageData.fill(0);
    rightRpmVoltageData.fill(0);

    resetCycleAccumulators();
    updateCharts();
}

function startChunkedPlayback() {
    if (filePlaybackInterval) clearInterval(filePlaybackInterval);
    if (fileDataQueue.length === 0) {
        return;
    }

    fileDataPlaying = true;
    fileCurrentChunkIndex = 0;
    fileCurrentDataIndex = 0;

    const firstPoint = getCurrentQueuePoint();
    if (firstPoint) {
        fileCurrentSecond = Math.floor(firstPoint.timestamp);
    } else {
        fileCurrentSecond = 0;
    }

    console.log('开始播放，总点数:', fileTotalPoints, '第一个点:', firstPoint);

    systemStatus.collecting = true;
    systemStatus.status_type = 'collecting';
    systemStatus.status_text = i18n[currentLang].playingFile || '文件播放中...';
    updateSystemStatus();

    document.getElementById('startBtn').disabled = true;
    document.getElementById('saveBtn').disabled = false;
    document.getElementById('stopBtn').disabled = false;

    showToast(i18n[currentLang].startPlay + `，共 ${fileTotalPoints} 条记录`, 'success');

    filePlaybackInterval = setInterval(() => {
        if (!fileDataPlaying) return;
        const hasMore = processNextSecondFromQueue();
        if (!hasMore) {
            stopFilePlayback();
        }
    }, 1000);
}

function getCurrentQueuePoint() {
    if (fileDataQueue.length === 0) return null;
    const chunk = fileDataQueue[fileCurrentChunkIndex];
    if (!chunk || fileCurrentDataIndex >= chunk.length) return null;
    return chunk[fileCurrentDataIndex];
}

function advanceQueuePointer() {
    fileCurrentDataIndex++;
    if (fileCurrentDataIndex >= fileDataQueue[fileCurrentChunkIndex].length) {
        fileDataQueue.shift();
        fileCurrentChunkIndex = 0;
        fileCurrentDataIndex = 0;
    }
}

function processNextSecondFromQueue() {
    if (fileDataQueue.length === 0) {
        if (pendingChunks.length > 0) {
            fileDataQueue.push(pendingChunks.shift());
            fileCurrentChunkIndex = 0;
            fileCurrentDataIndex = 0;
            return true;
        } else {
            if (!fileAllChunksReceived) {
                return true;
            } else {
                return false;
            }
        }
    }

    let point = getCurrentQueuePoint();
    if (!point) {
        advanceQueuePointer();
        return true;
    }

    let pointSec = Math.floor(point.timestamp);

    if (pointSec > fileCurrentSecond) {
        updateDisplayWithSecondAverage(null);
        fileCurrentSecond = pointSec;
        return true;
    }

    if (pointSec < fileCurrentSecond) {
        advanceQueuePointer();
        return true;
    }

    let pointsInSecond = [];
    while (true) {
        point = getCurrentQueuePoint();
        if (!point) break;
        if (Math.floor(point.timestamp) === fileCurrentSecond) {
            pointsInSecond.push(point);
            advanceQueuePointer();
        } else {
            break;
        }
    }

    if (pointsInSecond.length > 0) {
        const avg = {
            upper_pressure: pointsInSecond.reduce((s, p) => s + p.upper_pressure, 0) / pointsInSecond.length,
            lower_pressure: pointsInSecond.reduce((s, p) => s + p.lower_pressure, 0) / pointsInSecond.length,
            left_rpm: pointsInSecond.reduce((s, p) => s + p.left_rpm, 0) / pointsInSecond.length,
            right_rpm: pointsInSecond.reduce((s, p) => s + p.right_rpm, 0) / pointsInSecond.length,
            eddy_current: pointsInSecond.reduce((s, p) => s + p.eddy_current, 0) / pointsInSecond.length,
            motor1: pointsInSecond.reduce((s, p) => s + p.motor1, 0) / pointsInSecond.length,
            motor2: pointsInSecond.reduce((s, p) => s + p.motor2, 0) / pointsInSecond.length,
            motor3: pointsInSecond.reduce((s, p) => s + p.motor3, 0) / pointsInSecond.length,
            motor4: pointsInSecond.reduce((s, p) => s + p.motor4, 0) / pointsInSecond.length
        };
        console.log(`秒 ${fileCurrentSecond} 处理了 ${pointsInSecond.length} 个点，平均值:`, avg);
        updateDisplayWithSecondAverage(avg);
    } else {
        updateDisplayWithSecondAverage(null);
    }

    fileCurrentSecond++;

    const processedTotal = (fileTotalPoints - (fileDataQueue.flat().length + pendingChunks.flat().length));
    const percent = fileTotalPoints > 0 ? Math.min(99, Math.floor((processedTotal / fileTotalPoints) * 100)) : 0;
    showProgress(percent, i18n[currentLang].playing + `: ${processedTotal}/${fileTotalPoints} (${i18n[currentLang].chunk} ${fileCurrentChunkIndex + 1}/${fileDataQueue.length + pendingChunks.length})`);

    while (pendingChunks.length > 0 && fileDataQueue.length < MAX_MAIN_QUEUE_CHUNKS) {
        fileDataQueue.push(pendingChunks.shift());
    }

    return (fileDataQueue.length > 0 || pendingChunks.length > 0 || !fileAllChunksReceived);
}

function updateDisplayWithSecondAverage(avg) {
    console.log('[UPDATE] 收到更新请求, avg=', avg);

    if (avg) {
        console.log('[UPDATE] 使用真实/保持值更新图表');
        upperPressureData.shift(); upperPressureData.push(avg.upper_pressure);
        lowerPressureData.shift(); lowerPressureData.push(avg.lower_pressure);
        leftRpmData.shift(); leftRpmData.push(avg.left_rpm);
        rightRpmData.shift(); rightRpmData.push(avg.right_rpm);
        vibrationData.shift(); vibrationData.push(avg.eddy_current);
        motor1Data.shift(); motor1Data.push(avg.motor1);
        motor2Data.shift(); motor2Data.push(avg.motor2);
        motor3Data.shift(); motor3Data.push(avg.motor3);
        motor4Data.shift(); motor4Data.push(avg.motor4);

        // 周期累积
        currentCycleUpperSum += avg.upper_pressure;
        currentCycleUpperCount++;
        currentCycleMinUpper = Math.min(currentCycleMinUpper, avg.upper_pressure);
        currentCycleLowerSum += avg.lower_pressure;
        currentCycleLowerCount++;
        currentCycleMinLower = Math.min(currentCycleMinLower, avg.lower_pressure);

    if (currentCycleUpperCount >= cycleSeconds) {
        lastCycleUpperAvg = currentCycleUpperSum / currentCycleUpperCount;
        const currentHasBelow = currentCycleMinUpper < upperPreloadPressure;

        // 临界点检测（使用上轮临界压力）
        if (prevUpperHasBelowPreload !== null) {
            if (prevUpperHasBelowPreload && !currentHasBelow) {
                if (upperCriticalAvg === null) {
                    upperCriticalAvg = lastCycleUpperAvg;
                    console.log('上限位轮临界点找到（向上跨越）于周期', cycleCount+1, ':', upperCriticalAvg);
                }
            } else if (!prevUpperHasBelowPreload && currentHasBelow) {
                if (upperCriticalAvg === null) {
                    upperCriticalAvg = lastCycleUpperAvg;
                    console.log('上限位轮临界点找到（向下跨越）于周期', cycleCount+1, ':', upperCriticalAvg);
                }
            }
        }
        prevUpperHasBelowPreload = currentHasBelow;

        const timestamp = new Date().toLocaleTimeString();
        cycleTimes.push(timestamp);
        upperCycleAvgHistory.push(lastCycleUpperAvg);
        upperCycleMinHistory.push(currentCycleMinUpper);
        // 下限数据用上一次的值填充（若没有则用0）
        if (lowerCycleAvgHistory.length > 0) {
            lowerCycleAvgHistory.push(lowerCycleAvgHistory[lowerCycleAvgHistory.length-1]);
            lowerCycleMinHistory.push(lowerCycleMinHistory[lowerCycleMinHistory.length-1]);
        } else {
            lowerCycleAvgHistory.push(0);
            lowerCycleMinHistory.push(0);
        }

        // 限长
        if (cycleTimes.length > 50) {
            cycleTimes.shift();
            upperCycleAvgHistory.shift();
            upperCycleMinHistory.shift();
            lowerCycleAvgHistory.shift();
            lowerCycleMinHistory.shift();
        }

        console.log(`[CYCLE] 上限位轮周期完成: 平均=${lastCycleUpperAvg.toFixed(3)}, 最低=${currentCycleMinUpper.toFixed(3)}`);

        currentCycleUpperSum = 0;
        currentCycleUpperCount = 0;
        currentCycleMinUpper = Infinity;
    }

    if (currentCycleLowerCount >= cycleSeconds) {
        lastCycleLowerAvg = currentCycleLowerSum / currentCycleLowerCount;
        const currentHasBelow = currentCycleMinLower < lowerPreloadPressure;

        if (prevLowerHasBelowPreload !== null) {
            if (prevLowerHasBelowPreload && !currentHasBelow) {
                if (lowerCriticalAvg === null) {
                    lowerCriticalAvg = lastCycleLowerAvg;
                    console.log('下限位轮临界点找到（向上跨越）于周期', cycleCount+1, ':', lowerCriticalAvg);
                }
            } else if (!prevLowerHasBelowPreload && currentHasBelow) {
                if (lowerCriticalAvg === null) {
                    lowerCriticalAvg = lastCycleLowerAvg;
                    console.log('下限位轮临界点找到（向下跨越）于周期', cycleCount+1, ':', lowerCriticalAvg);
                }
            }
        }
        prevLowerHasBelowPreload = currentHasBelow;

        const timestamp = new Date().toLocaleTimeString();
        cycleTimes.push(timestamp);
        lowerCycleAvgHistory.push(lastCycleLowerAvg);
        lowerCycleMinHistory.push(currentCycleMinLower);
        // 上限数据用上一次的值填充
        if (upperCycleAvgHistory.length > 0) {
            upperCycleAvgHistory.push(upperCycleAvgHistory[upperCycleAvgHistory.length-1]);
            upperCycleMinHistory.push(upperCycleMinHistory[upperCycleMinHistory.length-1]);
        } else {
            upperCycleAvgHistory.push(0);
            upperCycleMinHistory.push(0);
        }

        if (cycleTimes.length > 50) {
            cycleTimes.shift();
            upperCycleAvgHistory.shift();
            upperCycleMinHistory.shift();
            lowerCycleAvgHistory.shift();
            lowerCycleMinHistory.shift();
        }

        console.log(`[CYCLE] 下限位轮周期完成: 平均=${lastCycleLowerAvg.toFixed(3)}, 最低=${currentCycleMinLower.toFixed(3)}`);

        currentCycleLowerSum = 0;
        currentCycleLowerCount = 0;
        currentCycleMinLower = Infinity;
    }
    
        if (currentCycleUpperCount === 0 || currentCycleLowerCount === 0) {
            cycleCount++;
        }

        // 更新传感器状态（电机、压力、转速、位移）
        // 电机
        for (let i = 1; i <= 4; i++) {
            const motorVal = avg[`motor${i}`];
            const active = motorVal > 0.1; // 阈值可根据需要调整
            sensorData[`motor${i}`] = sensorData[`motor${i}`] || { active: false, value: 0 };
            sensorData[`motor${i}`].active = active;
            sensorData[`motor${i}`].value = motorVal;

            const currentEl = document.getElementById(`motor${i}Current`);
            const maxEl = document.getElementById(`motor${i}Max`);
            const avgEl = document.getElementById(`motor${i}Avg`);
            const dataArray = eval(`motor${i}Data`);
            if (currentEl) currentEl.innerText = active ? motorVal.toFixed(1) : '--';
            if (maxEl) maxEl.innerText = active ? Math.max(...dataArray).toFixed(1) : '--';
            if (avgEl) avgEl.innerText = active ? (dataArray.reduce((a,b) => a+b, 0) / dataArray.length).toFixed(1) : '--';

            const badge = document.getElementById(`motor${i}Status`);
            if (badge) {
                badge.className = `sensor-badge ${active ? 'connected' : 'disconnected'}`;
                badge.innerText = active ? i18n[currentLang].connected : i18n[currentLang].disconnected;
            }
        }

        // 压力传感器状态
        const upperActive = avg.upper_pressure > 0.1;
        const lowerActive = avg.lower_pressure > 0.1;
        sensorData.upper_pressure = sensorData.upper_pressure || { active: false, value: 0, voltage: 0 };
        sensorData.lower_pressure = sensorData.lower_pressure || { active: false, value: 0, voltage: 0 };
        sensorData.upper_pressure.active = upperActive;
        sensorData.upper_pressure.value = avg.upper_pressure;
        sensorData.lower_pressure.active = lowerActive;
        sensorData.lower_pressure.value = avg.lower_pressure;

        const upperStatusEl = document.getElementById('upperPressureStatus');
        const lowerStatusEl = document.getElementById('lowerPressureStatus');
        if (upperStatusEl) {
            upperStatusEl.className = `sensor-badge ${upperActive ? 'connected' : 'disconnected'}`;
            upperStatusEl.innerText = upperActive ? i18n[currentLang].connected : i18n[currentLang].disconnected;
        }
        if (lowerStatusEl) {
            lowerStatusEl.className = `sensor-badge ${lowerActive ? 'connected' : 'disconnected'}`;
            lowerStatusEl.innerText = lowerActive ? i18n[currentLang].connected : i18n[currentLang].disconnected;
        }

        // 转速传感器状态
        const leftActive = avg.left_rpm > 0.1;
        const rightActive = avg.right_rpm > 0.1;
        sensorData.left_rpm = sensorData.left_rpm || { active: false, value: 0, voltage: 0 };
        sensorData.right_rpm = sensorData.right_rpm || { active: false, value: 0, voltage: 0 };
        sensorData.left_rpm.active = leftActive;
        sensorData.left_rpm.value = avg.left_rpm;
        sensorData.right_rpm.active = rightActive;
        sensorData.right_rpm.value = avg.right_rpm;

        const leftStatusEl = document.getElementById('leftRpmStatus');
        const rightStatusEl = document.getElementById('rightRpmStatus');
        if (leftStatusEl) {
            leftStatusEl.className = `sensor-badge ${leftActive ? 'connected' : 'disconnected'}`;
            leftStatusEl.innerText = leftActive ? i18n[currentLang].connected : i18n[currentLang].disconnected;
        }
        if (rightStatusEl) {
            rightStatusEl.className = `sensor-badge ${rightActive ? 'connected' : 'disconnected'}`;
            rightStatusEl.innerText = rightActive ? i18n[currentLang].connected : i18n[currentLang].disconnected;
        }

        // 位移传感器状态与统计
        const vibActive = avg.eddy_current > 0.1;
        sensorData.eddy_current = sensorData.eddy_current || { active: false, value: 0, voltage: 0 };
        sensorData.eddy_current.active = vibActive;
        sensorData.eddy_current.value = avg.eddy_current;

        const dispStatusEl = document.getElementById('displacementStatus');
        if (dispStatusEl) {
            dispStatusEl.className = `sensor-badge ${vibActive ? 'connected' : 'disconnected'}`;
            dispStatusEl.innerText = vibActive ? i18n[currentLang].connected : i18n[currentLang].disconnected;
        }
        const dispValueEl = document.getElementById('displacementValue');
        if (dispValueEl) dispValueEl.innerText = vibActive ? vibrationData[vibrationData.length-1].toFixed(2) : '0.00';
        const dispCurrentEl = document.getElementById('displacementCurrent');
        const dispMaxEl = document.getElementById('displacementMax');
        const dispAvgEl = document.getElementById('displacementAvg');
        if (dispCurrentEl) dispCurrentEl.innerText = vibActive ? vibrationData[vibrationData.length-1].toFixed(2) : '--';
        if (dispMaxEl) dispMaxEl.innerText = vibActive ? Math.max(...vibrationData).toFixed(2) : '--';
        if (dispAvgEl) dispAvgEl.innerText = vibActive ? (vibrationData.reduce((a,b) => a+b, 0) / vibrationData.length).toFixed(2) : '--';

        const activeVals = vibrationData.filter(v => v > 0);
        if (activeVals.length > 0) {
            const vibCurrentEl = document.getElementById('vibrationCurrent');
            const vibMaxEl = document.getElementById('vibrationMax');
            const vibMinEl = document.getElementById('vibrationMin');
            const vibAvgEl = document.getElementById('vibrationAvg');
            if (vibCurrentEl) vibCurrentEl.innerText = vibrationData[vibrationData.length-1].toFixed(2);
            if (vibMaxEl) vibMaxEl.innerText = Math.max(...vibrationData).toFixed(2);
            if (vibMinEl) vibMinEl.innerText = Math.min(...vibrationData).toFixed(2);
            if (vibAvgEl) vibAvgEl.innerText = (vibrationData.reduce((a,b) => a+b, 0) / vibrationData.length).toFixed(2);
        }

        updateWheelCards(avg);
        updateCharts();
        updateHealthParamDisplay(); // 根据最新转速更新显示参数
        updateDisplacementIndicator(avg);
        updateHealth();
        updateSensorCharts();
        updateFaultKeyChart();
        
    } else {
        console.log('[UPDATE] 收到 null，推入0值');
        upperPressureData.shift(); upperPressureData.push(0);
        lowerPressureData.shift(); lowerPressureData.push(0);
        leftRpmData.shift(); leftRpmData.push(0);
        rightRpmData.shift(); rightRpmData.push(0);
        vibrationData.shift(); vibrationData.push(0);
        motor1Data.shift(); motor1Data.push(0);
        motor2Data.shift(); motor2Data.push(0);
        motor3Data.shift(); motor3Data.push(0);
        motor4Data.shift(); motor4Data.push(0);

        currentCycleUpperSum += 0;
        currentCycleUpperCount++;
        currentCycleMinUpper = Math.min(currentCycleMinUpper, 0);
        currentCycleLowerSum += 0;
        currentCycleLowerCount++;
        currentCycleMinLower = Math.min(currentCycleMinLower, 0);

        if (currentCycleUpperCount >= cycleSeconds) {
            lastCycleUpperAvg = currentCycleUpperSum / currentCycleUpperCount;
            const currentHasBelow = currentCycleMinUpper < preloadPressure;
            if (prevUpperHasBelowPreload !== null) {
                if (prevUpperHasBelowPreload && !currentHasBelow) {
                    if (upperCriticalAvg === null) upperCriticalAvg = lastCycleUpperAvg;
                } else if (!prevUpperHasBelowPreload && currentHasBelow) {
                    if (upperCriticalAvg === null) upperCriticalAvg = lastCycleUpperAvg;
                }
            }
            prevUpperHasBelowPreload = currentHasBelow;
            currentCycleUpperSum = 0; currentCycleUpperCount = 0; currentCycleMinUpper = Infinity;
        }
        if (currentCycleLowerCount >= cycleSeconds) {
            lastCycleLowerAvg = currentCycleLowerSum / currentCycleLowerCount;
            const currentHasBelow = currentCycleMinLower < preloadPressure;
            if (prevLowerHasBelowPreload !== null) {
                if (prevLowerHasBelowPreload && !currentHasBelow) {
                    if (lowerCriticalAvg === null) lowerCriticalAvg = lastCycleLowerAvg;
                } else if (!prevLowerHasBelowPreload && currentHasBelow) {
                    if (lowerCriticalAvg === null) lowerCriticalAvg = lastCycleLowerAvg;
                }
            }
            prevLowerHasBelowPreload = currentHasBelow;
            currentCycleLowerSum = 0; currentCycleLowerCount = 0; currentCycleMinLower = Infinity;
        }
        if (currentCycleUpperCount === 0 || currentCycleLowerCount === 0) cycleCount++;

        updateCharts();
        updateHealth();
        updateSensorCharts();
        updateFaultKeyChart();
    }

    // // 在函数最后，更新完所有数组和UI后
    // const anyMotorActive = motor1Data.some(v => v > 0) || motor2Data.some(v => v > 0) ||
    //                     motor3Data.some(v => v > 0) || motor4Data.some(v => v > 0);
    // updateRollerImage(anyMotorActive);
}


function stopFilePlayback() {
    fileDataPlaying = false;
    if (filePlaybackInterval) {
        clearInterval(filePlaybackInterval);
        filePlaybackInterval = null;
    }
    fileDataQueue = [];
    pendingChunks = [];
    fileCurrentChunkIndex = 0;
    fileCurrentDataIndex = 0;
    fileCurrentSecond = 0;
    fileTotalPoints = 0;
    hideProgress();
    showToast(i18n[currentLang].playbackComplete, 'info');

    systemStatus.collecting = false;
    systemStatus.status_type = 'idle';
    systemStatus.status_text = i18n[currentLang].statusIdle;
    updateSystemStatus();

    document.getElementById('startBtn').disabled = false;
    document.getElementById('saveBtn').disabled = true;
    document.getElementById('stopBtn').disabled = true;

    if (fileWorker) {
        fileWorker.terminate();
        fileWorker = null;
    }
    isWorkerProcessing = false;
}

// 保存数据
function saveData() {
    const path = document.getElementById('savePath').value || localStorage.getItem('savePath') || './data';

    fetch('/api/control/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: path })
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            systemStatus.saving = true;
            systemStatus.status_type = 'saving';
            systemStatus.status_text = i18n[currentLang].statusSaving;
            updateSystemStatus();
            showToast(i18n[currentLang].saveData + ' ' + i18n[currentLang].to + ': ' + path, 'success');
        }
    });
}

// 停止采集
function stopCollection() {
    // 先停止文件监控（如果正在监控）
    if (fileMonitorActive) {
        console.log('[STOP] 正在停止文件监控');
        fetch('/api/monitor/stop', { method: 'POST' })
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    fileMonitorActive = false;
                    if (window.monitorAccumulator && window.monitorAccumulator.timer) {
                        clearInterval(window.monitorAccumulator.timer);
                        window.monitorAccumulator.timer = null;
                        window.monitorAccumulator.points = [];
                        window.monitorAccumulator.lastAvg = null;
                        console.log('[STOP] 监控累积器已清除');
                    }
                }
            })
            .catch(err => console.error('停止监控失败:', err));
    }
    // 调用原有的停止采集（硬件采集）的 fetch
    fetch('/api/control/stop', { method: 'POST' })
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                systemStatus.collecting = false;
                systemStatus.saving = false;
                systemStatus.status_type = 'idle';
                systemStatus.status_text = i18n[currentLang].statusIdle;
                updateSystemStatus();
                document.getElementById('startBtn').disabled = false;
                document.getElementById('saveBtn').disabled = true;
                document.getElementById('stopBtn').disabled = true;
                document.getElementById('monitorBtn').disabled = false;
                showToast(i18n[currentLang].stop + ' ' + i18n[currentLang].success, 'success');
            }
        });

    // 停止文件播放相关（原逻辑保持不变）
    if (filePlaybackInterval) {
        clearInterval(filePlaybackInterval);
        filePlaybackInterval = null;
    }
    if (fileWorker) {
        fileWorker.terminate();
        fileWorker = null;
    }
    fileDataPlaying = false;
    fileDataQueue = [];
    pendingChunks = [];
    hideProgress();
}

function saveBasicInfoFromSettings() {
    const cust = document.getElementById('settingsCustomerName');
    const machine = document.getElementById('settingsMachineNo');
    const order = document.getElementById('settingsOrderNo');
    const model = document.getElementById('settingsModelNo');
    if (!cust || !machine || !order || !model) return;

    const data = {
        customerName: cust.value,
        machineNo: machine.value,
        orderNo: order.value,
        modelNo: model.value,
        type: 'basic_info',
        timestamp: new Date().toISOString()
    };
    saveManualData(data);

    const navCust = document.getElementById('navCustomerName');
    const navMachine = document.getElementById('navMachineNo');
    const navOrder = document.getElementById('navOrderNo');
    const navModel = document.getElementById('navModelNo');
    if (navCust) navCust.innerText = data.customerName;
    if (navMachine) navMachine.innerText = data.machineNo;
    if (navOrder) navOrder.innerText = data.orderNo;
    if (navModel) navModel.innerText = data.modelNo;

    showToast(i18n[currentLang].save + ' ' + i18n[currentLang].basicInfo, 'success');
}

function saveKeyIndicatorsFromCharts() {
    const envTemp = document.getElementById('chartsEnvTemp');
    const contactArea = document.getElementById('chartsContactArea');
    const wheelGap = document.getElementById('chartsWheelGap');
    const vibrationVal = document.getElementById('chartsVibrationVal');
    const testTime = document.getElementById('chartsTestTime');
    if (!envTemp || !contactArea || !wheelGap || !vibrationVal || !testTime) return;

    const data = {
        environment_temp: parseFloat(envTemp.value) || 0,
        contact_area: parseFloat(contactArea.value) || 0,
        wheel_gap: parseFloat(wheelGap.value) || 0,
        vibration_value: parseFloat(vibrationVal.value) || 0,
        test_time: parseFloat(testTime.value) || 0,
        type: 'key_indicators',
        timestamp: new Date().toISOString()
    };
    saveManualData(data);
    showToast(i18n[currentLang].save + ' ' + i18n[currentLang].keyIndicators, 'success');
}

// ==================== 辅助函数 ====================
function updateSystemStatus() {
    const el = document.getElementById('systemStatus');
    if (el) {
        el.className = `status-indicator status-${systemStatus.status_type}`;
        el.innerHTML = `<i class="fas fa-circle"></i> ${systemStatus.status_text}`;
    }
}

function updateDateTime() {
    const now = new Date();
    document.getElementById('currentDateTime').innerText = now.toLocaleString('zh-CN', {
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
        hour12: false
    });
}

function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    const bgColor = type === 'success' ? '#4ade80' : (type === 'error' ? '#ef4444' : '#38bdf8');

    toast.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: ${bgColor};
        color: white;
        padding: 12px 24px;
        border-radius: 8px;
        font-size: 14px;
        font-weight: 500;
        z-index: 9999;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        animation: slideIn 0.3s ease;
    `;
    toast.innerText = message;
    document.body.appendChild(toast);

    setTimeout(() => {
        toast.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

function switchPage(page) {
    document.querySelectorAll('.nav-item').forEach(nav => nav.classList.remove('active'));
    document.querySelector(`[data-page="${page}"]`).classList.add('active');

    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById(page + 'Page').classList.add('active');

    currentPage = page;

    setTimeout(() => {
        // 重新调整图表大小
        if (page === 'home') {
            faultKeyChart?.resize();
            healthTrendChart?.resize();
        } else if (page === 'charts') {
            // 重新调整监测图表页面内的所有图表
            Object.values(charts).forEach(chart => chart?.resize());
        } else if (page === 'realtime') {
            // 原有综合数据页面的图表
            Object.values(charts).forEach(chart => chart?.resize());
        }
    }, 200);
    // 确保新页面中的元素使用当前语言
    applyLanguage(currentLang);
}

// // 滚筒图片切换（根据电机状态）
// function updateRollerImage(active) {
//     const rollerImg = document.getElementById('rollerImage');
//     if (!rollerImg) return;

//     // 预留故障等级（0:正常,1:预警,2:一般故障,3:严重故障）
//     let faultLevel = 0; // 此处后续可根据 health 或阈值动态赋值
//     let imageName = 'AT_1.png'; // 默认未开机

//     if (active) {
//         // 开机状态，根据故障等级选择不同图片
//         // if (faultLevel === 0) imageName = 'AT_2.png';
//         // else if (faultLevel === 1) imageName = 'AT_3.png';
//         // else if (faultLevel === 2) imageName = 'AT_4.png';
//         // else if (faultLevel >= 3) imageName = 'AT_5.png';
//         for (let i = 0; i <= 21; i++) {
//             const img = new Image();
//             imageName = `/static/images/output_drum/AT_${i}.png?t=${Date.now()}`;
//             // 添加时间戳防止缓存
//             rollerImg.src = `/static/images/output_drum/${imageName}?t=${Date.now()}`;
//             rollerImg.onerror = () => {
//                 // 图片加载失败时的后备
//                 rollerImg.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjE0MCIgdmlld0JveD0iMCAwIDIwMCAxNDAiPjxyZWN0IHdpZHRoPSIyMDAiIGhlaWdodD0iMTQwIiBmaWxsPSIjMjQzYjVhIi8+PHRleHQgeD0iMTAwIiB5PSI3MCIgZm9udC1mYW1pbHk9IkFyaWFsIiBmb250LXNpemU9IjE2IiBmaWxsPSIjZmZmIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIj7msojnvqQ8L3RleHQ+PC9zdmc+';
//             };
//     }
//     }

    
//     updateAnnotationLines()
// }
// 图片标注点配置（相对于图片宽度和高度的百分比）
const annotationPoints = {
    upperWheel: { x: 0.25, y: 0.2 },   // 上限位轮
    lowerWheel: { x: 0.25, y: 0.8 },   // 下限位轮
    ring1:      { x: 0.75, y: 0.3 },   // 滚圈1（上）
    ring2:      { x: 0.75, y: 0.7 }    // 滚圈2（下）
};

// function updateAnnotationLines() {
//     const container = document.querySelector('.roller-image-container');
//     const svg = document.getElementById('annotationSvg');
//     const img = document.getElementById('rollerImage');
//     if (!container || !svg || !img) return;

//     if (!img.complete) {
//         img.onload = updateAnnotationLines;
//         return;
//     }

//     const imgRect = img.getBoundingClientRect();
//     const containerRect = container.getBoundingClientRect();

//     const offsetX = imgRect.left - containerRect.left;
//     const offsetY = imgRect.top - containerRect.top;
//     const imgWidth = imgRect.width;
//     const imgHeight = imgRect.height;

//     // 计算四个部件点（图片上的固定点，但起点可拖拽，这里只用作默认值）
//     const points = {};
//     for (let key in annotationPoints) {
//         points[key] = {
//             x: offsetX + annotationPoints[key].x * imgWidth,
//             y: offsetY + annotationPoints[key].y * imgHeight
//         };
//     }
//     const ringMidX = (points.ring1.x + points.ring2.x) / 2;
//     const ringMidY = (points.ring1.y + points.ring2.y) / 2;

//     // 获取目标卡片位置
//     const upperCard = document.getElementById('upperWheelCard');
//     const lowerCard = document.getElementById('lowerWheelCard');
//     const ringCard = document.querySelector('.right-ring');
//     if (!upperCard || !lowerCard || !ringCard) return;

//     const upperRect = upperCard.getBoundingClientRect();
//     const lowerRect = lowerCard.getBoundingClientRect();
//     const ringRect = ringCard.getBoundingClientRect();

//     const targetUpper = {
//         x: upperRect.right - containerRect.left,
//         y: upperRect.top + upperRect.height/2 - containerRect.top
//     };
//     const targetLower = {
//         x: lowerRect.right - containerRect.left,
//         y: lowerRect.top + lowerRect.height/2 - containerRect.top
//     };
//     const targetRing = {
//         x: ringRect.left - containerRect.left,
//         y: ringRect.top + ringRect.height/2 - containerRect.top
//     };

//     // 初始化控制点（如果未设置，则使用默认值）
//     // 注意：这里保留用户之前拖拽的值，仅当对应点未初始化时设置默认
//     if (controlPoints.upper.start.x === 0 && controlPoints.upper.start.y === 0) {
//         controlPoints.upper.start = { x: points.upperWheel.x, y: points.upperWheel.y };
//     }
//     if (controlPoints.upper.control.x === 0 && controlPoints.upper.control.y === 0) {
//         controlPoints.upper.control = { x: targetUpper.x, y: points.upperWheel.y };
//     }
//     if (controlPoints.upper.end.x === 0 && controlPoints.upper.end.y === 0) {
//         controlPoints.upper.end = { x: targetUpper.x, y: targetUpper.y };
//     }

//     if (controlPoints.lower.start.x === 0 && controlPoints.lower.start.y === 0) {
//         controlPoints.lower.start = { x: points.lowerWheel.x, y: points.lowerWheel.y };
//     }
//     if (controlPoints.lower.control.x === 0 && controlPoints.lower.control.y === 0) {
//         controlPoints.lower.control = { x: targetLower.x, y: points.lowerWheel.y };
//     }
//     if (controlPoints.lower.end.x === 0 && controlPoints.lower.end.y === 0) {
//         controlPoints.lower.end = { x: targetLower.x, y: targetLower.y };
//     }

//     if (controlPoints.ring.start.x === 0 && controlPoints.ring.start.y === 0) {
//         controlPoints.ring.start = { x: ringMidX, y: ringMidY };
//     }
//     if (controlPoints.ring.control.x === 0 && controlPoints.ring.control.y === 0) {
//         controlPoints.ring.control = { x: targetRing.x, y: ringMidY };
//     }
//     if (controlPoints.ring.end.x === 0 && controlPoints.ring.end.y === 0) {
//         controlPoints.ring.end = { x: targetRing.x, y: targetRing.y };
//     }

//     // 清空并重绘
//     svg.innerHTML = '';

//     const colors = { upper: '#f87171', lower: '#a78bfa', ring: '#38bdf8' };
//     const lineWidth = window.lineWidth || 2;

//     function drawPolylineWithPoints(start, control, end, color) {
//         const lineWidth = window.lineWidth || 2; // 可通过滑块调节

//         // 绘制折线（纯色实线）
//         const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
//         const d = `M ${start.x},${start.y} L ${control.x},${control.y} L ${end.x},${end.y}`;
//         path.setAttribute("d", d);
//         path.setAttribute("stroke", color);
//         path.setAttribute("stroke-width", lineWidth);
//         path.setAttribute("fill", "none");
//         path.setAttribute("stroke-linecap", "round");
//         path.setAttribute("stroke-linejoin", "round");
//         svg.appendChild(path);

//         // 绘制起点（圆点，带白边）
//         const startCircle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
//         startCircle.setAttribute("cx", start.x);
//         startCircle.setAttribute("cy", start.y);
//         startCircle.setAttribute("r", 6);
//         startCircle.setAttribute("fill", color);
//         startCircle.setAttribute("stroke", "#ffffff");
//         startCircle.setAttribute("stroke-width", 2);
//         startCircle.setAttribute("data-control", "true");
//         startCircle.setAttribute("data-id", Object.keys(colors).find(key => colors[key] === color) + '-start');
//         startCircle.style.cursor = "move";
//         svg.appendChild(startCircle);

//         // 绘制转折点（圆点，带白边）
//         const controlCircle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
//         controlCircle.setAttribute("cx", control.x);
//         controlCircle.setAttribute("cy", control.y);
//         controlCircle.setAttribute("r", 6);
//         controlCircle.setAttribute("fill", color);
//         controlCircle.setAttribute("stroke", "#ffffff");
//         controlCircle.setAttribute("stroke-width", 2);
//         controlCircle.setAttribute("data-control", "true");
//         controlCircle.setAttribute("data-id", Object.keys(colors).find(key => colors[key] === color) + '-control');
//         controlCircle.style.cursor = "move";
//         svg.appendChild(controlCircle);

//         // 绘制终点（圆点，带白边）
//         const endCircle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
//         endCircle.setAttribute("cx", end.x);
//         endCircle.setAttribute("cy", end.y);
//         endCircle.setAttribute("r", 6);
//         endCircle.setAttribute("fill", color);
//         endCircle.setAttribute("stroke", "#ffffff");
//         endCircle.setAttribute("stroke-width", 2);
//         endCircle.setAttribute("data-control", "true");
//         endCircle.setAttribute("data-id", Object.keys(colors).find(key => colors[key] === color) + '-end');
//         endCircle.style.cursor = "move";
//         svg.appendChild(endCircle);
//     }

//     drawPolylineWithPoints(controlPoints.upper.start, controlPoints.upper.control, controlPoints.upper.end, colors.upper);
//     drawPolylineWithPoints(controlPoints.lower.start, controlPoints.lower.control, controlPoints.lower.end, colors.lower);
//     drawPolylineWithPoints(controlPoints.ring.start, controlPoints.ring.control, controlPoints.ring.end, colors.ring);

//     // 重新绑定拖拽事件
//     bindControlDragEvents();
// }

// 在窗口大小改变和图片加载后重新绘制
window.addEventListener('resize', () => {
    // 使用requestAnimationFrame避免频繁调用
    requestAnimationFrame(updateAnnotationLines);
});

// 在图片加载和系统初始化后调用
document.addEventListener('DOMContentLoaded', () => {
    // 延迟一点确保图片加载
    setTimeout(updateAnnotationLines, 500);
    loadPressureConfig();
});

// 添加动画样式
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
    }
    @keyframes slideOut {
        from { transform: translateX(0); opacity: 1; }
        to { transform: translateX(100%); opacity: 0; }
    }
`;
document.head.appendChild(style);

window.addEventListener('resize', () => {
    Object.values(charts).forEach(chart => {
        if (chart) chart.resize();
    });
    faultKeyChart?.resize();
    healthTrendChart?.resize();
});



function bindControlDragEvents() {
    const svg = document.getElementById('annotationSvg');
    if (!svg) return;

    svg.removeEventListener('mousedown', handleControlMouseDown);
    svg.removeEventListener('mousemove', handleControlMouseMove);
    svg.removeEventListener('mouseup', handleControlMouseUp);
    svg.removeEventListener('mouseleave', handleControlMouseUp);

    svg.addEventListener('mousedown', handleControlMouseDown);
    svg.addEventListener('mousemove', handleControlMouseMove);
    svg.addEventListener('mouseup', handleControlMouseUp);
    svg.addEventListener('mouseleave', handleControlMouseUp);
}

function handleControlMouseDown(e) {
    const target = e.target;
    if (target.getAttribute('data-control') === 'true') {
        e.preventDefault();
        draggingPoint = target.getAttribute('data-id'); // 格式如 'upper-start'
    }
}

function handleControlMouseMove(e) {
    if (!draggingPoint) return;
    e.preventDefault();

    const container = document.querySelector('.roller-image-container');
    const rect = container.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // 解析拖拽的点属于哪条线和哪个部分
    const [line, part] = draggingPoint.split('-'); // line: 'upper', 'lower', 'ring'; part: 'start', 'control', 'end'

    // 根据 part 应用不同的限制
    if (part === 'start') {
        // 起点限制在图片区域内
        const img = document.getElementById('rollerImage');
        const imgRect = img.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();
        const imgLeft = imgRect.left - containerRect.left;
        const imgTop = imgRect.top - containerRect.top;
        const imgRight = imgLeft + imgRect.width;
        const imgBottom = imgTop + imgRect.height;
        controlPoints[line][part].x = Math.max(imgLeft, Math.min(imgRight, x));
        controlPoints[line][part].y = Math.max(imgTop, Math.min(imgBottom, y));
    } else if (part === 'end') {
        // 终点限制在对应卡片区域内
        let card;
        if (line === 'upper') card = document.getElementById('upperWheelCard');
        else if (line === 'lower') card = document.getElementById('lowerWheelCard');
        else if (line === 'ring') card = document.querySelector('.right-ring');
        if (card) {
            const cardRect = card.getBoundingClientRect();
            const containerRect = container.getBoundingClientRect();
            const cardLeft = cardRect.left - containerRect.left;
            const cardTop = cardRect.top - containerRect.top;
            const cardRight = cardLeft + cardRect.width;
            const cardBottom = cardTop + cardRect.height;
            controlPoints[line][part].x = Math.max(cardLeft, Math.min(cardRight, x));
            controlPoints[line][part].y = Math.max(cardTop, Math.min(cardBottom, y));
        } else {
            controlPoints[line][part].x = x;
            controlPoints[line][part].y = y;
        }
    } else {
        // control 点限制在整个容器内
        controlPoints[line][part].x = Math.max(0, Math.min(rect.width, x));
        controlPoints[line][part].y = Math.max(0, Math.min(rect.height, y));
    }

    // 重绘
    updateAnnotationLines();
}

function handleControlMouseUp() {
    draggingPoint = null;
}

function updateHealthDisplay(systemHealth, upperHealth, lowerHealth) {
    // 更新圆形进度条
    const progressFill = document.getElementById('progressCircle');
    const progressText = document.getElementById('progressText');
    if (progressFill && progressText) {
        const radius = 40;
        const circumference = 2 * Math.PI * radius;
        const offset = circumference * (1 - systemHealth / 100);
        progressFill.style.strokeDasharray = `${circumference}`;
        progressFill.style.strokeDashoffset = offset;
        
        // 根据健康度改变颜色：绿色 (120) 到红色 (0)
        const hue = systemHealth * 1.2; // 0~100 -> 0~120
        progressFill.style.stroke = `hsl(${hue}, 80%, 50%)`;
        
        progressText.textContent = systemHealth.toFixed(0) + '%';
    }

    // 更新各项参数进度条
    // 上预紧力 (0-10)
    const upperPreload = parseFloat(document.getElementById('healthDisplayUpperPreload')?.innerText) || 0;
    document.getElementById('progressUpperPreload')?.style.setProperty('width', (upperPreload / 10 * 100) + '%');

    // 上临界压力 (0-10)
    const upperCritical = parseFloat(document.getElementById('healthDisplayUpperCritical')?.innerText) || 0;
    document.getElementById('progressUpperCritical')?.style.setProperty('width', (upperCritical / 10 * 100) + '%');

    // 周期 (0-60)
    const cycle = parseFloat(document.getElementById('healthDisplayCycle')?.innerText) || 0;
    document.getElementById('progressCycle')?.style.setProperty('width', (cycle / 60 * 100) + '%');

    // 下预紧力 (0-10)
    const lowerPreload = parseFloat(document.getElementById('healthDisplayLowerPreload')?.innerText) || 0;
    document.getElementById('progressLowerPreload')?.style.setProperty('width', (lowerPreload / 10 * 100) + '%');

    // 下临界压力 (0-10)
    const lowerCritical = parseFloat(document.getElementById('healthDisplayLowerCritical')?.innerText) || 0;
    document.getElementById('progressLowerCritical')?.style.setProperty('width', (lowerCritical / 10 * 100) + '%');

    // 初始位移 (0-10)
    const initDisp = parseFloat(document.getElementById('healthDisplayInitialDisplacement')?.innerText) || 0;
    document.getElementById('progressInitialDisplacement')?.style.setProperty('width', (initDisp / 10 * 100) + '%');

    // 原有状态显示代码保持不变（健康度状态标签等）
    // ... 请保留原有的健康状态更新代码（如 healthStatus 等）
}

function mapPressure(original) {
    if (pressureOriginalMax === 0) return 0;
    return (original / pressureOriginalMax) * pressureDisplayMax;
}


function updateAllUnits() {
    // 更新所有压力单位（新增）
    document.querySelectorAll('.pressure-unit').forEach(el => {
        el.innerText = pressureUnit;
    });
    // 原有的限位轮卡片单位
    document.querySelectorAll('.wheel-unit').forEach(el => el.innerText = pressureUnit);
    // 双传感器卡片中的单位（排除转速）
    document.querySelectorAll('.dual-col-unit').forEach(el => {
        if (el.id !== 'leftRpmUnit' && el.id !== 'rightRpmUnit') el.innerText = pressureUnit;
    });
    // 图表 Y 轴名称
    if (faultKeyChart) faultKeyChart.setOption({ yAxis: { name: pressureUnit } });
}



function changeUnit(unit) {
    pressureUnit = unit;
    savePressureMapping(); // 保存完整配置，包括单位
}

function refreshAllPressureValues() {
    // 根据当前 sensorData 重新显示
    if (sensorData) {
        const avg = {
            upper_pressure: sensorData.upper_pressure?.value || 0,
            lower_pressure: sensorData.lower_pressure?.value || 0,
            left_rpm: sensorData.left_rpm?.value || 0,
            right_rpm: sensorData.right_rpm?.value || 0,
            eddy_current: sensorData.eddy_current?.value || 0,
            motor1: sensorData.motor1?.value || 0,
            motor2: sensorData.motor2?.value || 0,
            motor3: sensorData.motor3?.value || 0,
            motor4: sensorData.motor4?.value || 0
        };
        updateWheelCards(avg);
        updateHealthParamDisplay();
        updateFaultKeyChart();
    }
}


// 加载压力配置（在 loadInitialData 中调用）
function loadPressureConfig() {
    fetch('/api/config/pressure')
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                pressureOriginalMax = data.data.originalMax || 5.0;
                pressureDisplayMax = data.data.displayMax || 300;
                pressureUnit = data.data.unit || 'MPa';
            } else {
                // 使用默认值
                pressureOriginalMax = 5.0;
                pressureDisplayMax = 300;
                pressureUnit = 'MPa';
            }
            document.getElementById('pressureOriginalMax').value = pressureOriginalMax;
            document.getElementById('pressureDisplayMax').value = pressureDisplayMax;
            document.getElementById('unitSelector').value = pressureUnit;
            updateAllUnits();
            refreshAllPressureValues();
        })
        .catch(err => {
            console.error('加载压力配置失败，使用默认值', err);
            // 默认值同上
            pressureOriginalMax = 5.0;
            pressureDisplayMax = 300;
            pressureUnit = 'MPa';
            document.getElementById('pressureOriginalMax').value = pressureOriginalMax;
            document.getElementById('pressureDisplayMax').value = pressureDisplayMax;
            document.getElementById('unitSelector').value = pressureUnit;
            updateAllUnits();
            refreshAllPressureValues();
        });
}

// 保存压力映射
function savePressureMapping() {
    const orig = parseFloat(document.getElementById('pressureOriginalMax').value);
    const disp = parseFloat(document.getElementById('pressureDisplayMax').value);
    if (isNaN(orig) || isNaN(disp) || orig <= 0 || disp <= 0) {
        showToast('请输入有效的正数', 'error');
        return;
    }
    fetch('/api/config/pressure', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ originalMax: orig, displayMax: disp, unit: pressureUnit })
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            pressureOriginalMax = orig;
            pressureDisplayMax = disp;
            refreshAllPressureValues();
            updateAllUnits();
            showToast('压力映射已保存', 'success');
        } else {
            showToast('保存失败：' + (data.error || ''), 'error');
        }
    })
    .catch(err => {
        console.error(err);
        showToast('保存失败，请检查网络', 'error');
    });
}

// 切换单位（同时保存到后端）
function changeUnit(unit) {
    pressureUnit = unit;
    // 直接调用保存接口，也可以单独保存单位，这里复用 savePressureMapping 或单独接口
    // 为简化，单独调用一个单位保存接口
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

function loadLanguageConfig() {
    fetch('/api/config/language')
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                const lang = data.data.language || 'zh';
                document.getElementById('langSelector').value = lang;
                applyLanguage(lang);
            } else {
                // 默认中文
                applyLanguage('zh');
            }
        })
        .catch(err => {
            console.error('加载语言配置失败', err);
            applyLanguage('en'); // 出错时默认中文
        });
}
function saveLanguageConfig(lang) {
    fetch('/api/config/language', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ language: lang })
    }).catch(err => console.error('保存语言配置失败', err));
}


// 如果不需要引出线功能，定义空函数避免报错
function updateAnnotationLines() {}
function loadLineWidthConfig() {}
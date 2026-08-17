/**
 * 核心全局变量模块
 * 包含所有共享状态、数据数组、常量
 */

// ==================== 全局状态对象 ====================
export const store = {
    // WebSocket 实例
    socket: null,

    // 图表实例容器
    charts: {},

    // 采集状态
    isCollecting: false,

    // 页面状态
    currentPage: 'home',
    currentHomeChart: 'health',
    currentTab: 'motor',
    fileMonitorActive: false,
    rpmDisplayMode: 'value',

    // 通道配置
    channelConfig: {
        ai: [],
        ctr: []
    },

    // 常量
    maxDataPoints: 30,          // 图表显示最近30个点
    MAX_MAIN_QUEUE_CHUNKS: 5,   // 文件播放主队列最大块数
    MAX_PENDING_CHUNKS: 10,     // 待处理块最大数

    // 传感器实时数据
    sensorData: {
        upper_pressure: { active: false, value: 0, voltage: 0 },
        lower_pressure: { active: false, value: 0, voltage: 0 },
        left_rpm: { active: false, value: 0, voltage: 0 },
        right_rpm: { active: false, value: 0, voltage: 0 },
        eddy_current: { active: false, value: 0, voltage: 0 },
        motor1: { active: false, value: 0 },
        motor2: { active: false, value: 0 },
        motor3: { active: false, value: 0 },
        motor4: { active: false, value: 0 }
    },

    // 系统状态
    systemStatus: {
        collecting: false,
        saving: false,
        statusText: '就绪',
        statusType: 'idle'
    },

    // 图表数据数组（30秒滚动）
    vibrationData: new Array(30).fill(0),
    motor1Data: new Array(30).fill(0),
    motor2Data: new Array(30).fill(0),
    motor3Data: new Array(30).fill(0),
    motor4Data: new Array(30).fill(0),
    upperPressureData: new Array(30).fill(0),
    lowerPressureData: new Array(30).fill(0),
    leftRpmData: new Array(30).fill(0),
    rightRpmData: new Array(30).fill(0),
    leftRpmVoltageData: new Array(30).fill(0),
    rightRpmVoltageData: new Array(30).fill(0),

    // 手动输入历史数据
    coaxialTimes: [],
    coaxialData: [],
    verticalData: [],
    runoutTimes: [],
    runoutData: [[], [], [], []],

    // 健康度历史
    healthHistory: [],
    healthTimes: [],

    // 图片帧计数器
    upperWheelFrame: 0,
    lowerWheelFrame: 0,
    ringFrame: 0,
    rollerFrame: 5,  // 滚筒动画初始帧

    // 周期累积变量
    currentCycleUpperSum: 0,
    currentCycleUpperCount: 0,
    currentCycleMinUpper: Infinity,
    currentCycleLowerSum: 0,
    currentCycleLowerCount: 0,
    currentCycleMinLower: Infinity,
    lastCycleUpperAvg: 0,
    lastCycleLowerAvg: 0,
    cycleCount: 0,
    prevUpperHasBelowPreload: null,
    prevLowerHasBelowPreload: null,
    upperCriticalAvg: null,
    lowerCriticalAvg: null,

    // 周期数据记录（用于故障关键信息图表）
    cycleTimes: [],
    upperCycleAvgHistory: [],
    lowerCycleAvgHistory: [],
    upperCycleMinHistory: [],
    lowerCycleMinHistory: [],

    // 图表缓存数据（用于传感器页面）
    pressureChartData: { upper: [], lower: [], timestamps: [] },
    rpmChartData: { left: [], right: [], timestamps: [] },
    motorChartData: { motor1: [], motor2: [], motor3: [], motor4: [], timestamps: [] },

    // 引出线相关（备用）
    controlPoints: {
        upper: { start: { x: 0, y: 0 }, control: { x: 0, y: 0 }, end: { x: 0, y: 0 } },
        lower: { start: { x: 0, y: 0 }, control: { x: 0, y: 0 }, end: { x: 0, y: 0 } },
        ring: { start: { x: 0, y: 0 }, control: { x: 0, y: 0 }, end: { x: 0, y: 0 } }
    },
    draggingPoint: null,

    // 当前健康度（用于位移指示器）
    currentUpperHealth: 100,
    currentLowerHealth: 100,

    // 文件播放相关
    fileDataQueue: [],
    pendingChunks: [],
    fileDataPlaying: false,
    filePlaybackInterval: null,
    fileCurrentSecond: 0,
    fileTotalPoints: 0,
    fileWorker: null,
    isWorkerProcessing: false,
    fileAllChunksReceived: false,
    fileCurrentChunkIndex: 0,
    fileCurrentDataIndex: 0,

    // 图表实例（将在 charts.js 中赋值）
    faultKeyChart: null,
    healthTrendChart: null,

    // 时间点
    timePoints: []
};

// 初始化时间点
store.timePoints = (function generateTimePoints() {
    const now = new Date();
    const points = [];
    for (let i = store.maxDataPoints - 1; i >= 0; i--) {
        const time = new Date(now.getTime() - i * 1000);
        points.push(time.toLocaleTimeString('zh-CN', {
            hour12: false,
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        }));
    }
    return points;
})();

// 电机数据映射（避免 eval）
store.motorDataMap = {
    motor1: store.motor1Data,
    motor2: store.motor2Data,
    motor3: store.motor3Data,
    motor4: store.motor4Data
};

// ==================== 初始化核心 ====================
export function initCore() {
    // 可以在这里重置一些变量，目前无需额外操作
    console.log('Core initialized');
}
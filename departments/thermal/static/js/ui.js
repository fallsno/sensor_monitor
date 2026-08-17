/**
 * UI 模块
 * 包含页面切换、语言切换、Toast提示、系统状态更新、事件绑定等
 */
import { store } from './core.js';
import { i18n, currentLang, mapPressure, upperPreloadPressure, lowerPreloadPressure,
         cycleSeconds, initialDisplacement, upperCriticalPressure, lowerCriticalPressure,
         saveLanguageConfig, pressureUnit, setCurrentLang } from './config.js';
import { updateWheelStatusFromHealth as updateWheelStatus, updateFaultKeyChart } from './health.js';
import { startCollection, saveData, stopCollection } from './websocket.js';
import { browseFile, loadFileData, startFileMonitor, stopFilePlayback } from './file-handler.js';
import { saveHealthConfig, savePortConfig, savePressureMapping, changeUnit } from './config.js';
import { updateWheelCards } from './charts.js';
import { saveChannelMapping } from './config.js';
import { getMappingSelects } from './config_selectors.mjs';

// ==================== 语言切换 ====================
export function applyLanguage(lang, skipSave = false) {
    setCurrentLang(lang);  // 更新 config 中的 currentLang
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
    // 更新图表系列名
    if (store.charts.coaxial) store.charts.coaxial.setOption({ series: [{ name: i18n[lang].coaxialIn }, { name: i18n[lang].verticalOut }] });
    if (store.charts.runout) store.charts.runout.setOption({ series: [{ name: i18n[lang].wheel1 }, { name: i18n[lang].wheel2 }, { name: i18n[lang].wheel3 }, { name: i18n[lang].wheel4 }] });
    if (store.charts.vibration) store.charts.vibration.setOption({ series: [{ name: i18n[lang].displacementSensor }] });
    if (store.charts.displacement) {
        if (typeof store.charts.displacement.setOption === 'function') {
            store.charts.displacement.setOption({ series: [{ name: i18n[lang].displacementSensor }] });
        } else if (store.charts.displacement.series && store.charts.displacement.series[0]) {
            store.charts.displacement.series[0].update({ name: i18n[lang].displacementSensor });
        }
    }
    if (store.faultKeyChart) updateFaultKeyChart();
    if (store.healthTrendChart) store.healthTrendChart.setOption({});

    // 仅在主动切换时保存（页面初始化、切换页面时不保存）
    if (!skipSave) {
        saveLanguageConfig(lang);
    }

    updateWheelStatus(store.currentUpperHealth, store.currentLowerHealth);
    updateHealthParamDisplay();
    updateSystemStatus();
}
// ==================== 系统状态更新 ====================
export function updateSystemStatus() {
    const el = document.getElementById('systemStatus');
    if (el) {
        el.className = `status-indicator status-${store.systemStatus.statusType}`;
        el.innerHTML = `<i class="fas fa-circle"></i> ${store.systemStatus.statusText}`;
    }
}

// ==================== 日期时间 ====================
export function updateDateTime() {
    const now = new Date();
    document.getElementById('currentDateTime').innerText = now.toLocaleString('zh-CN', {
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
        hour12: false
    });
}

// ==================== Toast 提示 ====================
export function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    const bgColor = type === 'success' ? '#4ade80' : (type === 'error' ? '#ef4444' : '#38bdf8');
    toast.style.cssText = `
        position: fixed; top: 20px; right: 20px; background: ${bgColor}; color: white;
        padding: 12px 24px; border-radius: 8px; font-size: 14px; font-weight: 500;
        z-index: 9999; box-shadow: 0 4px 12px rgba(0,0,0,0.3); animation: slideIn 0.3s ease;
    `;
    toast.innerText = message;
    document.body.appendChild(toast);
    setTimeout(() => {
        toast.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// ==================== 页面切换 ====================
// ui.js 中的 switchPage
export function switchPage(page) {
    if (!page) {
        return;
    }

    const targetNav = document.querySelector(`[data-page="${page}"]`);
    const targetPage = document.getElementById(page + 'Page');
    if (!targetNav || !targetPage) {
        return;
    }

    document.querySelectorAll('.nav-item').forEach(nav => nav.classList.remove('active'));
    targetNav.classList.add('active');
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    targetPage.classList.add('active');
    store.currentPage = page;
    
    // 立即显示正确的标签页内容并调整图表
    if (page === 'realtime') {
        const activeTab = document.querySelector('.tab-btn.active') || document.querySelector('.tab.active');
        if (activeTab) {
            const tabId = activeTab.dataset.tab;
            document.querySelectorAll('.tab-content').forEach(content => {
                const isActive = content.id === tabId + 'Tab' || content.id === tabId + 'TabContent';
                content.classList.toggle('active', isActive);
            });
        }
    }
    
    // 延迟执行，确保页面渲染完成
    setTimeout(() => {
        // 使用 refreshAllCharts 统一处理图表刷新
        if (page === 'home' || page === 'charts' || page === 'realtime') {
            refreshAllCharts();
            // 增加二次保险，对于 Highcharts 需要更长一点的重绘时间
            setTimeout(() => refreshAllCharts(), 200);
        }
    }, 50);
    
    // 应用语言，但不保存（避免覆盖）
    applyLanguage(currentLang, true);
}
// ==================== 标签切换 ====================
export function switchTab(tab) {
    store.currentTab = tab;
    
    // 1. 处理内容区域：找到目标内容元素
    const targetContent = document.getElementById(tab + 'Tab') || document.getElementById(tab + 'TabContent');
    if (targetContent) {
        // 找到目标内容元素的父节点
        const parent = targetContent.parentElement;
        if (parent) {
            // 只在同一个父节点内查找子级 .tab-content 并移除 active
            // 使用 Array.from 和 filter 来代替 :scope (提高兼容性)
            Array.from(parent.children).forEach(child => {
                if (child.classList.contains('tab-content')) {
                    child.classList.remove('active');
                }
            });
        }
        // 激活目标内容
        targetContent.classList.add('active');
    }
    
    // 2. 处理按钮区域：找到对应的按钮
    const targetBtn = document.querySelector(`.tab-btn[data-tab="${tab}"], .tab[data-tab="${tab}"]`);
    if (targetBtn) {
        const btnContainer = targetBtn.closest('.tab-header, .tabs-container');
        if (btnContainer) {
            // 只在当前按钮容器内移除 active
            btnContainer.querySelectorAll('.tab-btn, .tab').forEach(btn => {
                btn.classList.remove('active');
            });
        }
        targetBtn.classList.add('active');
    }
    
    setTimeout(() => refreshAllCharts(), 100);
}

// ==================== 主页图表切换 ====================
export function switchHomeChart(chart) {
    store.currentHomeChart = chart;
    document.querySelectorAll('.switcher-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.chart === chart));
    document.querySelectorAll('.chart-page').forEach(page => page.classList.toggle('active', page.id === chart + 'Page'));
    setTimeout(() => refreshAllCharts(), 100);
}

// ==================== 转速模式切换 ====================
export function switchRpmMode(mode) {
    store.rpmDisplayMode = mode;
    document.querySelectorAll('[data-rpm-mode]').forEach(btn => btn.classList.toggle('active', btn.dataset.rpmMode === mode));
    document.getElementById('leftRpmUnit').innerText = mode === 'value' ? 'RPM' : 'V';
    document.getElementById('rightRpmUnit').innerText = mode === 'value' ? 'RPM' : 'V';
}

// ==================== 健康度显示更新 ====================
export function updateHealthDisplay(systemHealth, upperHealth, lowerHealth) {
    const progressFill = document.getElementById('progressCircle');
    const progressText = document.getElementById('progressText');
    if (progressFill && progressText) {
        const radius = 40;
        const circumference = 2 * Math.PI * radius;
        const offset = circumference * (1 - systemHealth / 100);
        progressFill.style.strokeDasharray = `${circumference}`;
        progressFill.style.strokeDashoffset = offset;
        const hue = systemHealth * 1.2;
        progressFill.style.stroke = `hsl(${hue}, 80%, 50%)`;
        progressText.textContent = systemHealth.toFixed(0) + '%';
    }
    const upperPreload = parseFloat(document.getElementById('healthDisplayUpperPreload')?.innerText) || 0;
    document.getElementById('progressUpperPreload')?.style.setProperty('width', (upperPreload / 10 * 100) + '%');
    const upperCritical = parseFloat(document.getElementById('healthDisplayUpperCritical')?.innerText) || 0;
    document.getElementById('progressUpperCritical')?.style.setProperty('width', (upperCritical / 10 * 100) + '%');
    const cycle = parseFloat(document.getElementById('healthDisplayCycle')?.innerText) || 0;
    document.getElementById('progressCycle')?.style.setProperty('width', (cycle / 60 * 100) + '%');
    const lowerPreload = parseFloat(document.getElementById('healthDisplayLowerPreload')?.innerText) || 0;
    document.getElementById('progressLowerPreload')?.style.setProperty('width', (lowerPreload / 10 * 100) + '%');
    const lowerCritical = parseFloat(document.getElementById('healthDisplayLowerCritical')?.innerText) || 0;
    document.getElementById('progressLowerCritical')?.style.setProperty('width', (lowerCritical / 10 * 100) + '%');
    const initDisp = parseFloat(document.getElementById('healthDisplayInitialDisplacement')?.innerText) || 0;
    document.getElementById('progressInitialDisplacement')?.style.setProperty('width', (initDisp / 10 * 100) + '%');
    // 状态标签
    let status = 'normal', statusText = i18n[currentLang].statusNormal;
    if (systemHealth < 50) { status = 'fault'; statusText = i18n[currentLang].statusFault; }
    else if (systemHealth < 60) { status = 'warning'; statusText = i18n[currentLang].statusWarning; }
    const statusEl = document.getElementById('healthStatus');
    if (statusEl) { statusEl.className = `health-status-badge status-${status}`; statusEl.innerText = statusText; }
    const healthEl = document.getElementById('healthValueLarge');
    if (healthEl) { const hue = (systemHealth / 100) * 120; healthEl.style.color = `hsl(${hue}, 80%, 50%)`; }
    const healthBar = document.getElementById('healthBar');
    if (healthBar) healthBar.style.background = `linear-gradient(90deg, #ff4444 0%, #ffaa00 50%, #4ade80 100%)`;
}

// ==================== 更新轮状态（基于健康度）====================
export function updateWheelStatusFromHealth(upperHealth, lowerHealth) {
    const upperCard = document.getElementById('upperWheelCard');
    const upperStatus = document.getElementById('upperWheelStatus');
    if (upperCard && upperStatus) {
        if (upperHealth < 50) { upperCard.className = 'wheel-card fault'; upperStatus.innerText = i18n[currentLang].statusFault; }
        else if (upperHealth < 60) { upperCard.className = 'wheel-card warning'; upperStatus.innerText = i18n[currentLang].statusWarning; }
        else { upperCard.className = 'wheel-card normal'; upperStatus.innerText = i18n[currentLang].statusNormal; }
    }
    const lowerCard = document.getElementById('lowerWheelCard');
    const lowerStatus = document.getElementById('lowerWheelStatus');
    if (lowerCard && lowerStatus) {
        if (lowerHealth < 50) { lowerCard.className = 'wheel-card fault'; lowerStatus.innerText = i18n[currentLang].statusFault; }
        else if (lowerHealth < 60) { lowerCard.className = 'wheel-card warning'; lowerStatus.innerText = i18n[currentLang].statusWarning; }
        else { lowerCard.className = 'wheel-card normal'; lowerStatus.innerText = i18n[currentLang].statusNormal; }
    }
}

// ==================== 刷新所有压力值 ====================
export function refreshAllPressureValues() {
    import('./config.js').then(({ sensorData }) => {
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
    });
}

// ==================== 更新所有单位 ====================
export function updateAllUnits() {
    document.querySelectorAll('.pressure-unit').forEach(el => el.innerText = pressureUnit);
    document.querySelectorAll('.wheel-unit').forEach(el => el.innerText = pressureUnit);
    document.querySelectorAll('.dual-col-unit').forEach(el => {
        if (el.id !== 'leftRpmUnit' && el.id !== 'rightRpmUnit') el.innerText = pressureUnit;
    });
    if (store.faultKeyChart) store.faultKeyChart.setOption({ yAxis: { name: pressureUnit } });
}

// ==================== 创建进度条 ====================
export function createProgressBar() {
    const progressContainer = document.createElement('div');
    progressContainer.id = 'fileProgressContainer';
    progressContainer.style.cssText = `
        position: fixed; top: 60px; right: 20px; width: 340px; background: #1e293b;
        border-radius: 8px; padding: 15px; box-shadow: 0 4px 20px rgba(0,0,0,0.5);
        z-index: 10000; display: none; border: 1px solid #38bdf8;
        font-family: 'Microsoft YaHei', sans-serif; cursor: move; user-select: none;
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
    let isDragging = false, offsetX, offsetY;
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
    document.addEventListener('mouseup', () => { isDragging = false; progressContainer.style.cursor = 'move'; });
}

export function showProgress(percent, info) {
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

export function hideProgress() {
    const container = document.getElementById('fileProgressContainer');
    if (container) setTimeout(() => container.style.display = 'none', 1000);
}

// ==================== 事件绑定 ====================
export function initEventListeners() {
    document.querySelectorAll('.nav-item[data-page]').forEach(item => {
        item.addEventListener('click', () => switchPage(item.dataset.page));
    });
    document.querySelectorAll('.switcher-btn').forEach(btn => btn.addEventListener('click', () => switchHomeChart(btn.dataset.chart)));
    document.querySelectorAll('.tab-btn').forEach(btn => btn.addEventListener('click', () => switchTab(btn.dataset.tab)));
    document.querySelectorAll('.tab').forEach(btn => btn.addEventListener('click', () => switchTab(btn.dataset.tab)));
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
    document.getElementById('langSelector')?.addEventListener('change', (e) => {
        const lang = e.target.value;
        applyLanguage(lang);
        saveLanguageConfig(lang);
    });
}

// ==================== 更新位移指示器 ====================
export function updateDisplacementIndicator(avg) {
    if (!avg) return;
    const rawDisplacement = avg.eddy_current;
    const leftHasRpm = avg.left_rpm > 0.1;
    const rightHasRpm = avg.right_rpm > 0.1;

    let displayPositionPercent;
    let actualDisplacement;

    if (rightHasRpm && store.currentUpperHealth < 60) {
        displayPositionPercent = 0;
        actualDisplacement = 0;
    } else if (leftHasRpm && store.currentLowerHealth < 60) {
        displayPositionPercent = 100;
        actualDisplacement = 8;
    } else {
        actualDisplacement = rawDisplacement - initialDisplacement;
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
        const moveOffset = (actualDisplacement - 4) * 12.5;
        ringImg.style.transform = `translateX(${moveOffset}px)`;
    }
}

// ==================== 健康度参数显示更新 ====================
export function updateHealthParamDisplay() {
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
    if (initDispSpan) initDispSpan.innerText = initialDisplacement.toFixed(1);

    // 临界压力：有动态临界值则显示它，否则显示设置值
    if (upperCriticalSpan) {
        upperCriticalSpan.innerText = store.upperCriticalAvg !== null 
            ? mapPressure(store.upperCriticalAvg).toFixed(1) 
            : mapPressure(upperCriticalPressure).toFixed(1);
    }
    if (lowerCriticalSpan) {
        lowerCriticalSpan.innerText = store.lowerCriticalAvg !== null 
            ? mapPressure(store.lowerCriticalAvg).toFixed(1) 
            : mapPressure(lowerCriticalPressure).toFixed(1);
    }
}


////////////////通道映射///////////////////////////////////////////////////////////////////////////////////////


// ==================== 采集卡配置界面 ====================

// 传感器选项配置
const AI_SENSOR_OPTIONS = [
    { value: 'unused', label: '未使用' },
    { value: 'upper_pressure', label: '上限位轮压力' },
    { value: 'lower_pressure', label: '下限位轮压力' },
    { value: 'eddy_current', label: '电涡流位移' },
    { value: 'motor1', label: '电机1电流' },
    { value: 'motor2', label: '电机2电流' },
    { value: 'motor3', label: '电机3电流' },
    { value: 'motor4', label: '电机4电流' }
];

const CTR_SENSOR_OPTIONS = [
    { value: 'unused', label: '未使用' },
    { value: 'left_rpm', label: '左转速' },
    { value: 'right_rpm', label: '右转速' }
];

// 全局状态
let currentConfig = {
    device: 'Dev1',
    ai_channels: [],
    ctr_channels: [],
    ai_mapping: [],
    ctr_mapping: [],
    freq_min: 0.1,
    freq_max: 1000.0,
    pulses_per_rev: 1,
    sample_rate: 1000,
    ctr_timeout: 5.0,
    ctr_edge: 'RISING',
    ctr_units: 'HZ',
    ctr_meas_time: 1.0
};

// 加载并渲染采集卡配置界面
export async function loadChannelMappingUI() {
    await initDeviceSelector();
    await loadCurrentConfig();
    setupEventListeners();
}

// 初始化设备选择器
async function initDeviceSelector() {
    const selector = document.getElementById('deviceSelector');
    selector.innerHTML = '<option value="">扫描中...</option>';
    
    try {
        const res = await fetch('/api/config/devices');
        const data = await res.json();
        
        if (data.success && data.data.length > 0) {
            selector.innerHTML = data.data.map(dev => 
                `<option value="${dev}">${dev}</option>`
            ).join('');
        } else {
            selector.innerHTML = '<option value="">未发现设备</option>';
        }
    } catch (e) {
        console.error('获取设备列表失败:', e);
        selector.innerHTML = '<option value="">获取失败</option>';
    }
}

// 加载当前配置
async function loadCurrentConfig() {
    try {
        const res = await fetch('/api/config/all');
        const data = await res.json();
        const cfg = data.data;
        
        // 加载频率参数
        document.getElementById('portFreqMin').value = cfg.port.freq_min || 0.1;
        document.getElementById('portFreqMax').value = cfg.port.freq_max || 1000.0;
        document.getElementById('portPulsesPerRev').value = cfg.port.pulses_per_rev || 1;
        
        // 加载采集频率
        const sampleRateEl = document.getElementById('portSampleRate');
        if (sampleRateEl) {
            sampleRateEl.value = cfg.port.sample_rate || 1000;
        }
        // 加载AI采样频率
        const aiSampleRateEl = document.getElementById('portAiSampleRate');
        if (aiSampleRateEl) {
            aiSampleRateEl.value = cfg.port.ai_sample_rate || 1000;
        }
        const ctrTimeoutEl = document.getElementById('portCtrTimeout');
        if (ctrTimeoutEl) {
            ctrTimeoutEl.value = cfg.port.ctr_timeout || 5.0;
        }
        const ctrEdgeEl = document.getElementById('portCtrEdge');
        if (ctrEdgeEl) {
            ctrEdgeEl.value = cfg.port.ctr_edge || 'RISING';
        }
        const ctrUnitsEl = document.getElementById('portCtrUnits');
        if (ctrUnitsEl) {
            ctrUnitsEl.value = cfg.port.ctr_units || 'HZ';
        }
        const ctrMeasTimeEl = document.getElementById('portCtrMeasTime');
        if (ctrMeasTimeEl) {
            ctrMeasTimeEl.value = cfg.port.ctr_meas_time || 1.0;
        }
        
        // 设置当前配置状态
        currentConfig.device = cfg.port.device || 'Dev1';
        currentConfig.freq_min = cfg.port.freq_min || 0.1;
        currentConfig.freq_max = cfg.port.freq_max || 1000.0;
        currentConfig.pulses_per_rev = cfg.port.pulses_per_rev || 1;
        currentConfig.sample_rate = cfg.port.sample_rate || 1000;
        currentConfig.ai_sample_rate = cfg.port.ai_sample_rate || 1000;
        currentConfig.ctr_timeout = cfg.port.ctr_timeout || 5.0;
        currentConfig.ctr_edge = cfg.port.ctr_edge || 'RISING';
        currentConfig.ctr_units = cfg.port.ctr_units || 'HZ';
        currentConfig.ctr_meas_time = cfg.port.ctr_meas_time || 1.0;
        currentConfig.ai_mapping = cfg.channel_mapping?.ai || [];
        currentConfig.ctr_mapping = cfg.channel_mapping?.counter || [];
        
        // 更新 store 中的通道配置
        store.channelConfig.ai = currentConfig.ai_mapping.map(m => m.sensor);
        store.channelConfig.ctr = currentConfig.ctr_mapping.map(m => m.sensor);
        
        // 选择当前设备
        const deviceSelector = document.getElementById('deviceSelector');
        if (deviceSelector) {
            deviceSelector.value = currentConfig.device;
        }
        
        // 加载设备通道
        await loadDeviceChannels(currentConfig.device);
        
    } catch (e) {
        console.error('加载配置失败:', e);
    }
}

// 加载设备通道
async function loadDeviceChannels(deviceName) {
    if (!deviceName) return;
    
    try {
        const res = await fetch(`/api/config/devices/${deviceName}/channels`);
        const data = await res.json();
        
        if (data.success) {
            currentConfig.ai_channels = data.data.ai || [];
            currentConfig.ctr_channels = data.data.ctr || [];
            renderAiChannels();
            renderCtrChannels();
        }
    } catch (e) {
        console.error('获取通道列表失败:', e);
    }
}

// 渲染 AI 通道
function renderAiChannels() {
    const container = document.getElementById('aiChannelContainer');
    if (!container) return;
    
    container.innerHTML = currentConfig.ai_channels.map((ch, idx) => {
        const mapping = currentConfig.ai_mapping.find(m => m.channel === ch) || 
                        currentConfig.ai_mapping.find(m => m.index === idx) ||
                        { sensor: 'unused', scale: 1, offset: 0, min_val: -10.0, max_val: 10.0 };
        
        return `
            <div class="compact-channel-row" data-channel="${ch}">
                <div class="channel-label">
                    <i class="fas fa-sliders-h"></i>
                    <span>${ch}</span>
                </div>
                <div class="compact-channel-fields">
                    <select class="compact-select" data-type="ai" data-channel="${ch}">
                        ${AI_SENSOR_OPTIONS.map(opt => 
                            `<option value="${opt.value}" ${mapping.sensor === opt.value ? 'selected' : ''}>${opt.label}</option>`
                        ).join('')}
                    </select>
                    <div class="compact-input-group">
                        <span class="compact-label">量程:</span>
                        <input type="number" step="0.01" value="${mapping.scale || 1}" 
                               class="scale-input" data-type="ai" data-channel="${ch}">
                    </div>
                    <div class="compact-input-group">
                        <span class="compact-label">偏移:</span>
                        <input type="number" step="0.01" value="${mapping.offset || 0}" 
                               class="offset-input" data-type="ai" data-channel="${ch}">
                    </div>
                    <div class="compact-input-group">
                        <span class="compact-label">范围:</span>
                        <input type="number" step="0.1" value="${mapping.min_val || -10.0}" 
                               class="min-val-input" data-type="ai" data-channel="${ch}">
                        <span style="padding: 0 4px;">-</span>
                        <input type="number" step="0.1" value="${mapping.max_val || 10.0}" 
                               class="max-val-input" data-type="ai" data-channel="${ch}">
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

// 渲染计数器通道
function renderCtrChannels() {
    const container = document.getElementById('ctrChannelContainer');
    if (!container) return;
    
    container.innerHTML = currentConfig.ctr_channels.map(ch => {
        const mapping = currentConfig.ctr_mapping.find(m => m.channel === ch) ||
                        { 
                            sensor: 'unused', 
                            scale: 60, 
                            pulses_per_rev: 1,
                            freq_min: 0.01,
                            freq_max: 1000.0,
                            timeout: 5.0,
                            units: 'HZ',
                            edge: 'RISING',
                            meas_time: 1.0
                        };
        
        return `
            <div class="compact-channel-row" data-channel="${ch}">
                <div class="channel-label">
                    <i class="fas fa-tachometer-alt"></i>
                    <span>${ch}</span>
                </div>
                <div class="compact-channel-fields">
                    <select class="compact-select" data-type="ctr" data-channel="${ch}">
                        ${CTR_SENSOR_OPTIONS.map(opt => 
                            `<option value="${opt.value}" ${mapping.sensor === opt.value ? 'selected' : ''}>${opt.label}</option>`
                        ).join('')}
                    </select>
                    <div class="compact-input-group">
                        <span class="compact-label">PPR:</span>
                        <input type="number" step="1" value="${mapping.pulses_per_rev || 1}" 
                               class="ppr-input" data-type="ctr" data-channel="${ch}">
                    </div>
                    <div class="compact-input-group">
                        <span class="compact-label">系数:</span>
                        <input type="number" step="0.1" value="${mapping.scale || 60}" 
                               class="scale-input" data-type="ctr" data-channel="${ch}">
                    </div>
                    <div class="compact-input-group">
                        <span class="compact-label">范围(Hz):</span>
                        <input type="number" step="0.01" value="${mapping.freq_min || 0.01}" 
                               class="freq-min-input" data-type="ctr" data-channel="${ch}">
                        <span style="padding: 0 4px;">-</span>
                        <input type="number" step="0.1" value="${mapping.freq_max || 1000.0}" 
                               class="freq-max-input" data-type="ctr" data-channel="${ch}">
                    </div>
                    <div class="compact-input-group">
                        <span class="compact-label">超时(s):</span>
                        <input type="number" step="0.1" value="${mapping.timeout || 5.0}" 
                               class="timeout-input" data-type="ctr" data-channel="${ch}">
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

// 设置事件监听
function setupEventListeners() {
    // 刷新设备按钮
    const refreshBtn = document.getElementById('refreshDevicesBtn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', async () => {
            refreshBtn.querySelector('i').classList.add('fa-spin');
            await initDeviceSelector();
            refreshBtn.querySelector('i').classList.remove('fa-spin');
        });
    }
    
    // 测试设备按钮
    const testBtn = document.getElementById('testDeviceBtn');
    if (testBtn) {
        testBtn.addEventListener('click', async () => {
            const deviceName = document.getElementById('deviceSelector').value;
            if (!deviceName) {
                showToast('请先选择设备', 'warning');
                return;
            }
            
            const statusEl = document.getElementById('deviceStatus');
            statusEl.style.display = 'block';
            statusEl.className = 'device-status testing';
            statusEl.textContent = '测试中...';
            
            try {
                const res = await fetch(`/api/config/devices/${deviceName}/test`, { method: 'POST' });
                const data = await res.json();
                
                if (data.success) {
                    statusEl.className = 'device-status success';
                    statusEl.textContent = data.message;
                } else {
                    statusEl.className = 'device-status error';
                    statusEl.textContent = data.message;
                }
            } catch (e) {
                statusEl.className = 'device-status error';
                statusEl.textContent = '测试失败: ' + e.message;
            }
        });
    }
    
    // 设备选择变化
    const deviceSelector = document.getElementById('deviceSelector');
    if (deviceSelector) {
        deviceSelector.addEventListener('change', async (e) => {
            currentConfig.device = e.target.value;
            await loadDeviceChannels(e.target.value);
        });
    }
    
    // 保存按钮
    const saveBtn = document.getElementById('saveAllChannelConfig');
    if (saveBtn) {
        saveBtn.addEventListener('click', saveAllConfig);
    }
}

// 保存所有配置
async function saveAllConfig() {
    try {
        // 1. 保存端口配置
        const portFreqMinEl = document.getElementById('portFreqMin');
        const portFreqMaxEl = document.getElementById('portFreqMax');
        const portPulsesPerRevEl = document.getElementById('portPulsesPerRev');
        const portSampleRateEl = document.getElementById('portSampleRate');
        const portAiSampleRateEl = document.getElementById('portAiSampleRate');
        const portCtrTimeoutEl = document.getElementById('portCtrTimeout');
        const portCtrEdgeEl = document.getElementById('portCtrEdge');
        const portCtrUnitsEl = document.getElementById('portCtrUnits');
        const portCtrMeasTimeEl = document.getElementById('portCtrMeasTime');
        
        const portConfig = {
            device: currentConfig.device,
            freq_min: portFreqMinEl ? parseFloat(portFreqMinEl.value) : 0.1,
            freq_max: portFreqMaxEl ? parseFloat(portFreqMaxEl.value) : 1000.0,
            pulses_per_rev: portPulsesPerRevEl ? parseInt(portPulsesPerRevEl.value) : 1,
            sample_rate: portSampleRateEl ? parseInt(portSampleRateEl.value) : 1000,
            ai_sample_rate: portAiSampleRateEl ? parseInt(portAiSampleRateEl.value) : 1000,
            ctr_timeout: portCtrTimeoutEl ? parseFloat(portCtrTimeoutEl.value) : 5.0,
            ctr_edge: portCtrEdgeEl ? portCtrEdgeEl.value : 'RISING',
            ctr_units: portCtrUnitsEl ? portCtrUnitsEl.value : 'HZ',
            ctr_meas_time: portCtrMeasTimeEl ? parseFloat(portCtrMeasTimeEl.value) : 1.0,
            // 构建 AI 通道范围字符串 (如 "ai0:15")
            ai_channels: currentConfig.ai_channels.length > 0 ? 
                `${currentConfig.ai_channels[0]}:${currentConfig.ai_channels[currentConfig.ai_channels.length - 1].replace('ai', '')}` : 'ai0:7',
            counter1: currentConfig.ctr_channels[0] || 'ctr0',
            counter2: currentConfig.ctr_channels[1] || 'ctr1'
        };
        
        await fetch('/api/config/ports/save', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(portConfig)
        });
        
        // 2. 收集 AI 映射
        const aiMappings = [];
        // 支持两种选择器：新的 channel-select 和旧的 sensor-select
        const aiSelects = getMappingSelects(document, 'ai');
        
        aiSelects.forEach((select, idx) => {
            const channel = select.dataset.channel;
            const sensor = select.value;
            if (sensor !== 'unused') {
                const scaleEl = document.querySelector(`.scale-input[data-type="ai"][data-channel="${channel}"]`);
                const offsetEl = document.querySelector(`.offset-input[data-type="ai"][data-channel="${channel}"]`);
                const minValEl = document.querySelector(`.min-val-input[data-type="ai"][data-channel="${channel}"]`);
                const maxValEl = document.querySelector(`.max-val-input[data-type="ai"][data-channel="${channel}"]`);
                const scale = scaleEl ? parseFloat(scaleEl.value) : 1.0;
                const offset = offsetEl ? parseFloat(offsetEl.value) : 0.0;
                const min_val = minValEl ? parseFloat(minValEl.value) : -10.0;
                const max_val = maxValEl ? parseFloat(maxValEl.value) : 10.0;
                aiMappings.push({ 
                    channel: channel,
                    index: idx,
                    sensor: sensor, 
                    scale: scale, 
                    offset: offset,
                    min_val: min_val,
                    max_val: max_val
                });
            }
        });
        
        // 3. 收集计数器映射
        const ctrMappings = [];
        // 支持两种选择器：新的 channel-select 和旧的 sensor-select
        const ctrSelects = getMappingSelects(document, 'ctr');
        
        ctrSelects.forEach(select => {
            const channel = select.dataset.channel;
            const sensor = select.value;
            if (sensor !== 'unused') {
                const pprEl = document.querySelector(`.ppr-input[data-type="ctr"][data-channel="${channel}"]`);
                const scaleEl = document.querySelector(`.scale-input[data-type="ctr"][data-channel="${channel}"]`);
                const freqMinEl = document.querySelector(`.freq-min-input[data-type="ctr"][data-channel="${channel}"]`);
                const freqMaxEl = document.querySelector(`.freq-max-input[data-type="ctr"][data-channel="${channel}"]`);
                const timeoutEl = document.querySelector(`.timeout-input[data-type="ctr"][data-channel="${channel}"]`);
                const measTimeEl = document.querySelector(`.meas-time-input[data-type="ctr"][data-channel="${channel}"]`);
                const edgeSel = document.querySelector(`.edge-select[data-type="ctr"][data-channel="${channel}"]`);
                const unitsSel = document.querySelector(`.units-select[data-type="ctr"][data-channel="${channel}"]`);
                
                const ppr = pprEl ? parseInt(pprEl.value) : 1;
                const scale = scaleEl ? parseFloat(scaleEl.value) : 60.0;
                const freq_min = freqMinEl ? parseFloat(freqMinEl.value) : 0.01;
                const freq_max = freqMaxEl ? parseFloat(freqMaxEl.value) : 1000.0;
                const timeout = timeoutEl ? parseFloat(timeoutEl.value) : 5.0;
                const meas_time = measTimeEl ? parseFloat(measTimeEl.value) : 1.0;
                const edge = edgeSel ? edgeSel.value : 'RISING';
                const units = unitsSel ? unitsSel.value : 'HZ';
                
                ctrMappings.push({ 
                    channel: channel,
                    sensor: sensor, 
                    pulses_per_rev: ppr, 
                    scale: scale,
                    freq_min: freq_min,
                    freq_max: freq_max,
                    timeout: timeout,
                    meas_time: meas_time,
                    edge: edge,
                    units: units
                });
            }
        });
        
        // 4. 保存通道映射
        await fetch('/api/config/channel_mapping', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ai: aiMappings, counter: ctrMappings })
        });
        
        showToast('配置保存成功！', 'success');
        
        // 5. 保存当前配置到 local memory，不重新加载UI以避免数据丢失
        currentConfig.ai_mapping = aiMappings;
        currentConfig.ctr_mapping = ctrMappings;
        currentConfig.freq_min = portConfig.freq_min;
        currentConfig.freq_max = portConfig.freq_max;
        currentConfig.pulses_per_rev = portConfig.pulses_per_rev;
        currentConfig.sample_rate = portConfig.sample_rate;
        currentConfig.ai_sample_rate = portConfig.ai_sample_rate;
        currentConfig.ctr_timeout = portConfig.ctr_timeout;
        currentConfig.ctr_edge = portConfig.ctr_edge;
        currentConfig.ctr_units = portConfig.ctr_units;
        currentConfig.ctr_meas_time = portConfig.ctr_meas_time;
        
        // 更新 store 中的通道配置
        store.channelConfig.ai = aiMappings.map(m => m.sensor);
        store.channelConfig.ctr = ctrMappings.map(m => m.sensor);
        
        // 6. 确保图表正确恢复 - 主动触发图表刷新
        setTimeout(() => {
            // 检查并重新初始化任何缺失的图表
            refreshAllCharts();
        }, 100);
        
    } catch (e) {
        console.error('保存配置失败:', e);
        showToast('保存失败: ' + e.message, 'error');
    }
}

// 新增函数：刷新所有图表
function refreshAllCharts() {
    console.log('正在刷新所有图表...');
    
    // 1. 获取所有 ECharts 实例并调整尺寸
    Object.values(store.charts).forEach(chart => {
        if (chart) {
            try {
                // 判断图表容器是否可见
                const container = chart.renderTo || (chart.getDom && chart.getDom());
                const isVisible = container && container.offsetWidth > 0 && container.offsetHeight > 0;
                
                if (isVisible) {
                    if (typeof chart.resize === 'function') {
                        chart.resize(); // ECharts
                    } else if (typeof chart.reflow === 'function') {
                        chart.reflow(); // Highcharts
                    }
                }
            } catch (e) {
                console.warn('图表刷新失败:', e);
            }
        }
    });
    
    // 刷新额外不在 store.charts 中的图表
    if (store.faultKeyChart && store.faultKeyChart.getDom && store.faultKeyChart.getDom().offsetWidth > 0) {
        store.faultKeyChart.resize();
    }
    if (store.healthTrendChart && store.healthTrendChart.getDom && store.healthTrendChart.getDom().offsetWidth > 0) {
        store.healthTrendChart.resize();
    }
}

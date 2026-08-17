/**
 * 主入口文件
 * 初始化所有模块，启动应用
 */
import { initCore, store } from './core.js';
import { loadAllConfigs } from './config.js';
import { initWebSocket } from './websocket.js';
import { initCharts } from './charts.js';
import { initEventListeners, updateDateTime, createProgressBar, showToast } from './ui.js';
import { loadImages, startAnimations } from './animation.js';
import { loadInitialData, loadSavedData } from './data-loader.js';
import { initDataManager, addCoaxialPoint, addRunoutPoint, saveIndicators, getCurrentData } from './dataManager.js';
import { loadChannelMappingUI } from './ui.js';
import * as DataRecordManager from './data-manager.js';
import { initVersionManager } from './version-manager.js';

document.addEventListener('DOMContentLoaded', async function() {
    initCore();
    await initDataManager();          // 必须先初始化数据管理器
    await loadAllConfigs();           // 加载配置（会从 dataManager 读取）
    initWebSocket();                  // 建立 WebSocket 连接
    initEventListeners();             // 绑定 UI 事件
    initCharts();                     // 初始化图表（内部会从 dataManager 读取历史数据）
    await loadInitialData();          // 加载初始数据（填充 UI）
    loadSavedData();                  // 历史数据已由 dataManager 处理
    updateDateTime();                 // 显示时间
    setInterval(updateDateTime, 1000);
    loadImages();                     // 预加载图片
    startAnimations();                // 启动动画
    createProgressBar();              // 创建进度条
    // startDataSimulation();            // 启动数据模拟
    loadChannelMappingUI();
    initVersionManager();             // 初始化版本管理
    
    // 数据管理模块初始化
    DataRecordManager.initDataManager();

    // ==================== 双风格切换逻辑 ====================
    const themeToggleBtn = document.getElementById('themeToggleBtn');
    const standardApp = document.getElementById('standardApp');
    const immersiveApp = document.getElementById('immersiveApp');
    
    let isImmersive = localStorage.getItem('theme') === 'immersive';
    
    function applyTheme() {
        if (isImmersive) {
            document.body.classList.add('theme-immersive');
            if(standardApp) standardApp.style.display = 'none';
            if(immersiveApp) immersiveApp.style.display = 'block';
            if(themeToggleBtn) {
                themeToggleBtn.innerHTML = '<i class="fas fa-magic"></i> <span>标准模式</span>';
            }
            if (window.ImmersiveView && !window._immersiveInitialized) {
                window.ImmersiveView.init();
                window._immersiveInitialized = true;
            }
            setTimeout(() => {
                window.dispatchEvent(new Event('resize'));
                if(window.ImmersiveView) window.ImmersiveView.resizeCharts();
            }, 100);
        } else {
            document.body.classList.remove('theme-immersive');
            if(standardApp) standardApp.style.display = 'flex';
            if(immersiveApp) immersiveApp.style.display = 'none';
            if(themeToggleBtn) {
                themeToggleBtn.innerHTML = '<i class="fas fa-magic"></i> <span>沉浸模式</span>';
            }
            setTimeout(() => {
                window.dispatchEvent(new Event('resize'));
            }, 100);
        }
    }
    
    if (themeToggleBtn) {
        themeToggleBtn.addEventListener('click', () => {
            isImmersive = !isImmersive;
            localStorage.setItem('theme', isImmersive ? 'immersive' : 'standard');
            applyTheme();
        });
    }
    
    applyTheme();
    // ==========================================================
    
    // 将 initCharts 暴露到全局，以便页面切换时可以调用
    window.initCharts = initCharts;
    
    // 确保所有图表在页面加载后重新调整大小
    setTimeout(() => {
        Object.values(store.charts).forEach(chart => {
            if (chart) {
                if (typeof chart.resize === 'function') {
                    chart.resize(); // ECharts
                } else if (typeof chart.reflow === 'function') {
                    chart.reflow(); // Highcharts
                }
            }
        });
    }, 300);
});

// 全局函数：刷新数据记录
window.refreshDataRecords = function() {
    DataRecordManager.renderDataRecords('dataRecordsContainer');
};

// 重写导航点击，支持数据管理页面
const originalSwitchPage = window.switchPage;
window.switchPage = function(pageName) {
    // 先调用原有的switchPage函数
    if (originalSwitchPage) {
        originalSwitchPage(pageName);
    } else {
        // 如果原始函数不存在，执行基本切换
        document.querySelectorAll('.nav-item').forEach(item => {
            item.classList.remove('active');
            if (item.dataset.page === pageName) {
                item.classList.add('active');
            }
        });
        document.querySelectorAll('.page').forEach(page => {
            page.classList.remove('active');
            if (page.id === pageName + 'Page') {
                page.classList.add('active');
            }
        });
    }
    
    // 如果是数据管理页面，加载数据
    if (pageName === 'data') {
        DataRecordManager.renderDataRecords('dataRecordsContainer');
    }
};

// ==================== 全局函数供 HTML 内联调用 ====================
window.updateCoaxialChart = async function() {
    const coaxialInEl = document.getElementById('coaxialIn');
    const verticalOutEl = document.getElementById('verticalOut');
    if (!coaxialInEl || !verticalOutEl) {
        console.warn('同轴度输入框不存在');
        return;
    }
    const coaxialIn = parseFloat(coaxialInEl.value) || 0;
    const verticalOut = parseFloat(verticalOutEl.value) || 0;
    await addCoaxialPoint(coaxialIn, verticalOut);
    // 刷新图表
    const data = getCurrentData();
    const times = data.coaxialHistory.map(item => item.time);
    const coaxialData = data.coaxialHistory.map(item => item.coaxialIn);
    const verticalData = data.coaxialHistory.map(item => item.verticalOut);
    if (store.charts.coaxial) {
        store.charts.coaxial.setOption({
            xAxis: { data: times },
            series: [{ data: coaxialData }, { data: verticalData }]
        });
    }
};

window.updateRunoutChart = async function() {
    const runout1El = document.getElementById('runout1');
    const runout2El = document.getElementById('runout2');
    const runout3El = document.getElementById('runout3');
    const runout4El = document.getElementById('runout4');
    if (!runout1El || !runout2El || !runout3El || !runout4El) {
        console.warn('跳动度输入框不存在');
        return;
    }
    const wheel1 = parseFloat(runout1El.value) || 0;
    const wheel2 = parseFloat(runout2El.value) || 0;
    const wheel3 = parseFloat(runout3El.value) || 0;
    const wheel4 = parseFloat(runout4El.value) || 0;
    await addRunoutPoint(wheel1, wheel2, wheel3, wheel4);
    const data = getCurrentData();
    const times = data.runoutHistory.map(item => item.time);
    const runoutData = [
        data.runoutHistory.map(item => item.wheel1),
        data.runoutHistory.map(item => item.wheel2),
        data.runoutHistory.map(item => item.wheel3),
        data.runoutHistory.map(item => item.wheel4)
    ];
    if (store.charts.runout) {
        store.charts.runout.setOption({
            xAxis: { data: times },
            series: [
                { data: runoutData[0] },
                { data: runoutData[1] },
                { data: runoutData[2] },
                { data: runoutData[3] }
            ]
        });
    }
};

window.saveKeyIndicatorsFromCharts = async function() {
    const envTemp = parseFloat(document.getElementById('chartsEnvTemp').value) || 0;
    const contactArea = parseFloat(document.getElementById('chartsContactArea').value) || 0;
    const wheelGap = parseFloat(document.getElementById('chartsWheelGap').value) || 0;
    const vibrationVal = parseFloat(document.getElementById('chartsVibrationVal').value) || 0;
    const testTime = parseFloat(document.getElementById('chartsTestTime').value) || 0;
    await saveIndicators({
        environment_temp: envTemp,
        contact_area: contactArea,
        wheel_gap: wheelGap,
        vibration_value: vibrationVal,
        test_time: testTime
    });
    showToast('关键指标已保存', 'success');
};

window.saveBasicInfoFromSettings = async function() {
    // 直接调用 config.js 中的实现（通过动态导入）
    const { saveBasicInfoFromSettings } = await import('./config.js');
    saveBasicInfoFromSettings();
};

// 其他全局函数（如 switchRpmMode 等）保持不变
window.switchRpmMode = function(mode) {
    // 实现与原代码相同，但注意 store.rpmDisplayMode
    // 为了完整性，这里给出简单实现
    store.rpmDisplayMode = mode;
    document.querySelectorAll('[data-rpm-mode]').forEach(btn => btn.classList.toggle('active', btn.dataset.rpmMode === mode));
    document.getElementById('leftRpmUnit').innerText = mode === 'value' ? 'RPM' : 'V';
    document.getElementById('rightRpmUnit').innerText = mode === 'value' ? 'RPM' : 'V';
    // 刷新图表
    import('./charts.js').then(({ updateCharts }) => updateCharts());
};
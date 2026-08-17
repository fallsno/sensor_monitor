/**
 * WebSocket 模块
 * 管理 Socket.IO 连接，处理数据推送事件，以及控制函数
 */
import { store } from './core.js';
import { updateDisplayWithSecondAverage } from './charts.js';
import { showToast, updateSystemStatus, hideProgress } from './ui.js';
import { i18n, currentLang } from './config.js';
import { stopFilePlayback } from './file-handler.js';

// 导入健康度相关的 UI 更新函数
import { updateHealthDisplay, updateWheelStatusFromHealth } from './ui.js';

export let socket;

export function initWebSocket() {
    store.socket = io({
        reconnection: true,
        reconnectionAttempts: 5,
        timeout: 30000
    });
    store.socket.on('connect', () => {
        console.log('WebSocket已连接');
        store.socket.emit('request_data');
    });

    store.socket.on('disconnect', () => {
        console.log('WebSocket断开连接');
    });


        // 监听周期数据（故障关键信息图表）
    store.socket.on('cycle_data', (cycleData) => {
        console.log('[CYCLE_DATA]', cycleData);
        const timestamp = new Date().toLocaleTimeString();
        store.cycleTimes.push(timestamp);
        store.upperCycleAvgHistory.push(cycleData.upper_avg);
        store.upperCycleMinHistory.push(cycleData.upper_min);
        store.lowerCycleAvgHistory.push(cycleData.lower_avg);
        store.lowerCycleMinHistory.push(cycleData.lower_min);
        if (store.cycleTimes.length > 50) {
            store.cycleTimes.shift();
            store.upperCycleAvgHistory.shift();
            store.upperCycleMinHistory.shift();
            store.lowerCycleAvgHistory.shift();
            store.lowerCycleMinHistory.shift();
        }
        // 刷新故障关键信息图表
        import('./health.js').then(({ updateFaultKeyChart }) => updateFaultKeyChart());
    });

    // 统一按钮状态更新函数（内部使用）
    function updateControlButtons(isCollecting) {
        try {
            const startBtn = document.getElementById('startBtn');
            const stopBtn = document.getElementById('stopBtn');
            const saveBtn = document.getElementById('saveBtn');
            const monitorBtn = document.getElementById('monitorBtn');
            
            if (startBtn) startBtn.disabled = isCollecting;
            if (stopBtn) stopBtn.disabled = !isCollecting;
            if (saveBtn) saveBtn.disabled = !isCollecting;
            if (monitorBtn) monitorBtn.disabled = isCollecting;
        } catch (e) {
            console.error('updateControlButtons 错误:', e);
        }
    }

    store.socket.on('data_update', (payload) => {
        const { avg, health, is_collecting } = payload;
        if (avg) {
            updateDisplayWithSecondAverage(avg);
        }
        if (health) {
            store.currentUpperHealth = health.upper_health || 100;
            store.currentLowerHealth = health.lower_health || 100;
            updateHealthDisplay(health.system_health, health.upper_health, health.lower_health);
            updateWheelStatusFromHealth(health.upper_health, health.lower_health);
            // 更新健康度趋势图
            import('./health.js').then(({ updateHealthTrend }) => updateHealthTrend(health.system_health));
        }
        if (is_collecting !== undefined) {
            store.isCollecting = is_collecting;
            store.systemStatus.collecting = is_collecting;
            updateControlButtons(is_collecting);
        }

        // 推送真实数据到沉浸式视图
        if (window.ImmersiveView && typeof window.ImmersiveView.updateRealData === 'function') {
            window.ImmersiveView.updateRealData(payload);
        }
    });

    store.socket.on('status_sync', (status) => {
        if (status.avg) updateDisplayWithSecondAverage(status.avg);
        if (status.health) {
            updateHealthDisplay(status.health.system_health,
                            status.health.upper_health,
                            status.health.lower_health);
            updateWheelStatusFromHealth(status.health.upper_health, status.health.lower_health);
        }
        if (status.is_collecting !== undefined) {
            store.isCollecting = status.is_collecting;
            store.systemStatus.collecting = status.is_collecting;
            updateControlButtons(status.is_collecting);
        }
        
        // 推送同步数据到沉浸式视图
        if (window.ImmersiveView && typeof window.ImmersiveView.updateRealData === 'function') {
            window.ImmersiveView.updateRealData(status);
        }
    });
    
    // 监听配置更新事件 - 实现多客户端配置同步
    store.socket.on('config_update', (data) => {
        console.log('收到配置更新:', data);
        if (data.config) {
            // 更新本地配置
            store.config = data.config;
            
            // 提示用户
            showToast('配置已同步更新', 'info');
        }
    });
}

// ==================== 控制函数 ====================
export function startCollection() {
    fetch('/api/control/start', { method: 'POST' })
        .then(res => res.json())
        .then(data => {
            if (!data.success) {
                showToast('❌ 启动失败: ' + (data.message || ''), 'error');
            }
        })
        .catch(err => {
            console.error('开始检测失败:', err);
            showToast('⚠️ 启动失败，请重试', 'warning');
        });
}

export function stopCollection() {
    fetch('/api/control/stop', { method: 'POST' })
        .then(res => res.json())
        .then(data => {
            if (!data.success) {
                showToast('❌ 停止失败', 'error');
            }
        })
        .catch(err => {
            console.error('停止失败:', err);
            showToast('⚠️ 停止失败', 'warning');
        });
}

export function saveData() {
    const savePathInput = document.getElementById('savePath');
    const path = (savePathInput ? savePathInput.value : '') || localStorage.getItem('savePath') || './data';
    fetch('/api/control/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: path })
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            store.systemStatus.saving = true;
            store.systemStatus.statusType = 'saving';
            store.systemStatus.statusText = i18n[currentLang].statusSaving;
            updateSystemStatus();
            showToast(i18n[currentLang].saveData + ' ' + i18n[currentLang].to + ': ' + path, 'success');
        }
    });
}
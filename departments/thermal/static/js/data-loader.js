/**
 * 数据加载模块
 * 从后端加载初始数据、历史手动数据（现在统一由 dataManager 管理）
 */
import { store } from './core.js';
import { initDataManager, getCurrentData } from './dataManager.js';
import { updateSystemStatus } from './ui.js';

export async function loadInitialData() {
    await initDataManager();
    const data = getCurrentData();

    // 填充基本信息到导航栏
    document.getElementById('navCustomerName').innerText = data.basic.customerName;
    document.getElementById('navMachineNo').innerText = data.basic.machineNo;
    document.getElementById('navOrderNo').innerText = data.basic.orderNo;
    document.getElementById('navModelNo').innerText = data.basic.modelNo;

    // 填充设置页面基本信息输入框
    document.getElementById('settingsCustomerName').value = data.basic.customerName;
    document.getElementById('settingsMachineNo').value = data.basic.machineNo;
    document.getElementById('settingsOrderNo').value = data.basic.orderNo;
    document.getElementById('settingsModelNo').value = data.basic.modelNo;

    // 填充关键指标输入框
    document.getElementById('chartsEnvTemp').value = data.indicators.environment_temp;
    document.getElementById('chartsContactArea').value = data.indicators.contact_area;
    document.getElementById('chartsWheelGap').value = data.indicators.wheel_gap;
    document.getElementById('chartsVibrationVal').value = data.indicators.vibration_value;
    document.getElementById('chartsTestTime').value = data.indicators.test_time;

    // 填充同轴度/跳动度当前值（安全访问）
    const coaxialHistory = data.coaxialHistory || [];
    const lastCoaxial = coaxialHistory[coaxialHistory.length - 1];
    if (lastCoaxial) {
        document.getElementById('coaxialIn').value = lastCoaxial.coaxialIn;
        document.getElementById('verticalOut').value = lastCoaxial.verticalOut;
    }
    const runoutHistory = data.runoutHistory || [];
    const lastRunout = runoutHistory[runoutHistory.length - 1];
    if (lastRunout) {
        document.getElementById('runout1').value = lastRunout.wheel1;
        document.getElementById('runout2').value = lastRunout.wheel2;
        document.getElementById('runout3').value = lastRunout.wheel3;
        document.getElementById('runout4').value = lastRunout.wheel4;
    }

    // 尝试获取实时状态（可选）
    try {
        const statusRes = await fetch('/api/control/status');
        const statusData = await statusRes.json();
        Object.assign(store.systemStatus, statusData);
        updateSystemStatus();
    } catch (err) { console.log('获取状态失败'); }
}

export async function loadSavedData() {
    // 历史数据已由 dataManager 管理，无需额外加载
    // 此函数保留以兼容原有调用，但实际无操作
    console.log('历史数据已通过 dataManager 加载');
}
/**
 * 统一数据管理模块
 * 使用后端统一配置 API，localStorage 作为备份
 */

let currentData = null;
const API_BASE = '/api/config';
const STORAGE_KEY = 'monitor_system_data';

function cloneDeep(obj) {
    return JSON.parse(JSON.stringify(obj));
}

function loadFromLocalStorage() {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
        try {
            currentData = JSON.parse(stored);
        } catch (e) {
            console.warn('解析 localStorage 数据失败', e);
        }
    }
    if (!currentData) {
        // 默认值（应与后端默认一致）
        currentData = {
            version: '1.0',
            basic: { customerName: 'XX水泥', machineNo: 'DR-2602', orderNo: 'PO-001', modelNo: 'V3.5.3' },
            indicators: { environment_temp: 25.6, contact_area: 92.5, wheel_gap: 2.35, vibration_value: 0.18, test_time: 127.5 },
            pressure: { originalMax: 5.0, displayMax: 300, unit: 'MPa' },
            health: { upperPreloadPressure: 2.0, upperCriticalPressure: 3.5, lowerPreloadPressure: 2.0, lowerCriticalPressure: 3.5, cycleSeconds: 60, initialDisplacement: 0.0 },
            port: { device: 'Dev1', ai_channels: 'ai2:9', counter1: 'ctr0', counter2: 'ctr1', freq_min: 0.1, freq_max: 1000.0, pulses_per_rev: 1 },
            coaxialHistory: [],   // 同轴度历史
            runoutHistory: [],    // 跳动度历史
            language: 'zh'
        };
    }
    return currentData;
}

function saveToLocalStorage() {
    if (currentData) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(currentData));
    }
}


function normalizeData(data) {
    if (!data) return data;
    if (!data.coaxialHistory) data.coaxialHistory = [];
    if (!data.runoutHistory) data.runoutHistory = [];
    // language 已由后端转换为字符串，无需处理
    return data;
}


export async function initDataManager() {
    try {
        const res = await fetch(`${API_BASE}/all`);
        if (res.ok) {
            const result = await res.json();
            if (result.success) {
                currentData = result.data;
                saveToLocalStorage();
                return currentData;
            }
        }
    } catch (err) {
        console.warn('从后端加载配置失败', err);
    }
    loadFromLocalStorage();
    return currentData;
}

export function getCurrentData() {
    if (!currentData) {
        loadFromLocalStorage();
    }
    return currentData;
}

export async function saveAllData() {
    saveToLocalStorage();
    try {
        await fetch(`${API_BASE}/all`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ data: currentData })
        });
    } catch (err) {
        console.warn('保存配置到后端失败', err);
    }
}

// ==================== 各模块专用保存方法 ====================
export async function saveBasicInfo(basicInfo) {
    currentData.basic = { ...currentData.basic, ...basicInfo };
    await saveAllData();
}

export async function saveHealthParams(params) {
    currentData.health = { ...currentData.health, ...params };
    await saveAllData();
}

export async function savePortConfig(config) {
    currentData.port = { ...currentData.port, ...config };
    await saveAllData();
}

export async function savePressureMapping(mapping) {
    currentData.pressure = { ...currentData.pressure, ...mapping };
    await saveAllData();
}

export async function saveIndicators(indicators) {
    currentData.indicators = { ...currentData.indicators, ...indicators };
    await saveAllData();
}

// ==================== 同轴度/跳动度历史数据（独立保存）====================
// 这些数据不纳入统一配置，使用后端独立接口


// 修改 addCoaxialPoint 函数
export async function addCoaxialPoint(coaxialIn, verticalOut) {
    const now = new Date().toLocaleTimeString();
    // 确保 coaxialHistory 存在
    if (!currentData.coaxialHistory) currentData.coaxialHistory = [];
    currentData.coaxialHistory.push({ time: now, coaxialIn, verticalOut });
    if (currentData.coaxialHistory.length > 50) currentData.coaxialHistory.shift();
    await saveAllData();
    return true;
}

export async function addRunoutPoint(wheel1, wheel2, wheel3, wheel4) {
    const now = new Date().toLocaleTimeString();
    // 确保 runoutHistory 存在
    if (!currentData.runoutHistory) currentData.runoutHistory = [];
    currentData.runoutHistory.push({ time: now, wheel1, wheel2, wheel3, wheel4 });
    if (currentData.runoutHistory.length > 50) currentData.runoutHistory.shift();
    await saveAllData();
    return true;
}
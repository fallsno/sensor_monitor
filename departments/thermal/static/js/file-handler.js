/**
 * 文件处理模块
 * 包括浏览文件、加载大文件（流式）、文件监控、播放控制
 */
import { store } from './core.js';
import { showProgress, hideProgress, showToast, updateSystemStatus } from './ui.js';
import { i18n, currentLang } from './config.js';
import { updateDisplayWithSecondAverage, updateCharts, resetDisplayData } from './charts.js';

// ==================== 浏览文件 ====================
export function browseFile() {
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

// ==================== 加载文件数据（流式分块）====================
export async function loadFileData() {
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.csv';
    fileInput.style.display = 'none';
    document.body.appendChild(fileInput);
    fileInput.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) { document.body.removeChild(fileInput); return; }
        showProgress(0, i18n[currentLang].preparing + ': ' + file.name);
        store.fileDataPlaying = false;
        if (store.filePlaybackInterval) clearInterval(store.filePlaybackInterval);
        store.fileDataQueue.length = 0;
        store.pendingChunks.length = 0;
        store.fileTotalPoints = 0;
        store.isWorkerProcessing = true;
        store.fileAllChunksReceived = false;
        store.fileCurrentChunkIndex = 0;
        store.fileCurrentDataIndex = 0;
        const CHUNK_SIZE = 1024 * 1024; // 1MB
        const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
        let chunksProcessed = 0;
        if (store.fileWorker) store.fileWorker.terminate();
        const worker = new Worker('/static/js/file-worker.js');
        store.fileWorker = worker;
        worker.onmessage = (msg) => {
            if (msg.data.success) {
                const { data, isLast } = msg.data;
                const points = data.points;
                if (points.length > 0) {
                    store.pendingChunks.push(points);
                    store.fileTotalPoints += points.length;
                    if (!store.fileDataPlaying && store.fileDataQueue.length === 0 && store.pendingChunks.length > 0) {
                        store.fileDataQueue.push(store.pendingChunks.shift());
                        startChunkedPlayback();
                    }
                }
                if (isLast) {
                    store.fileAllChunksReceived = true;
                    store.isWorkerProcessing = false;
                    showProgress(100, i18n[currentLang].fileLoaded + `，共 ${store.fileTotalPoints} 条记录`);
                } else {
                    chunksProcessed++;
                    const percent = Math.floor((chunksProcessed / totalChunks) * 100);
                    showProgress(percent, i18n[currentLang].parsing + ` ${chunksProcessed}/${totalChunks} ` + i18n[currentLang].chunks);
                }
            } else {
                showToast(i18n[currentLang].parseError + ': ' + msg.data.error, 'error');
                store.isWorkerProcessing = false;
                hideProgress();
            }
        };
        let offset = 0;
        while (offset < file.size) {
            while (store.pendingChunks.length >= store.MAX_PENDING_CHUNKS) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
            const blob = file.slice(offset, offset + CHUNK_SIZE);
            const text = await blob.text();
            worker.postMessage({ chunk: text, filename: file.name, startLine: 0, isLast: offset + CHUNK_SIZE >= file.size });
            offset += CHUNK_SIZE;
        }
        document.body.removeChild(fileInput);
        console.log('文件加载完成，总数据点数:', store.fileTotalPoints, '待处理块数:', store.pendingChunks.length);
    };
    fileInput.click();
}

function startChunkedPlayback() {
    if (store.filePlaybackInterval) clearInterval(store.filePlaybackInterval);
    if (store.fileDataQueue.length === 0) return;
    store.fileDataPlaying = true;
    store.fileCurrentChunkIndex = 0;
    store.fileCurrentDataIndex = 0;
    const firstPoint = getCurrentQueuePoint();
    store.fileCurrentSecond = firstPoint ? Math.floor(firstPoint.timestamp) : 0;
    console.log('开始播放，总点数:', store.fileTotalPoints, '第一个点:', firstPoint);
    store.systemStatus.collecting = true;
    store.systemStatus.statusType = 'collecting';
    store.systemStatus.statusText = i18n[currentLang].playingFile || '文件播放中...';
    updateSystemStatus();
    document.getElementById('startBtn').disabled = true;
    document.getElementById('saveBtn').disabled = false;
    document.getElementById('stopBtn').disabled = false;
    showToast(i18n[currentLang].startPlay + `，共 ${store.fileTotalPoints} 条记录`, 'success');
    store.filePlaybackInterval = setInterval(() => {
        if (!store.fileDataPlaying) return;
        const hasMore = processNextSecondFromQueue();
        if (!hasMore) stopFilePlayback();
    }, 1000);
}

function getCurrentQueuePoint() {
    if (store.fileDataQueue.length === 0) return null;
    const chunk = store.fileDataQueue[store.fileCurrentChunkIndex];
    if (!chunk || store.fileCurrentDataIndex >= chunk.length) return null;
    return chunk[store.fileCurrentDataIndex];
}

function advanceQueuePointer() {
    store.fileCurrentDataIndex++;
    if (store.fileCurrentDataIndex >= store.fileDataQueue[store.fileCurrentChunkIndex].length) {
        store.fileDataQueue.shift();
        store.fileCurrentChunkIndex = 0;
        store.fileCurrentDataIndex = 0;
    }
}

function processNextSecondFromQueue() {
    if (store.fileDataQueue.length === 0) {
        if (store.pendingChunks.length > 0) {
            store.fileDataQueue.push(store.pendingChunks.shift());
            store.fileCurrentChunkIndex = 0;
            store.fileCurrentDataIndex = 0;
            return true;
        } else {
            return store.fileAllChunksReceived ? false : true;
        }
    }
    let point = getCurrentQueuePoint();
    if (!point) { advanceQueuePointer(); return true; }
    let pointSec = Math.floor(point.timestamp);
    if (pointSec > store.fileCurrentSecond) {
        updateDisplayWithSecondAverage(null);
        store.fileCurrentSecond = pointSec;
        return true;
    }
    if (pointSec < store.fileCurrentSecond) { advanceQueuePointer(); return true; }
    let pointsInSecond = [];
    while (true) {
        point = getCurrentQueuePoint();
        if (!point) break;
        if (Math.floor(point.timestamp) === store.fileCurrentSecond) {
            pointsInSecond.push(point);
            advanceQueuePointer();
        } else break;
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
        console.log(`秒 ${store.fileCurrentSecond} 处理了 ${pointsInSecond.length} 个点，平均值:`, avg);
        updateDisplayWithSecondAverage(avg);
    } else {
        updateDisplayWithSecondAverage(null);
    }
    store.fileCurrentSecond++;
    const processedTotal = (store.fileTotalPoints - (store.fileDataQueue.flat().length + store.pendingChunks.flat().length));
    const percent = store.fileTotalPoints > 0 ? Math.min(99, Math.floor((processedTotal / store.fileTotalPoints) * 100)) : 0;
    showProgress(percent, i18n[currentLang].playing + `: ${processedTotal}/${store.fileTotalPoints} (${i18n[currentLang].chunk} ${store.fileCurrentChunkIndex + 1}/${store.fileDataQueue.length + store.pendingChunks.length})`);
    while (store.pendingChunks.length > 0 && store.fileDataQueue.length < store.MAX_MAIN_QUEUE_CHUNKS) {
        store.fileDataQueue.push(store.pendingChunks.shift());
    }
    return (store.fileDataQueue.length > 0 || store.pendingChunks.length > 0 || !store.fileAllChunksReceived);
}

export function stopFilePlayback() {
    store.fileDataPlaying = false;
    if (store.filePlaybackInterval) { clearInterval(store.filePlaybackInterval); store.filePlaybackInterval = null; }
    store.fileDataQueue.length = 0;
    store.pendingChunks.length = 0;
    store.fileCurrentChunkIndex = 0;
    store.fileCurrentDataIndex = 0;
    store.fileCurrentSecond = 0;
    store.fileTotalPoints = 0;
    hideProgress();
    showToast(i18n[currentLang].playbackComplete, 'info');
    store.systemStatus.collecting = false;
    store.systemStatus.statusType = 'idle';
    store.systemStatus.statusText = i18n[currentLang].statusIdle;
    updateSystemStatus();
    document.getElementById('startBtn').disabled = false;
    document.getElementById('saveBtn').disabled = true;
    document.getElementById('stopBtn').disabled = true;
    if (store.fileWorker) { store.fileWorker.terminate(); store.fileWorker = null; }
    store.isWorkerProcessing = false;
}

// ==================== 文件监控 ====================
export function startFileMonitor() {
    const filePath = document.getElementById('savePath').value;
    if (!filePath) { showToast('请先输入或浏览选择要监控的文件路径', 'warning'); return; }
    fetch('/api/monitor/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filepath: filePath })
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            store.fileMonitorActive = true;
            store.systemStatus.collecting = true;
            store.systemStatus.statusType = 'monitoring';
            store.systemStatus.statusText = i18n[currentLang].statusMonitoring || '监控中...';
            updateSystemStatus();
            document.getElementById('startBtn').disabled = true;
            document.getElementById('saveBtn').disabled = false;
            document.getElementById('stopBtn').disabled = false;
            document.getElementById('monitorBtn').disabled = true;
            showToast('开始实时监控文件: ' + filePath, 'success');
            resetDisplayData();
        } else {
            showToast('启动监控失败: ' + data.message, 'error');
        }
    })
    .catch(err => { console.error('启动监控失败:', err); showToast('启动监控失败', 'error'); });
}
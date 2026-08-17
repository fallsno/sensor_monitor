/**
 * 数据管理模块
 * 提供数据记录的列表、查看、下载、删除功能
 */
import { showToast } from './ui.js';

// 当前预览的记录
let currentPreviewRecord = null;

// 初始化数据管理
export function initDataManager() {
    // 可以在此添加事件监听器
    console.log('数据管理模块已初始化');
}

// 获取数据记录列表
export async function fetchDataRecords() {
    try {
        const res = await fetch('/api/data_records/list');
        const data = await res.json();
        if (data.success) {
            return data.records;
        }
        return [];
    } catch (e) {
        console.error('获取记录列表失败:', e);
        showToast('获取记录列表失败', 'error');
        return [];
    }
}

// 渲染数据记录列表
export function renderDataRecords(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    fetchDataRecords().then(records => {
        if (records.length === 0) {
            container.innerHTML = `
                <div style="text-align: center; padding: 40px; color: #94a3b8;">
                    <i class="fas fa-database" style="font-size: 48px; margin-bottom: 16px;"></i>
                    <p>暂无数据记录</p>
                    <p style="font-size: 12px; margin-top: 8px;">开始采集后，数据会自动保存到这里</p>
                </div>
            `;
            return;
        }
        
        container.innerHTML = records.map(record => `
            <div class="data-record-card" style="
                background: linear-gradient(145deg, #1e293b, #172032);
                border: 1px solid #334155;
                border-radius: 8px;
                padding: 16px;
                margin-bottom: 12px;
                transition: all 0.2s;
            " onmouseover="this.style.borderColor='#38bdf8'; this.style.boxShadow='0 4px 12px rgba(56,189,248,0.2)'" 
               onmouseout="this.style.borderColor='#334155'; this.style.boxShadow='none'">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                    <div>
                        <h4 style="color: #e2e8f0; margin: 0 0 4px 0; font-size: 15px;">${record.record_name}</h4>
                        <span style="font-size: 12px; color: #94a3b8;">
                            <i class="fas fa-clock"></i> ${record.start_time}
                        </span>
                    </div>
                    <span style="
                        padding: 4px 12px;
                        border-radius: 20px;
                        font-size: 12px;
                        ${record.status === 'finished' 
                            ? 'background: #1e3a5f; color: #38bdf8;' 
                            : 'background: #5f3a1e; color: #f97316;'}
                    ">${record.status === 'finished' ? '已完成' : '进行中'}</span>
                </div>
                <div style="display: flex; gap: 24px; font-size: 12px; color: #94a3b8; margin-bottom: 12px;">
                    <span><i class="fas fa-sensor"></i> ${record.sensor_count} 个传感器</span>
                    <span><i class="fas fa-database"></i> ${record.data_points} 个数据点</span>
                    ${record.duration ? `<span><i class="fas fa-hourglass-half"></i> ${record.duration.toFixed(1)} 秒</span>` : ''}
                </div>
                <div style="display: flex; gap: 8px;">
                    <button onclick="previewRecord(${record.id})" style="
                        padding: 8px 16px;
                        background: linear-gradient(145deg, #334155, #1e293b);
                        border: 1px solid #475569;
                        border-radius: 6px;
                        color: #e2e8f0;
                        font-size: 12px;
                        cursor: pointer;
                        transition: all 0.2s;
                    " onmouseover="this.style.borderColor='#38bdf8'; this.style.color='#38bdf8'"
                       onmouseout="this.style.borderColor='#475569'; this.style.color='#e2e8f0'">
                        <i class="fas fa-eye"></i> 预览
                    </button>
                    <button onclick="downloadRecord(${record.id})" style="
                        padding: 8px 16px;
                        background: linear-gradient(145deg, #38bdf8, #0ea5e9);
                        border: none;
                        border-radius: 6px;
                        color: white;
                        font-size: 12px;
                        cursor: pointer;
                        transition: all 0.2s;
                    " onmouseover="this.style.transform='translateY(-1px)'"
                       onmouseout="this.style.transform='translateY(0)'">
                        <i class="fas fa-download"></i> 下载
                    </button>
                    <button onclick="deleteRecord(${record.id})" style="
                        padding: 8px 16px;
                        background: linear-gradient(145deg, #ef4444, #dc2626);
                        border: none;
                        border-radius: 6px;
                        color: white;
                        font-size: 12px;
                        cursor: pointer;
                        transition: all 0.2s;
                    " onmouseover="this.style.transform='translateY(-1px)'"
                       onmouseout="this.style.transform='translateY(0)'">
                        <i class="fas fa-trash"></i> 删除
                    </button>
                </div>
            </div>
        `).join('');
    });
}

// 预览记录
window.previewRecord = async function(recordId) {
    try {
        showToast('加载数据中...', 'info');
        const res = await fetch(`/api/data_records/${recordId}/points?limit=100`);
        const data = await res.json();
        if (data.success && data.points.length > 0) {
            currentPreviewRecord = { id: recordId, points: data.points };
            showPreviewModal(currentPreviewRecord);
        } else {
            showToast('暂无数据可预览', 'warning');
        }
    } catch (e) {
        console.error('预览失败:', e);
        showToast('预览失败', 'error');
    }
};

// 下载记录
window.downloadRecord = function(recordId) {
    try {
        window.open(`/api/data_records/${recordId}/download`, '_blank');
        showToast('正在下载...', 'success');
    } catch (e) {
        console.error('下载失败:', e);
        showToast('下载失败', 'error');
    }
};

// 删除记录
window.deleteRecord = async function(recordId) {
    if (!confirm('确定要删除这条记录吗？此操作不可恢复！')) {
        return;
    }
    
    try {
        const res = await fetch(`/api/data_records/${recordId}/delete`, { method: 'DELETE' });
        const data = await res.json();
        if (data.success) {
            showToast('删除成功', 'success');
            // 刷新列表
            renderDataRecords('dataRecordsContainer');
        } else {
            showToast(data.message || '删除失败', 'error');
        }
    } catch (e) {
        console.error('删除失败:', e);
        showToast('删除失败', 'error');
    }
};

// 显示预览弹窗
function showPreviewModal(record) {
    // 简单的预览展示
    const sensors = Object.keys(record.points[0].data);
    const sample = record.points.slice(0, 20);
    
    let modal = document.getElementById('previewModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'previewModal';
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0,0,0,0.8);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10000;
        `;
        document.body.appendChild(modal);
    }
    
    modal.innerHTML = `
        <div style="
            background: #0f172a;
            border-radius: 12px;
            padding: 24px;
            max-width: 90%;
            max-height: 80%;
            overflow: auto;
            border: 1px solid #334155;
        ">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                <h3 style="color: #e2e8f0; margin: 0;">数据预览 - 前20个数据点</h3>
                <button onclick="closePreviewModal()" style="
                    background: #334155;
                    border: none;
                    color: #94a3b8;
                    width: 32px;
                    height: 32px;
                    border-radius: 50%;
                    cursor: pointer;
                    font-size: 18px;
                ">&times;</button>
            </div>
            <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
                <thead>
                    <tr style="background: #1e293b;">
                        <th style="padding: 8px 12px; text-align: left; border-bottom: 1px solid #334155; color: #94a3b8;">时间</th>
                        ${sensors.map(s => `<th style="padding: 8px 12px; text-align: right; border-bottom: 1px solid #334155; color: #94a3b8;">${s}</th>`).join('')}
                    </tr>
                </thead>
                <tbody>
                    ${sample.map(p => `
                        <tr style="border-bottom: 1px solid #1e293b;">
                            <td style="padding: 8px 12px; color: #94a3b8;">${p.timestamp}</td>
                            ${sensors.map(s => `<td style="padding: 8px 12px; text-align: right; color: #e2e8f0;">${p.data[s]?.toFixed(4) || '-'}</td>`).join('')}
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    `;
    modal.style.display = 'flex';
}

window.closePreviewModal = function() {
    const modal = document.getElementById('previewModal');
    if (modal) {
        modal.style.display = 'none';
    }
};

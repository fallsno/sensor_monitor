/**
 * 版本管理模块
 * 处理版本信息获取、更新提示弹窗及版本历史查看
 */

const STORAGE_KEY = 'sensorMonitorAcknowledgedVersion';

export async function initVersionManager() {
    try {
        const response = await fetch('/api/version/info');
        if (!response.ok) throw new Error('Failed to fetch version info');
        const data = await response.json();
        
        // 绑定版本记录入口点击事件
        const entry = document.getElementById('versionHistoryEntry');
        if (entry) {
            entry.addEventListener('click', () => showVersionModal(data, { showHistory: true, acknowledgeOnClose: false }));
        }

        // 检查是否需要显示更新提示
        const acknowledgedVersion = localStorage.getItem(STORAGE_KEY);
        if (acknowledgedVersion !== data.version) {
            showVersionModal(data, { showHistory: false, acknowledgeOnClose: true });
        }

        // 绑定关闭按钮
        const closeBtn = document.getElementById('releaseNotesCloseBtn');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                acknowledgeVersionIfNeeded(data.version);
                hideVersionModal();
            });
        }

        // 点击背景关闭
        const modal = document.getElementById('releaseNotesModal');
        if (modal) {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    acknowledgeVersionIfNeeded(data.version);
                    hideVersionModal();
                }
            });
        }

    } catch (error) {
        console.warn('Version manager initialization failed:', error);
    }
}

function showVersionModal(data, { showHistory = false, acknowledgeOnClose = false } = {}) {
    const modal = document.getElementById('releaseNotesModal');
    const title = document.getElementById('releaseNotesTitle');
    const meta = document.getElementById('releaseNotesMeta');
    const list = document.getElementById('releaseNotesList');
    const historyContainer = document.getElementById('releaseHistoryList');

    if (!modal) return;

    modal.dataset.acknowledgeOnClose = acknowledgeOnClose ? 'true' : 'false';

    // 设置标题和元数据
    title.innerText = `传感监测平台 v${data.version}`;
    meta.innerText = `发布日期：${data.release_date}`;

    // 填充当前版本更新内容
    list.innerHTML = data.release_notes.map(note => `<li>${note}</li>`).join('');

    // 处理历史记录显示
    if (showHistory && data.history && data.history.length > 0) {
        historyContainer.style.display = 'block';
        historyContainer.innerHTML = '<h4 style="color: #f8fafc; margin-bottom: 12px; font-size: 16px;">历史版本</h4>' + 
            data.history.map(item => `
                <div class="history-item">
                    <div class="history-version">
                        v${item.version}
                        <span class="history-date">${item.release_date}</span>
                    </div>
                    <ul class="history-notes">
                        ${item.release_notes.map(note => `<li>${note}</li>`).join('')}
                    </ul>
                </div>
            `).join('');
    } else {
        historyContainer.style.display = 'none';
    }

    modal.hidden = false;
    modal.removeAttribute('hidden');
}

function hideVersionModal() {
    const modal = document.getElementById('releaseNotesModal');
    if (modal) {
        modal.hidden = true;
        modal.setAttribute('hidden', '');
    }
}

function acknowledgeVersionIfNeeded(version) {
    const modal = document.getElementById('releaseNotesModal');
    if (modal?.dataset.acknowledgeOnClose === 'true') {
        localStorage.setItem(STORAGE_KEY, version);
    }
}

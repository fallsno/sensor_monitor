const SERIAL_PORT_REFRESH_MS = 5000;
let trafficDrawerOpen = false;
let trafficPollTimer = null;

document.addEventListener('DOMContentLoaded', async () => {
    await loadConfig();
    await refreshSerialPorts();
    // 启动定时拉取数据
    setInterval(fetchData, 1000);
    setInterval(refreshSerialPorts, SERIAL_PORT_REFRESH_MS);
});

async function loadConfig() {
    try {
        const res = await fetch('/api/modbus/config');
        const config = await res.json();
        
        if (config.baudrate) document.getElementById('baudrate').value = config.baudrate;
        if (config.slave_id) document.getElementById('slave_id').value = config.slave_id;
        if (config.template_id) document.getElementById('template_id').value = config.template_id;
        if (config.interval) document.getElementById('interval').value = config.interval;
        if (config.save_dir) document.getElementById('save_dir').value = config.save_dir;
        if (config.port) document.getElementById('port').dataset.savedValue = config.port;
        return config;
    } catch (e) {
        console.error('Failed to load modbus config:', e);
        return {};
    }
}

function renderSerialPortOptions(ports, preferredPort) {
    const portSelect = document.getElementById('port');
    const currentValue = preferredPort || portSelect.value || portSelect.dataset.savedValue || '';
    const hasOfflineSelection = currentValue && !ports.includes(currentValue);

    if (!ports.length) {
        portSelect.innerHTML = '<option value="">未检测到可用串口</option>';
        portSelect.disabled = true;
        return;
    }

    let optionsHtml = '';
    if (hasOfflineSelection) {
        optionsHtml += `<option value="" selected>${currentValue} (原串口已离线)</option>`;
    }

    optionsHtml += ports
        .map((port) => `<option value="${port}">${port}</option>`)
        .join('');

    portSelect.innerHTML = optionsHtml;
    portSelect.disabled = false;
    portSelect.value = ports.includes(currentValue) ? currentValue : portSelect.value;

    if (!portSelect.value && ports.length && !hasOfflineSelection) {
        portSelect.value = ports[0];
    }
}

async function refreshSerialPorts() {
    try {
        const portSelect = document.getElementById('port');
        const preferredPort = portSelect.value || portSelect.dataset.savedValue || '';
        const res = await fetch('/api/modbus/ports');
        const data = await res.json();
        renderSerialPortOptions(data.ports || [], preferredPort);
    } catch (e) {
        const portSelect = document.getElementById('port');
        portSelect.innerHTML = '<option value="">串口检测失败</option>';
        portSelect.disabled = true;
        console.error('Failed to refresh serial ports:', e);
    }
}

async function saveConfig() {
    const config = {
        port: document.getElementById('port').value,
        baudrate: parseInt(document.getElementById('baudrate').value),
        slave_id: parseInt(document.getElementById('slave_id').value),
        template_id: document.getElementById('template_id').value,
        interval: parseFloat(document.getElementById('interval').value),
        save_dir: document.getElementById('save_dir').value.trim()
    };
    
    try {
        const res = await fetch('/api/modbus/config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(config)
        });
        const data = await res.json();
        if (data.success) {
            alert('配置已保存');
        } else {
            alert('保存失败: ' + data.message);
        }
    } catch (e) {
        alert('请求失败');
        console.error(e);
    }
}

async function startModbus() {
    try {
        const res = await fetch('/api/modbus/control', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'start' })
        });
        const data = await res.json();
        if (!data.success) {
            alert('启动失败: ' + data.message);
        }
    } catch (e) {
        alert('请求失败');
        console.error(e);
    }
}

async function stopModbus() {
    try {
        const res = await fetch('/api/modbus/control', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'stop' })
        });
    } catch (e) {
        console.error(e);
    }
}

function toggleTrafficDrawer(forceOpen) {
    const drawer = document.getElementById('trafficDrawer');
    const mask = document.getElementById('trafficDrawerMask');
    if (!drawer || !mask) {
        return;
    }

    trafficDrawerOpen = typeof forceOpen === 'boolean' ? forceOpen : !trafficDrawerOpen;
    drawer.classList.toggle('open', trafficDrawerOpen);
    mask.classList.toggle('open', trafficDrawerOpen);

    if (trafficDrawerOpen) {
        fetchTrafficLogs();
        if (!trafficPollTimer) {
            trafficPollTimer = setInterval(fetchTrafficLogs, 1000);
        }
        return;
    }

    if (trafficPollTimer) {
        clearInterval(trafficPollTimer);
        trafficPollTimer = null;
    }
}

async function fetchTrafficLogs() {
    try {
        const res = await fetch('/api/modbus/traffic');
        const data = await res.json();
        renderTrafficLogs(data.logs || []);
    } catch (e) {
        renderTrafficError('日志获取失败');
        console.error('Failed to fetch traffic logs:', e);
    }
}

function getTrafficTypeLabel(type) {
    if (type === 'send') return '发送';
    if (type === 'recv') return '接收';
    if (type === 'error') return '异常';
    return type || '未知';
}

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function renderTrafficLogs(logs) {
    const status = document.getElementById('trafficLogStatus');
    const list = document.getElementById('trafficLogList');
    if (!status || !list) {
        return;
    }

    if (!logs.length) {
        status.innerText = '暂无收发记录';
        list.innerHTML = '';
        return;
    }

    status.innerText = `最近 ${logs.length} 条收发记录`;
    list.innerHTML = logs.slice().reverse().map((item) => `
        <div class="traffic-log-item traffic-${escapeHtml(item.type)}">
            <div><strong>${escapeHtml(getTrafficTypeLabel(item.type))}</strong> ${escapeHtml(item.timestamp)}</div>
            <div class="traffic-log-meta">Slave=${escapeHtml(item.slave_id)} FC=${escapeHtml(item.function_code)} Addr=${escapeHtml(item.address)} Count=${escapeHtml(item.count)}</div>
            <div>${escapeHtml(item.message)}</div>
        </div>
    `).join('');
}

function renderTrafficError(message) {
    const status = document.getElementById('trafficLogStatus');
    if (status) {
        status.innerText = message;
    }
}

async function clearTrafficLogs() {
    try {
        const res = await fetch('/api/modbus/traffic/clear', { method: 'POST' });
        const data = await res.json();
        if (data.success) {
            renderTrafficLogs([]);
            if (trafficDrawerOpen) {
                fetchTrafficLogs();
            }
        } else {
            alert('清空收发记录失败');
        }
    } catch (e) {
        alert('清空收发记录失败');
        console.error('Failed to clear traffic logs:', e);
    }
}

async function fetchData() {
    try {
        const res = await fetch('/api/modbus/data');
        const data = await res.json();
        
        // Update status indicator
        const indicator = document.getElementById('statusIndicator');
        const statusText = document.getElementById('statusText');
        
        statusText.innerText = data.status || 'Unknown';
        if (data.is_running) {
            indicator.classList.add('active');
        } else {
            indicator.classList.remove('active');
        }
        
        // Update table
        const tbody = document.querySelector('#dataTable tbody');
        if (data.latest && data.latest.data) {
            let html = '';
            for (const [key, item] of Object.entries(data.latest.data)) {
                html += `
                    <tr>
                        <td style="text-align: left; padding-left: 20px;">
                            <span style="color: var(--text-secondary); font-size: 12px;">${key}</span><br>
                            <strong>${item.label}</strong>
                        </td>
                        <td>${item.address}</td>
                        <td style="color: var(--accent-color); font-weight: bold; font-size: 18px;">${item.value.toFixed(2)}</td>
                        <td>${item.unit}</td>
                    </tr>
                `;
            }
            tbody.innerHTML = html;
        }
    } catch (e) {
        console.error('Failed to fetch modbus data:', e);
    }
}

async function selectSaveDir() {
    try {
        const res = await fetch('/api/modbus/select-save-dir', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        const data = await res.json();
        if (data.success && data.path) {
            const input = document.getElementById('save_dir');
            input.value = data.path;
        } else if (data.cancelled) {
            // 用户取消选择，静默处理
        } else {
            alert('目录选择失败' + (data.message ? `: ${data.message}` : ''));
        }
    } catch (e) {
        alert('目录选择请求失败');
        console.error(e);
    }
}

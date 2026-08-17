
/**
 * 沉浸式数字孪生视图模块
 */
(function() {
    'use strict';

    let immersiveState = {
        isComponentsVisible: false,
        ringPosition: 35,
        ringDirection: 1,
        ringDisplacement: 0,
        currentHealth: 85,
        time: 0,
        timeData: [],
        faultData: [],
        vibData: [],
        trendData: [],
        motorData: {
            motor1: [],
            motor2: [],
            motor3: [],
            motor4: []
        },
        charts: {
            fault: null,
            vibration: null,
            trend: null,
            holoMotor: null,
            holoEnergy: null
        },
        originalParentMap: new Map(), // 用于记录移动DOM的原始父节点
        updateInterval: null,
        animationInterval: null
    };

    // 健康度等级映射
    function getHealthGrade(health) {
        if (health >= 80) return { grade: '优', class: 'excellent', color: '#4ade80' };
        if (health >= 60) return { grade: '良', class: 'good', color: '#f59e0b' };
        if (health >= 40) return { grade: '差', class: 'poor', color: '#f97316' };
        return { grade: '危', class: 'danger', color: '#ef4444' };
    }

    // 初始化数据
    function initData() {
        const now = new Date();
        immersiveState.timeData = [];
        immersiveState.faultData = [];
        immersiveState.vibData = [];
        immersiveState.trendData = [];

        for (let i = 0; i < 30; i++) {
            const time = new Date(now - (29 - i) * 2000);
            immersiveState.timeData.push(time.toLocaleTimeString('en-US', {hour12: false}).replace(/^\d{2}:/, ''));
            immersiveState.faultData.push(Math.random() * 5);
            immersiveState.vibData.push(2.0 + Math.random() * 0.8);
            immersiveState.trendData.push(85);
            immersiveState.motorData.motor1.push(0);
            immersiveState.motorData.motor2.push(0);
            immersiveState.motorData.motor3.push(0);
            immersiveState.motorData.motor4.push(0);
        }
    }

    // 初始化图表
    function initCharts() {
        const commonOptions = {
            backgroundColor: 'transparent',
            grid: { top: 15, bottom: 20, left: 30, right: 10 },
            tooltip: {
                trigger: 'axis',
                backgroundColor: 'rgba(15,23,42,0.8)',
                borderColor: '#334155',
                textStyle: { color: '#e2e8f0' }
            },
            xAxis: {
                type: 'category',
                boundaryGap: false,
                data: immersiveState.timeData,
                axisLine: { lineStyle: { color: 'rgba(255,255,255,0.1)' } },
                axisLabel: { color: 'rgba(255,255,255,0.4)', fontSize: 10 }
            },
            yAxis: {
                type: 'value',
                axisLine: { show: false },
                splitLine: { lineStyle: { color: 'rgba(255,255,255,0.05)', type: 'dashed' } },
                axisLabel: { color: 'rgba(255,255,255,0.5)', fontSize: 10 }
            }
        };

        // 故障图表
        const faultChartEl = document.getElementById('immersiveFaultChart');
        if (faultChartEl) {
            immersiveState.charts.fault = echarts.init(faultChartEl);
            immersiveState.charts.fault.setOption({
                ...commonOptions,
                series: [{
                    data: immersiveState.faultData,
                    type: 'line',
                    smooth: true,
                    symbol: 'none',
                    lineStyle: { color: '#f87171', width: 2 },
                    areaStyle: {
                        color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                            { offset: 0, color: 'rgba(248,113,113,0.3)' },
                            { offset: 1, color: 'rgba(248,113,113,0)' }
                        ])
                    }
                }]
            });
        }

        // 振动图表
        const vibrationChartEl = document.getElementById('immersiveVibrationChart');
        if (vibrationChartEl) {
            immersiveState.charts.vibration = echarts.init(vibrationChartEl);
            immersiveState.charts.vibration.setOption({
                ...commonOptions,
                yAxis: { ...commonOptions.yAxis, min: 1.0, max: 4.0 },
                series: [{
                    data: immersiveState.vibData,
                    type: 'line',
                    smooth: false,
                    symbol: 'none',
                    lineStyle: { color: '#38bdf8', width: 2 },
                    areaStyle: {
                        color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                            { offset: 0, color: 'rgba(56,189,248,0.3)' },
                            { offset: 1, color: 'rgba(56,189,248,0)' }
                        ])
                    }
                }]
            });
        }

        // 趋势图表
        const trendChartEl = document.getElementById('immersiveTrendChart');
        if (trendChartEl) {
            immersiveState.charts.trend = echarts.init(trendChartEl);
            immersiveState.charts.trend.setOption({
                ...commonOptions,
                yAxis: { ...commonOptions.yAxis, min: 40, max: 100 },
                series: [{
                    data: immersiveState.trendData,
                    type: 'line',
                    smooth: true,
                    symbol: 'none',
                    lineStyle: { color: '#4ade80', width: 2 },
                    areaStyle: {
                        color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                            { offset: 0, color: 'rgba(74,222,128,0.3)' },
                            { offset: 1, color: 'rgba(74,222,128,0)' }
                        ])
                    }
                }]
            });
        }
    }

    // 更新健康度显示
    function updateHealthDisplay(health) {
        const healthScore = document.getElementById('immersiveHealthScore');
        const healthGrade = document.getElementById('immersiveHealthGrade');
        const haloGlow = document.getElementById('immersiveHaloGlow');
        const haloOuter = document.getElementById('immersiveHaloOuter');
        const haloInner1 = document.getElementById('immersiveHaloInner1');
        const haloInner2 = document.getElementById('immersiveHaloInner2');
        const healthProgress = document.getElementById('immersiveHealthProgress');
        const scoreHud = document.getElementById('immersiveScoreHud');

        if (!healthScore) return;

        const gradeInfo = getHealthGrade(health);
        const displayValue = Math.round(health);

        healthScore.textContent = displayValue + '%';
        healthScore.style.color = gradeInfo.color;
        healthScore.style.textShadow = `0 0 25px ${gradeInfo.color}b3`;

        if (healthGrade) {
            healthGrade.textContent = gradeInfo.grade;
            healthGrade.className = 'health-grade ' + gradeInfo.class;
        }

        if (scoreHud) scoreHud.style.color = gradeInfo.color;

        // 更新光环
        if (haloGlow) {
            haloGlow.style.background = `radial-gradient(circle, ${gradeInfo.color}1a 0%, transparent 70%)`;
        }
        if (haloOuter) {
            haloOuter.style.borderColor = gradeInfo.color + '40';
            haloOuter.style.boxShadow = `0 0 ${displayValue <= 40 ? '200px' : '120px'} ${gradeInfo.color}26 inset`;
        }
        if (haloInner1) {
            haloInner1.style.borderColor = gradeInfo.color + '33';
            const animSpeed = displayValue <= 40 ? '5s' : (displayValue <= 60 ? '15s' : '30s');
            haloInner1.style.animationDuration = animSpeed;
        }
        if (haloInner2) {
            haloInner2.style.borderColor = gradeInfo.color + '1a';
            const animSpeed = displayValue <= 40 ? '7.5s' : (displayValue <= 60 ? '22.5s' : '45s');
            haloInner2.style.animationDuration = animSpeed;
        }

        // 更新进度环
        if (healthProgress) {
            const deg = (displayValue / 100) * 270;
            healthProgress.style.background = `conic-gradient(from 225deg, ${gradeInfo.color} ${deg}deg, transparent ${deg}deg)`;
        }
    }

    // 接收真实数据并更新图表
    function updateRealData(payload) {
        if (!payload) return;
        
        const nowStr = new Date().toLocaleTimeString('en-US', {hour12: false}).replace(/^\d{2}:/, '');
        
        // 更新时间轴
        immersiveState.timeData.shift();
        immersiveState.timeData.push(nowStr);

        // 如果有平均数据 (avg)
        if (payload.avg) {
            // 真实振动数据
            const vibValue = payload.avg.vibration !== undefined ? payload.avg.vibration : 
                             (payload.avg.eddy_current !== undefined ? payload.avg.eddy_current : (2.0 + Math.random() * 0.8));
            immersiveState.vibData.shift();
            immersiveState.vibData.push(vibValue);

            // 更新滚圈位移 (用于动画)
            // 将实际位移 (例如 0-8mm) 映射到 -8 到 8 的显示范围，或者直接使用
            if (payload.avg.eddy_current !== undefined) {
                // 假设标称值为4，偏移量为 eddy_current - 4
                immersiveState.ringDisplacement = payload.avg.eddy_current - 4;
            }
            
            // 更新转速文本
            const leftRpm = document.getElementById('immersiveLeftWheelSpeed');
            const rightRpm = document.getElementById('immersiveRightWheelSpeed');
            const ringRpm = document.getElementById('immersiveRingSpeed');
            
            if (leftRpm) leftRpm.innerHTML = `${(payload.avg.left_rpm || 0).toFixed(1)}<span>RPM</span>`;
            if (rightRpm) rightRpm.innerHTML = `${(payload.avg.right_rpm || 0).toFixed(1)}<span>RPM</span>`;
            // 假设滚圈转速为限位轮的 1/7
            if (ringRpm) ringRpm.innerHTML = `${((payload.avg.left_rpm || 0) / 7).toFixed(1)}<span>RPM</span>`;
        }

        // 如果有健康度数据 (health)
        if (payload.health) {
            immersiveState.currentHealth = payload.health.system_health || 85;
            immersiveState.trendData.shift();
            immersiveState.trendData.push(immersiveState.currentHealth);
            
            updateHealthDisplay(immersiveState.currentHealth);
        }

        // 真实故障数据接入（若有真实故障列表长度，否则按健康度计算模拟预警）
        let newFault = 0;
        if (payload.health && payload.health.fault_count !== undefined) {
            newFault = payload.health.fault_count;
        } else {
            if (immersiveState.currentHealth < 60) newFault = 10 + Math.random() * 10;
            else if (immersiveState.currentHealth < 80) newFault = 2 + Math.random() * 5;
            else newFault = 0; // 健康时无故障
        }
        
        immersiveState.faultData.shift();
        immersiveState.faultData.push(newFault);

        // 如果有电机数据
        if (payload.avg) {
            ['motor1', 'motor2', 'motor3', 'motor4'].forEach(m => {
                const val = payload.avg[m] !== undefined ? payload.avg[m] : 0;
                immersiveState.motorData[m].shift();
                immersiveState.motorData[m].push(val);
                
                // 更新表格
                const td = document.getElementById(`holo${m.charAt(0).toUpperCase() + m.slice(1)}Val`);
                if (td) td.innerText = val.toFixed(1) + ' A';
            });
            
            // 刷新全息面板电机图表
            if (immersiveState.charts.holoMotor) {
                immersiveState.charts.holoMotor.setOption({
                    xAxis: { data: immersiveState.timeData },
                    series: [
                        { data: immersiveState.motorData.motor1 },
                        { data: immersiveState.motorData.motor2 },
                        { data: immersiveState.motorData.motor3 },
                        { data: immersiveState.motorData.motor4 }
                    ]
                });
            }
            
            // 刷新全息面板电能图表数据 (实时能耗文本)
            const voltage = 380;
            let totalCurrent = 0;
            ['motor1', 'motor2', 'motor3', 'motor4'].forEach(m => {
                totalCurrent += (payload.avg[m] !== undefined ? payload.avg[m] : 0);
            });
            const power = (voltage * totalCurrent * 1.732 * 0.8 / 1000).toFixed(2); // 简单三相功率估算 kW
            
            const currentEl = document.getElementById('holoEnergyCurrentVal');
            const powerEl = document.getElementById('holoEnergyPowerVal');
            if (currentEl) currentEl.innerText = totalCurrent.toFixed(1) + ' A';
            if (powerEl) powerEl.innerText = power + ' kW';
        }

        // 刷新图表
        const gradeInfo = getHealthGrade(immersiveState.currentHealth);

        if (immersiveState.charts.fault) {
            immersiveState.charts.fault.setOption({
                xAxis: { data: immersiveState.timeData },
                series: [{ data: immersiveState.faultData }]
            });
        }

        if (immersiveState.charts.vibration) {
            immersiveState.charts.vibration.setOption({
                xAxis: { data: immersiveState.timeData },
                series: [{ data: immersiveState.vibData }]
            });
        }

        if (immersiveState.charts.trend) {
            immersiveState.charts.trend.setOption({
                xAxis: { data: immersiveState.timeData },
                series: [{
                    data: immersiveState.trendData,
                    lineStyle: { color: gradeInfo.color },
                    areaStyle: {
                        color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                            { offset: 0, color: `${gradeInfo.color}4d` },
                            { offset: 1, color: `${gradeInfo.color}00` }
                        ])
                    }
                }]
            });
        }
    }

    // 更新滚圈位置
    function updateRingPosition() {
        if (!immersiveState.isComponentsVisible) return;

        const detailRing = document.getElementById('immersiveDetailRing');
        const labelRing = document.getElementById('immersiveLabelRing');
        const indLeft = document.getElementById('immersiveIndLeft');
        const indRight = document.getElementById('immersiveIndRight');
        const svgLineLeft = document.getElementById('immersiveSvgLineLeft');
        const svgLineRight = document.getElementById('immersiveSvgLineRight');

        if (!detailRing) return;

        // 修改抖动逻辑，仅当有真实位移时才偏移，且不叠加随机 jitter
        const targetPosition = immersiveState.ringDisplacement !== 0 ? (35 + immersiveState.ringDisplacement) : 35;
        // 平滑过渡
        immersiveState.ringPosition += (targetPosition - immersiveState.ringPosition) * 0.1;

        detailRing.style.left = immersiveState.ringPosition + '%';
        labelRing.style.left = (immersiveState.ringPosition + 15) + '%';

        // 引线落点下移到限位轮与滚圈之间的接触区偏下位置，便于后续继续微调
        const callout = {
            ringLeftX: immersiveState.ringPosition + 5,
            ringRightX: immersiveState.ringPosition + 25,
            wheelLeftX: 22,
            wheelRightX: 78,
            contactY: 58,
            bendY: 74,
            textY: 82
        };

        let pressureVal = (2.0 + Math.abs(immersiveState.ringDisplacement) * 0.15).toFixed(2);
        let gapVal = (8.0 + Math.abs(immersiveState.ringDisplacement)).toFixed(1);

        const pressureHTML = `<div class="ind-val pressure">${pressureVal}<span>MPa</span></div><div class="ind-name">CONTACT PRESSURE</div>`;
        const gapHTML = `<div class="ind-val gap">${gapVal}<span>mm</span></div><div class="ind-name">WHEEL GAP</div>`;
        const leftPath = `M ${callout.ringLeftX} ${callout.contactY} L ${callout.wheelLeftX} ${callout.bendY} L ${callout.wheelLeftX} ${callout.textY}`;
        const rightPath = `M ${callout.ringRightX} ${callout.contactY} L ${callout.wheelRightX} ${callout.bendY} L ${callout.wheelRightX} ${callout.textY}`;

        // 放置文本框到限位轮与滚圈外侧之间的聚焦区域
        indLeft.style.left = callout.wheelLeftX + '%';
        indLeft.style.top = callout.textY + '%';
        indRight.style.left = callout.wheelRightX + '%';
        indRight.style.top = callout.textY + '%';

        if (immersiveState.ringDisplacement < 0) {
            indLeft.innerHTML = pressureHTML;
            indRight.innerHTML = gapHTML;
            svgLineLeft.setAttribute('d', leftPath);
            svgLineLeft.setAttribute('stroke', '#f87171');
            svgLineLeft.setAttribute('marker-start', 'url(#immersiveDotRed)');
            
            svgLineRight.setAttribute('d', rightPath);
            svgLineRight.setAttribute('stroke', '#38bdf8');
            svgLineRight.setAttribute('marker-start', 'url(#immersiveDotBlue)');
        } else {
            indRight.innerHTML = pressureHTML;
            indLeft.innerHTML = gapHTML;
            svgLineLeft.setAttribute('d', leftPath);
            svgLineLeft.setAttribute('stroke', '#38bdf8');
            svgLineLeft.setAttribute('marker-start', 'url(#immersiveDotBlue)');
            
            svgLineRight.setAttribute('d', rightPath);
            svgLineRight.setAttribute('stroke', '#f87171');
            svgLineRight.setAttribute('marker-start', 'url(#immersiveDotRed)');
        }
    }

    // 绑定事件
    function bindEvents() {
        const mainDrum = document.getElementById('immersiveMainDrum');
        const componentsGroup = document.getElementById('immersiveComponentsGroup');
        const bottomCharts = document.getElementById('immersiveBottomCharts');

        if (mainDrum) {
            mainDrum.style.cursor = 'pointer';
            mainDrum.addEventListener('click', function() {
                immersiveState.isComponentsVisible = !immersiveState.isComponentsVisible;
                if (immersiveState.isComponentsVisible) {
                    mainDrum.classList.add('shifted');
                    componentsGroup.classList.add('visible');
                    if(bottomCharts) {
                        bottomCharts.style.opacity = '1';
                        bottomCharts.style.pointerEvents = 'auto';
                    }
                } else {
                    mainDrum.classList.remove('shifted');
                    componentsGroup.classList.remove('visible');
                    if(bottomCharts) {
                        bottomCharts.style.opacity = '0';
                        bottomCharts.style.pointerEvents = 'none';
                    }
                }
            });
        }

        // 绑定控制按钮
        const iStart = document.getElementById('immersiveStartBtn');
        const iSave = document.getElementById('immersiveSaveBtn');
        const iStop = document.getElementById('immersiveStopBtn');
        const iExit = document.getElementById('immersiveExitBtn');
        const globalToggle = document.getElementById('themeToggleBtn');
        const standardApp = document.getElementById('standardApp');
        const immersiveApp = document.getElementById('immersiveApp');
        
        if (iStart) {
            iStart.addEventListener('click', () => {
                document.getElementById('startBtn')?.click();
                const status = document.querySelector('.hud-status');
                if (status) status.innerHTML = '<i class="fas fa-circle text-blue-400"></i> 采集中...';
            });
        }
        if (iSave) {
            iSave.addEventListener('click', () => {
                document.getElementById('saveBtn')?.click();
            });
        }
        if (iStop) {
            iStop.addEventListener('click', () => {
                document.getElementById('stopBtn')?.click();
                const status = document.querySelector('.hud-status');
                if (status) status.innerHTML = '<i class="fas fa-circle text-green-400"></i> 系统就绪';
            });
        }
        
        // 模式切换
        if (iExit) {
            iExit.addEventListener('click', () => {
                // 还原 DOM
                immersiveState.originalParentMap.forEach((parentInfo, elId) => {
                    const el = document.getElementById(elId);
                    if (el && parentInfo.parent) {
                        parentInfo.parent.appendChild(el);
                        el.style.display = ''; // 恢复默认
                    }
                });
                immersiveState.originalParentMap.clear();
                
                // 恢复数字孪生显示状态
                const dtc = document.querySelector('.digital-twin-container');
                if (dtc) dtc.style.display = 'flex';
                const panel = document.getElementById('immersiveHoloPanel');
                if (panel) panel.style.display = 'none';
                
                // 恢复沉浸菜单主页激活
                const radialItems = document.querySelectorAll('.radial-item');
                radialItems.forEach(n => n.classList.remove('active'));
                if(radialItems[0]) radialItems[0].classList.add('active');
                
                const globalToggle = document.getElementById('themeToggleBtn');
                if (globalToggle) {
                    globalToggle.click();
                } else {
                    if (immersiveApp) immersiveApp.style.display = 'none';
                    if (standardApp) standardApp.style.display = 'flex';
                    window.dispatchEvent(new Event('resize'));
                }
            });
        }

        const radialItems = document.querySelectorAll('.radial-item');
        radialItems.forEach(item => {
            item.addEventListener('click', function() {
                radialItems.forEach(n => n.classList.remove('active'));
                this.classList.add('active');
                
                const target = this.getAttribute('data-target');
                const panel = document.getElementById('immersiveHoloPanel');
                const title = document.getElementById('holoPanelTitle');
                const content = document.getElementById('holoPanelContent');
                
                // 将之前移动的DOM还原回标准模式
                immersiveState.originalParentMap.forEach((parentInfo, elId) => {
                    const el = document.getElementById(elId);
                    if (el && parentInfo.parent) {
                        parentInfo.parent.appendChild(el);
                        el.style.display = 'none'; // 隐藏还原的页面
                    }
                });
                immersiveState.originalParentMap.clear();
                
                if (target === 'home') {
                    panel.style.display = 'none';
                    document.querySelector('.digital-twin-container').style.display = 'flex';
                    return;
                }
                
                // 隐藏数字孪生主界面
                document.querySelector('.digital-twin-container').style.display = 'none';
                panel.style.display = 'flex';
                
                // 映射沉浸模式菜单到标准模式的 page ID
                const targetMap = {
                    'charts': { id: 'chartsPage', title: '监测图表与分析' },
                    'data': { id: 'dataPage', title: '全息数据中心' },
                    'motor': { id: 'realtimePage', title: '综合数据监控' },
                    'settings': { id: 'settingsPage', title: '系统高级设置' }
                };
                
                const pageInfo = targetMap[target];
                if (pageInfo) {
                    title.textContent = pageInfo.title;
                    content.innerHTML = ''; // 清空原有手写HTML
                    
                    const pageEl = document.getElementById(pageInfo.id);
                    if (pageEl) {
                        // 记录原始位置
                        immersiveState.originalParentMap.set(pageInfo.id, { parent: pageEl.parentNode });
                        // 移动到沉浸模式容器
                        content.appendChild(pageEl);
                        pageEl.style.display = 'block';
                        pageEl.classList.add('active');
                        
                        // 触发一次resize以修复图表大小
                        setTimeout(() => {
                            window.dispatchEvent(new Event('resize'));
                        }, 100);
                    }
                }
            });
        });
    }

    // 调整图表大小
    function resizeCharts() {
        Object.values(immersiveState.charts).forEach(chart => {
            if (chart && chart.resize) {
                chart.resize();
            }
        });
    }

    // 初始化沉浸式视图
    function initImmersiveView() {
        initData();
        initCharts();
        bindEvents();

        // 启动更新
        immersiveState.animationInterval = setInterval(updateRingPosition, 30);

        window.addEventListener('resize', resizeCharts);
    }

    // 销毁沉浸式视图
    function destroyImmersiveView() {
        if (immersiveState.updateInterval) {
            clearInterval(immersiveState.updateInterval);
            immersiveState.updateInterval = null;
        }
        if (immersiveState.animationInterval) {
            clearInterval(immersiveState.animationInterval);
            immersiveState.animationInterval = null;
        }
        Object.values(immersiveState.charts).forEach(chart => {
            if (chart && chart.dispose) {
                chart.dispose();
            }
        });
        immersiveState.charts = { fault: null, vibration: null, trend: null };
    }

    // 暴露API
    window.ImmersiveView = {
        init: initImmersiveView,
        destroy: destroyImmersiveView,
        updateHealthDisplay: updateHealthDisplay,
        resizeCharts: resizeCharts,
        updateRealData: updateRealData
    };

})();


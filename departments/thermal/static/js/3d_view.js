import { buildHeatmapState } from './heatmap_state.mjs';
import {
    buildHeatColorGlsl,
    buildMaterialStyle,
    buildViewTargetOffset,
    getHeatLevelClass,
    isHeatmapVisibleView,
    resolveHeatCarrierSide,
    resolveHotspotView
} from './thrust_heatmap_helpers.mjs';

document.addEventListener('DOMContentLoaded', () => {
    const THRUST_HEAT_LOG_PREFIX = '[ThrustHeat]';
    const HEAT_COLOR_GLSL = buildHeatColorGlsl();
    const modelViewer = document.querySelector('#product-model');
    const navButtons = document.querySelectorAll('.nav-btn');
    const telemetryTitle = document.querySelector('#telemetry-title');
    const btnResetView = document.getElementById('btn-reset-view');
    const progressContainer = modelViewer ? modelViewer.querySelector('#progress-container') : null;
    const updateBar = modelViewer ? modelViewer.querySelector('.update-bar') : null;
    const loadingText = modelViewer ? modelViewer.querySelector('#loading-text') : null;

    const modelSources = {
        draco: modelViewer?.dataset.dracoSrc || '',
        noDraco: modelViewer?.dataset.noDracoSrc || ''
    };
    const DRACO_DECODER_LOCATION = '/draco/';
    const NEAR_FINISH_STALL_MS = 30000;
    const LOAD_LOG_PREFIX = '[3D-Load]';
    const loadState = {
        activeSrc: '',
        usingDraco: false,
        completed: false,
        failed: false,
        lastProgress: 0,
        lastProgressAt: 0,
        stallTimer: null,
        noDracoChecked: false,
        noDracoAvailable: false
    };

    function setModelSource(src, { usingDraco = false } = {}) {
        if (!modelViewer || !src) return;
        loadState.activeSrc = src;
        loadState.usingDraco = usingDraco;
        loadState.completed = false;
        loadState.failed = false;
        loadState.lastProgress = 0;
        loadState.lastProgressAt = Date.now();
        modelViewer.src = src;
    }

    const elPressUp = document.getElementById('val-press-up');
    const elPressDown = document.getElementById('val-press-down');
    const elRpmUp = document.getElementById('val-rpm-up');
    const elRpmDown = document.getElementById('val-rpm-down');
    const elDisp = document.getElementById('val-displacement');
    const elM1 = document.getElementById('val-motor-1');
    const elM2 = document.getElementById('val-motor-2');
    const elM3 = document.getElementById('val-motor-3');
    const elM4 = document.getElementById('val-motor-4');
    const elSysHealth = document.querySelector('#sys-health-val');
    const elHeatmapUpperStatus = document.getElementById('heatmap-upper-status');
    const elHeatmapUpperLevel = document.getElementById('heatmap-upper-level');
    const elHeatmapUpperValue = document.getElementById('heatmap-upper-value');
    const elHeatmapLowerStatus = document.getElementById('heatmap-lower-status');
    const elHeatmapLowerLevel = document.getElementById('heatmap-lower-level');
    const elHeatmapLowerValue = document.getElementById('heatmap-lower-value');

    let startTimestamp = Date.now();
    setInterval(() => {
        const clockEl = document.getElementById('clock');
        if (clockEl) clockEl.textContent = new Date().toLocaleTimeString('en-US', { hour12: false });

        const uptimeEl = document.getElementById('uptime');
        if (uptimeEl) {
            const diff = Math.floor((Date.now() - startTimestamp) / 1000);
            const h = String(Math.floor(diff / 3600)).padStart(2, '0');
            const m = String(Math.floor((diff % 3600) / 60)).padStart(2, '0');
            const s = String(diff % 60).padStart(2, '0');
            uptimeEl.textContent = `${h}:${m}:${s}`;
        }
    }, 1000);

    const MAX_POINTS = 50;
    const chartTimeData = [];
    const waveChartDom = document.getElementById('sensor-chart');
    const waveChart = echarts.init(waveChartDom, null, { renderer: 'canvas' });
    const waveValData = {
        pressure: [], rpm: [], displacement: [],
        motor1: [], motor2: [], motor3: [], motor4: []
    };
    const waveChartOption = {
        tooltip: { trigger: 'axis', backgroundColor: 'rgba(24, 24, 27, 0.9)', borderColor: '#38bdf8', textStyle: { color: '#f4f4f5', fontSize: 10 } },
        legend: {
            show: true,
            top: 0,
            textStyle: { color: '#a1a1aa', fontSize: 10 },
            icon: 'circle',
            itemWidth: 8,
            itemHeight: 8
        },
        grid: { left: '10%', right: '5%', bottom: '15%', top: '25%' },
        xAxis: { type: 'category', data: chartTimeData, boundaryGap: false, axisLine: { show: false }, axisTick: { show: false }, axisLabel: { color: '#71717a', fontSize: 9 } },
        yAxis: [
            { type: 'value', name: 'Standard', splitLine: { lineStyle: { color: 'rgba(63, 63, 70, 0.5)', type: 'dashed' } }, axisLabel: { color: '#71717a', fontSize: 9 } },
            { type: 'value', name: 'RPM', show: false, splitLine: { show: false } }
        ],
        series: [
            { name: 'Active Pressure', data: waveValData.pressure, type: 'line', smooth: true, lineStyle: { color: '#f43f5e', width: 2 }, symbol: 'none' },
            { name: 'Active RPM', yAxisIndex: 1, data: waveValData.rpm, type: 'line', smooth: true, lineStyle: { color: '#fbbf24', width: 2 }, symbol: 'none' },
            { name: 'Displacement', data: waveValData.displacement, type: 'line', smooth: true, lineStyle: { color: '#38bdf8', width: 2 }, symbol: 'none' },
            { name: 'Motor 1', data: waveValData.motor1, type: 'line', smooth: true, lineStyle: { color: '#fb7185', width: 1 }, symbol: 'none' },
            { name: 'Motor 2', data: waveValData.motor2, type: 'line', smooth: true, lineStyle: { color: '#c084fc', width: 1 }, symbol: 'none' },
            { name: 'Motor 3', data: waveValData.motor3, type: 'line', smooth: true, lineStyle: { color: '#60a5fa', width: 1 }, symbol: 'none' },
            { name: 'Motor 4', data: waveValData.motor4, type: 'line', smooth: true, lineStyle: { color: '#34d399', width: 1 }, symbol: 'none' }
        ],
        animation: false
    };
    waveChart.setOption(waveChartOption);

    const healthChartDom = document.getElementById('health-trend-chart');
    const healthChart = echarts.init(healthChartDom, null, { renderer: 'canvas' });
    const healthValData = [];
    const healthChartOption = {
        tooltip: { trigger: 'axis', backgroundColor: 'rgba(24, 24, 27, 0.9)', borderColor: '#34d399', textStyle: { color: '#f4f4f5', fontSize: 10 } },
        grid: { left: '10%', right: '5%', bottom: '15%', top: '10%' },
        xAxis: { type: 'category', data: chartTimeData, boundaryGap: false, axisLine: { show: false }, axisTick: { show: false }, axisLabel: { show: false } },
        yAxis: { type: 'value', min: 0, max: 100, splitLine: { show: false }, axisLabel: { color: '#71717a', fontSize: 9 } },
        series: [{
            name: 'Health Score',
            data: healthValData,
            type: 'line',
            smooth: true,
            lineStyle: { color: '#34d399', width: 2 },
            areaStyle: {
                color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                    { offset: 0, color: 'rgba(52, 211, 153, 0.2)' },
                    { offset: 1, color: 'rgba(52, 211, 153, 0)' }
                ])
            },
            symbol: 'none'
        }],
        animation: false
    };
    healthChart.setOption(healthChartOption);

    const socket = io({
        reconnection: true,
        reconnectionAttempts: 5,
        timeout: 30000
    });

    socket.on('connect', () => {
        console.log('[3D-View] WebSocket Connected');
        socket.emit('request_data');
    });

    let mockInterval = null;
    function startMockData() {
        if (mockInterval) return;
        console.log('[3D-View] Starting Mock Data Generator...');

        let t = 0;
        mockInterval = setInterval(() => {
            t += 0.1;
            const mockPayload = {
                avg: {
                    upper_pressure: 2.0 + Math.sin(t * 0.8) * 0.5 + Math.random() * 0.1,
                    lower_pressure: 0.2,
                    left_rpm: 60 + Math.sin(t * 0.5) * 5 + Math.random(),
                    right_rpm: 0,
                    eddy_current: 0.05 + Math.sin(t * 1.5) * 0.02 + Math.random() * 0.005,
                    motor1_current: 12 + Math.sin(t * 0.7) * 1.5,
                    motor2_current: 12.5 + Math.sin(t * 0.7 + 1) * 1.2,
                    motor3_current: 11.8 + Math.sin(t * 0.7 + 2) * 1.6,
                    motor4_current: 12.2 + Math.sin(t * 0.7 + 3) * 1.4
                },
                health: {
                    system_health: 85 + Math.sin(t * 0.1) * 10,
                    components: {
                        pressure: 82 + Math.sin(t) * 5,
                        rpm: 90 + Math.cos(t) * 2,
                        displacement: 88,
                        motor: 75 + Math.sin(t * 0.5) * 15
                    }
                }
            };

            handleDataUpdate(mockPayload);
        }, 1000);
    }

    let currentMotorState = [0, 0, 0, 0];
    let currentUpperPressure = 0;
    let currentLowerPressure = 0;
    let currentHeatmapState = {
        upper: { isContacting: false, normalizedIntensity: 0, levelLabel: '无', statusText: '未接触' },
        lower: { isContacting: false, normalizedIntensity: 0, levelLabel: '无', statusText: '未接触' }
    };
    const thrustHeatDiagnostics = {
        missingMeshes: new Set(),
        missingVertexColorMeshes: new Set()
    };

    function setHeatLevelClass(el, level) {
        if (!el) return;
        el.className = getHeatLevelClass(level);
    }

    function getRootScene() {
        if (!modelViewer || !modelViewer.model) return null;

        const symbols = Object.getOwnPropertySymbols(modelViewer);
        const sceneSymbol = symbols.find(s => s.description === 'scene');
        return sceneSymbol ? modelViewer[sceneSymbol] : null;
    }

    function cloneMeshMaterialsOnce(mesh) {
        if (mesh.userData.hasClonedMaterial) return;

        if (Array.isArray(mesh.material)) {
            mesh.material = mesh.material.map(material => material.clone());
        } else {
            mesh.material = mesh.material.clone();
        }

        mesh.userData.hasClonedMaterial = true;
    }

    function forEachMaterial(mesh, callback) {
        if (Array.isArray(mesh.material)) {
            mesh.material.forEach(callback);
        } else {
            callback(mesh.material);
        }
    }

    function hasVertexColorAttribute(mesh) {
        return Boolean(mesh?.geometry?.attributes?.color || mesh?.geometry?.getAttribute?.('color'));
    }

    function getHeatSideState(side) {
        return side === 'upper' ? currentHeatmapState.upper : currentHeatmapState.lower;
    }

    function applyMaterialStyle(material, style) {
        material.transparent = style.transparent;
        material.opacity = style.opacity;
        material.depthWrite = style.depthWrite;
        material.metalness = style.metalness;
        material.roughness = style.roughness;
        material.emissiveIntensity = style.emissiveIntensity;
        material.envMapIntensity = style.envMapIntensity;

        if (material.color) {
            material.color.setRGB(...style.baseColor);
        }

        if (material.emissive) {
            material.emissive.setRGB(...style.emissive);
        }

        if ('clearcoat' in material) {
            material.clearcoat = style.clearcoat;
        }
    }

    function shouldUseUniformHeatFallback(meshName, hasVertexColors) {
        return !hasVertexColors && String(meshName).includes('Part_Tire');
    }

    function ensureThrustHeatShader(mesh, material) {
        if (material.userData.thrustHeatReady) {
            return;
        }

        const meshHasVertexColors = hasVertexColorAttribute(mesh);
        const shouldUseFallback = shouldUseUniformHeatFallback(mesh.name, meshHasVertexColors);

        if (!meshHasVertexColors && !shouldUseFallback) {
            if (!thrustHeatDiagnostics.missingVertexColorMeshes.has(mesh.name)) {
                console.warn(`${THRUST_HEAT_LOG_PREFIX} missing vertex colors: ${mesh.name}`);
                thrustHeatDiagnostics.missingVertexColorMeshes.add(mesh.name);
            }
            return;
        }

        material.vertexColors = meshHasVertexColors;
        material.userData.shaderUniforms = {
            uHeatIntensity: { value: 0.0 },
            uHeatEnabled: { value: 0.0 }
        };
        material.userData.heatWeightExpression = meshHasVertexColors ? 'vColor.r' : '1.0';

        material.onBeforeCompile = (shader) => {
            shader.uniforms.uHeatIntensity = material.userData.shaderUniforms.uHeatIntensity;
            shader.uniforms.uHeatEnabled = material.userData.shaderUniforms.uHeatEnabled;

            shader.fragmentShader = `
                uniform float uHeatIntensity;
                uniform float uHeatEnabled;

                ${HEAT_COLOR_GLSL}
            ` + shader.fragmentShader;

            shader.fragmentShader = shader.fragmentShader.replace(
                '#include <emissivemap_fragment>',
                `
                #include <emissivemap_fragment>

                float weight = ${material.userData.heatWeightExpression};
                if (weight > 0.01 && uHeatEnabled > 0.5) {
                    vec2 heatUv = vec2(vUv.x, vUv.y);
                    float analysisMask = buildAnalysisHeatMask(heatUv, weight);
                    float normalizedVal = clamp(uHeatIntensity * analysisMask, 0.0, 1.0);
                    vec3 heatColor = getHeatColor(normalizedVal);
                    totalEmissiveRadiance += heatColor * 0.85;
                    diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb + heatColor * 0.42, analysisMask * 0.82);
                }
                `
            );
        };

        material.userData.thrustHeatReady = true;
        material.needsUpdate = true;
    }

    function ensureHeatCarrierMaterial(mesh, material) {
        cloneMeshMaterialsOnce(mesh);
        ensureThrustHeatShader(mesh, material);
    }

    function updateThrustHeatUniforms(material, sideState) {
        if (!material.userData.shaderUniforms) {
            return;
        }

        material.userData.shaderUniforms.uHeatIntensity.value = sideState.normalizedIntensity;
        material.userData.shaderUniforms.uHeatEnabled.value = isHeatmapVisibleView(currentActiveViewId) && sideState.isContacting
            ? 1.0
            : 0.0;
    }

    function refreshHeatCarrierMaterial(material, heatSide) {
        const sideState = getHeatSideState(heatSide);
        updateThrustHeatUniforms(material, sideState);
    }

    function reportMissingThrustMeshes(foundUpperMesh, foundLowerMesh) {
        const expectedMeshes = [
            ['Part_Thrust_Upper', foundUpperMesh],
            ['Part_Thrust_Lower', foundLowerMesh]
        ];

        expectedMeshes.forEach(([meshName, found]) => {
            if (!found && !thrustHeatDiagnostics.missingMeshes.has(meshName)) {
                console.warn(`${THRUST_HEAT_LOG_PREFIX} mesh not found: ${meshName}`);
                thrustHeatDiagnostics.missingMeshes.add(meshName);
            }
        });
    }

    function updateHeatmapPanel(state) {
        if (elHeatmapUpperStatus) elHeatmapUpperStatus.textContent = state.upper.statusText;
        if (elHeatmapLowerStatus) elHeatmapLowerStatus.textContent = state.lower.statusText;
        if (elHeatmapUpperLevel) elHeatmapUpperLevel.textContent = state.upper.levelLabel;
        if (elHeatmapLowerLevel) elHeatmapLowerLevel.textContent = state.lower.levelLabel;
        if (elHeatmapUpperValue) elHeatmapUpperValue.textContent = state.upper.normalizedIntensity.toFixed(2);
        if (elHeatmapLowerValue) elHeatmapLowerValue.textContent = state.lower.normalizedIntensity.toFixed(2);

        setHeatLevelClass(elHeatmapUpperLevel, state.upper.levelLabel);
        setHeatLevelClass(elHeatmapLowerLevel, state.lower.levelLabel);
    }

    function handleDataUpdate(payload) {
        const { avg, health } = payload;
        const now = new Date();
        const timeStr = now.toLocaleTimeString('en-US', { hour12: false });

        if (avg) {
            currentMotorState = [
                avg.motor1_current || 0,
                avg.motor2_current || 0,
                avg.motor3_current || 0,
                avg.motor4_current || 0
            ];
            currentUpperPressure = avg.upper_pressure || 0;
            currentLowerPressure = avg.lower_pressure || 0;
            currentHeatmapState = buildHeatmapState(avg, {
                upper: currentHeatmapState.upper.isContacting,
                lower: currentHeatmapState.lower.isContacting
            });

            if (elPressUp) elPressUp.textContent = currentUpperPressure.toFixed(2);
            if (elPressDown) elPressDown.textContent = currentLowerPressure.toFixed(2);
            if (elRpmUp) elRpmUp.textContent = (avg.left_rpm || 0).toFixed(0);
            if (elRpmDown) elRpmDown.textContent = (avg.right_rpm || 0).toFixed(0);
            if (elDisp) elDisp.textContent = (avg.eddy_current || 0).toFixed(3);
            if (elM1) elM1.textContent = currentMotorState[0].toFixed(1);
            if (elM2) elM2.textContent = currentMotorState[1].toFixed(1);
            if (elM3) elM3.textContent = currentMotorState[2].toFixed(1);
            if (elM4) elM4.textContent = currentMotorState[3].toFixed(1);

            const colorMotor = (el, val) => {
                if (el) {
                    if (val > 14.5) {
                        el.classList.remove('text-zinc-100');
                        el.classList.add('text-rose-400');
                    } else {
                        el.classList.remove('text-rose-400');
                        el.classList.add('text-zinc-100');
                    }
                }
            };
            colorMotor(elM1, currentMotorState[0]);
            colorMotor(elM2, currentMotorState[1]);
            colorMotor(elM3, currentMotorState[2]);
            colorMotor(elM4, currentMotorState[3]);
            updateHeatmapPanel(currentHeatmapState);
        }

        chartTimeData.push(timeStr);
        if (chartTimeData.length > MAX_POINTS) {
            chartTimeData.shift();
        }

        if (health && health.system_health !== undefined) {
            if (elSysHealth) elSysHealth.textContent = health.system_health.toFixed(1);

            const sysHealthStatus = document.getElementById('sys-health-status');
            if (sysHealthStatus) {
                if (health.system_health < 40) {
                    sysHealthStatus.textContent = '危险 CRITICAL';
                    sysHealthStatus.className = 'text-xs font-medium text-rose-400 bg-rose-400/10 px-2 py-0.5 rounded border border-rose-400/20';
                } else if (health.system_health < 60) {
                    sysHealthStatus.textContent = '较差 POOR';
                    sysHealthStatus.className = 'text-xs font-medium text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded border border-amber-400/20';
                } else if (health.system_health < 80) {
                    sysHealthStatus.textContent = '良好 GOOD';
                    sysHealthStatus.className = 'text-xs font-medium text-sky-400 bg-sky-400/10 px-2 py-0.5 rounded border border-sky-400/20';
                } else {
                    sysHealthStatus.textContent = '健康 OPTIMAL';
                    sysHealthStatus.className = 'text-xs font-medium text-emerald-400 bg-emerald-400/10 px-2 py-0.5 rounded border border-emerald-400/20';
                }
            }

            healthValData.push(health.system_health);
            if (healthValData.length > MAX_POINTS) {
                healthValData.shift();
            }
            healthChart.setOption({
                xAxis: { data: chartTimeData },
                series: [{ data: healthValData }]
            });

            const faultTbody = document.getElementById('fault-info-tbody');
            if (faultTbody) {
                faultTbody.innerHTML = '';

                const addFaultRow = (component, value) => {
                    if (value < 80) {
                        const tr = document.createElement('tr');
                        tr.className = 'border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors';

                        let levelText = '良好 GOOD';
                        let colorClass = 'bg-sky-500/10 text-sky-400 border-sky-500/20';
                        if (value < 40) {
                            levelText = '危险 CRITICAL';
                            colorClass = 'bg-rose-500/10 text-rose-400 border-rose-500/20';
                        } else if (value < 60) {
                            levelText = '较差 POOR';
                            colorClass = 'bg-amber-500/10 text-amber-400 border-amber-500/20';
                        }

                        tr.innerHTML = `
                            <td class="py-2.5 font-mono text-zinc-500">${timeStr}</td>
                            <td class="py-2.5 text-zinc-300">${component}</td>
                            <td class="py-2.5">
                                <span class="px-2 py-0.5 rounded text-[10px] font-medium border ${colorClass}">
                                    ${levelText}
                                </span>
                            </td>
                        `;
                        faultTbody.prepend(tr);
                    }
                };

                if (health.components) {
                    addFaultRow('Pressure Sys', health.components.pressure);
                    addFaultRow('Speed Sys', health.components.rpm);
                    addFaultRow('Displacement', health.components.displacement);
                    addFaultRow('Motor Sys', health.components.motor);
                } else {
                    addFaultRow('Upper Limit', health.upper_health || health.system_health);
                    addFaultRow('Lower Limit', health.lower_health || health.system_health);
                }

                while (faultTbody.children.length > 10) {
                    faultTbody.removeChild(faultTbody.lastChild);
                }
            }
        }

        if (avg) {
            waveValData.pressure.push(currentUpperPressure);
            waveValData.rpm.push(avg.left_rpm || 0);
            waveValData.displacement.push(avg.eddy_current || 0);
            waveValData.motor1.push(currentMotorState[0]);
            waveValData.motor2.push(currentMotorState[1]);
            waveValData.motor3.push(currentMotorState[2]);
            waveValData.motor4.push(currentMotorState[3]);

            if (waveValData.pressure.length > MAX_POINTS) {
                waveValData.pressure.shift();
                waveValData.rpm.shift();
                waveValData.displacement.shift();
                waveValData.motor1.shift();
                waveValData.motor2.shift();
                waveValData.motor3.shift();
                waveValData.motor4.shift();
            }

            const config = viewConfigs[currentActiveViewId] || viewConfigs.global;

            let activeColor = '#38bdf8';
            if (config.activeMetrics.includes('pressure')) activeColor = '#f43f5e';
            else if (config.activeMetrics.includes('rpm')) activeColor = '#fbbf24';
            else if (config.activeMetrics.includes('motor')) activeColor = '#8b5cf6';

            waveChart.setOption({
                xAxis: { data: chartTimeData },
                series: [
                    { name: 'Active Pressure', data: config.activeMetrics.includes('pressure') ? waveValData.pressure : [], lineStyle: { color: activeColor } },
                    { name: 'Active RPM', data: config.activeMetrics.includes('rpm') ? waveValData.rpm : [], lineStyle: { color: activeColor } },
                    { name: 'Displacement', data: config.activeMetrics.includes('displacement') ? waveValData.displacement : [] },
                    { name: 'Motor 1', data: config.activeMetrics.includes('motor') ? waveValData.motor1 : [] },
                    { name: 'Motor 2', data: config.activeMetrics.includes('motor') ? waveValData.motor2 : [] },
                    { name: 'Motor 3', data: config.activeMetrics.includes('motor') ? waveValData.motor3 : [] },
                    { name: 'Motor 4', data: config.activeMetrics.includes('motor') ? waveValData.motor4 : [] }
                ]
            });
        }
    }

    function calculateViewportOffset() {
        const leftPanelWidth = 380;
        const rightPanelWidth = 288;
        return (leftPanelWidth - rightPanelWidth) / 2;
    }

    function applyViewportCentering() {
        if (modelViewer) {
            const offsetX = calculateViewportOffset();
            modelViewer.style.transform = `translateX(${offsetX}px)`;
        }
    }

    applyViewportCentering();
    window.addEventListener('resize', applyViewportCentering);

    const viewConfigs = {
        global: {
            orbit: '45deg 75deg 105%', target: 'auto auto auto',
            targetMaterials: [], title: 'Digital Twin',
            autoRotate: true, activeMetrics: ['pressure', 'rpm', 'displacement', 'motor']
        },
        pressure: {
            orbit: '4deg 88deg 28%', target: 'auto auto auto',
            targetMaterials: ['Sens_Press_Upper', 'Sens_Press_Lower', 'Part_Thrust_Upper', 'Part_Thrust_Lower', 'Part_Tire_Upper', 'Part_Tire_Lower'], title: 'Live Telemetry // Pressure Detail',
            autoRotate: false, activeMetrics: ['pressure']
        },
        rpm: {
            orbit: '178deg 88deg 30%', target: 'auto auto auto',
            targetMaterials: ['Sens_Rpm_Upper', 'Sens_Rpm_Lower', 'Part_Thrust_Upper', 'Part_Thrust_Lower', 'Part_Tire_Upper', 'Part_Tire_Lower'], title: 'Live Telemetry // RPM Detail',
            autoRotate: false, activeMetrics: ['rpm']
        },
        motor: {
            orbit: '38deg 62deg 46%', target: 'auto auto auto',
            targetMaterials: ['Sens_Motor_M1', 'Sens_Motor_M2', 'Sens_Motor_M3', 'Sens_Motor_M4'], title: 'Live Telemetry // Motor',
            autoRotate: false, activeMetrics: ['motor']
        }
    };

    function buildTargetBoundingCenter(rootScene, config) {
        const matchedPoints = [];
        let minX = Infinity;
        let minY = Infinity;
        let minZ = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;
        let maxZ = -Infinity;

        rootScene.traverse((obj) => {
            if (!obj.isMesh || !obj.name || !obj.geometry) return;
            const matchName = `${obj.name || ''} ${obj.parent ? obj.parent.name || '' : ''}`;
            const isTarget = config.targetMaterials.some(keyword => matchName.includes(keyword));
            if (!isTarget) return;

            if (!obj.geometry.boundingBox) {
                obj.geometry.computeBoundingBox();
            }
            const box = obj.geometry.boundingBox;
            if (!box) return;

            const corners = [
                [box.min.x, box.min.y, box.min.z],
                [box.max.x, box.min.y, box.min.z],
                [box.min.x, box.max.y, box.min.z],
                [box.min.x, box.min.y, box.max.z],
                [box.max.x, box.max.y, box.min.z],
                [box.max.x, box.min.y, box.max.z],
                [box.min.x, box.max.y, box.max.z],
                [box.max.x, box.max.y, box.max.z]
            ];

            corners.forEach(([x, y, z]) => {
                const point = obj.position.clone();
                point.x = x;
                point.y = y;
                point.z = z;
                point.applyMatrix4(obj.matrixWorld);
                matchedPoints.push(point);
                minX = Math.min(minX, point.x);
                minY = Math.min(minY, point.y);
                minZ = Math.min(minZ, point.z);
                maxX = Math.max(maxX, point.x);
                maxY = Math.max(maxY, point.y);
                maxZ = Math.max(maxZ, point.z);
            });
        });

        if (!matchedPoints.length) return null;

        return {
            x: (minX + maxX) / 2,
            y: (minY + maxY) / 2,
            z: (minZ + maxZ) / 2
        };
    }

    window.switchView = function(viewId) {
        const config = viewConfigs[viewId];
        if (!config) return;

        navButtons.forEach(btn => btn.setAttribute('data-active', 'false'));
        const activeBtn = document.querySelector(`.nav-btn[data-view="${viewId}"]`);
        if (activeBtn) activeBtn.setAttribute('data-active', 'true');

        currentActiveViewId = viewId;

        if (modelViewer) {
            modelViewer.cameraOrbit = config.orbit;
            modelViewer.autoRotate = config.autoRotate;

            if (viewId === 'global' || !config.targetMaterials || config.targetMaterials.length === 0) {
                modelViewer.cameraTarget = config.target;
            } else {
                const rootScene = getRootScene();
                if (rootScene) {
                    const center = buildTargetBoundingCenter(rootScene, config);
                    if (center) {
                        const [offsetX, offsetY, offsetZ] = buildViewTargetOffset(viewId);
                        modelViewer.cameraTarget = `${(center.x + offsetX).toFixed(3)}m ${(center.y + offsetY).toFixed(3)}m ${(center.z + offsetZ).toFixed(3)}m`;
                    } else {
                        modelViewer.cameraTarget = config.target;
                    }
                } else {
                    modelViewer.cameraTarget = config.target;
                }
            }
        }

        setMaterialsOpacity(config.targetMaterials);
        if (telemetryTitle) telemetryTitle.textContent = config.title;

        if (btnResetView) {
            if (viewId === 'global') btnResetView.classList.add('hidden');
            else btnResetView.classList.remove('hidden');
        }

        waveChart.setOption({
            series: [
                { name: 'Active Pressure', data: config.activeMetrics.includes('pressure') ? waveValData.pressure : [] },
                { name: 'Active RPM', data: config.activeMetrics.includes('rpm') ? waveValData.rpm : [] },
                { name: 'Displacement', data: config.activeMetrics.includes('displacement') ? waveValData.displacement : [] },
                { name: 'Motor 1', data: config.activeMetrics.includes('motor') ? waveValData.motor1 : [] },
                { name: 'Motor 2', data: config.activeMetrics.includes('motor') ? waveValData.motor2 : [] },
                { name: 'Motor 3', data: config.activeMetrics.includes('motor') ? waveValData.motor3 : [] },
                { name: 'Motor 4', data: config.activeMetrics.includes('motor') ? waveValData.motor4 : [] }
            ]
        });
    };

    if (btnResetView) {
        btnResetView.addEventListener('click', () => {
            window.switchView('global');
        });
    }

    setInterval(() => {
        const config = viewConfigs[currentActiveViewId];
        if (config) setMaterialsOpacity(config.targetMaterials);
    }, 500);

    let currentActiveViewId = 'global';

    async function setMaterialsOpacity(targetMats) {
        const rootScene = getRootScene();
        if (!rootScene) return;

        let foundUpperThrustMesh = false;
        let foundLowerThrustMesh = false;

        rootScene.traverse((obj) => {
            if (!obj.isMesh || !obj.material || !obj.name) return;

            const matchName = `${obj.name || ''} ${obj.parent ? obj.parent.name || '' : ''}`;
            const isUpperThrustMesh = matchName.includes('Part_Thrust_Upper');
            const isLowerThrustMesh = matchName.includes('Part_Thrust_Lower');
            const heatSide = resolveHeatCarrierSide(matchName);
            const isHeatCarrierMesh = Boolean(heatSide);
            const isTargetMesh = Boolean(targetMats && targetMats.some(keyword => matchName.includes(keyword)));

            if (isUpperThrustMesh) foundUpperThrustMesh = true;
            if (isLowerThrustMesh) foundLowerThrustMesh = true;

            cloneMeshMaterialsOnce(obj);
            forEachMaterial(obj, (material) => {
                const style = buildMaterialStyle({
                    viewId: currentActiveViewId,
                    isTargetMesh,
                    meshName: matchName
                });
                applyMaterialStyle(material, style);

                if (isHeatCarrierMesh) {
                    ensureHeatCarrierMaterial(obj, material);
                    refreshHeatCarrierMaterial(material, heatSide);
                }
            });
        });

        reportMissingThrustMeshes(foundUpperThrustMesh, foundLowerThrustMesh);
        if (modelViewer?.queueRender) {
            modelViewer.queueRender();
        }
    }

    const btnMockData = document.getElementById('btn-mock-data');
    if (btnMockData) {
        btnMockData.addEventListener('click', startMockData);
    }

    const hotspots = document.querySelectorAll('.Hotspot');
    hotspots.forEach(spot => {
        spot.addEventListener('click', () => {
            const targetView = resolveHotspotView(spot.slot);
            if (targetView) {
                window.switchView(targetView);
            }
        });
    });

    if (modelViewer) {
        if (progressContainer) progressContainer.style.display = 'block';
        if (updateBar) updateBar.style.width = '0%';
        if (loadingText) loadingText.textContent = '正在准备 3D 模型加载... 0%';

        modelViewer.addEventListener('load', () => {
            loadState.completed = true;
            if (progressContainer) progressContainer.style.display = 'none';
            window.switchView('global');
        });

        modelViewer.addEventListener('progress', (event) => {
            const progress = Math.round((event.detail.totalProgress || 0) * 100);
            loadState.lastProgress = progress;
            loadState.lastProgressAt = Date.now();
            if (updateBar) updateBar.style.width = `${progress}%`;
            if (loadingText) loadingText.textContent = `正在准备 3D 模型加载... ${progress}%`;
        });

        const initialSrc = modelSources.draco || modelSources.noDraco;
        setModelSource(initialSrc, { usingDraco: Boolean(modelSources.draco) });
    }

    socket.on('data_update', handleDataUpdate);
});

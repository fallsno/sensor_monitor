/**
 * 动画模块
 * 使用GIF实现动画效果
 */
import { store } from './core.js';

export function loadImages() {
    // GIF预加载逻辑
    const gifSources = [
        '/static/images/gifs/roller-static.gif',
        '/static/images/gifs/roller-animated.gif',
        '/static/images/gifs/wheel-static.gif',
        '/static/images/gifs/wheel-animated.gif',
        '/static/images/gifs/ring-static.gif',
        '/static/images/gifs/ring-animated.gif'
    ];
    
    gifSources.forEach(src => {
        const img = new Image();
        img.src = src;
    });
}

export function startAnimations() {
    const rollerImg = document.getElementById('rollerImage');
    const upperImg = document.getElementById('upperWheelImage');
    const lowerImg = document.getElementById('lowerWheelImage');
    const ringImg = document.getElementById('ringImage');
    
    let currentState = {
        roller: 'static',
        upperWheel: 'static',
        lowerWheel: 'static',
        ring: 'static'
    };
    
    function updateAnimation() {
        // 如果未在采集，强制设为 static
        if (!store.isCollecting) {
            if (currentState.roller !== 'static') {
                if (rollerImg) rollerImg.src = '/static/images/gifs/roller-static.gif';
                currentState.roller = 'static';
            }
            if (currentState.upperWheel !== 'static') {
                if (upperImg) upperImg.src = '/static/images/gifs/wheel-static.gif';
                currentState.upperWheel = 'static';
            }
            if (currentState.lowerWheel !== 'static') {
                if (lowerImg) lowerImg.src = '/static/images/gifs/wheel-static.gif';
                currentState.lowerWheel = 'static';
            }
            if (currentState.ring !== 'static') {
                if (ringImg) ringImg.src = '/static/images/gifs/ring-static.gif';
                currentState.ring = 'static';
            }
            setTimeout(updateAnimation, 500); // 停止采集时降低检查频率
            return;
        }

        // 检查电机状态
        const anyMotorActive = store.motor1Data.some(v => v > 0) || 
                             store.motor2Data.some(v => v > 0) ||
                             store.motor3Data.some(v => v > 0) || 
                             store.motor4Data.some(v => v > 0);
        
        // 检查转速状态
        // 假设右转速数据对应上限位轮，左转速数据对应下限位轮
        const rightRpmActive = store.rightRpmData && store.rightRpmData.length > 0 && store.rightRpmData[store.rightRpmData.length - 1] > 0;
        const leftRpmActive = store.leftRpmData && store.leftRpmData.length > 0 && store.leftRpmData[store.leftRpmData.length - 1] > 0;
        const anyRpmActive = leftRpmActive || rightRpmActive;
        
        // 更新滚筒
        if (anyMotorActive && currentState.roller === 'static') {
            if (rollerImg) {
                // 使用带有时间戳的 URL 以确保每次设置 src 时动画都能从头开始播放
                rollerImg.src = '/static/images/gifs/roller-animated.gif?t=' + Date.now();
                currentState.roller = 'animated';
            }
        } else if (!anyMotorActive && currentState.roller === 'animated') {
            if (rollerImg) {
                rollerImg.src = '/static/images/gifs/roller-static.gif';
                currentState.roller = 'static';
            }
        }
        
        // 更新上限位轮 (根据右转速)
        if (rightRpmActive && currentState.upperWheel === 'static') {
            if (upperImg) {
                upperImg.src = '/static/images/gifs/wheel-animated.gif?t=' + Date.now();
                currentState.upperWheel = 'animated';
            }
        } else if (!rightRpmActive && currentState.upperWheel === 'animated') {
            if (upperImg) {
                upperImg.src = '/static/images/gifs/wheel-static.gif';
                currentState.upperWheel = 'static';
            }
        }
        
        // 更新下限位轮 (根据左转速)
        if (leftRpmActive && currentState.lowerWheel === 'static') {
            if (lowerImg) {
                lowerImg.src = '/static/images/gifs/wheel-animated.gif?t=' + Date.now();
                currentState.lowerWheel = 'animated';
            }
        } else if (!leftRpmActive && currentState.lowerWheel === 'animated') {
            if (lowerImg) {
                lowerImg.src = '/static/images/gifs/wheel-static.gif';
                currentState.lowerWheel = 'static';
            }
        }
        
        // 更新滚圈
        if (anyRpmActive && currentState.ring === 'static') {
            if (ringImg) {
                ringImg.src = '/static/images/gifs/ring-animated.gif?t=' + Date.now();
                currentState.ring = 'animated';
            }
        } else if (!anyRpmActive && currentState.ring === 'animated') {
            if (ringImg) {
                ringImg.src = '/static/images/gifs/ring-static.gif';
                currentState.ring = 'static';
            }
        }
        
        // 每100ms检查一次状态就够了，没必要用 requestAnimationFrame 以60fps的速度检查
        setTimeout(updateAnimation, 100);
    }
    
    // 启动循环
    setTimeout(updateAnimation, 100);
}

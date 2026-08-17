# background/file_monitor.py
import threading
import time
import os
import logging
from datetime import datetime
from backend.health_calculator import HealthCalculator

logger = logging.getLogger('FileMonitor')

monitor_thread = None
monitor_running = False
monitor_file_path = None
monitor_file_position = 0
_socketio = None
_health_calc = None
_last_cycle_time = 0
_accumulator = {'points': [], 'last_emit_time': 0}

def set_socketio(socketio):
    global _socketio
    _socketio = socketio

def set_health_params(params):
    global _health_calc
    _health_calc = HealthCalculator(
        upper_preload=params.get('upperPreloadPressure', 2.0),
        upper_critical=params.get('upperCriticalPressure', 3.5),
        lower_preload=params.get('lowerPreloadPressure', 2.0),
        lower_critical=params.get('lowerCriticalPressure', 3.5),
        cycle_seconds=params.get('cycleSeconds', 60)
    )

def monitor_worker(file_path):
    global monitor_running, monitor_file_position, _accumulator, _health_calc, _socketio, _last_cycle_time
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            f.seek(monitor_file_position)
            while monitor_running:
                line = f.readline()
                if line:
                    line = line.strip()
                    if line:
                        point = parse_line(line)
                        if point:
                            _accumulator['points'].append(point)
                else:
                    time.sleep(0.05)

                now = time.time()
                if now - _accumulator['last_emit_time'] >= 1.0 and _accumulator['points']:
                    avg = calculate_average(_accumulator['points'])
                    if avg and _socketio:
                        health = _health_calc.update(avg) if _health_calc else None
                        _socketio.emit('data_update', {
                            'avg': avg,
                            'health': health,
                            'is_collecting': True
                        })
                        if _health_calc:
                            cycle_data = _health_calc.get_last_cycle_data()
                            if cycle_data.get('timestamp') and cycle_data['timestamp'] != _last_cycle_time:
                                _last_cycle_time = cycle_data['timestamp']
                                _socketio.emit('cycle_data', cycle_data)
                    _accumulator['points'] = []
                    _accumulator['last_emit_time'] = now

                monitor_file_position = f.tell()
    except Exception as e:
        logger.error(f"监控线程错误: {e}")
    finally:
        monitor_running = False

def parse_line(line):
    parts = line.strip().split(',')
    if len(parts) < 6:
        return None
    try:
        # 时间解析（可选）
        time_str = parts[0].strip()
        if ':' in time_str:
            h, m, s = map(float, time_str.split(':'))
            timestamp_sec = h * 3600 + m * 60 + s
        else:
            timestamp_sec = float(time_str) if time_str else 0

        left_rpm = float(parts[1]) if len(parts) > 1 else 0.0
        right_rpm = float(parts[2]) if len(parts) > 2 else 0.0
        upper_pressure = float(parts[3]) if len(parts) > 3 else 0.0
        lower_pressure = float(parts[4]) if len(parts) > 4 else 0.0
        eddy_current = float(parts[5]) if len(parts) > 5 else 0.0
        motor1 = float(parts[6]) if len(parts) > 6 else 0.0
        motor2 = float(parts[7]) if len(parts) > 7 else 0.0
        motor3 = float(parts[8]) if len(parts) > 8 else 0.0
        motor4 = float(parts[9]) if len(parts) > 9 else 0.0

        return {
            'timestamp': timestamp_sec,
            'left_rpm': left_rpm,
            'right_rpm': right_rpm,
            'upper_pressure': upper_pressure,
            'lower_pressure': lower_pressure,
            'eddy_current': eddy_current,
            'motor1': motor1,
            'motor2': motor2,
            'motor3': motor3,
            'motor4': motor4
        }
    except Exception as e:
        logger.error(f"解析行失败: {e}, line={line[:100]}")
        return None

def calculate_average(points):
    if not points:
        return None
    n = len(points)
    return {
        'upper_pressure': sum(p['upper_pressure'] for p in points) / n,
        'lower_pressure': sum(p['lower_pressure'] for p in points) / n,
        'left_rpm': sum(p['left_rpm'] for p in points) / n,
        'right_rpm': sum(p['right_rpm'] for p in points) / n,
        'eddy_current': sum(p['eddy_current'] for p in points) / n,
        'motor1': sum(p['motor1'] for p in points) / n,
        'motor2': sum(p['motor2'] for p in points) / n,
        'motor3': sum(p['motor3'] for p in points) / n,
        'motor4': sum(p['motor4'] for p in points) / n
    }

def start_file_monitor(file_path):
    global monitor_thread, monitor_running, monitor_file_path, monitor_file_position, _accumulator
    if monitor_running:
        stop_file_monitor()
    if not os.path.exists(file_path):
        return False
    monitor_file_path = file_path
    monitor_file_position = os.path.getsize(file_path)
    _accumulator = {'points': [], 'last_emit_time': time.time()}
    monitor_running = True
    monitor_thread = threading.Thread(target=monitor_worker, args=(file_path,), daemon=True)
    monitor_thread.start()
    return True

def stop_file_monitor():
    global monitor_running
    monitor_running = False
    if monitor_thread:
        monitor_thread.join(timeout=2)
    return True
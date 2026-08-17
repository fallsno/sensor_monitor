# backend/collector.py
import threading
import time
import logging
from backend.sensor_reader import sensor_reader
from backend.health_calculator import HealthCalculator

logger = logging.getLogger('DataCollector')

class DataCollector:
    _instance = None
    _lock = threading.Lock()

    def __new__(cls):
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = super().__new__(cls)
                    cls._instance._initialized = False
        return cls._instance

    def __init__(self):
        if self._initialized:
            return
        self._initialized = True
        self.is_collecting = False
        self.collect_thread = None
        self.health_calc = HealthCalculator()
        # 初始化默认的平均值
        self.latest_avg = {
            'upper_pressure': 0,
            'lower_pressure': 0,
            'left_rpm': 0,
            'right_rpm': 0,
            'eddy_current': 0,
            'motor1': 0,
            'motor2': 0,
            'motor3': 0,
            'motor4': 0
        }
        self.latest_health = None
        self._socketio = None
        self._last_cycle_time = 0

    def set_socketio(self, socketio):
        self._socketio = socketio

    def start(self):
        if self.is_collecting:
            return False
        
        # 初始化传感器读取器任务
        from backend.sensor_reader import sensor_reader

        init_ok = sensor_reader.reload_config()
        if not init_ok:
            logger.error(f"采集任务初始化失败: {sensor_reader.last_error}")
            return False
        
        from background.reader import start_background_reader
        start_background_reader()
        self.is_collecting = True
        self._broadcast_status()
        self.collect_thread = threading.Thread(target=self._broadcast_loop, daemon=True)
        self.collect_thread.start()
        return True

    def stop(self):
        self.is_collecting = False
        self._broadcast_status()
        if self.collect_thread:
            self.collect_thread.join(timeout=2)
        from background.reader import stop_background_reader
        stop_background_reader()
        
        # 清理采集任务
        from backend.sensor_reader import sensor_reader
        try:
            if sensor_reader.ai_task:
                sensor_reader.ai_task.stop()
                sensor_reader.ai_task.close()
                sensor_reader.ai_task = None
            if sensor_reader.freq_task1:
                sensor_reader.freq_task1.stop()
                sensor_reader.freq_task1.close()
                sensor_reader.freq_task1 = None
            if sensor_reader.freq_task2:
                sensor_reader.freq_task2.stop()
                sensor_reader.freq_task2.close()
                sensor_reader.freq_task2 = None
            logger.info("采集任务已清理")
        except Exception as e:
            logger.warning(f"清理采集任务时出错: {e}")
        
        return True

    def _broadcast_status(self):
        if self._socketio:
            self._socketio.emit('data_update', {
                'avg': self.latest_avg,
                'health': self.latest_health,
                'is_collecting': self.is_collecting
            })

    def _broadcast_loop(self):
        last_broadcast = 0
        last_second = 0
        broadcast_interval = 0.1  # 从 0.2 缩短为 0.1，每 100ms 广播一次
        points_buffer = []
        avg = self.latest_avg
        health = self.latest_health
        while self.is_collecting:
            now = time.time()
            data = sensor_reader.sensor_status.copy()
            # 转换为简单数值字典
            simple_data = {k: v.get('value', 0) for k, v in data.items()}
            points_buffer.append(simple_data)

            if now - last_broadcast >= broadcast_interval:
                avg = self._calculate_average(points_buffer)
                self.latest_avg = avg
                health = self.health_calc.update(avg)
                self.latest_health = health
                if self._socketio:
                    self._socketio.emit('data_update', {
                        'avg': avg,
                        'health': health,
                        'is_collecting': self.is_collecting
                    })
                    # 广播周期数据
                    cycle_data = self.health_calc.get_last_cycle_data()
                    if cycle_data.get('timestamp') and cycle_data['timestamp'] != self._last_cycle_time:
                        self._last_cycle_time = cycle_data['timestamp']
                        self._socketio.emit('cycle_data', cycle_data)
                points_buffer = []
                last_broadcast = now
            
            # 更新客户端状态（每秒一次）
            if int(now) != last_second:
                last_second = int(now)
                self._update_client_state(simple_data, avg, health)
                
            time.sleep(0.05)

    def _calculate_average(self, buffer):
        if not buffer:
            return self.latest_avg.copy()
            
        # Start with all keys set to 0 to ensure we don't lose any standard keys
        avg = {k: 0 for k in self.latest_avg.keys()}
        
        # Calculate averages for keys present in the buffer
        for key in buffer[0].keys():
            values = [p[key] for p in buffer if key in p]
            avg[key] = sum(values) / len(values) if values else 0
            
        return avg
    
    def _update_client_state(self, sensor_data=None, avg=None, health=None):
        """更新客户端状态以同步到服务端"""
        try:
            from backend.client_manager import client_manager
            from backend.config_manager import config_manager
            
            state_updates = {
                'is_collecting': self.is_collecting,
                'sensor_status': sensor_reader.sensor_status.copy() if sensor_reader else {},
                'health_data': health,
                'avg_data': avg,
                'config': config_manager.get_config()
            }
            client_manager.update_client_state(state_updates)
        except Exception as e:
            logger.debug(f"更新客户端状态失败: {e}")

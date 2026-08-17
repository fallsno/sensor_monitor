"""
后台数据读取线程
功能：
- 定期读取传感器数据并通过 WebSocket 推送
- 如果正在保存，则调用 sensor_reader.save_data_point 保存数据点
"""
import threading
import time
import logging
from flask_socketio import SocketIO

# 导入传感器读取器（延迟导入避免循环）
# from backend.sensor_reader import sensor_reader

logger = logging.getLogger('BackgroundReader')

# 全局变量
background_thread = None
thread_running = False
_socketio = None  # 将在 set_socketio 中设置

def set_socketio(socketio_instance):
    """设置 socketio 实例，用于发送消息"""
    global _socketio
    _socketio = socketio_instance

def background_reader():
    """后台读取线程主函数 - 仅用于数据读取和保存，不发送数据更新（数据更新由collector处理）"""
    global thread_running
    from backend.sensor_reader import sensor_reader  # 延迟导入

    while thread_running:
        try:
            # 读取所有传感器数据（已包含保存逻辑）
            data = sensor_reader.read_all_sensors()

            # 根据计数器测量时间调整休眠时间
            # 计数器meas_time为0.1秒，这里休眠0.05秒以保持实时性
            time.sleep(0.05)

        except Exception as e:
            logger.error(f"后台读取线程错误: {e}")
            time.sleep(0.1)

def start_background_reader():
    """启动后台读取线程"""
    global background_thread, thread_running

    if background_thread is None or not background_thread.is_alive():
        thread_running = True
        background_thread = threading.Thread(target=background_reader, daemon=True)
        background_thread.start()
        logger.info("后台读取线程已启动")

def stop_background_reader():
    """停止后台读取线程"""
    global thread_running
    thread_running = False
    logger.info("后台读取线程已停止")
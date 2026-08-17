# routes/monitor.py
from flask import Blueprint, jsonify, request
import logging
from background.file_monitor import start_file_monitor, stop_file_monitor, set_health_params
from backend.collector import DataCollector

monitor_bp = Blueprint('monitor', __name__)
logger = logging.getLogger('MonitorRoutes')

@monitor_bp.route('/start', methods=['POST'])
def start_monitor():
    data = request.get_json()
    file_path = data.get('filepath')
    if not file_path:
        return jsonify({'success': False, 'message': '未提供文件路径'})

    # 停止硬件采集（如果正在运行）
    collector = DataCollector()
    if collector.is_collecting:
        collector.stop()

    # 从配置加载健康度参数并传递给 file_monitor
    try:
        from backend.config_manager import config_manager
        full_config = config_manager.get_config()
        health_params = full_config.get('health', {})
        set_health_params(health_params)
    except Exception as e:
        logger.warning(f"加载健康度参数失败: {e}")

    if start_file_monitor(file_path):
        # 广播采集状态为 true（文件监控视为采集中）
        from background.file_monitor import _socketio
        if _socketio:
            _socketio.emit('data_update', {
                'avg': None,
                'health': None,
                'is_collecting': True
            })
        return jsonify({'success': True, 'message': '开始监控文件'})
    else:
        return jsonify({'success': False, 'message': '文件不存在或无法监控'})

@monitor_bp.route('/stop', methods=['POST'])
def stop_monitor():
    stop_file_monitor()
    from background.file_monitor import _socketio
    if _socketio:
        _socketio.emit('data_update', {
            'avg': None,
            'health': None,
            'is_collecting': False
        })
    return jsonify({'success': True})
"""
控制接口：开始、停止、保存等采集控制
功能：
- /api/control/status         获取系统状态
- /api/control/start          开始采集
- /api/control/save           开始保存数据
- /api/control/stop           停止采集/监控
"""
from flask import Blueprint, jsonify, request
import logging
import os
from datetime import datetime

from backend.sensor_reader import sensor_reader
from background.reader import start_background_reader, stop_background_reader
from backend.collector import DataCollector
collector = DataCollector()


control_bp = Blueprint('control', __name__)
logger = logging.getLogger('ControlRoutes')


@control_bp.route('/start', methods=['POST'])
def start_collection():
    """开始系统运行（不保存数据）"""
    success = collector.start()
    return jsonify({'success': success})


@control_bp.route('/save', methods=['POST'])
def start_saving():
    """开始保存数据到文件和数据库"""
    data = request.json
    save_path = data.get('path', './data') if data else './data'

    if not collector.is_collecting:
        return jsonify({'success': False, 'message': '未在采集中，无法保存'})

    if sensor_reader.saving or sensor_reader.current_record_id:
        return jsonify({'success': False, 'message': '已在保存中'})

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"sensor_data_{timestamp}.csv"
    filepath = os.path.join(save_path, filename)

    os.makedirs(os.path.dirname(filepath), exist_ok=True)

    sensor_reader.start_saving(filepath)
    record_name = f"数据记录_{timestamp}"
    sensor_reader.start_db_saving(record_name)

    from flask import current_app
    socketio = current_app.extensions['socketio']
    socketio.emit('save_status', {'saving': True, 'filepath': filepath})

    return jsonify({'success': True, 'message': f'开始保存到 {filename}', 'filepath': filepath})


@control_bp.route('/stop', methods=['POST'])
def stop_collection():
    """停止采集和保存"""
    # 先停止数据库保存
    sensor_reader.stop_saving()
    success = collector.stop()
    return jsonify({'success': success})


@control_bp.route('/status', methods=['GET'])
def get_status():
    return jsonify({
        'is_collecting': collector.is_collecting,
        'latest_avg': collector.latest_avg,
        'latest_health': collector.latest_health
    })
"""
数据查询接口：传感器实时数据、历史数据、手动数据保存等
功能：
- /api/data/sensors/status                获取所有传感器状态
- /api/data/sensors/statistics/<name>     获取指定传感器统计
- /api/data/sensors/waveform/<name>       获取波形数据
- /api/data/history/<type>                 获取历史数据
- /api/data/stats/<type>                   获取最近统计数据
- /api/data/manual/save                     保存手动输入数据
- /api/data/files                           列出已保存的数据文件
"""
from flask import Blueprint, jsonify, request
import logging
import os
from datetime import datetime

from backend.sensor_reader import sensor_reader
from backend.data_saver import data_saver

data_bp = Blueprint('data', __name__)
logger = logging.getLogger('DataRoutes')

# 数据目录（用于列出文件）
DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'data')
HISTORY_DIR = os.path.join(DATA_DIR, 'history')

@data_bp.route('/sensors/status')
def get_sensor_status():
    """获取所有传感器实时状态"""
    return jsonify(sensor_reader.sensor_status)

@data_bp.route('/sensors/statistics/<sensor_name>')
def get_statistics(sensor_name):
    """获取指定传感器统计信息"""
    window = request.args.get('window', 100, type=int)
    stats = sensor_reader.get_statistics(sensor_name, window)
    return jsonify(stats)

@data_bp.route('/sensors/waveform/<sensor_name>')
def get_waveform(sensor_name):
    """获取指定传感器波形数据（用于图表）"""
    points = request.args.get('points', 100, type=int)
    data = sensor_reader.get_waveform_data(sensor_name, points)
    return jsonify(data)

@data_bp.route('/history/<data_type>')
def get_history(data_type):
    """获取历史数据（按类型）"""
    start = request.args.get('start')
    end = request.args.get('end')
    limit = request.args.get('limit', 100, type=int)
    data = data_saver.get_historical_data(data_type, start, end, limit)
    return jsonify(data)

@data_bp.route('/stats/<data_type>')
def get_stats(data_type):
    """获取最近几分钟的统计数据"""
    minutes = request.args.get('minutes', 5, type=int)
    stats = data_saver.get_recent_stats(data_type, minutes)
    return jsonify(stats)

@data_bp.route('/manual/save', methods=['POST'])
def save_manual_data():
    """保存手动输入数据"""
    try:
        data = request.json
        result = data_saver.save_manual_data(data)
        if result:
            return jsonify({'success': True, 'message': '数据保存成功'})
        else:
            return jsonify({'success': False, 'message': '数据保存失败'})
    except Exception as e:
        logger.error(f"保存手动数据失败: {e}")
        return jsonify({'success': False, 'message': str(e)})

@data_bp.route('/files')
def list_data_files():
    """列出 history 目录下的 CSV 文件"""
    files = []
    if os.path.exists(HISTORY_DIR):
        for f in os.listdir(HISTORY_DIR):
            if f.endswith('.csv'):
                filepath = os.path.join(HISTORY_DIR, f)
                stat = os.stat(filepath)
                files.append({
                    'name': f,
                    'size': stat.st_size,
                    'mtime': datetime.fromtimestamp(stat.st_mtime).strftime("%Y-%m-%d %H:%M:%S")
                })
    return jsonify(sorted(files, key=lambda x: x['mtime'], reverse=True))

# 为了兼容原前端，增加同轴度和跳动度的历史查询快捷接口
@data_bp.route('/history/coaxial')
def get_coaxial_history():
    """获取同轴度历史数据"""
    try:
        limit = request.args.get('limit', 100, type=int)
        data = data_saver.load_coaxial_data(limit)
        return jsonify(data)
    except Exception as e:
        logger.error(f"获取同轴度历史失败: {e}")
        return jsonify([])

@data_bp.route('/history/runout')
def get_runout_history():
    """获取跳动度历史数据"""
    try:
        limit = request.args.get('limit', 100, type=int)
        data = data_saver.load_runout_data(limit)
        return jsonify(data)
    except Exception as e:
        logger.error(f"获取跳动度历史失败: {e}")
        return jsonify([])
"""
配置接口：统一管理所有配置，使用 ConfigManager
"""
from flask import Blueprint, jsonify, request
import logging

from backend.config_manager import config_manager
from backend.device_manager import device_manager

config_bp = Blueprint('config', __name__)
logger = logging.getLogger('ConfigRoutes')

# ==================== 设备管理接口 ====================
@config_bp.route('/devices', methods=['GET'])
def get_devices():
    """获取所有可用设备"""
    try:
        devices = device_manager.get_devices()
        return jsonify({'success': True, 'data': devices})
    except Exception as e:
        logger.error(f"获取设备列表失败: {e}")
        return jsonify({'success': False, 'message': str(e)}), 500

@config_bp.route('/devices/<device_name>/channels', methods=['GET'])
def get_device_channels(device_name):
    """获取指定设备的通道"""
    try:
        channels = device_manager.get_device_channels(device_name)
        return jsonify({'success': True, 'data': channels})
    except Exception as e:
        logger.error(f"获取设备通道失败: {e}")
        return jsonify({'success': False, 'message': str(e)}), 500

@config_bp.route('/devices/<device_name>/test', methods=['POST'])
def test_device(device_name):
    """测试设备连接"""
    try:
        success, message = device_manager.test_device_connection(device_name)
        return jsonify({'success': success, 'message': message})
    except Exception as e:
        logger.error(f"测试设备失败: {e}")
        return jsonify({'success': False, 'message': str(e)}), 500

# ==================== 统一配置接口 ====================
@config_bp.route('/all', methods=['GET'])
def get_all_config():
    cfg = config_manager.get_config()
    # 转换 language 为字符串（前端使用）
    if 'language' in cfg:
        lang = cfg['language']
        if isinstance(lang, dict):
            cfg['language'] = lang.get('code', 'zh')
        # 已经是字符串则不变
    return jsonify({'success': True, 'data': cfg})

@config_bp.route('/all', methods=['POST'])
def save_all_config():
    data = request.json.get('data')
    if data:
        # 转换 language 为对象（后端存储格式）
        if 'language' in data:
            lang = data['language']
            if isinstance(lang, str):
                data['language'] = {'code': lang}
        config_manager.save_config(data)
        return jsonify({'success': True})
    return jsonify({'success': False, 'message': 'No data'}), 400

# ==================== 健康度配置 ====================
@config_bp.route('/health', methods=['GET'])
def get_health():
    """获取健康度配置"""
    cfg = config_manager.get_config()
    return jsonify({'success': True, 'data': cfg.get('health', {})})

@config_bp.route('/health/save', methods=['POST'])
def save_health():
    """保存健康度配置"""
    data = request.json
    config_manager.update_section('health', data)
    logger.info(f"健康度配置已保存: {data}")
    return jsonify({'success': True})

# ==================== 端口配置 ====================
@config_bp.route('/ports', methods=['GET'])
def get_ports():
    """获取端口配置"""
    cfg = config_manager.get_config()
    return jsonify({'success': True, 'data': cfg.get('port', {})})

@config_bp.route('/ports/save', methods=['POST'])
def save_ports():
    """保存端口配置"""
    data = request.json
    config_manager.update_section('port', data)
    # 暂时不自动重载传感器配置，避免影响正在运行的数据流
    # 只有用户需要时再手动重启服务
    logger.info(f"端口配置已保存: {data}")
    return jsonify({'success': True})

# ==================== 压力映射配置 ====================
@config_bp.route('/pressure', methods=['GET'])
def get_pressure():
    """获取压力映射配置"""
    cfg = config_manager.get_config()
    return jsonify({'success': True, 'data': cfg.get('pressure', {})})

@config_bp.route('/pressure', methods=['POST'])
def save_pressure():
    """保存压力映射配置"""
    data = request.json
    config_manager.update_section('pressure', data)
    return jsonify({'success': True})

@config_bp.route('/pressure/unit', methods=['POST'])
def save_pressure_unit():
    """仅保存压力单位"""
    unit = request.json.get('unit')
    if unit:
        config_manager.update_section('pressure', {'unit': unit})
        return jsonify({'success': True})
    return jsonify({'success': False}), 400

# ==================== 语言配置 ====================
@config_bp.route('/language', methods=['POST'])
def save_language():
    data = request.json
    if 'language' in data:
        lang_value = data['language']
        # 存储为字典格式
        config_manager.update_section('language', {'code': lang_value})
    else:
        config_manager.update_section('language', data)
    return jsonify({'success': True})

@config_bp.route('/language', methods=['GET'])
def get_language():
    cfg = config_manager.get_config()
    lang_cfg = cfg.get('language')
    if isinstance(lang_cfg, dict):
        lang_value = lang_cfg.get('code', 'zh')
    else:
        lang_value = lang_cfg if lang_cfg else 'zh'
    return jsonify({'success': True, 'data': {'language': lang_value}})

# ==================== 基本信息（从统一配置中读取）====================
@config_bp.route('/basic', methods=['GET'])
def get_basic_info():
    """获取当前基本信息"""
    cfg = config_manager.get_config()
    return jsonify({'success': True, 'data': cfg.get('basic'), 'history': []})

# ==================== 关键指标（从统一配置中读取）====================
@config_bp.route('/indicators', methods=['GET'])
def get_key_indicators():
    """获取当前关键指标"""
    cfg = config_manager.get_config()
    return jsonify({'success': True, 'data': cfg.get('indicators'), 'history': []})


@config_bp.route('/channel_mapping', methods=['POST'])
def save_channel_mapping():
    """保存通道映射配置"""
    try:
        mapping = request.json
        from backend.config_manager import config_manager
        config_manager.update_section('channel_mapping', mapping)
        # 暂时不自动重载传感器配置，避免影响正在运行的数据流
        # 只有用户需要时再手动重启服务
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@config_bp.route('/channel_mapping', methods=['GET'])
def get_channel_mapping():
    """获取当前通道映射"""
    from backend.config_manager import config_manager
    full = config_manager.get_config()
    return jsonify({'success': True, 'data': full.get('channel_mapping', {})})

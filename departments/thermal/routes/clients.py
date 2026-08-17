"""
客户端管理路由
- 客户端注册、心跳、状态查询
"""
from flask import Blueprint, request, jsonify
import logging

logger = logging.getLogger('ClientsRoute')

clients_bp = Blueprint('clients', __name__)

@clients_bp.route('/register', methods=['POST'])
def register_client():
    """注册或更新客户端"""
    try:
        from backend.database import db
        
        data = request.get_json()
        client_id = data.get('client_id')
        client_name = data.get('client_name')
        ip_address = request.remote_addr
        device_info = data.get('device_info')
        
        if not client_id:
            return jsonify({'success': False, 'error': 'client_id is required'}), 400
        
        success = db.register_client(client_id, client_name, ip_address, device_info)
        
        if success:
            return jsonify({'success': True, 'message': 'Client registered successfully'})
        else:
            return jsonify({'success': False, 'error': 'Failed to register client'}), 500
    except Exception as e:
        logger.error(f"注册客户端失败: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

@clients_bp.route('/heartbeat', methods=['POST'])
def client_heartbeat():
    """客户端心跳"""
    try:
        from backend.database import db
        
        data = request.get_json()
        client_id = data.get('client_id')
        
        if not client_id:
            return jsonify({'success': False, 'error': 'client_id is required'}), 400
        
        success = db.update_client_heartbeat(client_id)
        
        if success:
            return jsonify({'success': True, 'message': 'Heartbeat updated'})
        else:
            return jsonify({'success': False, 'error': 'Failed to update heartbeat'}), 500
    except Exception as e:
        logger.error(f"更新心跳失败: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

@clients_bp.route('/list', methods=['GET'])
def get_clients_list():
    """获取所有客户端列表"""
    try:
        from backend.database import db
        clients = db.get_clients()
        return jsonify({'success': True, 'clients': clients})
    except Exception as e:
        logger.error(f"获取客户端列表失败: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

@clients_bp.route('/<client_id>', methods=['GET'])
def get_client_info(client_id):
    """获取单个客户端信息"""
    try:
        from backend.database import db
        client = db.get_client(client_id)
        if client:
            return jsonify({'success': True, 'client': client})
        else:
            return jsonify({'success': False, 'error': 'Client not found'}), 404
    except Exception as e:
        logger.error(f"获取客户端信息失败: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

@clients_bp.route('/<client_id>/offline', methods=['POST'])
def set_client_offline(client_id):
    """设置客户端离线"""
    try:
        from backend.database import db
        success = db.set_client_offline(client_id)
        if success:
            return jsonify({'success': True, 'message': 'Client set to offline'})
        else:
            return jsonify({'success': False, 'error': 'Failed to set client offline'}), 500
    except Exception as e:
        logger.error(f"设置客户端离线失败: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

"""
WebSocket 事件处理器
功能：
- connect：客户端连接
- disconnect：客户端断开
- request_data：客户端请求实时数据
"""
import logging
from flask_socketio import emit
from flask import request

logger = logging.getLogger('SocketHandlers')

def register_socket_handlers(socketio):
    """注册所有 WebSocket 事件处理器"""

    @socketio.on('connect')
    def handle_connect():
        logger.info(f"客户端连接: {request.sid}")
        # 新客户端连接时，推送当前状态
        from backend.collector import DataCollector
        collector = DataCollector()
        socketio.emit('status_sync', {
            'is_collecting': collector.is_collecting,
            'avg': collector.latest_avg,
            'health': collector.latest_health
        }, room=request.sid)

    @socketio.on('disconnect')
    def handle_disconnect():
        logger.info(f"客户端断开: {request.sid}")

    @socketio.on('request_data')
    def handle_request_data(data=None):
        """客户端请求实时数据，立即推送当前传感器状态"""
        from backend.collector import DataCollector
        collector = DataCollector()
        emit('data_update', {
            'avg': collector.latest_avg,
            'health': collector.latest_health,
            'is_collecting': collector.is_collecting
        })

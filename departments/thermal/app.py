"""
热工科室产品（滚筒检测系统）独立启动入口
=========================================
本文件是热工科室产品的独立服务入口，在本科室目录内启动：

    cd departments/thermal
    python app.py

端口：5011（门户 5010 通过 portal/config/portal_config.json 中的地址跳转至此）
"""
import json
import logging
import mimetypes
import os
import sys
from pathlib import Path

# Fix mimetypes for WebAssembly to prevent "Aborted" errors in draco decoder
mimetypes.add_type('application/wasm', '.wasm')

if getattr(sys, 'frozen', False):
    # PyInstaller 打包后：代码与资源统一在 bundle 内
    BASE_DIR = Path(getattr(sys, '_MEIPASS', Path(__file__).resolve().parent))
else:
    BASE_DIR = Path(__file__).resolve().parent

# 热工产品代码即在本目录内（backend/ routes/ artdaq/ ...），无需额外挂载路径
sys.path.insert(0, str(BASE_DIR))

from flask import Flask, jsonify, render_template, make_response, send_from_directory
from flask_socketio import SocketIO
from routes.control import control_bp
from routes.config import config_bp
from routes.data import data_bp
from routes.monitor import monitor_bp
from routes.data_records import data_records_bp
from routes.clients import clients_bp
from routes.download import download_bp
from routes.modbus import modbus_bp
from socket_handlers.main import register_socket_handlers
from background.reader import set_socketio as set_reader_socketio
from background.file_monitor import set_socketio as set_monitor_socketio, set_health_params
from backend.config_manager import config_manager
from backend.collector import DataCollector
from backend.client_manager import client_manager

app = Flask(
    __name__,
    template_folder=str(BASE_DIR / 'templates'),
    static_folder=str(BASE_DIR / 'static'),
    static_url_path='/static',
)
app.config['SECRET_KEY'] = 'sensor-monitor-secret'
socketio = SocketIO(app, cors_allowed_origins="*", async_mode='threading')
VERSION_INFO_PATH = BASE_DIR / 'config' / 'version.json'

# 配置日志
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger('ThermalApp')

# 存储客户端状态
client_states = {}

# 注入 socketio 到后台模块
set_reader_socketio(socketio)
set_monitor_socketio(socketio)

# 注入 socketio 到 DataCollector（硬件采集控制器）
collector = DataCollector()
collector.set_socketio(socketio)

# 注入 socketio 到配置管理器（用于配置同步）
config_manager.set_socketio(socketio)

# 注入 socketio 到客户端管理器
client_manager.set_socketio(socketio)

# 注册蓝图（热工产品自身业务）
app.register_blueprint(control_bp, url_prefix='/api/control')
app.register_blueprint(config_bp, url_prefix='/api/config')
app.register_blueprint(data_bp, url_prefix='/api/data')
app.register_blueprint(monitor_bp, url_prefix='/api/monitor')
app.register_blueprint(data_records_bp, url_prefix='/api/data_records')
app.register_blueprint(clients_bp, url_prefix='/api/clients')
app.register_blueprint(download_bp, url_prefix='/api/download')
app.register_blueprint(modbus_bp)

register_socket_handlers(socketio)

# ==================== 客户端-服务端 WebSocket 事件 ====================

@socketio.on('client_state_update')
def handle_client_state_update(state):
    """接收客户端状态更新"""
    try:
        client_id = state.get('client_id')
        if client_id:
            client_states[client_id] = state
            # 广播给所有服务端管理界面
            socketio.emit('server_client_update', {
                'client_id': client_id,
                'state': state
            })
            logger.debug(f"收到客户端状态更新: {client_id}")
    except Exception as e:
        logger.error(f"处理客户端状态更新失败: {e}")

@socketio.on('client_heartbeat')
def handle_client_heartbeat(data):
    """接收客户端心跳"""
    try:
        client_id = data.get('client_id')
        if client_id:
            from backend.database import db
            db.update_client_heartbeat(client_id)
            logger.debug(f"收到客户端心跳: {client_id}")
    except Exception as e:
        logger.error(f"处理客户端心跳失败: {e}")

@socketio.on('server_request_client_list')
def handle_server_request_client_list():
    """服务端请求客户端列表"""
    try:
        return {
            'success': True,
            'clients': list(client_states.values())
        }
    except Exception as e:
        logger.error(f"获取客户端列表失败: {e}")
        return {'success': False, 'error': str(e)}

@socketio.on('server_request_client_state')
def handle_server_request_client_state(data):
    """服务端请求特定客户端状态"""
    try:
        client_id = data.get('client_id')
        if client_id and client_id in client_states:
            return {
                'success': True,
                'state': client_states[client_id]
            }
        return {'success': False, 'error': 'Client not found'}
    except Exception as e:
        logger.error(f"获取客户端状态失败: {e}")
        return {'success': False, 'error': str(e)}

# 应用启动时检查是否为客户端模式
try:
    client_manager.register_with_database()
    if client_manager.is_client_mode:
        client_manager.connect_to_server()
    else:
        # 服务端也将自己的状态加入到 client_states，方便测试
        client_states[client_manager.client_id] = client_manager.get_client_state()
        logger.info(f"服务端自身状态已加入: {client_manager.client_id}")
except Exception as e:
    logger.error(f"初始化客户端模式失败: {e}")

# 加载健康度参数到文件监控模块
try:
    health_params = config_manager.get_config().get('health', {})
    set_health_params(health_params)
except Exception as e:
    print(f"加载健康度参数失败: {e}")

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/admin')
def admin():
    """服务端管理页面"""
    return render_template('admin.html')

@app.route('/client-view')
def client_view():
    """客户端查看页面（只读）"""
    return render_template('client_view.html')

@app.route('/3d-view')
def view_3d():
    """3D 模型可视化大屏"""
    return render_template('3d_view.html')

@app.route('/draco/<path:filename>')
def serve_draco(filename):
    """强制正确提供 Draco 解码器的 MIME 类型"""
    draco_dir = os.path.join(BASE_DIR, 'static', 'js', 'draco')
    response = make_response(send_from_directory(draco_dir, filename))
    if filename.endswith('.wasm'):
        response.mimetype = 'application/wasm'
    elif filename.endswith('.js'):
        response.mimetype = 'application/javascript'
    response.headers['Access-Control-Allow-Origin'] = '*'
    return response

def load_version_info():
    with VERSION_INFO_PATH.open('r', encoding='utf-8') as version_file:
        return json.load(version_file)


@app.route('/api/version/info')
def version_info():
    return jsonify(load_version_info())


def run_server(host='127.0.0.1', port=5011):
    logging.info("启动热工科室产品（滚筒检测系统）...")
    socketio.run(app, host=host, port=port, allow_unsafe_werkzeug=True)

if __name__ == '__main__':
    run_server(host='0.0.0.0', port=5011)

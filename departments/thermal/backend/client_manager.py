"""
客户端管理模块
- 生成和管理唯一客户端ID
- 客户端状态跟踪
- 与服务端通信
"""
import uuid
import json
import os
import threading
import logging
import time
import socket
from datetime import datetime

logger = logging.getLogger('ClientManager')

class ClientManager:
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
        self.client_id = None
        self.client_name = None
        self.server_url = None
        self.is_client_mode = False
        self._socketio = None
        self._connected = False
        self._last_sync_time = None
        self._sync_thread = None
        self._sync_running = False
        
        # 客户端状态数据
        self._client_state = {
            'client_id': None,
            'client_name': None,
            'is_collecting': False,
            'sensor_status': {},
            'health_data': None,
            'config': None,
            'last_update': None
        }
        
        self._load_client_config()
        self._auto_detect_mode()
        logger.info("客户端管理器初始化完成")
    
    def _load_client_config(self):
        """加载客户端配置"""
        try:
            base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
            config_path = os.path.join(base_dir, 'config', 'client_config.json')
            
            if os.path.exists(config_path):
                with open(config_path, 'r', encoding='utf-8') as f:
                    config = json.load(f)
                    self.client_id = config.get('client_id')
                    self.client_name = config.get('client_name', '客户端')
                    self.server_url = config.get('server_url')
                    self.is_client_mode = config.get('is_client_mode', False)
                logger.info(f"加载客户端配置: ID={self.client_id}, 名称={self.client_name}")
            else:
                # 创建默认配置
                self._create_default_config()
        except Exception as e:
            logger.error(f"加载客户端配置失败: {e}")
            self._create_default_config()
    
    def _create_default_config(self):
        """创建默认客户端配置"""
        try:
            self.client_id = str(uuid.uuid4())
            self.client_name = '客户端-' + self.client_id[:8]
            self.is_client_mode = False  # 默认不是客户端模式
            
            self._save_client_config()
            logger.info(f"创建新客户端配置: ID={self.client_id}, 名称={self.client_name}")
        except Exception as e:
            logger.error(f"创建默认配置失败: {e}")
    
    def _save_client_config(self):
        """保存客户端配置"""
        try:
            base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
            config_dir = os.path.join(base_dir, 'config')
            os.makedirs(config_dir, exist_ok=True)
            config_path = os.path.join(config_dir, 'client_config.json')
            
            config = {
                'client_id': self.client_id,
                'client_name': self.client_name,
                'server_url': self.server_url,
                'is_client_mode': self.is_client_mode,
                'created_at': datetime.now().strftime('%Y-%m-%d %H:%M:%S')
            }
            
            with open(config_path, 'w', encoding='utf-8') as f:
                json.dump(config, f, ensure_ascii=False, indent=2)
            
            logger.info(f"保存客户端配置: {config_path}")
        except Exception as e:
            logger.error(f"保存客户端配置失败: {e}")
    
    def set_client_info(self, client_name=None, server_url=None):
        """设置客户端信息"""
        if client_name:
            self.client_name = client_name
        if server_url:
            self.server_url = server_url
        self._save_client_config()
    
    def set_client_mode(self, is_client):
        """设置是否为客户端模式"""
        self.is_client_mode = is_client
        self._save_client_config()
        logger.info(f"客户端模式: {'启用' if is_client else '禁用'}")
    
    def update_client_state(self, state_updates):
        """更新客户端状态"""
        self._client_state.update(state_updates)
        self._client_state['client_id'] = self.client_id
        self._client_state['client_name'] = self.client_name
        self._client_state['last_update'] = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        
        # 如果是客户端模式且已连接，同步到服务端
        if self.is_client_mode and self._connected and self._socketio:
            try:
                self._socketio.emit('client_state_update', self._client_state)
            except Exception as e:
                logger.warning(f"同步状态到服务端失败: {e}")
    
    def get_client_state(self):
        """获取当前客户端状态"""
        return self._client_state.copy()
    
    def set_socketio(self, socketio):
        """设置Socket.IO实例"""
        self._socketio = socketio
    
    def connect_to_server(self):
        """连接到服务端"""
        if not self.is_client_mode:
            logger.info("非客户端模式，跳过连接服务端")
            return False
        
        logger.info(f"客户端模式已启用: {self.client_name} ({self.client_id})")
        return True
    
    def disconnect_from_server(self):
        """从服务端断开"""
        self._connected = False
        self._stop_sync_thread()
    
    def _start_sync_thread(self):
        """启动状态同步线程"""
        if self._sync_thread and self._sync_thread.is_alive():
            return
        
        self._sync_running = True
        self._sync_thread = threading.Thread(target=self._sync_loop, daemon=True)
        self._sync_thread.start()
        logger.info("状态同步线程已启动")
    
    def _stop_sync_thread(self):
        """停止状态同步线程"""
        self._sync_running = False
        if self._sync_thread and self._sync_thread.is_alive():
            self._sync_thread.join(timeout=2)
    
    def _sync_loop(self):
        """状态同步循环"""
        while self._sync_running:
            try:
                if self._connected and self._socketio:
                    self._socketio.emit('client_heartbeat', {
                        'client_id': self.client_id,
                        'timestamp': datetime.now().strftime('%Y-%m-%d %H:%M:%S')
                    })
            except Exception as e:
                logger.warning(f"心跳发送失败: {e}")
            
            time.sleep(10)  # 每10秒发送一次心跳
    
    def _auto_detect_mode(self):
        """自动检测是否为客户端模式"""
        try:
            # 获取本机主机名和IP
            hostname = socket.gethostname()
            local_ip = socket.gethostbyname(hostname)
            
            logger.info(f"自动检测模式 - 主机名: {hostname}, IP: {local_ip}")
            
            # 如果没有配置文件中的显式设置，根据环境判断
            # 服务端IP通常是 10.30.10.64
            server_ips = ['10.30.10.64', '127.0.0.1', 'localhost']
            
            # 默认：如果不是服务端IP，则为客户端模式
            if local_ip not in server_ips and hostname != 'server':
                if not self.is_client_mode:
                    self.is_client_mode = True
                    self.server_url = 'http://10.30.10.64:5001'
                    logger.info(f"自动启用客户端模式，服务端: {self.server_url}")
                    self._save_client_config()
            else:
                logger.info("检测为服务端模式")
                
        except Exception as e:
            logger.warning(f"自动检测模式失败: {e}")
    
    def get_local_ip(self):
        """获取本机IP地址"""
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            s.connect(('8.8.8.8', 80))
            ip = s.getsockname()[0]
            s.close()
            return ip
        except:
            try:
                return socket.gethostbyname(socket.gethostname())
            except:
                return '127.0.0.1'
    
    def register_with_database(self):
        """在数据库中注册客户端"""
        try:
            from backend.database import db
            success = db.register_client(
                client_id=self.client_id,
                client_name=self.client_name,
                ip_address=self.get_local_ip(),
                device_info={
                    'client_mode': self.is_client_mode,
                    'hostname': socket.gethostname()
                }
            )
            if success:
                logger.info(f"客户端已在数据库中注册: {self.client_id}")
        except Exception as e:
            logger.error(f"注册客户端到数据库失败: {e}")

# 创建全局单例
client_manager = ClientManager()

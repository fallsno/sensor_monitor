"""
配置管理器
统一管理所有配置，支持数据库存储（替代旧的 JSON 文件）
支持按科室（搅拌/热工/筛分）隔离的独立配置
"""
import json
import os
import threading
import logging

from backend.database import db

logger = logging.getLogger('ConfigManager')

# ==================== 总体项目：科室定义 ====================
# 三个科室的元信息与默认配置，科室配置独立存储于 SQLite
DEPARTMENTS = [
    {
        "id": "mixing",
        "name": "搅拌",
        "fullName": "搅拌科室",
        "icon": "fa-blender",
        "description": "搅拌设备智能化工作界面",
        "route": "/dept/mixing",
        "color": "#3b82f6",
    },
    {
        "id": "thermal",
        "name": "热工",
        "fullName": "热工科室",
        "icon": "fa-fire-flame-curved",
        "description": "滚筒检测系统（热工检测系统）",
        "route": "/",
        "color": "#f97316",
    },
    {
        "id": "screening",
        "name": "筛分",
        "fullName": "筛分科室",
        "icon": "fa-filter",
        "description": "筛分设备智能化工作界面",
        "route": "/dept/screening",
        "color": "#10b981",
    },
]

def get_default_dept_config(dept_id):
    """返回指定科室的默认配置结构"""
    dept = next((d for d in DEPARTMENTS if d["id"] == dept_id), None)
    return {
        "version": "1.0",
        "basic": {
            "deptId": dept_id,
            "deptName": dept["fullName"] if dept else dept_id,
            "description": dept["description"] if dept else "",
        },
        "modules": {
            "enabled": ["overview", "data", "devices", "settings"],
            "disabled": [],
        },
        "custom": {},
    }

class ConfigManager:
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
        self._socketio = None
        
        # 尝试从数据库加载，失败则使用默认
        self._config = self._load_from_db()
        if not self._config:
            self._config = self._get_default_config()
            self._save_to_db()
        
        # 从旧的 JSON 文件迁移
        self._migrate_from_json()
        
        logger.info("配置管理器初始化完成")
    
    def set_socketio(self, socketio):
        """设置 socketio 用于广播配置变更"""
        self._socketio = socketio
    
    def _load_from_db(self):
        """从数据库加载配置"""
        try:
            config = db.get_config('full_config')
            if config:
                logger.info("从数据库加载配置成功")
                return config
            return None
        except Exception as e:
            logger.error(f"从数据库加载配置失败: {e}")
            return None
    
    def _save_to_db(self):
        """保存配置到数据库"""
        try:
            db.set_config('full_config', self._config)
            
            # 广播配置变更
            if self._socketio:
                self._socketio.emit('config_update', {'config': self._config})
                logger.info("配置变更已广播")
            
            return True
        except Exception as e:
            logger.error(f"保存配置到数据库失败: {e}")
            return False
    
    def _migrate_from_json(self):
        """从旧的 JSON 文件迁移配置"""
        try:
            base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
            json_path = os.path.join(base_dir, 'config', 'config.json')
            
            if os.path.exists(json_path):
                with open(json_path, 'r', encoding='utf-8') as f:
                    json_config = json.load(f)
                
                # 合并到当前配置
                self._config.update(json_config)
                self._save_to_db()
                logger.info("从 JSON 文件迁移配置成功")
                
                # 备份旧文件
                backup_path = json_path + '.backup'
                os.rename(json_path, backup_path)
                logger.info(f"旧配置文件已备份到: {backup_path}")
        except Exception as e:
            logger.warning(f"从 JSON 迁移配置失败（可能文件不存在）: {e}")
    
    def _get_default_config(self):
        return {
            "version": "1.0",
            "basic": {"customerName": "XX水泥", "machineNo": "DR-2602", "orderNo": "PO-001", "modelNo": "V3.5.3"},
            "indicators": {"environment_temp": 25.6, "contact_area": 92.5, "wheel_gap": 2.35, "vibration_value": 0.18, "test_time": 127.5},
            "pressure": {"originalMax": 5.0, "displayMax": 300, "unit": "MPa"},
            "health": {"upperPreloadPressure": 2.0, "upperCriticalPressure": 3.5, "lowerPreloadPressure": 2.0, "lowerCriticalPressure": 3.5, "cycleSeconds": 60, "initialDisplacement": 0.0},
            "port": {
                "device": "Dev1",
                "counter1": "ctr0",
                "counter2": "ctr1",
                "ai_sample_rate": 1000,
                "freq_min": 0.1,
                "freq_max": 1000.0,
                "pulses_per_rev": 1,
                "sample_rate": 1000,
                "ctr_timeout": 5.0,
                "ctr_units": "HZ",
                "ctr_edge": "RISING",
                "ctr_meas_time": 1.0
            },
            "channel_mapping": {
                    "ai": [
                        {"index": 2, "channel": "ai2", "sensor": "upper_pressure", "scale": 1.0, "offset": 0, "min_val": -10.0, "max_val": 10.0},
                        {"index": 3, "channel": "ai3", "sensor": "lower_pressure", "scale": 1.0, "offset": 0, "min_val": -10.0, "max_val": 10.0},
                        {"index": 4, "channel": "ai4", "sensor": "eddy_current", "scale": 1.0, "offset": 0, "min_val": -10.0, "max_val": 10.0},
                        {"index": 5, "channel": "ai5", "sensor": "motor1", "scale": 1.0, "offset": 0, "min_val": -10.0, "max_val": 10.0},
                        {"index": 6, "channel": "ai6", "sensor": "motor2", "scale": 1.0, "offset": 0, "min_val": -10.0, "max_val": 10.0},
                        {"index": 7, "channel": "ai7", "sensor": "motor3", "scale": 1.0, "offset": 0, "min_val": -10.0, "max_val": 10.0},
                        {"index": 8, "channel": "ai8", "sensor": "motor4", "scale": 1.0, "offset": 0, "min_val": -10.0, "max_val": 10.0}
                    ],
                    "counter": [
                        {
                            "channel": "ctr0",
                            "sensor": "left_rpm",
                            "pulses_per_rev": 1,
                            "scale": 60,
                            "freq_min": 0.01,
                            "freq_max": 1000.0,
                            "timeout": 5.0,
                            "units": "HZ",
                            "edge": "RISING",
                            "meas_time": 0.1
                        },
                        {
                            "channel": "ctr1",
                            "sensor": "right_rpm",
                            "pulses_per_rev": 1,
                            "scale": 60,
                            "freq_min": 0.01,
                            "freq_max": 1000.0,
                            "timeout": 5.0,
                            "units": "HZ",
                            "edge": "RISING",
                            "meas_time": 0.1
                        }
                    ]
            },
            "runoutHistory": [],
            "coaxialHistory": [],
            "language": {"code": "zh"}
        }
    
    def get_config(self):
        return self._config.copy()
    
    def save_config(self, new_config):
        self._config = new_config
        return self._save_to_db()
    
    def update_section(self, section, data):
        if section in self._config:
            current = self._config[section]
            if isinstance(current, dict):
                current.update(data)
            else:
                self._config[section] = data
            self._save_to_db()
            return True
        return False

    # ==================== 总体项目：科室配置 ====================

    def get_departments(self):
        """返回科室元信息列表（供门户页/接口使用）"""
        return [dict(d) for d in DEPARTMENTS]

    def get_dept_config(self, dept_id):
        """获取指定科室的独立配置；不存在时返回科室默认配置"""
        if not any(d["id"] == dept_id for d in DEPARTMENTS):
            return None
        key = f'dept_config_{dept_id}'
        try:
            config = db.get_config(key)
            if config:
                return config
        except Exception as e:
            logger.error(f"读取科室配置 {dept_id} 失败: {e}")
        default = get_default_dept_config(dept_id)
        # 首次访问时落库，保证配置可写
        try:
            db.set_config(key, default)
        except Exception as e:
            logger.error(f"初始化科室配置 {dept_id} 失败: {e}")
        return default

    def save_dept_config(self, dept_id, new_config):
        """保存指定科室的独立配置，并广播变更"""
        if not any(d["id"] == dept_id for d in DEPARTMENTS):
            return False
        key = f'dept_config_{dept_id}'
        try:
            ok = db.set_config(key, new_config)
            if ok and self._socketio:
                self._socketio.emit('dept_config_update', {
                    'dept': dept_id,
                    'config': new_config,
                })
                logger.info(f"科室配置已广播: {dept_id}")
            return ok
        except Exception as e:
            logger.error(f"保存科室配置 {dept_id} 失败: {e}")
            return False

    def update_dept_section(self, dept_id, section, data):
        """更新科室配置的某个区块"""
        config = self.get_dept_config(dept_id)
        if config is None:
            return False
        if section in config and isinstance(config[section], dict):
            config[section].update(data)
        else:
            config[section] = data
        return self.save_dept_config(dept_id, config)

# 创建全局单例
config_manager = ConfigManager()

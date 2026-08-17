"""
数据保存模块 - 处理CSV文件保存和数据管理
支持动态列头（根据传感器映射）
"""
import os
import csv
import json
from datetime import datetime, timedelta
import logging
from typing import Dict, List, Any
import threading

logger = logging.getLogger('DataSaver')

class DataSaver:
    """数据保存器 - 处理所有数据保存和读取"""
    
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
        # 数据目录相对于项目根目录
        base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # 项目根目录
        self.data_dir = os.path.join(base_dir, 'data')
        self.history_dir = os.path.join(self.data_dir, 'history')
        self.manual_data_dir = os.path.join(self.data_dir, 'manual')
        self.config_dir = os.path.join(self.data_dir, 'config')
        
        for dir_path in [self.data_dir, self.history_dir, self.manual_data_dir, self.config_dir]:
            os.makedirs(dir_path, exist_ok=True)
        
        self.current_file = None
        self.current_filepath = None
        self.is_saving = False
        
        # 历史数据缓存（暂时保留，但不再使用）
        self.history_cache = {}
        self.max_cache_size = 10000
        
        # 手动输入数据文件路径
        self.basic_info_file = os.path.join(self.config_dir, 'basic_info.json')
        self.key_indicators_file = os.path.join(self.config_dir, 'key_indicators.json')
        self.coaxial_data_file = os.path.join(self.config_dir, 'coaxial_data.json')
        self.runout_data_file = os.path.join(self.config_dir, 'runout_data.json')
        
        # 动态列头（在 start_saving 时从 sensor_reader 获取）
        self.active_sensors = []
        
        logger.info("数据保存器初始化完成")
    
    # ==================== 基本信息保存 ====================
    
    def save_basic_info(self, data: Dict):
        """保存基本信息"""
        try:
            existing_data = self.load_basic_info()
            if not existing_data:
                existing_data = []
            
            data['timestamp'] = datetime.now().isoformat()
            existing_data.append(data)
            
            if len(existing_data) > 100:
                existing_data = existing_data[-100:]
            
            with open(self.basic_info_file, 'w', encoding='utf-8') as f:
                json.dump(existing_data, f, ensure_ascii=False, indent=2)
            
            current_config = {
                'customerName': data.get('customerName', ''),
                'machineNo': data.get('machineNo', ''),
                'orderNo': data.get('orderNo', ''),
                'modelNo': data.get('modelNo', ''),
                'last_update': data['timestamp']
            }
            current_file = os.path.join(self.config_dir, 'current_basic.json')
            with open(current_file, 'w', encoding='utf-8') as f:
                json.dump(current_config, f, ensure_ascii=False, indent=2)
            
            logger.info(f"基本信息已保存: {data.get('customerName')}")
            return True
        except Exception as e:
            logger.error(f"保存基本信息失败: {e}")
            return False
    
    def load_basic_info(self, limit=10):
        """加载基本信息历史"""
        try:
            if os.path.exists(self.basic_info_file):
                with open(self.basic_info_file, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    return data[-limit:] if data else []
            return []
        except Exception as e:
            logger.error(f"加载基本信息失败: {e}")
            return []
    
    def get_current_basic_info(self):
        """获取当前基本信息（最新的一条）"""
        try:
            current_file = os.path.join(self.config_dir, 'current_basic.json')
            if os.path.exists(current_file):
                with open(current_file, 'r', encoding='utf-8') as f:
                    return json.load(f)
            return None
        except Exception as e:
            logger.error(f"加载当前基本信息失败: {e}")
            return None
    
    # ==================== 关键指标保存 ====================
    
    def save_key_indicators(self, data: Dict):
        """保存关键指标"""
        try:
            existing_data = self.load_key_indicators()
            if not existing_data:
                existing_data = []
            
            data['timestamp'] = datetime.now().isoformat()
            existing_data.append(data)
            
            if len(existing_data) > 100:
                existing_data = existing_data[-100:]
            
            with open(self.key_indicators_file, 'w', encoding='utf-8') as f:
                json.dump(existing_data, f, ensure_ascii=False, indent=2)
            
            current_config = {
                'environment_temp': data.get('environment_temp', 0),
                'contact_area': data.get('contact_area', 0),
                'wheel_gap': data.get('wheel_gap', 0),
                'vibration_value': data.get('vibration_value', 0),
                'test_time': data.get('test_time', 0),
                'last_update': data['timestamp']
            }
            current_file = os.path.join(self.config_dir, 'current_indicators.json')
            with open(current_file, 'w', encoding='utf-8') as f:
                json.dump(current_config, f, ensure_ascii=False, indent=2)
            
            logger.info(f"关键指标已保存")
            return True
        except Exception as e:
            logger.error(f"保存关键指标失败: {e}")
            return False
    
    def load_key_indicators(self, limit=10):
        """加载关键指标历史"""
        try:
            if os.path.exists(self.key_indicators_file):
                with open(self.key_indicators_file, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    return data[-limit:] if data else []
            return []
        except Exception as e:
            logger.error(f"加载关键指标失败: {e}")
            return []
    
    def get_current_key_indicators(self):
        """获取当前关键指标（最新的一条）"""
        try:
            current_file = os.path.join(self.config_dir, 'current_indicators.json')
            if os.path.exists(current_file):
                with open(current_file, 'r', encoding='utf-8') as f:
                    return json.load(f)
            return None
        except Exception as e:
            logger.error(f"加载当前关键指标失败: {e}")
            return None
    
    # ==================== 同轴度数据保存 ====================
    
    def save_coaxial_data(self, data: Dict):
        """保存同轴度数据"""
        try:
            existing_data = self.load_coaxial_data(1000)
            if not existing_data:
                existing_data = []
            
            data['timestamp'] = datetime.now().isoformat()
            existing_data.append(data)
            
            if len(existing_data) > 1000:
                existing_data = existing_data[-1000:]
            
            with open(self.coaxial_data_file, 'w', encoding='utf-8') as f:
                json.dump(existing_data, f, ensure_ascii=False, indent=2)
            
            logger.info(f"同轴度数据已保存")
            return True
        except Exception as e:
            logger.error(f"保存同轴度数据失败: {e}")
            return False
    
    def load_coaxial_data(self, limit=100):
        """加载同轴度历史数据"""
        try:
            if os.path.exists(self.coaxial_data_file):
                with open(self.coaxial_data_file, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    return data[-limit:] if data else []
            return []
        except Exception as e:
            logger.error(f"加载同轴度数据失败: {e}")
            return []
    
    # ==================== 跳动度数据保存 ====================
    
    def save_runout_data(self, data: Dict):
        """保存跳动度数据"""
        try:
            existing_data = self.load_runout_data(1000)
            if not existing_data:
                existing_data = []
            
            data['timestamp'] = datetime.now().isoformat()
            existing_data.append(data)
            
            if len(existing_data) > 1000:
                existing_data = existing_data[-1000:]
            
            with open(self.runout_data_file, 'w', encoding='utf-8') as f:
                json.dump(existing_data, f, ensure_ascii=False, indent=2)
            
            logger.info(f"跳动度数据已保存")
            return True
        except Exception as e:
            logger.error(f"保存跳动度数据失败: {e}")
            return False
    
    def load_runout_data(self, limit=100):
        """加载跳动度历史数据"""
        try:
            if os.path.exists(self.runout_data_file):
                with open(self.runout_data_file, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    return data[-limit:] if data else []
            return []
        except Exception as e:
            logger.error(f"加载跳动度数据失败: {e}")
            return []
    
    # ==================== 通用手动数据保存 ====================
    
    def save_manual_data(self, data: Dict):
        """保存手动输入数据（通用方法）"""
        try:
            data_type = data.get('type', 'unknown')
            
            if data_type == 'basic_info':
                return self.save_basic_info(data)
            elif data_type == 'key_indicators':
                return self.save_key_indicators(data)
            elif data_type == 'coaxial':
                return self.save_coaxial_data(data)
            elif data_type == 'runout':
                return self.save_runout_data(data)
            else:
                timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
                filename = f"manual_data_{timestamp}.json"
                filepath = os.path.join(self.manual_data_dir, filename)
                
                with open(filepath, 'w', encoding='utf-8') as f:
                    json.dump(data, f, ensure_ascii=False, indent=2)
                
                logger.info(f"手动数据已保存: {filename}")
                return filepath
        except Exception as e:
            logger.error(f"保存手动数据失败: {e}")
            return None
    
    # ==================== 动态CSV保存功能（与传感器读取集成）====================
    
    def start_saving(self, prefix="sensor_data"):
        """开始保存数据到 CSV，使用动态列头"""
        if self.is_saving:
            return False
        
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"{prefix}_{timestamp}.csv"
        self.current_filepath = os.path.join(self.history_dir, filename)
        
        self.current_file = open(self.current_filepath, 'w', newline='', encoding='utf-8')
        self.writer = csv.writer(self.current_file)
        
        # 从 sensor_reader 获取动态列顺序
        try:
            from backend.sensor_reader import sensor_reader
            self.active_sensors = sensor_reader.column_order
        except ImportError:
            # 如果导入失败（如测试环境），使用默认列表
            self.active_sensors = ['upper_pressure', 'lower_pressure', 'eddy_current', 
                                   'motor1', 'motor2', 'motor3', 'motor4', 
                                   'left_rpm', 'right_rpm']
            logger.warning("无法从 sensor_reader 获取列顺序，使用默认列表")
        
        headers = ['timestamp'] + self.active_sensors
        self.writer.writerow(headers)
        
        self.is_saving = True
        logger.info(f"开始保存数据到: {self.current_filepath}")
        return True
    
    def save_data_point(self, sensor_data: Dict = None):
        """保存单个数据点（根据当前传感器状态）"""
        if not self.is_saving or not self.current_file:
            return False
        
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S.%f")[:-3]
        
        # 如果没有传入 sensor_data，则从 sensor_reader 获取
        if sensor_data is None:
            try:
                from backend.sensor_reader import sensor_reader
                sensor_data = sensor_reader.sensor_status
            except ImportError:
                logger.error("无法获取传感器数据")
                return False
        
        row = [timestamp]
        for sensor in self.active_sensors:
            value = sensor_data.get(sensor, {}).get('value', 0)
            row.append(value)
        
        self.writer.writerow(row)
        self.current_file.flush()
        
        # 可选：更新缓存（但缓存已不再使用，可注释）
        # self._update_cache(row)
        
        return True
    
    def _update_cache(self, row):
        """更新历史数据缓存（保留，但不再调用）"""
        # 此方法已弃用，保留以防其他代码依赖
        pass
    
    def stop_saving(self):
        """停止保存数据"""
        if self.current_file:
            self.current_file.close()
            self.current_file = None
            self.current_filepath = None
        
        self.is_saving = False
        logger.info("停止数据保存")
    
    # ==================== 历史数据查询（兼容旧接口）====================
    
    def get_historical_data(self, data_type: str, start_time: str = None, end_time: str = None, limit: int = 1000):
        """获取历史数据（从CSV文件读取）"""
        # 由于动态列名，此方法可能需要调整，但前端可能不使用，保留简单实现
        data = []
        files = sorted(os.listdir(self.history_dir), reverse=True)
        
        for file in files[:10]:
            if not file.endswith('.csv'):
                continue
            
            filepath = os.path.join(self.history_dir, file)
            try:
                with open(filepath, 'r', newline='', encoding='utf-8') as handle:
                    reader = csv.DictReader(handle)
                    for row in reader:
                        if data_type not in row or not row.get('timestamp'):
                            continue
                        try:
                            value = float(row[data_type])
                        except (TypeError, ValueError):
                            continue
                        data.append({
                            'timestamp': row['timestamp'],
                            'value': value
                        })
                        if len(data) >= limit:
                            break
            except Exception as e:
                logger.error(f"读取文件失败 {file}: {e}")
            
            if len(data) >= limit:
                break
        
        return data
    
    def get_recent_stats(self, data_type: str, minutes: int = 5):
        """获取最近几分钟的统计数据"""
        data = self.get_historical_data(data_type, limit=1000)
        if not data:
            return {'min': 0, 'max': 0, 'avg': 0, 'current': 0}
        
        values = [item['value'] for item in data[-100:]]
        return {
            'min': min(values) if values else 0,
            'max': max(values) if values else 0,
            'avg': sum(values) / len(values) if values else 0,
            'current': values[-1] if values else 0
        }

# 创建全局单例
data_saver = DataSaver()

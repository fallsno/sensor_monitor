"""
数据库模块 - 存储配置信息
"""
import sqlite3
import json
import threading
import os
from datetime import datetime

logger = __import__('logging').getLogger('Database')

class Database:
    _instance = None
    _lock = None
    
    def __new__(cls):
        if cls._instance is None:
            import threading
            cls._lock = threading.Lock()
            with cls._lock:
                if cls._instance is None:
                    cls._instance = super().__new__(cls)
                    cls._instance._initialized = False
        return cls._instance
    
    def __init__(self):
        if self._initialized:
            return
        self._initialized = True
        
        base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        self.db_path = os.path.join(base_dir, 'config', 'sensor_monitor.db')
        
        # 确保目录存在
        os.makedirs(os.path.dirname(self.db_path), exist_ok=True)
        
        self._conn = None
        self._connect()
        self._init_tables()
        logger.info("数据库初始化完成")
    
    def _connect(self):
        """连接数据库"""
        self._conn = sqlite3.connect(self.db_path, check_same_thread=False)
        self._conn.row_factory = sqlite3.Row
    
    def _init_tables(self):
        """初始化数据库表"""
        cursor = self._conn.cursor()
        
        # 配置表 - 存储所有配置
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS config (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                key TEXT UNIQUE NOT NULL,
                value TEXT NOT NULL,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        
        # 配置变更日志表 - 用于同步
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS config_changes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                config_key TEXT NOT NULL,
                old_value TEXT,
                new_value TEXT,
                changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        
        # 客户端表
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS clients (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                client_id TEXT UNIQUE NOT NULL,
                client_name TEXT,
                ip_address TEXT,
                status TEXT DEFAULT 'offline',
                last_heartbeat TIMESTAMP,
                device_info TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        
        # 数据记录表 - 先创建基础表（兼容旧数据）
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS data_records (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                record_name TEXT NOT NULL,
                start_time TIMESTAMP NOT NULL,
                end_time TIMESTAMP,
                duration REAL,
                status TEXT DEFAULT 'active',
                sensor_count INTEGER DEFAULT 0,
                data_points INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        
        # 检查 data_records 表是否有 client_id 列，没有则添加
        cursor.execute("PRAGMA table_info(data_records)")
        columns = [col[1] for col in cursor.fetchall()]
        if 'client_id' not in columns:
            try:
                cursor.execute('ALTER TABLE data_records ADD COLUMN client_id TEXT')
                logger.info("已添加 client_id 列到 data_records 表")
            except Exception as e:
                logger.warning(f"添加 client_id 列失败（可能已存在）: {e}")
        
        # 数据点表
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS data_points (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                record_id INTEGER NOT NULL,
                timestamp TEXT NOT NULL,
                sensor_data TEXT NOT NULL,
                FOREIGN KEY (record_id) REFERENCES data_records(id) ON DELETE CASCADE
            )
        ''')
        
        # 索引
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_data_points_record ON data_points(record_id)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_records_created ON data_records(created_at DESC)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_clients_client_id ON clients(client_id)')
        # 尝试创建索引，失败则忽略
        try:
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_records_client ON data_records(client_id)')
        except Exception as e:
            logger.warning(f"创建索引失败: {e}")
        
        self._conn.commit()
    
    def get_config(self, key, default=None):
        """获取配置"""
        try:
            cursor = self._conn.cursor()
            cursor.execute('SELECT value FROM config WHERE key = ?', (key,))
            row = cursor.fetchone()
            if row:
                return json.loads(row['value'])
            return default
        except Exception as e:
            logger.error(f"获取配置 {key} 失败: {e}")
            return default
    
    def set_config(self, key, value):
        """设置配置"""
        try:
            old_value = self.get_config(key)
            
            cursor = self._conn.cursor()
            value_json = json.dumps(value, ensure_ascii=False)
            
            cursor.execute('''
                INSERT OR REPLACE INTO config (key, value, updated_at)
                VALUES (?, ?, CURRENT_TIMESTAMP)
            ''', (key, value_json))
            
            # 记录变更
            cursor.execute('''
                INSERT INTO config_changes (config_key, old_value, new_value)
                VALUES (?, ?, ?)
            ''', (
                key, 
                json.dumps(old_value, ensure_ascii=False) if old_value else None,
                value_json
            ))
            
            self._conn.commit()
            logger.info(f"配置 {key} 已更新")
            return True
        except Exception as e:
            logger.error(f"设置配置 {key} 失败: {e}")
            return False
    
    def get_all_configs(self):
        """获取所有配置"""
        try:
            cursor = self._conn.cursor()
            cursor.execute('SELECT key, value FROM config')
            rows = cursor.fetchall()
            configs = {}
            for row in rows:
                configs[row['key']] = json.loads(row['value'])
            return configs
        except Exception as e:
            logger.error(f"获取所有配置失败: {e}")
            return {}
    
    def get_changes_since(self, last_id):
        """获取指定ID之后的配置变更"""
        try:
            cursor = self._conn.cursor()
            cursor.execute('''
                SELECT id, config_key, new_value, changed_at
                FROM config_changes
                WHERE id > ?
                ORDER BY id ASC
            ''', (last_id,))
            rows = cursor.fetchall()
            return [
                {
                    'id': row['id'],
                    'key': row['config_key'],
                    'value': json.loads(row['new_value']),
                    'changed_at': row['changed_at']
                }
                for row in rows
            ]
        except Exception as e:
            logger.error(f"获取配置变更失败: {e}")
            return []
    
    def get_last_change_id(self):
        """获取最新的变更ID"""
        try:
            cursor = self._conn.cursor()
            cursor.execute('SELECT MAX(id) as last_id FROM config_changes')
            row = cursor.fetchone()
            return row['last_id'] or 0
        except Exception as e:
            logger.error(f"获取最新变更ID失败: {e}")
            return 0
    
    # ==================== 数据记录管理 ====================
    
    def create_data_record(self, record_name, sensor_count=0):
        """创建数据记录"""
        try:
            cursor = self._conn.cursor()
            cursor.execute('''
                INSERT INTO data_records (record_name, start_time, status, sensor_count)
                VALUES (?, datetime('now'), 'active', ?)
            ''', (record_name, sensor_count))
            self._conn.commit()
            return cursor.lastrowid
        except Exception as e:
            logger.error(f"创建数据记录失败: {e}")
            return None
    
    def add_data_point(self, record_id, timestamp, sensor_data):
        """添加数据点"""
        try:
            cursor = self._conn.cursor()
            
            # Convert numpy types to native Python types
            def convert_numpy(obj):
                import numpy as np
                if isinstance(obj, np.generic):
                    return obj.item()
                raise TypeError
                
            cursor.execute('''
                INSERT INTO data_points (record_id, timestamp, sensor_data)
                VALUES (?, ?, ?)
            ''', (record_id, timestamp, json.dumps(sensor_data, ensure_ascii=False, default=convert_numpy)))
            # 更新记录点数
            cursor.execute('''
                UPDATE data_records 
                SET data_points = data_points + 1 
                WHERE id = ?
            ''', (record_id,))
            self._conn.commit()
            return True
        except Exception as e:
            logger.error(f"添加数据点失败: {e}")
            return False

    def add_data_points_batch(self, record_id, points_list):
        """批量添加数据点
        points_list: [{'timestamp': '...', 'data': {...}}, ...]
        """
        if not points_list:
            return True
            
        try:
            cursor = self._conn.cursor()
            
            # Convert numpy types to native Python types
            def convert_numpy(obj):
                import numpy as np
                if isinstance(obj, np.generic):
                    return obj.item()
                raise TypeError
                
            # Prepare data for batch insert
            insert_data = [
                (record_id, p['timestamp'], json.dumps(p['data'], ensure_ascii=False, default=convert_numpy))
                for p in points_list
            ]
            
            cursor.executemany('''
                INSERT INTO data_points (record_id, timestamp, sensor_data)
                VALUES (?, ?, ?)
            ''', insert_data)
            
            # 更新记录点数
            cursor.execute('''
                UPDATE data_records 
                SET data_points = data_points + ? 
                WHERE id = ?
            ''', (len(points_list), record_id))
            
            self._conn.commit()
            return True
        except Exception as e:
            logger.error(f"批量添加数据点失败: {e}")
            return False
    
    def finish_data_record(self, record_id):
        """完成数据记录"""
        try:
            cursor = self._conn.cursor()
            cursor.execute('''
                UPDATE data_records 
                SET status = 'finished',
                    end_time = datetime('now'),
                    duration = (julianday('now') - julianday(start_time)) * 86400
                WHERE id = ?
            ''', (record_id,))
            self._conn.commit()
            return True
        except Exception as e:
            logger.error(f"完成数据记录失败: {e}")
            return False
    
    def get_data_records(self, limit=50):
        """获取数据记录列表"""
        try:
            cursor = self._conn.cursor()
            cursor.execute('''
                SELECT id, record_name, start_time, end_time, duration, 
                       status, sensor_count, data_points, created_at
                FROM data_records
                ORDER BY created_at DESC
                LIMIT ?
            ''', (limit,))
            rows = cursor.fetchall()
            return [dict(row) for row in rows]
        except Exception as e:
            logger.error(f"获取数据记录失败: {e}")
            return []
    
    def get_data_points(self, record_id, limit=10000):
        """获取数据点"""
        try:
            cursor = self._conn.cursor()
            cursor.execute('''
                SELECT timestamp, sensor_data
                FROM data_points
                WHERE record_id = ?
                ORDER BY id ASC
                LIMIT ?
            ''', (record_id, limit))
            rows = cursor.fetchall()
            return [
                {
                    'timestamp': row['timestamp'],
                    'data': json.loads(row['sensor_data'])
                }
                for row in rows
            ]
        except Exception as e:
            logger.error(f"获取数据点失败: {e}")
            return []
    
    def delete_data_record(self, record_id):
        """删除数据记录（级联删除数据点）"""
        try:
            cursor = self._conn.cursor()
            cursor.execute('DELETE FROM data_records WHERE id = ?', (record_id,))
            self._conn.commit()
            return True
        except Exception as e:
            logger.error(f"删除数据记录失败: {e}")
            return False
    
    def export_record_to_csv(self, record_id):
        """导出记录为CSV内容"""
        try:
            points = self.get_data_points(record_id)
            if not points:
                return None
            
            # 获取所有传感器键
            all_sensors = set()
            for p in points:
                all_sensors.update(p['data'].keys())
            sensors = sorted(list(all_sensors))
            
            # 生成CSV
            csv_lines = []
            csv_lines.append('timestamp,' + ','.join(sensors))
            for p in points:
                values = [p['timestamp']] + [str(p['data'].get(s, '')) for s in sensors]
                csv_lines.append(','.join(values))
            
            return '\n'.join(csv_lines)
        except Exception as e:
            logger.error(f"导出CSV失败: {e}")
            return None
    
    # ==================== 客户端管理 ====================
    
    def register_client(self, client_id, client_name=None, ip_address=None, device_info=None):
        """注册或更新客户端"""
        try:
            cursor = self._conn.cursor()
            now = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
            
            # 检查是否已存在
            cursor.execute('SELECT id FROM clients WHERE client_id = ?', (client_id,))
            exists = cursor.fetchone()
            
            if exists:
                cursor.execute('''
                    UPDATE clients 
                    SET client_name = ?, ip_address = ?, device_info = ?, 
                        status = 'online', last_heartbeat = ?
                    WHERE client_id = ?
                ''', (client_name, ip_address, json.dumps(device_info, ensure_ascii=False) if device_info else None, now, client_id))
            else:
                cursor.execute('''
                    INSERT INTO clients (client_id, client_name, ip_address, status, last_heartbeat, device_info)
                    VALUES (?, ?, ?, 'online', ?, ?)
                ''', (client_id, client_name, ip_address, now, 
                      json.dumps(device_info, ensure_ascii=False) if device_info else None))
            
            self._conn.commit()
            logger.info(f"客户端 {client_id} 已注册/更新")
            return True
        except Exception as e:
            logger.error(f"注册客户端失败: {e}")
            return False
    
    def update_client_heartbeat(self, client_id):
        """更新客户端心跳"""
        try:
            cursor = self._conn.cursor()
            now = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
            cursor.execute('''
                UPDATE clients 
                SET status = 'online', last_heartbeat = ?
                WHERE client_id = ?
            ''', (now, client_id))
            self._conn.commit()
            return True
        except Exception as e:
            logger.error(f"更新心跳失败: {e}")
            return False
    
    def get_clients(self):
        """获取所有客户端列表"""
        try:
            cursor = self._conn.cursor()
            cursor.execute('''
                SELECT id, client_id, client_name, ip_address, status, 
                       last_heartbeat, device_info, created_at
                FROM clients
                ORDER BY created_at DESC
            ''')
            rows = cursor.fetchall()
            clients = []
            for row in rows:
                client = dict(row)
                if client.get('device_info'):
                    try:
                        client['device_info'] = json.loads(client['device_info'])
                    except:
                        pass
                clients.append(client)
            return clients
        except Exception as e:
            logger.error(f"获取客户端列表失败: {e}")
            return []
    
    def get_client(self, client_id):
        """获取单个客户端信息"""
        try:
            cursor = self._conn.cursor()
            cursor.execute('''
                SELECT id, client_id, client_name, ip_address, status, 
                       last_heartbeat, device_info, created_at
                FROM clients
                WHERE client_id = ?
            ''', (client_id,))
            row = cursor.fetchone()
            if row:
                client = dict(row)
                if client.get('device_info'):
                    try:
                        client['device_info'] = json.loads(client['device_info'])
                    except:
                        pass
                return client
            return None
        except Exception as e:
            logger.error(f"获取客户端信息失败: {e}")
            return None
    
    def set_client_offline(self, client_id):
        """设置客户端为离线状态"""
        try:
            cursor = self._conn.cursor()
            cursor.execute('''
                UPDATE clients 
                SET status = 'offline'
                WHERE client_id = ?
            ''', (client_id,))
            self._conn.commit()
            return True
        except Exception as e:
            logger.error(f"设置客户端离线失败: {e}")
            return False
    
    # 重写数据记录相关方法，支持 client_id
    def create_data_record(self, record_name, sensor_count=0, client_id=None):
        """创建数据记录"""
        try:
            cursor = self._conn.cursor()
            cursor.execute('''
                INSERT INTO data_records (client_id, record_name, start_time, status, sensor_count)
                VALUES (?, ?, datetime('now'), 'active', ?)
            ''', (client_id, record_name, sensor_count))
            self._conn.commit()
            return cursor.lastrowid
        except Exception as e:
            logger.error(f"创建数据记录失败: {e}")
            return None
    
    def get_data_records(self, limit=50, client_id=None):
        """获取数据记录列表"""
        try:
            cursor = self._conn.cursor()
            if client_id:
                cursor.execute('''
                    SELECT id, client_id, record_name, start_time, end_time, duration, 
                           status, sensor_count, data_points, created_at
                    FROM data_records
                    WHERE client_id = ?
                    ORDER BY created_at DESC
                    LIMIT ?
                ''', (client_id, limit))
            else:
                cursor.execute('''
                    SELECT id, client_id, record_name, start_time, end_time, duration, 
                           status, sensor_count, data_points, created_at
                    FROM data_records
                    ORDER BY created_at DESC
                    LIMIT ?
                ''', (limit,))
            rows = cursor.fetchall()
            return [dict(row) for row in rows]
        except Exception as e:
            logger.error(f"获取数据记录失败: {e}")
            return []

# 创建全局单例
db = Database()

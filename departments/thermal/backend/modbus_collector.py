import threading
import time
import os
import csv
import json
import struct
import logging
import inspect
from datetime import datetime
from pymodbus.client import ModbusSerialClient
from backend.database import db
from backend.config_manager import config_manager

try:
    from serial.tools import list_ports
except Exception:  # pragma: no cover
    list_ports = None

logger = logging.getLogger('ModbusCollector')

def list_serial_ports():
    """返回当前系统可用的串口名称列表。"""
    if list_ports is None:
        return []
    try:
        return [port.device for port in list_ports.comports()]
    except Exception as e:
        logger.warning(f"枚举串口失败: {e}")
        return []

class ModbusParser:
    """Modbus 数据解析器，支持多种数据类型和字节序。"""
    
    @staticmethod
    def parse_value(registers, data_type, scale=1.0, byte_order='ABCD'):
        """
        解析寄存器值为实际物理量。
        :param registers: 原始寄存器列表 (uint16)
        :param data_type: uint16, int16, uint32, int32, float32
        :param scale: 缩放系数
        :param byte_order: 字节序 (ABCD, CDAB, BADC, DCBA)
        """
        if not registers:
            return 0.0
            
        # 将寄存器转换为字节数组
        raw_bytes = []
        for reg in registers:
            raw_bytes.extend(struct.pack('>H', reg))
            
        # 根据字节序调整字节数组
        # ABCD (Big-endian), CDAB (Word-swapped), BADC (Byte-swapped), DCBA (Little-endian)
        if byte_order == 'CDAB':
            if len(raw_bytes) >= 4:
                raw_bytes = raw_bytes[2:4] + raw_bytes[0:2]
        elif byte_order == 'BADC':
            new_bytes = []
            for i in range(0, len(raw_bytes), 2):
                new_bytes.extend([raw_bytes[i+1], raw_bytes[i]])
            raw_bytes = new_bytes
        elif byte_order == 'DCBA':
            raw_bytes.reverse()
            
        # 根据数据类型解析
        try:
            if data_type == 'uint16':
                val = struct.unpack('>H', bytes(raw_bytes[:2]))[0]
            elif data_type == 'int16':
                val = struct.unpack('>h', bytes(raw_bytes[:2]))[0]
            elif data_type == 'uint32':
                val = struct.unpack('>I', bytes(raw_bytes[:4]))[0]
            elif data_type == 'int32':
                val = struct.unpack('>i', bytes(raw_bytes[:4]))[0]
            elif data_type == 'float32':
                val = struct.unpack('>f', bytes(raw_bytes[:4]))[0]
            else:
                val = registers[0]
                
            return float(val) * scale
        except Exception as e:
            logger.error(f"解析失败: {e}, type={data_type}, bytes={raw_bytes}")
            return 0.0

class ModbusCollector:
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
        self.is_running = False
        self.thread = None
        self.client = None
        self.latest_data = None
        self.status_msg = "Ready"
        self.traffic_logs = []
        self.max_traffic_logs = 200
        self.traffic_lock = threading.Lock()
        
        # Setup directories
        self.base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        self.template_dir = os.path.join(self.base_dir, 'backend', 'templates')
        os.makedirs(self.template_dir, exist_ok=True)
        self.save_paths = self._resolve_save_paths(None)

    def append_traffic_log(self, log_type, slave_id, function_code, address, count, message):
        log_entry = {
            "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S.%f")[:-3],
            "type": log_type,
            "slave_id": slave_id,
            "function_code": function_code,
            "address": address,
            "count": count,
            "message": message,
        }
        with self.traffic_lock:
            self.traffic_logs.append(log_entry)
            if len(self.traffic_logs) > self.max_traffic_logs:
                self.traffic_logs = self.traffic_logs[-self.max_traffic_logs:]

    def get_traffic_logs(self):
        with self.traffic_lock:
            return list(self.traffic_logs)

    def clear_traffic_logs(self):
        with self.traffic_lock:
            self.traffic_logs.clear()

    def _default_save_dir(self):
        return os.path.join(self.base_dir, 'data', 'modbus')

    def _resolve_save_paths(self, save_dir):
        base_dir = save_dir.strip() if save_dir else self._default_save_dir()
        if not os.path.isabs(base_dir):
            base_dir = os.path.join(self.base_dir, base_dir)

        raw_dir = os.path.join(base_dir, 'raw')
        parsed_dir = os.path.join(base_dir, 'parsed')
        os.makedirs(raw_dir, exist_ok=True)
        os.makedirs(parsed_dir, exist_ok=True)

        current_date = datetime.now().strftime("%Y%m%d")
        return {
            'base_dir': base_dir,
            'raw_dir': raw_dir,
            'parsed_dir': parsed_dir,
            'raw_csv_path': os.path.join(raw_dir, f'modbus_raw_{current_date}.csv'),
            'parsed_csv_path': os.path.join(parsed_dir, f'modbus_parsed_{current_date}.csv'),
        }

    def _get_save_paths(self, save_dir):
        try:
            self.save_paths = self._resolve_save_paths(save_dir)
            return self.save_paths
        except Exception as e:
            self.status_msg = f"保存目录不可用: {e}"
            logger.error(self.status_msg)
            return None

    def load_template(self, template_id):
        """从文件加载模板。"""
        normalized_id = template_id.lower()
        candidate_names = [
            f"{normalized_id}.json",
            f"{normalized_id.replace('-', '_')}.json",
        ]
        template_path = None
        for candidate_name in candidate_names:
            candidate_path = os.path.join(self.template_dir, candidate_name)
            if os.path.exists(candidate_path):
                template_path = candidate_path
                break

        if template_path is None:
            logger.error(
                f"模板文件不存在: {os.path.join(self.template_dir, candidate_names[0])}"
            )
            return None
        try:
            with open(template_path, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception as e:
            logger.error(f"加载模板失败: {e}")
            return None

    def start(self):
        if self.is_running:
            return False, "Already running"
            
        cfg = config_manager.get_config().get("modbus", {})
        if not cfg.get("enabled", True):
            return False, "Modbus is disabled in config"
            
        port = cfg.get("port", "COM1")
        baudrate = cfg.get("baudrate", 9600)
        available_ports = list_serial_ports()

        if not available_ports:
            self.status_msg = "未检测到可用的 RS485/串口设备"
            return False, self.status_msg

        if port not in available_ports:
            self.status_msg = f"串口 {port} 不存在，当前可用串口: {', '.join(available_ports)}"
            return False, self.status_msg
        
        try:
            self.client = ModbusSerialClient(
                port=port,
                baudrate=baudrate,
                bytesize=8,
                parity='N',
                stopbits=1,
                timeout=1
            )
            if not self.client.connect():
                self.status_msg = f"Failed to connect to {port}"
                return False, self.status_msg
        except Exception as e:
            self.status_msg = str(e)
            return False, self.status_msg
            
        self.is_running = True
        self.status_msg = "Running"
        self.thread = threading.Thread(target=self._run_loop, daemon=True)
        self.thread.start()
        return True, "Started successfully"
        
    def stop(self):
        self.is_running = False
        if self.client:
            self.client.close()
            self.client = None
        self.status_msg = "Stopped"
        return True, "Stopped successfully"

    def _read_registers(self, function_code, address, count, slave_id):
        if function_code == 4:
            read_method = self.client.read_input_registers
        else:
            read_method = self.client.read_holding_registers

        try:
            parameters = inspect.signature(read_method).parameters
        except (TypeError, ValueError):
            parameters = {}

        kwargs = {"address": address, "count": count}
        if "device_id" in parameters:
            kwargs["device_id"] = slave_id
        elif "slave" in parameters:
            kwargs["slave"] = slave_id
        else:
            kwargs["unit"] = slave_id

        return read_method(**kwargs)
        
    def _run_loop(self):
        while self.is_running:
            cfg = config_manager.get_config().get("modbus", {})
            slave_id = int(cfg.get("slave_id", 1))
            template_id = cfg.get("template_id", "DAM-3505N")
            interval = float(cfg.get("interval", 1.0))
            save_paths = self._get_save_paths(cfg.get("save_dir"))

            if not save_paths:
                time.sleep(interval)
                continue
            
            template = self.load_template(template_id)
            if not template:
                self.status_msg = f"Error: Template {template_id} not found"
                time.sleep(5)
                continue

            try:
                # 1. 组织读取任务：按功能码和地址范围分组
                # 简单实现：按功能码分组，并找到连续的地址范围
                groups = self._group_registers(template['registers'])
                
                all_results = {}
                raw_groups = []
                timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S.%f")[:-3]
                
                for fc, start_addr, count, regs_in_group in groups:
                    self.append_traffic_log(
                        log_type='send',
                        slave_id=slave_id,
                        function_code=fc,
                        address=start_addr,
                        count=count,
                        message=f'FC{fc} addr={start_addr} count={count}',
                    )
                    result = self._read_registers(
                        function_code=fc,
                        address=start_addr,
                        count=count,
                        slave_id=slave_id,
                    )
                        
                    if not result.isError():
                        self.append_traffic_log(
                            log_type='recv',
                            slave_id=slave_id,
                            function_code=fc,
                            address=start_addr,
                            count=count,
                            message=str(list(result.registers)),
                        )
                        # 解析该组中的每个寄存器定义
                        for reg_def in regs_in_group:
                            offset = reg_def['address'] - start_addr
                            length = 2 if reg_def['data_type'] in ['uint32', 'int32', 'float32'] else 1
                            reg_values = result.registers[offset : offset + length]
                            
                            parsed_val = ModbusParser.parse_value(
                                reg_values, 
                                reg_def['data_type'], 
                                reg_def.get('scale', 1.0),
                                reg_def.get('byte_order', 'ABCD')
                            )
                            all_results[reg_def['name']] = {
                                'label': reg_def['label'],
                                'value': parsed_val,
                                'unit': reg_def.get('unit', ''),
                                'address': reg_def['address']
                            }
                        raw_groups.append({
                            'function_code': fc,
                            'group_start_address': start_addr,
                            'registers': list(result.registers),
                        })
                    else:
                        self.append_traffic_log(
                            log_type='error',
                            slave_id=slave_id,
                            function_code=fc,
                            address=start_addr,
                            count=count,
                            message=str(result),
                        )
                        logger.error(f"FC{fc} Read Error at {start_addr}: {result}")

                if all_results:
                    self.latest_data = {
                        "timestamp": timestamp,
                        "data": all_results
                    }
                    if raw_groups:
                        self._save_raw_results(timestamp, slave_id, raw_groups, save_paths['raw_csv_path'])
                    self._save_results(timestamp, slave_id, all_results, save_paths['parsed_csv_path'])
                    self.status_msg = "Running - Last read OK"
                
            except Exception as e:
                self.append_traffic_log(
                    log_type='error',
                    slave_id=slave_id,
                    function_code=0,
                    address=0,
                    count=0,
                    message=str(e),
                )
                self.status_msg = f"Read Exception: {e}"
                logger.error(self.status_msg)
                
            time.sleep(interval)

    def _group_registers(self, register_defs, max_gap=5):
        """将寄存器定义分组以优化读取。"""
        if not register_defs:
            return []
            
        # 按功能码和地址排序
        sorted_regs = sorted(register_defs, key=lambda x: (x.get('function_code', 3), x['address']))
        
        groups = []
        if not sorted_regs:
            return groups
            
        current_fc = sorted_regs[0].get('function_code', 3)
        current_start = sorted_regs[0]['address']
        current_regs = [sorted_regs[0]]
        
        for i in range(1, len(sorted_regs)):
            reg = sorted_regs[i]
            fc = reg.get('function_code', 3)
            addr = reg['address']
            
            # 计算当前组的结束地址
            prev_reg = sorted_regs[i-1]
            prev_len = 2 if prev_reg['data_type'] in ['uint32', 'int32', 'float32'] else 1
            prev_end = prev_reg['address'] + prev_len
            
            # 如果功能码改变，或者地址跨度太大，则开始新组
            if fc != current_fc or (addr - prev_end) > max_gap:
                # 保存当前组
                last_reg = current_regs[-1]
                last_len = 2 if last_reg['data_type'] in ['uint32', 'int32', 'float32'] else 1
                count = (last_reg['address'] + last_len) - current_start
                groups.append((current_fc, current_start, count, current_regs))
                
                # 开始新组
                current_fc = fc
                current_start = addr
                current_regs = [reg]
            else:
                current_regs.append(reg)
                
        # 保存最后一组
        last_reg = current_regs[-1]
        last_len = 2 if last_reg['data_type'] in ['uint32', 'int32', 'float32'] else 1
        count = (last_reg['address'] + last_len) - current_start
        groups.append((current_fc, current_start, count, current_regs))
        
        return groups

    def _save_raw_results(self, timestamp, slave_id, raw_groups, raw_csv_path):
        file_exists = os.path.isfile(raw_csv_path)
        with open(raw_csv_path, 'a', newline='', encoding='utf-8') as f:
            writer = csv.writer(f)
            if not file_exists:
                writer.writerow([
                    'timestamp',
                    'slave_id',
                    'function_code',
                    'group_start_address',
                    'register_address',
                    'raw_decimal',
                    'raw_hex',
                ])

            for group in raw_groups:
                for offset, raw_value in enumerate(group['registers']):
                    writer.writerow([
                        timestamp,
                        slave_id,
                        group['function_code'],
                        group['group_start_address'],
                        group['group_start_address'] + offset,
                        raw_value,
                        f'0x{raw_value:04X}',
                    ])

    def _save_results(self, timestamp, slave_id, results, parsed_csv_path):
        """保存解析后的结果到 CSV 和 DB。"""
        file_exists = os.path.isfile(parsed_csv_path)
        try:
            with open(parsed_csv_path, 'a', newline='', encoding='utf-8') as f:
                writer = csv.writer(f)
                if not file_exists:
                    writer.writerow(['timestamp', 'name', 'label', 'register_address', 'value', 'unit'])
                for name, info in results.items():
                    writer.writerow([
                        timestamp,
                        name,
                        info['label'],
                        info['address'],
                        info['value'],
                        info['unit'],
                    ])
        except Exception as e:
            logger.error(f"Failed to write Modbus CSV: {e}")
            
        # DB
        try:
            conn = db.get_connection()
            cursor = conn.cursor()
            for name, info in results.items():
                cursor.execute('''
                    INSERT INTO modbus_data (timestamp, slave_id, register_address, tag, value, unit)
                    VALUES (?, ?, ?, ?, ?, ?)
                ''', (timestamp, slave_id, info['address'], info['label'], info['value'], info['unit']))
            conn.commit()
        except Exception as e:
            logger.error(f"Failed to write Modbus DB: {e}")

# Global instance
modbus_collector = ModbusCollector()

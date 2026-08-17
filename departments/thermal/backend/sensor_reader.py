"""
传感器数据读取模块
基于阿尔泰ARTDAQ库读取各传感器数据，支持动态通道映射
"""
import threading
import time
import numpy as np
from datetime import datetime
import logging
import artdaq
from artdaq.constants import AcquisitionType, CounterFrequencyMethod
import json
import os

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger('SensorReader')

class SensorReader:
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
        self.running = False
        self.thread = None
        self.simulation_mode = False
        self.last_error = None
        
        # 默认初始化，后面 load_config 会重新设置
        self.ai_task = None
        self.freq_task1 = None
        self.freq_task2 = None
        self.freq1_timeout_count = 0
        self.freq2_timeout_count = 0
        self.sensor_status = {}
        self.data_buffers = {}
        self.buffer_size = 1000
        self.buffer_index = 0
        
        self.saving = False
        self.save_file = None
        self.column_order = []  # 用于CSV保存的列顺序
        
        # 数据库保存相关
        self.current_record_id = None
        
        # 加载配置
        self.load_config()
        # 根据映射初始化传感器状态和缓冲区
        self._init_sensor_buffers()
        
        logger.info("传感器读取器初始化完成")
    
    def load_config(self):
        """从统一配置加载端口和映射"""
        from backend.config_manager import config_manager
        full_config = config_manager.get_config()
        port_cfg = full_config.get('port', {})
        self.device = port_cfg.get('device', 'Dev1')
        self.counter1 = port_cfg.get('counter1', 'ctr0')
        self.counter2 = port_cfg.get('counter2', 'ctr1')
        self.freq_min = port_cfg.get('freq_min', 0.1)
        self.freq_max = port_cfg.get('freq_max', 1000.0)
        self.pulses_per_rev = port_cfg.get('pulses_per_rev', 1)
        self.sample_rate = port_cfg.get('sample_rate', 1000)
        self.ctr_timeout = port_cfg.get('ctr_timeout', 5.0)
        
        self.ai_mapping = full_config.get('channel_mapping', {}).get('ai', [])
        self.counter_mapping = full_config.get('channel_mapping', {}).get('counter', [])
        
        logger.info(f"加载配置: device={self.device}, sample_rate={self.sample_rate}")
        logger.info(f"AI映射数量: {len(self.ai_mapping)}, Counter映射数量: {len(self.counter_mapping)}")
    
    def _init_sensor_buffers(self):
        """根据映射初始化 sensor_status 和 data_buffers (仅初始化不存在的传感器，避免置零)"""
        if not hasattr(self, 'sensor_status'):
            self.sensor_status = {}
        if not hasattr(self, 'data_buffers'):
            self.data_buffers = {}
        
        self.column_order = []
        
        # 获取当前映射中的所有有效传感器名称
        active_sensors = set()

        for item in self.ai_mapping:
            name = item['sensor']
            if name != 'unused':
                active_sensors.add(name)
                if name not in self.sensor_status:
                    self.sensor_status[name] = {'active': False, 'value': 0.0, 'voltage': 0.0}
                if name not in self.data_buffers:
                    self.data_buffers[name] = np.zeros(self.buffer_size)
                self.column_order.append(name)

        for item in self.counter_mapping:
            name = item['sensor']
            if name != 'unused':
                active_sensors.add(name)
                if name not in self.sensor_status:
                    self.sensor_status[name] = {'active': False, 'value': 0.0, 'voltage': 0.0}
                if name not in self.data_buffers:
                    self.data_buffers[name] = np.zeros(self.buffer_size)
                self.column_order.append(name)
        
        # 清理已不存在的传感器
        for name in list(self.sensor_status.keys()):
            if name not in active_sensors:
                del self.sensor_status[name]
        for name in list(self.data_buffers.keys()):
            if name not in active_sensors:
                del self.data_buffers[name]
    
    def initialize_tasks(self):
        """初始化所有采集任务，任一必需硬件任务失败都直接报错返回。"""
        self.load_config()
        self._init_sensor_buffers()
        self.last_error = None

        # 先清理已存在的任务
        self._cleanup_tasks()
        
        ai_success = False
        ctr1_success = False
        ctr2_success = False
        error_messages = []

        ai_mappings = [item for item in self.ai_mapping if item.get('sensor') != 'unused']
        ctr1_mapped = any(
            item.get('channel') == self.counter1 and item.get('sensor') != 'unused'
            for item in self.counter_mapping
        )
        ctr2_mapped = any(
            item.get('channel') == self.counter2 and item.get('sensor') != 'unused'
            for item in self.counter_mapping
        )

        if not (ai_mappings or ctr1_mapped or ctr2_mapped):
            self.simulation_mode = False
            self.last_error = "未配置任何有效的 AI 或计数器通道映射，采集已取消"
            logger.error(self.last_error)
            return False
        
        # 初始化AI任务 - 根据ai_mapping动态添加通道
        try:
            if ai_mappings:
                self.ai_task = artdaq.Task("AITask")
                # 按顺序添加每个映射的通道
                for mapping in ai_mappings:
                    channel = mapping.get('channel', f'ai{mapping.get("index", 0)}')
                    self.ai_task.ai_channels.add_ai_voltage_chan(
                        f"{self.device}/{channel}",
                        min_val=-10.0,
                        max_val=10.0
                    )
                self.ai_task.timing.cfg_samp_clk_timing(
                    rate=self.sample_rate,
                    sample_mode=AcquisitionType.CONTINUOUS,
                    samps_per_chan=self.sample_rate
                )
                self.ai_task.start()
                ai_success = True
                logger.info(f"AI任务初始化成功，通道数: {len(ai_mappings)}")
        except Exception as e:
            error_messages.append(f"AI任务初始化失败: {e}")
            logger.error(error_messages[-1])
            if self.ai_task:
                try:
                    self.ai_task.close()
                except:
                    pass
            self.ai_task = None
        
        # 初始化CTR任务1
        try:
            if ctr1_mapped:
                self.freq_task1 = artdaq.Task("FreqTask1")
                
                # 从映射中获取特定参数
                ctr_cfg = next((item for item in self.counter_mapping if item.get('channel') == self.counter1), {})
                freq_min = ctr_cfg.get('freq_min', self.freq_min)
                freq_max = ctr_cfg.get('freq_max', self.freq_max)
                meas_time = ctr_cfg.get('meas_time', 0.1)  # 获取测量时间配置，如果没配置默认为0.1秒
                
                self.freq_task1.cio_channels.add_ci_freq_chan(
                    f"{self.device}/{self.counter1}",
                    min_val=freq_min,
                    max_val=freq_max,
                    units=artdaq.constants.FrequencyUnits.HZ,
                    meas_method=CounterFrequencyMethod.LOW_FREQUENCY_1_COUNTER,
                    meas_time=meas_time
                )
                self.freq_task1.start()
                ctr1_success = True
                logger.info(f"CTR任务1初始化成功 (meas_time={meas_time}s)")
        except Exception as e:
            error_messages.append(f"CTR任务1初始化失败: {e}")
            logger.error(error_messages[-1])
            if self.freq_task1:
                try:
                    self.freq_task1.close()
                except:
                    pass
            self.freq_task1 = None
        
        # 初始化CTR任务2
        try:
            if ctr2_mapped:
                self.freq_task2 = artdaq.Task("FreqTask2")
                
                # 从映射中获取特定参数
                ctr_cfg = next((item for item in self.counter_mapping if item.get('channel') == self.counter2), {})
                freq_min = ctr_cfg.get('freq_min', self.freq_min)
                freq_max = ctr_cfg.get('freq_max', self.freq_max)
                meas_time = ctr_cfg.get('meas_time', 0.1)  # 获取测量时间配置
                
                self.freq_task2.cio_channels.add_ci_freq_chan(
                    f"{self.device}/{self.counter2}",
                    min_val=freq_min,
                    max_val=freq_max,
                    units=artdaq.constants.FrequencyUnits.HZ,
                    meas_method=CounterFrequencyMethod.LOW_FREQUENCY_1_COUNTER,
                    meas_time=meas_time
                )
                self.freq_task2.start()
                ctr2_success = True
                logger.info(f"CTR任务2初始化成功 (meas_time={meas_time}s)")
        except Exception as e:
            error_messages.append(f"CTR任务2初始化失败: {e}")
            logger.error(error_messages[-1])
            if self.freq_task2:
                try:
                    self.freq_task2.close()
                except:
                    pass
            self.freq_task2 = None
        
        expected_ai = bool(ai_mappings)
        expected_ctr1 = ctr1_mapped
        expected_ctr2 = ctr2_mapped
        all_required_tasks_ready = (
            (not expected_ai or ai_success) and
            (not expected_ctr1 or ctr1_success) and
            (not expected_ctr2 or ctr2_success)
        )

        if all_required_tasks_ready:
            # 冲刷缓冲区：读取并丢弃旧数据，确保采集开始时是新鲜数据
            try:
                if self.ai_task:
                    # 读取一小批数据并丢弃
                    self.ai_task.read(number_of_samples_per_channel=100, timeout=1.0)
                    logger.info("AI硬件缓冲区已冲刷")
            except Exception as e:
                logger.debug(f"冲刷缓冲区跳过或失败: {e}")

            for name in self.sensor_status:
                self.sensor_status[name]['active'] = True
            self.simulation_mode = False
            self.last_error = None
            logger.info(f"采集任务初始化完成 - AI: {ai_success}, CTR1: {ctr1_success}, CTR2: {ctr2_success}")
            return True

        self.simulation_mode = False
        if not error_messages:
            error_messages.append("存在已配置的硬件任务未成功初始化")
        self.last_error = "; ".join(error_messages)
        logger.error(f"采集任务初始化失败: {self.last_error}")
        self._cleanup_tasks()
        return False
    
    def _cleanup_tasks(self):
        """清理所有采集任务"""
        try:
            if self.ai_task:
                try:
                    self.ai_task.stop()
                except:
                    pass
                try:
                    self.ai_task.close()
                except:
                    pass
                self.ai_task = None
            
            if self.freq_task1:
                try:
                    self.freq_task1.stop()
                except:
                    pass
                try:
                    self.freq_task1.close()
                except:
                    pass
                self.freq_task1 = None
            
            if self.freq_task2:
                try:
                    self.freq_task2.stop()
                except:
                    pass
                try:
                    self.freq_task2.close()
                except:
                    pass
                self.freq_task2 = None
        except Exception as e:
            logger.warning(f"清理任务时出错: {e}")
    
    def read_all_sensors(self, timeout=5.0):
        """读取所有传感器数据，根据映射解析 - 处理并保存所有采样点"""
        
        max_retries = 3
        ai_ok = False
        freq1_ok = False
        freq2_ok = False
        ai_data = None
        freq1_data = None
        freq2_data = None
        
        # 采样点数与采集频率匹配 - 减少每次读取的样本数，以提高实时性
        # 如果读取1秒的数据（1000个点），需要等硬件采集1秒才能返回，导致1秒的延迟
        # 改为读取0.1秒的数据（即 sample_rate / 10 个点），这样每0.1秒就能返回一次数据
        samples_per_read = max(1, int(self.sample_rate / 10))

        # 尝试读取 AI 任务（如果任务存在）
        if self.ai_task is not None:
            for attempt in range(max_retries):
                try:
                    ai_data = self.ai_task.read(number_of_samples_per_channel=samples_per_read, timeout=timeout)
                    ai_ok = True
                    break
                except Exception as e:
                    logger.warning(f"AI 任务读取失败 (尝试 {attempt+1}/{max_retries}): {e}")
                    time.sleep(0.1)
            if not ai_ok:
                logger.error("AI 任务最终失败，将保留上次数据")
        else:
            logger.debug("AI 任务未初始化，跳过读取")

        # 读取频率任务1（左转速）- 优化：减少重试和等待时间
        if self.freq_task1 is not None:
            try:
                # 使用更短的timeout，因为meas_time已经设置为0.1秒
                freq1_data = self.freq_task1.read(timeout=0.15)  # 比meas_time稍长一点
                freq1_ok = True
                self.freq1_timeout_count = 0
            except Exception as e:
                self.freq1_timeout_count += 1
                logger.debug(f"频率任务1 (左) 读取失败: {e}")
                freq1_ok = False
        else:
            logger.debug("CTR1 任务未初始化，跳过读取")

        # 读取频率任务2（右转速）- 优化：减少重试和等待时间
        if self.freq_task2 is not None:
            try:
                freq2_data = self.freq_task2.read(timeout=0.15)  # 比meas_time稍长一点
                freq2_ok = True
                self.freq2_timeout_count = 0
            except Exception as e:
                self.freq2_timeout_count += 1
                logger.debug(f"频率任务2 (右) 读取失败: {e}")
                freq2_ok = False
        else:
            logger.debug("CTR2 任务未初始化，跳过读取")

        # 获取采样点数量
        num_samples = 1
        if ai_ok and ai_data is not None:
            if isinstance(ai_data, list) and len(ai_data) > 0:
                first_chan = ai_data[0]
                if isinstance(first_chan, list):
                    num_samples = len(first_chan)
                elif hasattr(first_chan, '__len__'):
                    num_samples = len(first_chan)

        # 批量保存数据
        batch_points_to_save = []
        from datetime import datetime

        # 处理所有采样点
        for sample_idx in range(num_samples):
            # 初始化这个采样点的数据，预填充上次保存的最后值（防止读取超时时记录为0）
            point_data = {name: self.sensor_status.get(name, {}).get('value', 0) for name in self.column_order}
            
            # 处理 AI 数据（按映射）
            if ai_ok and ai_data is not None:
                for mapping in self.ai_mapping:
                    idx = mapping['index']
                    if idx >= len(ai_data):
                        continue
                    
                    # 获取该通道的第 sample_idx 个值
                    chan_data = ai_data[idx]
                    voltage = 0
                    if isinstance(chan_data, list):
                        voltage = chan_data[sample_idx] if sample_idx < len(chan_data) else chan_data[-1]
                    elif hasattr(chan_data, '__getitem__'):
                        try:
                            voltage = chan_data[sample_idx]
                        except:
                            voltage = chan_data
                    else:
                        voltage = chan_data
                    
                    name = mapping['sensor']
                    if name == 'unused':
                        continue
                    scale = mapping.get('scale', 1.0)
                    offset = mapping.get('offset', 0.0)
                    value = float(voltage * scale + offset)  # 转换为原生 float
                    
                    point_data[name] = value
                    
                    # 更新传感器状态（只有最后一个采样点）
                    if sample_idx == num_samples - 1:
                        self.sensor_status[name]['voltage'] = float(voltage)
                        self.sensor_status[name]['value'] = value
                        self.sensor_status[name]['active'] = True

            # 处理计数器数据
            # 左转速
            if freq1_ok and freq1_data is not None:
                left_freq = float(freq1_data[0] if isinstance(freq1_data, list) else freq1_data)
                
                for mapping in self.counter_mapping:
                    if mapping['channel'] == self.counter1:
                        name = mapping['sensor']
                        pulses = mapping.get('pulses_per_rev', self.pulses_per_rev)
                        scale = mapping.get('scale', 60.0)
                        value = float(left_freq * scale / pulses)
                        point_data[name] = value
                        
                        if sample_idx == num_samples - 1:
                            self.sensor_status[name]['voltage'] = left_freq
                            self.sensor_status[name]['value'] = value
                            self.sensor_status[name]['active'] = True
                        break
            else:
                if self.freq1_timeout_count > 2:
                    for mapping in self.counter_mapping:
                        if mapping['channel'] == self.counter1:
                            name = mapping['sensor']
                            point_data[name] = 0.0
                            if sample_idx == num_samples - 1:
                                self.sensor_status[name]['voltage'] = 0.0
                                self.sensor_status[name]['value'] = 0.0
                                self.sensor_status[name]['active'] = True
                            break
            
            # 右转速
            if freq2_ok and freq2_data is not None:
                right_freq = float(freq2_data[0] if isinstance(freq2_data, list) else freq2_data)
                
                for mapping in self.counter_mapping:
                    if mapping['channel'] == self.counter2:
                        name = mapping['sensor']
                        pulses = mapping.get('pulses_per_rev', self.pulses_per_rev)
                        scale = mapping.get('scale', 60.0)
                        value = float(right_freq * scale / pulses)
                        point_data[name] = value
                        
                        if sample_idx == num_samples - 1:
                            self.sensor_status[name]['voltage'] = right_freq
                            self.sensor_status[name]['value'] = value
                            self.sensor_status[name]['active'] = True
                        break
            else:
                if self.freq2_timeout_count > 2:
                    for mapping in self.counter_mapping:
                        if mapping['channel'] == self.counter2:
                            name = mapping['sensor']
                            point_data[name] = 0.0
                            if sample_idx == num_samples - 1:
                                self.sensor_status[name]['voltage'] = 0.0
                                self.sensor_status[name]['value'] = 0.0
                                self.sensor_status[name]['active'] = True
                            break
            
            # 保存这个采样点到批处理列表
            if self.current_record_id or self.saving:
                timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S.%f")[:-3]
                batch_points_to_save.append({
                    'timestamp': timestamp,
                    'data': point_data
                })
                
        # 批量执行保存操作（避免循环中频繁IO和数据库提交）
        if batch_points_to_save:
            self._save_batch_points(batch_points_to_save)
            
        # 更新缓冲区（使用最后一个采样点）
        self._update_buffers()
        return self.sensor_status
    
    def _save_batch_points(self, points_list):
        """批量保存数据点到文件和数据库"""
        # 保存到文件
        if self.saving and self.save_file:
            try:
                lines = []
                for p in points_list:
                    row = [p['timestamp']]
                    for name in self.column_order:
                        row.append(str(p['data'].get(name, 0)))
                    lines.append(','.join(row) + '\n')
                self.save_file.writelines(lines)
                self.save_file.flush()
            except Exception as e:
                logger.warning(f"保存数据点到文件失败: {e}")
        
        # 保存到数据库
        if self.current_record_id:
            try:
                from backend.database import db
                db.add_data_points_batch(self.current_record_id, points_list)
            except Exception as e:
                logger.warning(f"保存数据点到数据库失败: {e}")
                
    def _save_single_point(self, point_data):
        """保存单个数据点到文件和数据库"""
        from datetime import datetime
        
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S.%f")[:-3]
        
        # 保存到文件
        if self.saving and self.save_file:
            row = [timestamp]
            for name in self.column_order:
                row.append(str(point_data.get(name, 0)))
            self.save_file.write(','.join(row) + '\n')
            self.save_file.flush()
        
        # 保存到数据库
        if self.current_record_id:
            try:
                from backend.database import db
                db.add_data_point(self.current_record_id, timestamp, point_data)
            except Exception as e:
                logger.warning(f"保存数据点到数据库失败: {e}")
    
    def _update_buffers(self):
        """更新数据缓冲区"""
        idx = self.buffer_index % self.buffer_size
        for name in self.column_order:
            if name in self.data_buffers:
                self.data_buffers[name][idx] = self.sensor_status[name]['value']
        self.buffer_index += 1
    
    def get_statistics(self, sensor_name, window_size=100):
        """获取传感器统计数据"""
        if sensor_name not in self.data_buffers:
            return {'min': 0, 'max': 0, 'avg': 0, 'current': 0}
        
        buffer = self.data_buffers[sensor_name]
        start = max(0, self.buffer_index - window_size)
        end = self.buffer_index
        if start < end:
            data = buffer[start:end]
            return {
                'min': float(np.min(data)),
                'max': float(np.max(data)),
                'avg': float(np.mean(data)),
                'current': float(buffer[self.buffer_index - 1] if self.buffer_index > 0 else 0)
            }
        return {'min': 0, 'max': 0, 'avg': 0, 'current': 0}
    
    def get_waveform_data(self, sensor_name, num_points=100):
        """获取波形数据"""
        if sensor_name not in self.data_buffers:
            return []
        buffer = self.data_buffers[sensor_name]
        start = max(0, self.buffer_index - num_points)
        end = self.buffer_index
        if start < end:
            return buffer[start:end].tolist()
        return []
    
    def start_saving(self, filepath):
        """开始保存数据到 CSV，使用动态列头"""
        if self.saving:
            return
        self.saving = True
        self.save_file = open(filepath, 'w', encoding='utf-8')
        # 写入列头（timestamp + 按 column_order 顺序的传感器）
        header = ['timestamp'] + self.column_order
        self.save_file.write(','.join(header) + '\n')
        logger.info(f"开始保存数据到: {filepath}")
    
    def save_data_point(self):
        """保存单个数据点（根据当前传感器状态）"""
        if not self.saving or not self.save_file:
            return
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S.%f")[:-3]
        values = [str(self.sensor_status.get(name, {}).get('value', 0)) for name in self.column_order]
        line = timestamp + ',' + ','.join(values) + '\n'
        self.save_file.write(line)
        self.save_file.flush()
    
    def stop_saving(self):
        """停止保存数据"""
        self.saving = False
        if self.save_file:
            self.save_file.close()
            self.save_file = None
        
        # 同时完成数据库记录
        if self.current_record_id:
            from backend.database import db
            db.finish_data_record(self.current_record_id)
            self.current_record_id = None
        
        logger.info("停止数据保存")
    
    def start_db_saving(self, record_name, client_id=None):
        """开始数据库保存"""
        try:
            from backend.database import db
            sensor_count = len([s for s in self.sensor_status.values() if s.get('active', False)])
            self.current_record_id = db.create_data_record(record_name, sensor_count, client_id)
            logger.info(f"开始数据库保存，记录ID: {self.current_record_id}, 客户端: {client_id}")
            return True
        except Exception as e:
            logger.error(f"开始数据库保存失败: {e}")
            return False
    
    def save_data_point_to_db(self):
        """保存单个数据点到数据库"""
        if not self.current_record_id:
            return
        
        try:
            from backend.database import db
            from datetime import datetime
            
            timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S.%f")[:-3]
            sensor_data = {name: self.sensor_status.get(name, {}).get('value', 0) 
                          for name in self.column_order}
            
            db.add_data_point(self.current_record_id, timestamp, sensor_data)
        except Exception as e:
            logger.warning(f"保存数据点到数据库失败: {e}")
    
    def cleanup(self):
        """清理任务"""
        self.running = False
        if self.thread and self.thread.is_alive():
            self.thread.join(timeout=2)
        try:
            if self.ai_task:
                self.ai_task.stop()
                self.ai_task.close()
            if self.freq_task1:
                self.freq_task1.stop()
                self.freq_task1.close()
            if self.freq_task2:
                self.freq_task2.stop()
                self.freq_task2.close()
        except Exception as e:
            logger.error(f"清理任务失败: {e}")
        logger.info("传感器读取器已清理")


    # 在 SensorReader 类中添加
    def reload_config(self):
        """重新加载配置并重启采集任务（仅在物理映射变化时重启）"""
        logger.info("正在重新加载传感器配置...")
        
        # 保存旧配置用于对比
        old_ai_mapping = getattr(self, 'ai_mapping', []).copy()
        old_counter_mapping = getattr(self, 'counter_mapping', []).copy()
        
        # 加载新配置
        self.load_config()
        
        # 检查 AI 映射物理通道是否变化
        physical_changed = False
        
        # AI 映射检查
        if len(old_ai_mapping) != len(self.ai_mapping):
            physical_changed = True
        else:
            for i in range(len(self.ai_mapping)):
                # 只对比物理属性：channel, index
                if (old_ai_mapping[i].get('channel') != self.ai_mapping[i].get('channel') or 
                    old_ai_mapping[i].get('index') != self.ai_mapping[i].get('index')):
                    physical_changed = True
                    break
        
        # 计数器映射检查
        if not physical_changed:
            if len(old_counter_mapping) != len(self.counter_mapping):
                physical_changed = True
            else:
                for i in range(len(self.counter_mapping)):
                    if old_counter_mapping[i].get('channel') != self.counter_mapping[i].get('channel'):
                        physical_changed = True
                        break
        
        # 如果物理映射改变或任务未初始化，则重新初始化
        if physical_changed or not self.ai_task:
            logger.info("物理通道配置已更改或任务未初始化，正在重启硬件任务...")
            return self.initialize_tasks()
        else:
            # 仅逻辑参数（scale/offset/sensor_name）改变，更新缓冲区和状态即可
            logger.info("仅逻辑参数更改，无需重启硬件任务")
            self._init_sensor_buffers()
            # 确保 sensor_status 中的 active 状态正确
            for name in self.sensor_status:
                self.sensor_status[name]['active'] = True
            return True

# 创建全局单例
sensor_reader = SensorReader()

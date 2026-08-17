"""
阿尔泰采集卡设备管理模块
提供设备枚举、通道查询等功能
"""
import logging
import artdaq

logger = logging.getLogger('DeviceManager')

class DeviceManager:
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
        logger.info("设备管理器初始化完成")
    
    def get_devices(self):
        """
        获取所有可用的阿尔泰采集卡设备
        返回设备名称列表，如 ['Dev1', 'Dev2']
        """
        devices = []
        # 尝试常见的设备名
        possible_devices = ['Dev1', 'Dev2', 'Dev3', 'Dev4']
        for dev_name in possible_devices:
            try:
                # 尝试创建一个简单的任务来检测设备是否存在
                task = artdaq.Task()
                # 尝试添加一个AI通道
                task.ai_channels.add_ai_voltage_chan(f"{dev_name}/ai0")
                task.close()
                devices.append(dev_name)
                logger.info(f"发现设备: {dev_name}")
            except Exception:
                # 设备不存在或不可用，继续下一个
                try:
                    # 尝试计数器通道
                    task = artdaq.Task()
                    task.cio_channels.add_ci_freq_chan(f"{dev_name}/ctr0")
                    task.close()
                    devices.append(dev_name)
                    logger.info(f"发现设备: {dev_name}")
                except Exception:
                    continue
        logger.info(f"发现 {len(devices)} 个设备: {devices}")
        return devices
    
    def get_device_channels(self, device_name):
        """
        获取指定设备的所有可用通道
        返回格式: {'ai': ['ai0', 'ai1', ...], 'ctr': ['ctr0', 'ctr1', ...]}
        """
        result = {'ai': [], 'ctr': []}
        
        # 探测 AI 通道 (尝试 0-15)
        for i in range(16):
            try:
                task = artdaq.Task()
                task.ai_channels.add_ai_voltage_chan(f"{device_name}/ai{i}")
                result['ai'].append(f"ai{i}")
                task.close()
            except Exception:
                pass
        
        # 探测计数器通道 (尝试 0-7)
        for i in range(8):
            try:
                task = artdaq.Task()
                task.cio_channels.add_ci_freq_chan(f"{device_name}/ctr{i}")
                result['ctr'].append(f"ctr{i}")
                task.close()
            except Exception:
                pass
        
        logger.info(f"设备 {device_name} AI通道: {result['ai']}")
        logger.info(f"设备 {device_name} 计数器通道: {result['ctr']}")
        return result
    
    def test_device_connection(self, device_name):
        """
        测试设备连接是否正常
        返回 (success: bool, message: str)
        """
        try:
            # 先获取通道
            channels = self.get_device_channels(device_name)
            
            # 尝试 AI 通道
            if channels['ai']:
                task = artdaq.Task()
                task.ai_channels.add_ai_voltage_chan(f"{device_name}/{channels['ai'][0]}")
                task.start()
                data = task.read(number_of_samples_per_channel=1)
                task.stop()
                task.close()
                logger.info(f"设备 {device_name} 连接测试成功，读取值: {data}")
                return True, f"设备连接成功！AI通道读取值: {data}"
            
            # 尝试计数器通道
            elif channels['ctr']:
                task = artdaq.Task()
                task.cio_channels.add_ci_freq_chan(f"{device_name}/{channels['ctr'][0]}")
                task.start()
                task.stop()
                task.close()
                logger.info(f"设备 {device_name} 连接测试成功（计数器）")
                return True, "设备连接成功！（计数器通道正常）"
            
            else:
                return False, "设备没有可用的 AI 或计数器通道"
                
        except Exception as e:
            logger.error(f"设备 {device_name} 连接测试失败: {e}")
            return False, f"连接失败: {str(e)}"

# 创建全局单例
device_manager = DeviceManager()

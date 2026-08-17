# backend/health_calculator.py
from datetime import datetime

class HealthCalculator:
    def __init__(self, upper_preload=2.0, upper_critical=3.5,
                 lower_preload=2.0, lower_critical=3.5,
                 cycle_seconds=60):
        self.upper_preload = upper_preload
        self.upper_critical = upper_critical
        self.lower_preload = lower_preload
        self.lower_critical = lower_critical
        self.cycle_seconds = cycle_seconds

        # 周期累积变量
        self.upper_cycle_sum = 0
        self.upper_cycle_count = 0
        self.upper_cycle_min = float('inf')
        self.lower_cycle_sum = 0
        self.lower_cycle_count = 0
        self.lower_cycle_min = float('inf')

        self.last_upper_avg = 0
        self.last_lower_avg = 0
        self.cycle_count = 0
        self.upper_critical_avg = None
        self.lower_critical_avg = None
        self.prev_upper_below = None
        self.prev_lower_below = None

        # 当前健康度（初始100）
        self.current_health = {
            'upper_health': 100,
            'lower_health': 100,
            'system_health': 100,
            'upper_status': 'normal',
            'lower_status': 'normal'
        }
        # 最近完成的周期数据（用于故障关键信息图表）
        self.last_cycle_data = {
            'upper_avg': 0,
            'upper_min': 0,
            'lower_avg': 0,
            'lower_min': 0,
            'timestamp': None
        }

    def update(self, avg_point):
        """
        输入 avg_point 格式: {'upper_pressure': 2.34, 'lower_pressure': 2.28,
                              'left_rpm': 1450, 'right_rpm': 1438, ...}
        返回当前健康度字典
        """
        upper_p = avg_point.get('upper_pressure', 0)
        lower_p = avg_point.get('lower_pressure', 0)
        left_rpm = avg_point.get('left_rpm', 0)
        right_rpm = avg_point.get('right_rpm', 0)

        # 累积周期数据
        self.upper_cycle_sum += upper_p
        self.upper_cycle_count += 1
        self.upper_cycle_min = min(self.upper_cycle_min, upper_p)

        self.lower_cycle_sum += lower_p
        self.lower_cycle_count += 1
        self.lower_cycle_min = min(self.lower_cycle_min, lower_p)

        # 检查上周期完成
        upper_complete = self.upper_cycle_count >= self.cycle_seconds
        if upper_complete:
            avg_val = self.upper_cycle_sum / self.upper_cycle_count
            self.last_upper_avg = avg_val
            current_below = self.upper_cycle_min < self.upper_preload
            if self.prev_upper_below is not None:
                if self.prev_upper_below and not current_below:
                    if self.upper_critical_avg is None:
                        self.upper_critical_avg = avg_val
                elif not self.prev_upper_below and current_below:
                    if self.upper_critical_avg is None:
                        self.upper_critical_avg = avg_val
            self.prev_upper_below = current_below
            # 更新健康度
            self.current_health['upper_health'] = self._compute_health(
                avg_val, right_rpm > 0,
                self.upper_critical_avg or self.upper_critical,
                self.upper_preload, self.upper_critical
            )
            # 保存周期数据
            self.last_cycle_data['upper_avg'] = avg_val
            self.last_cycle_data['upper_min'] = self.upper_cycle_min
            self.last_cycle_data['timestamp'] = datetime.now().isoformat()
            # 重置上周期
            self.upper_cycle_sum = 0
            self.upper_cycle_count = 0
            self.upper_cycle_min = float('inf')
            self.cycle_count += 1

        # 检查下周期完成
        lower_complete = self.lower_cycle_count >= self.cycle_seconds
        if lower_complete:
            avg_val = self.lower_cycle_sum / self.lower_cycle_count
            self.last_lower_avg = avg_val
            current_below = self.lower_cycle_min < self.lower_preload
            if self.prev_lower_below is not None:
                if self.prev_lower_below and not current_below:
                    if self.lower_critical_avg is None:
                        self.lower_critical_avg = avg_val
                elif not self.prev_lower_below and current_below:
                    if self.lower_critical_avg is None:
                        self.lower_critical_avg = avg_val
            self.prev_lower_below = current_below
            self.current_health['lower_health'] = self._compute_health(
                avg_val, left_rpm > 0,
                self.lower_critical_avg or self.lower_critical,
                self.lower_preload, self.lower_critical
            )
            self.last_cycle_data['lower_avg'] = avg_val
            self.last_cycle_data['lower_min'] = self.lower_cycle_min
            self.last_cycle_data['timestamp'] = datetime.now().isoformat()
            self.lower_cycle_sum = 0
            self.lower_cycle_count = 0
            self.lower_cycle_min = float('inf')
            self.cycle_count += 1

        # 计算系统健康度
        if right_rpm > 0 and left_rpm > 0:
            system_health = min(self.current_health['upper_health'],
                                self.current_health['lower_health'])
        elif right_rpm > 0:
            system_health = self.current_health['upper_health']
        elif left_rpm > 0:
            system_health = self.current_health['lower_health']
        else:
            system_health = 100
        self.current_health['system_health'] = system_health
        self.current_health['upper_status'] = self._health_to_status(self.current_health['upper_health'])
        self.current_health['lower_status'] = self._health_to_status(self.current_health['lower_health'])

        return self.current_health.copy()

    def _compute_health(self, cycle_avg, has_rpm, critical_avg, preload, critical):
        if not has_rpm:
            return 100
        crit = critical_avg if critical_avg is not None else critical
        if cycle_avg <= preload:
            return 100
        elif cycle_avg < crit:
            health = 40 * (1 - (cycle_avg - preload) / (crit - preload)) + 60
            return max(0, min(100, health))
        elif cycle_avg == crit:
            return 60
        else:
            health = 60 * ((8 - cycle_avg) / (8 - crit))
            return max(0, min(100, health))

    def _health_to_status(self, health):
        if health < 50:
            return 'fault'
        elif health < 60:
            return 'warning'
        else:
            return 'normal'

    def get_last_cycle_data(self):
        """获取最近完成的周期数据（用于图表）"""
        return self.last_cycle_data
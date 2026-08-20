#!/usr/bin/env python3
"""
实时数据生成器 - 生成符合滚筒监测系统格式的CSV数据
严格匹配前端file-worker.js的15列解析规则：
0:timestamp, 1:left_rpm(下限位轮), 2:right_rpm(上限位轮),
3:left_rpm_voltage, 4:right_rpm_voltage, 5:0, 6:0,
7:upper_pressure(上限位轮压力), 8:lower_pressure(下限位轮压力), 9:eddy_current(位移),
10:motor1, 11:motor2, 12:motor3, 13:motor4, 14:0

设计说明：
- 压力信号：周期10秒的正弦波，中心值和幅度缓慢变化，整体范围3.0~6.2 MPa。
- 位移信号：由多个频率叠加，范围-8~8 mm，导数驱动转速。
- 转速：位移上升时上限位轮转，下降时下限位轮转，大小与导数成正比，限制在0~600 RPM。
- 采样率：1000 Hz（每秒1000行），持续写入文件，供系统实时监控。
"""

import numpy as np
import time
import csv
import argparse
import os

SAMPLE_RATE = 1000          # 采样率 1000 Hz
MAX_RPM = 600               # 最大转速 600 RPM

# ---------- 压力参数 ----------
PRESSURE_CENTER_MIN = 4.0   # 压力中心最小值
PRESSURE_CENTER_MAX = 5.0   # 压力中心最大值
PRESSURE_AMP_MIN = 1.0      # 压力幅度最小值
PRESSURE_AMP_MAX = 1.2      # 压力幅度最大值
PRESSURE_CYCLE = 10         # 压力周期 10秒

# ---------- 位移参数 ----------
DISPL_FREQS = [0.5, 1.2, 2.5]      # 位移频率 (Hz)
DISPL_AMPS = [5.0, 2.5, 1.5]       # 位移幅度 (mm)

def pressure_signal(rel_t):
    """
    生成压力信号（MPa），周期10秒，包络在3.0~6.2间移动
    """
    # 中心值缓慢变化（周期60秒）
    center_freq = 1 / 60
    center = PRESSURE_CENTER_MIN + (PRESSURE_CENTER_MAX - PRESSURE_CENTER_MIN) * (
                0.5 + 0.5 * np.sin(2 * np.pi * center_freq * rel_t))
    # 幅度缓慢变化（周期45秒）
    amp_freq = 1 / 45
    amp = PRESSURE_AMP_MIN + (PRESSURE_AMP_MAX - PRESSURE_AMP_MIN) * (
              0.5 + 0.5 * np.sin(2 * np.pi * amp_freq * rel_t))
    # 10秒正弦波
    sin_wave = np.sin(2 * np.pi * rel_t / PRESSURE_CYCLE)

    pressure = center + amp * sin_wave
    # 添加微小噪声
    pressure += np.random.normal(0, 0.02, len(rel_t))
    return np.clip(pressure, 3.0, 6.2)

def displacement_signal(rel_t):
    """
    生成位移信号（mm），范围约 -8~8
    """
    displ = np.zeros_like(rel_t)
    for a, f in zip(DISPL_AMPS, DISPL_FREQS):
        displ += a * np.sin(2 * np.pi * f * rel_t)
    return displ

def displacement_derivative(rel_t):
    """
    位移的导数 (mm/s)
    """
    deriv = np.zeros_like(rel_t)
    for a, f in zip(DISPL_AMPS, DISPL_FREQS):
        deriv += 2 * np.pi * f * a * np.cos(2 * np.pi * f * rel_t)
    return deriv

def generate_batch(start_time, num_points):
    """
    生成从 start_time 开始的连续 num_points 个数据点
    start_time: 绝对起始时间（用于时间戳）
    """
    # 相对时间（从0开始），用于物理量计算，确保每秒有明显变化
    rel_t = np.arange(num_points) / SAMPLE_RATE

    # ----- 压力（基于相对时间）-----
    pressure = pressure_signal(rel_t)
    upper_pressure = pressure
    lower_pressure = pressure

    # ----- 位移及其导数（基于相对时间）-----
    displacement = displacement_signal(rel_t)
    deriv = displacement_derivative(rel_t)

    # ----- 转速计算 -----
    # 估计最大导数，用于映射到 RPM
    max_deriv = sum(2 * np.pi * f * a for f, a in zip(DISPL_FREQS, DISPL_AMPS))
    rpm_magnitude = np.abs(deriv) / max_deriv * MAX_RPM
    rpm_magnitude = np.clip(rpm_magnitude, 0, MAX_RPM)

    # 死区阈值，避免微小抖动
    threshold = 0.5  # mm/s
    # 严格互斥：导数 > threshold 时正导数给 right_rpm，负导数给 left_rpm
    left_rpm = np.where(deriv < -threshold, rpm_magnitude, 0.0)
    right_rpm = np.where(deriv > threshold, rpm_magnitude, 0.0)

    # 添加少量噪声（仅加到已转动的轮上）
    left_rpm += np.random.normal(0, 2, num_points) * (left_rpm > 0)
    right_rpm += np.random.normal(0, 2, num_points) * (right_rpm > 0)
    left_rpm = np.clip(left_rpm, 0, MAX_RPM)
    right_rpm = np.clip(right_rpm, 0, MAX_RPM)

    # ----- 电压（600 RPM -> 5V）-----
    left_rpm_voltage = left_rpm / MAX_RPM * 5 + np.random.normal(0, 0.02, num_points)
    right_rpm_voltage = right_rpm / MAX_RPM * 5 + np.random.normal(0, 0.02, num_points)
    left_rpm_voltage[left_rpm == 0] = 0
    right_rpm_voltage[right_rpm == 0] = 0
    left_rpm_voltage = np.maximum(left_rpm_voltage, 0)
    right_rpm_voltage = np.maximum(right_rpm_voltage, 0)

    # ----- 电机电流（独立随机）-----
    motor_currents = np.array([
        5.2 + np.random.normal(0, 0.1, num_points),
        5.1 + np.random.normal(0, 0.1, num_points),
        5.3 + np.random.normal(0, 0.1, num_points),
        5.0 + np.random.normal(0, 0.1, num_points)
    ]).T

    # ----- 组合成行列表（时间戳使用绝对时间）-----
    abs_t = start_time + rel_t
    rows = []
    for i in range(num_points):
        row = [
            f"{abs_t[i]:.3f}",
            f"{left_rpm[i]:.3f}",
            f"{right_rpm[i]:.3f}",
            f"{left_rpm_voltage[i]:.3f}",
            f"{right_rpm_voltage[i]:.3f}",
            "0", "0",
            f"{upper_pressure[i]:.3f}",
            f"{lower_pressure[i]:.3f}",
            f"{displacement[i]:.3f}",
            f"{motor_currents[i,0]:.3f}",
            f"{motor_currents[i,1]:.3f}",
            f"{motor_currents[i,2]:.3f}",
            f"{motor_currents[i,3]:.3f}",
            "0"
        ]
        rows.append(row)
    return rows

def main():
    parser = argparse.ArgumentParser(description="实时数据生成器（压力周期10秒，位移驱动转速）")
    parser.add_argument("--output", type=str, default="live_data.csv",
                        help="输出文件路径 (默认: live_data.csv)")
    parser.add_argument("--rate", type=int, default=SAMPLE_RATE,
                        help=f"采样率 (默认: {SAMPLE_RATE} Hz)")
    args = parser.parse_args()

    output_file = args.output
    rate = args.rate
    batch_size = rate

    # 确保目录存在
    os.makedirs(os.path.dirname(output_file) or '.', exist_ok=True)

    print(f"开始生成数据，写入文件: {output_file}")
    print(f"采样率: {rate} Hz，每秒 {rate} 行")
    print("压力周期: 10秒，位移独立驱动转速")
    print("按 Ctrl+C 停止")

    # 以追加模式打开文件（自动创建）
    with open(output_file, 'a', newline='', encoding='utf-8') as f:
        writer = csv.writer(f)
        try:
            while True:
                now = time.time()
                rows = generate_batch(now, batch_size)
                writer.writerows(rows)
                f.flush()  # 立即写入磁盘，确保监控能读到
                print(f"已写入 {batch_size} 行，时间戳: {rows[0][0]} ~ {rows[-1][0]}")
                # 精确控制每秒写入一批，减去生成数据消耗的时间
                elapsed = time.time() - now
                sleep_time = 1.0 - elapsed
                if sleep_time > 0:
                    time.sleep(sleep_time)
        except KeyboardInterrupt:
            print("\n生成器停止")

if __name__ == "__main__":
    main()
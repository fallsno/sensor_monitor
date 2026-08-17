from flask import Blueprint, render_template, request, jsonify
from backend.config_manager import config_manager
from backend.modbus_collector import modbus_collector, list_serial_ports

try:
    import tkinter as tk
    from tkinter import filedialog
except Exception:  # pragma: no cover
    tk = None
    filedialog = None

modbus_bp = Blueprint('modbus', __name__)

def select_directory():
    if tk is None or filedialog is None:
        raise RuntimeError('Directory picker is unavailable in this environment')

    root = tk.Tk()
    root.withdraw()
    root.attributes('-topmost', True)
    try:
        return filedialog.askdirectory(title='选择 Modbus 保存目录')
    finally:
        root.destroy()

@modbus_bp.route('/modbus')
def modbus_page():
    return render_template('modbus.html')

@modbus_bp.route('/api/modbus/config', methods=['GET'])
def get_config():
    cfg = config_manager.get_config().get('modbus', {})
    return jsonify(cfg)

@modbus_bp.route('/api/modbus/ports', methods=['GET'])
def get_serial_ports():
    return jsonify({'ports': list_serial_ports()})

@modbus_bp.route('/api/modbus/config', methods=['POST'])
def set_config():
    data = request.json
    # Validate and update
    config_manager.update_section('modbus', data)
    return jsonify({"success": True, "message": "Config updated"})

@modbus_bp.route('/api/modbus/select-save-dir', methods=['POST'])
def select_save_dir():
    try:
        selected_path = select_directory()
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500

    if not selected_path:
        return jsonify({'success': False, 'cancelled': True})

    return jsonify({'success': True, 'path': selected_path})

@modbus_bp.route('/api/modbus/control', methods=['POST'])
def control():
    data = request.json
    action = data.get('action')
    if action == 'start':
        success, msg = modbus_collector.start()
        return jsonify({"success": success, "message": msg})
    elif action == 'stop':
        success, msg = modbus_collector.stop()
        return jsonify({"success": success, "message": msg})
    return jsonify({"success": False, "message": "Invalid action"}), 400

@modbus_bp.route('/api/modbus/data', methods=['GET'])
def get_data():
    return jsonify({
        "status": modbus_collector.status_msg,
        "is_running": modbus_collector.is_running,
        "latest": modbus_collector.latest_data
    })

@modbus_bp.route('/api/modbus/traffic', methods=['GET'])
def get_traffic():
    return jsonify({
        'success': True,
        'logs': modbus_collector.get_traffic_logs()
    })

@modbus_bp.route('/api/modbus/traffic/clear', methods=['POST'])
def clear_traffic():
    modbus_collector.clear_traffic_logs()
    return jsonify({'success': True})

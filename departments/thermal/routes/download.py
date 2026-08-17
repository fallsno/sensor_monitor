"""
客户端下载路由
- 提供打包好的客户端软件下载
"""
from flask import Blueprint, send_file, jsonify
import glob
import os
import logging

logger = logging.getLogger('DownloadRoute')

download_bp = Blueprint('download', __name__)

def get_client_package_path():
    """获取客户端包的路径"""
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    project_root = os.path.dirname(base_dir)
    search_dirs = [
        base_dir,
        os.path.join(base_dir, 'dist'),
        os.path.join(project_root, 'sensor_monitor'),
        os.path.join(project_root, 'sensor_monitor', 'dist')
    ]

    zip_candidates = []
    for search_dir in search_dirs:
        zip_candidates.extend(glob.glob(os.path.join(search_dir, 'sensor_monitor_client*.zip')))

    zip_candidates = [path for path in zip_candidates if os.path.isfile(path)]
    if zip_candidates:
        return max(zip_candidates, key=os.path.getmtime)

    exe_candidates = [
        os.path.join(base_dir, 'dist', 'app.exe'),
        os.path.join(project_root, 'sensor_monitor', 'dist', 'app.exe')
    ]
    for path in exe_candidates:
        if os.path.isfile(path):
            return path

    return None

@download_bp.route('/client', methods=['GET'])
def download_client():
    """下载客户端软件"""
    try:
        package_path = get_client_package_path()
        
        if not package_path:
            return jsonify({
                'success': False,
                'error': '客户端包未找到，请先运行 build_client.bat 进行打包'
            }), 404
        
        filename = os.path.basename(package_path)
        
        return send_file(
            package_path,
            as_attachment=True,
            download_name=filename,
            mimetype='application/octet-stream'
        )
    except Exception as e:
        logger.error(f"下载客户端失败: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@download_bp.route('/status', methods=['GET'])
def download_status():
    """检查客户端包是否可用"""
    try:
        package_path = get_client_package_path()
        available = package_path is not None
        
        result = {
            'success': True,
            'available': available
        }
        
        if available:
            result['filename'] = os.path.basename(package_path)
            result['size'] = os.path.getsize(package_path)
            result['modified'] = os.path.getmtime(package_path)
        
        return jsonify(result)
    except Exception as e:
        logger.error(f"检查下载状态失败: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

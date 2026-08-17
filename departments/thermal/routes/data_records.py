"""
数据记录管理路由
提供数据记录的列表、查看、下载、删除等功能
"""
from flask import Blueprint, request, jsonify, send_file
from backend.database import db
from datetime import datetime
import io
import logging

logger = logging.getLogger('DataRecords')

data_records_bp = Blueprint('data_records', __name__)

@data_records_bp.route('/list', methods=['GET'])
def get_records():
    """获取数据记录列表"""
    try:
        limit = request.args.get('limit', 50, type=int)
        client_id = request.args.get('client_id')
        records = db.get_data_records(limit, client_id)
        return jsonify({'success': True, 'records': records})
    except Exception as e:
        logger.error(f"获取记录列表失败: {e}")
        return jsonify({'success': False, 'message': str(e)}), 500

@data_records_bp.route('/<int:record_id>/points', methods=['GET'])
def get_points(record_id):
    """获取记录的数据点"""
    try:
        limit = request.args.get('limit', 10000, type=int)
        points = db.get_data_points(record_id, limit)
        return jsonify({'success': True, 'points': points})
    except Exception as e:
        logger.error(f"获取数据点失败: {e}")
        return jsonify({'success': False, 'message': str(e)}), 500

@data_records_bp.route('/<int:record_id>/delete', methods=['DELETE'])
def delete_record(record_id):
    """删除数据记录"""
    try:
        result = db.delete_data_record(record_id)
        if result:
            return jsonify({'success': True, 'message': '删除成功'})
        else:
            return jsonify({'success': False, 'message': '删除失败'}), 400
    except Exception as e:
        logger.error(f"删除记录失败: {e}")
        return jsonify({'success': False, 'message': str(e)}), 500

@data_records_bp.route('/<int:record_id>/download', methods=['GET'])
def download_record(record_id):
    """下载记录为 CSV"""
    try:
        csv_content = db.export_record_to_csv(record_id)
        if not csv_content:
            return jsonify({'success': False, 'message': '无数据可导出'}), 400
        
        # 获取记录名称
        records = db.get_data_records(100)
        record = next((r for r in records if r['id'] == record_id), None)
        filename = f"{record['record_name'] if record else 'data'}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"
        
        # 创建内存文件
        f = io.BytesIO()
        f.write(csv_content.encode('utf-8-sig'))
        f.seek(0)
        
        return send_file(
            f,
            mimetype='text/csv',
            as_attachment=True,
            download_name=filename
        )
    except Exception as e:
        logger.error(f"下载记录失败: {e}")
        return jsonify({'success': False, 'message': str(e)}), 500

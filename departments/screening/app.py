"""
筛分科室 · 独立产品服务入口（端口 5013）
========================================
在本科室目录内启动：

    cd departments/screening
    python app.py

当前为入口脚本骨架：提供本科室静态资源托管与占位首页。
工作界面与业务模块在本科室目录内后续开发（static/js/main.js 等）。
"""
import logging
from pathlib import Path

from flask import Flask, jsonify, render_template_string

BASE_DIR = Path(__file__).resolve().parent
DEPT_ID = 'screening'
DEPT_NAME = '筛分科室'
PORT = 5013

app = Flask(__name__, static_folder=str(BASE_DIR / 'static'), static_url_path='/static')
app.config['SECRET_KEY'] = 'screening-secret'

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger('ScreeningApp')

INDEX_HTML = """<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{{ dept_name }} · 独立服务</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: "Microsoft YaHei", "PingFang SC", sans-serif;
            background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
            min-height: 100vh; display: flex; align-items: center; justify-content: center;
            color: #e2e8f0;
        }
        .card {
            background: rgba(255, 255, 255, 0.06);
            border: 1px solid rgba(255, 255, 255, 0.12);
            border-radius: 16px; padding: 48px 56px; text-align: center;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.4); max-width: 520px;
        }
        .badge {
            display: inline-block; padding: 4px 14px; border-radius: 999px;
            background: rgba(16, 185, 129, 0.2); color: #34d399; font-size: 13px;
            letter-spacing: 1px; margin-bottom: 18px;
        }
        h1 { font-size: 28px; margin-bottom: 10px; }
        p { color: #94a3b8; font-size: 15px; line-height: 1.8; }
        .meta {
            margin-top: 22px; display: flex; justify-content: center; gap: 28px;
            font-size: 13px; color: #64748b;
        }
        .meta b { color: #e2e8f0; font-weight: 600; }
        .dev {
            margin-top: 26px; padding-top: 20px; border-top: 1px dashed rgba(255,255,255,0.12);
            font-size: 13px; color: #fbbf24;
        }
        .dev code {
            background: rgba(0,0,0,0.3); padding: 2px 8px; border-radius: 6px;
            font-family: Consolas, monospace; color: #fcd34d;
        }
    </style>
</head>
<body>
    <div class="card">
        <div class="badge">独立服务 · 已启动</div>
        <h1>{{ dept_name }}</h1>
        <p>筛分设备智能化工作界面开发中<br>本科室服务已就绪，静态资源从 <code>/static</code> 提供</p>
        <div class="meta">
            <span>科室 <b>{{ dept_id }}</b></span>
            <span>端口 <b>{{ port }}</b></span>
        </div>
        <div class="dev">开发入口：<code>static/js/main.js</code> · <code>static/css/main.css</code></div>
    </div>
</body>
</html>
"""


@app.route('/')
def index():
    """科室占位首页（工作界面后续开发）"""
    return render_template_string(INDEX_HTML, dept_name=DEPT_NAME, dept_id=DEPT_ID, port=PORT)


@app.route('/api/status')
def status():
    """服务健康检查"""
    return jsonify({'success': True, 'dept': DEPT_ID, 'name': DEPT_NAME, 'port': PORT})


def run_server(host='127.0.0.1', port=PORT):
    logging.info(f"启动{ DEPT_NAME }独立服务（端口 { port }）...")
    app.run(host=host, port=port)


if __name__ == '__main__':
    run_server(host='0.0.0.0', port=PORT)

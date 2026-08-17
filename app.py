"""
总体项目 · 智能化平台 —— 门户服务入口（端口 5010）
==================================================
根目录 app.py 只负责门户整体启动：
- 门户页 /portal：三科室智能化入口
- API /api/portal/departments：科室元信息（含各科室服务地址）

各科室产品为完全独立的服务，在各自目录内启动：
- 热工（滚筒检测系统）:  departments/thermal/app.py     端口 5011
- 搅拌:                    departments/mixing/app.py     端口 5012
- 筛分:                    departments/screening/app.py 端口 5013

科室服务地址配置：portal/config/portal_config.json
"""
import logging

from flask import Flask

from portal.portal import portal_bp

app = Flask(__name__)
app.config['SECRET_KEY'] = 'portal-secret'

# 注册门户蓝图（自带模板与静态资源：portal/templates、portal/static）
app.register_blueprint(portal_bp)

# 配置日志
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger('PortalApp')

def run_server(host='127.0.0.1', port=5010):
    logging.info("启动总体项目门户服务...")
    app.run(host=host, port=port)


if __name__ == '__main__':
    run_server(host='0.0.0.0', port=5010)

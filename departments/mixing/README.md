# 搅拌科室 · 独立产品项目

> 本目录是**搅拌科室**的独立产品项目，与热工（`departments/thermal/`）、筛分（`departments/screening/`）完全隔离，可在本科室目录内**独立启动、独立开发、独立部署**。

## 启动方式

```bash
cd departments/mixing
python app.py        # 端口 5012
```

- 门户（5010）通过 `portal/config/portal_config.json` 中 `mixing.route` 跳转至此。
- 本科室静态资源由本服务 `/static` 路由托管。

## 目录结构

```
departments/mixing/
├── app.py                    # ★ 独立服务入口（占位首页 + 静态托管，端口 5012）
├── static/
│   ├── js/
│   │   └── main.js           # 科室模块入口（工作界面后续在此开发）
│   ├── css/
│   │   └── main.css          # 科室自定义样式（仅作用于本科室界面）
│   └── images/               # 科室图片资源
└── README.md                 # 本说明
```

## 开发约定

1. **自包含原则**：搅拌科室的所有资源（含后端代码）放在本目录内，禁止引用其他科室（`departments/thermal/`、`departments/screening/`）的文件。
2. **服务形态**：`app.py` 为独立 Flask 服务，业务 API 在本科室内实现（如 `/api/...`），数据存储（数据库/配置文件）放在本科室目录内。
3. **工作界面**：首页当前为占位页，后续在 `static/js/main.js` 与 `static/css/main.css` 中开发本科室工作界面。
4. **静态资源 URL**：本目录 `static/` 下资源通过 `/static/<路径>` 访问（由本科室服务提供）。

## 独立开发

- 本目录可在不影响其他科室的前提下自由修改、提交、部署。
- 科室之间互不依赖；门户只做入口跳转，不读取本科室业务数据。

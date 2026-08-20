# 热工科室 · 独立产品项目（滚筒检测系统）

> 本目录是**热工科室**的完整智能化产品项目，即**滚筒检测系统**的全部代码。
>
> 热工科室入口（门户中「热工」卡片）直接进入滚筒检测系统首页 `/`。

## 目录结构

```
departments/thermal/
├── app.py                  # 滚筒检测系统主入口（总体项目 app.py 挂载本产品）
├── routes/                 # 业务路由（控制/配置/数据/监控/记录/客户端/下载/Modbus）
├── backend/                # 核心逻辑（配置管理/数据采集/数据库/设备管理/健康度...）
├── socket_handlers/        # WebSocket 实时通信
├── background/             # 后台线程（数据读取/文件监控）
├── artdaq/                 # 采集卡驱动
├── templates/              # 系统页面模板（index/3d_view/modbus）
├── static/                 # 系统前端资源（js/css/images/models/webfonts/draco）
├── config/                 # 系统配置（SQLite 数据库、版本、客户端配置）
├── data/                   # 采集数据输出目录
├── desktop_app/            # （桌面打包见根目录 desktop_app/）
├── tests/  scripts/  Samples/
├── package.json            # 前端依赖（draco3d 3D 查看器）
└── README.md               # 本说明
```

## 说明

- **热工 = 滚筒检测系统**：本目录即滚检系统全部代码，后续热工相关更新全部在本目录内进行。
- **入口方式**：
  - 门户「热工」卡片 → 302 重定向到 `/`（滚检系统首页）
  - 直接访问 `/` 即滚筒检测系统
- **与总体项目关系**：总体项目根目录 `app.py` 通过 `sys.path` 挂载本目录的 `routes/backend/...` 各包，模板/静态目录也指向本目录。
- **配置与数据**：SQLite 数据库 `config/sensor_monitor.db`、数据输出 `data/` 均在本目录内。

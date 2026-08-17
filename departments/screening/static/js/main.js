/**
 * 筛分科室 · 智能化工作界面 — 科室子项目入口
 * ================================================
 * 本目录为筛分科室的独立子项目，与搅拌/热工科室完全隔离，可同步独立开发。
 *
 * 开发约定：
 * 1. 所有筛分科室资源放在本目录（js/ css/ images/ 等），禁止引用其他科室资源
 * 2. 通过 DeptWorkbench.registerModule() 注册模块：
 *    DeptWorkbench.registerModule({
 *      id: 'screeningOverview',  // 覆盖内置通用模块可用相同 id（如 'overview'）
 *      title: '筛分设备',
 *      icon: 'fa-filter',        // FontAwesome 图标
 *      group: '筛分科室模块',     // 导航分组名
 *      render: (container, ctx) => {
 *        // ctx: { deptId, workbench }
 *        container.innerHTML = '...';
 *      }
 *    });
 */
(function () {
    'use strict';

    // ==================== 筛分科室模块 ====================

    // 示例模块：筛分设备概览
    DeptWorkbench.registerModule({
        id: 'screeningOverview',
        title: '筛分设备',
        icon: 'fa-filter',
        group: '筛分科室模块',
        render: (container, ctx) => {
            container.innerHTML = `
                <div class="wb-module-header">
                    <h2><i class="fas fa-filter"></i> 筛分设备概览</h2>
                </div>
                <div class="wb-placeholder">
                    <i class="fas fa-filter"></i>
                    <h3>筛分科室模块待开发</h3>
                    <p>此模块由筛分科室自行开发。<br>
                    编辑 <code>departments/screening/static/js/main.js</code> 即可扩展本科室的业务功能。</p>
                </div>`;
        },
    });
})();

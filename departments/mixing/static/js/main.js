/**
 * 搅拌科室 · 智能化工作界面 — 科室子项目入口
 * ================================================
 * 本目录为搅拌科室的独立子项目，与热工/筛分科室完全隔离，可同步独立开发。
 *
 * 开发约定：
 * 1. 所有搅拌科室资源放在本目录（js/ css/ images/ 等），禁止引用其他科室资源
 * 2. 通过 DeptWorkbench.registerModule() 注册模块：
 *    DeptWorkbench.registerModule({
 *      id: 'mixingOverview',     // 覆盖内置通用模块可用相同 id（如 'overview'）
 *      title: '搅拌设备',
 *      icon: 'fa-blender',       // FontAwesome 图标
 *      group: '搅拌科室模块',     // 导航分组名
 *      render: (container, ctx) => {
 *        // ctx: { deptId, workbench }
 *        container.innerHTML = '...';
 *      }
 *    });
 * 3. 复杂模板可放 templates/dept/mixing/ 下，用 ctx.workbench 提供的方法加载
 */
(function () {
    'use strict';

    // ==================== 搅拌科室模块 ====================

    // 示例模块：搅拌设备概览
    DeptWorkbench.registerModule({
        id: 'mixingOverview',
        title: '搅拌设备',
        icon: 'fa-blender',
        group: '搅拌科室模块',
        render: (container, ctx) => {
            container.innerHTML = `
                <div class="wb-module-header">
                    <h2><i class="fas fa-blender"></i> 搅拌设备概览</h2>
                </div>
                <div class="wb-placeholder">
                    <i class="fas fa-blender"></i>
                    <h3>搅拌科室模块待开发</h3>
                    <p>此模块由搅拌科室自行开发。<br>
                    编辑 <code>departments/mixing/static/js/main.js</code> 即可扩展本科室的业务功能。</p>
                </div>`;
        },
    });
})();

// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import mermaid from "mermaid"

const RECENT_COMMITS_MINDMAP = `mindmap
  root((最近 20 条提交))
    整体概览
      时间跨度
        2026-07-10 至 2026-08-13
      提交类型
        feat 9 条
        fix 6 条
        style 2 条
        perf 1 条
        chore 1 条
        其他 1 条
      改动规模
        55 个文件
        新增 4648 行
        删除 3210 行

    移动端开店流程
      申请与审核分流
        16dcb17 按 shareParent 选择流程
      开通方式选择
        d130a0c 支持重新选择
        90860ac 优化选择交互
        608780d 调整浮层文案
        6404763 优化提示文案
      数据与状态校验
        5bcfae9 校验母店开通状态
        6cba58d 兼容数字型 applyId

    停车管控与坐标
      移动端停车状态
        fb782f4 增加点位违停状态
        6314f18 优化坐标展示
        6d72aa7 兼容违停字段协议
      PC 端审核
        f789a1d 增加停车管控状态
      预警规则
        89a17fb 增加限停提示阈值
      经纬度标准化
        e19ec05 统一详情经纬度展示

    异常门店看板
      d51739e
        新增异常门店统计页面
        补充路由、权限和菜单
        增加 API 接口
      266bf9c
        展示异常门店经纬度

    品牌与审核体验
      品牌入口
        a5f2dbd 品牌展示优化
        1cf059d 暂停拉瓦萨入口
        8586da2 优化品牌选择
      开店审核
        8586da2 优化车速取审核展示
        2acd456 优化筛选区布局
        2f33319 限制已开通申请的图片同步
`

describe("Mermaid mindmap compatibility", () => {
  it("parses the recent-commit mindmap emitted by providers", async () => {
    await expect(mermaid.parse(RECENT_COMMITS_MINDMAP)).resolves.toMatchObject({
      diagramType: "mindmap"
    })
  })
})

# 项目 6 的 SAM3 预标注与 Label Studio 交互流程

## 1. 总体链路

```text
浏览器 / 标注界面
        |
        | 读取任务、展示 predictions / annotations
        v
Label Studio 前端（Data Manager + Editor）
        |
        | 请求任务 / 读取项目配置
        v
Label Studio 后端
        |
        | HTTP: /health /setup /predict
        v
本地 SAM3 ML Backend (127.0.0.1:9090)
        |
        | 调用本机 sam3 代码 + 本地权重
        v
SAM3 模型推理
        |
        | 返回矩形框预测结果
        v
Label Studio 后端保存/读取 Prediction
        |
        v
前端将 prediction 作为预标注候选展示
```

## 2. 当前项目里的关键概念

- `Model`：指一个“在线连接的模型服务”，例如当前的 `SAM3 Local`
- `Prediction`：指模型对具体任务已经生成出的预测结果
- `model_version`：用于把某批 prediction 归属到某个模型版本名，例如 `sam3.1_multiplex`

结论：

- `Model` 是“预测的来源”
- `Prediction` 是“已经产出的结果”
- 两者有关联，但不是一回事

## 3. Settings -> Annotation 里的模型选择是什么意思

`Select which predictions or which model you want to use`

这个选择器会把项目的 `model_version` 设成一个字符串。这个字符串既可以来自：

- 在线模型标题（Models 组）
- 已落库预测的版本名（Predictions 组）

前端在任务进入标注页时，会优先寻找：

- `task.predictions` 里 `createdBy === project.model_version` 的那条 prediction

如果找不到，才退回到第一条 prediction。

## 4. 何时触发模型预测

当前接入里主要有两种触发方式：

1. 连接模型时
- Label Studio 调用 `/health` 和 `/setup`
- 目的是确认模型在线，并让模型读取项目标注配置

2. 测试或显式请求预测时
- Label Studio 调用 `/predict`
- 请求里包含任务数据和项目标注配置

说明：

- 现在这版不是“每次打开图片都实时调用 SAM3”
- 更准确地说，界面展示的是任务里已有的 `predictions`
- 当任务已有 prediction 时，前端直接读取并显示它们

## 5. 为什么从“标注全部任务 / 按当前列表筛选标注”进去时看不到 prediction 卡片

当前标注流（label stream）和普通 explorer 标注页不完全一样：

- explorer 模式会带 `predictions:tabs`
- label stream 模式默认不会显示 prediction tabs

但如果项目开启了“使用预测结果预标注任务”，并且任务存在 prediction，label stream 会尝试：

- 用 prediction 自动生成一个“可编辑 annotation”

也就是说：

- 在 label stream 里，prediction 更像“起始草稿”
- 而不是右侧单独可切换的 prediction 卡片

## 6. 为什么有时看不到别人的标注结果

这取决于项目角色和项目设置：

- 审核员通常可以查看其他人的 annotation
- 标注员是否能看别人的 annotation，受 `hide_annotations_for_annotators` 控制

因此：

- “别人的标注结果”
- “模型 prediction”

在界面和权限上是两套逻辑，不能混为一谈

## 7. 当前项目 6 的推荐操作

如果希望标注员进入任务时，直接基于模型结果修改并提交自己的结果：

1. 在 `Settings -> Annotation` 开启“使用预测结果预标注任务”
2. 在模型选择器中选中 `SAM3 Local` 或 `sam3.1_multiplex`
3. 从标注流进入任务
4. 系统应把 matching prediction 转成一个可编辑 annotation
5. 标注员在此基础上修改并提交

## 8. 当前实现状态

- 本地 ML backend：已接通
- 项目 6：已注册 `SAM3 Local`
- 预测类型：当前为 `RectangleLabels`
- 交互式分割：暂未接入

## 9. 后续可继续优化

- 在 label stream 中显式增加 “prediction 来源” 提示
- 允许在标注流中切换不同 prediction / model_version
- 把 SAM3 从矩形框预测升级为交互式分割预标注

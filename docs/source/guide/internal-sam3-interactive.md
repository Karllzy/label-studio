# SAM3 交互式预标注

当前本地 SAM3 ML backend 已支持通过 Label Studio 的 `context.result` 接收点提示，并返回：

- `PolygonLabels`
- `BrushLabels`
- `RectangleLabels`（兼容旧项目）

## 当前推荐配置

第一阶段推荐使用：

- 输入：`KeyPointLabels` 智能工具
- 输出：`PolygonLabels` 或 `BrushLabels`

示例一：点提示 + Polygon

```xml
<View>
  <Image name="image" value="$image"/>

  <KeyPointLabels name="prompt" toName="image" smart="true">
    <Label value="Airplane" background="#3b82f6"/>
    <Label value="Car" background="#ef4444"/>
  </KeyPointLabels>

  <PolygonLabels name="label" toName="image">
    <Label value="Airplane" background="#3b82f6"/>
    <Label value="Car" background="#ef4444"/>
  </PolygonLabels>
</View>
```

示例二：点提示 + Brush

```xml
<View>
  <Image name="image" value="$image"/>

  <KeyPointLabels name="prompt" toName="image" smart="true">
    <Label value="Airplane" background="#3b82f6"/>
    <Label value="Car" background="#ef4444"/>
  </KeyPointLabels>

  <BrushLabels name="label" toName="image">
    <Label value="Airplane" background="#3b82f6"/>
    <Label value="Car" background="#ef4444"/>
  </BrushLabels>
</View>
```

## 使用要求

项目模型设置里需要：

- 连接到 `http://127.0.0.1:9090`
- 开启 `Interactive preannotations`

标注界面里需要：

- 开启 `Auto-annotation`

## 当前后端行为

当 Label Studio 发送 `/predict` 请求时：

1. 普通模式：没有 `context.result`
   - 按原有方式做整图预测

2. 交互模式：有 `context.result`
   - 读取 `params.context` 或顶层 `context`
   - 提取其中的 `keypoint` / `keypointlabels`
   - 将点坐标转换为 SAM3 point prompt
   - 如果点结果里的标签名与输出标签一致，则只预测该标签
   - 否则回退为对当前项目全部标签做预测

## 当前限制

- 已接入正负点字段：`is_positive`
- 还没有做文本提示输入 UI
- 还没有做多轮缓存优化，当前每次交互仍会重新走单次图像推理流程

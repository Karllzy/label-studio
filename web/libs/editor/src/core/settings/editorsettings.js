export default {
  enableHotkeys: {
    newUI: {
      title: "标注快捷键",
      description: "启用后可使用快捷键快速选择标签与执行常用操作",
    },
    description: "启用标注快捷键",
    onChangeEvent: "toggleHotkeys",
    defaultValue: true,
  },
  enableTooltips: {
    newUI: {
      title: "在提示中显示快捷键",
      description: "在工具和操作提示中显示对应快捷键",
    },
    description: "显示快捷键提示",
    onChangeEvent: "toggleTooltips",
    checked: "",
    defaultValue: false,
  },
  enableLabelTooltips: {
    newUI: {
      title: "在标签上显示快捷键",
      description: "在标签项上显示对应快捷键",
    },
    description: "显示标签快捷键提示",
    onChangeEvent: "toggleLabelTooltips",
    defaultValue: true,
  },
  showLabels: {
    newUI: {
      title: "显示区域标签",
      description: "在标注区域上显示标签名称",
    },
    description: "在区域内部显示标签",
    onChangeEvent: "toggleShowLabels",
    defaultValue: false,
  },
  continuousLabeling: {
    newUI: {
      title: "连续标注",
      description: "创建一个区域后保持当前标签选中，便于连续绘制",
    },
    description: "创建区域后保持标签选中",
    onChangeEvent: "toggleContinuousLabeling",
    defaultValue: false,
  },
  selectAfterCreate: {
    newUI: {
      title: "创建后自动选中区域",
      description: "创建新区域后自动选中该区域",
    },
    description: "创建后选中区域",
    onChangeEvent: "toggleSelectAfterCreate",
    defaultValue: false,
  },
  showLineNumbers: {
    newUI: {
      tags: "文本",
      title: "显示行号",
      description: "在文本中显示行号，便于定位具体内容",
    },
    description: "为文本显示行号",
    onChangeEvent: "toggleShowLineNumbers",
    defaultValue: false,
  },
  preserveSelectedTool: {
    newUI: {
      tags: "图像",
      title: "保持当前工具",
      description: "跨任务保留当前选中的绘制工具",
    },
    description: "记住当前工具",
    onChangeEvent: "togglepreserveSelectedTool",
    defaultValue: true,
  },
  enableSmoothing: {
    newUI: {
      tags: "图像",
      title: "缩放时平滑图像",
      description: "放大图像时对像素边缘进行平滑处理",
    },
    description: "缩放时启用图像平滑",
    onChangeEvent: "toggleSmoothing",
    defaultValue: true,
  },
  invertedZoom: {
    newUI: {
      tags: "图像",
      title: "反转缩放方向",
      description: "反转滚轮缩放方向",
    },
    description: "启用反向缩放",
    onChangeEvent: "toggleInvertedZoom",
    defaultValue: false,
  },
};

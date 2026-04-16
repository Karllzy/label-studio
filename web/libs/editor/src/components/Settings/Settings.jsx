import React, { useMemo } from "react";
import { Modal, Table, Tabs } from "antd";
import { observer } from "mobx-react";

import { Hotkey } from "../../core/Hotkey";

import "./Settings.prefix.css";
import { cn } from "../../utils/bem";
import EditorSettings from "../../core/settings/editorsettings";
import * as TagSettings from "./TagSettings";
import { IconClose } from "@humansignal/icons";
import { Toggle } from "@humansignal/ui";
import { ff } from "@humansignal/core";

const HOTKEY_NAMESPACE_NAMES = {
  global: "全局快捷键",
  AppStore: "全局快捷键",
  Annotations: "标注",
  RegionStore: "区域",
  TimeSeries: "时间序列分段",
  "Time Series Segmentation": "时间序列分段",
  "TimeSeries Navigation": "时间序列导航",
  Vectors: "矢量工具",
  SegmentationToolbar: "分割工具",
  "Segmentation Tools": "分割工具",
  Polygons: "多边形",
  Image: "图像",
  Audio: "音频分段",
  "Audio Segmentation": "音频分段",
  Repeater: "翻页",
};

const HOTKEY_DESCRIPTION_MAP = {
  "Back for one second": "后退 1 秒",
  "Play/pause": "播放/暂停",
  "Go one step back": "后退一步",
  "Go one step forward": "前进一步",
  "Increase region to the left": "向左扩大区域",
  "Increase region to the right": "向右扩大区域",
  "Decrease region on the left": "缩小区域左侧",
  "Decrease region on the right": "缩小区域右侧",
  "Pan time series view to the left": "时间序列视图向左平移",
  "Pan time series view to the right": "时间序列视图向右平移",
  "Pan time series view to the left (large step)": "时间序列视图向左大步平移",
  "Pan time series view to the right (large step)": "时间序列视图向右大步平移",
  "Submit annotation": "提交标注",
  "Skip task": "跳过任务",
  Undo: "撤销",
  Redo: "重做",
  "Delete all regions": "删除全部区域",
  "Focus first focusable region": "聚焦到第一个可操作区域",
  "Create relation between regions": "在区域之间创建关系",
  "Toggle selected region visibility": "切换所选区域可见性",
  "Toggle all regions visibility": "切换全部区域可见性",
  "Lock selected region": "锁定所选区域",
  "Edit selected region meta": "编辑所选区域元数据",
  "Unselect region": "取消选中区域",
  "Exit relation mode, unselect region": "退出关系模式并取消选中区域",
  "Delete selected region": "删除所选区域",
  "Cycle through regions": "在区域间循环切换",
  "Duplicate selected region": "复制所选区域",
  "Go to previous keyframe": "跳到上一关键帧",
  "Go to next keyframe": "跳到下一关键帧",
  "Go back": "后退",
  "Go to first frame": "跳到第一帧",
  "Go forward": "前进",
  "Go to last frame": "跳到最后一帧",
  "Hop Backward": "快速后退",
  "Hop Forward": "快速前进",
  "Next Page": "下一页",
  "Previous Page": "上一页",
  "Previous Image": "上一张图片",
  "Next Image": "下一张图片",
  "Zoom in on the image": "放大图片",
  "Pan around the image": "平移图片视图",
  "Zoom to fit the full image in view": "缩放到完整图片适配视图",
  "Zoom to actual image size (100%)": "缩放到图片实际尺寸（100%）",
  "Zoom out of the image": "缩小图片",
  "Select the ellipse tool": "选择椭圆工具",
  "Select the eraser tool": "选择橡皮擦工具",
  "Use the auto-detect tool to automatically suggest regions": "使用自动检测工具自动建议区域",
};

const translateHotkeyDescription = (description) => HOTKEY_DESCRIPTION_MAP[description] ?? description;
const translateHotkeyNamespace = (namespace, description) =>
  HOTKEY_NAMESPACE_NAMES[namespace] ?? HOTKEY_NAMESPACE_NAMES[description] ?? description ?? namespace;

const isRenderableComponent = (component) => {
  return typeof component === "function" || (typeof component === "object" && component !== null && "$$typeof" in component);
};

const HotkeysDescription = () => {
  const columns = [
    { title: "快捷键", dataIndex: "combo", key: "combo" },
    { title: "说明", dataIndex: "descr", key: "descr" },
  ];

  const keyNamespaces = Hotkey.namespaces();

  const getData = (descr) =>
    Object.keys(descr)
      .filter((k) => descr[k])
      .map((k) => ({
        key: k,
        combo: k.split(",").map((keyGroup) => {
          return (
            <div className={cn("keys").elem("key-group").toClassName()} key={keyGroup}>
              {keyGroup
                .trim()
                .split("+")
                .map((keyName) => (
                  <kbd className={cn("keys").elem("key").toClassName()} key={keyName}>
                    {keyName}
                  </kbd>
                ))}
            </div>
          );
        }),
        descr: translateHotkeyDescription(descr[k]),
      }));

  return (
    <div className={cn("keys").toClassName()}>
      <Tabs size="small">
        {Object.entries(keyNamespaces).map(([ns, data]) => {
          if (Object.keys(data.descriptions).length === 0) return null;

          return (
            <Tabs.TabPane key={ns} tab={translateHotkeyNamespace(ns, data.description)}>
              <Table columns={columns} dataSource={getData(data.descriptions)} size="small" />
            </Tabs.TabPane>
          );
        })}
      </Tabs>
    </div>
  );
};

const newUI = { newUI: true };

const editorSettingsKeys = Object.keys(EditorSettings).filter((key) => {
  const flag = EditorSettings[key].flag;
  return flag ? ff.isActive(flag) : true;
});

const enableTooltipsIndex = editorSettingsKeys.indexOf("enableTooltips");
const enableLabelTooltipsIndex = editorSettingsKeys.indexOf("enableLabelTooltips");

const tmp = editorSettingsKeys[enableTooltipsIndex];

editorSettingsKeys[enableTooltipsIndex] = editorSettingsKeys[enableLabelTooltipsIndex];
editorSettingsKeys[enableLabelTooltipsIndex] = tmp;

const SettingsTag = ({ children }) => {
  return <div className={cn("settings-tag").toClassName()}>{children}</div>;
};

const GeneralSettings = observer(({ store }) => {
  return (
    <div className={cn("settings").mod(newUI).toClassName()}>
      {editorSettingsKeys.map((obj, index) => {
        return (
          <label className={cn("settings").elem("field").toClassName()} key={index}>
            <>
              <div className={cn("settings__label").toClassName()}>
                <div className={cn("settings__label").elem("title").toClassName()}>
                  {EditorSettings[obj].newUI.title}
                  {EditorSettings[obj].newUI.tags?.split(",").map((tag) => (
                    <SettingsTag key={tag}>{tag}</SettingsTag>
                  ))}
                </div>
                <div className={cn("settings__label").elem("description").toClassName()}>
                  {EditorSettings[obj].newUI.description}
                </div>
              </div>
              <Toggle
                key={index}
                checked={store.settings[obj]}
                onChange={store.settings[EditorSettings[obj].onChangeEvent]}
                description={EditorSettings[obj].description}
              />
            </>
          </label>
        );
      })}
    </div>
  );
});

const settingsTabs = {
  General: { name: "通用", component: GeneralSettings },
  Hotkeys: { name: "快捷键", component: HotkeysDescription },
};

const DEFAULT_ACTIVE = Object.keys(settingsTabs)[0];

const DEFAULT_MODAL_SETTINGS = {
  name: "settings-modal",
  title: "标注界面设置",
  closeIcon: <IconClose />,
};

export default observer(({ store }) => {
  const availableSettings = useMemo(() => {
    const availableTags = Object.values(store.annotationStore.names.toJSON());
    const settingsScreens = Object.values(TagSettings).filter(isRenderableComponent);

    return availableTags.reduce((res, tagName) => {
      const tagType = store.annotationStore.names.get(tagName).type;
      const settings = settingsScreens.find(({ tagName: settingsTagName }) => {
        return typeof settingsTagName === "string" && settingsTagName.toLowerCase() === tagType.toLowerCase();
      });

      if (settings) res.push(settings);

      return res;
    }, []);
  }, [store]);

  return (
    <Modal
      className={cn(DEFAULT_MODAL_SETTINGS.name).toClassName()}
      open={store.showingSettings}
      onCancel={store.toggleSettings}
      footer=""
      title={DEFAULT_MODAL_SETTINGS.title}
      closeIcon={DEFAULT_MODAL_SETTINGS.closeIcon}
      bodyStyle={DEFAULT_MODAL_SETTINGS.bodyStyle}
    >
      <Tabs defaultActiveKey={DEFAULT_ACTIVE}>
        {Object.entries(settingsTabs).map(([key, { name, component }]) => {
          if (!isRenderableComponent(component)) return null;

          return (
            <Tabs.TabPane tab={name} key={key}>
              {React.createElement(component, { store })}
            </Tabs.TabPane>
          );
        })}
        {availableSettings.map((Page, index) => (
          <Tabs.TabPane tab={Page.title ?? `设置 ${index + 1}`} key={Page.tagName ?? `page-${index}`}>
            <Page store={store} />
          </Tabs.TabPane>
        ))}
      </Tabs>
    </Modal>
  );
});

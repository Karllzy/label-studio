import type { TipsCollection } from "./types";

const docs = (path: string) => `https://labelstud.io/${path.replace(/^\//, "")}`;

/** 中文版提示：弱化商业推广，以使用说明为主 */
export const defaultTipsCollection: TipsCollection = {
  projectCreation: [
    {
      title: "小技巧",
      content: "可用标注模板快速生成界面；也可在「标注设置」里用类 XML 配置自定义界面。",
      closable: true,
      link: { label: "查看文档", url: docs("guide/setup"), params: { experiment: "tips", treatment: "setup" } },
    },
    {
      title: "小技巧",
      content: "导入数据后，在数据管理页可用筛选与排序整理任务；未指定排序时默认按项目内序号排列。",
      closable: true,
      link: { label: "查看文档", url: docs("guide/tasks"), params: { experiment: "tips", treatment: "tasks" } },
    },
  ],
  organizationPage: [
    {
      title: "小技巧",
      content: "在项目中为成员分配合适角色，便于控制谁能导入数据、谁能标注。",
      closable: true,
      link: { label: "查看文档", url: docs("guide/"), params: { experiment: "tips", treatment: "roles" } },
    },
  ],
  projectSettings: [
    {
      title: "小技巧",
      content: "可连接机器学习后端做预标注或主动学习，减少重复劳动。",
      closable: true,
      link: { label: "查看文档", url: docs("guide/ml"), params: { experiment: "tips", treatment: "ml" } },
    },
    {
      title: "小技巧",
      content: "数据管理支持按「标注人」等字段筛选；每位登录用户在本机的筛选与侧栏状态互不干扰。",
      closable: true,
      link: { label: "查看文档", url: docs("guide/"), params: { experiment: "tips", treatment: "filters" } },
    },
  ],
};

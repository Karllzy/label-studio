import { useCallback, useEffect, useState } from "react";
import { Button } from "@humansignal/ui";
import { useAPI } from "../../providers/ApiProvider";
import { useProject } from "../../providers/ProjectProvider";
import { cn } from "../../utils/bem";
import { Spinner } from "../../components";
import "./WorkflowSettings.prefix.css";

const rootClass = cn("workflow-settings");

export const WorkflowSettings = () => {
  const api = useAPI();
  const { project } = useProject();
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const fetchWorkflow = useCallback(async () => {
    if (!project?.id) return;
    setLoading(true);
    const response = await api.callApi("projectWorkflow", {
      params: { pk: project.id },
    });
    if (response) {
      setConfig(response);
    }
    setLoading(false);
  }, [api, project?.id]);

  useEffect(() => {
    fetchWorkflow();
  }, [fetchWorkflow]);

  const handleSave = useCallback(async () => {
    if (!config) return;
    setSaving(true);
    await api.callApi("updateProjectWorkflow", {
      params: { pk: project.id },
      body: config,
    });
    setSaving(false);
  }, [api, project?.id, config]);

  const updateField = (field, value) => {
    setConfig(prev => ({ ...prev, [field]: value }));
  };

  if (loading || !config) return <Spinner />;

  return (
    <div className={rootClass.toClassName()}>
      <h3>工作流配置</h3>
      <p className={rootClass.elem("description").toClassName()}>
        配置任务分配方式、审核流程和标注员可见性设置。
      </p>

      <div className={rootClass.elem("section").toClassName()}>
        <div className={rootClass.elem("field").toClassName()}>
          <label>任务分配模式</label>
          <select
            value={config.task_assignment_mode}
            onChange={(e) => updateField("task_assignment_mode", e.target.value)}
          >
            <option value="self_pick">自选领取 — 标注员从任务池自主选择</option>
            <option value="auto_round_robin">自动轮询 — 系统按轮询分配给标注员</option>
            <option value="manual">手动分配 — 项目管理员手动指定</option>
          </select>
        </div>

        <div className={rootClass.elem("field").toClassName()}>
          <label className={rootClass.elem("checkbox-label").toClassName()}>
            <input
              type="checkbox"
              checked={config.require_review}
              onChange={(e) => updateField("require_review", e.target.checked)}
            />
            启用审核流程 — 标注提交后需审核员批准
          </label>
        </div>

        {config.require_review && (
          <div className={rootClass.elem("field").toClassName()}>
            <label>驳回流向</label>
            <select
              value={config.reject_flow_mode}
              onChange={(e) => updateField("reject_flow_mode", e.target.value)}
            >
              <option value="back_to_same">退回原标注员 — 被驳回的标注退回给原标注员重做</option>
              <option value="back_to_pool">退回任务池 — 被驳回的任务回到公共任务池</option>
            </select>
          </div>
        )}

        <div className={rootClass.elem("field").toClassName()}>
          <label className={rootClass.elem("checkbox-label").toClassName()}>
            <input
              type="checkbox"
              checked={config.hide_completed_for_annotators}
              onChange={(e) => updateField("hide_completed_for_annotators", e.target.checked)}
            />
            对标注员隐藏已完成任务
          </label>
        </div>

        <div className={rootClass.elem("field").toClassName()}>
          <label className={rootClass.elem("checkbox-label").toClassName()}>
            <input
              type="checkbox"
              checked={config.hide_annotations_for_annotators}
              onChange={(e) => updateField("hide_annotations_for_annotators", e.target.checked)}
            />
            对标注员隐藏他人的标注结果
          </label>
        </div>
      </div>

      <div className={rootClass.elem("save").toClassName()}>
        <Button onClick={handleSave} variant="primary" size="small" waiting={saving}>
          保存设置
        </Button>
      </div>
    </div>
  );
};

WorkflowSettings.title = "工作流";
WorkflowSettings.path = "/workflow";

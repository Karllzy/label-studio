import { inject, observer } from "mobx-react";
import { Button, ToastContext, ToastType } from "@humansignal/ui";
import { useCallback, useContext, useEffect, useState } from "react";

const injector = inject(({ store }) => {
  const opts = store?.SDK?.settings?.assignAnnotator;
  const selected = store?.currentView?.selected;
  const projectRole = store?.project?.my_project_role;
  let taskIds = null;
  let canPickTasks = false;
  if (selected && !selected.all && selected.list?.length) {
    taskIds = Array.from(selected.list);
    canPickTasks = true;
  }
  return { opts, taskIds, canPickTasks, projectRole };
});

export const AssignAnnotatorToolbarButton = injector(
  observer(({ size, opts, taskIds, canPickTasks, projectRole }) => {
    const toast = useContext(ToastContext);
    const [members, setMembers] = useState([]);
    const [annotatorId, setAnnotatorId] = useState("");

    useEffect(() => {
      if (!opts?.enabled || typeof opts.loadAnnotators !== "function") return;
      let cancelled = false;
      opts.loadAnnotators().then((r) => {
        if (!cancelled) setMembers(Array.isArray(r) ? r : []);
      });
      return () => {
        cancelled = true;
      };
    }, [opts?.enabled, opts?.loadAnnotators]);

    const onAssign = useCallback(async () => {
      if (!canPickTasks || !taskIds?.length || !annotatorId || typeof opts?.assign !== "function") return;
      try {
        await opts.assign(taskIds, Number.parseInt(annotatorId, 10));
        toast.show({ message: "任务已分配", type: ToastType.success });
        setAnnotatorId("");
      } catch (e) {
        toast.show({
          message: e?.message || "分配失败",
          type: ToastType.error,
        });
      }
    }, [annotatorId, canPickTasks, opts, taskIds, toast]);

    if (!opts?.enabled || projectRole === "AN") return null;

    const annotators = members.filter((m) => m.role === "AN" && m.enabled !== false);

    return (
      <div className="flex items-center gap-tight">
        <select
          className="text-body-small border border-neutral-border rounded px-tight py-1 bg-neutral-surface"
          value={annotatorId}
          onChange={(e) => setAnnotatorId(e.target.value)}
          aria-label="选择标注员"
        >
          <option value="">选择标注员</option>
          {annotators.map((m) => (
            <option key={m.user_id} value={m.user_id}>
              {m.email || `用户 #${m.user_id}`}
            </option>
          ))}
        </select>
        <Button size={size ?? "small"} look="outlined" disabled={!canPickTasks || !annotatorId} onClick={onAssign}>
          分配给标注员
        </Button>
      </div>
    );
  }),
);

import { Button, buttonVariant, ToastContext, ToastType } from "@humansignal/ui";
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { generatePath, useHistory } from "react-router";
import { Link, NavLink, useLocation } from "react-router-dom";
import { Spinner } from "../../components";
import { modal } from "../../components/Modal/Modal";
import { Space } from "../../components/Space/Space";
import { useAPI } from "../../providers/ApiProvider";
import { useProject } from "../../providers/ProjectProvider";
import { useContextProps, useParams } from "../../providers/RoutesProvider";
import { addCrumb, deleteCrumb } from "../../services/breadrumbs";
import { cn } from "../../utils/bem";
import { isDefined } from "../../utils/helpers";
import { ImportModal } from "../CreateProject/Import/ImportModal";
import { ExportPage } from "../ExportPage/ExportPage";
import { AssignAnnotatorToolbarButton } from "./AssignAnnotatorToolbarButton";
import { APIConfig } from "./api-config";

import "./DataManager.prefix.css";

const loadDependencies = () => [import("@humansignal/datamanager"), import("@humansignal/editor")];

const DEFAULT_DM_TOOLBAR =
  "actions columns filters ordering label-button loading-possum error-box | refresh import-button export-button density-toggle grid-size view-toggle";

const initializeDataManager = async (root, props, params) => {
  if (!window.LabelStudio) throw Error("Label Studio Frontend doesn't exist on the page");
  if (!root && root.dataset.dmInitialized) return;

  root.dataset.dmInitialized = true;

  const { ...settings } = root.dataset;

  const showAssignTool =
    params.project?.can_assign_tasks === true &&
    params.project?.task_assignment_mode === "manual" &&
    params.project?.my_project_role !== "AN";

  const dmConfig = {
    root,
    projectId: params.id,
    apiGateway: `${window.APP_SETTINGS.hostname}/api/dm`,
    apiVersion: 2,
    project: params.project,
    polling: window.APP_SETTINGS?.polling,
    showPreviews: false,
    apiEndpoints: APIConfig.endpoints,
    interfaces: {
      import: true,
      export: true,
      backButton: false,
      labelingHeader: false,
      autoAnnotation: params.autoAnnotation,
    },
    labelStudio: {
      keymap: window.APP_SETTINGS.editor_keymap,
    },
    ...props,
    ...settings,
  };

  if (showAssignTool && params.assignLoadAnnotators && params.assignTasks) {
    dmConfig.toolbar = `${DEFAULT_DM_TOOLBAR} assign-annotator-button`;
    dmConfig.settings = {
      ...(dmConfig.settings ?? {}),
      assignAnnotator: {
        enabled: true,
        loadAnnotators: params.assignLoadAnnotators,
        assign: params.assignTasks,
      },
    };
    dmConfig.instruments = {
      ...(dmConfig.instruments ?? {}),
      "assign-annotator-button": () => {
        return function AssignAnnotatorInstrument({ size }) {
          return <AssignAnnotatorToolbarButton size={size} />;
        };
      },
    };
  }

  return new window.DataManager(dmConfig);
};

const buildLink = (path, params) => {
  return generatePath(`/projects/:id${path}`, params);
};

export const DataManagerPage = ({ ...props }) => {
  const dependencies = useMemo(loadDependencies, []);
  const toast = useContext(ToastContext);
  const root = useRef();
  const params = useParams();
  const history = useHistory();
  const location = useLocation();
  const api = useAPI();
  const { project } = useProject();
  const setContextProps = useContextProps();
  const [crashed, _setCrashed] = useState(false);
  const [loading, setLoading] = useState(!window.DataManager || !window.LabelStudio);
  const dataManagerRef = useRef();
  const skipFirstUrlLabelingSync = useRef(false);
  const projectId = project?.id;

  const init = useCallback(async () => {
    if (!window.LabelStudio) return;
    if (!window.DataManager) return;
    if (!root.current) return;
    if (!project?.id) return;
    if (dataManagerRef.current) return;

    const mlBackends = await api.callApi("mlBackends", {
      params: { project: project.id },
    });

    const interactiveBacked = (mlBackends ?? []).find(({ is_interactive }) => is_interactive);

    const dataManager = (dataManagerRef.current =
      dataManagerRef.current ??
      (await initializeDataManager(root.current, props, {
        ...params,
        project,
        autoAnnotation: isDefined(interactiveBacked),
        assignLoadAnnotators: async () => {
          const raw = await api.callApi("projectMembers", { params: { pk: project.id } });
          if (Array.isArray(raw)) return raw;
          if (raw?.results && Array.isArray(raw.results)) return raw.results;
          return [];
        },
        assignTasks: async (taskIds, annotatorId) => {
          await api.callApi("assignTasks", {
            params: { pk: project.id },
            body: { task_ids: taskIds, annotator_id: annotatorId },
          });
        },
      })));

    Object.assign(window, { dataManager });

    dataManager.on("crash", (details) => {
      const error = details?.error;
      const isMissingTaskError = error?.startsWith("Task ID:");
      const isMissingProjectError = error?.startsWith("Project ID:");

      if (isMissingTaskError || isMissingProjectError) {
        const message = `The ${
          isMissingTaskError ? "task" : "project"
        } you are trying to access does not exist or is no longer available.`;

        toast.show({
          message,
          type: ToastType.error,
          duration: 10000,
        });
      }

      if (isMissingTaskError) {
        history.push(buildLink("", { id: params?.id ?? project?.id }));
      } else if (isMissingProjectError) {
        history.push("/projects");
      }
    });

    dataManager.on("settingsClicked", () => {
      history.push(buildLink("/settings/labeling", { id: params?.id ?? project?.id }));
    });

    dataManager.on("importClicked", () => {
      history.push(buildLink("/data/import", { id: params?.id ?? project?.id }));
    });

    // Navigate to Storage Settings and auto-open Add Source Storage modal
    dataManager.on("openSourceStorageModal", () => {
      history.push(buildLink("/settings/storage?open=source", { id: params?.id ?? project?.id }));
    });

    dataManager.on("exportClicked", () => {
      history.push(buildLink("/data/export", { id: params?.id ?? project?.id }));
    });

    dataManager.on("error", (response) => {
      api.handleError(response);
    });

    dataManager.on("toast", ({ message, type, id, duration }) => {
      toast.show({ message, type, id, duration });
    });

    dataManager.on("toast:dismiss", ({ id } = {}) => {
      toast.dismiss(id);
    });

    dataManager.on("navigate", (route) => {
      const target = route.replace(/^projects/, "");

      if (target) history.push(buildLink(target, { id: params?.id ?? project?.id }));
      else history.push("/projects");
    });

    if (interactiveBacked) {
      dataManager.on("lsf:regionFinishedDrawing", (_reg, group) => {
        const { lsf, task, currentAnnotation: annotation } = dataManager.lsf;
        const ids = group.map((r) => r.cleanId);
        const result = annotation.serializeAnnotation().filter((res) => ids.includes(res.id));

        const suggestionsRequest = api.callApi("mlInteractive", {
          params: { pk: interactiveBacked.id },
          body: {
            task: task.id,
            context: { result },
          },
        });

        // we'll check that we are processing the same task
        const wrappedRequest = new Promise(async (resolve, reject) => {
          const response = await suggestionsRequest;

          // right now task might be an old task,
          // so in order to get a current one we need to get it from lsf
          if (task.id === dataManager.lsf.task.id) {
            resolve(response);
          } else {
            reject();
          }
        });

        lsf.loadSuggestions(wrappedRequest, (response) => {
          const payload = response?.data?.data ?? response?.data ?? response;

          if (Array.isArray(payload)) return payload;
          if (Array.isArray(payload?.result)) return payload.result;

          return null;
        });
      });
    }

    setContextProps({ dmRef: dataManager });
  }, [projectId]);

  const destroyDM = useCallback(() => {
    if (dataManagerRef.current) {
      dataManagerRef.current.destroy();
      dataManagerRef.current = null;
    }
  }, []);

  useEffect(() => {
    Promise.all(dependencies)
      .then(() => setLoading(false))
      .then(init);
  }, [init]);

  // Opening /data?task=&annotation=&review= from in-app links must start labeling even when the
  // Data Manager instance was already mounted (fetchData only runs once on createApp).
  useEffect(() => {
    const dm = dataManagerRef.current;
    if (!dm?.store || loading || !project?.id) return;

    if (!skipFirstUrlLabelingSync.current) {
      skipFirstUrlLabelingSync.current = true;
      return;
    }

    const params = new URLSearchParams(location.search || "");
    const taskParam = params.get("task");
    if (!taskParam) return;

    const taskNum = Number.parseInt(taskParam, 10);
    if (!Number.isFinite(taskNum)) return;

    const annRaw = params.get("annotation");
    const annNum = annRaw !== null && annRaw !== "" ? Number.parseInt(annRaw, 10) : Number.NaN;
    const item = Number.isFinite(annNum) ? { id: annNum, task_id: taskNum } : { id: taskNum };

    dm.store.startLabeling(item, { pushState: false });
  }, [location.search, loading, project?.id]);

  useEffect(() => {
    // destroy the data manager when the component is unmounted
    return () => destroyDM();
  }, []);

  return crashed ? (
    <div className={cn("crash").toClassName()}>
      <div className={cn("crash").elem("info").toClassName()}>项目已删除或尚未创建</div>

      <Button to="/projects" aria-label="返回项目列表">
        返回项目列表
      </Button>
    </div>
  ) : (
    <>
      {loading && (
        <div className="flex-1 absolute inset-0 flex items-center justify-center">
          <Spinner size={64} />
        </div>
      )}
      {/* Allow this to exist before the DataManager is initialized as the async app.fetchData call eventually calls startLabeling, and that requires the root element to exist */}
      <div ref={root} className={cn("datamanager").toClassName()} />
    </>
  );
};

DataManagerPage.path = "/data";
DataManagerPage.pages = {
  ExportPage,
  ImportModal,
};
DataManagerPage.context = ({ dmRef }) => {
  const { project } = useProject();
  const [mode, setMode] = useState(dmRef?.mode ?? "explorer");

  const links = {
    "/settings": "设置",
  };

  const updateCrumbs = (currentMode) => {
    const isExplorer = currentMode === "explorer";

    if (isExplorer) {
      deleteCrumb("dm-crumb");
    } else {
      addCrumb({
        key: "dm-crumb",
        title: "标注",
      });
    }
  };

  const showLabelingInstruction = (currentMode) => {
    const isLabelStream = currentMode === "labelstream";
    const { expert_instruction, show_instruction } = project;

    if (isLabelStream && show_instruction && expert_instruction) {
      modal({
        title: "标注说明",
        body: <div dangerouslySetInnerHTML={{ __html: expert_instruction }} />,
        style: { width: 680 },
      });
    }
  };

  const onDMModeChanged = (currentMode) => {
    setMode(currentMode);
    updateCrumbs(currentMode);
    showLabelingInstruction(currentMode);
  };

  useEffect(() => {
    if (dmRef) {
      dmRef.on("modeChanged", onDMModeChanged);
    }

    return () => {
      dmRef?.off?.("modeChanged", onDMModeChanged);
    };
  }, [dmRef, project]);

  return project && project.id ? (
    <Space size="small">
      {project.expert_instruction && mode !== "explorer" && (
        <Button
          size="small"
          look="outlined"
          onClick={() => {
            modal({
              title: "说明",
              body: () => (
                <div
                  dangerouslySetInnerHTML={{
                    __html: project.expert_instruction,
                  }}
                />
              ),
            });
          }}
        >
          说明
        </Button>
      )}

      {Object.entries(links).map(([path, label]) => (
        <Link
          key={path}
          tag={NavLink}
          className={buttonVariant({ size: "small", look: "outlined" })}
          to={`/projects/${project.id}${path}`}
          data-external
        >
          {label}
        </Link>
      ))}
    </Space>
  ) : null;
};

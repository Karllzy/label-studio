import { useEffect, useRef, useState, useCallback } from "react";
import { useHistory } from "react-router";
import { Button, Badge } from "@humansignal/ui";
import { IconFileDownload, IconFolderOpen } from "@humansignal/icons";
import { formatFileSize } from "@humansignal/core";
import { Form, Input } from "../../components/Form";
import { Modal } from "../../components/Modal/Modal";
import { Space } from "../../components/Space/Space";
import { useAPI } from "../../providers/ApiProvider";
import { useFixedLocation, useParams } from "../../providers/RoutesProvider";
import { cn } from "../../utils/bem";
import { isDefined } from "../../utils/helpers";
import "./ExportPage.prefix.css";

const downloadFile = (blob, filename) => {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
};

const isTimeoutLikeStatus = (status) => status === 408 || status === 502 || status === 504;

export const ExportPage = () => {
  const history = useHistory();
  const location = useFixedLocation();
  const pageParams = useParams();
  const api = useAPI();

  const [activeTab, setActiveTab] = useState("download");
  const [downloading, setDownloading] = useState(false);
  const [downloadingMessage, setDownloadingMessage] = useState(false);
  const [availableFormats, setAvailableFormats] = useState([]);
  const [currentFormat, setCurrentFormat] = useState("JSON");
  const [exportIssue, setExportIssue] = useState(null);

  // Folder export state
  const [folderFormat, setFolderFormat] = useState("JSON");
  const [targetPath, setTargetPath] = useState("");
  const [includeResources, setIncludeResources] = useState(false);
  const [folderExporting, setFolderExporting] = useState(false);
  const [packagedExports, setPackagedExports] = useState([]);
  const [folderError, setFolderError] = useState(null);

  const form = useRef();

  const loadPackagedExports = useCallback(async () => {
    if (!isDefined(pageParams.id)) return;
    try {
      const result = await api.callApi("packagedExports", {
        params: { pk: pageParams.id },
        errorFilter: () => true,
      });
      if (Array.isArray(result)) {
        setPackagedExports(result);
      }
    } catch {
      // ignore
    }
  }, [pageParams.id]);

  const proceedExport = async () => {
    setExportIssue(null);
    setDownloading(true);
    const messageTimer = window.setTimeout(() => setDownloadingMessage(true), 1000);

    try {
      const params = form.current.assembleFormData({
        asJSON: true,
        full: true,
        booleansAsNumbers: true,
      });

      const response = await api.callApi("exportRaw", {
        params: { pk: pageParams.id, ...params },
      });

      if (!response) {
        setExportIssue("timeout");
        return;
      }

      if (response.ok) {
        const blob = await response.blob();
        downloadFile(blob, response.headers.get("filename"));
        return;
      }

      if (isTimeoutLikeStatus(response.status)) {
        setExportIssue("timeout");
        return;
      }

      api.handleError(response);
    } finally {
      window.clearTimeout(messageTimer);
      setDownloading(false);
      setDownloadingMessage(false);
    }
  };

  const proceedFolderExport = async () => {
    setFolderError(null);
    setFolderExporting(true);
    try {
      const result = await api.callApi("createPackagedExport", {
        params: { pk: pageParams.id },
        body: {
          export_format: folderFormat,
          target_path: targetPath,
          include_resources: includeResources,
        },
      });

      if (result?.id) {
        pollPackagedExport(result.id);
      }
    } catch (err) {
      setFolderError(err?.message || "Export failed");
      setFolderExporting(false);
    }
  };

  const pollPackagedExport = useCallback(
    async (exportId) => {
      const poll = async () => {
        try {
          const detail = await api.callApi("packagedExportDetail", {
            params: { pk: pageParams.id, exportPk: exportId },
            errorFilter: () => true,
          });
          if (!detail) return;

          if (detail.status === "completed" || detail.status === "failed") {
            setFolderExporting(false);
            if (detail.status === "failed") {
              setFolderError("Export failed on server. Please check server logs.");
            }
            loadPackagedExports();
            return;
          }
          setTimeout(poll, 3000);
        } catch {
          setFolderExporting(false);
        }
      };
      poll();
    },
    [pageParams.id, loadPackagedExports],
  );

  const downloadPackage = useCallback(
    async (exportPk) => {
      const response = await api.callApi("downloadPackagedExportRaw", {
        params: { pk: pageParams.id, exportPk },
      });
      if (response?.ok) {
        const blob = await response.blob();
        const filename = response.headers.get("filename") || `export_${exportPk}.zip`;
        downloadFile(blob, filename);
      }
    },
    [pageParams.id],
  );

  const deletePackage = useCallback(
    async (exportPk) => {
      await api.callApi("deletePackagedExport", {
        params: { pk: pageParams.id, exportPk },
      });
      loadPackagedExports();
    },
    [pageParams.id, loadPackagedExports],
  );

  useEffect(() => {
    if (isDefined(pageParams.id)) {
      let cancelled = false;

      api
        .callApi("exportFormats", { params: { pk: pageParams.id } })
        .then((formats) => {
          if (cancelled) return;
          setAvailableFormats(formats);
          setCurrentFormat(formats[0]?.name);
          setFolderFormat(formats[0]?.name);
        });

      loadPackagedExports();

      return () => {
        cancelled = true;
      };
    }
  }, [pageParams.id]);

  return (
    <Modal
      onHide={() => {
        const path = location.pathname.replace(ExportPage.path, "");
        const search = location.search;
        history.replace(`${path}${search !== "?" ? search : ""}`);
      }}
      title="Export data"
      style={{ width: 760 }}
      closeOnClickOutside={false}
      allowClose={!downloading && !folderExporting}
      visible
    >
      <div className={cn("export-page").toClassName()}>
        <div className="flex gap-1 mb-base border-b border-neutral-border pb-tight">
          <button
            type="button"
            className={`px-base py-tight rounded-t text-body-medium cursor-pointer border-none ${activeTab === "download" ? "bg-primary-surface text-primary-content font-medium" : "bg-transparent text-neutral-content-subtle"}`}
            onClick={() => setActiveTab("download")}
          >
            Direct Download
          </button>
          <button
            type="button"
            className={`px-base py-tight rounded-t text-body-medium cursor-pointer border-none ${activeTab === "folder" ? "bg-primary-surface text-primary-content font-medium" : "bg-transparent text-neutral-content-subtle"}`}
            onClick={() => setActiveTab("folder")}
          >
            Export to Folder
          </button>
        </div>

        {activeTab === "download" && (
          <>
            <FormatInfo
              availableFormats={availableFormats}
              selected={currentFormat}
              onClick={(format) => setCurrentFormat(format.name)}
            />

            {exportIssue === "timeout" && (
              <div className="p-tight bg-negative-background border border-negative-border-subtle rounded-md mt-tight">
                <p className="text-negative-content font-medium">Export timed out</p>
                <p className="text-body-small text-neutral-content-subtle mt-tighter">
                  For large datasets, use the "Export to Folder" tab which runs asynchronously on the server.
                </p>
              </div>
            )}

            <Form ref={form}>
              <Input type="hidden" name="exportType" value={currentFormat} />
            </Form>

            <div className={cn("export-page").elem("footer").toClassName()}>
              {downloadingMessage && (
                <div className={cn("export-page").elem("status-message").toClassName()}>
                  Files are being prepared. It might take a while.
                </div>
              )}
              <Space style={{ width: "100%" }} spread>
                <div />
                <div className={cn("export-page").elem("actions").toClassName()}>
                  <Button className="w-[135px]" onClick={proceedExport} waiting={downloading} aria-label="Export data">
                    Export
                  </Button>
                </div>
              </Space>
            </div>
          </>
        )}

        {activeTab === "folder" && (
          <div className="flex flex-col gap-base">
            <div className="text-body-medium text-neutral-content-subtle">
              Export project data to a server folder and generate a downloadable zip package. Suitable for large
              datasets.
            </div>

            <div className="flex flex-col gap-tight">
              <label className="text-label-small font-medium">Export format</label>
              <div className="flex flex-wrap gap-tighter">
                {availableFormats
                  .filter((f) => !f.disabled)
                  .map((format) => (
                    <button
                      key={format.name}
                      type="button"
                      className={`px-tight py-tighter rounded border text-body-small cursor-pointer ${
                        folderFormat === format.name
                          ? "border-primary-border bg-primary-surface text-primary-content font-medium"
                          : "border-neutral-border bg-neutral-surface text-neutral-content"
                      }`}
                      onClick={() => setFolderFormat(format.name)}
                    >
                      {format.title}
                    </button>
                  ))}
              </div>
            </div>

            <div className="flex flex-col gap-tighter">
              <label className="text-label-small font-medium" htmlFor="target-path">
                Target path (optional)
              </label>
              <input
                id="target-path"
                type="text"
                className="border border-neutral-border rounded px-tight py-tighter text-body-medium"
                placeholder="Leave empty for default export directory"
                value={targetPath}
                onChange={(e) => setTargetPath(e.target.value)}
              />
              <span className="text-body-smaller text-neutral-content-subtler">
                Absolute server path. Exported files will be saved here.
              </span>
            </div>

            <label className="flex items-center gap-tighter cursor-pointer">
              <input
                type="checkbox"
                checked={includeResources}
                onChange={(e) => setIncludeResources(e.target.checked)}
              />
              <span className="text-body-medium">Include original data files (images, audio, etc.)</span>
            </label>

            {folderError && (
              <div className="p-tight bg-negative-background border border-negative-border-subtle rounded-md text-negative-content text-body-small">
                {folderError}
              </div>
            )}

            <div className="flex justify-end">
              <Button onClick={proceedFolderExport} waiting={folderExporting} aria-label="Start export to folder">
                {folderExporting ? "Exporting..." : "Export to Folder"}
              </Button>
            </div>

            {packagedExports.length > 0 && (
              <div className="flex flex-col gap-tight mt-tight">
                <div className="text-label-small font-medium">Previous packaged exports</div>
                <div className="border border-neutral-border rounded overflow-hidden">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-neutral-surface-subtle text-body-smaller text-neutral-content-subtle">
                        <th className="text-left px-tight py-tighter font-medium">Format</th>
                        <th className="text-left px-tight py-tighter font-medium">Status</th>
                        <th className="text-left px-tight py-tighter font-medium">Size</th>
                        <th className="text-left px-tight py-tighter font-medium">Date</th>
                        <th className="text-right px-tight py-tighter font-medium">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {packagedExports.map((pe) => (
                        <tr key={pe.id} className="border-t border-neutral-border">
                          <td className="px-tight py-tighter text-body-small">{pe.export_format}</td>
                          <td className="px-tight py-tighter">
                            <Badge
                              variant={
                                pe.status === "completed"
                                  ? "positive"
                                  : pe.status === "failed"
                                    ? "negative"
                                    : "primary"
                              }
                              size="small"
                            >
                              {pe.status}
                            </Badge>
                          </td>
                          <td className="px-tight py-tighter text-body-small text-neutral-content-subtle">
                            {pe.zip_size ? formatFileSize(pe.zip_size) : "-"}
                          </td>
                          <td className="px-tight py-tighter text-body-small text-neutral-content-subtle">
                            {pe.created_at ? new Date(pe.created_at).toLocaleString() : "-"}
                          </td>
                          <td className="px-tight py-tighter text-right">
                            <div className="flex gap-tighter justify-end">
                              {pe.status === "completed" && (
                                <Button
                                  size="smaller"
                                  variant="primary"
                                  look="outlined"
                                  onClick={() => downloadPackage(pe.id)}
                                  aria-label="Download"
                                >
                                  <IconFileDownload className="w-4 h-4" />
                                </Button>
                              )}
                              <Button
                                size="smaller"
                                variant="negative"
                                look="outlined"
                                onClick={() => deletePackage(pe.id)}
                                aria-label="Delete"
                              >
                                Delete
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
};

const FormatInfo = ({ availableFormats, selected, onClick }) => {
  return (
    <div className={cn("formats").toClassName()}>
      <div className={cn("formats").elem("info").toClassName()}>Select an export format:</div>
      <div className={cn("formats").elem("list").toClassName()}>
        {availableFormats.map((format) => (
          <div
            key={format.name}
            className={cn("formats")
              .elem("item")
              .mod({
                active: !format.disabled,
                selected: format.name === selected,
              })
              .toClassName()}
            onClick={!format.disabled ? () => onClick(format) : null}
          >
            <div className={cn("formats").elem("name").toClassName()}>
              {format.title}

              <Space size="small">
                {format.tags?.map?.((tag, index) => {
                  const tagLower = tag?.toLowerCase() || "";
                  let variant = "primary";
                  if (tagLower === "beta") variant = "plum";
                  else if (tagLower === "new" || tagLower.includes("new")) variant = "positive";

                  return (
                    <Badge key={index} variant={variant} size="small">
                      {tag}
                    </Badge>
                  );
                })}
              </Space>
            </div>

            {format.description && (
              <div className={cn("formats").elem("description").toClassName()}>{format.description}</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

ExportPage.path = "/export";
ExportPage.modal = true;

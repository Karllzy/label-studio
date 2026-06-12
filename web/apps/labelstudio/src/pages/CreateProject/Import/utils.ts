import { API } from "apps/labelstudio/src/providers/ApiProvider";

const CHUNK_SIZE = 50 * 1024 * 1024; // 50 MB
const CHUNKED_UPLOAD_THRESHOLD = 50 * 1024 * 1024; // Files larger than 50 MB use chunked upload

export const importFiles = async ({
  files,
  body,
  project,
  onUploadStart,
  onUploadFinish,
  onFinish,
  onError,
  dontCommitToProject,
}: {
  files: { name: string; size?: number }[];
  body: Record<string, any> | FormData;
  project: APIProject;
  onUploadStart?: (files: { name: string }[]) => void;
  onUploadFinish?: (files: { name: string }[]) => void;
  onFinish?: (response: any) => void;
  onError?: (response: any) => void;
  dontCommitToProject?: boolean;
}) => {
  onUploadStart?.(files);

  const query = dontCommitToProject ? { commit_to_project: "false" } : {};

  try {
    const contentType =
      body instanceof FormData
        ? "multipart/form-data" // usual multipart for usual files
        : "application/x-www-form-urlencoded"; // chad urlencoded for URL uploads
    const res = await API.invoke(
      "importFiles",
      { pk: project.id, ...query },
      { headers: { "Content-Type": contentType }, body },
    );

    if (res && !res.error) {
      await onFinish?.(res);
      return res;
    }
    onError?.(res?.response);
    return null;
  } catch (err) {
    onError?.(err);
    return null;
  } finally {
    onUploadFinish?.(files);
  }
};

export const chunkedUploadFile = async ({
  file,
  project,
  onProgress,
  onError,
  onFinish,
}: {
  file: File;
  project: APIProject;
  onProgress?: (progress: { percent: number; uploaded: number; total: number }) => void;
  onError?: (error: any) => void;
  onFinish?: (response: any) => void;
}) => {
  const totalChunks = Math.ceil(file.size / CHUNK_SIZE);

  try {
    const initRes = await API.invoke(
      "chunkedUploadInit",
      { pk: project.id },
      {
        body: {
          filename: file.name,
          total_size: file.size,
          total_chunks: totalChunks,
        },
      },
    );

    if (!initRes || initRes.error) {
      onError?.(initRes?.response || "Failed to initialize upload");
      return null;
    }

    const uploadId = initRes.upload_id;

    for (let i = 0; i < totalChunks; i++) {
      const start = i * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, file.size);
      const chunk = file.slice(start, end);

      const formData = new FormData();
      formData.append("upload_id", uploadId);
      formData.append("chunk_index", String(i));
      formData.append("chunk", chunk, `chunk_${i}`);

      let retries = 3;
      let success = false;

      while (retries > 0 && !success) {
        try {
          const partRes = await API.invoke(
            "chunkedUploadPart",
            { pk: project.id },
            { headers: { "Content-Type": "multipart/form-data" }, body: formData },
          );

          if (partRes && !partRes.error) {
            success = true;
            onProgress?.({
              percent: Math.round(((i + 1) / totalChunks) * 100),
              uploaded: end,
              total: file.size,
            });
          } else {
            retries--;
          }
        } catch {
          retries--;
        }
      }

      if (!success) {
        onError?.(`Failed to upload chunk ${i + 1}/${totalChunks} after 3 retries`);
        return null;
      }
    }

    const completeRes = await API.invoke(
      "chunkedUploadComplete",
      { pk: project.id },
      { body: { upload_id: uploadId, commit_to_project: false } },
    );

    if (completeRes && !completeRes.error) {
      await onFinish?.(completeRes);
      return completeRes;
    }
    onError?.(completeRes?.response || "Failed to complete upload");
    return null;
  } catch (err) {
    onError?.(err);
    return null;
  }
};

export const isLargeFile = (file: File) => file.size > CHUNKED_UPLOAD_THRESHOLD;

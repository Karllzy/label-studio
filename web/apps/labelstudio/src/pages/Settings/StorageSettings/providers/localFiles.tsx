import { z } from "zod";
import type { ProviderConfig } from "@humansignal/app-common/blocks/StorageProviderForm/types/provider";
import { IconFolderOpen } from "@humansignal/icons";

const localFilesDocumentRoot =
  typeof window === "undefined" ? undefined : window.APP_SETTINGS?.local_files_document_root;
const trimTrailingSeparators = (value?: string) => value?.replace(/[/\\]+$/, "");
const defaultPathExample = localFilesDocumentRoot
  ? `${trimTrailingSeparators(localFilesDocumentRoot)}/your-subdirectory`
  : undefined;

const pathSchema = defaultPathExample
  ? z.string().min(1, "Path is required").default(defaultPathExample)
  : z.string().min(1, "Path is required");

export const localFilesProvider: ProviderConfig = {
  name: "localfiles",
  title: "Local / NAS Storage",
  description: "Connect to local file system or network-attached storage (NAS) directories",
  icon: () => (
    <IconFolderOpen
      width={40}
      height={40}
      style={{
        color: "var(--color-accent-canteloupe-base)",
        filter: "drop-shadow(0px 0px 12px var(--color-accent-canteloupe-base))",
      }}
    />
  ),
  fields: [
    {
      name: "path",
      type: "text",
      label: "Storage path",
      required: true,
      placeholder: defaultPathExample || "/data/my-folder/subdirectory",
      schema: pathSchema,
      defaultValue: defaultPathExample,
      description: localFilesDocumentRoot
        ? `Absolute path on the server. Must be under "${localFilesDocumentRoot}". Supports local disks and mounted NAS/SMB shares.`
        : "Absolute path on the server. Supports local disks and mounted NAS/SMB shares.",
    },
  ],
  layout: [{ fields: ["path"] }],
};

export default localFilesProvider;

import { useState } from "react";
import { Button } from "@humansignal/ui";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@humansignal/shad/components/ui/dialog";
import { Alert, AlertDescription, AlertTitle } from "@humansignal/shad/components/ui/alert";

// Type definitions
interface Hotkey {
  id: string;
  section: string;
  element: string;
  label: string;
  key: string;
  mac?: string;
  active: boolean;
  subgroup?: string;
  description?: string;
}

interface ImportData {
  hotkeys?: Hotkey[];
  settings?: {
    autoTranslatePlatforms?: boolean;
  };
}

interface ImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImport: (data: ImportData | Hotkey[]) => void | Promise<void>;
}

/**
 * ImportDialog - A dialog component for importing hotkey configurations
 *
 * This component allows users to import hotkey configurations by pasting JSON data.
 * It validates the imported data structure and provides error feedback.
 *
 * @param {ImportDialogProps} props - The component props
 * @returns {React.ReactElement} The ImportDialog component
 */
export const ImportDialog = ({ open, onOpenChange, onImport }: ImportDialogProps) => {
  // State for the import text input
  const [importText, setImportText] = useState<string>("");
  // State for validation errors
  const [error, setError] = useState<string>("");

  /**
   * Validates a single hotkey object structure
   * @param {unknown} hotkey - The hotkey object to validate
   * @throws {Error} If the hotkey is missing required fields
   */
  const validateHotkey = (hotkey: unknown): void => {
    if (!hotkey || typeof hotkey !== "object") {
      throw new Error("快捷键对象无效");
    }

    const hotkeyObj = hotkey as Record<string, unknown>;
    const requiredFields = ["id", "section", "element", "label", "key"];
    const missingFields = requiredFields.filter((field) => !hotkeyObj[field]);

    if (missingFields.length > 0) {
      throw new Error(`缺少必填字段：${missingFields.join(", ")}`);
    }
  };

  /**
   * Handles the import process
   * Parses JSON, validates structure, and calls the onImport callback
   */
  const handleImport = (): void => {
    try {
      // Clear any previous errors
      setError("");

      // Validate input exists
      if (!importText.trim()) {
        throw new Error("请输入要导入的 JSON 数据");
      }

      // Parse the JSON
      const parsedData: unknown = JSON.parse(importText);

      // Handle both old format (array of hotkeys) and new format (object with hotkeys and settings)
      let hotkeys: unknown[];

      if (Array.isArray(parsedData)) {
        // Old format: direct array of hotkeys
        hotkeys = parsedData;
      } else if (parsedData && typeof parsedData === "object" && "hotkeys" in parsedData) {
        // New format: object with hotkeys property
        const dataObj = parsedData as { hotkeys?: unknown };
        if (!Array.isArray(dataObj.hotkeys)) {
          throw new Error("数据格式无效：hotkeys 字段必须是数组");
        }
        hotkeys = dataObj.hotkeys;
      } else {
        throw new Error("数据格式无效：应为快捷键数组，或包含 hotkeys 字段的对象");
      }

      // Validate it's not empty
      if (hotkeys.length === 0) {
        throw new Error("导入数据中未找到快捷键");
      }

      // Validate each hotkey object
      hotkeys.forEach((hotkey: unknown, index: number) => {
        try {
          validateHotkey(hotkey);
        } catch (validationError: unknown) {
          const errorMessage = validationError instanceof Error ? validationError.message : "未知校验错误";
          throw new Error(`第 ${index} 条快捷键有误：${errorMessage}`);
        }
      });

      // If validation passes, proceed with import
      onImport(parsedData as ImportData | Hotkey[]);

      // Reset the dialog state
      resetDialogState();
    } catch (err: unknown) {
      // Set error message for display
      const errorMessage = err instanceof Error ? err.message : "发生未知错误";
      setError(errorMessage);
    }
  };

  /**
   * Resets the dialog to its initial state
   */
  const resetDialogState = (): void => {
    setImportText("");
    setError("");
    onOpenChange(false);
  };

  /**
   * Handles dialog cancellation
   */
  const handleCancel = (): void => {
    resetDialogState();
  };

  /**
   * Handles textarea input changes
   * @param {React.ChangeEvent<HTMLTextAreaElement>} e - The change event
   */
  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>): void => {
    setImportText(e.target.value);
    // Clear error when user starts typing
    if (error) {
      setError("");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[525px] bg-neutral-surface">
        <DialogHeader>
          <DialogTitle>导入快捷键</DialogTitle>
          <DialogDescription>
            将导出的快捷键 JSON 粘贴到下方。导入后会替换当前快捷键，请确认 JSON 中包含必填字段。
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <label
            htmlFor="import-json"
            className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
          >
            快捷键 JSON
          </label>
          <textarea
            id="import-json"
            className="flex min-h-[150px] w-full rounded-md border border-neutral-border bg-transparent px-tight py-tighter typography-body-small placeholder:text-neutral-content-subtler focus-visible:ring-4 focus-visible:ring-primary-focus-outline focus-visible:border-neutral-border-bolder focus-visible:outline-0 transition-all resize-none"
            placeholder='[{"id": 1, "section": "annotation", "element": "annotation:submit", "label": "提交标注", "key": "Ctrl+Enter"}]'
            value={importText}
            onChange={handleTextareaChange}
            aria-describedby={error ? "import-error" : undefined}
          />

          {error && (
            <Alert variant="destructive" id="import-error">
              <AlertTitle>导入失败</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button variant="neutral" onClick={handleCancel}>
            取消
          </Button>
          <Button onClick={handleImport} disabled={!importText.trim()}>
            导入快捷键
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

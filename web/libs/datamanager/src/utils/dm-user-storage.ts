declare global {
  interface Window {
    APP_SETTINGS?: { user?: { id?: number | string | null } };
  }
}

/** Suffix so Data Manager localStorage keys are scoped per logged-in user (same browser, different accounts). */
export function dmUserStorageSuffix(): string {
  if (typeof window === "undefined") return "";
  const uid = window.APP_SETTINGS?.user?.id;
  if (uid === undefined || uid === null || uid === "") return "";
  return `:u${uid}`;
}

export function dmUserStorageKey(baseKey: string): string {
  return `${baseKey}${dmUserStorageSuffix()}`;
}

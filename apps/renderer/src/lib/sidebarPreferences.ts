const STORAGE_KEY = "gavadb.sidebar-preferences.v1";

interface SidebarPreferences {
  collapsed: boolean;
}

export function loadSidebarPreferences(): SidebarPreferences {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { collapsed: false };
    const parsed = JSON.parse(raw) as Partial<SidebarPreferences>;
    return {
      collapsed: parsed.collapsed === true,
    };
  } catch {
    return { collapsed: false };
  }
}

export function saveSidebarPreferences(preferences: SidebarPreferences): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
}

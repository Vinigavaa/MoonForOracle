const STORAGE_KEY = "gavadb.sidebar-preferences.v1";

interface SidebarPreferences {
  collapsed: boolean;
  connectionsExpanded: boolean;
  databaseObjectsExpanded: boolean;
}

export function loadSidebarPreferences(): SidebarPreferences {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return {
        collapsed: false,
        connectionsExpanded: false,
        databaseObjectsExpanded: false,
      };
    }
    const parsed = JSON.parse(raw) as Partial<SidebarPreferences>;
    return {
      collapsed: parsed.collapsed === true,
      connectionsExpanded: false,
      databaseObjectsExpanded: false,
    };
  } catch {
    return {
      collapsed: false,
      connectionsExpanded: false,
      databaseObjectsExpanded: false,
    };
  }
}

export function saveSidebarPreferences(preferences: SidebarPreferences): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
}

import { useEffect, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { EditorTabBar } from "./EditorTabBar";

export interface QueryResultTabItem {
  id: string;
  label: string;
  content: ReactNode;
}

interface QueryResultTabsProps {
  items: QueryResultTabItem[];
}

export function QueryResultTabs({ items }: QueryResultTabsProps) {
  const [activeTabId, setActiveTabId] = useState<string | null>(items[0]?.id ?? null);

  useEffect(() => {
    if (!items.some((item) => item.id === activeTabId)) {
      setActiveTabId(items[0]?.id ?? null);
    }
  }, [activeTabId, items]);

  const activeItem = items.find((item) => item.id === activeTabId) ?? items[0] ?? null;
  if (!activeItem) return null;

  return (
    <div style={containerStyle}>
      <EditorTabBar
        tabs={items.map((item) => ({ id: item.id, label: item.label }))}
        activeTabId={activeItem.id}
        onTabSelect={setActiveTabId}
        tabMinWidth={0}
      />
      <div style={contentStyle}>
        {activeItem.content}
      </div>
    </div>
  );
}

const containerStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  height: "100%",
  minHeight: 0,
};

const contentStyle: CSSProperties = {
  flex: 1,
  minHeight: 0,
  overflow: "hidden",
};

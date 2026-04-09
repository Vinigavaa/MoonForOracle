import { useState, useEffect, useCallback, useMemo } from "react";
import type { DatabaseObjectType, DatabaseObjectSummary } from "@gavadb/types";
import { useObjectList, type SectionState } from "../hooks/useObjectList";

interface SidebarProps {
  isConnected: boolean;
  onObjectSelect: (type: DatabaseObjectType, name: string) => void;
}

interface SectionDef {
  type: DatabaseObjectType;
  label: string;
  icon: string;
}

const SECTIONS: SectionDef[] = [
  { type: "tables", label: "Tables", icon: "\u229E" },
  { type: "views", label: "Views", icon: "\u25EB" },
  { type: "triggers", label: "Triggers", icon: "\u26A1" },
  { type: "packages", label: "Packages", icon: "\u25F0" },
  { type: "procedures", label: "Procedures", icon: "\u25B7" },
  { type: "functions", label: "Functions", icon: "\u0192" },
];

const EMPTY_SECTION: SectionState = { objects: [], loading: false, error: null, loaded: false };

export function Sidebar({ isConnected, onObjectSelect }: SidebarProps) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [filter, setFilter] = useState("");
  const { getSection, loadSection } = useObjectList(isConnected);

  // Reset ao desconectar
  useEffect(() => {
    if (!isConnected) {
      setExpanded({});
      setFilter("");
    }
  }, [isConnected]);

  const toggleSection = useCallback((type: DatabaseObjectType) => {
    setExpanded((prev) => {
      const next = { ...prev, [type]: !prev[type] };
      if (next[type] && !getSection(type).loaded) {
        loadSection(type);
      }
      return next;
    });
  }, [getSection, loadSection]);

  const lowerFilter = filter.toLowerCase();

  return (
    <div style={{
      width: "var(--sidebar-width)",
      background: "var(--bg-secondary)",
      borderRight: "1px solid var(--border-color)",
      display: "flex",
      flexDirection: "column",
      flexShrink: 0,
      overflow: "hidden",
    }}>
      <div style={{
        padding: "8px 12px",
        fontSize: 11,
        fontWeight: 600,
        textTransform: "uppercase",
        letterSpacing: "0.05em",
        color: "var(--text-muted)",
        borderBottom: "1px solid var(--border-subtle)",
      }}>
        Database Objects
      </div>

      {isConnected && (
        <div style={{ padding: "6px 8px", borderBottom: "1px solid var(--border-subtle)" }}>
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter objects..."
            style={{
              width: "100%",
              padding: "4px 8px",
              fontSize: 11,
              background: "var(--bg-primary)",
              color: "var(--text-primary)",
              border: "1px solid var(--border-color)",
              borderRadius: "var(--radius)",
            }}
          />
        </div>
      )}

      <div style={{ flex: 1, overflowY: "auto" }}>
        {SECTIONS.map((def) => (
          <SidebarSection
            key={def.type}
            def={def}
            isConnected={isConnected}
            expanded={!!expanded[def.type]}
            state={getSection(def.type)}
            filter={lowerFilter}
            onToggle={() => toggleSection(def.type)}
            onReload={() => loadSection(def.type)}
            onObjectSelect={onObjectSelect}
          />
        ))}
      </div>
    </div>
  );
}

// ── Section component ──

interface SidebarSectionProps {
  def: SectionDef;
  isConnected: boolean;
  expanded: boolean;
  state: SectionState;
  filter: string;
  onToggle: () => void;
  onReload: () => void;
  onObjectSelect: (type: DatabaseObjectType, name: string) => void;
}

function SidebarSection({
  def, isConnected, expanded, state, filter, onToggle, onReload, onObjectSelect,
}: SidebarSectionProps) {
  const filtered = useMemo(() => {
    if (!filter) return state.objects;
    return state.objects.filter((o) => o.name.toLowerCase().includes(filter));
  }, [state.objects, filter]);

  const showExpanded = expanded || (!!filter && filtered.length > 0);
  const count = filter ? filtered.length : state.objects.length;

  return (
    <div>
      <button
        onClick={onToggle}
        disabled={!isConnected}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "6px 12px",
          background: "transparent",
          border: "none",
          borderRadius: 0,
          color: isConnected ? "var(--text-primary)" : "var(--text-muted)",
          fontSize: "var(--font-size-sm)",
          fontWeight: 500,
          textAlign: "left",
          opacity: isConnected ? 1 : 0.5,
        }}
      >
        <span style={{
          fontSize: 10,
          transition: "transform 0.15s",
          transform: showExpanded ? "rotate(90deg)" : "rotate(0deg)",
          display: "inline-block",
        }}>
          \u25B6
        </span>
        <span>{def.icon}</span>
        <span>{def.label}</span>
        <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--text-muted)" }}>
          {state.loading ? "..." : state.loaded ? count : ""}
        </span>
      </button>

      {showExpanded && isConnected && (
        <SectionContent
          type={def.type}
          state={state}
          filtered={filtered}
          filter={filter}
          onReload={onReload}
          onObjectSelect={onObjectSelect}
        />
      )}
    </div>
  );
}

// ── Section content ──

interface SectionContentProps {
  type: DatabaseObjectType;
  state: SectionState;
  filtered: DatabaseObjectSummary[];
  filter: string;
  onReload: () => void;
  onObjectSelect: (type: DatabaseObjectType, name: string) => void;
}

function SectionContent({ type, state, filtered, filter, onReload, onObjectSelect }: SectionContentProps) {
  if (state.loading) {
    return (
      <div style={infoStyle}>
        <span style={{ animation: "pulse 1s infinite" }}>Loading...</span>
      </div>
    );
  }

  if (state.error) {
    return (
      <div style={{ paddingLeft: 12 }}>
        <div style={{ ...infoStyle, color: "var(--danger)" }}>{state.error}</div>
        <button
          onClick={onReload}
          style={{
            margin: "2px 12px 6px",
            padding: "2px 8px",
            fontSize: 11,
            background: "transparent",
            border: "1px solid var(--border-color)",
            borderRadius: "var(--radius)",
            color: "var(--text-secondary)",
          }}
        >
          Retry
        </button>
      </div>
    );
  }

  if (state.loaded && filtered.length === 0) {
    return <div style={infoStyle}>{filter ? "No matches" : "No objects found"}</div>;
  }

  return (
    <div style={{ paddingLeft: 12 }}>
      {filtered.map((obj) => (
        <button
          key={obj.name}
          onClick={() => onObjectSelect(type, obj.name)}
          style={{
            width: "100%",
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "3px 12px",
            background: "transparent",
            border: "none",
            borderRadius: 0,
            color: "var(--text-secondary)",
            fontSize: "var(--font-size-sm)",
            textAlign: "left",
            fontFamily: "var(--font-mono)",
          }}
        >
          <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {filter ? highlightMatch(obj.name, filter) : obj.name}
          </span>
          {obj.status === "INVALID" && (
            <span style={{ fontSize: 10, color: "var(--danger)", flexShrink: 0 }} title="Invalid object">
              \u25CF
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

const infoStyle: React.CSSProperties = {
  padding: "6px 12px 6px 24px",
  fontSize: 11,
  color: "var(--text-muted)",
  fontStyle: "italic",
};

function highlightMatch(name: string, filter: string): React.ReactNode {
  const lower = name.toLowerCase();
  const idx = lower.indexOf(filter);
  if (idx === -1) return name;
  return (
    <>
      {name.slice(0, idx)}
      <span style={{ color: "var(--accent)", fontWeight: 600 }}>{name.slice(idx, idx + filter.length)}</span>
      {name.slice(idx + filter.length)}
    </>
  );
}

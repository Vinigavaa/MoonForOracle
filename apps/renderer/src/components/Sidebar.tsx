import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import type { DatabaseObjectType, DatabaseObjectSummary, SavedConnection } from "@gavadb/types";
import { useObjectList, type SectionState } from "../hooks/useObjectList";

interface SidebarProps {
  collapsed: boolean;
  isConnected: boolean;
  onObjectSelect: (type: DatabaseObjectType, name: string) => void;
  savedConnections: SavedConnection[];
  activeConnectionId: string | null;
  connectingId: string | null;
  onQuickConnect: (id: string) => void;
  onEditConnection: (conn: SavedConnection) => void;
  onDeleteConnection: (id: string, name: string) => void;
  onToggleFavorite: (id: string) => void;
  onToggleCollapse: () => void;
}

interface SectionDef {
  type: DatabaseObjectType;
  label: string;
  icon: string;
}

const SECTIONS: SectionDef[] = [
  { type: "tables", label: "Tables", icon: "\u229E" },
  { type: "views", label: "Views", icon: "\u25EB" },
  { type: "triggers", label: "Triggers", icon: "\u25B7" },
  { type: "packages", label: "Packages", icon: "\u25F0" },
  { type: "procedures", label: "Procedures", icon: "\u25B7" },
  { type: "functions", label: "Functions", icon: "\u0192" },
];

const EMPTY_SECTION: SectionState = { objects: [], loading: false, error: null, loaded: false };

export function Sidebar({
  collapsed,
  isConnected,
  onObjectSelect,
  savedConnections,
  activeConnectionId,
  connectingId,
  onQuickConnect,
  onEditConnection,
  onDeleteConnection,
  onToggleFavorite,
  onToggleCollapse,
}: SidebarProps) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [filter, setFilter] = useState("");
  const [connSectionExpanded, setConnSectionExpanded] = useState(true);
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

  if (collapsed) {
    return (
      <div style={collapsedSidebarStyle}>
        <button onClick={onToggleCollapse} title="Expand sidebar" aria-label="Expand sidebar" style={collapseToggleButtonStyle}>
          {"\u203A"}
        </button>
        <div style={collapsedSidebarIconGroupStyle}>
          <div title="Connections" style={collapsedSidebarIconStyle}>
            {"\u26A1"}
          </div>
          <div title="Database Objects" style={collapsedSidebarIconStyle}>
            {"\u25A6"}
          </div>
        </div>
        <div style={collapsedSidebarFooterStyle}>
          <span
            title={isConnected ? "Connected" : "Disconnected"}
            style={{
              ...collapsedSidebarStatusStyle,
              background: isConnected ? "var(--status-connected)" : "var(--text-muted)",
            }}
          />
        </div>
      </div>
    );
  }

  return (
    <div style={{
      width: "var(--sidebar-width)",
      background: "var(--sidebar-bg)",
      borderRight: "1px solid var(--border-color)",
      display: "flex",
      flexDirection: "column",
      flexShrink: 0,
      overflow: "hidden",
    }}>
      <div style={sidebarHeaderRowStyle}>
        <span style={sidebarHeaderLabelStyle}>Workspace</span>
        <button onClick={onToggleCollapse} title="Collapse sidebar" aria-label="Collapse sidebar" style={collapseToggleButtonStyle}>
          {"\u2039"}
        </button>
      </div>
      {/* ── Saved Connections section ── */}
      <SavedConnectionsSection
        connections={savedConnections}
        expanded={connSectionExpanded}
        onToggle={() => setConnSectionExpanded((p) => !p)}
        activeConnectionId={activeConnectionId}
        isConnected={isConnected}
        connectingId={connectingId}
        onQuickConnect={onQuickConnect}
        onEdit={onEditConnection}
        onDelete={onDeleteConnection}
        onToggleFavorite={onToggleFavorite}
      />

      {/* ��─ Database Objects section ── */}
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
              background: "var(--panel-bg)",
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

// ── Saved Connections in sidebar ──

interface SavedConnectionsSectionProps {
  connections: SavedConnection[];
  expanded: boolean;
  onToggle: () => void;
  activeConnectionId: string | null;
  isConnected: boolean;
  connectingId: string | null;
  onQuickConnect: (id: string) => void;
  onEdit: (conn: SavedConnection) => void;
  onDelete: (id: string, name: string) => void;
  onToggleFavorite: (id: string) => void;
}

function SavedConnectionsSection({
  connections,
  expanded,
  onToggle,
  activeConnectionId,
  isConnected,
  connectingId,
  onQuickConnect,
  onEdit,
  onDelete,
  onToggleFavorite,
}: SavedConnectionsSectionProps) {
  const [detailsOpenId, setDetailsOpenId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const detailsRef = useRef<HTMLDivElement>(null);

  // Close details popover when clicking outside
  useEffect(() => {
    if (!detailsOpenId) return;
    const handler = (e: MouseEvent) => {
      if (detailsRef.current && !detailsRef.current.contains(e.target as Node)) {
        setDetailsOpenId(null);
        setConfirmDeleteId(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [detailsOpenId]);

  return (
    <div style={{ borderBottom: "1px solid var(--border-subtle)" }}>
      {/* Section header */}
      <button
        onClick={onToggle}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "8px 12px",
          background: "transparent",
          border: "none",
          borderRadius: 0,
          color: "var(--text-muted)",
          fontSize: 11,
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          textAlign: "left",
          cursor: "pointer",
        }}
      >
        <span style={{
          fontSize: 10,
          transition: "transform 0.15s",
          transform: expanded ? "rotate(90deg)" : "rotate(0deg)",
          display: "inline-block",
        }}>
          {"\u25B6"}
        </span>
        <span>Connections</span>
        <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--text-muted)" }}>
          {connections.length || ""}
        </span>
      </button>

      {/* Expanded list */}
      {expanded && (
        <div style={{ maxHeight: 220, overflowY: "auto", paddingBottom: 4 }}>
          {connections.length === 0 ? (
            <div style={{ padding: "6px 12px 6px 30px", fontSize: 11, color: "var(--text-muted)", fontStyle: "italic" }}>
              No saved connections
            </div>
          ) : (
            connections.map((conn) => {
              const isActive = activeConnectionId === conn.id && isConnected;
              const isThisConnecting = connectingId === conn.id;
              const isDetailsOpen = detailsOpenId === conn.id;

              return (
                <div key={conn.id} style={{ position: "relative" }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 4,
                      padding: "4px 8px 4px 18px",
                      background: isActive ? "var(--selected-bg)" : "transparent",
                      borderLeft: isActive ? "2px solid var(--status-connected)" : "2px solid transparent",
                    }}
                  >
                    {/* Favorite star */}
                    <span
                      style={{ fontSize: 11, color: conn.isFavorite ? "var(--warning)" : "var(--text-muted)", cursor: "pointer", flexShrink: 0, lineHeight: 1 }}
                      onClick={() => onToggleFavorite(conn.id)}
                      title={conn.isFavorite ? "Unfavorite" : "Favorite"}
                    >
                      {conn.isFavorite ? "\u2605" : "\u2606"}
                    </span>

                    {/* Connection name */}
                    <span style={{
                      flex: 1,
                      fontSize: 12,
                      color: isActive ? "var(--status-connected)" : "var(--text-primary)",
                      fontWeight: isActive ? 600 : 400,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}>
                      {conn.friendlyName}
                    </span>

                    {/* Action buttons */}
                    {isActive ? (
                      <span style={{ fontSize: 10, color: "var(--status-connected)", fontWeight: 600, flexShrink: 0 }}>
                        {"\u2022"} Active
                      </span>
                    ) : (
                      <button
                        onClick={() => onQuickConnect(conn.id)}
                        disabled={isThisConnecting}
                        style={sidebarSmallBtnStyle}
                        title="Connect"
                      >
                        {isThisConnecting ? "..." : "Connect"}
                      </button>
                    )}
                    <button
                      onClick={() => setDetailsOpenId(isDetailsOpen ? null : conn.id)}
                      style={sidebarSmallBtnStyle}
                      title="Details"
                    >
                      {"\u2026"}
                    </button>
                  </div>

                  {/* Details popover */}
                  {isDetailsOpen && (
                    <div ref={detailsRef} style={detailsPopoverStyle}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)", marginBottom: 8 }}>
                        {conn.friendlyName}
                      </div>

                      <div style={detailRowStyle}>
                        <span style={detailLabelStyle}>Type</span>
                        <span>{conn.mode === "tns" ? "TNS" : "Manual"}</span>
                      </div>
                      <div style={detailRowStyle}>
                        <span style={detailLabelStyle}>User</span>
                        <span>{conn.username}</span>
                      </div>
                      {conn.mode === "tns" ? (
                        <>
                          <div style={detailRowStyle}>
                            <span style={detailLabelStyle}>Alias</span>
                            <span>{conn.tnsAlias}</span>
                          </div>
                          {conn.tnsFilePath && (
                            <div style={detailRowStyle}>
                              <span style={detailLabelStyle}>TNS File</span>
                              <span style={{ wordBreak: "break-all" }}>{conn.tnsFilePath}</span>
                            </div>
                          )}
                        </>
                      ) : (
                        <div style={detailRowStyle}>
                          <span style={detailLabelStyle}>Target</span>
                          <span>{conn.host}:{conn.port}/{conn.serviceName}</span>
                        </div>
                      )}
                      {conn.lastUsedAt && (
                        <div style={detailRowStyle}>
                          <span style={detailLabelStyle}>Last used</span>
                          <span>{new Date(conn.lastUsedAt).toLocaleDateString()}</span>
                        </div>
                      )}

                      <div style={{ display: "flex", gap: 6, marginTop: 10, borderTop: "1px solid var(--border-color)", paddingTop: 8 }}>
                        <button onClick={() => { onEdit(conn); setDetailsOpenId(null); }} style={popoverBtnStyle}>
                          Edit
                        </button>
                        {confirmDeleteId === conn.id ? (
                          <>
                            <span style={{ fontSize: 11, color: "var(--danger)", alignSelf: "center" }}>Confirm?</span>
                            <button onClick={() => { onDelete(conn.id, conn.friendlyName); setDetailsOpenId(null); setConfirmDeleteId(null); }} style={{ ...popoverBtnStyle, color: "var(--danger)", borderColor: "var(--danger)" }}>
                              Yes
                            </button>
                            <button onClick={() => setConfirmDeleteId(null)} style={popoverBtnStyle}>
                              No
                            </button>
                          </>
                        ) : (
                          <button onClick={() => setConfirmDeleteId(conn.id)} style={{ ...popoverBtnStyle, color: "var(--danger)" }}>
                            Delete
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

const sidebarSmallBtnStyle: React.CSSProperties = {
  fontSize: 10,
  padding: "1px 6px",
  background: "transparent",
  border: "1px solid var(--border-color)",
  borderRadius: "var(--radius)",
  color: "var(--text-secondary)",
  cursor: "pointer",
  flexShrink: 0,
  lineHeight: "16px",
};

const detailsPopoverStyle: React.CSSProperties = {
  position: "absolute",
  left: "100%",
  top: 0,
  zIndex: 100,
  width: 260,
  padding: 12,
  background: "var(--popup-bg)",
  border: "1px solid var(--border-color)",
  borderRadius: 6,
  boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
  fontSize: 11,
  color: "var(--text-secondary)",
};

const detailRowStyle: React.CSSProperties = {
  display: "flex",
  gap: 8,
  padding: "2px 0",
  fontSize: 11,
  lineHeight: 1.5,
};

const detailLabelStyle: React.CSSProperties = {
  color: "var(--text-muted)",
  fontWeight: 600,
  minWidth: 55,
  flexShrink: 0,
};

const popoverBtnStyle: React.CSSProperties = {
  fontSize: 11,
  padding: "3px 10px",
  background: "transparent",
  border: "1px solid var(--border-color)",
  borderRadius: "var(--radius)",
  color: "var(--text-secondary)",
  cursor: "pointer",
};

// ── Section component ──

const sidebarHeaderRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "6px 8px 6px 12px",
  borderBottom: "1px solid var(--border-subtle)",
  background: "color-mix(in srgb, var(--sidebar-bg) 82%, black)",
};

const sidebarHeaderLabelStyle: React.CSSProperties = {
  fontSize: 10,
  color: "var(--text-muted)",
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  fontWeight: 600,
};

const collapseToggleButtonStyle: React.CSSProperties = {
  width: 24,
  height: 24,
  padding: 0,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  background: "transparent",
  border: "1px solid var(--border-subtle)",
  color: "var(--text-muted)",
  lineHeight: 1,
  fontSize: 16,
  flexShrink: 0,
};

const collapsedSidebarStyle: React.CSSProperties = {
  width: 42,
  background: "var(--sidebar-bg)",
  borderRight: "1px solid var(--border-color)",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  flexShrink: 0,
  overflow: "hidden",
  padding: "6px 0",
  gap: 10,
};

const collapsedSidebarIconGroupStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: 8,
  paddingTop: 4,
};

const collapsedSidebarIconStyle: React.CSSProperties = {
  width: 26,
  height: 26,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: 13,
  color: "var(--text-secondary)",
};

const collapsedSidebarFooterStyle: React.CSSProperties = {
  marginTop: "auto",
  paddingBottom: 4,
};

const collapsedSidebarStatusStyle: React.CSSProperties = {
  display: "block",
  width: 8,
  height: 8,
  borderRadius: 999,
};

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
          {"\u25B6"}
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

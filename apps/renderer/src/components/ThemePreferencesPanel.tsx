import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { useEditorTheme } from "../hooks/EditorThemeContext";
import { useToastContext } from "../hooks/ToastContext";
import type { EditorThemeConfig } from "../lib/editorTheme";
import { DEFAULT_THEME, FIXED_FONT_FAMILY, getContrastWarning, isThemeDefault } from "../lib/editorTheme";

const PREVIEW_SQL = `SELECT employee_id,
       first_name || ' ' || last_name AS full_name,
       salary * 12 AS annual_salary
  FROM employees
 WHERE salary > 5000
   AND hire_date >= DATE '2020-01-01'
 ORDER BY salary DESC;`;

interface ThemeField {
  key: keyof EditorThemeConfig;
  label: string;
  kind?: "color" | "range";
  min?: number;
  max?: number;
  step?: number;
}

interface ThemeGroup {
  title: string;
  fields: ThemeField[];
}

interface ThemePreferencesPanelProps {
  onClose?: () => void;
}

const GROUPS: ThemeGroup[] = [
  {
    title: "Cores do App",
    fields: [
      { key: "appBg", label: "Fundo do app" },
      { key: "panelBg", label: "Painéis" },
      { key: "surfaceBg", label: "Superfície elevada" },
      { key: "hoverBg", label: "Estado hover" },
      { key: "selectedBg", label: "Estado selecionado" },
      { key: "activeBg", label: "Estado ativo" },
      { key: "focusColor", label: "Foco / destaque" },
    ],
  },
  {
    title: "Texto e Bordas",
    fields: [
      { key: "textPrimary", label: "Texto principal" },
      { key: "textSecondary", label: "Texto secundário" },
      { key: "textTitle", label: "Títulos" },
      { key: "textPlaceholder", label: "Placeholders" },
      { key: "textMuted", label: "Texto suave" },
      { key: "borderColor", label: "Bordas" },
      { key: "dividerColor", label: "Divisórias" },
    ],
  },
  {
    title: "Sidebar",
    fields: [
      { key: "sidebarBg", label: "Fundo da sidebar" },
      { key: "popupBg", label: "Popovers" },
    ],
  },
  {
    title: "Barra Superior",
    fields: [
      { key: "topbarBg", label: "Fundo da topbar" },
      { key: "statusConnected", label: "Status conectado" },
      { key: "statusDisconnected", label: "Status desconectado" },
      { key: "statusPending", label: "Transação pendente" },
    ],
  },
  {
    title: "Abas e Painéis",
    fields: [
      { key: "tabBarBg", label: "Barra de abas" },
      { key: "tabActiveBg", label: "Aba ativa" },
      { key: "modalBg", label: "Modais" },
    ],
  },
  {
    title: "Editor SQL",
    fields: [
      { key: "bgEditor", label: "Fundo do editor" },
      { key: "bgGutter", label: "Fundo da numeração" },
      { key: "textDefault", label: "Texto padrão" },
      { key: "activeLine", label: "Linha ativa" },
      { key: "selection", label: "Seleção" },
      { key: "cursor", label: "Cursor" },
      { key: "scopeLineColor", label: "Linha de escopo" },
      { key: "textKeyword", label: "Palavras-chave" },
      { key: "textString", label: "Strings" },
      { key: "textNumber", label: "Números" },
      { key: "textComment", label: "Comentários" },
      { key: "textIdentifier", label: "Identificadores" },
      { key: "textOperator", label: "Operadores" },
      { key: "textPunctuation", label: "Pontuação" },
      { key: "scopeLineOpacity", label: "Opacidade da linha de escopo", kind: "range", min: 0.1, max: 0.75, step: 0.01 },
    ],
  },
  {
    title: "Resultados e Grid",
    fields: [
      { key: "resultViewerBg", label: "Visualizador de resultados" },
      { key: "gridBg", label: "Fundo do grid" },
      { key: "gridHeaderBg", label: "Cabeçalho do grid" },
      { key: "gridAltRowBg", label: "Linha alternada" },
      { key: "cellSelectedBg", label: "Célula selecionada" },
      { key: "cellEditingBg", label: "Célula em edição" },
      { key: "cellModifiedBg", label: "Célula modificada" },
      { key: "rowPendingBg", label: "Linha pendente" },
    ],
  },
  {
    title: "Botões e Feedback",
    fields: [
      { key: "buttonPrimaryBg", label: "Botão primário" },
      { key: "buttonPrimaryText", label: "Texto do botão primário" },
      { key: "buttonSecondaryBg", label: "Botão secundário" },
      { key: "buttonSecondaryText", label: "Texto do botão secundário" },
      { key: "buttonDisabledBg", label: "Botão desabilitado" },
      { key: "buttonDisabledText", label: "Texto desabilitado" },
      { key: "info", label: "Info" },
      { key: "success", label: "Sucesso" },
      { key: "warning", label: "Aviso" },
      { key: "danger", label: "Erro" },
    ],
  },
  {
    title: "Visualizador de Código e Rolagem",
    fields: [
      { key: "codeViewerBg", label: "Visualizador de código" },
      { key: "scrollbarTrack", label: "Trilha da rolagem" },
      { key: "scrollbarThumb", label: "Indicador da rolagem" },
      { key: "scrollbarThumbHover", label: "Hover da rolagem" },
    ],
  },
];

export function ThemePreferencesPanel({ onClose }: ThemePreferencesPanelProps) {
  const {
    theme,
    savedThemes,
    userDefaultThemeId,
    activeSavedThemeId,
    updateTheme,
    resetTheme,
    saveCurrentThemeAsPreset,
    applySavedTheme,
    renameSavedTheme,
    deleteSavedTheme,
    duplicateSavedTheme,
    setUserDefaultTheme,
  } = useEditorTheme();
  const toast = useToastContext();
  const contrastWarning = useMemo(() => getContrastWarning(theme), [theme]);
  const defaultTheme = useMemo(() => isThemeDefault(theme), [theme]);
  const [newThemeName, setNewThemeName] = useState("");
  const [selectedThemeId, setSelectedThemeId] = useState<string | null>(activeSavedThemeId);
  const [renamingThemeId, setRenamingThemeId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [pendingDeleteThemeId, setPendingDeleteThemeId] = useState<string | null>(null);

  useEffect(() => {
    setSelectedThemeId((current) => {
      if (current && savedThemes.some((item) => item.id === current)) return current;
      return activeSavedThemeId ?? savedThemes[0]?.id ?? null;
    });
  }, [activeSavedThemeId, savedThemes]);

  const updateColor = useCallback((key: keyof EditorThemeConfig, value: string) => {
    updateTheme({ [key]: value });
  }, [updateTheme]);

  const updateNumber = useCallback((key: keyof EditorThemeConfig, value: number) => {
    updateTheme({ [key]: value });
  }, [updateTheme]);

  const updateFontSize = useCallback((value: number) => {
    updateTheme({ fontSize: Math.max(9, Math.min(24, value)) });
  }, [updateTheme]);

  const handleSaveTheme = useCallback(() => {
    const preset = saveCurrentThemeAsPreset(newThemeName);
    if (!preset) {
      toast.warning("Informe um nome para salvar este tema.");
      return;
    }
    setNewThemeName("");
    setSelectedThemeId(preset.id);
    toast.success(`Tema "${preset.name}" salvo.`);
  }, [newThemeName, saveCurrentThemeAsPreset, toast]);

  const handleApplyTheme = useCallback((id: string) => {
    const preset = savedThemes.find((item) => item.id === id);
    if (!preset) return;
    if (applySavedTheme(id)) {
      setSelectedThemeId(id);
      toast.success(`Tema "${preset.name}" aplicado.`);
    }
  }, [applySavedTheme, savedThemes, toast]);

  const handleStartRename = useCallback((id: string, currentName: string) => {
    setRenamingThemeId(id);
    setRenameValue(currentName);
    setSelectedThemeId(id);
  }, []);

  const handleRenameTheme = useCallback((id: string) => {
    if (!renameSavedTheme(id, renameValue)) {
      toast.warning("Informe um nome válido para o tema.");
      return;
    }
    const nextName = renameValue.trim();
    setRenamingThemeId(null);
    setRenameValue("");
    toast.success(`Tema renomeado para "${nextName}".`);
  }, [renameSavedTheme, renameValue, toast]);

  const handleDeleteTheme = useCallback((id: string) => {
    const preset = savedThemes.find((item) => item.id === id);
    if (!preset) return;
    if (activeSavedThemeId === id) {
      toast.warning("N�o � poss�vel deletar o tema atualmente em uso. Aplique outro tema primeiro.");
      return;
    }
    if (deleteSavedTheme(id)) {
      setPendingDeleteThemeId(null);
      toast.info(`Tema "${preset.name}" exclu�do.`);
      return;
    }
    toast.warning("N�o foi poss�vel excluir este tema.");
  }, [activeSavedThemeId, deleteSavedTheme, savedThemes, toast]);

  const handleDuplicateTheme = useCallback((id: string) => {
    const preset = duplicateSavedTheme(id);
    if (!preset) return;
    setSelectedThemeId(preset.id);
    toast.success(`Tema "${preset.name}" criado.`);
  }, [duplicateSavedTheme, toast]);

  const handleSetDefaultTheme = useCallback((id: string | null) => {
    if (!setUserDefaultTheme(id)) return;
    if (id) {
      const preset = savedThemes.find((item) => item.id === id);
      toast.success(`"${preset?.name ?? "Tema"}" agora é o padrão de inicialização.`);
      return;
    }
    toast.info("O tema padrão do app foi restaurado como padrão de inicialização.");
  }, [savedThemes, setUserDefaultTheme, toast]);

  const selectedTheme = savedThemes.find((item) => item.id === selectedThemeId) ?? null;

  return (
    <div style={layoutStyle}>
      <div style={settingsPaneStyle}>
        <header style={headerStyle}>
          <div>
            <div style={titleStyle}>Preferências de Tema</div>
            <div style={subtitleStyle}>As mudanças são aplicadas imediatamente. Os presets continuam disponíveis após reiniciar.</div>
          </div>
          <div style={headerActionsStyle}>
            <button onClick={resetTheme} disabled={defaultTheme} style={resetButtonStyle}>
              Resetar
            </button>
            {onClose && (
              <button onClick={onClose} style={resetButtonStyle} aria-label="Fechar preferências" title="Fechar">
                Fechar
              </button>
            )}
          </div>
        </header>

        {contrastWarning && <div style={warningStyle}>{contrastWarning}</div>}

        <section style={sectionStyle}>
          <div style={sectionTitleStyle}>Temas Salvos</div>
          <div style={presetComposerStyle}>
            <input
              value={newThemeName}
              onChange={(event) => setNewThemeName(event.target.value)}
              placeholder="Nome do tema"
              style={textInputStyle}
            />
            <button onClick={handleSaveTheme} style={saveButtonStyle}>Salvar Tema</button>
          </div>
          <div style={presetMetaRowStyle}>
            <span style={helperTextStyle}>
              {userDefaultThemeId
                ? `Padrão de inicialização: ${savedThemes.find((item) => item.id === userDefaultThemeId)?.name ?? "Tema salvo"}`
                : "Padrão de inicialização: Padrão do app"}
            </span>
            <button onClick={() => handleSetDefaultTheme(null)} disabled={!userDefaultThemeId} style={secondaryActionButtonStyle}>
              Usar Padrão do App na Inicialização
            </button>
          </div>

          {savedThemes.length === 0 ? (
            <div style={emptyStateStyle}>Nenhum tema salvo ainda. Ajuste o visual e salve a combinação atual.</div>
          ) : (
            <div style={presetListStyle}>
              {savedThemes.map((preset) => {
                const isApplied = activeSavedThemeId === preset.id;
                const isDefault = userDefaultThemeId === preset.id;
                const isSelected = selectedThemeId === preset.id;
                const isRenaming = renamingThemeId === preset.id;
                const isPendingDelete = pendingDeleteThemeId === preset.id;
                const deleteDisabledReason = isApplied
                  ? "N�o � poss�vel deletar o tema atualmente em uso. Aplique outro tema primeiro."
                  : "Excluir tema";
                return (
                  <article
                    key={preset.id}
                    onClick={() => setSelectedThemeId(preset.id)}
                    style={{
                      ...presetCardStyle,
                      borderColor: isSelected ? "var(--focus-color)" : "var(--border-color)",
                      background: isSelected ? "var(--selected-bg)" : "var(--surface-bg)",
                    }}
                  >
                    <div style={presetCardHeaderStyle}>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        {isRenaming ? (
                          <input
                            value={renameValue}
                            onChange={(event) => setRenameValue(event.target.value)}
                            onClick={(event) => event.stopPropagation()}
                            style={textInputStyle}
                            autoFocus
                          />
                        ) : (
                          <div style={presetNameStyle}>{preset.name}</div>
                        )}
                        <div style={presetDateStyle}>{formatPresetDate(preset.updatedAt)}</div>
                      </div>
                      <div style={badgeRowStyle}>
                        {isApplied && <span style={activeBadgeStyle}>Em uso</span>}
                        {isDefault && <span style={defaultBadgeStyle}>Padrão</span>}
                      </div>
                    </div>

                    <div style={swatchRowStyle}>
                      <ThemeSwatch color={preset.theme.appBg} label="App" />
                      <ThemeSwatch color={preset.theme.topbarBg} label="Topo" />
                      <ThemeSwatch color={preset.theme.focusColor} label="Destaque" />
                      <ThemeSwatch color={preset.theme.bgEditor} label="Editor" />
                    </div>

                    <div style={presetDetailsStyle}>
                      <span>{preset.theme.baseTheme}</span>
                      <span>{preset.theme.fontSize}px</span>
                      <span>{preset.theme.fontFamily.split(",")[0].replaceAll("\"", "")}</span>
                    </div>

                    <div style={presetActionsStyle} onClick={(event) => event.stopPropagation()}>
                      <button onClick={() => handleApplyTheme(preset.id)} disabled={isApplied} style={secondaryActionButtonStyle}>
                        Aplicar
                      </button>
                      {isRenaming ? (
                        <>
                          <button onClick={() => handleRenameTheme(preset.id)} style={secondaryActionButtonStyle}>Salvar Nome</button>
                          <button onClick={() => { setRenamingThemeId(null); setRenameValue(""); }} style={secondaryActionButtonStyle}>Cancelar</button>
                        </>
                      ) : (
                        <button onClick={() => handleStartRename(preset.id, preset.name)} style={secondaryActionButtonStyle}>
                          Renomear
                        </button>
                      )}
                      <button onClick={() => handleDuplicateTheme(preset.id)} style={secondaryActionButtonStyle}>Duplicar</button>
                      <button onClick={() => handleSetDefaultTheme(preset.id)} disabled={isDefault} style={secondaryActionButtonStyle}>
                        Definir como Padrão
                      </button>
                      {isPendingDelete ? (
                        <>
                          <button onClick={() => handleDeleteTheme(preset.id)} style={dangerActionButtonStyle}>
                            Confirmar Exclusão
                          </button>
                          <button onClick={() => setPendingDeleteThemeId(null)} style={secondaryActionButtonStyle}>
                            Cancelar
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => setPendingDeleteThemeId(preset.id)}
                          disabled={isApplied}
                          title={deleteDisabledReason}
                          style={dangerActionButtonStyle}
                        >
                          Excluir
                        </button>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}

          {selectedTheme && (
            <div style={selectionHintStyle}>
              Tema selecionado: <strong>{selectedTheme.name}</strong>
            </div>
          )}
        </section>

        <section style={fontSectionStyle}>
          <div style={sectionTitleStyle}>Fonte do Sistema</div>
          <div style={fontControlStyle}>
            <label style={fieldLabelStyle}>Tamanho ({theme.fontSize}px)</label>
            <input
              type="range"
              min={9}
              max={24}
              value={theme.fontSize}
              onChange={(event) => updateFontSize(Number(event.target.value))}
              style={{ accentColor: "var(--focus-color)", flex: 1 }}
            />
          </div>
          <div style={fontLockedNoteStyle}>
            Família fixa: <strong>{FIXED_FONT_FAMILY}</strong>
          </div>
        </section>

        {GROUPS.map((group) => (
          <section key={group.title} style={sectionStyle}>
            <div style={sectionTitleStyle}>{group.title}</div>
            <div style={fieldsGridStyle}>
              {group.fields.map((field) => (
                field.kind === "range" ? (
                  <RangeField
                    key={field.key}
                    field={field}
                    value={Number(theme[field.key])}
                    defaultValue={Number(DEFAULT_THEME[field.key])}
                    onChange={(value) => updateNumber(field.key, value)}
                  />
                ) : (
                  <ColorField
                    key={field.key}
                    field={field}
                    value={String(theme[field.key])}
                    defaultValue={String(DEFAULT_THEME[field.key])}
                    onChange={(value) => updateColor(field.key, value)}
                  />
                )
              ))}
            </div>
          </section>
        ))}
      </div>

      <div style={previewPaneStyle}>
        <div style={previewStickyStyle}>
          <div style={previewTitleStyle}>Pré-visualização</div>
          <ThemePreview />
          <div style={editorPreviewStyle}>
            <pre style={editorPreviewContentStyle}>{PREVIEW_SQL}</pre>
          </div>
        </div>
      </div>
    </div>
  );
}

function RangeField({
  field,
  value,
  defaultValue,
  onChange,
}: {
  field: ThemeField;
  value: number;
  defaultValue: number;
  onChange: (value: number) => void;
}) {
  const modified = value !== defaultValue;

  return (
    <div style={colorFieldStyle}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <label style={fieldLabelStyle}>{field.label}</label>
        {modified && (
          <button onClick={() => onChange(defaultValue)} title="Reset value" style={tinyButtonStyle}>
            Reset
          </button>
        )}
      </div>
      <div style={rangeInputRowStyle}>
        <input
          type="range"
          min={field.min ?? 0}
          max={field.max ?? 1}
          step={field.step ?? 0.01}
          value={value}
          onChange={(event) => onChange(Number(event.target.value))}
          style={{ accentColor: "var(--focus-color)", flex: 1 }}
        />
        <input
          value={value.toFixed(2)}
          onChange={(event) => onChange(Number(event.target.value))}
          spellCheck={false}
          style={numberInputStyle}
        />
      </div>
    </div>
  );
}

function ColorField({
  field,
  value,
  defaultValue,
  onChange,
}: {
  field: ThemeField;
  value: string;
  defaultValue: string;
  onChange: (value: string) => void;
}) {
  const colorValue = value.startsWith("#") ? value : "#ffffff";
  const modified = value !== defaultValue;

  return (
    <div style={colorFieldStyle}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <label style={fieldLabelStyle}>{field.label}</label>
        {modified && (
          <button onClick={() => onChange(defaultValue)} title="Reset color" style={tinyButtonStyle}>
            Reset
          </button>
        )}
      </div>
      <div style={colorInputRowStyle}>
        <input
          type="color"
          value={colorValue}
          onChange={(event) => onChange(event.target.value)}
          style={colorPickerStyle}
        />
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          spellCheck={false}
          style={hexInputStyle}
        />
      </div>
    </div>
  );
}
function ThemePreview() {
  return (
    <div style={previewCardStyle}>
      <div style={previewTopbarStyle}>
        <strong>Moon For Oracle</strong>
        <span style={statusPillStyle}>Connected</span>
        <button style={previewPrimaryButtonStyle}>Run</button>
        <button>Connect</button>
      </div>
      <div style={previewBodyStyle}>
        <aside style={previewSidebarStyle}>
          <div style={previewSidebarTitleStyle}>Connections</div>
          <div style={previewSidebarItemActiveStyle}>HR@ORCL</div>
          <div style={previewSidebarItemStyle}>Tables</div>
          <div style={previewSidebarItemStyle}>Packages</div>
        </aside>
        <main style={previewMainStyle}>
          <div style={previewTabsStyle}>
            <span style={previewTabActiveStyle}>SQL Editor</span>
            <span style={previewTabStyle}>EMPLOYEES</span>
          </div>
          <div style={previewPanelStyle}>
            <div style={previewGridHeaderStyle}>ID</div>
            <div style={previewGridHeaderStyle}>NAME</div>
            <div style={previewGridHeaderStyle}>STATUS</div>
            <div style={previewCellSelectedStyle}>101</div>
            <div style={previewCellStyle}>Ada Lovelace</div>
            <div style={previewCellModifiedStyle}>Modified</div>
            <div style={previewCellAltStyle}>102</div>
            <div style={previewCellAltStyle}>Grace Hopper</div>
            <div style={previewCellEditingStyle}>Editing</div>
          </div>
          <div style={feedbackRowStyle}>
            <span style={{ color: "var(--info)" }}>Info</span>
            <span style={{ color: "var(--success)" }}>Success</span>
            <span style={{ color: "var(--warning)" }}>Warning</span>
            <span style={{ color: "var(--danger)" }}>Error</span>
          </div>
        </main>
      </div>
    </div>
  );
}

function ThemeSwatch({ color, label }: { color: string; label: string }) {
  return (
    <div style={swatchItemStyle} title={`${label}: ${color}`}>
      <span style={{ ...swatchPreviewStyle, background: color }} />
      <span style={swatchLabelStyle}>{label}</span>
    </div>
  );
}

function formatPresetDate(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Saved theme";
  return `Updated ${parsed.toLocaleDateString()} ${parsed.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
}

const layoutStyle: CSSProperties = { display: "flex", height: "100%", minWidth: 0, background: "var(--app-bg)" };
const settingsPaneStyle: CSSProperties = { width: 480, overflow: "auto", borderRight: "1px solid var(--border-color)", background: "var(--panel-bg)" };
const previewPaneStyle: CSSProperties = { flex: 1, overflow: "auto", minWidth: 0, background: "var(--app-bg)" };
const previewStickyStyle: CSSProperties = { padding: 16, display: "flex", flexDirection: "column", gap: 14 };
const headerStyle: CSSProperties = { position: "sticky", top: 0, zIndex: 2, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: 16, background: "var(--panel-bg)", borderBottom: "1px solid var(--border-color)" };
const titleStyle: CSSProperties = { fontSize: 16, fontWeight: 700, color: "var(--text-title)" };
const subtitleStyle: CSSProperties = { marginTop: 3, fontSize: 11, color: "var(--text-muted)" };
const headerActionsStyle: CSSProperties = { display: "flex", alignItems: "center", gap: 8 };
const resetButtonStyle: CSSProperties = { padding: "5px 10px", fontWeight: 600 };
const warningStyle: CSSProperties = { margin: 12, padding: 10, border: "1px solid var(--warning)", background: "var(--selected-bg)", color: "var(--warning)", borderRadius: "var(--radius)", fontSize: 12 };
const sectionStyle: CSSProperties = { padding: "14px 16px", borderBottom: "1px solid var(--divider-color)" };
const fontSectionStyle: CSSProperties = { ...sectionStyle, display: "flex", flexDirection: "column", gap: 10 };
const sectionTitleStyle: CSSProperties = { marginBottom: 10, fontSize: 11, fontWeight: 800, letterSpacing: "0.04em", textTransform: "uppercase", color: "var(--focus-color)" };
const fieldsGridStyle: CSSProperties = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 };
const colorFieldStyle: CSSProperties = { minWidth: 0, display: "flex", flexDirection: "column", gap: 5 };
const fieldLabelStyle: CSSProperties = { fontSize: 11, color: "var(--text-secondary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" };
const colorInputRowStyle: CSSProperties = { display: "flex", alignItems: "center", gap: 6 };
const rangeInputRowStyle: CSSProperties = { display: "flex", alignItems: "center", gap: 8 };
const colorPickerStyle: CSSProperties = { width: 28, height: 24, padding: 0, border: "1px solid var(--border-color)", borderRadius: "var(--radius)", background: "transparent", flexShrink: 0 };
const hexInputStyle: CSSProperties = { width: "100%", minWidth: 0, padding: "4px 6px", border: "1px solid var(--border-color)", borderRadius: "var(--radius)", background: "var(--app-bg)", color: "var(--text-primary)", fontFamily: "var(--font-ui)", fontSize: 11 };
const numberInputStyle: CSSProperties = { width: 54, minWidth: 54, padding: "4px 6px", border: "1px solid var(--border-color)", borderRadius: "var(--radius)", background: "var(--app-bg)", color: "var(--text-primary)", fontFamily: "var(--font-ui)", fontSize: 11 };
const tinyButtonStyle: CSSProperties = { padding: "0 4px", fontSize: 10, border: "none", background: "transparent", color: "var(--text-muted)" };
const fontControlStyle: CSSProperties = { display: "flex", alignItems: "center", gap: 10 };
const fontLockedNoteStyle: CSSProperties = { fontSize: 12, color: "var(--text-secondary)" };
const textInputStyle: CSSProperties = { width: "100%", minWidth: 0, padding: "7px 9px", border: "1px solid var(--border-color)", borderRadius: "var(--radius)", background: "var(--app-bg)", color: "var(--text-primary)", fontSize: 12 };
const presetComposerStyle: CSSProperties = { display: "flex", alignItems: "center", gap: 8, marginBottom: 10 };
const saveButtonStyle: CSSProperties = { minWidth: 104, fontWeight: 600 };
const presetMetaRowStyle: CSSProperties = { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 12 };
const helperTextStyle: CSSProperties = { fontSize: 11, color: "var(--text-muted)" };
const emptyStateStyle: CSSProperties = { padding: 12, border: "1px dashed var(--border-color)", color: "var(--text-muted)", fontSize: 12, background: "var(--surface-bg)" };
const presetListStyle: CSSProperties = { display: "flex", flexDirection: "column", gap: 10 };
const presetCardStyle: CSSProperties = { display: "flex", flexDirection: "column", gap: 10, padding: 12, border: "1px solid var(--border-color)", cursor: "pointer", transition: "border-color 0.15s, background 0.15s" };
const presetCardHeaderStyle: CSSProperties = { display: "flex", alignItems: "flex-start", gap: 10 };
const presetNameStyle: CSSProperties = { fontSize: 13, fontWeight: 700, color: "var(--text-title)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" };
const presetDateStyle: CSSProperties = { marginTop: 3, fontSize: 11, color: "var(--text-muted)" };
const badgeRowStyle: CSSProperties = { display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" };
const activeBadgeStyle: CSSProperties = { padding: "2px 6px", border: "1px solid var(--focus-color)", color: "var(--focus-color)", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em" };
const defaultBadgeStyle: CSSProperties = { ...activeBadgeStyle, borderColor: "var(--success)", color: "var(--success)" };
const swatchRowStyle: CSSProperties = { display: "flex", gap: 8, flexWrap: "wrap" };
const swatchItemStyle: CSSProperties = { display: "flex", alignItems: "center", gap: 6, padding: "4px 6px", background: "var(--panel-bg)", border: "1px solid var(--border-color)" };
const swatchPreviewStyle: CSSProperties = { width: 12, height: 12, border: "1px solid rgba(255,255,255,0.12)" };
const swatchLabelStyle: CSSProperties = { fontSize: 10, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.04em" };
const presetDetailsStyle: CSSProperties = { display: "flex", gap: 12, flexWrap: "wrap", fontSize: 11, color: "var(--text-muted)" };
const presetActionsStyle: CSSProperties = { display: "flex", gap: 8, flexWrap: "wrap" };
const secondaryActionButtonStyle: CSSProperties = { padding: "4px 8px", background: "transparent", border: "1px solid var(--border-color)", color: "var(--text-secondary)" };
const dangerActionButtonStyle: CSSProperties = { ...secondaryActionButtonStyle, color: "var(--danger)", borderColor: "var(--danger)" };
const selectionHintStyle: CSSProperties = { marginTop: 10, fontSize: 11, color: "var(--text-muted)" };
const previewTitleStyle: CSSProperties = { fontSize: 12, fontWeight: 700, color: "var(--text-title)", textTransform: "uppercase", letterSpacing: "0.04em" };
const previewCardStyle: CSSProperties = { border: "1px solid var(--border-color)", borderRadius: "var(--radius)", overflow: "hidden", background: "var(--panel-bg)" };
const previewTopbarStyle: CSSProperties = { height: 38, display: "flex", alignItems: "center", gap: 8, padding: "0 10px", borderBottom: "1px solid var(--border-color)", background: "var(--topbar-bg)", color: "var(--text-title)" };
const statusPillStyle: CSSProperties = { marginLeft: "auto", padding: "2px 7px", border: "1px solid var(--status-connected)", color: "var(--status-connected)", borderRadius: "var(--radius)", fontSize: 11 };
const previewPrimaryButtonStyle: CSSProperties = { background: "var(--button-primary-bg)", color: "var(--button-primary-text)", border: "none" };
const previewBodyStyle: CSSProperties = { display: "flex", minHeight: 260 };
const previewSidebarStyle: CSSProperties = { width: 150, padding: 10, borderRight: "1px solid var(--border-color)", background: "var(--sidebar-bg)" };
const previewSidebarTitleStyle: CSSProperties = { marginBottom: 8, fontSize: 11, color: "var(--text-muted)", fontWeight: 700, textTransform: "uppercase" };
const previewSidebarItemStyle: CSSProperties = { padding: "6px 8px", borderRadius: "var(--radius)", color: "var(--text-secondary)", fontSize: 12 };
const previewSidebarItemActiveStyle: CSSProperties = { ...previewSidebarItemStyle, background: "var(--selected-bg)", color: "var(--status-connected)", borderLeft: "2px solid var(--status-connected)" };
const previewMainStyle: CSSProperties = { flex: 1, minWidth: 0, background: "var(--result-viewer-bg)" };
const previewTabsStyle: CSSProperties = { display: "flex", height: 32, background: "var(--tab-bar-bg)", borderBottom: "1px solid var(--border-color)" };
const previewTabStyle: CSSProperties = { padding: "8px 12px", color: "var(--text-muted)", fontSize: 12 };
const previewTabActiveStyle: CSSProperties = { ...previewTabStyle, background: "var(--tab-active-bg)", color: "var(--text-primary)", borderBottom: "2px solid var(--focus-color)" };
const previewPanelStyle: CSSProperties = { margin: 12, display: "grid", gridTemplateColumns: "70px 1fr 110px", border: "1px solid var(--border-color)", background: "var(--grid-bg)", fontFamily: "var(--font-mono)", fontSize: 12 };
const previewGridHeaderStyle: CSSProperties = { padding: 8, background: "var(--grid-header-bg)", color: "var(--focus-color)", borderBottom: "1px solid var(--border-color)", fontWeight: 700 };
const previewCellStyle: CSSProperties = { padding: 8, color: "var(--text-secondary)", borderBottom: "1px solid var(--divider-color)" };
const previewCellAltStyle: CSSProperties = { ...previewCellStyle, background: "var(--grid-alt-row-bg)" };
const previewCellSelectedStyle: CSSProperties = { ...previewCellStyle, background: "var(--cell-selected-bg)", outline: "2px solid var(--focus-color)", outlineOffset: -2 };
const previewCellModifiedStyle: CSSProperties = { ...previewCellStyle, background: "var(--cell-modified-bg)", color: "var(--text-primary)" };
const previewCellEditingStyle: CSSProperties = { ...previewCellAltStyle, background: "var(--cell-editing-bg)", outline: "2px solid var(--focus-color)", outlineOffset: -2 };
const feedbackRowStyle: CSSProperties = { display: "flex", gap: 14, padding: "0 12px 12px", fontSize: 12, fontWeight: 700 };
const editorPreviewStyle: CSSProperties = { height: 230, border: "1px solid var(--border-color)", borderRadius: "var(--radius)", overflow: "hidden", background: "var(--editor-bg)" };
const editorPreviewContentStyle: CSSProperties = { height: "100%", margin: 0, padding: "12px 14px", overflow: "auto", background: "var(--editor-bg)", color: "var(--editor-text)", fontFamily: "var(--font-mono)", fontSize: 12, lineHeight: 1.6, whiteSpace: "pre-wrap" };





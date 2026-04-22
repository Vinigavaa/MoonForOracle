import type { CSSProperties } from "react";
import type { UpdaterStatus } from "@gavadb/ipc-contract";

interface AutoUpdateDialogProps {
  status: UpdaterStatus | null;
  onDownload: () => void;
  onInstall: () => void;
  onDismiss: () => void;
}

function formatBytes(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0 MB";
  const mb = value / 1024 / 1024;
  return `${mb.toFixed(mb >= 10 ? 0 : 1)} MB`;
}

function formatSpeed(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "Calculando...";
  return `${formatBytes(value)}/s`;
}

function formatReleaseNotes(value: string): string {
  return value
    .replace(/<\/(p|div|li|h[1-6])>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<li>/gi, "- ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function AutoUpdateDialog({ status, onDownload, onInstall, onDismiss }: AutoUpdateDialogProps) {
  if (!status || status.kind === "idle" || status.kind === "checking" || status.kind === "not-available") {
    return null;
  }

  const isDownloading = status.kind === "downloading";
  const progress = isDownloading ? Math.max(0, Math.min(100, status.percent)) : 0;

  return (
    <div style={overlayStyle} role="presentation">
      <section style={dialogStyle} role="dialog" aria-modal="true" aria-labelledby="auto-update-title">
        <div style={headerStyle}>
          <div>
            <div style={eyebrowStyle}>Atualizacao do aplicativo</div>
            <h2 id="auto-update-title" style={titleStyle}>
              {status.kind === "available" && "Nova versao disponivel"}
              {status.kind === "downloading" && "Baixando atualizacao"}
              {status.kind === "downloaded" && "Atualizacao pronta"}
              {status.kind === "error" && "Nao foi possivel atualizar"}
            </h2>
          </div>
          {!isDownloading && (
            <button type="button" style={closeButtonStyle} onClick={onDismiss} aria-label="Fechar">
              x
            </button>
          )}
        </div>

        {status.kind === "available" && (
          <>
            <p style={bodyStyle}>
              A versao {status.version} esta disponivel para instalacao. Voce pode baixar agora e continuar usando o app enquanto o download acontece.
            </p>
            {status.releaseNotes && <pre style={releaseNotesStyle}>{formatReleaseNotes(status.releaseNotes)}</pre>}
            <div style={actionsStyle}>
              <button type="button" onClick={onDismiss}>
                Depois
              </button>
              <button type="button" style={primaryButtonStyle} onClick={onDownload}>
                Baixar agora
              </button>
            </div>
          </>
        )}

        {status.kind === "downloading" && (
          <>
            <p style={bodyStyle}>A atualizacao esta sendo baixada em segundo plano.</p>
            <div style={progressTrackStyle}>
              <div style={{ ...progressFillStyle, width: `${progress}%` }} />
            </div>
            <div style={progressMetaStyle}>
              <span>{progress.toFixed(0)}%</span>
              <span>
                {formatBytes(status.transferred)} de {formatBytes(status.total)} - {formatSpeed(status.bytesPerSecond)}
              </span>
            </div>
          </>
        )}

        {status.kind === "downloaded" && (
          <>
            <p style={bodyStyle}>
              A versao {status.version} foi baixada. Reinicie o aplicativo para concluir a instalacao.
            </p>
            <div style={actionsStyle}>
              <button type="button" onClick={onDismiss}>
                Mais tarde
              </button>
              <button type="button" style={primaryButtonStyle} onClick={onInstall}>
                Reiniciar e atualizar
              </button>
            </div>
          </>
        )}

        {status.kind === "error" && (
          <>
            <p style={bodyStyle}>{status.message}</p>
            <div style={actionsStyle}>
              <button type="button" style={primaryButtonStyle} onClick={onDismiss}>
                Entendi
              </button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}

const overlayStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 90,
  display: "grid",
  placeItems: "center",
  padding: 24,
  background: "rgba(0, 0, 0, 0.48)",
};

const dialogStyle: CSSProperties = {
  width: "min(460px, calc(100vw - 32px))",
  border: "1px solid var(--border-color)",
  background: "var(--modal-bg)",
  boxShadow: "0 24px 80px rgba(0, 0, 0, 0.42)",
  padding: 20,
};

const headerStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 16,
};

const eyebrowStyle: CSSProperties = {
  color: "var(--accent)",
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: 0,
  textTransform: "uppercase",
};

const titleStyle: CSSProperties = {
  margin: "4px 0 0",
  color: "var(--text-title)",
  fontSize: 20,
  fontWeight: 700,
};

const closeButtonStyle: CSSProperties = {
  width: 28,
  height: 28,
  padding: 0,
};

const bodyStyle: CSSProperties = {
  marginTop: 16,
  color: "var(--text-secondary)",
  lineHeight: 1.5,
};

const releaseNotesStyle: CSSProperties = {
  maxHeight: 140,
  overflow: "auto",
  marginTop: 12,
  padding: 12,
  border: "1px solid var(--border-subtle)",
  background: "var(--bg-primary)",
  color: "var(--text-secondary)",
  whiteSpace: "pre-wrap",
  fontFamily: "var(--font-ui)",
  fontSize: 12,
};

const actionsStyle: CSSProperties = {
  display: "flex",
  justifyContent: "flex-end",
  gap: 8,
  marginTop: 20,
};

const primaryButtonStyle: CSSProperties = {
  background: "var(--button-primary-bg)",
  color: "var(--button-primary-text)",
  borderColor: "var(--button-primary-bg)",
  fontWeight: 700,
};

const progressTrackStyle: CSSProperties = {
  height: 10,
  overflow: "hidden",
  marginTop: 18,
  border: "1px solid var(--border-subtle)",
  background: "var(--bg-primary)",
};

const progressFillStyle: CSSProperties = {
  height: "100%",
  background: "var(--accent)",
  transition: "width 0.2s ease",
};

const progressMetaStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  marginTop: 8,
  color: "var(--text-muted)",
  fontSize: 12,
};

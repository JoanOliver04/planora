"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/routing";
import {
  Archive,
  CalendarDays,
  CheckCircle2,
  Database,
  Download,
  FileJson,
  FileSpreadsheet,
  FileUp,
  LoaderCircle,
  RotateCcw,
  ShieldCheck,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import { restoreBackup } from "@/app/actions/domain";
import { ConfirmDialog } from "@/components/confirm-dialog";
import {
  buildCsvExportFiles,
  createBackup,
  MAX_BACKUP_BYTES,
  parseBackup,
  summarizeBackup,
  toIcs,
  type BackupData,
  type PlanoraBackup,
} from "./format";

type ExportKind = "json" | "csv" | "ics";
type Feedback = { tone: "success" | "error"; text: string } | null;

function download(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
}

function readableSize(bytes: number, locale: string) {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  const formatted = new Intl.NumberFormat(locale, {
    maximumFractionDigits: 1,
  }).format(value);
  return `${formatted} ${units[index]}`;
}

export function DataTools({
  data,
  locale,
  timezone,
}: {
  data: BackupData;
  locale: "es" | "en";
  timezone: string;
}) {
  const t = useTranslations("Data");
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [exporting, setExporting] = useState<ExportKind | null>(null);
  const [exportFeedback, setExportFeedback] = useState<Feedback>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PlanoraBackup | null>(null);
  const [importState, setImportState] = useState<
    "idle" | "reading" | "ready" | "invalid" | "success" | "error"
  >("idle");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [restoredSummary, setRestoredSummary] = useState<ReturnType<
    typeof summarizeBackup
  > | null>(null);
  const [restorePhase, setRestorePhase] = useState<
    "idle" | "preparing" | "safety-copy" | "restoring"
  >("idle");
  const restoring = restorePhase !== "idle";

  const exportOptions: Array<{
    kind: ExportKind;
    icon: LucideIcon;
    title: string;
    format: string;
    description: string;
    action: string;
    featured?: boolean;
  }> = [
    {
      kind: "json",
      icon: Database,
      title: t("export.json.title"),
      format: "JSON",
      description: t("export.json.description"),
      action: t("export.json.action"),
      featured: true,
    },
    {
      kind: "csv",
      icon: FileSpreadsheet,
      title: t("export.csv.title"),
      format: "CSV",
      description: t("export.csv.description"),
      action: t("export.csv.action"),
    },
    {
      kind: "ics",
      icon: CalendarDays,
      title: t("export.ics.title"),
      format: "ICS",
      description: t("export.ics.description"),
      action: t("export.ics.action"),
    },
  ];

  async function runExport(kind: ExportKind) {
    if (exporting) return;
    setExporting(kind);
    setExportFeedback(null);
    await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
    try {
      if (kind === "json") {
        download(
          "planora-backup-v4.json",
          JSON.stringify(createBackup(data), null, 2),
          "application/json",
        );
      } else if (kind === "csv") {
        // Focus notes are exported only as a clearly named PRIVATE file.
        for (const file of buildCsvExportFiles(data)) {
          download(file.name, file.content, "text/csv;charset=utf-8");
        }
      } else {
        download(
          "planora-calendar.ics",
          toIcs(data, timezone),
          "text/calendar;charset=utf-8",
        );
      }
      setExportFeedback({ tone: "success", text: t("export.success") });
    } catch {
      setExportFeedback({ tone: "error", text: t("export.error") });
    } finally {
      setExporting(null);
    }
  }

  async function readFile(file: File) {
    setSelectedFile(file);
    setPreview(null);
    setImportState("reading");
    if (
      file.size > MAX_BACKUP_BYTES ||
      !file.name.toLocaleLowerCase().endsWith(".json")
    ) {
      setImportState("invalid");
      return;
    }
    try {
      const result = parseBackup(JSON.parse(await file.text()));
      if (!result.success) {
        setImportState("invalid");
        return;
      }
      setPreview(result.data);
      setImportState("ready");
    } catch {
      setImportState("invalid");
    }
  }

  function clearFile() {
    setSelectedFile(null);
    setPreview(null);
    setImportState("idle");
    if (inputRef.current) inputRef.current.value = "";
  }

  async function restore() {
    if (!preview || restoring) return false;
    setRestorePhase("preparing");
    try {
      setRestorePhase("safety-copy");
      download(
        `planora-before-restore-${new Date().toISOString().slice(0, 10)}.json`,
        JSON.stringify(createBackup(data), null, 2),
        "application/json",
      );
      await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
      setRestorePhase("restoring");
      await restoreBackup(preview);
      setRestoredSummary(summarizeBackup(preview));
      setSelectedFile(null);
      setPreview(null);
      setImportState("success");
      if (inputRef.current) inputRef.current.value = "";
      router.refresh();
      return true;
    } catch {
      setImportState("error");
      return false;
    } finally {
      setRestorePhase("idle");
    }
  }

  const summary = preview ? summarizeBackup(preview) : null;
  const summaryLabels = {
    schedules: t("summary.schedules"),
    categories: t("summary.categories"),
    tasks: t("summary.tasks"),
    events: t("summary.events"),
    completions: t("summary.completions"),
    templates: t("summary.templates"),
    reminders: t("summary.reminders"),
    alarms: t("summary.alarms"),
    focus_presets: t("summary.focus_presets"),
    focus_sessions: t("summary.focus_sessions"),
    focus_intervals: t("summary.focus_intervals"),
    focus_goals: t("summary.focus_goals"),
  };

  return (
    <section className="workspace-page data-page">
      <header className="data-page-header">
        <div className="data-heading-icon" aria-hidden="true">
          <Archive size={23} />
        </div>
        <div>
          <p className="eyebrow">Planora</p>
          <h1 className="title">{t("title")}</h1>
          <p className="data-page-intro">{t("intro")}</p>
        </div>
      </header>

      <div className="data-management-grid">
        <section
          className="surface data-panel data-export-panel"
          aria-labelledby="data-export-title"
        >
          <div className="data-panel-heading">
            <div>
              <h2 id="data-export-title">{t("export.title")}</h2>
              <p>{t("export.description")}</p>
            </div>
            <Download size={20} aria-hidden="true" />
          </div>

          <div className="export-options">
            {exportOptions.map((option) => {
              const Icon = option.icon;
              const pending = exporting === option.kind;
              return (
                <article
                  className="export-option"
                  data-featured={option.featured || undefined}
                  key={option.kind}
                >
                  <div className="data-option-icon" aria-hidden="true">
                    <Icon size={21} />
                  </div>
                  <div className="export-option-copy">
                    <div className="export-option-title">
                      <h3>{option.title}</h3>
                      <span className="format-badge">{option.format}</span>
                    </div>
                    <p>{option.description}</p>
                  </div>
                  <button
                    className={
                      option.featured
                        ? "primary data-action"
                        : "pill data-action"
                    }
                    type="button"
                    disabled={exporting !== null}
                    aria-busy={pending}
                    onClick={() => void runExport(option.kind)}
                  >
                    {pending ? (
                      <LoaderCircle
                        className="spin"
                        size={17}
                        aria-hidden="true"
                      />
                    ) : (
                      <Download size={17} aria-hidden="true" />
                    )}
                    {pending ? t("export.loading") : option.action}
                  </button>
                </article>
              );
            })}
          </div>

          {exportFeedback && (
            <p
              className="data-feedback"
              data-tone={exportFeedback.tone}
              role="status"
            >
              {exportFeedback.tone === "success" ? (
                <CheckCircle2 size={17} aria-hidden="true" />
              ) : null}
              {exportFeedback.text}
            </p>
          )}
        </section>

        <section
          className="surface data-panel data-restore-panel"
          aria-labelledby="data-restore-title"
        >
          <div className="data-panel-heading">
            <div>
              <h2 id="data-restore-title">{t("restore.title")}</h2>
              <p>{t("restore.description")}</p>
            </div>
            <RotateCcw size={20} aria-hidden="true" />
          </div>

          <label className="file-picker" htmlFor="planora-backup-file">
            <span className="file-picker-icon" aria-hidden="true">
              <FileUp size={25} />
            </span>
            <span className="file-picker-copy">
              <strong>{t("restore.selectTitle")}</strong>
              <small>{t("restore.fileType")}</small>
            </span>
            <span className="pill file-picker-action">
              {t("restore.selectAction")}
            </span>
          </label>
          <input
            ref={inputRef}
            className="visually-hidden"
            id="planora-backup-file"
            type="file"
            aria-label={t("restore.selectTitle")}
            accept="application/json,.json"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void readFile(file);
            }}
          />

          {selectedFile && (
            <div
              className="selected-file"
              data-valid={preview ? "true" : undefined}
            >
              <FileJson size={20} aria-hidden="true" />
              <div>
                <strong>{selectedFile.name}</strong>
                <span>{readableSize(selectedFile.size, locale)}</span>
              </div>
              <button
                className="icon-button"
                type="button"
                onClick={clearFile}
                aria-label={t("restore.removeFile", {
                  name: selectedFile.name,
                })}
              >
                <Trash2 size={17} aria-hidden="true" />
              </button>
            </div>
          )}

          <div className="restore-status" aria-live="polite">
            {importState === "reading" && (
              <p className="data-feedback">
                <LoaderCircle className="spin" size={17} aria-hidden="true" />
                {t("restore.validating")}
              </p>
            )}
            {importState === "ready" && (
              <p className="data-feedback" data-tone="success">
                <CheckCircle2 size={17} aria-hidden="true" />
                {t("restore.valid")}
              </p>
            )}
            {importState === "invalid" && (
              <p className="data-feedback" data-tone="error" role="alert">
                {t("restore.invalid")}
              </p>
            )}
            {importState === "success" && (
              <p className="data-feedback" data-tone="success" role="status">
                <CheckCircle2 size={17} aria-hidden="true" />
                {t("restore.success", {
                  count: Object.values(restoredSummary ?? {}).reduce(
                    (total, count) => total + count,
                    0,
                  ),
                })}
              </p>
            )}
            {importState === "error" && (
              <p className="data-feedback" data-tone="error" role="alert">
                {t("restore.error")}
              </p>
            )}
          </div>

          {(summary ?? restoredSummary) && (
            <dl className="data-summary" aria-label={t("restore.summaryLabel")}>
              {Object.entries(summary ?? restoredSummary!).map(
                ([key, count]) => (
                  <div key={key}>
                    <dt>{summaryLabels[key as keyof typeof summaryLabels]}</dt>
                    <dd>{count}</dd>
                  </div>
                ),
              )}
            </dl>
          )}

          <p className="restore-behaviour">{t("restore.behaviour")}</p>
          <button
            className="primary restore-button"
            type="button"
            disabled={!preview || restoring}
            onClick={() => setConfirmOpen(true)}
          >
            <RotateCcw size={18} aria-hidden="true" />
            {restoring ? t(`restore.${restorePhase}`) : t("restore.action")}
          </button>
        </section>
      </div>

      <aside className="data-privacy-note" aria-label={t("privacy.title")}>
        <ShieldCheck size={21} aria-hidden="true" />
        <div>
          <h2>{t("privacy.title")}</h2>
          <p>{t("privacy.description")}</p>
        </div>
      </aside>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={t("restore.confirmTitle")}
        description={t("restore.confirmDescription")}
        details={
          preview && selectedFile && summary ? (
            <div className="restore-confirm-details">
              <dl>
                <div>
                  <dt>{t("restore.fileName")}</dt>
                  <dd>{selectedFile.name}</dd>
                </div>
                <div>
                  <dt>{t("restore.createdAt")}</dt>
                  <dd>
                    {new Intl.DateTimeFormat(locale, {
                      dateStyle: "medium",
                      timeStyle: "short",
                    }).format(new Date(preview.createdAt))}
                  </dd>
                </div>
                <div>
                  <dt>{t("restore.version")}</dt>
                  <dd>{preview.schemaVersion}</dd>
                </div>
              </dl>
              <div className="restore-confirm-summary">
                {Object.entries(summary ?? restoredSummary!).map(
                  ([key, count]) => (
                    <span key={key}>
                      {summaryLabels[key as keyof typeof summaryLabels]}:{" "}
                      {count}
                    </span>
                  ),
                )}
              </div>
              <p>{t("restore.replaceWarning")}</p>
            </div>
          ) : null
        }
        cancelLabel={t("restore.cancel")}
        confirmLabel={
          restoring ? t("restore.restoring") : t("restore.confirmAction")
        }
        variant="primary"
        onConfirm={restore}
      />
    </section>
  );
}

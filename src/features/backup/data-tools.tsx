"use client";
import { useState, useTransition } from "react";
import { restoreBackup } from "@/app/actions/domain";
import { createBackup, parseBackup, summarizeBackup, toCsv, toIcs, type BackupData, type PlanoraBackup } from "./format";

function download(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement("a"); anchor.href = url; anchor.download = name; anchor.click(); URL.revokeObjectURL(url);
}
export function DataTools({ data, locale, timezone }: { data: BackupData; locale: "es" | "en"; timezone: string }) {
  const es = locale === "es", [preview, setPreview] = useState<PlanoraBackup | null>(null), [message, setMessage] = useState(""), [pending, start] = useTransition();
  const labels = es ? { title: "Tus datos", intro: "Descarga una copia privada o restaura un archivo de Planora.", backup: "Copia completa JSON", csv: "Tablas CSV", ics: "Calendario ICS", import: "Seleccionar copia", restore: "Confirmar restauración", invalid: "El archivo no es una copia compatible.", ready: "Contenido validado. Revisa el resumen antes de escribir datos.", done: "Restauración completada. Los recordatorios se importaron desactivados." } : { title: "Your data", intro: "Download a private copy or restore a Planora file.", backup: "Full JSON backup", csv: "CSV tables", ics: "ICS calendar", import: "Select backup", restore: "Confirm restore", invalid: "This file is not a compatible backup.", ready: "Validated. Review the summary before writing data.", done: "Restore complete. Imported reminders were disabled." };
  const backup = () => download("planora-backup-v1.json", JSON.stringify(createBackup(data), null, 2), "application/json");
  const read = async (file?: File) => { if (!file) return; try { const result = parseBackup(JSON.parse(await file.text())); if (!result.success) throw new Error(); setPreview(result.data); setMessage(labels.ready); } catch { setPreview(null); setMessage(labels.invalid); } };
  return <main className="workspace-page"><header><p className="eyebrow">Planora</p><h1>{labels.title}</h1><p>{labels.intro}</p></header>
    <section className="panel"><h2>{es ? "Exportar" : "Export"}</h2><div className="button-row"><button onClick={backup}>{labels.backup}</button><button onClick={() => { for (const [name, rows] of Object.entries(data)) if (Array.isArray(rows)) download("planora-" + name + ".csv", toCsv(rows), "text/csv;charset=utf-8"); }}>{labels.csv}</button><button onClick={() => download("planora-calendar.ics", toIcs(data, timezone), "text/calendar;charset=utf-8")}>{labels.ics}</button></div></section>
    <section className="panel"><h2>{es ? "Restaurar" : "Restore"}</h2><label className="button secondary">{labels.import}<input hidden type="file" accept="application/json,.json" onChange={(event) => void read(event.target.files?.[0])} /></label>{message && <p role="status">{message}</p>}{preview && <><dl className="data-summary">{Object.entries(summarizeBackup(preview)).map(([key, count]) => <div key={key}><dt>{key}</dt><dd>{count}</dd></div>)}</dl><p>{es ? "La restauración añade copias; no elimina tus datos actuales." : "Restore adds copies; it does not delete current data."}</p><button disabled={pending} onClick={() => start(async () => { await restoreBackup(preview); setPreview(null); setMessage(labels.done); })}>{labels.restore}</button></>}</section>
  </main>;
}

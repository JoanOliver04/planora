import { readdirSync, readFileSync } from "node:fs";
import { extname, join } from "node:path";
import { describe, expect, it } from "vitest";
import en from "@/messages/en.json";
import es from "@/messages/es.json";

const suspiciousMojibake = /(?:Ã|Â|â€|�)/u;
const sourceExtensions = new Set([".ts", ".tsx", ".json", ".sql"]);

function filesUnder(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return filesUnder(path);
    return sourceExtensions.has(extname(entry.name)) ? [path] : [];
  });
}

function keys(value: unknown, prefix = ""): string[] {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return [prefix];
  return Object.entries(value).flatMap(([key, child]) =>
    keys(child, prefix ? `${prefix}.${key}` : key),
  );
}

describe("translation encoding", () => {
  it("keeps application and migration sources free from common mojibake", () => {
    const corrupted = [...filesUnder("src"), ...filesUnder("supabase")].filter(
      (file) => suspiciousMojibake.test(readFileSync(file, "utf8")),
    );
    expect(corrupted).toEqual([]);
  });

  it("keeps Spanish Unicode characters intact", () => {
    expect(es.Workspace.add).toBe("Añadir");
    expect(es.Workspace.loading).toBe("Cargando…");
    expect(es.Workspace.configuration).toBe("Configuración");
    expect(es.Workspace.category).toBe("Categoría");
    expect(es.Workspace.habits).toBe("Hábitos");
    expect(es.Workspace.morning).toBe("Mañana");
    expect(es.Workspace.wednesday).toBe("Miércoles");
    expect(es.Workspace.last7Days).toBe("Últimos 7 días");
    expect(es.Workspace.areYouSure).toBe("¿Estás seguro?");
    expect(es.Workspace.accountDeletion).toBe("Eliminación de cuenta");
  });

  it("keeps Spanish and English translation keys in parity", () => {
    expect(keys(es).sort()).toEqual(keys(en).sort());
  });
});

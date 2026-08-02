import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");
const view = read("src/features/workspace/task-views.tsx");
const action = read("src/app/actions/domain.ts");
const migration = read(
  "supabase/migrations/20260802220000_delete_archived_task.sql",
);
const spanish = read("src/messages/es.json");
const english = read("src/messages/en.json");

describe("archived task trash", () => {
  it("shows permanent deletion only for archived tasks with confirmation", () => {
    expect(view).toContain("task.archived_at && (");
    expect(view).toContain("setDeleteTask(task)");
    expect(view).toContain('t("deleteArchivedTaskWarning")');
    expect(view).toContain("await deleteArchivedTask(deleteTask.id)");
  });

  it("deletes only an authenticated user's archived task atomically", () => {
    expect(action).toContain('.rpc("delete_archived_task"');
    expect(migration).toContain("security invoker");
    expect(migration).toContain("current_user_id uuid := (select auth.uid())");
    expect(migration).toContain("and archived_at is not null");
    expect(migration).toContain("delete from public.task_completions");
    expect(migration).toContain("delete from public.tasks");
    expect(migration).toContain(
      "grant execute on function public.delete_archived_task(uuid) to authenticated",
    );
    expect(migration).toContain(
      "revoke all on function public.delete_archived_task(uuid) from anon",
    );
  });

  it("explains the irreversible effects in both languages", () => {
    expect(JSON.parse(spanish).Workspace.deleteArchivedTaskWarning).toContain(
      "historial",
    );
    expect(JSON.parse(english).Workspace.deleteArchivedTaskWarning).toContain(
      "completion history",
    );
  });
});

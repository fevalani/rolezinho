import { describe, it, expect } from "vitest";
import { addAdmin, fetchAdminIds, fetchUsers, removeAdmin } from "@/features/admin/adminService";
import { mockDb } from "./supabaseMock";

describe("adminService", () => {
  it("fetchUsers mapeia o perfil e dá valores seguros", async () => {
    mockDb.tables.profiles = [
      { id: "a", display_name: " Ana ", email: "a@x.com", avatar_url: "u.png", app_version: "web 0.0.90", app_last_seen_at: "2026-11-18T10:00:00Z", created_at: "2026-01-01T00:00:00Z" },
      { id: "b", display_name: "", email: null },
    ];
    expect(await fetchUsers()).toEqual([
      { id: "a", displayName: "Ana", email: "a@x.com", avatarUrl: "u.png", appVersion: "web 0.0.90", lastSeenAt: "2026-11-18T10:00:00Z", createdAt: "2026-01-01T00:00:00Z" },
      { id: "b", displayName: "Sem nome", email: "", avatarUrl: null, appVersion: null, lastSeenAt: null, createdAt: null },
    ]);
    mockDb.errors.profiles = { message: "x" };
    expect(await fetchUsers()).toEqual([]);
  });

  it("fetchAdminIds", async () => {
    mockDb.tables.app_admins = [{ user_id: "a" }, { user_id: "b" }];
    expect(await fetchAdminIds()).toEqual(["a", "b"]);
    mockDb.errors.app_admins = { message: "x" };
    expect(await fetchAdminIds()).toEqual([]);
  });

  it("addAdmin grava quem foi e quem adicionou", async () => {
    expect(await addAdmin("novo", "eu")).toEqual({ error: null });
    const w = mockDb.writes.find((x) => x.table === "app_admins")!;
    expect(w.op).toBe("insert");
    expect(w.args[0]).toEqual({ user_id: "novo", added_by: "eu" });
  });

  it("removeAdmin filtra pelo usuário e repassa a mensagem do banco (último admin)", async () => {
    expect(await removeAdmin("x")).toEqual({ error: null });
    const q = mockDb.queries.find((x) => x.table === "app_admins")!;
    expect(q.calls).toContainEqual(["eq", ["user_id", "x"]]);
    mockDb.errors.app_admins = { message: "Não é possível remover o último administrador" };
    expect((await removeAdmin("x")).error).toMatch(/último administrador/);
    expect((await addAdmin("y", "eu")).error).toMatch(/último administrador/); // qualquer erro do banco volta como texto
  });
});

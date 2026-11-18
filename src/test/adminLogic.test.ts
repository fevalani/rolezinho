import { describe, it, expect } from "vitest";
import { adminCandidates, compareVersions, filterUsers, isOutdated, lastSeenLabel, parseWebVersion, removeBlockReason, sortByLastSeen, summarizeUsers } from "@/features/admin/adminLogic";
import type { AdminUser } from "@/features/admin/adminTypes";

const u = (id: string, displayName: string, email = `${id}@x.com`): AdminUser => ({ id, displayName, email, avatarUrl: null, appVersion: null, lastSeenAt: null, createdAt: null });

describe("removeBlockReason", () => {
  it("não deixa remover a si mesmo nem o único admin", () => {
    expect(removeBlockReason(["a", "b"], "a", "a")).toMatch(/si mesmo/);
    expect(removeBlockReason(["a"], "a", "b")).toMatch(/único/);
    expect(removeBlockReason(["a"], "a", "a")).toMatch(/si mesmo/); // a regra de si mesmo vem primeiro
  });
  it("libera remover outro quando sobra mais de um", () => {
    expect(removeBlockReason(["a", "b"], "b", "a")).toBeNull();
    expect(removeBlockReason(["a", "b", "c"], "c", undefined)).toBeNull();
  });
});

describe("adminCandidates", () => {
  const users = [u("1", "Ana Souza"), u("2", "Beto Lima", "beto@teste.com"), u("3", "Caio")];
  it("tira quem já é admin", () => {
    expect(adminCandidates(users, ["1"], "").map((x) => x.id)).toEqual(["2", "3"]);
  });
  it("busca por nome ou e-mail, sem acento/caixa", () => {
    expect(adminCandidates(users, [], "BETO").map((x) => x.id)).toEqual(["2"]);
    expect(adminCandidates(users, [], "teste.com").map((x) => x.id)).toEqual(["2"]);
    expect(adminCandidates(users, [], "  ana  ").map((x) => x.id)).toEqual(["1"]);
    expect(adminCandidates(users, [], "zzz")).toEqual([]);
  });
});

describe("usuários: versão e última abertura", () => {
  const mk = (id: string, name: string, over: Partial<AdminUser> = {}): AdminUser => ({ ...u(id, name), ...over });
  const now = new Date("2026-11-18T12:00:00Z");

  it("parseWebVersion lê a versão web de web-only e de APK", () => {
    expect(parseWebVersion("web 0.0.90")).toBe("0.0.90");
    expect(parseWebVersion("1.0.2 (12) · web 0.0.88")).toBe("0.0.88");
    expect(parseWebVersion("1.0.2 (12)")).toBeNull();
    expect(parseWebVersion(null)).toBeNull();
    expect(parseWebVersion("web ?")).toBeNull();
  });

  it("compareVersions compara como número, não como texto", () => {
    expect(compareVersions("0.0.9", "0.0.10")).toBeLessThan(0);
    expect(compareVersions("0.1.0", "0.0.99")).toBeGreaterThan(0);
    expect(compareVersions("1.2.3", "1.2.3")).toBe(0);
    expect(compareVersions("1.2", "1.2.0")).toBe(0);
  });

  it("isOutdated só alarma com os dois lados conhecidos", () => {
    expect(isOutdated(mk("1", "A", { appVersion: "web 0.0.80" }), "0.0.90")).toBe(true);
    expect(isOutdated(mk("1", "A", { appVersion: "web 0.0.90" }), "0.0.90")).toBe(false);
    expect(isOutdated(mk("1", "A", { appVersion: "web 0.0.95" }), "0.0.90")).toBe(false);
    expect(isOutdated(mk("1", "A", { appVersion: null }), "0.0.90")).toBe(false);
    expect(isOutdated(mk("1", "A", { appVersion: "web 0.0.80" }), undefined)).toBe(false);
  });

  it("lastSeenLabel", () => {
    expect(lastSeenLabel(null, now)).toBe("nunca abriu");
    expect(lastSeenLabel("lixo", now)).toBe("nunca abriu");
    expect(lastSeenLabel("2026-11-18T08:00:00Z", now)).toBe("hoje");
    expect(lastSeenLabel("2026-11-17T08:00:00Z", now)).toBe("ontem");
    expect(lastSeenLabel("2026-11-08T12:00:00Z", now)).toBe("há 10 dias");
  });

  it("ordena por última abertura (nunca no fim) e filtra por nome/e-mail", () => {
    const list = [mk("1", "Zé"), mk("2", "Ana", { lastSeenAt: "2026-11-01T00:00:00Z" }), mk("3", "Beto", { lastSeenAt: "2026-11-17T00:00:00Z" }), mk("4", "Caio")];
    expect(sortByLastSeen(list).map((x) => x.displayName)).toEqual(["Beto", "Ana", "Caio", "Zé"]);
    expect(list[0].displayName).toBe("Zé"); // não muda a lista original
    expect(filterUsers(list, "AN").map((x) => x.id)).toEqual(["2"]);
    expect(filterUsers(list, "3@x").map((x) => x.id)).toEqual(["3"]);
    expect(filterUsers(list, "  ")).toHaveLength(4);
  });

  it("summarizeUsers", () => {
    const list = [
      mk("1", "A", { lastSeenAt: "2026-11-17T00:00:00Z", appVersion: "web 0.0.90" }),
      mk("2", "B", { lastSeenAt: "2026-10-01T00:00:00Z", appVersion: "web 0.0.50" }),
      mk("3", "C"),
    ];
    expect(summarizeUsers(list, "0.0.90", now)).toEqual({ total: 3, activeLast7d: 1, outdated: 1, neverSeen: 1 });
  });
});

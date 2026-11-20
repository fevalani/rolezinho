import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  generateOdds,
  ensureWallet,
  fetchWallet,
  fetchDuels,
  fetchDuelById,
  createDuel,
  closeDuel,
  resolveDuel,
  placeBet,
  deleteBet,
  claimPayout,
  fetchBetsForDuel,
} from "@/features/arena/arenaService";
import { mockDb, supabaseMock } from "./supabaseMock";

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

const gemini = (text: string) => ({
  ok: true,
  status: 200,
  json: async () => ({ candidates: [{ content: { parts: [{ text }] } }] }),
});

describe("generateOdds (Gemini)", () => {
  it("lê o JSON e devolve as odds", async () => {
    fetchMock.mockResolvedValue(
      gemini('{"odds_a":1.8,"odds_b":3.5,"odds_c":2.1,"justification":"porque sim"}'),
    );
    expect(await generateOdds("caso", "A", "B", "C", "")).toEqual({
      odds_a: 1.8,
      odds_b: 3.5,
      odds_c: 2.1,
      justification: "porque sim",
    });
  });
  it("aceita a resposta embrulhada em ```json", async () => {
    fetchMock.mockResolvedValue(
      gemini('```json\n{"odds_a":2,"odds_b":2,"odds_c":4,"justification":"x"}\n```'),
    );
    expect((await generateOdds("c", "A", "B", "C", "")).odds_c).toBe(4);
  });
  it("nunca devolve odd abaixo de 1.01 e troca valor inválido pelo padrão", async () => {
    fetchMock.mockResolvedValue(gemini('{"odds_a":0.5,"odds_b":"abc","odds_c":-3}'));
    const r = await generateOdds("c", "A", "B", "C", "");
    expect(r.odds_a).toBe(1.01);
    expect(r.odds_b).toBe(2.0);
    expect(r.odds_c).toBe(1.01);
  });
  it("cota esgotada (429) tenta o próximo modelo", async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: false, status: 429 })
      .mockResolvedValueOnce(gemini('{"odds_a":3,"odds_b":3,"odds_c":3,"justification":""}'));
    const r = await generateOdds("c", "A", "B", "C", "");
    expect(r.odds_a).toBe(3);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0]).toContain("gemini-2.0-flash:");
    expect(fetchMock.mock.calls[1][0]).toContain("gemini-2.0-flash-lite:");
  });
  it("todos os modelos sem cota => odds padrão (não quebra a criação do caso)", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 429 });
    expect(await generateOdds("c", "A", "B", "C", "")).toEqual({
      odds_a: 2.0,
      odds_b: 2.0,
      odds_c: 3.0,
      justification: "",
    });
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });
  it("erro da API ou JSON inválido => odds padrão", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500, text: async () => "erro" });
    expect((await generateOdds("c", "A", "B", "C", "")).odds_a).toBe(2.0);
    fetchMock.mockResolvedValue(gemini("isso não é json"));
    expect((await generateOdds("c", "A", "B", "C", "")).odds_c).toBe(3.0);
  });
  it("envia o contexto do criador no prompt", async () => {
    fetchMock.mockResolvedValue(gemini("{}"));
    await generateOdds("Quem ganha?", "X", "Y", "Z", "só filmes em inglês");
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    const prompt: string = body.contents[0].parts[0].text;
    expect(prompt).toContain("Quem ganha?");
    expect(prompt).toContain("só filmes em inglês");
  });
});

const rpcArgs = (name: string) => supabaseMock.rpc.mock.calls.find((c) => c[0] === name)?.[1];
const noMoneyWrites = () =>
  expect(mockDb.writes.some((w) => w.table === "arena_wallets" || w.table === "arena_bets")).toBe(false);

describe("carteira", () => {
  it("ensureWallet usa a RPC (o cliente nunca grava o saldo) e devolve a carteira", async () => {
    mockDb.rpcResults.arena_ensure_wallet = { user_id: "u1", balance: 750, updated_at: "x" };
    expect((await ensureWallet("u1")).balance).toBe(750);
    expect(mockDb.writes).toHaveLength(0);
  });
  it("ensureWallet aceita a RPC devolvendo lista", async () => {
    mockDb.rpcResults.arena_ensure_wallet = [{ user_id: "u1", balance: 640, updated_at: "x" }];
    expect((await ensureWallet("u1")).balance).toBe(640);
  });
  it("ensureWallet lê a carteira se a RPC não devolver nada", async () => {
    mockDb.tables.arena_wallets = [{ user_id: "u1", balance: 500, updated_at: "x" }];
    expect((await ensureWallet("u1")).balance).toBe(500);
  });
  it("ensureWallet cai em 1000 pts se nada vier do banco", async () => {
    expect(await ensureWallet("u1")).toMatchObject({ user_id: "u1", balance: 1000 });
  });
  it("fetchWallet sem carteira = null", async () => {
    expect(await fetchWallet("u1")).toBeNull();
  });
});

describe("casos (duelos)", () => {
  const row = (over: Record<string, unknown> = {}) => ({
    id: "d1",
    created_by: "u2",
    scenario: "Quem ganha?",
    option_a: "A",
    option_b: "B",
    option_c: "C",
    category: "Cinema",
    creator_context: null,
    odds_a: "1.8",
    odds_b: "3.5",
    odds_c: "2.1",
    odds_justification: null,
    status: "open",
    result: null,
    verdict: null,
    created_at: "",
    updated_at: "",
    profiles: { display_name: "Criador", avatar_url: null },
    arena_bets: [{ id: "b1" }, { id: "b2" }],
    ...over,
  });

  it("fetchDuels converte odds em número, conta apostas e acha a minha", async () => {
    mockDb.tables.arena_duels = [row()];
    mockDb.tables.arena_bets = [{ id: "b1", duel_id: "d1", user_id: "u1", side: "A", amount: 100 }];
    const [d] = await fetchDuels("u1");
    expect(d.odds_a).toBe(1.8);
    expect(d.bet_count).toBe(2);
    expect(d.my_bet?.id).toBe("b1");
    expect(d.creator_profile?.display_name).toBe("Criador");
  });
  it("fetchDuels sem casos = vazio", async () => {
    expect(await fetchDuels("u1")).toEqual([]);
  });
  it("fetchDuelById inexistente = null", async () => {
    expect(await fetchDuelById("zzz", "u1")).toBeNull();
  });
  it("fetchDuelById existente traz a minha aposta", async () => {
    mockDb.tables.arena_duels = [row()];
    mockDb.tables.arena_bets = [{ id: "b9", user_id: "u1", side: "B" }];
    const d = await fetchDuelById("d1", "u1");
    expect(d?.scenario).toBe("Quem ganha?");
    expect(d?.my_bet?.id).toBe("b9");
  });
  it("createDuel grava como 'open' com as odds", async () => {
    mockDb.tables.arena_duels = [{ id: "novo" }];
    const r = await createDuel("u1", "cenário", "A", "B", "C", "Cat", "", {
      odds_a: 2,
      odds_b: 3,
      odds_c: 4,
      justification: "",
    });
    expect(r).toEqual({ data: "novo", error: null });
    expect(mockDb.writes[0].args[0]).toMatchObject({
      created_by: "u1",
      status: "open",
      creator_context: null,
      odds_justification: null,
      odds_b: 3,
    });
  });
  it("createDuel devolve o erro", async () => {
    mockDb.errors.arena_duels = { message: "rls" };
    expect(await createDuel("u1", "c", "A", "B", "C", "x", "", { odds_a: 2, odds_b: 2, odds_c: 3, justification: "" })).toEqual({
      data: null,
      error: "rls",
    });
  });
  it("closeDuel chama a RPC (só o criador consegue, no banco)", async () => {
    expect(await closeDuel("d1")).toEqual({ error: null });
    expect(rpcArgs("arena_close_duel")).toEqual({ p_duel_id: "d1" });
    expect(mockDb.writes).toHaveLength(0);
  });
  it("closeDuel devolve o erro do banco", async () => {
    mockDb.errors["rpc:arena_close_duel"] = { message: "Não foi possível fechar o caso" };
    expect(await closeDuel("d1")).toEqual({ error: "Não foi possível fechar o caso" });
  });
});

describe("resolveDuel — prêmios", () => {
  it("manda só resultado e veredito; os prêmios são calculados no banco", async () => {
    expect(await resolveDuel("d1", "A", "veredito")).toEqual({ error: null });
    expect(rpcArgs("arena_resolve_duel")).toEqual({ p_duel_id: "d1", p_result: "A", p_verdict: "veredito" });
    noMoneyWrites();
  });
  it("devolve o erro (ex.: quem não é o criador)", async () => {
    mockDb.errors["rpc:arena_resolve_duel"] = { message: "Só o criador resolve o caso" };
    expect(await resolveDuel("d1", "A", "v")).toEqual({ error: "Só o criador resolve o caso" });
  });
});

describe("apostas e saldo (tudo por RPC)", () => {
  it("placeBet manda caso, lado e valor — nunca usuário, odd ou saldo", async () => {
    expect(await placeBet("d1", "B", 120)).toEqual({ error: null });
    expect(rpcArgs("arena_place_bet")).toEqual({ p_duel_id: "d1", p_side: "B", p_amount: 120 });
    noMoneyWrites();
  });
  it("aposta repetida (23505) vira mensagem amigável", async () => {
    mockDb.errors["rpc:arena_place_bet"] = { message: "dup", code: "23505" };
    expect(await placeBet("d1", "B", 100)).toEqual({ error: "Você já apostou neste caso" });
  });
  it("saldo insuficiente e caso fechado voltam como erro do banco", async () => {
    mockDb.errors["rpc:arena_place_bet"] = { message: "Saldo insuficiente" };
    expect(await placeBet("d1", "B", 9999)).toEqual({ error: "Saldo insuficiente" });
    mockDb.errors["rpc:arena_place_bet"] = { message: "Este caso não aceita mais apostas" };
    expect(await placeBet("d1", "B", 10)).toEqual({ error: "Este caso não aceita mais apostas" });
  });
  it("deleteBet chama a RPC só com o id da aposta", async () => {
    expect(await deleteBet("b1")).toEqual({ error: null });
    expect(rpcArgs("arena_delete_bet")).toEqual({ p_bet_id: "b1" });
    noMoneyWrites();
  });
  it("deleteBet devolve o erro do banco", async () => {
    mockDb.errors["rpc:arena_delete_bet"] = { message: "O caso já foi resolvido" };
    expect(await deleteBet("b1")).toEqual({ error: "O caso já foi resolvido" });
  });
  it("claimPayout manda só o id: o valor do prêmio vem do banco", async () => {
    expect(await claimPayout("b1")).toEqual({ error: null });
    expect(rpcArgs("arena_claim_payout")).toEqual({ p_bet_id: "b1" });
    noMoneyWrites();
  });
  it("claimPayout de aposta já resgatada devolve o erro e não credita", async () => {
    mockDb.errors["rpc:arena_claim_payout"] = { message: "Prêmio já resgatado" };
    expect(await claimPayout("b1")).toEqual({ error: "Prêmio já resgatado" });
  });
  it("fetchBetsForDuel mapeia as linhas", async () => {
    mockDb.tables.arena_bets = [
      { id: "b1", duel_id: "d1", user_id: "u1", side: "A", amount: 10, potential_payout: 18, actual_payout: null, payout_claimed: false, created_at: "", profiles: { display_name: "Fulano", avatar_url: null } },
    ];
    const [b] = await fetchBetsForDuel("d1");
    expect(b).toMatchObject({ id: "b1", side: "A", profile: { display_name: "Fulano" } });
  });
});

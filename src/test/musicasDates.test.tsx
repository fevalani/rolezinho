import { describe, it, expect } from "vitest";
import { screen, fireEvent, waitFor } from "@testing-library/react";
import { MusicasPage } from "@/features/musicas/MusciasPage";
import { todayDateStr } from "@/features/musicas/musicService";
import { loginAs, renderWithProviders } from "./helpers";
import { mockDb } from "./supabaseMock";

const ymd = (offset: number) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const pick = (over: Record<string, unknown> = {}) => ({
  id: "p1", user_id: "u2", pick_date: todayDateStr(), source: "spotify", url: "https://open.spotify.com/track/x", media_type: "track",
  title: "Faixa Boa", artist: "Artista X", thumbnail: null, duration_ms: 185000, external_id: "x", created_at: "2026-01-01T00:00:00Z", ...over,
});
const pickedDates = () =>
  mockDb.queries.filter((q) => q.table === "music_picks").flatMap((q) => q.calls.filter(([m, a]) => m === "eq" && a[0] === "pick_date").map(([, a]) => a[1]));

describe("MusicasPage — dias", () => {
  it("mostra as abas Hoje, Ontem e dias mais antigos, sem duplicar", async () => {
    loginAs();
    mockDb.tables.music_picks = [pick({ id: "a", pick_date: ymd(-1) }), pick({ id: "b", pick_date: ymd(-1) }), pick({ id: "c", pick_date: ymd(-5) })];
    renderWithProviders(<MusicasPage />);
    expect(await screen.findByText("Hoje")).toBeInTheDocument();
    expect(await screen.findByText("Ontem")).toBeInTheDocument();
    expect(screen.getAllByText("Ontem")).toHaveLength(1);
    const tabs = Array.from(document.querySelectorAll("button.whitespace-nowrap"));
    expect(tabs).toHaveLength(3);
  });

  it("'Hoje' aparece mesmo sem indicações hoje", async () => {
    loginAs();
    mockDb.tables.music_picks = [pick({ pick_date: ymd(-3) })];
    renderWithProviders(<MusicasPage />);
    expect(await screen.findByText("Hoje")).toBeInTheDocument();
  });

  it("trocar de dia consulta aquela data e some o botão de indicar", async () => {
    loginAs();
    // (o Supabase falso devolve as mesmas linhas para qualquer filtro; o que se confere é a consulta)
    mockDb.tables.music_picks = [pick({ pick_date: ymd(-1), user_id: "u2" })];
    renderWithProviders(<MusicasPage />);
    fireEvent.click(await screen.findByText("Ontem"));
    await waitFor(() => expect(pickedDates()).toContain(ymd(-1)));
    expect(screen.queryByText("Indicar", { selector: "button" })).not.toBeInTheDocument();
  });

  it("começa em 'Hoje' consultando a data de hoje", async () => {
    loginAs();
    renderWithProviders(<MusicasPage />);
    await screen.findByText("Ninguém indicou nada ainda hoje.");
    expect(pickedDates()).toContain(todayDateStr());
  });
});

describe("MusicasPage — regras da indicação", () => {
  it("quem já indicou hoje não vê o botão de indicar", async () => {
    loginAs();
    mockDb.tables.music_picks = [pick({ user_id: "user-1" })];
    renderWithProviders(<MusicasPage />);
    await screen.findByText("Faixa Boa");
    expect(screen.queryByText("Indicar", { selector: "button" })).not.toBeInTheDocument();
  });

  it("não dá para curtir a própria indicação", async () => {
    loginAs();
    mockDb.tables.music_picks = [pick({ user_id: "user-1" })];
    renderWithProviders(<MusicasPage />);
    await screen.findByText("Faixa Boa");
    const like = document.querySelector("button[disabled] .text-sm") ?? document.querySelector("button[disabled]");
    expect(like).toBeTruthy();
    expect(screen.queryByTitle("Curtir")).not.toBeInTheDocument();
  });

  it("mostra a duração formatada e a origem", async () => {
    loginAs();
    mockDb.tables.music_picks = [pick()];
    mockDb.tables.profiles.push({ id: "u2", display_name: "Beltrano", avatar_url: null });
    renderWithProviders(<MusicasPage />);
    expect(await screen.findByText("3:05")).toBeInTheDocument();
    expect(screen.getByText("spotify")).toBeInTheDocument();
  });

  it("descurtir remove a curtida", async () => {
    loginAs();
    mockDb.tables.music_picks = [pick()];
    mockDb.tables.profiles.push({ id: "u2", display_name: "Beltrano", avatar_url: null });
    mockDb.tables.music_pick_likes = [{ pick_id: "p1", user_id: "user-1" }];
    renderWithProviders(<MusicasPage />);
    fireEvent.click(await screen.findByTitle("Remover like"));
    await waitFor(() => expect(mockDb.writes.some((w) => w.table === "music_pick_likes" && w.op === "delete")).toBe(true));
  });

  it("as mais curtidas aparecem primeiro", async () => {
    loginAs();
    mockDb.tables.music_picks = [
      pick({ id: "p1", title: "Menos Curtida", created_at: "2026-01-01T00:00:00Z" }),
      pick({ id: "p2", user_id: "u3", title: "Mais Curtida", created_at: "2026-01-01T01:00:00Z" }),
    ];
    mockDb.tables.music_pick_likes = [
      { pick_id: "p2", user_id: "ux" },
      { pick_id: "p2", user_id: "uy" },
      { pick_id: "p1", user_id: "uz" },
    ];
    renderWithProviders(<MusicasPage />);
    await screen.findByText("Menos Curtida");
    const text = document.body.textContent ?? "";
    expect(text.indexOf("Mais Curtida")).toBeLessThan(text.indexOf("Menos Curtida"));
  });
});

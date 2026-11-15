import { describe, it, expect, vi } from "vitest";
import { screen, fireEvent, waitFor } from "@testing-library/react";
import { MusicasPage } from "@/features/musicas/MusciasPage";
import { todayDateStr } from "@/features/musicas/musicService";
import { loginAs, renderWithProviders } from "./helpers";
import { mockDb } from "./supabaseMock";

const pick = (over: Record<string, unknown> = {}) => ({
  id: "p1",
  user_id: "u2",
  pick_date: todayDateStr(),
  source: "spotify",
  url: "https://open.spotify.com/track/x",
  media_type: "track",
  title: "Faixa Boa",
  artist: "Artista X",
  thumbnail: null,
  duration_ms: null,
  external_id: "x",
  created_at: "2026-01-01T00:00:00Z",
  ...over,
});

describe("MusicasPage", () => {
  it("sem indicações hoje: estado vazio com botão de indicar", async () => {
    loginAs();
    renderWithProviders(<MusicasPage />);
    expect(await screen.findByText("Ninguém indicou nada ainda hoje.")).toBeInTheDocument();
  });

  it("lista as indicações do dia com título e artista", async () => {
    loginAs();
    mockDb.tables.music_picks = [pick()];
    mockDb.tables.profiles.push({ id: "u2", display_name: "Beltrano", avatar_url: null });
    renderWithProviders(<MusicasPage />);
    expect(await screen.findByText("Faixa Boa")).toBeInTheDocument();
    expect(screen.getByText("Artista X")).toBeInTheDocument();
    expect(screen.getByText("Beltrano")).toBeInTheDocument();
  });

  it("curtir grava a curtida do usuário", async () => {
    loginAs();
    mockDb.tables.music_picks = [pick()];
    mockDb.tables.profiles.push({ id: "u2", display_name: "Beltrano", avatar_url: null });
    renderWithProviders(<MusicasPage />);
    fireEvent.click(await screen.findByTitle("Curtir"));
    await waitFor(() =>
      expect(mockDb.writes.some((w) => w.table === "music_pick_likes" && w.op === "insert")).toBe(true),
    );
    expect(mockDb.writes.find((w) => w.table === "music_pick_likes")!.args[0]).toEqual({
      user_id: "user-1",
      pick_id: "p1",
    });
  });

  it("só o dono vê o botão de remover a indicação", async () => {
    loginAs();
    mockDb.tables.music_picks = [pick({ user_id: "u2" })];
    mockDb.tables.profiles.push({ id: "u2", display_name: "Beltrano", avatar_url: null });
    renderWithProviders(<MusicasPage />);
    await screen.findByText("Faixa Boa");
    expect(screen.queryByTitle("Remover indicação")).not.toBeInTheDocument();
  });

  it("o dono remove a própria indicação", async () => {
    loginAs();
    mockDb.tables.music_picks = [pick({ user_id: "user-1" })];
    renderWithProviders(<MusicasPage />);
    fireEvent.click(await screen.findByTitle("Remover indicação"));
    await waitFor(() =>
      expect(mockDb.writes.some((w) => w.table === "music_picks" && w.op === "delete")).toBe(true),
    );
  });

  it("indicar: link inválido mostra erro e não salva", async () => {
    loginAs();
    renderWithProviders(<MusicasPage />);
    fireEvent.click(await screen.findByText("Indicar", { selector: "button" }));
    const input = await screen.findByPlaceholderText(/open\.spotify\.com\/track/);
    fireEvent.change(input, { target: { value: "https://exemplo.com/nada" } });
    expect(await screen.findByText(/inválido|não reconhecido|Cole um link/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Indicar para hoje/ })).toBeDisabled();
  });

  it("indicar: link válido resolve os dados e permite salvar", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ title: "Música Nova", thumbnail_url: null }) }),
    );
    loginAs();
    renderWithProviders(<MusicasPage />);
    fireEvent.click(await screen.findByText("Indicar", { selector: "button" }));
    const input = await screen.findByPlaceholderText(/open\.spotify\.com\/track/);
    fireEvent.change(input, {
      target: { value: "https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC" },
    });
    expect(await screen.findByText("Música Nova")).toBeInTheDocument();
    mockDb.tables.music_picks = [pick({ id: "novo", user_id: "user-1", title: "Música Nova" })];
    fireEvent.click(screen.getByRole("button", { name: /Indicar para hoje/ }));
    await waitFor(() =>
      expect(mockDb.writes.some((w) => w.table === "music_picks" && w.op === "insert")).toBe(true),
    );
    expect(mockDb.writes.find((w) => w.op === "insert")!.args[0]).toMatchObject({
      user_id: "user-1",
      title: "Música Nova",
      source: "spotify",
      external_id: "4uLU6hMCjMI75M1A2tKUQC",
    });
    vi.unstubAllGlobals();
  });
});

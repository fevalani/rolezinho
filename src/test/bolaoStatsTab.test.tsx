import { describe, it, expect } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { BolaoStatsTab } from "@/features/bolao/BolaoStatsTab";
import type { BolaoPoolMember, LeaderboardEntry, RoundLeaderboard, UserPredictionDetail, BolaoPool } from "@/features/bolao/bolaoService";

const member = (id: string, name: string): BolaoPoolMember => ({ id: `m-${id}`, pool_id: "p1", user_id: id, joined_at: "", profile: { id, display_name: name, avatar_url: null } });
const members = [member("a", "Ana"), member("b", "Bia")];
const entry = (id: string, name: string, pts: number): LeaderboardEntry => ({ user_id: id, display_name: name, avatar_url: null, total_points: pts, predictions_made: 2, exact_scores: 1 });
const pred = (over: Partial<UserPredictionDetail>): UserPredictionDetail => ({
  match_id: "m1", home_team: "Flamengo", away_team: "Palmeiras", home_crest: null, away_crest: null, round_label: "Rodada 1",
  utc_date: "2026-06-01T12:00:00Z", score_home: 2, score_away: 1, pred_home: 2, pred_away: 1, points_earned: 15, ...over,
});

const props = (over: Record<string, unknown> = {}) => ({
  allUserPredictions: new Map<string, UserPredictionDetail[]>([
    ["a", [pred({ match_id: "m1" }), pred({ match_id: "m2", home_team: "Santos", away_team: "Vasco", pred_home: 0, pred_away: 3, points_earned: 0 })]],
    ["b", [pred({ match_id: "m1", pred_home: 1, pred_away: 0, points_earned: 5 }), pred({ match_id: "m2", home_team: "Santos", away_team: "Vasco", pred_home: 0, pred_away: 3, points_earned: 0 })]],
  ]),
  leaderboard: [entry("a", "Ana", 15), entry("b", "Bia", 5)],
  roundLeaderboards: [{ round_label: "Rodada 1", entries: [entry("a", "Ana", 15), entry("b", "Bia", 5)] }] as RoundLeaderboard[],
  members,
  pool: { scoring_model: "classic", scoring_config: null } as unknown as BolaoPool,
  currentUserId: "a",
  ...over,
});

describe("BolaoStatsTab", () => {
  it("sem partidas encerradas mostra o estado vazio da evolução", () => {
    render(<BolaoStatsTab {...props({ allUserPredictions: new Map(), leaderboard: [], roundLeaderboards: [] })} />);
    expect(screen.getByText("Nenhuma partida encerrada ainda.")).toBeInTheDocument();
    expect(screen.getByText("Curiosidades das Partidas")).toBeInTheDocument();
  });

  it("mostra as seções de estatísticas", () => {
    render(<BolaoStatsTab {...props()} />);
    for (const t of ["Evolução", "Aproveitamento", "Meu Perfil de Palpiteiro", "Curiosidades das Partidas", "Confronto Direto"]) {
      expect(screen.getByText(t)).toBeInTheDocument();
    }
  });

  it("curiosidades apontam a partida certa em cada categoria", () => {
    render(<BolaoStatsTab {...props()} />);
    const card = (title: string) => within(screen.getByText(title).parentElement as HTMLElement);
    expect(card("Mais polêmica").getByText("Flamengo x Palmeiras")).toBeInTheDocument();
    expect(card("Mais polêmica").getByText("2 palpites diferentes")).toBeInTheDocument();
    expect(card("Maior consenso").getByText("Santos x Vasco")).toBeInTheDocument();
    expect(card("Maior consenso").getByText("2× 0 × 3")).toBeInTheDocument();
    expect(card("Mais generosa").getByText("Flamengo x Palmeiras")).toBeInTheDocument();
    expect(card("Mais generosa").getByText("20 pts distribuídos")).toBeInTheDocument();
    expect(card("Mais dolorosa").getByText("Santos x Vasco")).toBeInTheDocument();
    expect(card("Mais dolorosa").getByText("2 erros")).toBeInTheDocument();
  });

  it("o aproveitamento alterna entre 'palpites efetuados' e 'total de jogos'", () => {
    render(<BolaoStatsTab {...props()} />);
    const total = screen.getByText("Total de jogos");
    fireEvent.click(total);
    expect(screen.getByText("Palpites efetuados")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Palpites efetuados"));
    expect(screen.getByText("Total de jogos")).toBeInTheDocument();
  });

  it("confronto direto: pontos por participante e aviso ao escolher a mesma pessoa", () => {
    render(<BolaoStatsTab {...props()} />);
    const selects = screen.getAllByRole("combobox");
    expect(selects).toHaveLength(2);
    // padrão: Ana (1º) x Bia (2º) → resultado calculado
    expect(screen.queryByText("Selecione dois participantes diferentes.")).not.toBeInTheDocument();
    fireEvent.change(selects[1], { target: { value: "a" } });
    expect(screen.getByText("Selecione dois participantes diferentes.")).toBeInTheDocument();
  });

  it("com um participante só o confronto avisa que são poucos", () => {
    render(<BolaoStatsTab {...props({ members: [members[0]] })} />);
    expect(screen.getByText("Poucos participantes.")).toBeInTheDocument();
  });

  it("sem usuário atual não mostra 'Meu Perfil'", () => {
    render(<BolaoStatsTab {...props({ currentUserId: undefined })} />);
    expect(screen.queryByText("Meu Perfil de Palpiteiro")).not.toBeInTheDocument();
  });
});

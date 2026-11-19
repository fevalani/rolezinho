export function SudokuRules() {
  return (
    <div className="bg-[var(--bg-card)] border border-[rgba(255,255,255,0.06)] rounded-xl p-3 text-xs space-y-1.5">
      <p className="font-semibold text-[var(--text-secondary)] text-[0.65rem] uppercase tracking-wide mb-2">
        Como pontua
      </p>
      <p className="text-[var(--text-muted)]">
        Sem limite de tempo nem de tentativas — mas cada erro e cada minuto
        corrido custam pontos. Número errado pisca vermelho e some, tenta de
        novo.
      </p>
      <p className="text-[var(--text-muted)]">
        Começa com 1000 pts, -20 por minuto corrido, -40 por erro (mínimo 50 pts
        pra quem termina) — depois multiplica pela dificuldade escolhida.
      </p>
      <p className="text-[var(--text-muted)]">
        ✏️ <strong className="text-[var(--text-secondary)]">Rascunho</strong>:
        liga o modo de anotar candidatos numa célula sem marcar valor definitivo
        — não conta como erro nem preenche a célula.
      </p>
    </div>
  );
}

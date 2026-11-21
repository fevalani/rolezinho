/** Faixa de aviso quando o app está sem internet ou com envios pendentes. */
export function OfflineBanner({ online, pending }: { online: boolean; pending: number }) {
  if (online && pending === 0) return null;
  const text = online
    ? `Enviando ${pending} ${pending === 1 ? "alteração salva" : "alterações salvas"} offline…`
    : pending > 0
      ? `Sem internet — mostrando dados salvos. ${pending} ${pending === 1 ? "alteração será enviada" : "alterações serão enviadas"} quando a conexão voltar.`
      : "Sem internet — mostrando os últimos dados salvos.";
  return (
    <div
      role="status"
      data-testid="offline-banner"
      className="px-4 py-1.5 text-center text-xs font-semibold bg-[rgba(201,165,90,0.14)] text-(--gold) border-b border-[rgba(201,165,90,0.2)]"
    >
      {text}
    </div>
  );
}

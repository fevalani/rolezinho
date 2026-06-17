# Bolão — Notificação interativa de palpite

Proposta de evolução do lembrete de palpite do Bolão: em vez de só **avisar**
que falta 1 hora para o jogo, a notificação passa a **mostrar os times e
permitir digitar o placar e salvar o palpite direto da notificação**, sem
precisar abrir o app inteiro — no espírito das *Android interactive
notifications* (responder, arquivar, etc. direto da gaveta de notificações).

---

## 1. O que já existe hoje

O lembrete "faltando 1h" **já está implementado** (local, no aparelho):

- `src/lib/notificationService.ts` → `scheduleBolaoReminders(poolId, matches)`
  - Usa `@capacitor/local-notifications` (já no `package.json`, v8).
  - Para cada partida **sem palpite do usuário** (`my_prediction === null`) e que
    não esteja `FINISHED/CANCELLED/POSTPONED`, agenda uma notificação para
    `utc_date − 1h` (se o prazo ainda não passou).
  - IDs a partir de `30000`; guarda os IDs em `localStorage`
    (`bolao_notif_ids_<poolId>`) para cancelar/reagendar.
  - Pede permissão (`requestPermissions`) — cobre o `POST_NOTIFICATIONS` do
    Android 13+.
- Disparo do agendamento: `src/features/bolao/BolaoDetailPage.tsx:850-853`,
  num `useEffect` que roda quando o usuário abre o bolão.
- Hoje a notificação é **passiva**: título `"⚽ Palpite pendente!"`, corpo
  `"<casa> × <fora> começa em 1h. Dê seu palpite!"`, `actionTypeId: ""` (sem
  ações). Tocar nela só abre o app.

> Ou seja: o "quem não palpitou recebe 1h antes" **já funciona**. O que falta é
> a **interatividade** (ver times + digitar placar + salvar pela notificação).

Dados relevantes para salvar um palpite (de `bolaoService.ts`):

- `upsertPrediction(poolId, matchId, userId, homeGoals, awayGoals)` — grava em
  `bolao_predictions` (`onConflict: "pool_id,match_id,user_id"`).
- A sessão do Supabase é persistida (`persistSession: true`), então no momento
  da ação dá para recuperar o usuário com `supabase.auth.getUser()`.

---

## 2. O que dá (e o que não dá) com a stack atual

`@capacitor/local-notifications` suporta **botões de ação** e **um campo de
texto (remote input)** dentro da notificação:

- `registerActionTypes({ types: [{ id, actions: [...] }] })` registra os tipos.
- Cada ação pode ter `input: true` → abre um **campo de texto** na notificação
  (no Android é o `RemoteInput` nativo, igual ao "responder" do WhatsApp).
- O resultado chega no listener
  `LocalNotifications.addListener("localNotificationActionPerformed", e => …)`
  em `e.actionId`, `e.inputValue` e `e.notification.extra`.

### Limitações importantes (decidir cientes delas)

1. **Um único campo de texto por ação.** O plugin expõe só `inputValue` (uma
   string). Não dá para ter dois campos numéricos separados (casa/fora)
   nativamente. → Solução: **um campo** onde o usuário digita `"2x1"`,
   `"2-1"` ou `"2 1"`, e o app faz o *parsing*.

2. **O JS roda no WebView → o app precisa estar vivo para salvar.** O handler
   `localNotificationActionPerformed` executa no contexto web do Capacitor.
   Ao enviar o texto da ação, o Android **abre/retoma o app** para entregar o
   evento ao JS, que então chama `upsertPrediction`. Na prática é rápido e pode
   cair direto numa tela de confirmação, mas **não é 100% "app fechado"** — o
   processo é acordado.
   - **Salvar com o app totalmente fechado**, sem abrir nada, exige **código
     nativo Android** (um `BroadcastReceiver` que faz o `POST` direto na REST do
     Supabase). Ver §5 (opção avançada).

3. **Agendamento local só cobre partidas que o aparelho "viu".** Como o agendamento
   acontece quando o usuário abre o bolão (`BolaoDetailPage`), quem nunca abrir
   não recebe. Para garantir "todo usuário que não palpitou", o caminho robusto
   é **push do servidor** (FCM) via cron — bem maior (ver §6).

---

## 3. Experiência proposta (UX)

Notificação 1h antes, para cada partida sem palpite:

```
⚽ Palpite pendente — começa em 1h
Flamengo × Palmeiras
[ Campo: "Placar, ex: 2x1" ]   [ Salvar palpite ]   [ Abrir app ]
```

- O usuário digita o placar no campo e toca **Salvar palpite**.
- App acorda, faz o parse (`2x1` → casa 2, fora 1), chama `upsertPrediction`,
  e dá um retorno (toast/heads-up "Palpite salvo: Flamengo 2 × 1 Palmeiras ✓").
- Se o texto for inválido (`abc`), reabre a notificação ou avisa
  "Não entendi o placar, toque para abrir".
- Botão **Abrir app** leva direto à tela do bolão na partida certa (deep link
  via `extra.poolId`/`extra.matchId`).

---

## 4. Plano de implementação — caminho recomendado (JS / Capacitor)

Esforço estimado: **médio**, sem código nativo. Entrega a interatividade
completa aceitando a ressalva 2.2 (o app é acordado para salvar).

### Passo 1 — Registrar o tipo de ação (uma vez, no boot)

Em `src/lib/notificationService.ts` (ou no `App.tsx`, no efeito de boot):

```ts
import { LocalNotifications } from "@capacitor/local-notifications";

export async function registerBolaoActionTypes() {
  if (!Capacitor.isNativePlatform()) return;
  await LocalNotifications.registerActionTypes({
    types: [
      {
        id: "BOLAO_PREDICT",
        actions: [
          {
            id: "SAVE_SCORE",
            title: "Salvar palpite",
            input: true,                       // abre o campo de texto
            inputButtonTitle: "Salvar",
            inputPlaceholder: "Placar, ex: 2x1",
          },
          { id: "OPEN_APP", title: "Abrir" },
        ],
      },
    ],
  });
}
```

### Passo 2 — Usar o tipo ao agendar

Em `scheduleBolaoReminders`, trocar `actionTypeId: ""` por `"BOLAO_PREDICT"` e
enriquecer o `extra` com os nomes dos times (para a confirmação) e o `userId`:

```ts
toSchedule.push({
  id,
  title: "⚽ Palpite pendente — começa em 1h",
  body: `${match.home_team} × ${match.away_team}`,
  schedule: { at: new Date(notifAt) },
  actionTypeId: "BOLAO_PREDICT",
  extra: {
    poolId,
    matchId: match.id,
    homeTeam: match.home_team,
    awayTeam: match.away_team,
  },
});
```

> `scheduleBolaoReminders` já recebe `userId` implicitamente? Não — hoje recebe
> só `poolId` e `matches`. O `userId` pode vir da sessão na hora de salvar
> (`supabase.auth.getUser()`), então não precisa ir no `extra`.

### Passo 3 — Tratar a ação (listener global)

Registrar **uma vez** no boot do app (ex.: `AppRoutes`/`App.tsx`, junto com
`scheduleMusicReminder`). Precisa de um parser de placar e do `upsertPrediction`.

```ts
import { LocalNotifications } from "@capacitor/local-notifications";
import { supabase } from "@/lib/supabase";
import { upsertPrediction } from "@/features/bolao/bolaoService";

// "2x1", "2-1", "2 1", "2:1" → { home: 2, away: 1 }
export function parseScore(raw: string): { home: number; away: number } | null {
  const m = raw.trim().match(/^(\d{1,2})\s*[x\-:\s]\s*(\d{1,2})$/i);
  if (!m) return null;
  return { home: Number(m[1]), away: Number(m[2]) };
}

export async function initBolaoNotificationHandler(navigate: (p: string) => void) {
  if (!Capacitor.isNativePlatform()) return;
  await LocalNotifications.addListener(
    "localNotificationActionPerformed",
    async (event) => {
      const extra = event.notification.extra as {
        poolId?: string; matchId?: string; homeTeam?: string; awayTeam?: string;
      } | null;
      if (!extra?.poolId || !extra.matchId) return;

      if (event.actionId === "SAVE_SCORE") {
        const parsed = parseScore(event.inputValue ?? "");
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { navigate(`/bolao/${extra.poolId}`); return; }
        if (!parsed) {
          // reemite uma notificação curta pedindo para reabrir
          await LocalNotifications.schedule({ notifications: [{
            id: Date.now() % 100000,
            title: "Não entendi o placar 🤔",
            body: "Toque para abrir e palpitar.",
            extra,
            actionTypeId: "BOLAO_PREDICT",
          }]});
          return;
        }
        const { error } = await upsertPrediction(
          extra.poolId, extra.matchId, user.id, parsed.home, parsed.away,
        );
        await LocalNotifications.schedule({ notifications: [{
          id: Date.now() % 100000,
          title: error ? "Erro ao salvar 😕" : "Palpite salvo ✓",
          body: error
            ? "Toque para tentar de novo."
            : `${extra.homeTeam} ${parsed.home} × ${parsed.away} ${extra.awayTeam}`,
          extra,
        }]});
      } else {
        // OPEN_APP ou toque no corpo → deep link
        navigate(`/bolao/${extra.poolId}`);
      }
    },
  );
}
```

### Passo 4 — Boot

No `App.tsx` (efeito que hoje chama `scheduleMusicReminder`):

```ts
useEffect(() => {
  if (!user) return;
  scheduleMusicReminder();
  registerBolaoActionTypes();
  initBolaoNotificationHandler((p) => navigate(p)); // usar useNavigate
}, [user]);
```

### Passo 5 — Confirmar o build nativo

`@capacitor/local-notifications` já gera o necessário; rodar
`npx cap sync android`. Conferir no `AndroidManifest.xml` se o receiver do
plugin está presente (o plugin injeta automaticamente). Testar em device real
(emulador às vezes não mostra o `RemoteInput`).

### Testes sugeridos

- `parseScore` é função pura → teste em `src/test/` (vários formatos válidos e
  inválidos: `"2x1"`, `"2 - 1"`, `"10:0"`, `"abc"`, `""`, `"2x"`).
- Verificar manualmente: notificação aparece 1h antes, campo de texto funciona,
  palpite aparece em `bolao_predictions` e na tela do bolão.

---

## 5. Opção avançada — salvar com o app fechado (código nativo)

Se for requisito **não acordar o app**, é preciso um plugin/receiver nativo:

- Criar um `BroadcastReceiver` (Kotlin/Java) em
  `android/app/src/main/java/com/taverna/amigos/` que:
  1. Lê o `RemoteInput` (placar) e o `extra` (poolId/matchId).
  2. Lê o token de auth do Supabase do storage nativo
     (`@supabase/supabase-js` persiste no `localStorage` do WebView; acessar
     fora do WebView é o ponto delicado — talvez seja preciso espelhar o token
     em `SharedPreferences` quando o app está aberto).
  3. Faz `POST https://<projeto>.supabase.co/rest/v1/bolao_predictions`
     (`apikey` + `Authorization: Bearer <token>`, header `Prefer: resolution=merge-duplicates`).
  4. Atualiza/dismiss a notificação com o resultado.

Trade-offs: mais robusto (offline-ish, sem abrir app), porém **muito mais
trabalho**, manutenção do token fora do WebView, e some a portabilidade JS.
**Recomendação:** só seguir aqui se o §4 não satisfizer na prática.

---

## 6. Robustez "todo usuário que não palpitou" — push do servidor (futuro)

O agendamento local depende do usuário abrir o bolão. Para garantir cobertura
total (inclusive quem não abre o app há dias):

- **FCM (Firebase Cloud Messaging)** + `@capacitor/push-notifications`.
- Um **cron no servidor** (ex.: Supabase Edge Function agendada, ou cron na
  Vercel) que, de hora em hora, busca partidas começando em ~1h e os membros
  do bolão **sem palpite**, e dispara um push de dados para cada um.
- O push carrega `poolId/matchId/times`; o device monta a notificação
  interativa (mesma action `BOLAO_PREDICT` do §4).

Trade-offs: cobertura confiável e centralizada, **mas** exige setup de FCM,
chave de servidor, função agendada e query de "quem não palpitou".
**Recomendação:** fazer o §4 primeiro (entrega o valor principal) e migrar o
*gatilho* para push (§6) depois, reaproveitando a mesma camada de ação.

---

## 7. Resumo das decisões a tomar

| Decisão | Opções | Recomendação |
|--------|--------|--------------|
| Como salvar | (a) acordar app via listener JS · (b) receiver nativo | (a) — bem menor, atende a UX |
| Formato do placar | 1 campo de texto `"2x1"` (parse) | 1 campo (limitação do plugin) |
| Gatilho | local (device) · push (servidor/FCM) | local agora, push depois |
| Plataforma | foco Android (PS do pedido) | Android; iOS herda a mesma action depois |

**Próximo passo concreto:** implementar §4 (passos 1–4) + teste de `parseScore`,
testar em device, e só então avaliar §5/§6.

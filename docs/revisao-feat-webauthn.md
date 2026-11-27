# `feat-webauthn`: o que fazer

Seguir na ordem. Linhas referentes ao código do commit `85761bc`.
**Não fazer merge nem `deploy:web` antes do passo 7.**

## Regras

### Projeto (`CLAUDE.md`)

1. Toda mudança vem com teste em `src/test/`. Bug corrigido ganha um teste que falhava antes.
2. Antes de concluir, tudo verde: `npm test`, `npx tsc -b`, `npm run typecheck:test`, `npx eslint <arquivos alterados>`.
   Teste antigo que falha indica mudança errada, salvo mudança de comportamento intencional, explicada no teste.
3. Módulo em `src/features/<módulo>/`: tela, `<nome>Service.ts` (único que fala com o Supabase), `<nome>Types.ts`,
   `<nome>Logic.ts` (regra pura).
4. Tela não chama o Supabase direto.
5. Permissão fica no banco ou no servidor (RLS / RPC `SECURITY DEFINER`), nunca só no cliente.
6. Chave de API fora do cliente; usar proxy em `api/`.
7. Mudança de schema vira `.sql` em `supabase/` e fica registrada como pendente até ser rodada.
8. Tela com mais de ~600 linhas é quebrada ao ser mexida.
9. Deploy: `npm run deploy:web`, depois commit e push na `main`. APK só para mudança nativa.

### Segurança

- `SUPABASE_SERVICE_ROLE_KEY` só em `api/` e no ambiente do servidor. Nunca com prefixo `VITE_`, nunca no Git.
- Rota que age em nome do usuário valida o JWT no servidor.
- Função `SECURITY DEFINER` com `search_path` fixo e `REVOKE` para `anon` e `authenticated`.
- Nada de credencial ou token em log. Resposta de erro genérica.
- Nada de segredo, log de build, backup ou URL local no commit.

### Sem custo

- Nenhum serviço pago.
- Nenhum arquivo novo que vire rota em `api/`: a branch está em 11 e o
  [Hobby da Vercel permite 12](https://vercel.com/docs/functions/runtimes#functions-created-per-deployment).
- Nenhum e-mail novo nos fluxos de chave de acesso: o envio padrão do Supabase tem
  [limite baixo por hora para o projeto inteiro](https://supabase.com/docs/guides/auth/rate-limits).

### OTA (obrigatório)

- O APK continua carregando o site publicado. Não editar `capacitor.config.ts` para testar.
- Todo `deploy:web` chega aos APKs antigos: o código web precisa funcionar sem o plugin novo.
- `build:android:bundled` não é para distribuir.

## Decisões fechadas

- **Passkey (WebAuthn)**, com o plugin nativo no APK. Não guarda senha e serve ao site também.
- **Liberado para todas as contas** (login, convite e Perfil), com testes antes de publicar.
- **Várias chaves por conta**, listadas e removidas por aparelho, sem custo.
- A rota de login usa a service role para emitir sessão: **o passo 3 é obrigatório**.

## 1. Tirar o que é ambiente local

- [ ] Rodar:

```bash
git fetch origin
git checkout origin/main -- capacitor.config.ts android/gradle.properties vite.config.ts \
  package.json package-lock.json src/pages/LoginPage.tsx
git rm build-error.txt \
  android/app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml \
  android/app/src/main/res/mipmap-anydpi-v26/ic_launcher_round.xml \
  android/app/src/main/java/com/taverna/amigos/WebAuthnWebViewConfig.java
npm ci
npm install @simplewebauthn/browser@^14.0.0 @simplewebauthn/server@^14.1.0
```

| Arquivo | Motivo |
| --- | --- |
| `capacitor.config.ts` | OTA desligado; `fetch("/api/...")` não chega ao servidor |
| `gradle.properties` | Caminho de Java do Windows quebra o build em outra máquina |
| `vite.config.ts` | Domínio ngrok fixo e proxy para um servidor que não está no repositório |
| `package.json` e lockfile | 262 pacotes atualizados sem relação com a tarefa; o `supabase-js` novo quebra o `tsc` |
| `LoginPage.tsx` | Cadastro e recuperação de senha ficaram sem botão (volta no passo 2) |
| XML de ícone | Removidos de propósito no rebrand (`d94e39d`) |
| `WebAuthnWebViewConfig.java` | Sem uso |

- [ ] Em `android/app/build.gradle`, remover a linha `androidx.webkit:webkit` (só servia ao arquivo apagado).
- [ ] Em `package.json`, mudar `engines.node` para `>=22` (exigência do `@simplewebauthn/server` 14).
- [ ] Para fixar o Java na sua máquina, usar `%USERPROFILE%\.gradle\gradle.properties`.
- [ ] Para servir `/api` localmente, usar `npx vercel dev` (dispensa `express`, `dotenv` e `server/api.ts`).

## 2. Corrigir os bugs

### 2.1 Linha que quebra o `tsc`

- [ ] [AuthContext.tsx:376-381](../src/lib/AuthContext.tsx#L376-L381): trocar essas linhas (de `const rawCredential`
  até a segunda atribuição de `credential`) por:

```ts
credential = JSON.parse(result.credentialJson);
```

### 2.2 URL do ngrok

- [ ] [AuthContext.tsx:339](../src/lib/AuthContext.tsx#L339): apagar `API_URL` e usar `/api/webauthn/login-options` e
  `/api/webauthn/login-verify`.

Motivo: em produção o login passaria por um túnel pessoal, com a credencial e o token de sessão.

### 2.3 Botão de chave de acesso no login

- [ ] Aplicar sobre o `LoginPage.tsx` da `main`:

```diff
 import { useAuth } from "@/lib/AuthContext";
+import { isPasskeySupported } from "@/lib/webauthn";

 export function LoginPage() {
-  const { signIn, signUp, resetPassword, loading } = useAuth();
+  const { signIn, signUp, resetPassword, loading, signInWithPasskey } = useAuth();

@@ depois de clearMessages
+  const handlePasskeyLogin = async () => {
+    if (!signInWithPasskey) return;
+    clearMessages();
+    setSubmitting(true);
+    const { error: err } = await signInWithPasskey();
+    if (err) setError(err);
+    setSubmitting(false);
+  };
+
   const handleSubmit = async (e: React.FormEvent) => {

@@ depois de </form>
+        {mode === "login" && signInWithPasskey && isPasskeySupported() && (
+          <button
+            type="button"
+            onClick={handlePasskeyLogin}
+            disabled={submitting}
+            className="w-full py-3.5 px-6 rounded-lg font-semibold text-lg text-(--gold) bg-transparent border border-[rgba(201,165,90,0.25)] hover:bg-[rgba(201,165,90,0.08)] transition-all disabled:opacity-50"
+          >
+            Entrar com chave de acesso
+          </button>
+        )}
+
         {mode === "login" && (
```

### 2.4 APK antigo sem o plugin

- [ ] Em [webauthn.ts](../src/lib/webauthn.ts), em `isPasskeySupported`:

```ts
if (Capacitor.isNativePlatform()) return Capacitor.isPluginAvailable("Passkey");
```

Motivo: hoje todo app nativo é tratado como compatível, e o OTA entrega a tela nova a quem não tem o plugin.

### 2.5 Cadastro no Android

- [ ] Em [PasskeyPlugin.java](../android/app/src/main/java/com/taverna/amigos/PasskeyPlugin.java#L119), no método
  `register`, apagar a montagem manual (de `JSONObject options` até o fim de `androidOptions`) e usar:

```java
CreatePublicKeyCredentialRequest request =
    new CreatePublicKeyCredentialRequest(optionsJson);
```

- [ ] Remover `import org.json.JSONArray`.

Motivo: o código lê `userId` e `userName`, que não existem (a biblioteca envia `user.id` e `user.name`). Todo cadastro
no app é rejeitado.

### 2.6 Origem Android

- [ ] Em [_shared.ts](../api/webauthn/_shared.ts#L7), trocar `androidOrigin` e `expectedOrigins` por:

```ts
// certificado D0:AD:…:98:1A, que assina o APK distribuído
const releaseAndroidOrigin =
  "android:apk-key-hash:0K3sR5NVfnJdvcaaKTpSazRfa9cqxnybQV4uv0QEmBo";
const extraOrigins = (process.env.WEBAUTHN_EXTRA_ORIGINS ?? "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);
export const expectedOrigins = [origin, releaseAndroidOrigin, ...extraOrigins];
```

- [ ] Usar `expectedOrigins` também em [register-verify.ts:44](../api/webauthn/register-verify.ts#L44).

Motivo: a origem atual é de outro certificado, e o cadastro só aceita a origem web.

### 2.7 Verificação do usuário

- [ ] Trocar `userVerification: "preferred"` por `"required"` em `login-options.ts` e `register-options.ts`.

Motivo: a verificação já exige por padrão; aparelho sem PIN ou biometria falharia no último passo.

### 2.8 `assetlinks.json`

- [ ] Substituir o conteúdo de [assetlinks.json](../public/.well-known/assetlinks.json) por:

```json
[
  {
    "relation": [
      "delegate_permission/common.handle_all_urls",
      "delegate_permission/common.get_login_creds"
    ],
    "target": {
      "namespace": "android_app",
      "package_name": "com.taverna.amigos",
      "sha256_cert_fingerprints": [
        "D0:AD:EC:47:93:55:7E:72:5D:BD:C6:9A:29:3A:52:6B:34:5F:6B:D7:2A:C6:7C:9B:41:5E:2E:BF:44:04:98:1A"
      ]
    }
  }
]
```

Motivo: são as relações do [exemplo oficial](https://developer.android.com/identity/credential-manager/prerequisites).

## 3. Segurança (obrigatório)

### 3.1 Desafio de uso único

- [ ] Em `login-verify.ts` e `register-verify.ts`, trocar a leitura seguida de `delete` por uma operação:

```ts
const { data: challengeRow } = await supabaseAdmin
  .from("webauthn_challenges")
  .delete()
  .eq("id", challengeId)
  .is("user_id", null) // no cadastro: .eq("user_id", user.id)
  .gt("expires_at", new Date().toISOString())
  .select("challenge")
  .maybeSingle();
```

Motivo: evita reuso simultâneo e impede usar no login um desafio de cadastro.

### 3.2 `login-options`

- [ ] Remover o parâmetro `email`, o `allowCredentials` e o `email` de `signInWithPasskey`.
- [ ] Nas duas rotas de opções, apagar os vencidos antes de inserir:

```ts
await supabaseAdmin
  .from("webauthn_challenges")
  .delete()
  .lt("expires_at", new Date().toISOString());
```

Motivo: a rota pública revela se um e-mail tem chave e a tabela só cresce.

### 3.3 Remoção de chave

Troca o código por e-mail por confirmação de senha.

- [ ] Cliente: `signInWithPassword` com a senha digitada e, em seguida, chamar a rota com o token novo.
- [ ] [remove-passkey.ts](../api/webauthn/remove-passkey.ts): exigir senha confirmada há menos de 5 minutos e remover
  só a chave pedida.

```ts
// depois de getAuthenticatedUser, que já validou o token
const token = req.headers.authorization!.slice(7);
const payload = JSON.parse(
  Buffer.from(token.split(".")[1], "base64url").toString(),
) as { amr?: { method: string; timestamp: number }[] };
const recent = (payload.amr ?? []).some(
  (m) => m.method === "password" && Date.now() / 1000 - m.timestamp < 300,
);
if (!recent) {
  return res.status(403).json({ error: "Confirme sua senha para remover a chave." });
}

const { id } = req.body ?? {};
if (typeof id !== "string") {
  return res.status(400).json({ error: "Chave não informada." });
}

const { error } = await supabaseAdmin
  .from("user_passkeys")
  .delete()
  .eq("user_id", user.id)
  .eq("id", id);
```

- [ ] Conferir num token real que a claim `amr` vem com `method: "password"`.

Motivo: hoje a confirmação existe só na tela e qualquer sessão aberta apaga todas as chaves. O e-mail tem limite de envio.

### 3.4 Erros e logs

- [ ] Em `api/webauthn/*`, responder mensagem genérica e registrar `err` só no servidor.
- [ ] Apagar os `console.log` de [AuthContext.tsx](../src/lib/AuthContext.tsx#L364-L373): imprimem a credencial.

### 3.5 Migration

- [ ] Em [webauthn_migration.sql](../supabase/webauthn_migration.sql), trocar o bloco de policies por:

```sql
DROP POLICY IF EXISTS "User can view own passkeys" ON public.user_passkeys;
DROP POLICY IF EXISTS "Users can view own passkeys" ON public.user_passkeys;
CREATE POLICY "Users can view own passkeys"
    ON public.user_passkeys FOR SELECT
    USING (auth.uid() = user_id);

-- remoção só pelo servidor
DROP POLICY IF EXISTS "Users can delete own passkeys" ON public.user_passkeys;
```

- [ ] Trocar a função `get_user_id_by_email` (e seus `REVOKE`/`GRANT`) por
  `DROP FUNCTION IF EXISTS public.get_user_id_by_email(TEXT);`.
- [ ] Registrar a migration como pendente.

Motivo: o nome divergente da policy faz a segunda execução falhar.

## 4. Funcionalidade, já na estrutura do projeto

- [ ] Criar `src/features/passkey/` com `passkeyService.ts`, `passkeyLogic.ts`, `passkeyTypes.ts` e os dois componentes.
  Tirar do `AuthContext` o código de passkey; telas passam a usar o service (regras 3 e 4).
- [ ] Restaurar os comentários apagados do `AuthContext` (versão do APK e modo beta).

### Várias chaves por conta

- [ ] `register-options.ts`: apagar o bloco que responde 409
  ([linhas 36-40](../api/webauthn/register-options.ts#L36-L40)). Manter `excludeCredentials`.
- [ ] Perfil: listar `id`, `friendly_name` e `created_at` pelo service (RLS já permite), com "Adicionar chave neste
  aparelho" sempre visível e "Remover" em cada item.
- [ ] Chave já existente no aparelho: mostrar "Este aparelho já tem uma chave" (`InvalidStateError` no navegador).

### Liberar para todos

- [ ] `PasskeySettings`: remover `useDevMode`, o `return null` do modo desenvolvedor, `Boolean(registerPasskey)` e
  `hasNativePasskeySupport`. Usar só `isPasskeySupported()`.

### Convite após o login

- [ ] Mostrar apenas se: há suporte, não está em redefinição de senha (`!recovering`), a conta não tem chave e o convite
  não foi recusado.
- [ ] "Agora não" grava `rolezinho:passkey-prompt:<userId>` no `localStorage`.
- [ ] Criar ou remover chave atualiza convite e Perfil pela mesma fonte.

Motivo: hoje volta a cada abertura, aparece sem suporte e cobre a tela de nova senha.

### Mensagens

- [ ] Traduzir os erros do plugin nativo (cancelamento, chave existente, sem chave no aparelho).

## 5. Testes (obrigatório antes de liberar)

- [ ] Mock do plugin `Passkey` em `src/test/setup.ts`.
- [ ] `passkeyLogic`: suporte (navegador, APK com e sem plugin), nome do aparelho, tradução de erros.
- [ ] `api/webauthn/*`: sem login; desafio vencido, reusado e de outro tipo; origem web e Android aceitas, outra
  recusada; segunda chave; remoção sem senha recente; remoção de chave alheia.
- [ ] Login: botão com e sem suporte, sucesso, erro, cancelamento.
- [ ] Perfil: lista, vazio, erro, adicionar, remover.
- [ ] Convite: aparece, não aparece em cada condição, recusa lembrada.
- [ ] Componentes novos em `pages.smoke.test.tsx`.
- [ ] ESLint sem erros: trocar os `any` e corrigir o efeito apontado.

## 6. Documentação

- [ ] Em `docs/backlog.md`, substituir toda a seção "Entrada com biometria (APK)", inclusive a nota no fim dela, por:

```markdown
## Chave de acesso (passkey)

Decidido em 26/11/2026: substitui o plano de biometria com senha guardada. WebAuthn no site e no APK (plugin
Credential Manager, com OTA), liberado a todas as contas, várias chaves por conta, sem serviço pago.

Pendências de produção:

- rodar `supabase/webauthn_migration.sql`;
- conferir as variáveis do servidor;
- publicar o site (com o `assetlinks.json`) e gerar APK novo.
```

- [ ] Em `docs/estrutura-do-projeto.md`, incluir o módulo, as rotas, as variáveis e o plugin.
- [ ] Ao concluir, apagar do backlog o que foi feito.

## 7. Publicar

- [ ] Regra 2 toda verde e `npm run build`.
- [ ] Rodar a migration no Supabase.
- [ ] Na Vercel, conferir `SUPABASE_SERVICE_ROLE_KEY`, URL do Supabase e Node 22 ou superior.
  `WEBAUTHN_RP_ID` e `WEBAUTHN_ORIGIN` só se diferirem do padrão.
- [ ] Merge na `main` com **squash** (o histórico da branch tem 25 MB de backup) e apagar a branch remota.
- [ ] `npm run deploy:web`, commit e push na `main`.
- [ ] `npm run deploy:android` (há mudança nativa).
- [ ] No aparelho: cadastrar, sair, entrar, adicionar segunda chave, remover; criar conta; recuperar senha; abrir um
  APK antigo e confirmar que nada de passkey aparece.

## Testar no celular antes de publicar

Com `npx vercel dev` rodando atrás de um túnel gratuito (PowerShell):

```powershell
$env:CAP_SERVER_URL = "https://SEU-TUNEL"
npm run build
npx cap sync android          # sempre antes do Gradle
cd android; .\gradlew.bat assembleDebug
Remove-Item Env:CAP_SERVER_URL
```

- No `.env.local`: `WEBAUTHN_RP_ID` (domínio do túnel), `WEBAUTHN_ORIGIN` (URL completa) e
  `WEBAUTHN_EXTRA_ORIGINS` (origem da sua chave debug).
- Incluir a impressão da sua chave no `assetlinks.json` só localmente. **Não commitar.**
- Se o domínio do túnel for bloqueado pelo Vite, liberar `allowedHosts` por variável de ambiente.

## Já verificado

Passo 1 com 2.1, 2.3 e 2.5, numa cópia: 1586 testes passam; `tsc -b`, `typecheck:test`, `npm run build` e o APK debug
compilam. O restante não foi testado, nem nada em aparelho ou contra o Supabase real.

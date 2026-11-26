# Revisão da `feat-webauthn`: guia de alterações

Análise de 26/11/2026. Branch no commit `85761bc` (14 commits) comparada com a `main` em `5d7165a` (v0.0.108).
Os números de linha valem para o `85761bc`.

## 1. Resumo

A funcionalidade é um login por **chave de acesso (passkey)**, no site e no APK. A base é sensata: SimpleWebAuthn no
servidor, desafio guardado no banco, RLS ligada e Credential Manager no Android.

O problema é que **o ambiente de teste local foi commitado junto com a funcionalidade** (URL do ngrok, OTA desligado,
caminho de Java do Windows, log de build, pasta de backup), e há bugs que impedem o fluxo no Android.

**Não fazer merge nem `deploy:web` a partir desta branch no estado atual.**

| Checagem                           | `main`              | `feat-webauthn`                        |
| ---------------------------------- | ------------------- | -------------------------------------- |
| `npm test`                         | 108 arquivos passam | 13 testes falham (de 1586)             |
| `tsc -b` / `typecheck:test`        | passam              | 2 erros                                |
| ESLint nos arquivos alterados      | não rodado          | 13 erros, 1 aviso                      |
| `./gradlew assembleDebug` no Linux | não rodado          | falha; passa ao remover uma linha (G7) |

## 2. Como o trabalho aconteceu

"Evidência" é o que está no repositório. O "por quê" é **inferência** e precisa ser confirmado com Nelson (seção 9).

| Fase                            | O que foi feito                                                                                               | Por quê (inferência) e evidência                                                                                                                                                                                                                           |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Servidor (23/11)             | Biblioteca, migration e 5 rotas em `api/webauthn/`                                                            | Caminho padrão: passkey exige verificação no servidor.                                                                                                                                                                                                     |
| 2. Tela + WebView (24/11)       | Contexto, tela de login, Perfil; tentativa de WebAuthn dentro do WebView (`WebAuthnWebViewConfig`)            | O `MainActivity` guardado em `android-backup/` chama `WebAuthnWebViewConfig.enable(...)`.                                                                                                                                                                  |
| 2b. Briga com o build (24/11)   | Java fixado no `gradle.properties`, `android-backup/`, `build-error.txt`                                      | Máquina Windows. O log mostra `gradlew.bat` falhando por falta de `cordova.variables.gradle`, arquivo gerado pelo `npx cap sync`. Tudo indica que a pasta `android/` foi recriada: os XML de ícone adicionados são idênticos aos do template do Capacitor. |
| 2c. Teste no celular (24/11)    | `server.url` comentado, ngrok no Vite                                                                         | Com OTA o APK carrega a produção, que não tem o código novo. O script `build:android:bundled` usa sintaxe e `bash` de Linux, o que explica a edição manual.                                                                                                |
| 3. Plugin nativo (26/11, tarde) | `PasskeyPlugin.java`, origem Android, `assetlinks.json`, servidor local (`express`, `dotenv`, `concurrently`) | A via WebView aparentemente não funcionou: o commit `6f1110e` remove logs que investigavam `PublicKeyCredential` no APK.                                                                                                                                   |
| 4. Acabamento (26/11, fim)      | Pop-up pós-login, código de 8 dígitos, textos, backlog                                                        | O pop-up segue o texto do backlog; o backlog novo lista o que falta para produção.                                                                                                                                                                         |

### Commit a commit

| Commit                    | O que faz                                                  | Faz sentido?                                                                   | Destino                                            |
| ------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------ | -------------------------------------------------- |
| `af4b9f9` biblioteca      | Adiciona SimpleWebAuthn                                    | Sim                                                                            | Manter                                             |
| `3507d40` "SQL"           | Migration **e** as 5 rotas                                 | Sim; a mensagem só cita o SQL                                                  | Manter e ajustar (S1–S4)                           |
| `8b04897` implementação   | Tela, contexto, Perfil, WebView, config local, log, backup | Mistura funcionalidade e ambiente local                                        | Separar: manter a funcionalidade, reverter o resto |
| `a6188f4` ignora backup   | Tira `android-backup/` do Git                              | Sim, correção do commit anterior                                               | Squash resolve o histórico                         |
| `1c7be19` dependências    | `express`, `dotenv`, `concurrently`; lockfile regenerado   | Servidor local faz sentido; atualizar 262 pacotes não tem relação com a tarefa | Reverter lockfile (G1)                             |
| `bd1f5fb` plugin nativo   | Credential Manager                                         | Sim, é a abordagem indicada para app Android                                   | Manter e corrigir (G5)                             |
| `f5c4303` origens         | Aceita origem Android no login                             | Incompleto                                                                     | Corrigir (G6)                                      |
| `6f1110e` resposta nativa | Separa fluxo nativo e web                                  | Sim, mas deixou linha quebrada, logs e ngrok                                   | Corrigir (G1, G3)                                  |
| `5e70864` assetlinks      | Relações para credenciais                                  | Sim                                                                            | Simplificar (I6)                                   |
| `47bb619` gitignore       | Ignora builds e segredos                                   | Sim; há linhas redundantes                                                     | Manter e enxugar                                   |
| `2f3e217` pop-up          | Convite para cadastrar                                     | Segue o backlog; sem controle de exibição                                      | Ajustar (I1, I2)                                   |
| `a23648b` 8 dígitos       | Valida código de 8 dígitos                                 | Sim; também anulou a checagem de suporte                                       | Ajustar (I8)                                       |
| `932c201` "URL correta"   | **Só troca três textos de erro**                           | A mensagem não bate com o conteúdo                                             | Perguntar se faltou uma alteração (G3)             |
| `85761bc` backlog         | Pendências de produção                                     | Útil; precisa refletir o desvio (seção 3)                                      | Atualizar                                          |

## 3. Decidir antes de codar

### D1. A implementação é diferente do que o backlog decidiu

| Backlog (decisão de 20/11)                                             | Implementado                                         |
| ---------------------------------------------------------------------- | ---------------------------------------------------- |
| Biometria guarda a credencial no Keystore e chama `signInWithPassword` | Passkey (WebAuthn) com verificação no servidor       |
| Só no APK                                                              | APK e navegador                                      |
| Plugin sugerido `capacitor-native-biometric`                           | Plugin próprio com Credential Manager                |
| Pergunta **única** depois do primeiro login                            | Pergunta a cada abertura do app                      |
| Interruptor no Perfil, por aparelho                                    | Seção no Perfil, só no modo desenvolvedor, por conta |
| `biometricLogic.ts`, `biometricService.ts`, testes                     | Código em `lib/`, `components/`, sem testes          |

A nota "credenciais guardadas no Keystore, ok" não descreve o que foi feito: o app não guarda credencial; a chave fica
com o provedor do aparelho (em geral o Gerenciador de Senhas do Google, que pode sincronizar entre aparelhos).

**Recomendação:** ficar com passkey (não armazena senha e serve ao site também) e atualizar o backlog. O custo é uma
rota de servidor com `SUPABASE_SERVICE_ROLE_KEY` emitindo sessão, por isso os itens de segurança são obrigatórios.

### D2. Quem vê a funcionalidade

Hoje o botão no login e o pop-up aparecem para todos, mas a seção do Perfil só no modo desenvolvedor. Um usuário comum
consegue criar a chave e não consegue remover. **Recomendação:** uma única regra para os três pontos (modo
desenvolvedor durante o teste; depois, feature flag ou todos).

### D3. Quantas chaves por conta

O servidor recusa a segunda chave (409) e a remoção apaga todas. Quem cadastrar no computador pode não conseguir
cadastrar no celular. **Recomendação:** permitir várias, listadas por aparelho. Se ficar uma só, documentar.

## 4. Problemas graves

### G1. O build quebra

`npm run build` roda `tsc -b`, e é o que a Vercel executa.

**a)** [AuthContext.tsx:376-381](../src/lib/AuthContext.tsx#L376-L381): sobrou uma segunda atribuição e uma leitura de
`result.credential`, que não existe no tipo. Substituir todo o trecho depois de `Passkey.authenticate` por:

```ts
credential = JSON.parse(result.credentialJson);
```

**b)** `rankingService.ts:331` falha porque o lockfile levou o `supabase-js` de 2.99.0 para 2.119.2. Também mudaram
React, Capacitor, Vite e outros. Restaurar e instalar só o necessário:

```bash
git checkout origin/main -- package.json package-lock.json
npm ci
npm install @simplewebauthn/browser@^14.0.0 @simplewebauthn/server@^14.1.0
```

Isso remove `express`, `dotenv`, `concurrently` e os scripts `server`/`dev:all` (ver L4).
`@simplewebauthn/server` 14 exige **Node 22 ou superior**: atualizar `engines` no `package.json` (hoje `>=20.19.0`) e
conferir a versão do Node no projeto da Vercel.

### G2. Não há botão para criar conta nem para recuperar senha

[LoginPage.tsx:246-267](../src/pages/LoginPage.tsx#L246-L267): o botão de envio foi comentado, e o novo só existe no
login por e-mail. Sem botão, o cadastro (três campos) não é enviado nem com Enter; a recuperação só com Enter.

**Fazer (recomendado):** voltar a tela da `main` e só acrescentar o botão de chave de acesso.

```bash
git checkout origin/main -- src/pages/LoginPage.tsx
```

```tsx
// imports
import { isPasskeySupported } from "@/lib/webauthn";

// no componente
const { signIn, signUp, resetPassword, loading, signInWithPasskey } = useAuth();

const handlePasskeyLogin = async () => {
  if (!signInWithPasskey) return;
  clearMessages();
  setSubmitting(true);
  const { error: err } = await signInWithPasskey();
  if (err) setError(err);
  setSubmitting(false);
};

// logo depois de </form>
{
  mode === "login" && signInWithPasskey && isPasskeySupported() && (
    <button
      type="button"
      onClick={handlePasskeyLogin}
      disabled={submitting}
      className="..."
    >
      Entrar com chave de acesso
    </button>
  );
}
```

Isso também elimina o bloco de erro duplicado e o código comentado. Se a escolha de método em duas etapas for
mantida, é preciso criar os botões de envio de cadastro e recuperação e atualizar os testes explicando a mudança.

### G3. Login aponta para o ngrok

[AuthContext.tsx:339](../src/lib/AuthContext.tsx#L339) fixa `https://stack-chili-subgroup.ngrok-free.dev`. Em produção o
login dependeria do túnel de Nelson, e a credencial e o token de sessão passariam por ele.

**Fazer:** apagar `API_URL` e usar caminhos relativos (`/api/webauthn/login-options` e `/api/webauthn/login-verify`),
como o cadastro já faz.

### G4. OTA desligado

[capacitor.config.ts](../capacitor.config.ts) teve o `server.url` comentado. Um APK gerado assim não atualiza com
`deploy:web`, e `fetch("/api/...")` aponta para os arquivos locais do app, não para o servidor.

```bash
git checkout origin/main -- capacitor.config.ts
```

Para testar no celular sem editar esse arquivo, ver a seção 8.

### G5. O cadastro no Android falha dentro do plugin

[PasskeyPlugin.java:140-146](../android/app/src/main/java/com/taverna/amigos/PasskeyPlugin.java#L140-L146) lê
`userId` e `userName`. A biblioteca gera `user: { id, name, displayName }` e não gera esses campos (confirmado
executando `generateRegistrationOptions`). `getString("userId")` lança exceção e o cadastro é rejeitado.

**Fazer:** o JSON do servidor já está no formato que o Android espera. Em `register`, trocar toda a reconstrução
(`JSONObject options` até o fim de `androidOptions`) por:

```java
CreatePublicKeyCredentialRequest request =
    new CreatePublicKeyCredentialRequest(optionsJson);
```

e remover o `import org.json.JSONArray`. Essa versão compila; falta testar no aparelho. De quebra, `excludeCredentials`
deixa de ser descartado.

### G6. Origens Android erradas no servidor

São dois problemas:

1. [register-verify.ts:44](../api/webauthn/register-verify.ts#L44) aceita só a origem web. O cadastro nativo seria
   recusado.
2. A origem em [\_shared.ts:7](../api/webauthn/_shared.ts#L7) é de **outro certificado**. Ela equivale a
   `CB:FB:14:71:…:3F:21` (provavelmente a chave debug de Nelson). O APK gerado na máquina que publica o app é assinado
   com `D0:AD:EC:47:…:98:1A` (confirmado com `apksigner`), então o login nesse APK também seria recusado.

```ts
// _shared.ts
const releaseAndroidOrigin =
  "android:apk-key-hash:0K3sR5NVfnJdvcaaKTpSazRfa9cqxnybQV4uv0QEmBo"; // D0:AD:…:98:1A
const extraOrigins = (process.env.WEBAUTHN_EXTRA_ORIGINS ?? "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);
export const expectedOrigins = [origin, releaseAndroidOrigin, ...extraOrigins];
```

Usar `expectedOrigins` **nas duas** verificações. Chaves de desenvolvimento entram por `WEBAUTHN_EXTRA_ORIGINS`, só no
ambiente local.

### G7. O build do APK quebra fora da máquina de Nelson

[gradle.properties:24](../android/gradle.properties#L24) fixa `C:\Program Files\Amazon Corretto\…`. No Linux o Gradle
para com "Java home supplied is invalid"; sem a linha, o build passa.

```bash
git checkout origin/main -- android/gradle.properties
```

Quem precisar fixar o Java coloca em `%USERPROFILE%\.gradle\gradle.properties`, fora do projeto.

### G8. APKs já instalados receberiam a tela sem ter o plugin

Com o OTA, o `deploy:web` entrega a interface nova a todos os APKs. Os antigos não têm o plugin `Passkey`, mas
[`isPasskeySupported`](../src/lib/webauthn.ts) devolve `true` em qualquer app nativo. Eles veriam o botão e o pop-up, e
ambos falhariam.

```ts
if (Capacitor.isNativePlatform()) return Capacitor.isPluginAvailable("Passkey");
```

Usar essa função no login, no pop-up e no Perfil. Validar com um APK antigo.

## 5. Segurança

| #   | Problema                                                                                                                                                                                                                                              | Correção                                                                                                                                                                                                                                      |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S1  | A confirmação por e-mail para remover a chave existe só na tela. [remove-passkey.ts](../api/webauthn/remove-passkey.ts) aceita qualquer sessão válida, e a policy de `DELETE` permite apagar direto pelo cliente. Contraria a regra 5 do `CLAUDE.md`. | Remover a policy de `DELETE`; no servidor, exigir verificação recente (por exemplo, a entrada `otp` com horário na claim `amr` do token; confirmar no projeto Supabase). Se a confirmação não for necessária, tirar da tela.                  |
| S2  | O desafio é lido e depois apagado em duas operações (permite reuso simultâneo), e o login aceita desafio criado para cadastro.                                                                                                                        | Consumir numa operação só: `delete().eq("id", …).gt("expires_at", …).select().maybeSingle()`; no login, acrescentar `.is("user_id", null)`.                                                                                                   |
| S3  | `login-options` é público, grava uma linha a cada chamada e nada limpa as vencidas. Com `email`, revela se a conta tem chave.                                                                                                                         | A chave é descobrível e o campo de e-mail nem aparece no primeiro passo da tela: remover o parâmetro `email`, `allowCredentials` e a função `get_user_id_by_email`. Apagar desafios vencidos a cada inserção e considerar limite de chamadas. |
| S4  | As rotas devolvem `err.message` ao cliente.                                                                                                                                                                                                           | Mensagem genérica na resposta; detalhe só no log do servidor.                                                                                                                                                                                 |
| S5  | `console.log` das opções e da **credencial** em [AuthContext.tsx](../src/lib/AuthContext.tsx#L364-L373).                                                                                                                                              | Remover.                                                                                                                                                                                                                                      |

### Migration ([webauthn_migration.sql](../supabase/webauthn_migration.sql))

- A policy é apagada como `Users can view own passkeys` e criada como `User can view own passkeys`: rodar duas vezes
  dá erro. Padronizar e manter um `DROP POLICY IF EXISTS` para o nome antigo, caso já tenha sido rodada.
- Aplicar S1 e S3.
- Registrar como pendente até ser rodada (regra 7).

## 6. Outros pontos

### Comportamento

| #   | Problema                                                                                                                                                                                                                                 | Correção                                                            |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| I1  | O pop-up volta a cada abertura; "Agora não" não é lembrado.                                                                                                                                                                              | Guardar a recusa por usuário e aparelho.                            |
| I2  | O pop-up aparece sem checar suporte e também por cima da tela de redefinição de senha.                                                                                                                                                   | Condicionar a suporte, à regra de D2 e a `!recovering`.             |
| I3  | As opções pedem `userVerification: "preferred"`, mas a verificação da biblioteca exige por padrão. Autenticadores sem PIN ou biometria falham no fim.                                                                                    | Usar `"required"` nas opções de login e cadastro.                   |
| I4  | O efeito do pop-up e o `PasskeySettings` repetem a mesma consulta, com estados separados: criar pela primeira não atualiza a outra.                                                                                                      | Uma única fonte no serviço.                                         |
| I5  | Erros do plugin nativo chegam em inglês; cancelar não vira "Autenticação cancelada", porque o nome `NotAllowedError` é do navegador.                                                                                                     | Mapear os erros do plugin para mensagens em português.              |
| I6  | `assetlinks.json` ganhou três blocos, incluindo `get_all_credential_manifest` e `save_creds`. O [exemplo oficial](https://developer.android.com/identity/credential-manager/prerequisites) usa só `handle_all_urls` e `get_login_creds`. | Um bloco com as duas relações e a impressão `D0:AD:…`.              |
| I7  | A mesma página cita `asset_statements` no manifest, sem dizer claramente se é obrigatório para passkeys.                                                                                                                                 | Testar no aparelho; adicionar se o Android recusar o domínio.       |
| I8  | Em `PasskeySettings`, `isPasskeySupported() \|\| Boolean(registerPasskey)` é sempre verdadeiro.                                                                                                                                          | Usar só `isPasskeySupported()` e remover `hasNativePasskeySupport`. |

### Limpeza do repositório e da configuração

| #   | Item                                                                                                                                  | Ação                                                                                                                       |
| --- | ------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| L1  | `build-error.txt` (log com caminhos da máquina)                                                                                       | `git rm build-error.txt`                                                                                                   |
| L2  | `mipmap-anydpi-v26/ic_launcher*.xml` reapareceram. A `main` os removeu de propósito no rebrand (`d94e39d`) para usar o ícone próprio. | Remover os dois e conferir o ícone no aparelho                                                                             |
| L3  | `WebAuthnWebViewConfig.java` não é usado; `androidx.webkit` só servia a ele                                                           | Remover arquivo e dependência                                                                                              |
| L4  | `server/api.ts` é ignorado pelo Git, então `npm run server` não funciona para outra pessoa; `tsx` não está declarado                  | Preferir `vercel dev`. Se mantiver, versionar o arquivo (sem segredos) e declarar tudo como dependência de desenvolvimento |
| L5  | `vite.config.ts`: domínio ngrok fixo e proxy `/api` para `localhost:3001`                                                             | Ler de variável de ambiente ou reverter                                                                                    |
| L6  | `.gitignore`: `node_modules/`, `android/app/build/`, `local.properties` e `*.apk` já eram cobertos                                    | Enxugar                                                                                                                    |
| L7  | Comentários úteis removidos do `AuthContext` (versão do APK, modo beta)                                                               | Restaurar                                                                                                                  |
| L8  | `android-backup/` (25 MB) continua no histórico                                                                                       | Merge com **squash** e apagar a branch remota depois                                                                       |
| L9  | A branch leva as rotas de `api/` de 6 para 11                                                                                         | Se o plano da Vercel for Hobby, conferir o limite de funções                                                               |

### Padrões do projeto

- **Regra 1, testes:** nenhum foi adicionado. Cobrir:
  - lógica pura (suporte, nome do aparelho, mapeamento de erros);
  - rotas `api/webauthn/*` (desafio vencido, reuso, origem Android, usuário errado, remoção sem confirmação);
  - botão de login, pop-up e Perfil (com dados, vazio, erro);
  - mock do plugin em `src/test/setup.ts` e componentes novos no `pages.smoke.test.tsx`.
- **Regras 3 e 4:** `AuthContext` e `PasskeySettings` consultam o Supabase direto. Mover para `src/features/passkey/`
  com `passkeyService.ts`, `passkeyLogic.ts` e `passkeyTypes.ts`; isso também tira boa parte das 287 linhas que a
  branch acrescentou ao `AuthContext` (hoje com 609).
- **ESLint:** trocar os `any`, corrigir o `setState` síncrono no efeito e a dependência faltante.
- Padronizar a indentação dos arquivos novos.

## 7. Ordem de execução

1. [ ] Fechar D1, D2 e D3.
2. [ ] Reverter o que não é da funcionalidade: G1b, G4, G7, L1, L2, L3, L5.
3. [ ] Corrigir os bugs: G1a, G2, G3, G5, G6, G8, I3.
4. [ ] Segurança e migration: S1 a S5.
5. [ ] Comportamento: I1, I2, I4 a I8.
6. [ ] Estrutura, testes e lint.
7. [ ] Tudo verde: `npm test`, `npx tsc -b`, `npm run typecheck:test`, `npx eslint <arquivos>`.
8. [ ] Produção, nesta ordem:
   - rodar a migration no Supabase;
   - conferir na Vercel `SUPABASE_SERVICE_ROLE_KEY`, a URL do Supabase, a versão do Node e, se forem diferentes do
     padrão, `WEBAUTHN_RP_ID` e `WEBAUTHN_ORIGIN`;
   - squash na `main` e `npm run deploy:web` (publica o `assetlinks.json`);
   - `npm run deploy:android`, porque há mudança nativa;
   - testar no aparelho: cadastrar, sair, entrar, remover; criar conta e recuperar senha; um APK antigo.
9. [ ] Atualizar `docs/backlog.md` e `docs/estrutura-do-projeto.md`.

## 8. Testar no celular sem mexer no `capacitor.config.ts`

O projeto já aceita `CAP_SERVER_URL`. O túnel precisa apontar para algo que sirva o site **e** `/api`: `vercel dev`, ou
o Vite com o proxy e o domínio lidos de variável de ambiente (L5). Com isso rodando, no PowerShell:

```powershell
$env:CAP_SERVER_URL = "https://SEU-TUNEL.ngrok-free.dev"
npm run build
npx cap sync android          # sempre antes do Gradle
cd android; .\gradlew.bat assembleDebug
Remove-Item Env:CAP_SERVER_URL
```

No ambiente local: `WEBAUTHN_RP_ID` = domínio do túnel (sem `https://`), `WEBAUTHN_ORIGIN` = URL completa,
`WEBAUTHN_EXTRA_ORIGINS` = origem da sua chave debug. O `assetlinks.json` servido pelo túnel precisa conter a impressão
dessa chave, **sem commitar** a mudança se ela for só de teste. Um APK assinado com outra chave não instala por cima do
oficial.

## 9. Perguntas para Nelson

1. O cadastro pelo APK chegou a funcionar? Pelo código, não passaria (G5 e G6). A chave foi criada no navegador e usada
   no celular?
2. O commit `932c201` deveria ter trocado a URL do login (G3)?
3. `CB:FB:14:71:…` é a sua chave debug?
4. A migration já foi rodada? Em qual projeto Supabase?
5. O `server/api.ts` faz algo além de servir as rotas de `api/`?
6. A atualização do lockfile foi intencional?

## 10. O que foi verificado

**Executado em cópias isoladas do repositório:**

- testes e checagem de tipos na `main` e na branch; ESLint na branch;
- opções de cadastro geradas pela biblioteca (G5) e padrões de verificação no código dela (I3);
- build do APK com e sem a linha do Java; compilação do plugin simplificado; certificado do APK gerado;
- protótipo de G1a, G1b e G2: **108 arquivos / 1586 testes passam**, `tsc -b`, `typecheck:test` e `npm run build` passam.

**Não verificado:** comportamento em aparelho, rotas rodando com Supabase real, variáveis e plano na Vercel, estado da
migration, o roteiro da seção 8 e qualquer trabalho de Nelson que não tenha sido enviado ao GitHub. As demais
correções propostas não foram testadas.

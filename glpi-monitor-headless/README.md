# GLPI Monitor Headless

Monitora a fila de chamados do GLPI 24/7 (Playwright headless) e alerta no Telegram
quando surge chamado sem técnico (grupo vazio, N1 ou N2).

## Instalação / atualização
```bash
npm install
npx playwright install chromium   # só na primeira vez
cp .env.example .env              # ou mantenha o seu .env atual
npm test                          # 12 testes da lógica de alertas
npm start
```
Rodar como serviço: `pm2 start ecosystem.config.cjs && pm2 save`.
`npm run diagnostico` inspeciona a página de chamados (colunas, HTML da 1ª linha).

## Configuração
Veja `.env.example`. Credenciais podem ficar em `data/credentials.json`
(`{"glpiUser":"...","glpiPass":"..."}`). Técnicos: variável `TECNICOS` (uma linha só)
e/ou `data/tecnicos.txt` (um por linha).

## Estrutura
```
src/index.js            ponto de entrada, shutdown limpo
src/core/               config, logger, histórico, técnicos, saúde, helpers
src/browser/            launcher, login, parser, filtro (URL da listagem)
src/monitor/            monitor (ciclo), analisador (regras puras), observer (agenda)
src/notify/             telegram, notificação desktop
test/                   testes (node --test)
```

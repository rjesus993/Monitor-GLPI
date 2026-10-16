import { config } from '../core/config.js';
import { logger } from '../core/logger.js';
import { historico } from '../core/historico.js';
import { tecnicos } from '../core/tecnicos.js';
import { saude } from '../core/saude.js';
import { Mutex, sleep } from '../core/helpers.js';
import { launcher } from '../browser/launcher.js';
import { login } from '../browser/login.js';
import { parser, SELETOR_CELULA_ID } from '../browser/parser.js';
import { montarUrlTickets, avisarSeFiltroPerdido } from '../browser/filtro.js';
import { telegram } from '../notify/telegram.js';
import { notificacao } from '../notify/notificacao.js';
import { analisarChamados } from './analisador.js';

const MAX_TENTATIVAS_ALERTA = 10;   // depois disso desiste de um alerta que nunca sai
const LEITURAS_VAZIAS_MAX = 3;      // tabela vazia N vezes seguidas = suspeito

const mutex = new Mutex();
const estado = { primeiraLeitura: true, leiturasVazias: 0 };

async function bloquearRecursosPesados(page) {
    await page.route('**/*', rota => {
        const tipo = rota.request().resourceType();
        return ['image', 'media', 'font'].includes(tipo) ? rota.abort() : rota.continue();
    });
}

/** Envia o alerta. Sucesso = Telegram entregou (ou, sem Telegram, o desktop). */
async function notificar(id) {
    const [telegramOk, desktopOk] = await Promise.all([
        telegram.configurado() ? telegram.enviarAlerta(id) : null,
        config.monitor.notificacaoDesktop ? notificacao.alertar(id) : null
    ]);

    if (telegramOk !== null) return telegramOk;
    if (desktopOk !== null) return desktopOk;

    logger.warn('Nenhum canal de notificação ativo (Telegram/desktop).');
    return true;
}

export const monitor = {
    inicializar() {
        historico.carregar();
        tecnicos.inicializar(config.tecnicos);
        logger.info(`${tecnicos.obterLista().length} técnico(s) carregado(s).`);

        estado.primeiraLeitura = Object.keys(historico.obterTodos()).length === 0;
        if (estado.primeiraLeitura) {
            logger.info('Primeira leitura detectada — alertas serão suprimidos.');
        }
    },

    aguardarOcioso() {
        return mutex.aguardarOcioso();
    },

    async _garantirSessao() {
        const context = await launcher.iniciar();
        await login.autenticar(context);
        return context;
    },

    /** Recarrega o Chromium (libera memória). Espera uma verificação em curso terminar. */
    async recarregarBrowser(motivo = 'manutenção') {
        await mutex.run(async () => {
            logger.info(`Recarregando browser (${motivo})...`);
            await launcher.fechar();
            try {
                await this._garantirSessao();
            } catch (e) {
                // Sem problema: o próximo ciclo detecta e tenta de novo.
                logger.error(`Falha ao reabrir o browser/sessão: ${e.message}`);
            }
        });
    },

    async verificar() {
        if (mutex.ocupado) {
            logger.debug('Verificação ignorada: outra operação em andamento.');
            return;
        }

        await mutex.run(async () => {
            try {
                await this._ciclo();
                await saude.sucesso();
            } catch (e) {
                logger.error(`Erro na verificação: ${e.message}`);
                await saude.falha(e);

                // A cada 3 falhas seguidas, derruba o Chromium para recomeçar limpo.
                if (saude.falhasConsecutivas() % 3 === 0) {
                    logger.warn('Falhas consecutivas — reiniciando o browser no próximo ciclo.');
                    await launcher.fechar();
                }
            }
        });
    },

    async _ciclo() {
        const context = launcher.obterContexto() ?? await this._garantirSessao();
        const page = await context.newPage();

        try {
            if (config.monitor.bloquearRecursos) await bloquearRecursosPesados(page);

            const url = montarUrlTickets(config.glpi.url);
            logger.debug(`Navegando para: ${url}`);

            for (let tentativa = 1; ; tentativa++) {
                await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

                if (!(await login.paginaDeLogin(page))) break;

                if (tentativa > 1) {
                    throw new Error('Sessão não persistiu após novo login (GLPI redirecionou para a tela de login de novo).');
                }
                logger.warn('Sessão expirou — tela de login detectada. Refazendo login...');
                await login.autenticar(context);
            }

            avisarSeFiltroPerdido(page.url());

            // Espera as linhas da tabela (se não vierem, pode ser lista realmente vazia).
            await page.waitForSelector(SELETOR_CELULA_ID, { timeout: 20000 }).catch(() => {});

            const chamados = await parser.extrairChamados(page);
            logger.debug(`Extraídos ${chamados.length} chamados da página.`);

            if (chamados.length === 0) {
                estado.leiturasVazias++;
                logger.warn(`Tabela sem chamados (${estado.leiturasVazias}/${LEITURAS_VAZIAS_MAX}). URL: ${page.url()}`);
                if (estado.leiturasVazias >= LEITURAS_VAZIAS_MAX) {
                    throw new Error(
                        `Lista de chamados vazia em ${estado.leiturasVazias} leituras seguidas — ` +
                        'possível mudança de layout, filtro ou permissão.'
                    );
                }
                return;
            }
            estado.leiturasVazias = 0;

            await this.processarChamados(chamados);
        } finally {
            if (!page.isClosed()) await page.close().catch(() => {});
        }
    },

    async processarChamados(chamados) {
        const resultado = analisarChamados(chamados, {
            historico,
            tecnicos,
            primeiraLeitura: estado.primeiraLeitura,
            agoraISO: new Date().toISOString()
        });

        logger.info(`Chamados sem técnico nesta página: ${resultado.semTecnico}`);

        if (estado.primeiraLeitura) {
            historico.salvar();
            estado.primeiraLeitura = false;
            logger.info('Primeira leitura concluída. Registros salvos sem disparar alertas.');
            return;
        }

        // Salva o estado da análise antes de notificar (pendentes continuam notificado=false).
        historico.salvar();

        for (const [i, id] of resultado.novos.entries()) {
            logger.info(`🆕 Novo chamado detectado: #${id}`);

            if (await notificar(id)) {
                historico.alterarNotificado(id, true);
            } else {
                const tentativas = historico.registrarFalha(id);
                if (tentativas >= MAX_TENTATIVAS_ALERTA) {
                    logger.error(`Alerta de #${id} falhou ${tentativas}x — desistindo.`);
                    historico.alterarNotificado(id, true);
                } else {
                    logger.warn(`Alerta de #${id} não foi entregue (tentativa ${tentativas}) — tentarei no próximo ciclo.`);
                }
            }
            historico.salvar();

            if (i < resultado.novos.length - 1) await sleep(1100); // respeita limite do Telegram
        }
    }
};

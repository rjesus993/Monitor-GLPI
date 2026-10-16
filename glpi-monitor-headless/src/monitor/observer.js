import { config } from '../core/config.js';
import { launcher } from '../browser/launcher.js';
import { logger } from '../core/logger.js';
import { monitor } from './monitor.js';

let ativo = false;
let timerVerificacao = null;
let timerRecarga = null;

function agendarVerificacao(ms) {
    timerVerificacao = setTimeout(async () => {
        try {
            await monitor.verificar();
        } catch (e) {
            logger.error(`Erro no ciclo de verificação: ${e.message}`);
        } finally {
            // setTimeout encadeado (e não setInterval): o próximo ciclo só é agendado
            // depois que o atual termina, sem acúmulo nem sobreposição.
            if (ativo) agendarVerificacao(config.monitor.tempoAtualizacaoMs);
        }
    }, ms);
}

export const observer = {
    iniciar() {
        ativo = true;
        agendarVerificacao(config.monitor.tempoAtualizacaoMs);

        timerRecarga = setInterval(async () => {
            try {
                if (launcher.precisaRecarregar()) {
                    await monitor.recarregarBrowser('limpeza periódica de memória');
                }
            } catch (e) {
                logger.error(`Erro ao recarregar browser: ${e.message}`);
            }
        }, 60000);

        const min = Math.round(config.monitor.intervaloRecargaBrowserMs / 60000);
        logger.info(
            `Observer iniciado — verificações a cada ${config.monitor.tempoAtualizacaoMs / 1000}s, ` +
            `recarga do browser a cada ${min}min.`
        );
    },

    parar() {
        ativo = false;
        if (timerVerificacao) clearTimeout(timerVerificacao);
        if (timerRecarga) clearInterval(timerRecarga);
        timerVerificacao = null;
        timerRecarga = null;
    }
};

import { config } from './config.js';
import { logger } from './logger.js';
import { escaparHtml } from './helpers.js';
import { telegram } from '../notify/telegram.js';

let falhas = 0;
let alertado = false;

/** Acompanha falhas consecutivas e avisa no Telegram quando o monitor fica cego. */
export const saude = {
    falhasConsecutivas() {
        return falhas;
    },

    async sucesso() {
        if (alertado) {
            logger.info('Monitor recuperado após falhas.');
            await telegram.enviarMensagem('✅ <b>GLPI Monitor recuperado.</b> As leituras voltaram ao normal.');
            alertado = false;
        }
        falhas = 0;
    },

    async falha(erro) {
        falhas++;
        if (falhas >= config.monitor.falhasParaAlerta && !alertado) {
            alertado = true;
            await telegram.enviarMensagem(
                `⚠️ <b>GLPI Monitor com problemas</b>\n` +
                `${falhas} verificações seguidas falharam — novos chamados podem não ser avisados.\n` +
                `Último erro: <code>${escaparHtml(erro.message).slice(0, 300)}</code>`
            );
        }
    }
};

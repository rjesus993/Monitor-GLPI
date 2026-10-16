import { logger } from '../core/logger.js';

// node-notifier é opcional (só faz sentido em máquina com desktop).
let notifier = null;
let tentouCarregar = false;

async function carregar() {
    if (tentouCarregar) return notifier;
    tentouCarregar = true;
    try {
        notifier = (await import('node-notifier')).default;
    } catch (e) {
        logger.warn(`node-notifier indisponível — notificação desktop desativada (${e.message})`);
    }
    return notifier;
}

export const notificacao = {
    /** Notificação desktop + som numa única chamada. Retorna true/false (nunca lança). */
    async alertar(idChamado) {
        const n = await carregar();
        if (!n) return false;

        return new Promise(resolve => {
            const limite = setTimeout(() => resolve(true), 5000);
            try {
                n.notify(
                    {
                        title: '🚨 GLPI: Novo Chamado na Fila!',
                        message: `Novo chamado #${idChamado}`,
                        sound: true,
                        wait: false
                    },
                    err => {
                        clearTimeout(limite);
                        if (err) logger.debug(`Notificação desktop falhou: ${err.message}`);
                        resolve(!err);
                    }
                );
            } catch (e) {
                clearTimeout(limite);
                logger.debug(`Notificação desktop falhou: ${e.message}`);
                resolve(false);
            }
        });
    }
};

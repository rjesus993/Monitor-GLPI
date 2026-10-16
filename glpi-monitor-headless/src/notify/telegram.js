import { config } from '../core/config.js';
import { logger } from '../core/logger.js';
import { comRetry, escaparHtml } from '../core/helpers.js';

function mascarar(texto) {
    const { token } = config.telegram;
    return token ? String(texto).split(token).join('***') : String(texto);
}

// Empresa pelo padrão do ID: 10 dígitos = HU-UFPI, qualquer outro = J2M.
export function identificarEmpresa(idChamado) {
    return /^\d{10}$/.test(idChamado) ? 'HU-UFPI' : 'J2M';
}

export const telegram = {
    configurado() {
        return Boolean(config.telegram.token && config.telegram.chatId);
    },

    /** Envia texto em HTML. Retorna true/false (nunca lança). */
    async enviarMensagem(textoHtml) {
        if (!this.configurado()) {
            logger.warn('Telegram não configurado — mensagem não enviada.');
            return false;
        }

        const { token, chatId } = config.telegram;
        const url = `https://api.telegram.org/bot${token}/sendMessage`;

        try {
            await comRetry(async () => {
                const resp = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        chat_id: chatId,
                        text: textoHtml,
                        parse_mode: 'HTML',
                        disable_web_page_preview: true
                    }),
                    signal: AbortSignal.timeout(10000)
                });

                const data = await resp.json().catch(() => ({}));
                if (data.ok) return true;

                const erro = new Error(`HTTP ${resp.status}: ${data.description || 'sem descrição'}`);
                const retryAfter = data.parameters?.retry_after;
                if (retryAfter) erro.espera = retryAfter * 1000;
                // 4xx (exceto 429) = token/chat inválido etc. — repetir não adianta.
                erro.definitivo = resp.status >= 400 && resp.status < 500 && resp.status !== 429;
                throw erro;
            }, { tentativas: 3, baseMs: 1500 });

            return true;
        } catch (e) {
            logger.error(`Telegram: ${mascarar(e.message)}`);
            return false;
        }
    },

    async enviarAlerta(idChamado) {
        const id = escaparHtml(idChamado);
        const texto = [
            '🚨 <b>NOVO CHAMADO NO GLPI!</b>',
            '',
            `🏢 <b>Empresa:</b> ${identificarEmpresa(idChamado)}`,
            '',
            `🆔 <b>Chamado:</b> ${id}`,
            '',
            '👨‍💻 Sem técnico responsável.',
            '',
            '👉 <b>Acesse o portal do GLPI para assumir.</b>'
        ].join('\n');

        const ok = await this.enviarMensagem(texto);
        if (ok) logger.info(`✈️ Alerta Telegram enviado para #${idChamado}`);
        return ok;
    }
};

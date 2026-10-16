import fs from 'fs';
import path from 'path';
import { config } from './config.js';
import { logger } from './logger.js';

export const storage = {
    lerHistorico() {
        const arquivo = config.paths.historico;
        if (!fs.existsSync(arquivo)) return {};

        let raw;
        try {
            raw = fs.readFileSync(arquivo, 'utf-8').trim();
        } catch (e) {
            logger.error(`Não consegui ler o histórico (${e.message}). Iniciando vazio.`);
            return {};
        }

        // Arquivo vazio = primeira execução. Não é erro.
        if (raw === '') return {};

        try {
            const dados = JSON.parse(raw);
            if (typeof dados !== 'object' || dados === null || Array.isArray(dados)) {
                throw new Error('formato inválido (esperado objeto)');
            }
            return dados;
        } catch (e) {
            // Preserva o arquivo ruim em vez de sobrescrevê-lo na próxima gravação.
            const backup = `${arquivo}.corrompido-${Date.now()}`;
            try { fs.copyFileSync(arquivo, backup); } catch { /* melhor esforço */ }
            logger.warn(`Histórico corrompido (${e.message}). Cópia em ${backup}. Iniciando vazio.`);
            return {};
        }
    },

    salvarHistorico(historico) {
        try {
            const dir = path.dirname(config.paths.historico);
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

            // Gravação atômica: escreve em .tmp e renomeia.
            const tmp = config.paths.historico + '.tmp';
            fs.writeFileSync(tmp, JSON.stringify(historico, null, 2), 'utf-8');
            fs.renameSync(tmp, config.paths.historico);
            return true;
        } catch (e) {
            logger.error(`Erro ao salvar histórico: ${e.message}`);
            return false;
        }
    }
};

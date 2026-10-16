import { chromium } from 'playwright';
import { config } from '../core/config.js';
import { logger } from '../core/logger.js';
import fs from 'fs';

const USER_DATA_DIR = './data/browser-profile';

let context = null;
let iniciadoEm = null;

export const launcher = {
    async iniciar() {
        if (context) return context;

        logger.info('Iniciando browser headless...');
        fs.mkdirSync(USER_DATA_DIR, { recursive: true });

        // Obs.: --single-process e --no-zygote foram removidos — são instáveis
        // no Chromium e uma causa comum de crash após horas de execução.
        const ctx = await chromium.launchPersistentContext(USER_DATA_DIR, {
            headless: true,
            ignoreHTTPSErrors: true, // aceita certificados internos / autoassinados
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu',
                '--disable-extensions',
                '--disable-background-networking',
                '--disable-sync',
                '--no-first-run'
            ]
        });
        ctx.setDefaultTimeout(30000);

        // Em contexto persistente, context.browser() é null — a forma correta de
        // saber que o Chromium morreu é o evento 'close' do contexto.
        ctx.on('close', () => {
            if (context === ctx) {
                logger.warn('Contexto do browser foi fechado — será recriado no próximo ciclo.');
                context = null;
                iniciadoEm = null;
            }
        });

        context = ctx;
        iniciadoEm = Date.now();
        logger.info('Browser iniciado com sucesso.');
        return ctx;
    },

    obterContexto() {
        return context;
    },

    async fechar() {
        const ctx = context;
        context = null;
        iniciadoEm = null;
        if (!ctx) return;
        try {
            await ctx.close();
            logger.debug('Browser fechado.');
        } catch (e) {
            logger.error(`Erro ao fechar browser: ${e.message}`);
        }
    },

    tempoAtivoMs() {
        return iniciadoEm ? Date.now() - iniciadoEm : 0;
    },

    precisaRecarregar() {
        return context !== null && this.tempoAtivoMs() > config.monitor.intervaloRecargaBrowserMs;
    }
};

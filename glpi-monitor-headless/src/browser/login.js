import { config } from '../core/config.js';
import { logger } from '../core/logger.js';
import fs from 'fs';

const SEL = {
    usuario: 'input[name="login_name"]',
    senha: 'input[name="login_password"]',
    botao: 'button[type="submit"], input[type="submit"]'
};

let emAndamento = null;

async function salvarDiagnosticoFalha(page) {
    try {
        fs.mkdirSync('./data', { recursive: true });
        await page.screenshot({ path: './data/diagnostico-login-erro.png', fullPage: true }).catch(() => {});
        fs.writeFileSync('./data/diagnostico-login-erro.html', await page.content(), 'utf-8');
    } catch { /* melhor esforço */ }
}

export const login = {
    /** A página atual é a tela de login do GLPI? (checa o campo, não só o título) */
    async paginaDeLogin(page) {
        if ((await page.locator(SEL.usuario).count()) > 0) return true;
        const titulo = (await page.title().catch(() => '')).toLowerCase();
        return titulo.includes('autentica') || titulo.includes('login');
    },

    /** Chamadas simultâneas compartilham o mesmo login em andamento. */
    autenticar(context) {
        if (!emAndamento) {
            emAndamento = this._autenticar(context).finally(() => { emAndamento = null; });
        }
        return emAndamento;
    },

    async _autenticar(context) {
        const page = await context.newPage();

        try {
            logger.info(`Navegando para ${config.glpi.url}...`);
            await page.goto(config.glpi.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
            await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});

            if ((await page.locator(SEL.usuario).count()) === 0) {
                logger.info('Sessão já ativa — nenhum campo de login encontrado.');
                return true;
            }

            logger.info('Tela de login detectada. Autenticando...');
            const urlAntes = page.url();

            await page.locator(SEL.usuario).fill(config.glpi.user);
            await page.locator(SEL.senha).fill(config.glpi.pass);

            const promessaNavegacao = page
                .waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30000 })
                .catch(() => null);

            await page.locator(SEL.botao).first().click();
            await promessaNavegacao;

            await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
            await page.waitForTimeout(1000);

            const aindaTemLogin = (await page.locator(SEL.usuario).count()) > 0;
            logger.debug(`Login: URL antes=${urlAntes} | depois=${page.url()} | ainda no login=${aindaTemLogin}`);

            if (aindaTemLogin) {
                await salvarDiagnosticoFalha(page);
                throw new Error(
                    'Login falhou — ainda na tela de login após submeter. ' +
                    'Verifique GLPI_USER/GLPI_PASS. Diagnóstico em data/diagnostico-login-erro.*'
                );
            }

            if (config.monitor.debug) {
                fs.mkdirSync('./data', { recursive: true });
                fs.writeFileSync('./data/diagnostico-pos-login.html', await page.content(), 'utf-8');
            }

            logger.info('Login realizado com sucesso.');
            return true;

        } catch (e) {
            logger.error(`Erro no login: ${e.message}`);
            if (!page.isClosed()) await salvarDiagnosticoFalha(page);
            throw e;
        } finally {
            if (!page.isClosed()) await page.close().catch(() => {});
        }
    }
};

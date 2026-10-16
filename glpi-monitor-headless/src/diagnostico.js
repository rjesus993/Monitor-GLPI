import fs from 'fs';
import { config } from './core/config.js';
import { logger } from './core/logger.js';
import { launcher } from './browser/launcher.js';
import { login } from './browser/login.js';
import { montarUrlTickets } from './browser/filtro.js';

async function main() {
    logger.info('Diagnóstico iniciado.');
    fs.mkdirSync('./data', { recursive: true });

    const context = await launcher.iniciar();

    logger.info('===== ETAPA 1: LOGIN =====');
    try {
        await login.autenticar(context);
    } catch (e) {
        logger.error(`Falha no login: ${e.message}`);
        await launcher.fechar();
        process.exit(1);
    }

    logger.info('===== ETAPA 2: PÓS-LOGIN =====');
    const page = await context.newPage();
    await page.goto(config.glpi.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
    logger.info(`URL: ${page.url()} | Título: ${await page.title()}`);
    fs.writeFileSync('./data/diagnostico-home.html', await page.content(), 'utf-8');

    logger.info('===== ETAPA 3: TICKETS =====');
    const url = montarUrlTickets(config.glpi.url);
    logger.info(`Navegando para: ${url}`);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});
    logger.info(`URL: ${page.url()} | Título: ${await page.title()}`);
    fs.writeFileSync('./data/diagnostico-ticket.html', await page.content(), 'utf-8');

    logger.info('===== ETAPA 4: CONTAGEM DE ELEMENTOS =====');
    const info = await page.evaluate(() => {
        const n = sel => document.querySelectorAll(sel).length;
        const tr = document.querySelector('td[data-searchopt-content-id="2"]')?.closest('tr');
        return {
            tabelas: n('table'),
            linhasBody: n('table tbody tr'),
            tdsId: n('td[data-searchopt-content-id="2"]'),
            tdsTecnico: n('td[data-searchopt-content-id="5"]'),
            tdsGrupo: n('td[data-searchopt-content-id="8"]'),
            tdsStatus: n('td[data-searchopt-content-id="12"]'),
            primeiroTrHtml: tr ? tr.outerHTML.slice(0, 3000) : null
        };
    });

    logger.info(
        `Tabelas: ${info.tabelas} | Linhas tbody: ${info.linhasBody} | ` +
        `ID: ${info.tdsId} | Técnico: ${info.tdsTecnico} | Grupo: ${info.tdsGrupo} | Status: ${info.tdsStatus}`
    );
    if (info.primeiroTrHtml) {
        logger.info(`HTML da primeira linha:\n${info.primeiroTrHtml}`);
    } else {
        logger.warn('Nenhuma linha de chamado encontrada.');
    }

    await launcher.fechar();
    logger.info('Diagnóstico finalizado.');
}

main().catch(async e => {
    logger.error(`Erro no diagnóstico: ${e.message}`);
    logger.error(e.stack);
    await launcher.fechar();
    process.exit(1);
});

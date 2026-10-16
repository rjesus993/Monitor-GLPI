import { config, validarConfig, avisosConfig } from './core/config.js';
import { logger } from './core/logger.js';
import { comRetry, escaparHtml, sleep } from './core/helpers.js';
import { launcher } from './browser/launcher.js';
import { monitor } from './monitor/monitor.js';
import { observer } from './monitor/observer.js';
import { login } from './browser/login.js';
import { telegram } from './notify/telegram.js';

let encerrando = false;

async function encerrar(motivo, codigo = 0) {
    if (encerrando) return;
    encerrando = true;
    logger.info(`Encerrando (${motivo})...`);
    observer.parar();
    // Deixa uma verificação em curso terminar (no máximo 15s).
    await Promise.race([monitor.aguardarOcioso(), sleep(15000)]);
    await launcher.fechar();
    process.exit(codigo);
}

async function main() {
    logger.info('='.repeat(50));
    logger.info('GLPI Monitor Headless — Iniciando');
    logger.info('='.repeat(50));

    avisosConfig.forEach(a => logger.warn(`[config] ${a}`));

    const erros = validarConfig();
    if (erros.length > 0) {
        logger.error('Erros de configuração:');
        erros.forEach(e => logger.error(`  • ${e}`));
        process.exit(1);
    }

    try {
        // Browser + login, com 3 tentativas (GLPI pode estar subindo / rede instável).
        await comRetry(async () => {
            const context = await launcher.iniciar();
            await login.autenticar(context);
        }, {
            tentativas: 3,
            baseMs: 5000,
            aoFalhar: (e, i) => logger.warn(`Inicialização, tentativa ${i}/3 falhou: ${e.message}`)
        });

        monitor.inicializar();
        await monitor.verificar();
        observer.iniciar();

        if (config.monitor.notificarInicio) {
            await telegram.enviarMensagem('🟢 <b>GLPI Monitor iniciado</b> e monitorando a fila.');
        }
        logger.info('✅ Monitor rodando. Pressione Ctrl+C para encerrar.');

    } catch (e) {
        logger.error(`Falha na inicialização: ${e.message}`);
        logger.error(e.stack);
        await telegram.enviarMensagem(
            `🛑 <b>GLPI Monitor não conseguiu iniciar</b>\n<code>${escaparHtml(e.message).slice(0, 300)}</code>`
        );
        await launcher.fechar();
        process.exit(1);
    }
}

process.on('SIGINT', () => encerrar('SIGINT'));
process.on('SIGTERM', () => encerrar('SIGTERM'));

process.on('unhandledRejection', reason => {
    logger.error(`Unhandled Rejection: ${reason instanceof Error ? reason.stack : reason}`);
});

// Estado indefinido: registra, avisa e sai para o gerenciador de processos (PM2/NSSM) reiniciar.
process.on('uncaughtException', async err => {
    logger.error(`Uncaught Exception: ${err.stack || err.message}`);
    await Promise.race([
        telegram.enviarMensagem(`🛑 <b>GLPI Monitor caiu</b>\n<code>${escaparHtml(err.message).slice(0, 300)}</code>`),
        sleep(8000)
    ]);
    process.exit(1);
});

main();

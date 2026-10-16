import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { logger } from '../core/logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---- AJUSTE AQUI -----------------------------------------------------------
const CONFIG = {
    // URL do seu GLPI, sem barra no final (usada no botão "Abrir chamado")
    glpiUrl: process.env.GLPI_URL || 'https://glpi.hu-ufpi.ebserh',

    // Nome de origem do toast
    appID: 'GLPI.Monitor',

    // Ícone do toast (PNG/JPG). Se o arquivo não existir, é ignorado.
    icone: path.resolve(__dirname, '../assets/glpi.png'),

    // Som personalizado (WAV ou MP3 quando usa NAudio; só WAV sem NAudio)
    som: process.env.SOM_ALERTA || path.resolve(__dirname, '../assets/alerta.wav'),

    // ID do dispositivo de saída de áudio, no formato do Windows:
    //   '{0.0.0.00000000}.{GUID}'
    // Vazio = dispositivo padrão do Windows.
    dispositivoAudio: '{0.0.0.00000000}.{BBD45CEC-955E-4E52-B0DD-2FEBC125558C}',

    // DLL do NAudio (necessária só quando dispositivoAudio está preenchido)
    naudioDll: process.env.NAUDIO_DLL || path.resolve(__dirname, '../assets/naudio/NAudio.dll'),

    // Volume de 0 a 1 (só vale com NAudio)
    volume: 1.0,

    // Botões e clique no toast (true = habilita "Abrir chamado" / "Ignorar")
    interativo: true
};
// ----------------------------------------------------------------------------

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

/** Escapa texto para uso entre aspas simples no PowerShell. */
const ps = texto => String(texto).replace(/'/g, "''");

/** Executa um script PowerShell e registra erros no log (debug). */
function executarPowerShell(script) {
    const codificado = Buffer.from(
        `$ProgressPreference='SilentlyContinue'; ${script}`,
        'utf16le'
    ).toString('base64');

    const proc = spawn(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', codificado],
        { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true }
    );
    proc.stderr.on('data', d => {
        const msg = d.toString().trim();
        if (msg && !msg.startsWith('#< CLIXML')) logger.debug(`[PS erro] ${msg}`);
    });
    proc.on('error', e => logger.debug(`PowerShell falhou: ${e.message}`));
}

/** Toca pelo dispositivo padrão do Windows (SoundPlayer). */
function tocarPadrao() {
    if (existsSync(CONFIG.som)) {
        executarPowerShell(`(New-Object System.Media.SoundPlayer '${ps(CONFIG.som)}').PlaySync()`);
    } else {
        logger.debug(`Som não encontrado (${CONFIG.som}); usando som padrão do Windows`);
        executarPowerShell('[System.Media.SystemSounds]::Exclamation.Play(); Start-Sleep -Milliseconds 1500');
    }
}

/** Toca num dispositivo específico via NAudio. Se falhar, toca no padrão. */
function tocarComNAudio() {
    const fallback = existsSync(CONFIG.som)
        ? `(New-Object System.Media.SoundPlayer '${ps(CONFIG.som)}').PlaySync()`
        : '[System.Media.SystemSounds]::Exclamation.Play(); Start-Sleep -Milliseconds 1500';

    const script = `
try {
    Add-Type -Path '${ps(CONFIG.naudioDll)}'
    $dev = (New-Object NAudio.CoreAudioApi.MMDeviceEnumerator).GetDevice('${ps(CONFIG.dispositivoAudio)}')
    $reader = New-Object NAudio.Wave.AudioFileReader('${ps(CONFIG.som)}')
    $reader.Volume = [single]${Number(CONFIG.volume) || 1}
    $out = New-Object NAudio.Wave.WasapiOut($dev, [NAudio.CoreAudioApi.AudioClientShareMode]::Shared, $false, 200)
    $out.Init($reader)
    $out.Play()
    while ($out.PlaybackState -eq [NAudio.Wave.PlaybackState]::Playing) { Start-Sleep -Milliseconds 100 }
    $out.Dispose()
    $reader.Dispose()
} catch {
    [Console]::Error.WriteLine('NAudio falhou: ' + $_.Exception.Message)
    ${fallback}
}
`;
    executarPowerShell(script);
}

function tocarSom() {
    try {
        if (CONFIG.dispositivoAudio && existsSync(CONFIG.som) && existsSync(CONFIG.naudioDll)) {
            tocarComNAudio();
        } else {
            if (CONFIG.dispositivoAudio) {
                logger.debug('NAudio.dll ou som não encontrado; tocando no dispositivo padrão');
            }
            tocarPadrao();
        }
    } catch (e) {
        logger.debug(`Falha ao tocar som: ${e.message}`);
    }
}

/** Abre o chamado no navegador padrão. */
function abrirChamado(idChamado) {
    const url = `${CONFIG.glpiUrl}/front/ticket.form.php?id=${encodeURIComponent(idChamado)}`;
    try {
        executarPowerShell(`Start-Process '${ps(url)}'`);
    } catch (e) {
        logger.debug(`Falha ao abrir chamado #${idChamado}: ${e.message}`);
    }
}

export const notificacao = {
    /**
     * Notificação desktop + som personalizado.
     * Retorna true/false (nunca lança).
     *
     * @param {number|string} idChamado
     * @param {{titulo?: string, requerente?: string, prioridade?: string, categoria?: string}} [detalhes]
     */
    async alertar(idChamado, detalhes = {}) {
        const n = await carregar();
        if (!n) return false;

        const linhas = [`Novo chamado #${idChamado}`];
        if (detalhes.titulo)     linhas.push(detalhes.titulo);
        if (detalhes.requerente) linhas.push(`👤 ${detalhes.requerente}`);
        if (detalhes.prioridade) linhas.push(`⚡ Prioridade: ${detalhes.prioridade}`);
        if (detalhes.categoria)  linhas.push(`📂 ${detalhes.categoria}`);

        tocarSom();

        return new Promise(resolve => {
            let resolvido = false;
            const finalizar = ok => {
                if (!resolvido) {
                    resolvido = true;
                    resolve(ok);
                }
            };

            const limite = setTimeout(() => finalizar(true), 5000);

            const opcoes = {
                title: '🚨 GLPI: Novo Chamado na Fila!',
                message: linhas.join('\n'),
                sound: false, // toast mudo: o som é tocado por tocarSom()
                appID: CONFIG.appID,
                wait: CONFIG.interativo
            };

            if (existsSync(CONFIG.icone)) opcoes.icon = CONFIG.icone;

            const idNumerico = Number(idChamado);
            if (Number.isFinite(idNumerico)) opcoes.id = idNumerico;

            if (CONFIG.interativo) opcoes.actions = ['Abrir chamado', 'Ignorar'];

            try {
                n.notify(opcoes, (err, resposta, metadata) => {
                    clearTimeout(limite);
                    if (err) {
                        logger.debug(`Notificação desktop falhou: ${err.message}`);
                        return finalizar(false);
                    }
                    const botao = metadata?.action || '';
                    if (resposta === 'activate' || /abrir/i.test(botao)) {
                        abrirChamado(idChamado);
                    }
                    finalizar(true);
                });
            } catch (e) {
                clearTimeout(limite);
                logger.debug(`Notificação desktop falhou: ${e.message}`);
                finalizar(false);
            }
        });
    }
};

import dotenv from 'dotenv';
import fs from 'fs';

dotenv.config();

const CREDENTIALS_PATH = './data/credentials.json';
const TECNICOS_PATH = './data/tecnicos.txt';

/** Avisos coletados durante o carregamento (o logger ainda não existe aqui). */
export const avisosConfig = [];

function inteiro(valor, padrao, minimo = 0) {
    const n = parseInt(valor ?? '', 10);
    return Number.isFinite(n) && n >= minimo ? n : padrao;
}

function booleano(valor, padrao) {
    if (valor === undefined || valor === '') return padrao;
    return ['true', '1', 'sim', 'yes'].includes(String(valor).trim().toLowerCase());
}

function carregarCredenciais() {
    try {
        if (!fs.existsSync(CREDENTIALS_PATH)) return {};
        const raw = fs.readFileSync(CREDENTIALS_PATH, 'utf-8').trim();
        return raw === '' ? {} : JSON.parse(raw);
    } catch (e) {
        avisosConfig.push(`Falha ao ler ${CREDENTIALS_PATH} (${e.message}). Usando variáveis do .env.`);
        return {};
    }
}

/**
 * Técnicos vêm de duas fontes (somadas, sem duplicar):
 *  1. variável TECNICOS no .env (separada por vírgula, em UMA linha só)
 *  2. arquivo data/tecnicos.txt (um nome por linha; # para comentários)
 */
function carregarTecnicos() {
    const brutos = (process.env.TECNICOS || '').split(',');

    if (fs.existsSync(TECNICOS_PATH)) {
        const linhas = fs.readFileSync(TECNICOS_PATH, 'utf-8').split(/\r?\n/);
        for (const linha of linhas) {
            const t = linha.trim();
            if (!t || t.startsWith('#')) continue;
            brutos.push(...t.split(','));
        }
    }

    const vistos = new Set();
    const lista = [];
    for (const nome of brutos.map(n => n.trim()).filter(Boolean)) {
        const chave = nome.toLowerCase();
        if (!vistos.has(chave)) {
            vistos.add(chave);
            lista.push(nome);
        }
    }
    return lista;
}

/**
 * O dotenv lê uma variável por linha. Se TECNICOS (ou outra) quebrar de linha
 * no meio, o resto da lista é descartado em silêncio. Aqui detectamos isso.
 */
function detectarLinhasOrfas() {
    if (!fs.existsSync('.env')) return;
    const linhas = fs.readFileSync('.env', 'utf-8').split(/\r?\n/);
    let aspasAbertas = null;

    linhas.forEach((linha, i) => {
        const t = linha.trim();

        if (aspasAbertas) {
            if (t.endsWith(aspasAbertas)) aspasAbertas = null;
            return;
        }
        if (!t || t.startsWith('#')) return;

        const igual = t.indexOf('=');
        if (igual === -1) {
            avisosConfig.push(
                `.env linha ${i + 1}: linha sem "=" será IGNORADA pelo dotenv. ` +
                'Se for continuação de TECNICOS, junte tudo em uma linha ou use data/tecnicos.txt.'
            );
            return;
        }

        const valor = t.slice(igual + 1).trim();
        const aspas = valor[0];
        if ((aspas === '"' || aspas === "'") && !(valor.length > 1 && valor.endsWith(aspas))) {
            aspasAbertas = aspas;
        }
    });
}

detectarLinhasOrfas();
const cred = carregarCredenciais();

export const config = {
    glpi: {
        url: process.env.GLPI_URL || '',
        user: cred.glpiUser || process.env.GLPI_USER || '',
        pass: cred.glpiPass || process.env.GLPI_PASS || ''
    },
    monitor: {
        tempoAtualizacaoMs: inteiro(process.env.TEMPO_ATUALIZACAO_MS, 45000, 5000),
        intervaloRecargaBrowserMs: inteiro(process.env.INTERVALO_RECARGA_BROWSER_MS, 1800000, 60000),
        falhasParaAlerta: inteiro(process.env.FALHAS_PARA_ALERTA, 5, 1),
        debug: booleano(process.env.DEBUG, false),
        notificacaoDesktop: booleano(process.env.NOTIFICACAO_DESKTOP, true),
        notificarInicio: booleano(process.env.NOTIFICAR_INICIO, true),
        bloquearRecursos: booleano(process.env.BLOQUEAR_RECURSOS, false)
    },
    telegram: {
        token: process.env.TELEGRAM_TOKEN || '',
        chatId: process.env.TELEGRAM_CHAT_ID || ''
    },
    tecnicos: carregarTecnicos(),
    paths: {
        data: './data',
        historico: './data/historico.json',
        logs: './logs'
    }
};

export function validarConfig() {
    const erros = [];
    if (!config.glpi.url) erros.push('GLPI_URL não definida');
    if (!config.glpi.user) erros.push('GLPI_USER não definido');
    if (!config.glpi.pass) erros.push('GLPI_PASS não definido');
    if (config.telegram.token && !config.telegram.chatId) {
        erros.push('TELEGRAM_CHAT_ID obrigatório quando TELEGRAM_TOKEN está definido');
    }
    if (config.tecnicos.length === 0) {
        erros.push('Nenhum técnico configurado (TECNICOS ou data/tecnicos.txt) — todo chamado seria tratado como "sem técnico"');
    }
    return erros;
}

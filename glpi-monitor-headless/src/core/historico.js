import { storage as storagePadrao } from './storage.js';
import { logger } from './logger.js';

const TRINTA_DIAS_MS = 30 * 24 * 60 * 60 * 1000;
const SCHEMA = 2;

/**
 * Registro: { status: 'na_fila' | 'com_tecnico', ultimaVezVisto, notificado, tentativas?, schema }
 * `criarHistorico` é uma fábrica para permitir testes isolados; o app usa o singleton exportado.
 */
export function criarHistorico({ storage = storagePadrao } = {}) {
    let dados = {};
    let sujo = false;

    return {
        carregar() {
            dados = storage.lerHistorico();
            sujo = false;
            this.migrar();
            this.limparAntigos();
            logger.debug(`Histórico carregado: ${Object.keys(dados).length} registros`);
        },

        /**
         * Versões antigas gravavam notificado=false em chamados N2 que voltaram à fila
         * (supressão intencional). Como agora notificado=false significa "alerta pendente",
         * esses registros legados são normalizados para não gerar alertas falsos.
         */
        migrar() {
            let n = 0;
            for (const id in dados) {
                const r = dados[id];
                if (r.schema === SCHEMA) continue;
                if (r.status === 'na_fila' && r.notificado === false) {
                    r.notificado = true;
                    n++;
                }
                r.schema = SCHEMA;
                sujo = true;
            }
            if (n > 0) logger.info(`Migração do histórico: ${n} registro(s) legado(s) normalizado(s).`);
        },

        /** Grava só se algo mudou. Retorna true se gravou (ou se não havia o que gravar). */
        salvar() {
            this.limparAntigos();
            if (!sujo) return true;
            const ok = storage.salvarHistorico(dados);
            if (ok) sujo = false;
            return ok;
        },

        limparAntigos() {
            const agora = Date.now();
            let removidos = 0;
            for (const id in dados) {
                const visto = dados[id].ultimaVezVisto;
                if (visto && agora - new Date(visto).getTime() > TRINTA_DIAS_MS) {
                    delete dados[id];
                    removidos++;
                }
            }
            if (removidos > 0) {
                sujo = true;
                logger.info(`${removidos} registro(s) com mais de 30 dias removido(s) do histórico.`);
            }
        },

        existe(id) {
            return Object.prototype.hasOwnProperty.call(dados, id);
        },

        obter(id) {
            return dados[id];
        },

        adicionar(id, status, ultimaVezVisto, notificado) {
            dados[id] = { status, ultimaVezVisto, notificado, schema: SCHEMA };
            sujo = true;
        },

        alterarStatus(id, status) {
            const r = dados[id];
            if (r && r.status !== status) {
                r.status = status;
                r.schema = SCHEMA;
                sujo = true;
            }
        },

        atualizarDataVisto(id, iso) {
            const r = dados[id];
            if (r) {
                r.ultimaVezVisto = iso;
                sujo = true;
            }
        },

        alterarNotificado(id, notificado) {
            const r = dados[id];
            if (r) {
                r.notificado = notificado;
                r.schema = SCHEMA;
                if (notificado) delete r.tentativas;
                sujo = true;
            }
        },

        /** Registra falha de envio e devolve o total de tentativas. */
        registrarFalha(id) {
            const r = dados[id];
            if (!r) return 0;
            r.tentativas = (r.tentativas || 0) + 1;
            r.schema = SCHEMA;
            sujo = true;
            return r.tentativas;
        },

        obterTodos() {
            return dados;
        }
    };
}

export const historico = criarHistorico();

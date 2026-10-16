import { test } from 'node:test';
import assert from 'node:assert/strict';
import { criarHistorico } from '../src/core/historico.js';
import { tecnicos } from '../src/core/tecnicos.js';
import { analisarChamados } from '../src/monitor/analisador.js';

tecnicos.inicializar(['Ana Souza', 'João Pereira']);

const storageFalso = { lerHistorico: () => ({}), salvarHistorico: () => true };
const novoHistorico = () => criarHistorico({ storage: storageFalso });
const ch = (id, extra = {}) => ({ id: String(id), tecnico: '', grupo: '', status: 'Novo', ...extra });
const rodar = (h, chamados, primeiraLeitura = false) =>
    analisarChamados(chamados, { historico: h, tecnicos, primeiraLeitura, agoraISO: new Date().toISOString() });

test('primeira leitura popula o histórico sem alertar', () => {
    const h = novoHistorico();
    const r = rodar(h, [ch(1), ch(2, { tecnico: 'Ana Souza' })], true);
    assert.deepEqual(r.novos, []);
    assert.equal(h.obter('1').notificado, true);
    assert.equal(h.obter('2').status, 'com_tecnico');
});

test('chamado novo sem técnico é alertado', () => {
    const h = novoHistorico();
    assert.deepEqual(rodar(h, [ch(10)]).novos, ['10']);
});

test('chamado com técnico válido (ignora acento/caixa) não alerta', () => {
    const h = novoHistorico();
    assert.deepEqual(rodar(h, [ch(11, { tecnico: 'JOAO pereira' })]).novos, []);
});

test('grupo fora de N1/N2 não alerta', () => {
    const h = novoHistorico();
    assert.deepEqual(rodar(h, [ch(12, { grupo: 'N3 - Infra' })]).novos, []);
});

test('solucionado/fechado nunca alerta', () => {
    const h = novoHistorico();
    assert.deepEqual(rodar(h, [ch(13, { status: 'Solucionado' }), ch(14, { status: 'Fechado' })]).novos, []);
});

test('alerta pendente (envio falhou) é retentado no ciclo seguinte', () => {
    const h = novoHistorico();
    assert.deepEqual(rodar(h, [ch(20)]).novos, ['20']);
    // não marcou como notificado => continua pendente
    assert.deepEqual(rodar(h, [ch(20)]).novos, ['20']);
    h.alterarNotificado('20', true);
    assert.deepEqual(rodar(h, [ch(20)]).novos, []);
});

test('chamado que voltou à fila realerta; N2 já conhecido não', () => {
    const h = novoHistorico();
    rodar(h, [ch(30), ch(31, { grupo: 'Suporte N2' })]);
    h.alterarNotificado('30', true); h.alterarNotificado('31', true);

    rodar(h, [ch(30, { tecnico: 'Ana Souza' }), ch(31, { tecnico: 'Ana Souza', grupo: 'Suporte N2' })]);
    assert.equal(h.obter('30').status, 'com_tecnico');

    const r = rodar(h, [ch(30), ch(31, { grupo: 'Suporte N2' })]);
    assert.deepEqual(r.novos, ['30']);
});

test('chamado N2 novo é alertado', () => {
    const h = novoHistorico();
    assert.deepEqual(rodar(h, [ch(40, { grupo: 'Suporte N2' })]).novos, ['40']);
});

test('chamado que some da tabela vira com_tecnico', () => {
    const h = novoHistorico();
    rodar(h, [ch(50)]);
    h.alterarNotificado('50', true);
    rodar(h, [ch(51, { tecnico: 'Ana Souza' })]);
    assert.equal(h.obter('50').status, 'com_tecnico');
});

test('migração normaliza registros legados na_fila/notificado=false', () => {
    const legado = { 99: { status: 'na_fila', ultimaVezVisto: new Date().toISOString(), notificado: false } };
    const h = criarHistorico({ storage: { lerHistorico: () => legado, salvarHistorico: () => true } });
    h.carregar();
    assert.equal(h.obter('99').notificado, true);
});

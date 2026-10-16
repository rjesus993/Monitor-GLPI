/**
 * Lógica de decisão pura: recebe os chamados lidos e atualiza o histórico.
 * Não faz I/O de rede nem de browser, então é totalmente testável.
 *
 * Regras (mantidas do monitor original):
 *  - SOLUCIONADO/FECHADO nunca alertam.
 *  - Só entram na fila chamados SEM técnico válido E com grupo vazio, N1 ou N2.
 *  - Chamado N2 (sem N1) que já existia no histórico e volta à fila NÃO realerta.
 *  - Na primeira leitura nada é alertado (só popula o histórico).
 *
 * Novidade: `notificado === false` significa "alerta pendente". O monitor só
 * marca como notificado depois que o envio dá certo, então falhas de rede
 * são retentadas no ciclo seguinte em vez de perdidas.
 */
export function classificarGrupo(grupoBruto) {
    const grupo = (grupoBruto || '').trim();
    const maiusculo = grupo.toUpperCase();
    const n1 = maiusculo.includes('N1');
    const n2 = maiusculo.includes('N2');
    return {
        elegivel: grupo === '' || n1 || n2,
        apenasN2: grupo !== '' && n2 && !n1
    };
}

export function analisarChamados(chamados, { historico, tecnicos, primeiraLeitura, agoraISO }) {
    const semTecnico = new Set();
    const comTecnico = new Set();

    for (const ch of chamados) {
        const { id } = ch;
        if (!id) continue;

        const status = (ch.status || '').toUpperCase();
        if (status.includes('SOLUCIONADO') || status.includes('FECHADO')) {
            comTecnico.add(id);
            continue;
        }

        const grupo = classificarGrupo(ch.grupo);
        const temTecnico = tecnicos.celulaContemTecnicoValido(ch.tecnico);

        if (temTecnico || !grupo.elegivel) {
            comTecnico.add(id);
            continue;
        }

        semTecnico.add(id);

        if (!historico.existe(id)) {
            historico.adicionar(id, 'na_fila', agoraISO, primeiraLeitura);
            continue;
        }

        const registro = historico.obter(id);
        if (registro.status === 'com_tecnico') {
            // Voltou para a fila (técnico removido). N2 já conhecido não realerta.
            historico.alterarStatus(id, 'na_fila');
            historico.alterarNotificado(id, primeiraLeitura || grupo.apenasN2);
        }
        historico.atualizarDataVisto(id, agoraISO);
    }

    for (const id of comTecnico) {
        if (historico.existe(id)) {
            historico.alterarStatus(id, 'com_tecnico');
            historico.atualizarDataVisto(id, agoraISO);
        } else {
            historico.adicionar(id, 'com_tecnico', agoraISO, true);
        }
    }

    // Estava na fila e sumiu da página: assumido/resolvido.
    const todos = historico.obterTodos();
    for (const id in todos) {
        if (todos[id].status === 'na_fila' && !semTecnico.has(id) && !comTecnico.has(id)) {
            historico.alterarStatus(id, 'com_tecnico');
            historico.atualizarDataVisto(id, agoraISO);
        }
    }

    const novos = primeiraLeitura
        ? []
        : [...semTecnico].filter(id => historico.obter(id).notificado === false);

    return { novos, semTecnico: semTecnico.size, comTecnico: comTecnico.size };
}

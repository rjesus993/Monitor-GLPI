import { logger } from '../core/logger.js';

// Lista de chamados: todos os status, ordenada por ID decrescente.
// A ordem das chaves é a mesma usada historicamente pelo monitor.
const FILTRO_ESPERADO = {
    'criteria[0][link]': 'AND',
    'criteria[0][field]': '12',
    'criteria[0][searchtype]': 'equals',
    'criteria[0][value]': 'all',
    'params[hide_criteria]': '0',
    'params[hide_controls]': '0',
    'params[showmassiveactions]': '1',
    'itemtype': 'Ticket',
    'start': '0',
    'is_deleted': '0',
    'as_map': '0',
    'browse': '0',
    'unpublished': '1',
    'sort[]': '2',
    'order[]': 'DESC'
};

/** Fonte única da URL de listagem (monitor e diagnóstico usam a mesma). */
export function montarUrlTickets(glpiUrl) {
    const base = glpiUrl.replace(/\/+$/, '');
    const url = new URL(`${base}/front/ticket.php`);
    for (const [chave, valor] of Object.entries(FILTRO_ESPERADO)) {
        url.searchParams.set(chave, valor);
    }
    return url.toString();
}

export function validarFiltro(urlAtual) {
    const params = new URL(urlAtual).searchParams;
    return Object.entries(FILTRO_ESPERADO).every(([chave, valor]) => params.get(chave) === valor);
}

export function avisarSeFiltroPerdido(urlAtual) {
    try {
        if (!validarFiltro(urlAtual)) {
            logger.debug(`A URL final difere do filtro esperado (GLPI pode ter reescrito): ${urlAtual}`);
        }
    } catch { /* URL inválida: ignora */ }
}

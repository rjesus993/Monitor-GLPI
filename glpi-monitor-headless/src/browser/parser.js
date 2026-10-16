export const SELETOR_CELULA_ID = 'td[data-searchopt-content-id="2"]';

export const parser = {
    /**
     * Extrai todos os chamados em UMA ida ao browser (antes eram ~4 chamadas por linha,
     * cada uma com timeout de 2s — lento e sujeito a leituras parciais).
     *
     * Se há linhas mas falta uma coluna essencial (Técnico/Grupo/Status), lança erro:
     * ler "vazio" ali faria todo chamado parecer "sem técnico" e geraria alertas falsos.
     */
    async extrairChamados(page) {
        const { linhas, colunas } = await page.evaluate(() => {
            const limpar = el => (el ? (el.textContent || '').trim() : '');
            const celulas = Array.from(document.querySelectorAll('td[data-searchopt-content-id="2"]'));
            const vistos = new Set();
            const linhas = [];
            const colunas = { tecnico: false, grupo: false, status: false };

            for (const tdId of celulas) {
                const tr = tdId.closest('tr');
                if (!tr) continue;

                const id = limpar(tdId.querySelector('span, a') || tdId);
                if (!id || vistos.has(id)) continue;
                vistos.add(id);

                const tdTecnico = tr.querySelector('td[data-searchopt-content-id="5"]');
                const tdGrupo = tr.querySelector('td[data-searchopt-content-id="8"]');
                const tdStatus = tr.querySelector('td[data-searchopt-content-id="12"]');
                if (tdTecnico) colunas.tecnico = true;
                if (tdGrupo) colunas.grupo = true;
                if (tdStatus) colunas.status = true;

                linhas.push({
                    id,
                    tecnico: limpar(tdTecnico),
                    grupo: limpar(tdGrupo),
                    status: limpar(tdStatus)
                });
            }
            return { linhas, colunas };
        });

        if (linhas.length > 0) {
            const faltando = Object.entries(colunas).filter(([, ok]) => !ok).map(([nome]) => nome);
            if (faltando.length > 0) {
                throw new Error(
                    `Coluna(s) ausente(s) na lista de chamados: ${faltando.join(', ')}. ` +
                    'O layout/visão do GLPI mudou? Rode "npm run diagnostico".'
                );
            }
        }

        return linhas;
    }
};

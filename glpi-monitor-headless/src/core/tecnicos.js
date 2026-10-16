let listaNorm = [];

export function normalizarTexto(texto) {
    if (!texto) return '';
    return texto
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')          // remove acentos: "João" == "Joao"
        .replace(/[\u200B-\u200D\uFEFF]/g, '')
        .replace(/[\n\r\t\u00A0]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
}

export const tecnicos = {
    inicializar(nomes = []) {
        listaNorm = nomes.map(normalizarTexto).filter(Boolean);
    },

    obterLista() {
        return listaNorm;
    },

    normalizarTexto,

    celulaContemTecnicoValido(textoBruto) {
        const textoNorm = normalizarTexto(textoBruto);
        if (!textoNorm) return false;
        return listaNorm.some(t => textoNorm.includes(t));
    }
};

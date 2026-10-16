import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tecnicos, normalizarTexto } from '../src/core/tecnicos.js';

test('normalização remove acentos, espaços invisíveis e caixa', () => {
    assert.equal(normalizarTexto('  João\u00A0 Pereira\u200B '), 'joao pereira');
});

test('célula com vários técnicos reconhece qualquer um da lista', () => {
    tecnicos.inicializar(['Ana Souza']);
    assert.equal(tecnicos.celulaContemTecnicoValido('Carlos LimaAna Souza'), true);
    assert.equal(tecnicos.celulaContemTecnicoValido('Carlos Lima'), false);
    assert.equal(tecnicos.celulaContemTecnicoValido(''), false);
});

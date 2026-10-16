import { notificacao } from './src/notify/notificacao.js';

const ok = await notificacao.alertar(1234, {
    titulo: 'Impressora parada',
    requerente: 'Maria Silva',
    prioridade: 'Alta',
    categoria: 'Hardware > Impressora'
});

console.log('Resultado:', ok);
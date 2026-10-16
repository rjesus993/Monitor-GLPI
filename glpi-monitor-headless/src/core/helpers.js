export function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export function escaparHtml(texto) {
    return String(texto ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

/**
 * Executa fn com retry e backoff exponencial.
 * - fn recebe o número da tentativa (1, 2, ...)
 * - se o erro tiver `definitivo = true`, não tenta de novo
 * - se o erro tiver `espera` (ms), respeita esse tempo (ex.: retry_after do Telegram)
 */
export async function comRetry(fn, { tentativas = 3, baseMs = 1000, aoFalhar } = {}) {
    let ultimoErro;
    for (let i = 1; i <= tentativas; i++) {
        try {
            return await fn(i);
        } catch (e) {
            ultimoErro = e;
            if (aoFalhar) aoFalhar(e, i);
            if (e.definitivo || i === tentativas) break;
            await sleep(e.espera ?? baseMs * 2 ** (i - 1));
        }
    }
    throw ultimoErro;
}

/**
 * Exclusão mútua simples: garante que verificação, recarga do browser e
 * relogin nunca rodem ao mesmo tempo.
 */
export class Mutex {
    #fila = Promise.resolve();
    #pendentes = 0;

    get ocupado() {
        return this.#pendentes > 0;
    }

    run(fn) {
        this.#pendentes++;
        const exec = this.#fila.then(() => fn());
        this.#fila = exec.then(() => {}, () => {}).then(() => { this.#pendentes--; });
        return exec;
    }

    aguardarOcioso() {
        return this.#fila;
    }
}

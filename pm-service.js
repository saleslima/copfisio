// Serviço de consulta da base de Policiais Militares no Cloud Firestore.
// A coleção esperada é: policiais_militares
// Cada documento usa o RE como ID, igual ao Python sales_firebase.py salvou.

import { waitForFirebase, getPMFirestoreDB, isPMFirestoreAvailable } from './firebase.js';

const PM_COLLECTION = 'policiais_militares';

function onlyDigits(value) {
    return String(value || '').replace(/\D/g, '');
}

function cleanText(value) {
    if (value === null || value === undefined) return '';
    const text = String(value).trim().replace(/\s+/g, ' ');
    if (!text || text === '-1') return '';
    return text;
}

function normalizeReSearchInput(value) {
    const raw = String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    const digits = onlyDigits(raw);
    return { raw, digits };
}

function unique(values) {
    return [...new Set(values.filter(Boolean))];
}

function buildReCandidates(value) {
    const { raw, digits } = normalizeReSearchInput(value);
    const candidates = [];

    if (digits) candidates.push(digits);

    // Caso o usuário digite RE + dígito. Ex.: 930417-7 -> documento 930417.
    if (digits.length >= 2) candidates.push(digits.slice(0, -1));

    // Caso o 7º caractere seja letra. Ex.: 123456X -> documento 123456.
    if (/^\d{6}[A-Z0-9]$/.test(raw)) candidates.push(raw.slice(0, 6));

    // Remove zeros à esquerda, se houver.
    for (const c of [...candidates]) {
        const parsed = String(Number(c));
        if (parsed !== 'NaN' && parsed !== '0') candidates.push(parsed);
    }

    return unique(candidates);
}

function normalizePhoneList(telefones) {
    if (!Array.isArray(telefones)) return [];

    const seen = new Set();
    const result = [];

    telefones.forEach((phone) => {
        if (!phone || typeof phone !== 'object') return;

        const ddd = onlyDigits(phone.ddd);
        const numero = onlyDigits(phone.numero);
        const digits = ddd && numero ? `${ddd}${numero}` : onlyDigits(phone.e164 || phone.formatado || '');
        const clean = digits.startsWith('55') && digits.length === 13 ? digits.slice(2) : digits;

        if (!/^\d{2}9\d{8}$/.test(clean)) return;
        if (seen.has(clean)) return;

        seen.add(clean);
        result.push({
            ddd: clean.slice(0, 2),
            numero: clean.slice(2),
            digits: clean,
            e164: `+55${clean}`,
            formatado: phone.formatado || `(${clean.slice(0, 2)}) ${clean.slice(2, 7)}-${clean.slice(7)}`
        });
    });

    return result;
}

function normalizePmDocument(docSnap) {
    if (!docSnap || !docSnap.exists) return null;

    const data = docSnap.data() || {};
    const telefones = normalizePhoneList(data.telefones || data.telefones_json || []);

    return {
        id: docSnap.id,
        re: cleanText(data.re || docSnap.id),
        cpf: onlyDigits(data.cpf),
        nomeCompleto: cleanText(data.nome_completo || data.nomePM || data.nome),
        emailFuncional: cleanText(data.email_funcional || data.emailContato || data.email).toLowerCase(),
        graduacao: cleanText(data.graduacao || data.descricaoPostoGraduacaoPM),
        graduacaoSigla: cleanText(data.graduacao_sigla || data.siglaPostoGraduacaoPM),
        telefones,
        bruto: data
    };
}

export async function buscarPolicialMilitarPorRe(reValue) {
    const ready = await waitForFirebase();
    if (!ready || !isPMFirestoreAvailable()) {
        throw new Error('Cloud Firestore não está disponível. Verifique firebase.js e se o firebase-firestore-compat.js foi incluído no index.html.');
    }

    const db = getPMFirestoreDB();
    const candidates = buildReCandidates(reValue);

    if (!candidates.length) return null;

    for (const candidate of candidates) {
        const snap = await db.collection(PM_COLLECTION).doc(candidate).get();
        if (snap.exists) {
            return normalizePmDocument(snap);
        }
    }

    return null;
}

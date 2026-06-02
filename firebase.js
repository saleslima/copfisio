// Firebase configuration and initialization module
//
// IMPORTANTE:
// - O sistema atual usa Realtime Database para agenda/cadastros do app.
// - A base importada pelo Python fica no Cloud Firestore, coleção policiais_militares.
// - Para usar outro projeto Firebase para a base de PMs, preencha pmFirebaseConfig abaixo
//   com a configuração Web do projeto onde você rodou o sales_firebase.py.

const firebaseConfig = {
    apiKey: "AIzaSyA_ibCSwyOXETOpYEiZrLee2WuyuuZ-yDE",
    authDomain: "agenda-auditorio-3a0bf.firebaseapp.com",
    databaseURL: "https://agenda-auditorio-3a0bf-default-rtdb.firebaseio.com",
    projectId: "agenda-auditorio-3a0bf",
    storageBucket: "agenda-auditorio-3a0bf.firebasestorage.app",
    messagingSenderId: "77064715447",
    appId: "1:77064715447:web:1e065dc64b26e95a372132"
};

// Configuração do projeto secundário para a base de PMs (posto-67bc8)
const pmFirebaseConfig = {
    apiKey: "AIzaSyDt_7Xu6wkACn0HOHsyUYgDi7_2xnd9LJ0",
    authDomain: "posto-67bc8.firebaseapp.com",
    databaseURL: "https://posto-67bc8-default-rtdb.firebaseio.com",
    projectId: "posto-67bc8",
    storageBucket: "posto-67bc8.firebasestorage.app",
    messagingSenderId: "417123564431",
    appId: "1:417123564431:web:a73937c740c70446aea9fa",
    measurementId: "G-MCZGJ0T0D8"
};

let firebaseApp = null;
let firebaseDB = null;
let pmFirebaseApp = null;
let pmFirestoreDB = null;
let firebaseInitPromise = null;

function hasFirebaseCompat() {
    return typeof firebase !== 'undefined';
}

function hasRealtimeDatabaseCompat() {
    return hasFirebaseCompat() && typeof firebase.database === 'function';
}

function hasFirestoreCompat() {
    return hasFirebaseCompat() && typeof firebase.firestore === 'function';
}

function sameFirebaseProject(a, b) {
    if (!a || !b) return false;
    return String(a.projectId || '') === String(b.projectId || '') &&
        String(a.appId || '') === String(b.appId || '');
}

function getOrCreateDefaultApp() {
    if (!firebase.apps.length) {
        return firebase.initializeApp(firebaseConfig);
    }
    return firebase.app();
}

function getOrCreatePmApp() {
    const config = pmFirebaseConfig || firebaseConfig;

    if (sameFirebaseProject(config, firebaseConfig)) {
        return firebaseApp || getOrCreateDefaultApp();
    }

    try {
        return firebase.app('pmDataApp');
    } catch (error) {
        return firebase.initializeApp(config, 'pmDataApp');
    }
}

firebaseInitPromise = new Promise((resolve, reject) => {
    try {
        const checkFirebase = setInterval(() => {
            if (!hasFirebaseCompat()) return;

            clearInterval(checkFirebase);

            try {
                console.log('🔥 Inicializando Firebase...');

                firebaseApp = getOrCreateDefaultApp();

                if (hasRealtimeDatabaseCompat()) {
                    firebaseDB = firebase.database(firebaseApp);
                    console.log('✓ Realtime Database inicializado');
                    console.log('📊 Database URL:', firebaseConfig.databaseURL || '(sem databaseURL)');
                } else {
                    console.warn('⚠️ SDK do Realtime Database não foi carregado. Agenda/cadastros do app podem não sincronizar.');
                }

                if (hasFirestoreCompat()) {
                    pmFirebaseApp = getOrCreatePmApp();
                    pmFirestoreDB = firebase.firestore(pmFirebaseApp);
                    console.log('✓ Cloud Firestore inicializado para consulta de PMs');
                    console.log('📁 Projeto Firestore PM:', (pmFirebaseConfig || firebaseConfig).projectId);
                } else {
                    console.warn('⚠️ SDK do Cloud Firestore não foi carregado. A busca automática por RE não funcionará.');
                }

                resolve({ firebaseDB, pmFirestoreDB });
            } catch (error) {
                console.error('❌ Falha na inicialização do Firebase:', error);
                reject(error);
            }
        }, 100);

        setTimeout(() => {
            clearInterval(checkFirebase);
            if (!firebaseDB && !pmFirestoreDB) {
                reject(new Error('Firebase initialization timeout'));
            }
        }, 10000);
    } catch (error) {
        console.error('❌ Erro crítico na inicialização:', error);
        reject(error);
    }
});

export async function waitForFirebase() {
    try {
        await firebaseInitPromise;
        return true;
    } catch (error) {
        console.error('❌ Firebase não disponível:', error);
        return false;
    }
}

export function isFirebaseAvailable() {
    return firebaseDB !== null && firebaseDB !== undefined;
}

export function isPMFirestoreAvailable() {
    return pmFirestoreDB !== null && pmFirestoreDB !== undefined;
}

export function getFirebaseDB() {
    return firebaseDB;
}

export function getPMFirestoreDB() {
    return pmFirestoreDB;
}

export { firebaseDB, pmFirestoreDB, firebaseInitPromise };
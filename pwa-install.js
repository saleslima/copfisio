(() => {
    const PROMPT_DURATION_MS = 5000;
    const INSTALL_NOTICE_KEY = 'fmuPwaInstallNoticeShown';
    const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
    let deferredPrompt = null;
    let hideTimer = null;
    let installNoticeShownInPage = false;

    function getElements() {
        return {
            prompt: document.getElementById('pwaInstallPrompt'),
            installButton: document.getElementById('pwaInstallButton')
        };
    }

    function hideInstallArrow() {
        const { prompt } = getElements();
        if (!prompt) return;
        prompt.classList.remove('is-visible');
        window.setTimeout(() => {
            if (!prompt.classList.contains('is-visible')) prompt.hidden = true;
        }, 250);
    }

    function showInstallArrow() {
        if (isStandalone() || !deferredPrompt) return;
        const { prompt } = getElements();
        if (!prompt) return;

        window.clearTimeout(hideTimer);
        prompt.hidden = false;
        window.requestAnimationFrame(() => prompt.classList.add('is-visible'));
        hideTimer = window.setTimeout(hideInstallArrow, PROMPT_DURATION_MS);
    }

    function showInstallSuccessOnce() {
        if (installNoticeShownInPage) return;
        installNoticeShownInPage = true;

        if (localStorage.getItem(INSTALL_NOTICE_KEY) === 'true') return;
        localStorage.setItem(INSTALL_NOTICE_KEY, 'true');

        if (window.showFmuNotice) {
            window.showFmuNotice('FMU instalado com sucesso. O ícone foi adicionado à tela inicial quando o navegador permitiu a instalação como aplicativo.', 'Instalação concluída');
        }
    }

    async function registerServiceWorker() {
        if (!('serviceWorker' in navigator)) return;
        try {
            await navigator.serviceWorker.register('service-worker.js');
        } catch (error) {
            console.warn('Service worker não registrado:', error);
        }
    }

    window.addEventListener('beforeinstallprompt', (event) => {
        event.preventDefault();
        deferredPrompt = event;
        localStorage.removeItem(INSTALL_NOTICE_KEY);
        installNoticeShownInPage = false;
        showInstallArrow();
    });

    window.addEventListener('appinstalled', () => {
        deferredPrompt = null;
        hideInstallArrow();
        showInstallSuccessOnce();
    });

    document.addEventListener('DOMContentLoaded', () => {
        const { installButton, prompt } = getElements();

        if (prompt) {
            prompt.addEventListener('mouseenter', () => window.clearTimeout(hideTimer));
            prompt.addEventListener('mouseleave', () => {
                if (deferredPrompt) hideTimer = window.setTimeout(hideInstallArrow, 1800);
            });
        }

        if (installButton) {
            installButton.addEventListener('click', async () => {
                window.clearTimeout(hideTimer);

                if (!deferredPrompt) {
                    hideInstallArrow();
                    if (window.showFmuNotice) {
                        window.showFmuNotice('A instalação automática ainda não foi liberada por este navegador. Publique o sistema em HTTPS e abra pelo Chrome ou Edge no Android. No iPhone, a instalação depende do menu Compartilhar do Safari.', 'Instalação indisponível');
                    }
                    return;
                }

                deferredPrompt.prompt();
                const choiceResult = await deferredPrompt.userChoice;
                const accepted = choiceResult && choiceResult.outcome === 'accepted';
                deferredPrompt = null;
                hideInstallArrow();

                if (accepted) {
                    window.setTimeout(() => showInstallSuccessOnce(), 600);
                }
            });
        }

        registerServiceWorker();
    });
})();

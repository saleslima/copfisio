(function () {
    function createDialogModal() {
        let overlay = document.getElementById('fmuNoticeModal');
        if (overlay) return overlay;

        overlay = document.createElement('div');
        overlay.id = 'fmuNoticeModal';
        overlay.className = 'fmu-notice-overlay';
        overlay.setAttribute('aria-hidden', 'true');

        overlay.innerHTML = `
            <div class="fmu-notice-card" role="dialog" aria-modal="true" aria-labelledby="fmuNoticeTitle" aria-describedby="fmuNoticeMessage">
                <button class="fmu-notice-close" type="button" aria-label="Fechar aviso">&times;</button>
                <div class="fmu-notice-icon" aria-hidden="true">!</div>
                <h2 id="fmuNoticeTitle">Aviso</h2>
                <p id="fmuNoticeMessage"></p>
                <div id="fmuNoticeInputWrap" class="fmu-notice-input-wrap" hidden>
                    <input id="fmuNoticeInput" class="fmu-notice-input" type="password" autocomplete="current-password" inputmode="text" />
                </div>
                <div class="fmu-notice-actions">
                    <button id="fmuNoticeCancelBtn" class="btn-secondary" type="button" hidden>Cancelar</button>
                    <button id="fmuNoticeOkBtn" class="btn-primary" type="button">Entendi</button>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);
        return overlay;
    }

    function openDialog(options) {
        const overlay = createDialogModal();
        const card = overlay.querySelector('.fmu-notice-card');
        const closeButton = overlay.querySelector('.fmu-notice-close');
        const titleElement = overlay.querySelector('#fmuNoticeTitle');
        const messageElement = overlay.querySelector('#fmuNoticeMessage');
        const inputWrap = overlay.querySelector('#fmuNoticeInputWrap');
        const input = overlay.querySelector('#fmuNoticeInput');
        const okButton = overlay.querySelector('#fmuNoticeOkBtn');
        const cancelButton = overlay.querySelector('#fmuNoticeCancelBtn');

        titleElement.textContent = options.title || 'Aviso';
        messageElement.textContent = options.message || '';
        okButton.textContent = options.okText || 'Entendi';
        cancelButton.textContent = options.cancelText || 'Cancelar';
        cancelButton.hidden = !options.showCancel;
        inputWrap.hidden = !options.showInput;
        input.value = '';
        input.type = options.inputType || 'password';
        input.placeholder = options.inputPlaceholder || '';
        card.setAttribute('role', options.showCancel || options.showInput ? 'dialog' : 'alertdialog');

        return new Promise((resolve) => {
            let resolved = false;

            const cleanup = () => {
                overlay.classList.remove('active');
                overlay.setAttribute('aria-hidden', 'true');
                overlay.removeEventListener('click', onOverlayClick);
                document.removeEventListener('keydown', onKeyDown);
                okButton.removeEventListener('click', onOk);
                cancelButton.removeEventListener('click', onCancel);
                closeButton.removeEventListener('click', onCancel);
                input.removeEventListener('keydown', onInputKeyDown);
            };

            const finish = (value) => {
                if (resolved) return;
                resolved = true;
                cleanup();
                resolve(value);
            };

            const onOk = () => {
                if (options.mode === 'confirm') finish(true);
                else if (options.mode === 'password') finish(input.value);
                else finish(true);
            };

            const onCancel = () => {
                if (options.mode === 'confirm') finish(false);
                else if (options.mode === 'password') finish(null);
                else finish(false);
            };

            const onOverlayClick = (event) => {
                if (event.target === overlay) onCancel();
            };

            const onKeyDown = (event) => {
                if (event.key === 'Escape') onCancel();
            };

            const onInputKeyDown = (event) => {
                if (event.key === 'Enter') {
                    event.preventDefault();
                    onOk();
                }
            };

            okButton.addEventListener('click', onOk);
            cancelButton.addEventListener('click', onCancel);
            closeButton.addEventListener('click', onCancel);
            overlay.addEventListener('click', onOverlayClick);
            document.addEventListener('keydown', onKeyDown);
            input.addEventListener('keydown', onInputKeyDown);

            overlay.classList.add('active');
            overlay.setAttribute('aria-hidden', 'false');
            setTimeout(() => {
                if (options.showInput) {
                    input.focus();
                } else {
                    okButton.focus();
                }
            }, 50);
        });
    }

    window.showFmuNotice = function showFmuNotice(message, title = 'Aviso') {
        return openDialog({
            mode: 'notice',
            message,
            title,
            okText: 'Entendi',
            showCancel: false,
            showInput: false
        });
    };

    window.showFmuConfirm = function showFmuConfirm(message, title = 'Confirmar ação', okText = 'Confirmar', cancelText = 'Cancelar') {
        return openDialog({
            mode: 'confirm',
            message,
            title,
            okText,
            cancelText,
            showCancel: true,
            showInput: false
        });
    };

    window.showFmuTextPrompt = function showFmuTextPrompt(message, title = 'Informação', placeholder = '') {
        return openDialog({
            mode: 'password',
            message,
            title,
            okText: 'Continuar',
            cancelText: 'Cancelar',
            showCancel: true,
            showInput: true,
            inputType: 'text',
            inputPlaceholder: placeholder
        });
    };

    window.showFmuPasswordPrompt = function showFmuPasswordPrompt(message, title = 'Acesso restrito') {
        return openDialog({
            mode: 'password',
            message,
            title,
            okText: 'Entrar',
            cancelText: 'Cancelar',
            showCancel: true,
            showInput: true,
            inputType: 'password',
            inputPlaceholder: 'Digite a senha'
        });
    };

    window.alert = function fmuAlertOverride(message) {
        window.showFmuNotice(String(message || ''), 'Aviso');
    };
})();

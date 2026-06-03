// Main application entry point
import { state, loadState } from './state.js';
import { renderCalendar, initializeUserPanel } from './calendar.js';
import { openBookingModal, showReport, showSearchBookings, searchBookingsByCpf } from './booking.js';
import { initializeAdminPanel } from './admin.js';
import { applyAppearanceConfig } from './appearance.js';
import { initializeModals, showCancellationModal, showStatistics } from './modals.js';


function setOfflineOverlayVisible(visible) {
    const overlay = document.getElementById('offlineOverlay');
    if (!overlay) return;
    overlay.hidden = !visible;
    document.body.classList.toggle('is-offline-open', visible);
}

function updateOfflineOverlay() {
    setOfflineOverlayVisible(!navigator.onLine || state.isOnline === false);
}

function initializeOfflineOverlay() {
    const retryBtn = document.getElementById('offlineRetryBtn');
    if (retryBtn) {
        retryBtn.addEventListener('click', () => {
            if (navigator.onLine) {
                window.location.reload();
            } else {
                setOfflineOverlayVisible(true);
            }
        });
    }

    window.addEventListener('appOffline', () => {
        setOfflineOverlayVisible(true);
    });

    if (!navigator.onLine) {
        setOfflineOverlayVisible(true);
    }
}


function startLogoIntroAnimation() {
    const prefersReducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) return;

    const target = document.querySelector('.header-content .logo-fiber-orbit');
    const targetLogo = target ? target.querySelector('img.logo') : null;
    if (!target || !targetLogo) return;

    const targetRect = target.getBoundingClientRect();
    if (!targetRect.width || !targetRect.height) return;

    const clone = target.cloneNode(true);
    clone.classList.add('logo-startup-clone');
    clone.setAttribute('aria-hidden', 'true');

    const cloneLogo = clone.querySelector('img.logo');
    if (cloneLogo) cloneLogo.src = targetLogo.src;

    clone.style.left = `${targetRect.left}px`;
    clone.style.top = `${targetRect.top}px`;
    clone.style.width = `${targetRect.width}px`;
    clone.style.height = `${targetRect.height}px`;

    document.body.appendChild(clone);
    document.body.classList.add('logo-intro-running');

    const viewportMin = Math.min(window.innerWidth, window.innerHeight);
    const desiredStartSize = Math.max(window.innerWidth, window.innerHeight) * 1.08;
    const scale = Math.max(1, desiredStartSize / Math.max(targetRect.width, targetRect.height));
    const targetCenterX = targetRect.left + targetRect.width / 2;
    const targetCenterY = targetRect.top + targetRect.height / 2;
    const startTranslateX = (window.innerWidth / 2) - targetCenterX;
    const startTranslateY = (window.innerHeight / 2) - targetCenterY;

    const animation = clone.animate([
        {
            transform: `translate(${startTranslateX}px, ${startTranslateY}px) scale(${scale})`,
            opacity: 1,
            offset: 0
        },
        {
            transform: `translate(${startTranslateX}px, ${startTranslateY}px) scale(${scale})`,
            opacity: 1,
            offset: 0.18
        },
        {
            transform: 'translate(0px, 0px) scale(1)',
            opacity: 1,
            offset: 0.86
        },
        {
            transform: 'translate(0px, 0px) scale(1)',
            opacity: 0,
            offset: 1
        }
    ], {
        duration: 6000,
        easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
        fill: 'forwards'
    });

    animation.finished.catch(() => null).then(() => {
        document.body.classList.remove('logo-intro-running');
        clone.remove();
    });
}


function initializeAlternatingLogo() {
    const logoOrbit = document.getElementById('logoFiberOrbit');
    if (!logoOrbit) return;

    logoOrbit.classList.remove('show-alt');

    if (window.logoSwapIntervalId) {
        clearInterval(window.logoSwapIntervalId);
    }

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) return;

    let showAlternateLogo = false;
    window.logoSwapIntervalId = window.setInterval(() => {
        showAlternateLogo = !showAlternateLogo;
        logoOrbit.classList.toggle('show-alt', showAlternateLogo);
        const stack = document.getElementById('logoSwapContainer');
        if (stack) {
            stack.setAttribute('data-logo-state', showAlternateLogo ? 'alternate' : 'primary');
        }
    }, 10000);
}

function initializeNeonCalendarControl() {
    const neonButton = document.getElementById('neonBorderBtn');
    const neonInput = document.getElementById('neonBorderColorInput');
    if (!neonButton || !neonInput) return;

    const DEFAULT_NEON_COLOR = '#39ff14';
    const rootStyle = document.documentElement.style;

    function applyNeonState(enabled, color) {
        const chosenColor = color || DEFAULT_NEON_COLOR;
        neonInput.value = chosenColor;
        rootStyle.setProperty('--calendar-neon-border', chosenColor);
        document.body.classList.toggle('neon-calendar-enabled', enabled);
        neonButton.classList.toggle('active', enabled);

        if (enabled) {
            rootStyle.setProperty('--logo-orbit-dot-color', chosenColor);
            rootStyle.setProperty('--logo-orbit-dot-soft', chosenColor);
            rootStyle.setProperty('--logo-orbit-trail-color', chosenColor);
        } else {
            rootStyle.removeProperty('--logo-orbit-dot-color');
            rootStyle.removeProperty('--logo-orbit-dot-soft');
            rootStyle.removeProperty('--logo-orbit-trail-color');
        }
    }

    const savedColor = localStorage.getItem('calendarNeonBorderColor') || DEFAULT_NEON_COLOR;
    const savedEnabled = localStorage.getItem('calendarNeonBorderEnabled') === 'true';
    applyNeonState(savedEnabled, savedColor);

    neonButton.addEventListener('click', () => {
        const currentColor = neonInput.value || savedColor || DEFAULT_NEON_COLOR;
        localStorage.setItem('calendarNeonBorderEnabled', 'true');
        applyNeonState(true, currentColor);
        neonInput.click();
    });

    neonInput.addEventListener('input', () => {
        const color = neonInput.value || DEFAULT_NEON_COLOR;
        localStorage.setItem('calendarNeonBorderColor', color);
        localStorage.setItem('calendarNeonBorderEnabled', 'true');
        applyNeonState(true, color);
    });

    neonButton.addEventListener('contextmenu', (event) => {
        event.preventDefault();
        localStorage.setItem('calendarNeonBorderEnabled', 'false');
        applyNeonState(false, localStorage.getItem('calendarNeonBorderColor') || DEFAULT_NEON_COLOR);
        window.showFmuNotice('Borda neon do calendário desativada. O ponto do logo voltou para a cor padrão. Clique no ícone neon para escolher uma nova cor.', 'Neon desativado');
    });
}

function formatCpfForRole(value) {
    const digits = String(value || '').replace(/\D/g, '').slice(0, 11);
    return digits.length === 11 ? digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4') : digits;
}

function findSystemUserByCpf(cpf) {
    const cleanCpf = String(cpf || '').replace(/\D/g, '');
    return Object.entries(state.systemUsers || {}).find(([, user]) => String(user.cpf || '').replace(/\D/g, '') === cleanCpf) || null;
}

async function openSpecialistAccess() {
    const cpf = await window.showFmuTextPrompt('Digite o CPF do especialista:', 'Acesso Especialista', '000.000.000-00');
    if (cpf === null) return false;
    const cleanCpf = String(cpf || '').replace(/\D/g, '');
    if (cleanCpf.length !== 11) {
        await window.showFmuNotice('CPF deve conter 11 dígitos.', 'Acesso Especialista');
        return false;
    }

    const entry = findSystemUserByCpf(cleanCpf);
    if (!entry) {
        await window.showFmuNotice('Especialista não cadastrado. Solicite cadastro ao administrador.', 'Acesso negado');
        return false;
    }

    const [userId, user] = entry;
    const password = await window.showFmuPasswordPrompt(`Digite a senha de ${user.name || formatCpfForRole(cleanCpf)}:`, 'Acesso Especialista');
    if (password === null) return false;
    if (String(password) !== String(user.password || '')) {
        await window.showFmuNotice('Senha incorreta.', 'Acesso negado');
        return false;
    }

    if (user.mustChangePassword) {
        const newPassword = await window.showFmuPasswordPrompt('Digite uma nova senha definitiva:', 'Alterar senha temporária');
        if (newPassword === null) return false;
        if (String(newPassword).trim().length < 4) {
            await window.showFmuNotice('A nova senha deve ter pelo menos 4 caracteres.', 'Alterar senha');
            return false;
        }
        state.systemUsers[userId].password = String(newPassword).trim();
        state.systemUsers[userId].mustChangePassword = false;
        state.systemUsers[userId].updatedAt = new Date().toISOString();
        const { saveState } = await import('./state.js');
        saveState();
        await window.showFmuNotice('Senha alterada com sucesso.', 'Acesso Especialista');
    }

    state.currentMode = 'specialist';
    const adminPanel = document.getElementById('adminPanel');
    const userPanel = document.getElementById('userPanel');
    if (adminPanel) adminPanel.classList.remove('active');
    if (userPanel) userPanel.classList.add('active');
    await window.showFmuNotice(`Bem-vindo(a), ${user.name}. Use a busca de pacientes para abrir prontuários e registrar observações.`, 'Especialista');
    const patientBtn = document.getElementById('patientRegistrationBtn');
    if (patientBtn) patientBtn.click();
    return true;
}


const MY_CONSULTS_MONTHS = [1, 2, 3];

function getPatientDocInputParts(value) {
    const raw = String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    const cpfMode = raw.length > 7;
    if (cpfMode) {
        const digits = raw.replace(/\D/g, '').slice(0, 11);
        return { raw, cpfMode, value: digits, digits };
    }
    const firstSix = raw.slice(0, 6).replace(/\D/g, '');
    const seventh = raw.length > 6 ? raw.slice(6, 7).replace(/[^A-Z0-9]/g, '') : '';
    const re = (firstSix + seventh).slice(0, 7);
    return { raw, cpfMode, value: re, digits: re.replace(/\D/g, '') };
}

function normalizePatientDoc(value) {
    return getPatientDocInputParts(value).value;
}

function normalizePatientRe(value) {
    const raw = String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    const firstSix = raw.slice(0, 6).replace(/\D/g, '');
    const seventh = raw.length > 6 ? raw.slice(6, 7).replace(/[^A-Z0-9]/g, '') : '';
    return (firstSix + seventh).slice(0, 7);
}

function formatPatientCpfPartial(digits) {
    const clean = String(digits || '').replace(/\D/g, '').slice(0, 11);
    if (clean.length > 9) return clean.replace(/(\d{3})(\d{3})(\d{3})(\d{0,2})/, '$1.$2.$3-$4');
    if (clean.length > 6) return clean.replace(/(\d{3})(\d{3})(\d{1,3})/, '$1.$2.$3');
    if (clean.length > 3) return clean.replace(/(\d{3})(\d{1,3})/, '$1.$2');
    return clean;
}

function formatPatientDocAuto(value) {
    const parts = getPatientDocInputParts(value);
    const clean = parts.value;
    if (parts.cpfMode) return formatPatientCpfPartial(clean);
    if (/^\d{6}[A-Z0-9]$/.test(clean)) return `${clean.slice(0, 6)}-${clean.slice(6, 7)}`;
    return clean;
}

function findRegisteredPatientByCpfOrRe(value) {
    const parts = getPatientDocInputParts(value);
    const clean = parts.value;
    if (!clean) return null;

    return Object.values(state.registeredPatients || {}).find((patient) => {
        const cpf = String(patient.cpf || '').replace(/\D/g, '').slice(0, 11);
        const re = normalizePatientRe(patient.re);
        return cpf === clean || re === clean;
    }) || null;
}

function getPeriodForBooking(dateKey, booking) {
    const [year, month, day] = dateKey.split('-').map(Number);
    const configKey = `${year}-${month}`;
    const customConfig = state.customDayConfigurations?.[dateKey];
    const monthConfig = state.configurations?.[configKey];
    let config = null;
    if (customConfig) {
        config = customConfig;
    } else if (monthConfig?.daysConfig) {
        const dayOfWeek = new Date(year, month, day).getDay();
        config = monthConfig.daysConfig[dayOfWeek] || null;
    }
    return config?.periods?.[booking.periodIndex] || null;
}

function formatConsultationDate(dateKey) {
    const [year, month, day] = dateKey.split('-').map(Number);
    const months = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
    return `${String(day).padStart(2, '0')} de ${months[month]} de ${year}`;
}

function getPatientConsultations(patient, monthsBack = 3) {
    const cleanDoc = patient.type === 'civil' ? normalizePatientDoc(patient.cpf) : normalizePatientDoc(patient.re);
    const now = new Date();
    const start = new Date(now);
    start.setMonth(start.getMonth() - Math.max(1, Math.min(3, monthsBack)));
    start.setHours(0, 0, 0, 0);

    const results = [];
    Object.entries(state.bookings || {}).forEach(([dateKey, bookings]) => {
        const [year, month, day] = dateKey.split('-').map(Number);
        const bookingDate = new Date(year, month, day);
        if (bookingDate < start || bookingDate > now) return;

        (bookings || []).forEach((booking) => {
            if (booking.cancellation) return;
            if (booking.type !== patient.type) return;
            const bookingDoc = patient.type === 'civil' ? normalizePatientDoc(booking.cpf) : normalizePatientDoc(booking.re);
            if (bookingDoc !== cleanDoc) return;
            results.push({ dateKey, booking, period: getPeriodForBooking(dateKey, booking) });
        });
    });

    return results.sort((a, b) => b.dateKey.localeCompare(a.dateKey));
}

function ensureMyConsultationsModal() {
    let modal = document.getElementById('myConsultationsModal');
    if (modal) return modal;

    modal = document.createElement('div');
    modal.id = 'myConsultationsModal';
    modal.className = 'modal';
    modal.innerHTML = `
        <div class="modal-content report-modal my-consultations-modal-content">
            <span class="close" id="closeMyConsultations">&times;</span>
            <h2>Minhas Consultas</h2>
            <p class="config-help">Digite seu CPF ou RE para consultar seus agendamentos dos últimos meses.</p>
            <div class="search-section my-consultations-search">
                <div class="form-group">
                    <label for="myConsultationsDoc">CPF ou RE:</label>
                    <input type="text" id="myConsultationsDoc" inputmode="text" maxlength="14" placeholder="Digite CPF ou RE" autocomplete="off">
                </div>
                <div class="form-group">
                    <label for="myConsultationsMonths">Período:</label>
                    <select id="myConsultationsMonths">
                        <option value="3" selected>Últimos 3 meses</option>
                        <option value="2">Últimos 2 meses</option>
                        <option value="1">Último mês</option>
                    </select>
                </div>
                <button id="myConsultationsSearchBtn" class="btn-primary" type="button">Buscar Consultas</button>
            </div>
            <div id="myConsultationsResults" class="search-results my-consultations-results"></div>
        </div>`;
    document.body.appendChild(modal);

    const close = () => {
        modal.classList.remove('active');
        const roleSelect = document.getElementById('roleSelect');
        if (roleSelect && roleSelect.value === 'myConsultations') roleSelect.value = 'patient';
    };

    modal.querySelector('#closeMyConsultations').addEventListener('click', close);
    modal.addEventListener('click', (event) => {
        if (event.target === modal) close();
    });

    const docInput = modal.querySelector('#myConsultationsDoc');
    const searchBtn = modal.querySelector('#myConsultationsSearchBtn');
    docInput.addEventListener('input', () => {
        docInput.value = formatPatientDocAuto(docInput.value);
    });
    docInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            renderMyConsultationsResults();
        }
    });
    searchBtn.addEventListener('click', renderMyConsultationsResults);

    return modal;
}

function renderMyConsultationsResults() {
    const modal = document.getElementById('myConsultationsModal');
    if (!modal) return;
    const docInput = modal.querySelector('#myConsultationsDoc');
    const monthsSelect = modal.querySelector('#myConsultationsMonths');
    const results = modal.querySelector('#myConsultationsResults');
    const cleanDoc = normalizePatientDoc(docInput.value);

    const docParts = getPatientDocInputParts(docInput.value);
    if (docParts.cpfMode && !/^\d{11}$/.test(cleanDoc)) {
        results.innerHTML = '<p class="no-bookings">CPF incompleto. Como passou de 7 caracteres, digite os 11 números do CPF.</p>';
        return;
    }
    if (!docParts.cpfMode && !/^\d{6}[A-Z0-9]$/.test(cleanDoc)) {
        results.innerHTML = '<p class="no-bookings">Digite um RE com 6 números e 7º caractere letra ou número, ou CPF com 11 números.</p>';
        return;
    }

    const patient = findRegisteredPatientByCpfOrRe(cleanDoc);
    if (!patient) {
        results.innerHTML = '<p class="no-bookings">Paciente não localizado. Verifique o CPF/RE informado.</p>';
        return;
    }

    const months = parseInt(monthsSelect.value || '3', 10);
    const consultations = getPatientConsultations(patient, months);
    const docLabel = patient.type === 'civil' ? 'CPF' : 'RE';
    const docValue = patient.type === 'civil' ? patient.cpf : patient.re;

    if (!consultations.length) {
        results.innerHTML = `
            <div class="patient-consult-summary">
                <strong>${patient.name || 'Paciente'}</strong><br>
                ${docLabel}: ${docValue || ''}
            </div>
            <p class="no-bookings">Nenhuma consulta encontrada no período selecionado.</p>`;
        return;
    }

    results.innerHTML = `
        <div class="patient-consult-summary">
            <strong>${patient.name || 'Paciente'}</strong><br>
            ${docLabel}: ${docValue || ''}<br>
            Exibindo ${consultations.length} consulta(s) dos últimos ${months} mês(es).
        </div>
        ${consultations.map((item) => {
            const periodName = item.period?.name || 'Período';
            const periodTime = item.period ? `${item.period.start} - ${item.period.end}` : '';
            return `
                <div class="my-consultation-card">
                    <h3>${formatConsultationDate(item.dateKey)}</h3>
                    <p><strong>Período:</strong> ${periodName}${periodTime ? ` (${periodTime})` : ''}</p>
                    <p><strong>Queixa:</strong> ${item.booking.complaint || 'Não informada'}</p>
                    <p><strong>Situação:</strong> ${item.booking.cancellation ? 'Cancelada' : 'Ativa'}</p>
                </div>`;
        }).join('')}`;
}

function openMyConsultationsModal() {
    const modal = ensureMyConsultationsModal();
    const input = modal.querySelector('#myConsultationsDoc');
    const results = modal.querySelector('#myConsultationsResults');
    const months = modal.querySelector('#myConsultationsMonths');
    input.value = '';
    if (months) months.value = '3';
    results.innerHTML = '';
    modal.classList.add('active');
    setTimeout(() => input.focus(), 50);
}

function initializeRoleSelect() {
    const roleSelect = document.getElementById('roleSelect');
    if (!roleSelect) return;
    roleSelect.addEventListener('change', async () => {
        const selected = roleSelect.value;
        if (selected === 'patient') {
            const exitAdminBtn = document.getElementById('exitAdminBtn');
            if (exitAdminBtn && exitAdminBtn.style.display !== 'none') exitAdminBtn.click();
            state.currentMode = 'user';
            const adminPanel = document.getElementById('adminPanel');
            const userPanel = document.getElementById('userPanel');
            if (adminPanel) adminPanel.classList.remove('active');
            if (userPanel) userPanel.classList.add('active');
            renderCalendar();
            return;
        }
        if (selected === 'myConsultations') {
            openMyConsultationsModal();
            return;
        }
        if (selected === 'admin') {
            const adminBtn = document.getElementById('adminModeBtn');
            if (adminBtn) adminBtn.click();
            roleSelect.value = 'patient';
            return;
        }
        if (selected === 'specialist') {
            const ok = await openSpecialistAccess();
            roleSelect.value = ok ? 'specialist' : 'patient';
        }
    });
}

function initializeModeToggle() {
    const adminBtn = document.getElementById('adminModeBtn');
    const exitAdminBtn = document.getElementById('exitAdminBtn');
    const userBtn = document.getElementById('userModeBtn');
    const statisticsBtn = document.getElementById('statisticsBtn');
    const adminPanel = document.getElementById('adminPanel');
    const userPanel = document.getElementById('userPanel');
    const themeModeBtn = document.getElementById('themeModeBtn');

    // Load saved theme preference
    const savedTheme = localStorage.getItem('theme') || 'light';
    if (savedTheme === 'dark') {
        document.body.classList.add('dark-mode');
    }

    // Theme toggle
    themeModeBtn.addEventListener('click', () => {
        document.body.classList.toggle('dark-mode');
        const currentTheme = document.body.classList.contains('dark-mode') ? 'dark' : 'light';
        localStorage.setItem('theme', currentTheme);
    });

    adminBtn.addEventListener('click', async () => {
        const password = await window.showFmuPasswordPrompt('Digite a senha de administrador:', 'Acesso Administrativo');
        if (password === null) return;
        if (password !== 'ndit@123') {
            window.showFmuNotice('Senha incorreta!', 'Acesso negado');
            return;
        }
        
        state.currentMode = 'admin';
        adminBtn.classList.add('active');
        adminBtn.style.display = 'none';
        exitAdminBtn.style.display = 'block';
        userBtn.classList.remove('active');
        adminPanel.classList.add('active');
        userPanel.classList.remove('active');
    });

    exitAdminBtn.addEventListener('click', () => {
        state.currentMode = 'user';
        adminBtn.classList.remove('active');
        adminBtn.style.display = 'none';
        exitAdminBtn.style.display = 'none';
        userBtn.classList.add('active');
        adminPanel.classList.remove('active');
        userPanel.classList.add('active');
    });

    statisticsBtn.addEventListener('click', async () => {
        const password = await window.showFmuPasswordPrompt('Digite a senha de administrador:', 'Acesso Administrativo');
        if (password === null) return;
        if (password !== 'ndit@123') {
            window.showFmuNotice('Senha incorreta!', 'Acesso negado');
            return;
        }
        showStatistics();
    });

    userBtn.addEventListener('click', () => {
        // Show patient search modal instead of switching to user panel
        window.dispatchEvent(new CustomEvent('showPatientSearch'));
    });
}

async function initApp() {
    console.log('🚀 Iniciando aplicação...');
    
    initializeOfflineOverlay();
    initializeModeToggle();
    initializeRoleSelect();
    initializeNeonCalendarControl();
    initializeAlternatingLogo();
    initializeAdminPanel();
    initializeUserPanel();
    initializeModals();
    
    // Set up custom event listeners
    window.addEventListener('stateUpdated', () => {
        applyAppearanceConfig();
        if (state.currentMode === 'user') {
            renderCalendar();
        }
    });

    window.addEventListener('openBookingModal', (e) => {
        openBookingModal(e.detail.day, e.detail.patient);
    });

    window.addEventListener('openBookingModalDirect', (e) => {
        openBookingModal(e.detail.day);
    });

    window.addEventListener('showReport', () => {
        showReport();
    });

    window.addEventListener('showReportWithFilter', (e) => {
        showReport(e.detail.filterDate);
    });

    window.addEventListener('showSearchBookings', () => {
        showSearchBookings();
    });
    
    window.addEventListener('performSearchBookings', () => {
        searchBookingsByCpf();
    });

    window.addEventListener('showCancellationModal', (e) => {
        showCancellationModal(e.detail.dateKey, e.detail.bookingIndex);
    });

    window.addEventListener('showPatientSearch', async () => {
        const { showPatientSearch } = await import('./modals.js');
        showPatientSearch();
    });

    window.addEventListener('openPatientBooking', (e) => {
        const patient = e.detail.patient;
        // Patient is verified, now let them choose day/period
        // We'll show a simplified calendar view that opens booking directly
        window.dispatchEvent(new CustomEvent('openBookingForPatient', { detail: { patient } }));
    });

    window.addEventListener('openBookingForPatient', (e) => {
        const patient = e.detail.patient;
        // Store patient data temporarily
        window.currentPatient = patient;
        // User should double-click calendar day to book
        window.showFmuNotice(`Olá ${patient.name}! Agora clique duas vezes no dia desejado no calendário para fazer sua reserva.`, 'Paciente localizado');
    });
    
    // Load state and wait for it to complete
    await loadState();
    
    // Render calendar after state is loaded
    if (state.isInitialized) {
        applyAppearanceConfig();
        renderCalendar();
        requestAnimationFrame(() => {
            startLogoIntroAnimation();
        });
        
        if (state.isOnline) {
            console.log('✓ Conectado ao banco de dados Firebase');
            setOfflineOverlayVisible(false);
        } else {
            console.log('❌ Sem conexão com Firebase');
            setOfflineOverlayVisible(true);
        }
    }
}

// Monitor online/offline status
window.addEventListener('online', async () => {
    console.log('🌐 Conexão restaurada');
    if (state.isInitialized) {
        const { loadFromFirebase } = await import('./state.js');
        await loadFromFirebase();
    }
    updateOfflineOverlay();
});

window.addEventListener('offline', () => {
    console.log('📵 Conexão perdida');
    state.isOnline = false;
    setOfflineOverlayVisible(true);
});

// Start app when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}
// Admin panel functionality module
import { state, saveState } from './state.js';
import { renderCalendar, renderBlockedCalendar } from './calendar.js';
import { renderRegisteredPatientsList } from './modals.js';
import { applyAppearanceConfig, DEFAULT_LOGO_SRC, DEFAULT_BACKGROUND_SRC } from './appearance.js';

let visualConfigDraft = null;

export function initializeAdminPanel() {
    const monthSelect = document.getElementById('monthSelect');
    const yearSelect = document.getElementById('yearSelect');
    const monthlyBookingLimitInput = document.getElementById('monthlyBookingLimitInput');
    const currentYear = new Date().getFullYear();

    const months = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 
                    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
    months.forEach((month, index) => {
        const option = document.createElement('option');
        option.value = index;
        option.textContent = month;
        monthSelect.appendChild(option);
    });

    for (let i = currentYear; i <= currentYear + 2; i++) {
        const option = document.createElement('option');
        option.value = i;
        option.textContent = i;
        yearSelect.appendChild(option);
    }

    monthSelect.value = state.currentMonth;
    yearSelect.value = state.currentYear;

    document.getElementById('addPeriodBtn').addEventListener('click', addPeriod);
    document.getElementById('saveConfigBtn').addEventListener('click', saveConfiguration);
    document.getElementById('searchBookingsBtn').addEventListener('click', () => {
        window.dispatchEvent(new CustomEvent('showSearchBookings'));
    });
    document.getElementById('reportBtn').addEventListener('click', () => {
        window.dispatchEvent(new CustomEvent('showReport'));
    });
    document.getElementById('manageBlockedDaysBtn').addEventListener('click', showBlockedDaysModal);
    document.getElementById('resetMonthBtn').addEventListener('click', resetMonth);
    document.getElementById('customizeDayBtn').addEventListener('click', showCustomizeDayModal);
    document.getElementById('generatePdfBtn').addEventListener('click', generateMonthPDF);
    document.getElementById('patientRegistrationBtn').addEventListener('click', showPatientRegistrationModal);
    document.getElementById('userRegistrationBtn').addEventListener('click', () => {
        window.dispatchEvent(new CustomEvent('showUserRegistration'));
    });
    document.getElementById('emailConfigBtn').addEventListener('click', showEmailConfigModal);
    document.getElementById('visualConfigBtn').addEventListener('click', showVisualConfigModal);
    initializeVisualConfigModal();

    const handleMonthYearChange = () => {
        const month = parseInt(monthSelect.value);
        const year = parseInt(yearSelect.value);
        const daysInMonth = new Date(year, month + 1, 0).getDate();

        const key = `${year}-${month}`;
        const existingConfig = state.configurations[key];

        if (existingConfig) {
            if (monthlyBookingLimitInput) {
                monthlyBookingLimitInput.value = Number.isFinite(parseInt(existingConfig.monthlyBookingLimit, 10))
                    ? parseInt(existingConfig.monthlyBookingLimit, 10)
                    : 0;
            }
            // marcar os dias da semana que já possuem configuração
            const daysCheckboxes = document.querySelectorAll('.days-selector input[type="checkbox"]');
            daysCheckboxes.forEach(cb => {
                const dow = parseInt(cb.value);
                cb.checked = !!(existingConfig.daysConfig && existingConfig.daysConfig[dow]);
            });
        } else {
            if (monthlyBookingLimitInput) monthlyBookingLimitInput.value = 0;
            // por padrão, todos os dias da semana marcados
            const daysCheckboxes = document.querySelectorAll('.days-selector input[type="checkbox"]');
            daysCheckboxes.forEach(cb => cb.checked = true);
        }
    };

    monthSelect.addEventListener('change', handleMonthYearChange);
    yearSelect.addEventListener('change', handleMonthYearChange);

    handleMonthYearChange();

    updateRemoveButtons();
}

function addPeriod() {
    const container = document.getElementById('periodsContainer');
    
    const periodItem = document.createElement('div');
    periodItem.className = 'period-item';
    periodItem.innerHTML = `
        <select class="period-name">
            <option value="Manhã">Manhã</option>
            <option value="Tarde">Tarde</option>
            <option value="Noite">Noite</option>
        </select>
        <input type="time" class="period-start">
        <input type="time" class="period-end">
        <input type="number" placeholder="Vagas" min="1" value="5" class="period-slots">
        <button class="remove-period">×</button>
    `;

    const removeBtn = periodItem.querySelector('.remove-period');
    removeBtn.addEventListener('click', () => {
        periodItem.remove();
        updateRemoveButtons();
    });

    container.appendChild(periodItem);
    updateRemoveButtons();
}

function updateRemoveButtons() {
    const container = document.getElementById('periodsContainer');
    const removeButtons = container.querySelectorAll('.remove-period');
    removeButtons.forEach((btn) => {
        btn.disabled = false;
    });
}

function saveConfiguration() {
    const monthSelect = document.getElementById('monthSelect');
    const yearSelect = document.getElementById('yearSelect');
    const monthlyBookingLimitInput = document.getElementById('monthlyBookingLimitInput');
    const month = parseInt(monthSelect.value);
    const year = parseInt(yearSelect.value);

    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const startDay = 1;
    const endDay = daysInMonth;

    let monthlyBookingLimit = parseInt(monthlyBookingLimitInput?.value || '0', 10);
    if (!Number.isFinite(monthlyBookingLimit) || monthlyBookingLimit < 0) monthlyBookingLimit = 0;
    if (monthlyBookingLimit > 99) monthlyBookingLimit = 99;

    const daysCheckboxes = document.querySelectorAll('.days-selector input[type="checkbox"]');
    const availableDays = Array.from(daysCheckboxes)
        .filter(cb => cb.checked)
        .map(cb => parseInt(cb.value));

    const periodItems = document.querySelectorAll('.period-item');
    const periods = Array.from(periodItems).map(item => ({
        name: item.querySelector('.period-name').value,
        start: item.querySelector('.period-start').value,
        end: item.querySelector('.period-end').value,
        slots: parseInt(item.querySelector('.period-slots').value) || 1,
    })).filter(p => p.name && p.start && p.end);

    if (availableDays.length === 0) {
        window.showFmuNotice('Selecione pelo menos um dia da semana', 'Atenção');
        return;
    }

    const key = `${year}-${month}`;
    const existingConfig = state.configurations[key] || {};
    const daysConfig = existingConfig.daysConfig || {};

    // atualiza intervalo de dias ativos e limite mensal do paciente
    existingConfig.startDay = startDay;
    existingConfig.endDay = endDay;
    existingConfig.monthlyBookingLimit = monthlyBookingLimit;

    // para cada dia da semana marcado, grava/atualiza a configuração daquele dia
    availableDays.forEach(dow => {
        daysConfig[dow] = {
            periods: JSON.parse(JSON.stringify(periods))
        };
    });

    existingConfig.daysConfig = daysConfig;
    state.configurations[key] = existingConfig;

    saveState();
    window.showFmuNotice('Configuração salva com sucesso!', 'Sucesso');
}

async function resetMonth() {
    const password = await window.showFmuPasswordPrompt('Digite a senha de administrador para resetar o mês:', 'Resetar mês');
    if (password === null) return;
    if (password !== 'ndit@123') {
        window.showFmuNotice('Senha incorreta!', 'Acesso negado');
        return;
    }
    
    const monthSelect = document.getElementById('monthSelect');
    const yearSelect = document.getElementById('yearSelect');
    const month = parseInt(monthSelect.value);
    const year = parseInt(yearSelect.value);
    
    const months = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 
                    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
    
    const confirmMsg = `Tem certeza que deseja RESETAR todos os dados de ${months[month]} ${year}?\\n\\nIsto irá apagar:\\n- Configurações do mês\\n- Todos os agendamentos\\n- Dias bloqueados\\n- Configurações personalizadas de dias\\n\\nEsta ação não pode ser desfeita!`;
    
    const confirmed = await window.showFmuConfirm(confirmMsg, 'Confirmar reset do mês', 'Resetar', 'Cancelar');
    if (!confirmed) {
        return;
    }
    
    const configKey = `${year}-${month}`;
    delete state.configurations[configKey];
    
    const bookingKeys = Object.keys(state.bookings);
    bookingKeys.forEach(dateKey => {
        const [bookingYear, bookingMonth] = dateKey.split('-').map(Number);
        if (bookingYear === year && bookingMonth === month) {
            delete state.bookings[dateKey];
        }
    });
    
    const blockedKeys = Object.keys(state.blockedDays);
    blockedKeys.forEach(dateKey => {
        const [blockedYear, blockedMonth] = dateKey.split('-').map(Number);
        if (blockedYear === year && blockedMonth === month) {
            delete state.blockedDays[dateKey];
        }
    });
    
    const customKeys = Object.keys(state.customDayConfigurations || {});
    customKeys.forEach(dateKey => {
        const [customYear, customMonth] = dateKey.split('-').map(Number);
        if (customYear === year && customMonth === month) {
            delete state.customDayConfigurations[dateKey];
        }
    });
    
    saveState();
    renderCalendar();
    window.showFmuNotice(`Mês ${months[month]} ${year} foi resetado com sucesso!`, 'Sucesso');
}

function showBlockedDaysModal() {
    const modal = document.getElementById('blockedDaysModal');
    state.blockedCalendarMonth = state.currentMonth;
    state.blockedCalendarYear = state.currentYear;
    renderBlockedCalendar();
    modal.classList.add('active');
}

function showCustomizeDayModal() {
    const modal = document.getElementById('customizeDayModal');
    state.customizeCalendarMonth = state.currentMonth;
    state.customizeCalendarYear = state.currentYear;
    renderCustomizeCalendar();
    modal.classList.add('active');
}

export function renderCustomizeCalendar() {
    const calendar = document.getElementById('customizeCalendar');
    const title = document.getElementById('customizeCalendarTitle');
    const months = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 
                    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

    title.textContent = `${months[state.customizeCalendarMonth]} ${state.customizeCalendarYear}`;

    calendar.innerHTML = '';

    // Add day headers
    const dayNames = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
    dayNames.forEach(name => {
        const dayHeader = document.createElement('div');
        dayHeader.className = 'calendar-day empty';
        dayHeader.style.fontWeight = '600';
        dayHeader.textContent = name;
        calendar.appendChild(dayHeader);
    });

    const firstDay = new Date(state.customizeCalendarYear, state.customizeCalendarMonth, 1).getDay();
    const daysInMonth = new Date(state.customizeCalendarYear, state.customizeCalendarMonth + 1, 0).getDate();

    for (let i = 0; i < firstDay; i++) {
        const emptyDay = document.createElement('div');
        emptyDay.className = 'calendar-day empty';
        calendar.appendChild(emptyDay);
    }

    const configKey = `${state.customizeCalendarYear}-${state.customizeCalendarMonth}`;
    const config = state.configurations[configKey];

    for (let day = 1; day <= daysInMonth; day++) {
        const dayElement = document.createElement('div');
        dayElement.className = 'calendar-day';
        dayElement.textContent = day;

        const dateKey = `${state.customizeCalendarYear}-${state.customizeCalendarMonth}-${day}`;
        // Check only for active (non-cancelled) bookings
        const activeBookings = state.bookings[dateKey]?.filter(b => !b.cancellation) || [];
        const hasBookings = activeBookings.length > 0;
        const hasCustomConfig = state.customDayConfigurations && state.customDayConfigurations[dateKey];

        const dayOfWeek = new Date(state.customizeCalendarYear, state.customizeCalendarMonth, day).getDay();
        const withinMonthRange = config 
            ? (day >= (config.startDay || 1) && day <= (config.endDay || daysInMonth))
            : false;
        const hasBaseConfigForDay = config && config.daysConfig && config.daysConfig[dayOfWeek];

        if (hasBookings) {
            dayElement.classList.add('disabled');
            dayElement.title = 'Dia com agendamentos - não pode ser personalizado';
        } else if (!config || !withinMonthRange || !hasBaseConfigForDay) {
            dayElement.classList.add('disabled');
            dayElement.title = 'Configure o mês primeiro ou este dia está fora do período configurado';
        } else {
            if (hasCustomConfig) {
                dayElement.classList.add('partially-booked');
                dayElement.title = 'Dia com configuração personalizada';
            } else {
                dayElement.classList.add('available');
            }
            dayElement.addEventListener('click', () => {
                openCustomizeDayForm(day, dateKey);
            });
        }

        calendar.appendChild(dayElement);
    }
}

function openCustomizeDayForm(day, dateKey) {
    const modal = document.getElementById('customizeDayFormModal');
    const title = document.getElementById('customizeDayFormTitle');
    const periodsContainer = document.getElementById('customDayPeriodsContainer');

    const months = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 
                    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

    const [year, month, dayNum] = dateKey.split('-').map(Number);
    title.textContent = `Personalizar: ${dayNum} de ${months[month]} de ${year}`;

    // Initialize custom day configurations if it doesn't exist
    if (!state.customDayConfigurations) {
        state.customDayConfigurations = {};
    }

    const configKey = `${year}-${month}`;
    const baseMonthConfig = state.configurations[configKey];
    const dayOfWeek = new Date(year, month, dayNum).getDay();
    const baseConfig = baseMonthConfig && baseMonthConfig.daysConfig && baseMonthConfig.daysConfig[dayOfWeek];
    const customConfig = state.customDayConfigurations[dateKey];

    const periodsToShow = customConfig ? customConfig.periods : (baseConfig ? baseConfig.periods : []);

    periodsContainer.innerHTML = '';

    periodsToShow.forEach((period, index) => {
        const periodItem = document.createElement('div');
        periodItem.className = 'period-item';
        periodItem.innerHTML = `
            <select class="period-name">
                <option value="Manhã">Manhã</option>
                <option value="Tarde">Tarde</option>
                <option value="Noite">Noite</option>
            </select>
            <input type="time" value="${period.start}" class="period-start">
            <input type="time" value="${period.end}" class="period-end">
            <input type="number" placeholder="Vagas" value="${period.slots || 1}" min="1" class="period-slots">
            <button class="remove-period" ${periodsToShow.length === 1 ? 'disabled' : ''}>×</button>
        `;

        const select = periodItem.querySelector('.period-name');
        if (select && ['Manhã', 'Tarde', 'Noite'].includes(period.name)) {
            select.value = period.name;
        }

        const removeBtn = periodItem.querySelector('.remove-period');
        removeBtn.addEventListener('click', () => {
            periodItem.remove();
            updateCustomRemoveButtons();
        });

        periodsContainer.appendChild(periodItem);
    });

    updateCustomRemoveButtons();

    document.getElementById('addCustomPeriodBtn').onclick = () => {
        const container = document.getElementById('customDayPeriodsContainer');
        
        const periodItem = document.createElement('div');
        periodItem.className = 'period-item';
        periodItem.innerHTML = `
            <select class="period-name">
                <option value="Manhã">Manhã</option>
                <option value="Tarde">Tarde</option>
                <option value="Noite">Noite</option>
            </select>
            <input type="time" class="period-start">
            <input type="time" class="period-end">
            <input type="number" placeholder="Vagas" min="1" value="5" class="period-slots">
            <button class="remove-period">×</button>
        `;

        const removeBtn = periodItem.querySelector('.remove-period');
        removeBtn.addEventListener('click', () => {
            periodItem.remove();
            updateCustomRemoveButtons();
        });

        container.appendChild(periodItem);
        updateCustomRemoveButtons();
    };

    document.getElementById('saveCustomDayBtn').onclick = () => {
        saveCustomDayConfiguration(dateKey);
        modal.classList.remove('active');
        renderCustomizeCalendar();
    };

    document.getElementById('removeCustomDayBtn').onclick = async () => {
        if (await window.showFmuConfirm('Deseja remover a configuração personalizada deste dia?', 'Remover personalização', 'Remover', 'Cancelar')) {
            if (state.customDayConfigurations && state.customDayConfigurations[dateKey]) {
                delete state.customDayConfigurations[dateKey];
                saveState();
                renderCalendar();
            }
            modal.classList.remove('active');
            renderCustomizeCalendar();
        }
    };

    document.getElementById('cancelCustomDayBtn').onclick = () => {
        modal.classList.remove('active');
    };

    modal.classList.add('active');
}

function updateCustomRemoveButtons() {
    const container = document.getElementById('customDayPeriodsContainer');
    const removeButtons = container.querySelectorAll('.remove-period');
    removeButtons.forEach((btn) => {
        btn.disabled = false;
    });
}

function saveCustomDayConfiguration(dateKey) {
    const periodItems = document.querySelectorAll('#customDayPeriodsContainer .period-item');
    const periods = Array.from(periodItems).map(item => ({
        name: item.querySelector('.period-name').value,
        start: item.querySelector('.period-start').value,
        end: item.querySelector('.period-end').value,
        slots: parseInt(item.querySelector('.period-slots').value) || 1,
    })).filter(p => p.name && p.start && p.end);

    if (!state.customDayConfigurations) {
        state.customDayConfigurations = {};
    }

    state.customDayConfigurations[dateKey] = {
        periods: periods
    };

    saveState();
    renderCalendar();
    window.showFmuNotice('Configuração personalizada salva com sucesso!', 'Sucesso');
}

function generateMonthPDF() {
    const monthSelect = document.getElementById('monthSelect');
    const yearSelect = document.getElementById('yearSelect');
    const month = parseInt(monthSelect.value);
    const year = parseInt(yearSelect.value);
    
    const months = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 
                    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
    
    const configKey = `${year}-${month}`;
    const monthConfig = state.configurations[configKey];
    
    if (!monthConfig) {
        window.showFmuNotice('Configure o mês antes de gerar o PDF.', 'Atenção');
        return;
    }
    
    // Filter bookings for the selected month
    const monthBookings = {};
    Object.keys(state.bookings).forEach(dateKey => {
        const [bookingYear, bookingMonth] = dateKey.split('-').map(Number);
        if (bookingYear === year && bookingMonth === month) {
            monthBookings[dateKey] = state.bookings[dateKey];
        }
    });
    
    if (Object.keys(monthBookings).length === 0) {
        window.showFmuNotice('Não há agendamentos para este mês.', 'Atenção');
        return;
    }
    
    // Create PDF content
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    
    // Title
    doc.setFontSize(18);
    doc.setFont(undefined, 'bold');
    doc.text(`Relatório de Agendamentos - ${months[month]} ${year}`, 105, 20, { align: 'center' });
    
    let yPosition = 35;
    
    // Sort dates
    const sortedDates = Object.keys(monthBookings).sort();
    
    sortedDates.forEach(dateKey => {
        const [, , day] = dateKey.split('-').map(Number);
        const dayBookings = monthBookings[dateKey];
        
        // Check if we need a new page
        if (yPosition > 270) {
            doc.addPage();
            yPosition = 20;
        }
        
        // Date header
        doc.setFontSize(14);
        doc.setFont(undefined, 'bold');
        doc.text(`${day} de ${months[month]} de ${year}`, 20, yPosition);
        yPosition += 8;
        
        dayBookings.forEach(booking => {
            const customConfig = state.customDayConfigurations && state.customDayConfigurations[dateKey];
            let effectiveConfig = null;
            if (customConfig) {
                effectiveConfig = customConfig;
            } else if (monthConfig && monthConfig.daysConfig) {
                const dayOfWeek = new Date(year, month, day).getDay();
                effectiveConfig = monthConfig.daysConfig[dayOfWeek] || null;
            }
            const period = effectiveConfig?.periods[booking.periodIndex];
            
            if (!period) return;
            
            // Check if we need a new page
            if (yPosition > 260) {
                doc.addPage();
                yPosition = 20;
            }
            
            // Period name and time
            doc.setFontSize(11);
            doc.setFont(undefined, 'bold');
            doc.text(`${period.name} (${period.start} - ${period.end})`, 25, yPosition);
            yPosition += 6;
            
            // Booking details
            doc.setFontSize(10);
            doc.setFont(undefined, 'normal');
            doc.text(`Paciente: ${booking.name}`, 25, yPosition);
            yPosition += 5;
            doc.text(`WhatsApp: ${booking.phone}`, 25, yPosition);
            yPosition += 5;
            
            if (booking.entity) {
                doc.text(`Entidade: ${booking.entity}`, 25, yPosition);
                yPosition += 5;
            }
            
            if (booking.details) {
                const details = doc.splitTextToSize(`Descrição: ${booking.details}`, 160);
                doc.text(details, 25, yPosition);
                yPosition += (details.length * 5);
            }
            
            doc.setFontSize(8);
            doc.setTextColor(128);
            doc.text(`Reservado em: ${new Date(booking.timestamp).toLocaleString('pt-BR')}`, 25, yPosition);
            yPosition += 5;
            
            // Cancellation info
            if (booking.cancellation) {
                doc.setTextColor(255, 0, 0);
                doc.setFont(undefined, 'bold');
                doc.text('CANCELADO', 25, yPosition);
                yPosition += 5;
                doc.setFont(undefined, 'normal');
                doc.text(`Motivo: ${booking.cancellation.reason}`, 25, yPosition);
                yPosition += 5;
                doc.text(`Solicitado por: ${booking.cancellation.requestedBy}`, 25, yPosition);
                yPosition += 5;
                doc.text(`Cancelado em: ${new Date(booking.cancellation.timestamp).toLocaleString('pt-BR')}`, 25, yPosition);
                yPosition += 5;
            }
            
            doc.setTextColor(0);
            yPosition += 3;
        });
        
        yPosition += 5;
    });
    
    // Save PDF
    const fileName = `${months[month]}_${year}.pdf`;
    doc.save(fileName);
}

function showSetPasswordModal() {
    const modal = document.getElementById('setBookingPasswordModal');
    const statusText = document.getElementById('passwordStatusText');
    const disableBtn = document.getElementById('disablePasswordBtn');
    
    if (state.bookingPassword && state.bookingPassword.enabled) {
        statusText.innerHTML = `Habilitado - Senha: <strong>${state.bookingPassword.password}</strong>`;
        statusText.style.color = '#4caf50';
        disableBtn.style.display = 'block';
    } else {
        statusText.textContent = 'Desabilitado';
        statusText.style.color = '#f44336';
        disableBtn.style.display = 'none';
    }
    
    document.getElementById('newBookingPassword').value = '';
    document.getElementById('confirmBookingPassword2').value = '';
    
    modal.classList.add('active');
}

function showPatientRegistrationModal() {
    const modal = document.getElementById('patientRegistrationModal');
    modal.classList.add('active');

    const adminPatientSearchInput = document.getElementById('adminPatientSearchInput');
    const adminPatientSearchResults = document.getElementById('adminPatientSearchResults');
    const adminPatientDetails = document.getElementById('adminPatientDetails');
    if (adminPatientSearchInput) adminPatientSearchInput.value = '';
    if (adminPatientSearchResults) adminPatientSearchResults.innerHTML = '';
    if (adminPatientDetails) adminPatientDetails.innerHTML = '';
    
    // Reset form
    document.getElementById('regDoc').value = '';
    document.getElementById('regName').value = '';
    document.getElementById('regEmail').value = '';
    document.getElementById('regPhone').value = '';
    document.getElementById('regRank').value = '';
    const regDocLabel = document.getElementById('regDocLabel');
    const regDocInput = document.getElementById('regDoc');
    if (regDocLabel) regDocLabel.textContent = 'CPF ou RE:';
    if (regDocInput) {
        regDocInput.placeholder = 'Digite CPF ou RE';
        regDocInput.maxLength = 14;
        regDocInput.inputMode = 'text';
        regDocInput.dispatchEvent(new Event('input', { bubbles: true }));
    }
    document.getElementById('regRankField').style.display = 'none';
    document.getElementById('regMilitaryUnitField').style.display = 'none';
    document.querySelectorAll('input[name="regMilitaryUnit"]').forEach(r => r.checked = false);
    
    renderRegisteredPatientsList();
}

function showEmailConfigModal() {
    const modal = document.getElementById('emailConfigModal');
    const config = state.emailConfig || {};

    document.getElementById('emailJsPublicKey').value = config.publicKey || '';
    document.getElementById('emailJsServiceId').value = config.serviceId || '';
    document.getElementById('emailJsTemplateId').value = config.templateId || '';
    document.getElementById('emailFromName').value = config.fromName || 'FMU';
    document.getElementById('emailReplyTo').value = config.replyTo || '';
    document.getElementById('emailAdminCopy').value = config.adminEmail || '';
    document.getElementById('emailAutoSend').checked = config.autoSend !== false;
    
    modal.classList.add('active');
}

function showVisualConfigModal() {
    const modal = document.getElementById('visualConfigModal');
    visualConfigDraft = {
        logoDataUrl: state.appearanceConfig?.logoDataUrl || '',
        backgroundDataUrl: state.appearanceConfig?.backgroundDataUrl || '',
        availableDayColor: state.appearanceConfig?.availableDayColor || '#26be4c',
        availableDayBorderWidth: Math.max(1, Math.min(8, parseInt(state.appearanceConfig?.availableDayBorderWidth || 2, 10) || 2))
    };

    const logoInput = document.getElementById('visualLogoInput');
    const backgroundInput = document.getElementById('visualBackgroundInput');
    if (logoInput) logoInput.value = '';
    if (backgroundInput) backgroundInput.value = '';

    renderVisualConfigPreview();
    modal.classList.add('active');
}

function initializeVisualConfigModal() {
    const modal = document.getElementById('visualConfigModal');
    const closeBtn = document.getElementById('closeVisualConfig');
    const cancelBtn = document.getElementById('cancelVisualConfig');
    const saveBtn = document.getElementById('saveVisualConfig');
    const logoInput = document.getElementById('visualLogoInput');
    const backgroundInput = document.getElementById('visualBackgroundInput');
    const resetLogoBtn = document.getElementById('resetLogoVisual');
    const resetBackgroundBtn = document.getElementById('resetBackgroundVisual');
    const availableDayColorInput = document.getElementById('visualAvailableDayColor');
    const availableDayBorderWidthInput = document.getElementById('visualAvailableDayBorderWidth');
    const resetAvailableDayColorBtn = document.getElementById('resetAvailableDayColor');

    if (!modal || !closeBtn || !cancelBtn || !saveBtn) return;

    const closeModal = () => modal.classList.remove('active');
    closeBtn.addEventListener('click', closeModal);
    cancelBtn.addEventListener('click', closeModal);
    modal.addEventListener('click', (event) => {
        if (event.target === modal) closeModal();
    });

    if (logoInput) {
        logoInput.addEventListener('change', async (event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            try {
                visualConfigDraft = visualConfigDraft || {};
                visualConfigDraft.logoDataUrl = await resizeImageToDataUrl(file, 512, 512, 'image/png', 0.92);
                renderVisualConfigPreview();
            } catch (error) {
                console.error('Erro ao carregar logo:', error);
                window.showFmuNotice('Não foi possível carregar o logo. Tente outra imagem.', 'Erro');
            }
        });
    }

    if (backgroundInput) {
        backgroundInput.addEventListener('change', async (event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            try {
                visualConfigDraft = visualConfigDraft || {};
                visualConfigDraft.backgroundDataUrl = await resizeImageToDataUrl(file, 1600, 1200, 'image/jpeg', 0.82);
                renderVisualConfigPreview();
            } catch (error) {
                console.error('Erro ao carregar background:', error);
                window.showFmuNotice('Não foi possível carregar o background. Tente outra imagem.', 'Erro');
            }
        });
    }

    if (resetLogoBtn) {
        resetLogoBtn.addEventListener('click', () => {
            visualConfigDraft = visualConfigDraft || {};
            visualConfigDraft.logoDataUrl = '';
            if (logoInput) logoInput.value = '';
            renderVisualConfigPreview();
        });
    }

    if (resetBackgroundBtn) {
        resetBackgroundBtn.addEventListener('click', () => {
            visualConfigDraft = visualConfigDraft || {};
            visualConfigDraft.backgroundDataUrl = '';
            if (backgroundInput) backgroundInput.value = '';
            renderVisualConfigPreview();
        });
    }

    if (availableDayColorInput) {
        availableDayColorInput.addEventListener('input', () => {
            visualConfigDraft = visualConfigDraft || {};
            visualConfigDraft.availableDayColor = availableDayColorInput.value || '#26be4c';
            renderVisualConfigPreview();
        });
    }

    if (availableDayBorderWidthInput) {
        availableDayBorderWidthInput.addEventListener('input', () => {
            visualConfigDraft = visualConfigDraft || {};
            visualConfigDraft.availableDayBorderWidth = Math.max(1, Math.min(8, parseInt(availableDayBorderWidthInput.value || 2, 10) || 2));
            renderVisualConfigPreview();
        });
    }

    if (resetAvailableDayColorBtn) {
        resetAvailableDayColorBtn.addEventListener('click', () => {
            visualConfigDraft = visualConfigDraft || {};
            visualConfigDraft.availableDayColor = '#26be4c';
            visualConfigDraft.availableDayBorderWidth = 2;
            renderVisualConfigPreview();
        });
    }

    saveBtn.addEventListener('click', () => {
        state.appearanceConfig = {
            logoDataUrl: visualConfigDraft?.logoDataUrl || '',
            backgroundDataUrl: visualConfigDraft?.backgroundDataUrl || '',
            availableDayColor: visualConfigDraft?.availableDayColor || '#26be4c',
            availableDayBorderWidth: Math.max(1, Math.min(8, parseInt(visualConfigDraft?.availableDayBorderWidth || 2, 10) || 2))
        };
        applyAppearanceConfig();
        saveState();
        window.showFmuNotice('Visual salvo com sucesso!', 'Sucesso');
        closeModal();
    });
}

function renderVisualConfigPreview() {
    const logoPreview = document.getElementById('visualLogoPreview');
    const backgroundPreview = document.getElementById('visualBackgroundPreview');
    const logoSrc = visualConfigDraft?.logoDataUrl || DEFAULT_LOGO_SRC;
    const backgroundSrc = visualConfigDraft?.backgroundDataUrl || DEFAULT_BACKGROUND_SRC;
    const availableDayColor = visualConfigDraft?.availableDayColor || '#26be4c';
    const availableDayBorderWidth = Math.max(1, Math.min(8, parseInt(visualConfigDraft?.availableDayBorderWidth || 2, 10) || 2));

    if (logoPreview) logoPreview.src = logoSrc;
    if (backgroundPreview) backgroundPreview.style.backgroundImage = `url("${String(backgroundSrc).replace(/"/g, '\\"')}")`;

    const availableDayPreview = document.getElementById('visualAvailableDayPreview');
    const availableDayColorInput = document.getElementById('visualAvailableDayColor');
    if (availableDayPreview) {
        availableDayPreview.style.background = availableDayColor;
        availableDayPreview.style.borderColor = availableDayColor;
        availableDayPreview.style.borderWidth = availableDayBorderWidth + 'px';
    }
    if (availableDayColorInput) availableDayColorInput.value = availableDayColor;
    const availableDayBorderWidthInput = document.getElementById('visualAvailableDayBorderWidth');
    const availableDayBorderWidthValue = document.getElementById('visualAvailableDayBorderWidthValue');
    if (availableDayBorderWidthInput) availableDayBorderWidthInput.value = String(availableDayBorderWidth);
    if (availableDayBorderWidthValue) availableDayBorderWidthValue.textContent = availableDayBorderWidth + 'px';
}

function resizeImageToDataUrl(file, maxWidth, maxHeight, outputType, quality) {
    if (!file.type.startsWith('image/')) {
        return Promise.reject(new Error('Arquivo inválido.'));
    }

    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const image = new Image();
            image.onload = () => {
                const ratio = Math.min(maxWidth / image.width, maxHeight / image.height, 1);
                const width = Math.max(1, Math.round(image.width * ratio));
                const height = Math.max(1, Math.round(image.height * ratio));
                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');

                if (outputType === 'image/jpeg') {
                    ctx.fillStyle = '#ffffff';
                    ctx.fillRect(0, 0, width, height);
                }

                ctx.drawImage(image, 0, 0, width, height);
                resolve(canvas.toDataURL(outputType, quality));
            };
            image.onerror = reject;
            image.src = reader.result;
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

// Booking functionality module
import { state, saveState } from './state.js';
import { sendBookingConfirmationEmail } from './emailjs-service.js';

const MONTH_NAMES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
                    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

function getPatientCleanDoc(patient) {
    if (!patient) return '';
    return patient.type === 'civil'
        ? String(patient.cpf || '').replace(/\D/g, '')
        : String(patient.re || '').replace(/-/g, '').toUpperCase();
}

function getBookingCleanDoc(booking, type) {
    return type === 'civil'
        ? String(booking?.cpf || '').replace(/\D/g, '')
        : String(booking?.re || '').replace(/-/g, '').toUpperCase();
}

function formatDateLabel(dateKey) {
    const [year, month, day] = dateKey.split('-').map(Number);
    return `${day} de ${MONTH_NAMES[month]} de ${year}`;
}

function getPeriodInfoForDateBooking(dateKey, booking) {
    const [year, month, day] = dateKey.split('-').map(Number);
    const configKey = `${year}-${month}`;
    const customConfig = state.customDayConfigurations && state.customDayConfigurations[dateKey];
    const monthConfig = state.configurations && state.configurations[configKey];

    let config = null;
    if (customConfig) {
        config = customConfig;
    } else if (monthConfig && monthConfig.daysConfig) {
        const dayOfWeek = new Date(year, month, day).getDay();
        config = monthConfig.daysConfig[dayOfWeek] || null;
    }

    return config?.periods?.[booking.periodIndex] || null;
}

export function getMonthlyBookingLimitForMonth(year, month) {
    const monthConfig = state.configurations && state.configurations[`${year}-${month}`];
    const limit = parseInt(monthConfig?.monthlyBookingLimit || '0', 10);
    return Number.isFinite(limit) && limit > 0 ? limit : 0;
}

export function getActivePatientBookingsInMonth(patient, year, month) {
    const cleanDoc = getPatientCleanDoc(patient);
    if (!patient || !cleanDoc) return [];

    const results = [];
    Object.entries(state.bookings || {}).forEach(([dateKey, bookings]) => {
        const [bookingYear, bookingMonth] = dateKey.split('-').map(Number);
        if (bookingYear !== year || bookingMonth !== month) return;

        (bookings || []).forEach((booking, bookingIndex) => {
            if (booking.cancellation) return;
            const bookingDoc = getBookingCleanDoc(booking, patient.type);
            if (bookingDoc !== cleanDoc) return;

            const period = getPeriodInfoForDateBooking(dateKey, booking);
            results.push({ dateKey, booking, bookingIndex, period });
        });
    });

    return results.sort((a, b) => a.dateKey.localeCompare(b.dateKey));
}

export function buildMonthlyLimitExceededMessage(patient, targetDateKey) {
    const [year, month] = targetDateKey.split('-').map(Number);
    const limit = getMonthlyBookingLimitForMonth(year, month);
    if (!limit) return '';

    const activeBookings = getActivePatientBookingsInMonth(patient, year, month);
    if (activeBookings.length < limit) return '';

    const patientName = String(patient?.name || 'PACIENTE').toUpperCase();
    const details = activeBookings.map((item, index) => {
        const periodName = item.period?.name || 'Período não localizado';
        const periodTime = item.period ? `${item.period.start} - ${item.period.end}` : '';
        const complaint = item.booking?.complaint ? ` | Queixa: ${item.booking.complaint}` : '';
        return `${index + 1}. ${formatDateLabel(item.dateKey)} - ${periodName}${periodTime ? ` (${periodTime})` : ''}${complaint}`;
    }).join('\n');

    return `LIMITE MENSAL EXCEDIDO

${patientName} já atingiu o limite de ${limit} agendamento(s) em ${MONTH_NAMES[month]} de ${year}.

Agendamentos já existentes neste mês:
${details}

Para realizar novo agendamento, cancele um agendamento existente ou procure a administração.`;
}

export function canPatientBookInMonth(patient, targetDateKey) {
    return !buildMonthlyLimitExceededMessage(patient, targetDateKey);
}

function getDailyDuplicateBooking(patient, targetDateKey) {
    const cleanDoc = getPatientCleanDoc(patient);
    if (!patient || !cleanDoc || !targetDateKey) return null;

    const bookings = state.bookings?.[targetDateKey] || [];
    return bookings.find((booking) => {
        if (!booking || booking.cancellation) return false;
        if (booking.type !== patient.type) return false;
        return getBookingCleanDoc(booking, patient.type) === cleanDoc;
    }) || null;
}

function buildDailyDuplicateMessage(patient, targetDateKey) {
    const duplicate = getDailyDuplicateBooking(patient, targetDateKey);
    if (!duplicate) return '';

    const period = getPeriodInfoForDateBooking(targetDateKey, duplicate);
    const periodLabel = period ? `${period.name} (${period.start} - ${period.end})` : 'Período não localizado';
    return `${patient.name || 'Paciente'} já possui uma consulta agendada para ${formatDateLabel(targetDateKey)}.

Consulta existente: ${periodLabel}
Queixa: ${duplicate.complaint || 'Não informada'}

O sistema não permite mais de uma consulta para o mesmo paciente no mesmo dia.`;
}

export function openBookingModal(day, patient = null) {
    const modal = document.getElementById('bookingModal');
    const title = document.getElementById('modalTitle');
    const periodsList = document.getElementById('periodsAvailable');

    const dateKey = `${state.currentYear}-${state.currentMonth}-${day}`;
    const key = `${state.currentYear}-${state.currentMonth}`;
    
    // Check if there's a custom configuration for this specific day
    let config = null;
    const monthConfig = state.configurations[key];
    const customConfig = state.customDayConfigurations && state.customDayConfigurations[dateKey];

    if (customConfig) {
        config = customConfig;
    } else if (monthConfig && monthConfig.daysConfig) {
        const daysInMonth = new Date(state.currentYear, state.currentMonth + 1, 0).getDate();
        const withinRange = day >= (monthConfig.startDay || 1) && day <= (monthConfig.endDay || daysInMonth);
        if (withinRange) {
            const dayOfWeek = new Date(state.currentYear, state.currentMonth, day).getDay();
            config = monthConfig.daysConfig[dayOfWeek] || null;
        }
    }

    if (!config) return;

    if (patient) {
        const duplicateMessage = buildDailyDuplicateMessage(patient, dateKey);
        if (duplicateMessage) {
            window.showFmuNotice(duplicateMessage, 'Consulta já existente no dia');
            return;
        }

        const limitMessage = buildMonthlyLimitExceededMessage(patient, dateKey);
        if (limitMessage) {
            window.showFmuNotice(limitMessage, 'Limite mensal excedido');
            return;
        }
    }

    const months = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 
                    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
    title.textContent = `${day} de ${months[state.currentMonth]} de ${state.currentYear}`;

    const dayBookings = state.bookings[dateKey] || [];

    periodsList.innerHTML = '';

    config.periods.forEach((period, index) => {
        const periodCard = createPeriodCard(period, index, dayBookings, dateKey, day, patient);
        periodsList.appendChild(periodCard);
    });

    modal.classList.add('active');
}

function createPeriodCard(period, index, dayBookings, dateKey, day, patient = null) {
    const periodBookings = dayBookings.filter(b => b.periodIndex === index && !b.cancellation);
    const totalSlots = period.slots || 1;
    const availableSlots = totalSlots - periodBookings.length;
    const isFullyBooked = availableSlots <= 0;

    const periodCard = document.createElement('div');
    periodCard.className = `period-card ${isFullyBooked ? 'booked' : ''}`;
    periodCard.innerHTML = `
        <h3>${period.name}</h3>
        <p>${period.start} - ${period.end}</p>
        <p class="slots-info"><strong>Vagas disponíveis: ${availableSlots} de ${totalSlots}</strong></p>
    `;

    if (!isFullyBooked) {
        periodCard.addEventListener('click', () => {
            showBookingForm(dateKey, index, period, day, patient);
        });
    }

    return periodCard;
}

export function showBookingForm(dateKey, periodIndex, period, day, patientData = null) {
    const modal = document.getElementById('bookingModal');
    const title = document.getElementById('modalTitle');
    const periodsList = document.getElementById('periodsAvailable');

    const months = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 
                    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

    title.textContent = `Reservar: ${period.name}`;

    if (patientData) {
        // Patient is registered, show welcome and complaint form
        periodsList.innerHTML = `
            <div class="booking-form">
                <p class="booking-info">${day} de ${months[state.currentMonth]} de ${state.currentYear}</p>
                <p class="booking-info">${period.start} - ${period.end}</p>
                
                <div style="padding: 16px; background: #e8f5e9; border-radius: 8px; margin-bottom: 20px; text-align: center;">
                    <p style="font-size: 18px; font-weight: 600; color: #2e7d32; margin-bottom: 8px;">
                        Seja bem-vindo, ${patientData.name}!
                    </p>
                    <p style="font-size: 14px; color: #555;">
                        ${patientData.type === 'civil' ? 'CPF' : 'RE'}: ${patientData.type === 'civil' 
                            ? patientData.cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
                            : patientData.re}
                    </p>
                </div>
                
                <label for="bookingComplaint">Queixa (obrigatório):</label>
                <textarea id="bookingComplaint" placeholder="Descreva sua queixa (mínimo 10, máximo 100 caracteres)" minlength="10" maxlength="100" required style="text-transform: uppercase;"></textarea>
                <small style="color: #666; font-size: 12px;" id="complaintCounter">0/100 caracteres</small>
                
                <div class="booking-actions" style="margin-top: 20px;">
                    <button class="btn-secondary" id="cancelBooking">Cancelar</button>
                    <button class="btn-primary" id="confirmBooking" disabled>Confirmar Reserva</button>
                </div>
            </div>
        `;

        setupRegisteredPatientBookingHandlers(dateKey, periodIndex, day, patientData);
    } else {
        // Legacy flow - should not be used anymore
        window.showFmuNotice('Paciente não cadastrado. Procure o balcão para realizar o cadastro antes do agendamento.', 'Cadastro não encontrado');
        modal.classList.remove('active');
    }
}

function setupRegisteredPatientBookingHandlers(dateKey, periodIndex, day, patientData) {
    const complaintInput = document.getElementById('bookingComplaint');
    const complaintCounter = document.getElementById('complaintCounter');
    const confirmBtn = document.getElementById('confirmBooking');
    const cancelBtn = document.getElementById('cancelBooking');

    const validateForm = () => {
        const complaint = complaintInput.value.trim();
        confirmBtn.disabled = !(complaint.length >= 10 && complaint.length <= 100);
        confirmBtn.classList.toggle('booking-confirm-ready', !confirmBtn.disabled);
    };

    complaintInput.addEventListener('input', () => {
        complaintInput.value = complaintInput.value.toUpperCase();
        complaintCounter.textContent = `${complaintInput.value.length}/100 caracteres`;
        validateForm();
    });

    confirmBtn.addEventListener('click', () => {
        const complaint = complaintInput.value.trim();
        if (complaint.length < 10 || complaint.length > 100) return;

        const bookingData = {
            type: patientData.type,
            name: patientData.name,
            email: patientData.email,
            phone: patientData.phone,
            complaint
        };

        if (patientData.type === 'civil') {
            bookingData.cpf = patientData.cpf;
        } else {
            bookingData.re = patientData.re;
            bookingData.rank = patientData.rank;
            bookingData.unit = patientData.unit;
        }

        const duplicateMessage = buildDailyDuplicateMessage(patientData, dateKey);
        if (duplicateMessage) {
            window.showFmuNotice(duplicateMessage, 'Consulta já existente no dia');
            return;
        }

        const limitMessage = buildMonthlyLimitExceededMessage(patientData, dateKey);
        if (limitMessage) {
            window.showFmuNotice(limitMessage, 'Limite mensal excedido');
            return;
        }

        bookPeriod(dateKey, periodIndex, bookingData);
        document.getElementById('bookingModal').classList.remove('active');
        showConfirmationModal(dateKey, periodIndex, bookingData, day);
    });

    cancelBtn.addEventListener('click', () => {
        openBookingModal(day);
    });
}

function setupBookingFormHandlers(dateKey, periodIndex, day) {
    const nameInput = document.getElementById('bookingName');
    const docInput = document.getElementById('bookingDoc');
    const docLabel = document.getElementById('bookingDocLabel');
    const emailInput = document.getElementById('bookingEmail');
    const phoneInput = document.getElementById('bookingPhone');
    const complaintInput = document.getElementById('bookingComplaint');
    const complaintCounter = document.getElementById('complaintCounter');
    const confirmBtn = document.getElementById('confirmBooking');
    const cancelBtn = document.getElementById('cancelBooking');
    const patientTypeRadios = document.querySelectorAll('input[name="bookingPatientType"]');
    const rankField = document.getElementById('rankField');
    const rankSelect = document.getElementById('bookingRank');
    const militaryUnitField = document.getElementById('militaryUnitField');

    let currentType = 'civil';
    
    // Function to find previous booking data
    const findPreviousBooking = (type, doc) => {
        for (const [dateKey, bookings] of Object.entries(state.bookings)) {
            for (const booking of bookings) {
                if (type === 'civil' && booking.cpf === doc) {
                    return booking;
                } else if (type === 'militar' && booking.re === doc) {
                    return booking;
                }
            }
        }
        return null;
    };
    
    // Function to auto-fill form from previous booking
    const autoFillFromPrevious = () => {
        const doc = currentType === 'civil' 
            ? docInput.value.replace(/\D/g, '')
            : docInput.value.replace(/-/g, '').trim();
        
        const isComplete = currentType === 'civil' 
            ? doc.length === 11 
            : doc.length === 7;
        
        if (!isComplete) return;
        
        const previous = findPreviousBooking(currentType, doc);
        if (previous) {
            nameInput.value = previous.name || '';
            emailInput.value = previous.email || '';
            phoneInput.value = previous.phone || '';
            if (currentType === 'militar') {
                rankSelect.value = previous.rank || '';
                if (previous.unit) {
                    const unitRadio = document.querySelector(`input[name="militaryUnit"][value="${previous.unit}"]`);
                    if (unitRadio) unitRadio.checked = true;
                }
            }
            validateForm();
        }
    };

    const validateForm = () => {
        const complaint = complaintInput.value.trim();
        const complaintValid = complaint.length >= 10 && complaint.length <= 100;
        const ph = (phoneInput.value || '').trim();
        const email = emailInput.value.trim();
        const emailValid = email.length > 0 && email.includes('@');
        
        let docValid = false;
        let rankValid = true;
        let unitValid = true;
        
        if (currentType === 'civil') {
            const cpf = (docInput.value || '').replace(/\D/g, '');
            docValid = cpf.length === 11;
        } else {
            const re = (docInput.value || '').replace(/-/g, '');
            docValid = re.length === 7;
            rankValid = rankSelect.value !== '';
            const selectedUnit = document.querySelector('input[name="militaryUnit"]:checked');
            unitValid = !!selectedUnit;
        }
        
        confirmBtn.disabled = !(nameInput.value.trim().length > 0 && docValid && emailValid && ph.length === 11 && complaintValid && rankValid && unitValid);
        confirmBtn.classList.toggle('booking-confirm-ready', !confirmBtn.disabled);
    };

    const updateDocField = () => {
        const selectedType = document.querySelector('input[name="bookingPatientType"]:checked').value;
        const typeChanged = currentType !== selectedType;
        currentType = selectedType;
        
        if (selectedType === 'civil') {
            docLabel.textContent = 'CPF:';
            docInput.placeholder = '000.000.000-00';
            docInput.maxLength = 14;
            rankField.style.display = 'none';
            rankSelect.value = '';
            militaryUnitField.style.display = 'none';
            // uncheck unit radios
            document.querySelectorAll('input[name="militaryUnit"]').forEach(r => r.checked = false);
        } else {
            docLabel.textContent = 'RE (Registro):';
            docInput.placeholder = '000000-0';
            docInput.maxLength = 8;
            rankField.style.display = 'block';
            militaryUnitField.style.display = 'block';
        }
        if (typeChanged) docInput.value = '';
        validateForm();
    };

    patientTypeRadios.forEach(radio => {
        radio.addEventListener('change', updateDocField);
        radio.addEventListener('input', updateDocField);
        radio.addEventListener('click', updateDocField);
    });

    docInput.addEventListener('input', (e) => {
        if (currentType === 'civil') {
            let v = e.target.value.replace(/\D/g, '');
            if (v.length > 11) v = v.slice(0, 11);
            if (v.length > 9) v = v.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
            else if (v.length > 6) v = v.replace(/(\d{3})(\d{3})(\d{1,3})/, '$1.$2.$3');
            else if (v.length > 3) v = v.replace(/(\d{3})(\d{1,3})/, '$1.$2');
            e.target.value = v;
        } else {
            let raw = e.target.value.replace(/-/g, '').toUpperCase();
            if (raw.length > 7) raw = raw.slice(0, 7);
            
            // Format as xxxxxx-x
            let formatted = raw;
            if (raw.length > 6) {
                const digits = raw.slice(0, 6).replace(/\D/g, '');
                const lastChar = raw.slice(6, 7);
                formatted = digits + '-' + lastChar;
            } else {
                formatted = raw.replace(/\D/g, '');
            }
            e.target.value = formatted;
        }
        autoFillFromPrevious();
        validateForm();
    });

    phoneInput.addEventListener('input', (e) => {
        e.target.value = e.target.value.replace(/\D/g, '');
        validateForm();
    });

    nameInput.addEventListener('input', () => {
        nameInput.value = nameInput.value.toUpperCase();
        validateForm();
    });
    
    emailInput.addEventListener('input', validateForm);
    
    complaintInput.addEventListener('input', () => {
        complaintInput.value = complaintInput.value.toUpperCase();
        complaintCounter.textContent = `${complaintInput.value.length}/100 caracteres`;
        validateForm();
    });

    // Set up event listeners that depend on validateForm
    rankSelect.addEventListener('change', validateForm);
    document.querySelectorAll('input[name="militaryUnit"]').forEach(r => r.addEventListener('change', validateForm));

    confirmBtn.disabled = true;
    confirmBtn.classList.remove('booking-confirm-ready');
    validateForm();

    confirmBtn.addEventListener('click', () => {
        const complaint = complaintInput.value.trim();
        if (complaint.length < 10 || complaint.length > 100) return;
        
        const phone = phoneInput.value.trim();
        const email = emailInput.value.trim();
        if (!(nameInput.value.trim() && email && phone.length === 11)) return;
        
        let bookingData = {
            type: currentType,
            name: nameInput.value.trim(),
            email,
            phone,
            complaint
        };
        
        if (currentType === 'civil') {
            bookingData.cpf = docInput.value.replace(/\D/g, '');
        } else {
            bookingData.re = docInput.value.replace(/-/g, '');
            bookingData.rank = rankSelect.value;
            const selectedUnit = document.querySelector('input[name="militaryUnit"]:checked');
            bookingData.unit = selectedUnit ? selectedUnit.value : null;
        }

        const duplicateMessage = buildDailyDuplicateMessage(bookingData, dateKey);
        if (duplicateMessage) {
            window.showFmuNotice(duplicateMessage, 'Consulta já existente no dia');
            return;
        }

        const limitMessage = buildMonthlyLimitExceededMessage(bookingData, dateKey);
        if (limitMessage) {
            window.showFmuNotice(limitMessage, 'Limite mensal excedido');
            return;
        }
        
        bookPeriod(dateKey, periodIndex, bookingData);
        document.getElementById('bookingModal').classList.remove('active');
        showConfirmationModal(dateKey, periodIndex, bookingData, day);
    });

    cancelBtn.addEventListener('click', () => {
        openBookingModal(day);
    });
}

function bookPeriod(dateKey, periodIndex, bookingData) {
    if (!state.bookings[dateKey]) {
        state.bookings[dateKey] = [];
    }
    state.bookings[dateKey].push({
        periodIndex,
        ...bookingData,
        timestamp: new Date().toISOString()
    });
    saveState();
    window.dispatchEvent(new CustomEvent('stateUpdated'));
}

export function showConfirmationModal(dateKey, periodIndex, bookingData, day) {
    const modal = document.getElementById('confirmationModal');
    const detailsDiv = document.getElementById('confirmationDetails');
    
    const [year, month, dayNum] = dateKey.split('-').map(Number);
    const months = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 
                    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
    
    const key = `${year}-${month}`;
    const customConfig = state.customDayConfigurations && state.customDayConfigurations[dateKey];
    const monthConfig = state.configurations[key];
    let config = null;
    if (customConfig) {
        config = customConfig;
    } else if (monthConfig && monthConfig.daysConfig) {
        const dayOfWeek = new Date(year, month, dayNum).getDay();
        config = monthConfig.daysConfig[dayOfWeek] || null;
    }
    const period = config?.periods[periodIndex];
    
    if (!period) return;
    
    const formattedDoc = bookingData.cpf 
        ? bookingData.cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
        : bookingData.re || 'N/A';
    const docLabel = bookingData.type === 'civil' ? 'CPF' : 'RE';
    
    detailsDiv.innerHTML = `
        <div class="email-status-card" id="emailSendStatus">
            <p class="email-status-title">✉️ Preparando envio automático do comprovante para:</p>
            <p class="email-status-address">${bookingData.email}</p>
        </div>
        
        <h3>Comprovante de Agendamento</h3>
        <p><strong>Tipo:</strong> ${bookingData.type === 'civil' ? 'Civil' : 'Militar'}</p>
        ${bookingData.rank ? `<p><strong>Graduação:</strong> ${bookingData.rank}</p>` : ''}
        ${bookingData.unit ? `<p><strong>Unidade:</strong> ${bookingData.unit === 'copom' ? 'COPOM' : 'Outros'}</p>` : ''}
        <p><strong>Data:</strong> ${dayNum} de ${months[month]} de ${year}</p>
        <p><strong>Período:</strong> ${period.name}</p>
        <p><strong>Horário:</strong> ${period.start} - ${period.end}</p>
        <p><strong>Paciente:</strong> ${bookingData.name}</p>
        <p><strong>${docLabel}:</strong> ${formattedDoc}</p>
        <p><strong>Email:</strong> ${bookingData.email}</p>
        <p><strong>WhatsApp:</strong> ${bookingData.phone}</p>
        <p><strong>Queixa:</strong> ${bookingData.complaint}</p>
        <p><strong>Confirmado em:</strong> ${new Date().toLocaleString('pt-BR')}</p>
    `;
    
    // Store booking info for sharing and email sending
    const bookingInfo = {
        type: bookingData.type === 'civil' ? 'Civil' : 'Militar',
        date: `${dayNum} de ${months[month]} de ${year}`,
        period: period.name,
        time: `${period.start} - ${period.end}`,
        name: bookingData.name,
        doc: formattedDoc,
        docLabel,
        email: bookingData.email,
        phone: bookingData.phone,
        complaint: bookingData.complaint,
        rank: bookingData.rank || null,
        unit: bookingData.unit || null,
        timestamp: new Date().toLocaleString('pt-BR')
    };

    modal.dataset.bookingInfo = JSON.stringify(bookingInfo);
    
    modal.classList.add('active');
    updateEmailStatus('sending', `Enviando comprovante para ${bookingInfo.email}...`);
    showEmailSendingOverlay(true);
    sendBookingConfirmationEmail(bookingInfo).then((result) => {
        if (result.ok) {
            updateEmailStatus('success', `Comprovante enviado automaticamente para ${bookingInfo.email}.`);
            return;
        }

        const reason = result.reason || 'Não foi possível enviar o e-mail automático.';
        updateEmailStatus(result.skipped ? 'warning' : 'error', reason);
    }).catch((error) => {
        console.error('Erro inesperado ao enviar comprovante:', error);
        updateEmailStatus('error', 'Não foi possível enviar o e-mail automático.');
    }).finally(() => {
        showEmailSendingOverlay(false);
    });
}

function showEmailSendingOverlay(isVisible) {
    const overlay = document.getElementById('emailSendingOverlay');
    if (!overlay) return;

    if (isVisible) {
        overlay.hidden = false;
        requestAnimationFrame(() => overlay.classList.add('active'));
        return;
    }

    overlay.classList.remove('active');
    window.setTimeout(() => {
        if (!overlay.classList.contains('active')) {
            overlay.hidden = true;
        }
    }, 240);
}

function updateEmailStatus(status, message) {
    const statusCard = document.getElementById('emailSendStatus');
    if (!statusCard) return;

    statusCard.classList.remove('email-status-sending', 'email-status-success', 'email-status-warning', 'email-status-error');
    statusCard.classList.add(`email-status-${status}`);

    const iconByStatus = {
        sending: '✉️',
        success: '✅',
        warning: '⚠️',
        error: '❌'
    };

    statusCard.innerHTML = `
        <p class="email-status-title">${iconByStatus[status] || '✉️'} ${message}</p>
        <p class="email-status-hint">Também é possível compartilhar manualmente pelos botões abaixo.</p>
    `;
}

export function showReport(filterDate = null) {
    const reportModal = document.getElementById('reportModal');
    const reportContent = document.getElementById('reportContent');
    const dateFilter = document.getElementById('reportDateFilter');

    const months = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 
                    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

    let html = '';
    let bookingEntries = Object.entries(state.bookings).sort();

    // Apply date filter if provided
    if (filterDate) {
        const [filterYear, filterMonth, filterDay] = filterDate.split('-').map(Number);
        bookingEntries = bookingEntries.filter(([dateKey]) => {
            const [year, month, day] = dateKey.split('-').map(Number);
            return year === filterYear && month === (filterMonth - 1) && day === filterDay;
        });
        
        if (bookingEntries.length === 0) {
            html = '<p class="no-bookings">Nenhuma reserva encontrada para a data selecionada.</p>';
        }
    } else if (bookingEntries.length === 0) {
        html = '<p class="no-bookings">Nenhuma reserva encontrada.</p>';
    }

    if (bookingEntries.length > 0) {
        // Add action buttons
        html += `
            <div style="margin-bottom: 20px; display: flex; gap: 12px; flex-wrap: wrap;">
                <button id="shareReportWhatsApp" class="btn-secondary">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" style="vertical-align: middle; margin-right: 6px;">
                        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884"/>
                    </svg>
                    Compartilhar WhatsApp
                </button>
                <button id="generateReportPDF" class="btn-secondary">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align: middle; margin-right: 6px;">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                        <polyline points="7 10 12 15 17 10"></polyline>
                        <line x1="12" y1="15" x2="12" y2="3"></line>
                    </svg>
                    Gerar PDF
                </button>
            </div>
        `;
        
        bookingEntries.forEach(([dateKey, bookings]) => {
            html += generateReportDateGroup(dateKey, bookings, months);
        });
    }

    reportContent.innerHTML = html;

    reportContent.querySelectorAll('.btn-cancel').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const dateKey = e.target.dataset.date;
            const bookingIndex = parseInt(e.target.dataset.index);
            window.dispatchEvent(new CustomEvent('showCancellationModal', { 
                detail: { dateKey, bookingIndex } 
            }));
        });
    });

    // Add event listeners for share/PDF buttons
    const shareWhatsAppBtn = document.getElementById('shareReportWhatsApp');
    const generatePDFBtn = document.getElementById('generateReportPDF');
    
    if (shareWhatsAppBtn) {
        shareWhatsAppBtn.addEventListener('click', () => {
            shareReportWhatsApp(bookingEntries, filterDate);
        });
    }
    
    if (generatePDFBtn) {
        generatePDFBtn.addEventListener('click', () => {
            generateReportPDF(bookingEntries, filterDate);
        });
    }

    reportModal.classList.add('active');
}

function generateReportDateGroup(dateKey, bookings, months) {
    const [year, month, day] = dateKey.split('-').map(Number);
    const monthConfig = state.configurations[`${year}-${month}`];

    let html = `<div class="report-date-group">
        <h3>${day} de ${months[month]} de ${year}</h3>
        <div class="report-bookings">`;

    bookings.forEach((booking, bookingIndex) => {
        const customConfig = state.customDayConfigurations && state.customDayConfigurations[dateKey];
        let config = null;
        if (customConfig) {
            config = customConfig;
        } else if (monthConfig && monthConfig.daysConfig) {
            const dayOfWeek = new Date(year, month, day).getDay();
            config = monthConfig.daysConfig[dayOfWeek] || null;
        }
        const period = config?.periods[booking.periodIndex];
        const periodName = period ? period.name : 'Período desconhecido';
        const periodTime = period ? `${period.start} - ${period.end}` : '';

        html += generateBookingCard(booking, periodName, periodTime, dateKey, bookingIndex);
    });

    html += `</div></div>`;
    return html;
}

function shareReportWhatsApp(bookingEntries, filterDate) {
    const months = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 
                    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
    
    let message = '📋 *RELATÓRIO DE AGENDAMENTOS - FISIOTERAPIA*\n\n';
    
    if (filterDate) {
        const [year, month, day] = filterDate.split('-').map(Number);
        message += `📅 Data: ${day} de ${months[month - 1]} de ${year}\n\n`;
    } else {
        message += '📅 Todos os Agendamentos\n\n';
    }
    
    bookingEntries.forEach(([dateKey, bookings]) => {
        const [year, month, day] = dateKey.split('-').map(Number);
        message += `*${day}/${String(month + 1).padStart(2, '0')}/${year}*\n`;
        
        bookings.forEach((booking, index) => {
            const configKey = `${year}-${month}`;
            const customConfig = state.customDayConfigurations && state.customDayConfigurations[dateKey];
            const monthConfig = state.configurations[configKey];
            let config = null;
            if (customConfig) {
                config = customConfig;
            } else if (monthConfig && monthConfig.daysConfig) {
                const dayOfWeek = new Date(year, month, day).getDay();
                config = monthConfig.daysConfig[dayOfWeek] || null;
            }
            const period = config?.periods[booking.periodIndex];
            
            if (period) {
                message += `\n${index + 1}. ${period.name} (${period.start}-${period.end})\n`;
                message += `   Paciente: ${booking.name}\n`;
                message += `   WhatsApp: ${booking.phone}\n`;
                if (booking.cancellation) {
                    message += `   ❌ CANCELADO\n`;
                }
            }
        });
        message += '\n';
    });
    
    const encodedMessage = encodeURIComponent(message);
    window.open(`https://wa.me/?text=${encodedMessage}`, '_blank');
}

function generateReportPDF(bookingEntries, filterDate) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    
    const months = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 
                    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
    
    // Title
    doc.setFontSize(18);
    doc.setFont(undefined, 'bold');
    doc.text('Relatório de Agendamentos - Fisioterapia', 105, 20, { align: 'center' });
    
    // Subtitle
    doc.setFontSize(12);
    doc.setFont(undefined, 'normal');
    if (filterDate) {
        const [year, month, day] = filterDate.split('-').map(Number);
        doc.text(`Data: ${day} de ${months[month - 1]} de ${year}`, 105, 30, { align: 'center' });
    } else {
        doc.text('Todos os Agendamentos', 105, 30, { align: 'center' });
    }
    
    let yPosition = 45;
    
    bookingEntries.forEach(([dateKey, bookings]) => {
        const [year, month, day] = dateKey.split('-').map(Number);
        
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
        
        bookings.forEach((booking, index) => {
            const configKey = `${year}-${month}`;
            const customConfig = state.customDayConfigurations && state.customDayConfigurations[dateKey];
            const monthConfig = state.configurations[configKey];
            let config = null;
            if (customConfig) {
                config = customConfig;
            } else if (monthConfig && monthConfig.daysConfig) {
                const dayOfWeek = new Date(year, month, day).getDay();
                config = monthConfig.daysConfig[dayOfWeek] || null;
            }
            const period = config?.periods[booking.periodIndex];
            
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
            
            const formattedDoc = booking.cpf 
                ? booking.cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
                : booking.re || 'N/A';
            const docLabel = booking.type === 'militar' ? 'RE' : 'CPF';
            doc.text(`${docLabel}: ${formattedDoc}`, 25, yPosition);
            yPosition += 5;
            
            doc.text(`WhatsApp: ${booking.phone}`, 25, yPosition);
            yPosition += 5;
            
            if (booking.complaint) {
                const complaint = doc.splitTextToSize(`Queixa: ${booking.complaint}`, 160);
                doc.text(complaint, 25, yPosition);
                yPosition += (complaint.length * 5);
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
                doc.text(`Cancelado em: ${new Date(booking.cancellation.timestamp).toLocaleString('pt-BR')}`, 25, yPosition);
                yPosition += 5;
            }
            
            doc.setTextColor(0);
            yPosition += 3;
        });
        
        yPosition += 5;
    });
    
    // Save PDF
    const fileName = filterDate 
        ? `relatorio_${filterDate}.pdf` 
        : `relatorio_completo_${new Date().toISOString().split('T')[0]}.pdf`;
    doc.save(fileName);
}

function generateBookingCard(booking, periodName, periodTime, dateKey, bookingIndex) {
    const cleanPhone = booking.phone.replace(/\D/g, '');
    const whatsappLink = `https://wa.me/55${cleanPhone}`;
    const formattedDoc = booking.cpf 
        ? booking.cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
        : booking.re || 'N/A';
    const docLabel = booking.type === 'militar' ? 'RE' : 'CPF';
    const patientType = booking.type === 'militar' ? 'Militar' : 'Civil';
    
    const consultationDesc = booking.consultationDescription || '';
    const isAdminSearch = document.getElementById('searchBookingsModal').classList.contains('active');
    
    return `
        <div class="report-booking-card" style="page-break-inside: avoid;">
            <table style="width: 100%; border-collapse: collapse;">
                <tr style="background: var(--bg-primary);">
                    <td colspan="2" style="padding: 12px; border-bottom: 2px solid var(--border-color);">
                        <strong style="font-size: 16px;">${periodName}</strong>
                        <span style="float: right; color: var(--text-secondary);">${periodTime}</span>
                    </td>
                </tr>
                <tr>
                    <td style="padding: 8px; width: 30%; font-weight: 600;">Tipo:</td>
                    <td style="padding: 8px;">${patientType}</td>
                </tr>
                ${booking.rank ? `
                <tr>
                    <td style="padding: 8px; width: 30%; font-weight: 600;">Graduação:</td>
                    <td style="padding: 8px;">${booking.rank}</td>
                </tr>
                ` : ''}
                <tr>
                    <td style="padding: 8px; width: 30%; font-weight: 600;">Paciente:</td>
                    <td style="padding: 8px;">${booking.name}</td>
                </tr>
                <tr>
                    <td style="padding: 8px; width: 30%; font-weight: 600;">${docLabel}:</td>
                    <td style="padding: 8px;">${formattedDoc}</td>
                </tr>
                ${booking.email ? `
                <tr>
                    <td style="padding: 8px; width: 30%; font-weight: 600;">Email:</td>
                    <td style="padding: 8px;">${booking.email}</td>
                </tr>
                ` : ''}
                <tr>
                    <td style="padding: 8px; width: 30%; font-weight: 600;">WhatsApp:</td>
                    <td style="padding: 8px;">
                        <a href="${whatsappLink}" target="_blank" class="whatsapp-link">${booking.phone}</a>
                        <a href="${whatsappLink}" target="_blank" class="whatsapp-icon" title="Abrir WhatsApp">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884"/></svg>
                        </a>
                    </td>
                </tr>
                ${booking.complaint ? `
                <tr>
                    <td style="padding: 8px; width: 30%; font-weight: 600; vertical-align: top;">Queixa:</td>
                    <td style="padding: 8px;">${booking.complaint}</td>
                </tr>
                ` : ''}
                ${isAdminSearch ? `
                <tr>
                    <td style="padding: 8px; width: 30%; font-weight: 600; vertical-align: top;">Descrição da Consulta:</td>
                    <td style="padding: 8px;">
                        <textarea 
                            id="consultDesc_${dateKey}_${bookingIndex}" 
                            placeholder="Descreva o que foi feito nesta consulta..."
                            style="width: 100%; min-height: 60px; padding: 8px; border: 2px solid var(--border-color); background: var(--bg-secondary); color: var(--text-primary); border-radius: 8px; font-size: 14px; font-family: 'Noto Sans', sans-serif;"
                        >${consultationDesc}</textarea>
                        <button class="btn-primary" style="margin-top: 8px; padding: 6px 12px; font-size: 13px;" onclick="saveConsultationDescription('${dateKey}', ${bookingIndex})">Salvar Descrição</button>
                    </td>
                </tr>
                ` : ''}
                <tr style="border-top: 1px solid var(--border-color);">
                    <td colspan="2" style="padding: 8px; font-size: 12px; color: var(--text-secondary);">
                        Reservado em: ${new Date(booking.timestamp).toLocaleString('pt-BR')}
                    </td>
                </tr>
                ${booking.cancellation ? `
                <tr style="background: #ffebee;">
                    <td colspan="2" style="padding: 12px; border-left: 4px solid #f44336;">
                        <strong style="color: #f44336;">CANCELADO</strong><br>
                        Motivo: ${booking.cancellation.reason}<br>
                        Solicitado por: ${booking.cancellation.requestedBy}<br>
                        Cancelado em: ${new Date(booking.cancellation.timestamp).toLocaleString('pt-BR')}
                    </td>
                </tr>
                ` : `
                <tr>
                    <td colspan="2" style="padding: 12px; text-align: center;">
                        <button class="btn-cancel" data-date="${dateKey}" data-index="${bookingIndex}">Cancelar Reserva</button>
                    </td>
                </tr>
                `}
            </table>
        </div>
    `;
}

export function showSearchBookings() {
    const modal = document.getElementById('searchBookingsModal');
    const docInput = document.getElementById('searchCpf');
    const docLabel = document.getElementById('searchDocLabel');
    const searchTypeRadios = document.querySelectorAll('input[name="adminSearchType"]');
    
    let currentType = 'civil';
    
    const updateDocField = () => {
        const selectedType = document.querySelector('input[name="adminSearchType"]:checked').value;
        const typeChanged = currentType !== selectedType;
        currentType = selectedType;
        
        if (selectedType === 'civil') {
            docLabel.textContent = 'CPF do Paciente:';
            docInput.placeholder = '000.000.000-00';
            docInput.maxLength = 14;
        } else {
            docLabel.textContent = 'RE do Paciente:';
            docInput.placeholder = '000000-0';
            docInput.maxLength = 8;
        }
        if (typeChanged) docInput.value = '';
    };
    
    searchTypeRadios.forEach(radio => {
        radio.addEventListener('change', updateDocField);
        radio.addEventListener('input', updateDocField);
        radio.addEventListener('click', updateDocField);
    });
    
    docInput.addEventListener('input', (e) => {
        const selectedType = document.querySelector('input[name="adminSearchType"]:checked').value;
        
        if (selectedType === 'civil') {
            let v = e.target.value.replace(/\D/g, '');
            if (v.length > 11) v = v.slice(0, 11);
            if (v.length > 9) v = v.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
            else if (v.length > 6) v = v.replace(/(\d{3})(\d{3})(\d{1,3})/, '$1.$2.$3');
            else if (v.length > 3) v = v.replace(/(\d{3})(\d{1,3})/, '$1.$2');
            e.target.value = v;
        } else {
            let raw = e.target.value.replace(/-/g, '').toUpperCase();
            if (raw.length > 7) raw = raw.slice(0, 7);
            
            let formatted = raw;
            if (raw.length > 6) {
                const digits = raw.slice(0, 6).replace(/\D/g, '');
                const lastChar = raw.slice(6, 7);
                formatted = digits + '-' + lastChar;
            } else {
                formatted = raw.replace(/\D/g, '');
            }
            e.target.value = formatted;
        }
    });
    
    docInput.addEventListener('blur', () => {
        const selectedType = document.querySelector('input[name="adminSearchType"]:checked').value;
        validateIncompleteSearchDocument(docInput.value, selectedType, 'Pesquisar Agendamentos');
    });

    modal.classList.add('active');
    docInput.value = '';
    document.getElementById('searchResults').innerHTML = '';
}

function getSearchBookingPeriod(dateKey, booking) {
    const [year, month, day] = dateKey.split('-').map(Number);
    const customConfig = state.customDayConfigurations && state.customDayConfigurations[dateKey];
    const monthConfig = state.configurations && state.configurations[`${year}-${month}`];
    let config = customConfig || null;
    if (!config && monthConfig && monthConfig.daysConfig) {
        const dayOfWeek = new Date(year, month, day).getDay();
        config = monthConfig.daysConfig[dayOfWeek] || null;
    }
    if (!config && monthConfig && monthConfig.periods) config = monthConfig;
    return config?.periods?.[booking.periodIndex] || null;
}

export function searchBookingsByCpf() {
    const docInput = document.getElementById('searchCpf');
    const searchResults = document.getElementById('searchResults');
    const filterValue = document.querySelector('input[name="bookingFilter"]:checked').value;
    const searchType = document.querySelector('input[name="adminSearchType"]:checked').value;
    
    let searchDoc = '';
    
    if (searchType === 'civil') {
        searchDoc = docInput.value.replace(/\D/g, '');
        if (searchDoc.length !== 11) {
            searchResults.innerHTML = '<p class="no-bookings">CPF deve conter 11 dígitos.</p>';
            return;
        }
    } else {
        searchDoc = docInput.value.replace(/-/g, '').trim();
        if (searchDoc.length !== 7) {
            searchResults.innerHTML = '<p class="no-bookings">RE deve conter 6 números e o dígito final letra ou número.</p>';
            return;
        }
    }
    
    const months = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 
                    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
    
    let foundBookings = [];
    
    // Get current date and time
    const now = new Date();
    
    // Search through all bookings
    Object.entries(state.bookings || {}).forEach(([dateKey, bookings]) => {
        const bookingList = Array.isArray(bookings) ? bookings : Object.values(bookings || {});
        bookingList.forEach((booking, index) => {
            const matches = searchType === 'civil'
                ? (booking.cpf && booking.cpf.replace(/\D/g, '') === searchDoc)
                : (booking.re && booking.re.toUpperCase() === searchDoc.toUpperCase());
            
            if (matches) {
                const [year, month, day] = dateKey.split('-').map(Number);
                const period = getSearchBookingPeriod(dateKey, booking);
                
                // Determine booking status
                const isCancelled = !!booking.cancellation;
                
                let isActive = false;
                let isCompleted = false;
                
                if (!isCancelled && period) {
                    // Parse end time of the period
                    const [endHour, endMinute] = period.end.split(':').map(Number);
                    const bookingEndDateTime = new Date(year, month, day, endHour, endMinute);
                    
                    // Active means the end time hasn't passed yet
                    isActive = now < bookingEndDateTime;
                    // Completed means the end time has passed
                    isCompleted = now >= bookingEndDateTime;
                }
                
                // Apply filter
                let includeBooking = false;
                if (filterValue === 'all') includeBooking = true;
                else if (filterValue === 'active' && isActive) includeBooking = true;
                else if (filterValue === 'completed' && isCompleted) includeBooking = true;
                else if (filterValue === 'cancelled' && isCancelled) includeBooking = true;
                
                if (includeBooking) {
                    foundBookings.push({ dateKey, booking, bookingIndex: index });
                }
            }
        });
    });
    
    if (foundBookings.length === 0) {
        const docType = searchType === 'civil' ? 'CPF' : 'RE';
        searchResults.innerHTML = `<p class="no-bookings">Nenhum agendamento encontrado para este ${docType} com o filtro selecionado.</p>`;
        return;
    }
    
    // Sort by date (newest first)
    foundBookings.sort((a, b) => b.dateKey.localeCompare(a.dateKey));
    
    let html = '<div class="report-content">';
    
    foundBookings.forEach(({ dateKey, booking, bookingIndex }) => {
        const [year, month, day] = dateKey.split('-').map(Number);
        const period = getSearchBookingPeriod(dateKey, booking);
        
        if (!period) return;
        
        const periodName = period.name;
        const periodTime = `${period.start} - ${period.end}`;
        
        html += `<div class="report-date-group">
            <h3>${day} de ${months[month]} de ${year}</h3>
            <div class="report-bookings">`;
        
        html += generateBookingCard(booking, periodName, periodTime, dateKey, bookingIndex);
        
        html += `</div></div>`;
    });
    
    html += '</div>';
    searchResults.innerHTML = html;
    
    // Add cancel button handlers
    searchResults.querySelectorAll('.btn-cancel').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const dateKey = e.target.dataset.date;
            const bookingIndex = parseInt(e.target.dataset.index);
            window.dispatchEvent(new CustomEvent('showCancellationModal', { 
                detail: { dateKey, bookingIndex } 
            }));
        });
    });
}

// Global function to save consultation description
window.saveConsultationDescription = function(dateKey, bookingIndex) {
    const textarea = document.getElementById(`consultDesc_${dateKey}_${bookingIndex}`);
    const description = textarea.value.trim();
    
    if (state.bookings[dateKey] && state.bookings[dateKey][bookingIndex]) {
        state.bookings[dateKey][bookingIndex].consultationDescription = description;
        saveState();
        window.showFmuNotice('Descrição da consulta salva com sucesso!', 'Sucesso');
    }
};
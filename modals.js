// Modal management module
import { state, saveState } from './state.js';
import { renderBlockedCalendar, renderCalendar } from './calendar.js';
import { renderCustomizeCalendar } from './admin.js';
import { sendUserTemporaryPasswordEmail } from './emailjs-service.js';
import { buscarPolicialMilitarPorRe } from './pm-service.js';

export function renderRegisteredPatientsList() {
    const listDiv = document.getElementById('registeredPatientsList');
    if (!listDiv) return;
    if (listDiv.style && listDiv.style.display === 'none') {
        listDiv.innerHTML = '';
        return;
    }

    if (!state.registeredPatients || Object.keys(state.registeredPatients).length === 0) {
        listDiv.innerHTML = '<p style="color: var(--text-secondary); font-style: italic;">Nenhum paciente cadastrado.</p>';
        return;
    }

    const entries = Object.entries(state.registeredPatients).sort((a, b) => {
        const dateA = a[1].createdAt || a[1].updatedAt || '';
        const dateB = b[1].createdAt || b[1].updatedAt || '';
        return String(dateB).localeCompare(String(dateA));
    });

    const visibleEntries = entries.slice(0, 3);
    let html = '<p class="recent-patients-note">Exibindo apenas os 3 últimos pacientes cadastrados. Para localizar outros, use o campo Procurar Paciente por CPF ou RE.</p>';
    html += '<div style="max-height: 400px; overflow-y: auto;">';
    visibleEntries.forEach(([id, patient]) => {
        const docLabel = patient.type === 'civil' ? 'CPF' : 'RE';
        const doc = patient.type === 'civil'
            ? formatCpf(patient.cpf)
            : formatRe(patient.re);

        html += `
            <div style="padding: 12px; margin-bottom: 8px; border: 2px solid var(--border-color); border-radius: 8px; background: var(--bg-primary);">
                <div style="display: flex; justify-content: space-between; gap: 12px; align-items: center; flex-wrap: wrap;">
                    <div>
                        <strong>${escapeHtml(patient.name || '')}</strong><br>
                        <small>${docLabel}: ${escapeHtml(doc)} | Email: ${escapeHtml(patient.email || '')} | WhatsApp: ${escapeHtml(patient.phone || '')}</small>
                        ${patient.rank ? `<br><small>Graduação: ${escapeHtml(patient.rank)}</small>` : ''}
                        ${patient.unit ? `<br><small>Unidade: ${escapeHtml(patient.unit === 'copom' ? 'COPOM' : 'Outros')}</small>` : ''}
                    </div>
                    <div class="patient-card-actions">
                        <button class="btn-secondary" style="margin: 0; padding: 8px 16px; font-size: 13px;" onclick="editPatient('${id}')">Editar</button>
                        <button class="btn-danger" style="margin: 0; padding: 8px 16px; font-size: 13px;" onclick="deletePatient('${id}')">Excluir</button>
                    </div>
                </div>
            </div>
        `;
    });
    html += '</div>';

    listDiv.innerHTML = html;
}

function removeBookingsForPatient(patient) {
    if (!patient || !state.bookings) return 0;
    const docInfo = getPatientDocInfo(patient);
    const targetDoc = normalizeCpfReRaw(docInfo.raw);
    let removed = 0;

    Object.keys(state.bookings || {}).forEach((dateKey) => {
        const bookings = state.bookings[dateKey] || [];
        const kept = bookings.filter((booking) => {
            const bookingDoc = patient.type === 'civil'
                ? normalizeCpf(booking.cpf)
                : normalizeReValue(booking.re);
            const shouldRemove = bookingDoc === targetDoc;
            if (shouldRemove) removed += 1;
            return !shouldRemove;
        });

        if (kept.length) {
            state.bookings[dateKey] = kept;
        } else {
            delete state.bookings[dateKey];
        }
    });

    return removed;
}

window.deletePatient = async function(patientId) {
    const patient = state.registeredPatients?.[patientId];
    if (!patient) return;

    const confirmed = await window.showFmuConfirm('Tem certeza que deseja excluir este paciente? O histórico de consultas dele também será excluído.', 'Excluir paciente', 'Excluir', 'Cancelar');
    if (confirmed) {
        const removedBookings = removeBookingsForPatient(patient);
        delete state.registeredPatients[patientId];
        saveState();
        renderRegisteredPatientsList();
        clearAdminPatientRecordArea();
        renderCalendar();
        window.showFmuNotice(removedBookings ? 'Paciente excluído e histórico de consultas removido.' : 'Paciente excluído com sucesso.', 'Exclusão concluída');
    }
};

window.editPatient = function(patientId) {
    const patient = state.registeredPatients?.[patientId];
    if (!patient) return;

    const docInput = document.getElementById('regDoc');
    const nameInput = document.getElementById('regName');
    const emailInput = document.getElementById('regEmail');
    const phoneInput = document.getElementById('regPhone');
    const rankInput = document.getElementById('regRank');

    if (docInput) {
        docInput.value = patient.type === 'civil' ? formatCpf(patient.cpf) : formatRe(patient.re);
        docInput.dataset.updatePatientId = patientId;
        docInput.dispatchEvent(new Event('input', { bubbles: true }));
    }
    if (nameInput) nameInput.value = patient.name || '';
    if (emailInput) emailInput.value = patient.email || '';
    if (phoneInput) phoneInput.value = patient.phone || '';
    if (rankInput) rankInput.value = patient.rank || '';
    document.querySelectorAll('input[name="regMilitaryUnit"]').forEach(r => {
        r.checked = patient.unit === r.value;
    });

    const saveBtn = document.getElementById('savePatientRegistration');
    if (saveBtn) saveBtn.disabled = false;
    document.querySelector('.patient-form-title')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
};


function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function formatCpf(value) {
    const digits = String(value || '').replace(/\D/g, '');
    return digits.length === 11
        ? digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
        : digits;
}

function formatRe(value) {
    const raw = normalizeReValue(value);
    return raw.length > 6 ? `${raw.slice(0, 6)}-${raw.slice(6, 7)}` : raw;
}

function getPatientDocInfo(patient) {
    const isCivil = patient.type === 'civil';
    const raw = isCivil ? String(patient.cpf || '') : String(patient.re || '').toUpperCase();
    return {
        label: isCivil ? 'CPF' : 'RE',
        raw,
        formatted: isCivil ? formatCpf(raw) : formatRe(raw)
    };
}

function getPatientIdFromData(patient) {
    if (!patient) return '';
    return patient.type === 'civil'
        ? `civil_${String(patient.cpf || '').replace(/\D/g, '')}`
        : `militar_${String(patient.re || '').replace(/-/g, '').toUpperCase()}`;
}

function getUnitLabel(unit) {
    if (!unit) return '';
    return unit === 'copom' ? 'COPOM' : 'Outros';
}

function normalizeAdminPatientSearch(value) {
    return normalizeCpfReRaw(value);
}

function findAdminPatientMatches(query) {
    const normalized = normalizeAdminPatientSearch(query);
    if (!normalized || normalized.length < 3) return [];

    const patients = Object.entries(state.registeredPatients || {});
    return patients.filter(([id, patient]) => {
        const doc = getPatientDocInfo(patient);
        const rawDoc = normalizeCpfReRaw(doc.raw);
        const rawDocDigits = String(doc.raw || '').replace(/\D/g, '');
        const normalizedDigits = normalized.replace(/\D/g, '');
        return rawDoc.includes(normalized) || (normalizedDigits && rawDocDigits.includes(normalizedDigits));
    });
}

function clearAdminPatientRecordArea() {
    const input = document.getElementById('adminPatientSearchInput');
    const results = document.getElementById('adminPatientSearchResults');
    const details = document.getElementById('adminPatientDetails');
    if (input) input.value = '';
    if (results) results.innerHTML = '';
    if (details) details.innerHTML = '';
}

function renderAdminPatientSearchResults(matches) {
    const results = document.getElementById('adminPatientSearchResults');
    const details = document.getElementById('adminPatientDetails');
    if (!results) return;
    if (details) details.innerHTML = '';

    if (!matches.length) {
        results.innerHTML = '<p class="no-bookings" style="padding: 18px;">Nenhum paciente encontrado para o CPF ou RE informado.</p>';
        return;
    }

    results.innerHTML = matches.map(([id, patient]) => {
        const doc = getPatientDocInfo(patient);
        return `
            <div class="patient-record-result-item" onclick="window.selectAdminPatient('${id}')">
                <strong>${escapeHtml(patient.name)}</strong><br>
                <small>${doc.label}: ${escapeHtml(doc.formatted)} | Email: ${escapeHtml(patient.email || '')} | WhatsApp: ${escapeHtml(patient.phone || '')}</small>
                ${patient.rank ? `<br><small>Graduação: ${escapeHtml(patient.rank)}</small>` : ''}
                ${patient.unit ? `<br><small>Unidade: ${escapeHtml(getUnitLabel(patient.unit))}</small>` : ''}
            </div>
        `;
    }).join('');
}

function getBookingPeriodInfo(dateKey, booking) {
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

function getPatientBookingsForRecord(patient) {
    const doc = getPatientDocInfo(patient);
    const rawDoc = String(doc.raw || '').replace(/-/g, '').toUpperCase();
    const results = [];

    Object.entries(state.bookings || {}).forEach(([dateKey, bookings]) => {
        (bookings || []).forEach((booking, bookingIndex) => {
            const bookingDoc = patient.type === 'civil'
                ? String(booking.cpf || '').replace(/\D/g, '')
                : String(booking.re || '').replace(/-/g, '').toUpperCase();

            if (bookingDoc === rawDoc) {
                const [year, month, day] = dateKey.split('-').map(Number);
                const period = getBookingPeriodInfo(dateKey, booking);
                const sortDate = new Date(year, month, day, 23, 59, 59);
                results.push({ dateKey, booking, bookingIndex, period, sortDate });
            }
        });
    });

    return results.sort((a, b) => {
        const dateDiff = b.sortDate - a.sortDate;
        if (dateDiff !== 0) return dateDiff;
        return String(b.booking.timestamp || '').localeCompare(String(a.booking.timestamp || ''));
    });
}

function getObservationText(booking) {
    if (booking?.professionalObservation && typeof booking.professionalObservation === 'object') {
        return String(booking.professionalObservation.text || '');
    }
    if (typeof booking?.professionalObservation === 'string') {
        return booking.professionalObservation;
    }
    if (booking?.prontuarioObservation && typeof booking.prontuarioObservation === 'object') {
        return String(booking.prontuarioObservation.text || '');
    }
    return '';
}

function getObservationUpdatedAt(booking) {
    if (booking?.professionalObservation && typeof booking.professionalObservation === 'object') {
        return booking.professionalObservation.updatedAt || '';
    }
    if (booking?.prontuarioObservation && typeof booking.prontuarioObservation === 'object') {
        return booking.prontuarioObservation.updatedAt || '';
    }
    return '';
}

function formatRecordDate(dateKey) {
    const [year, month, day] = dateKey.split('-').map(Number);
    const months = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
                    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
    return `${day} de ${months[month]} de ${year}`;
}

function showAdminPatientDetails(patientId) {
    const details = document.getElementById('adminPatientDetails');
    const patient = state.registeredPatients && state.registeredPatients[patientId];
    if (!details || !patient) return;

    const doc = getPatientDocInfo(patient);
    const totalBookings = getPatientBookingsForRecord(patient).length;

    details.innerHTML = `
        <div class="patient-record-card">
            <h4>Dados do Cadastro</h4>
            <div class="patient-record-grid">
                <div><strong>Paciente:</strong><br>${escapeHtml(patient.name || '')}</div>
                <div><strong>Tipo:</strong><br>${patient.type === 'civil' ? 'Civil' : 'Militar'}</div>
                <div><strong>${doc.label}:</strong><br>${escapeHtml(doc.formatted)}</div>
                <div><strong>Email:</strong><br>${escapeHtml(patient.email || '')}</div>
                <div><strong>WhatsApp:</strong><br>${escapeHtml(patient.phone || '')}</div>
                ${patient.rank ? `<div><strong>Graduação:</strong><br>${escapeHtml(patient.rank)}</div>` : ''}
                ${patient.unit ? `<div><strong>Unidade:</strong><br>${escapeHtml(getUnitLabel(patient.unit))}</div>` : ''}
            </div>
            <div class="patient-record-limit-row">
                <label for="patientRecordLimitSelect"><strong>Últimos agendamentos:</strong></label>
                <select id="patientRecordLimitSelect">
                    <option value="5">5 últimos</option>
                    <option value="10">10 últimos</option>
                    <option value="20">20 últimos</option>
                    <option value="all">Todos (${totalBookings})</option>
                    <option value="custom">Personalizado</option>
                </select>
                <input type="number" id="patientRecordCustomLimit" min="1" max="${Math.max(totalBookings, 1)}" placeholder="Qtd." style="display:none; width: 110px;" />
                <button type="button" class="btn-secondary" onclick="window.editPatient('${patientId}')">Editar Cadastro</button>
                <button type="button" class="btn-danger" onclick="window.deletePatient('${patientId}')">Excluir Cadastro</button>
                <button type="button" class="btn-primary" onclick="window.showPatientProntuario('${patientId}')">Prontuário</button>
                <span style="color: var(--text-secondary); font-size: 13px;">Ainda não carregado</span>
            </div>
            <div id="patientProntuarioList" class="patient-prontuario-list"></div>
        </div>
    `;

    const select = document.getElementById('patientRecordLimitSelect');
    const customInput = document.getElementById('patientRecordCustomLimit');
    if (select && customInput) {
        select.addEventListener('change', () => {
            customInput.style.display = select.value === 'custom' ? 'block' : 'none';
        });
    }
}

function renderProntuarioCard(record, patientId) {
    const { dateKey, booking, bookingIndex, period } = record;
    const observation = getObservationText(booking);
    const observed = observation.trim().length > 0;
    const updatedAt = getObservationUpdatedAt(booking);
    const periodName = period ? period.name : 'Período não localizado';
    const periodTime = period ? `${period.start} - ${period.end}` : '';
    const safeDateKey = dateKey.replace(/[^a-zA-Z0-9]/g, '_');
    const textareaId = `recordObs_${safeDateKey}_${bookingIndex}`;
    const isCancelled = !!booking.cancellation;

    let statusBadge = '';
    if (isCancelled) {
        statusBadge = '<span class="prontuario-status-badge" style="background:#ffebee;color:#b71c1c;border:1px solid #f44336;">CANCELADO</span>';
    } else if (observed) {
        statusBadge = '<span class="prontuario-status-badge ok">✓ OBSERVADA</span>';
    } else {
        statusBadge = '<span class="prontuario-status-badge pending">⚠ PENDENTE DE OBSERVAÇÃO</span>';
    }

    return `
        <div class="prontuario-card ${isCancelled ? 'cancelled-booking' : (observed ? 'observed' : 'pending-observation')}">
            <div class="prontuario-header">
                <h4>${escapeHtml(formatRecordDate(dateKey))}</h4>
                ${statusBadge}
            </div>
            <p><strong>Período:</strong> ${escapeHtml(periodName)} ${periodTime ? `(${escapeHtml(periodTime)})` : ''}</p>
            <p><strong>Paciente:</strong> ${escapeHtml(booking.name || '')}</p>
            <p><strong>Queixa:</strong> ${escapeHtml(booking.complaint || 'Não informada')}</p>
            ${booking.cancellation ? `<p style="color:#f44336;"><strong>Cancelamento:</strong> ${escapeHtml(booking.cancellation.reason || '')}</p>` : ''}
            <div class="prontuario-observation">
                <label for="${textareaId}"><strong>Observação / medidas tomadas pelo profissional:</strong></label>
                <textarea id="${textareaId}" placeholder="Descreva as medidas tomadas nesta consulta">${escapeHtml(observation)}</textarea>
                ${updatedAt ? `<small style="color: var(--text-secondary);">Última atualização: ${escapeHtml(new Date(updatedAt).toLocaleString('pt-BR'))}</small>` : ''}
                <div class="prontuario-observation-actions">
                    <button type="button" class="btn-primary" onclick="window.saveProntuarioObservation('${dateKey}', ${bookingIndex}, '${patientId}')">Salvar Observação</button>
                </div>
            </div>
        </div>
    `;
}

function renderPatientProntuario(patientId) {
    const list = document.getElementById('patientProntuarioList');
    const patient = state.registeredPatients && state.registeredPatients[patientId];
    if (!list || !patient) return;

    const allBookings = getPatientBookingsForRecord(patient);
    if (!allBookings.length) {
        list.innerHTML = '<p class="no-bookings" style="padding: 18px;">Ainda não há agendamentos para este paciente.</p>';
        return;
    }

    const select = document.getElementById('patientRecordLimitSelect');
    const customInput = document.getElementById('patientRecordCustomLimit');
    let limitValue = select ? select.value : '5';
    let recordsToShow = allBookings;

    if (limitValue === 'custom') {
        const customLimit = parseInt(customInput?.value || '0', 10);
        if (!customLimit || customLimit < 1) {
            window.showFmuNotice('Informe uma quantidade válida para o prontuário personalizado.', 'Atenção');
            customInput?.focus();
            return;
        }
        recordsToShow = allBookings.slice(0, customLimit);
    } else if (limitValue !== 'all') {
        recordsToShow = allBookings.slice(0, parseInt(limitValue, 10));
    }

    const pendingCount = recordsToShow.filter(item => !item.booking.cancellation && !getObservationText(item.booking).trim()).length;
    const observedCount = recordsToShow.filter(item => !item.booking.cancellation && getObservationText(item.booking).trim()).length;

    list.innerHTML = `
        <div style="margin-bottom: 12px; color: var(--text-secondary);">
            Exibindo <strong>${recordsToShow.length}</strong> de <strong>${allBookings.length}</strong> agendamentos.
            Observadas: <strong style="color:#2e7d32;">${observedCount}</strong> |
            Pendentes: <strong style="color:#ff9800;">${pendingCount}</strong>
        </div>
        ${recordsToShow.map(record => renderProntuarioCard(record, patientId)).join('')}
    `;
}

window.selectAdminPatient = function(patientId) {
    showAdminPatientDetails(patientId);
};

window.showPatientProntuario = function(patientId) {
    renderPatientProntuario(patientId);
};

window.saveProntuarioObservation = function(dateKey, bookingIndex, patientId) {
    const safeDateKey = dateKey.replace(/[^a-zA-Z0-9]/g, '_');
    const textarea = document.getElementById(`recordObs_${safeDateKey}_${bookingIndex}`);
    const booking = state.bookings?.[dateKey]?.[bookingIndex];

    if (!textarea || !booking) {
        window.showFmuNotice('Não foi possível localizar esta consulta.', 'Atenção');
        return;
    }

    const text = textarea.value.trim().toUpperCase();
    booking.professionalObservation = text
        ? {
            text,
            updatedAt: new Date().toISOString()
        }
        : null;

    saveState();
    renderPatientProntuario(patientId);
    window.showFmuNotice(text ? 'Observação salva com sucesso!' : 'Observação removida. A consulta ficará pendente.', 'Prontuário');
};

export function initializeModals() {
    initializeBookingModal();
    initializeReportModal();
    initializeBlockedDaysModal();
    initializeCancellationModal();
    initializeCustomizeDayModal();
    initializeCustomizeDayFormModal();
    initializeSearchBookingsModal();
    initializeConfirmationModal();
    initializeBookingPasswordModal();
    initializeSetBookingPasswordModal();
    initializeStatisticsModal();
    initializePatientSearchModal();
    initializePatientRegistrationModal();
    initializeUserRegistrationModal();
    initializePatientVerificationModal();
    initializeEmailConfigModal();
}

function initializeBookingModal() {
    const modal = document.getElementById('bookingModal');
    const closeBtn = modal.querySelector('.close');

    closeBtn.addEventListener('click', () => {
        modal.classList.remove('active');
    });

    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.classList.remove('active');
        }
    });
}

function initializeReportModal() {
    const reportModal = document.getElementById('reportModal');
    const closeReport = document.getElementById('closeReport');
    const applyFilterBtn = document.getElementById('applyReportDateFilter');
    const clearFilterBtn = document.getElementById('clearReportDateFilter');

    closeReport.addEventListener('click', () => {
        reportModal.classList.remove('active');
    });

    reportModal.addEventListener('click', (e) => {
        if (e.target === reportModal) {
            reportModal.classList.remove('active');
        }
    });

    applyFilterBtn.addEventListener('click', () => {
        const dateFilter = document.getElementById('reportDateFilter').value;
        if (dateFilter) {
            window.dispatchEvent(new CustomEvent('showReportWithFilter', { detail: { filterDate: dateFilter } }));
        }
    });

    clearFilterBtn.addEventListener('click', () => {
        document.getElementById('reportDateFilter').value = '';
        window.dispatchEvent(new CustomEvent('showReport'));
    });
}

function initializeBlockedDaysModal() {
    const blockedDaysModal = document.getElementById('blockedDaysModal');
    const closeBlockedDays = document.getElementById('closeBlockedDays');

    closeBlockedDays.addEventListener('click', () => {
        blockedDaysModal.classList.remove('active');
    });

    blockedDaysModal.addEventListener('click', (e) => {
        if (e.target === blockedDaysModal) {
            blockedDaysModal.classList.remove('active');
        }
    });

    const prevMonthBlocked = document.getElementById('prevMonthBlocked');
    const nextMonthBlocked = document.getElementById('nextMonthBlocked');

    if (prevMonthBlocked && nextMonthBlocked) {
        prevMonthBlocked.addEventListener('click', () => {
            state.blockedCalendarMonth--;
            if (state.blockedCalendarMonth < 0) {
                state.blockedCalendarMonth = 11;
                state.blockedCalendarYear--;
            }
            renderBlockedCalendar();
        });

        nextMonthBlocked.addEventListener('click', () => {
            state.blockedCalendarMonth++;
            if (state.blockedCalendarMonth > 11) {
                state.blockedCalendarMonth = 0;
                state.blockedCalendarYear++;
            }
            renderBlockedCalendar();
        });
    }
}

function initializeCancellationModal() {
    const modal = document.getElementById('cancellationModal');
    const closeBtn = document.getElementById('closeCancellation');
    const passwordInput = document.getElementById('cancelPassword');
    const reasonInput = document.getElementById('cancelReason');
    const requestedByInput = document.getElementById('cancelRequestedBy');
    const confirmBtn = document.getElementById('confirmCancelBtn');
    const cancelBtn = document.getElementById('cancelCancelBtn');

    const validateForm = () => {
        const password = passwordInput.value;
        const reason = reasonInput.value.trim();
        const requestedBy = requestedByInput.value.trim();

        confirmBtn.disabled = !(password === 'ndit@123' && reason.length >= 10 && requestedBy.length > 0);
    };

    passwordInput.addEventListener('input', validateForm);

    reasonInput.addEventListener('input', () => {
        reasonInput.value = reasonInput.value.toUpperCase();
        validateForm();
    });

    requestedByInput.addEventListener('input', () => {
        requestedByInput.value = requestedByInput.value.toUpperCase();
        validateForm();
    });

    confirmBtn.addEventListener('click', () => {
        const dateKey = modal.dataset.dateKey;
        const bookingIndex = parseInt(modal.dataset.bookingIndex);
        const reason = reasonInput.value.trim();
        const requestedBy = requestedByInput.value.trim();

        if (state.bookings[dateKey] && state.bookings[dateKey][bookingIndex]) {
            state.bookings[dateKey][bookingIndex].cancellation = {
                reason,
                requestedBy,
                timestamp: new Date().toISOString()
            };
            saveState();
            renderCalendar();
            modal.classList.remove('active');
            window.dispatchEvent(new CustomEvent('showReport'));
            window.showFmuNotice('Reserva cancelada com sucesso!', 'Sucesso');
        }
    });

    cancelBtn.addEventListener('click', () => {
        modal.classList.remove('active');
    });

    closeBtn.addEventListener('click', () => {
        modal.classList.remove('active');
    });

    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.classList.remove('active');
        }
    });
}

function initializeCustomizeDayModal() {
    const customizeDayModal = document.getElementById('customizeDayModal');
    const closeCustomizeDay = document.getElementById('closeCustomizeDay');

    closeCustomizeDay.addEventListener('click', () => {
        customizeDayModal.classList.remove('active');
    });

    customizeDayModal.addEventListener('click', (e) => {
        if (e.target === customizeDayModal) {
            customizeDayModal.classList.remove('active');
        }
    });

    const prevMonthCustomize = document.getElementById('prevMonthCustomize');
    const nextMonthCustomize = document.getElementById('nextMonthCustomize');

    if (prevMonthCustomize && nextMonthCustomize) {
        prevMonthCustomize.addEventListener('click', () => {
            state.customizeCalendarMonth--;
            if (state.customizeCalendarMonth < 0) {
                state.customizeCalendarMonth = 11;
                state.customizeCalendarYear--;
            }
            renderCustomizeCalendar();
        });

        nextMonthCustomize.addEventListener('click', () => {
            state.customizeCalendarMonth++;
            if (state.customizeCalendarMonth > 11) {
                state.customizeCalendarMonth = 0;
                state.customizeCalendarYear++;
            }
            renderCustomizeCalendar();
        });
    }
}

function initializeCustomizeDayFormModal() {
    const modal = document.getElementById('customizeDayFormModal');
    const closeBtn = document.getElementById('closeCustomizeDayForm');

    closeBtn.addEventListener('click', () => {
        modal.classList.remove('active');
    });

    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.classList.remove('active');
        }
    });
}

function initializeSearchBookingsModal() {
    const modal = document.getElementById('searchBookingsModal');
    const closeBtn = document.getElementById('closeSearchBookings');
    const searchBtn = document.getElementById('searchBtn');
    
    closeBtn.addEventListener('click', () => {
        modal.classList.remove('active');
    });
    
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.classList.remove('active');
        }
    });
    
    searchBtn.addEventListener('click', () => {
        window.dispatchEvent(new CustomEvent('performSearchBookings'));
    });
    
    // Allow Enter key to search
    document.getElementById('searchCpf').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            window.dispatchEvent(new CustomEvent('performSearchBookings'));
        }
    });
}

function initializeConfirmationModal() {
    const modal = document.getElementById('confirmationModal');
    const closeBtn = document.getElementById('closeConfirmation');
    const closeBtnMain = document.getElementById('closeConfirmationBtn');
    const shareWhatsApp = document.getElementById('shareWhatsApp');
    const shareEmail = document.getElementById('shareEmail');
    const downloadPDF = document.getElementById('downloadPDF');
    
    closeBtn.addEventListener('click', () => {
        modal.classList.remove('active');
    });
    
    closeBtnMain.addEventListener('click', () => {
        modal.classList.remove('active');
    });
    
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.classList.remove('active');
        }
    });
    
    shareWhatsApp.addEventListener('click', () => {
        const bookingInfo = JSON.parse(modal.dataset.bookingInfo);
        const message = `🏥 *COMPROVANTE DE AGENDAMENTO - FISIOTERAPIA*\n\n` +
                       `📅 *Data:* ${bookingInfo.date}\n` +
                       `⏰ *Período:* ${bookingInfo.period}\n` +
                       `🕐 *Horário:* ${bookingInfo.time}\n` +
                       `👤 *Paciente:* ${bookingInfo.name}\n` +
                       `📱 *WhatsApp:* ${bookingInfo.phone}\n` +
                       `📋 *${bookingInfo.docLabel}:* ${bookingInfo.doc}\n` +
                       `✅ *Confirmado em:* ${bookingInfo.timestamp}`;
        
        const encodedMessage = encodeURIComponent(message);
        window.open(`https://wa.me/?text=${encodedMessage}`, '_blank');
    });
    
    shareEmail.addEventListener('click', () => {
        const bookingInfo = JSON.parse(modal.dataset.bookingInfo);
        const subject = 'Comprovante de Agendamento - Fisioterapia';
        const body = `COMPROVANTE DE AGENDAMENTO - FISIOTERAPIA\n\n` +
                    `Data: ${bookingInfo.date}\n` +
                    `Período: ${bookingInfo.period}\n` +
                    `Horário: ${bookingInfo.time}\n` +
                    `Paciente: ${bookingInfo.name}\n` +
                    `WhatsApp: ${bookingInfo.phone}\n` +
                    `${bookingInfo.docLabel}: ${bookingInfo.doc}\n` +
                    `Confirmado em: ${bookingInfo.timestamp}`;
        
        const mailtoLink = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
        window.location.href = mailtoLink;
    });
    
    downloadPDF.addEventListener('click', () => {
        const bookingInfo = JSON.parse(modal.dataset.bookingInfo);
        generateBookingPDF(bookingInfo);
    });
}

function generateBookingPDF(bookingInfo) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    
    // Header
    doc.setFontSize(20);
    doc.setFont(undefined, 'bold');
    doc.text('COMPROVANTE DE AGENDAMENTO', 105, 30, { align: 'center' });
    
    doc.setFontSize(16);
    doc.text('Fisioterapia', 105, 40, { align: 'center' });
    
    // Booking details box
    doc.setDrawColor(0);
    doc.setLineWidth(0.5);
    doc.rect(20, 55, 170, 110);
    
    let yPos = 70;
    doc.setFontSize(12);
    doc.setFont(undefined, 'bold');
    
    doc.text('Tipo:', 30, yPos);
    doc.setFont(undefined, 'normal');
    doc.text(bookingInfo.type, 80, yPos);
    yPos += 10;
    
    doc.setFont(undefined, 'bold');
    doc.text('Data:', 30, yPos);
    doc.setFont(undefined, 'normal');
    doc.text(bookingInfo.date, 80, yPos);
    yPos += 10;
    
    doc.setFont(undefined, 'bold');
    doc.text('Período:', 30, yPos);
    doc.setFont(undefined, 'normal');
    doc.text(bookingInfo.period, 80, yPos);
    yPos += 10;
    
    doc.setFont(undefined, 'bold');
    doc.text('Horário:', 30, yPos);
    doc.setFont(undefined, 'normal');
    doc.text(bookingInfo.time, 80, yPos);
    yPos += 10;
    
    doc.setFont(undefined, 'bold');
    doc.text('Paciente:', 30, yPos);
    doc.setFont(undefined, 'normal');
    doc.text(bookingInfo.name, 80, yPos);
    yPos += 10;
    
    doc.setFont(undefined, 'bold');
    doc.text(bookingInfo.docLabel + ':', 30, yPos);
    doc.setFont(undefined, 'normal');
    doc.text(bookingInfo.doc, 80, yPos);
    yPos += 10;
    
    doc.setFont(undefined, 'bold');
    doc.text('Email:', 30, yPos);
    doc.setFont(undefined, 'normal');
    doc.text(bookingInfo.email, 80, yPos);
    yPos += 10;
    
    doc.setFont(undefined, 'bold');
    doc.text('WhatsApp:', 30, yPos);
    doc.setFont(undefined, 'normal');
    doc.text(bookingInfo.phone, 80, yPos);
    yPos += 10;
    
    doc.setFont(undefined, 'bold');
    doc.text('Confirmado em:', 30, yPos);
    doc.setFont(undefined, 'normal');
    doc.text(bookingInfo.timestamp, 80, yPos);
    
    // Footer
    doc.setFontSize(10);
    doc.setFont(undefined, 'italic');
    doc.setTextColor(128);
    doc.text('Guarde este comprovante para apresentar no dia do atendimento.', 105, 180, { align: 'center' });
    
    // Save
    doc.save(`comprovante_agendamento_${bookingInfo.date.replace(/\s/g, '_')}.pdf`);
}

// Make viewAllMonthBookings globally available
window.viewAllMonthBookings = viewAllMonthBookings;

export function showCancellationModal(dateKey, bookingIndex) {
    const modal = document.getElementById('cancellationModal');
    modal.dataset.dateKey = dateKey;
    modal.dataset.bookingIndex = bookingIndex;
    modal.classList.add('active');

    document.getElementById('cancelPassword').value = '';
    document.getElementById('cancelReason').value = '';
    document.getElementById('cancelRequestedBy').value = '';
    document.getElementById('confirmCancelBtn').disabled = true;
}

function initializeBookingPasswordModal() {
    const modal = document.getElementById('bookingPasswordModal');
    const closeBtn = document.getElementById('closeBookingPassword');
    const passwordInput = document.getElementById('bookingPasswordInput');
    const confirmBtn = document.getElementById('confirmBookingPassword');
    const cancelBtn = document.getElementById('cancelBookingPassword');
    
    closeBtn.addEventListener('click', () => {
        modal.classList.remove('active');
        passwordInput.value = '';
    });
    
    cancelBtn.addEventListener('click', () => {
        modal.classList.remove('active');
        passwordInput.value = '';
    });
    
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.classList.remove('active');
            passwordInput.value = '';
        }
    });
    
    confirmBtn.addEventListener('click', () => {
        const enteredPassword = passwordInput.value;
        const correctPassword = state.bookingPassword?.password;
        
        if (enteredPassword === correctPassword) {
            modal.classList.remove('active');
            passwordInput.value = '';
            const day = parseInt(modal.dataset.day);
            // After password verification, show patient verification modal
            const verificationModal = document.getElementById('patientVerificationModal');
            verificationModal.dataset.day = day;
            
            // Reset verification form
            const verifyDocInput = document.getElementById('verifyDoc');
            verifyDocInput.value = '';
            document.getElementById('verifyDocLabel').textContent = 'CPF ou RE:';
            verifyDocInput.placeholder = 'Digite CPF ou RE';
            verifyDocInput.maxLength = 14;
            verifyDocInput.dataset.detectedType = '';
            document.getElementById('verifyPatientBtn').disabled = true;
            
            verificationModal.classList.add('active');
            verifyDocInput.focus();
        } else {
            window.showFmuNotice('Senha incorreta!', 'Acesso negado');
            passwordInput.value = '';
            passwordInput.focus();
        }
    });
    
    passwordInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            confirmBtn.click();
        }
    });
}

function initializeSetBookingPasswordModal() {
    const modal = document.getElementById('setBookingPasswordModal');
    const closeBtn = document.getElementById('closeSetBookingPassword');
    const cancelBtn = document.getElementById('cancelSetPassword');
    const saveBtn = document.getElementById('savePasswordBtn');
    const disableBtn = document.getElementById('disablePasswordBtn');
    const newPasswordInput = document.getElementById('newBookingPassword');
    const confirmPasswordInput = document.getElementById('confirmBookingPassword2');
    
    closeBtn.addEventListener('click', () => {
        modal.classList.remove('active');
    });
    
    cancelBtn.addEventListener('click', () => {
        modal.classList.remove('active');
    });
    
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.classList.remove('active');
        }
    });
    
    saveBtn.addEventListener('click', () => {
        const newPassword = newPasswordInput.value.trim();
        const confirmPassword = confirmPasswordInput.value.trim();
        
        if (!newPassword) {
            window.showFmuNotice('Por favor, digite uma senha.', 'Atenção');
            return;
        }
        
        if (newPassword !== confirmPassword) {
            window.showFmuNotice('As senhas não coincidem!', 'Atenção');
            return;
        }
        
        if (newPassword.length < 4) {
            window.showFmuNotice('A senha deve ter pelo menos 4 caracteres.', 'Atenção');
            return;
        }
        
        state.bookingPassword = {
            enabled: true,
            password: newPassword
        };
        
        saveState();
        window.showFmuNotice('Senha de agendamento salva com sucesso!', 'Sucesso');
        modal.classList.remove('active');
    });
    
    disableBtn.addEventListener('click', async () => {
        const confirmed = await window.showFmuConfirm('Tem certeza que deseja desabilitar a senha de agendamento?', 'Desabilitar senha', 'Desabilitar', 'Cancelar');
        if (confirmed) {
            state.bookingPassword = {
                enabled: false,
                password: null
            };
            saveState();
            window.showFmuNotice('Senha de agendamento desabilitada!', 'Sucesso');
            modal.classList.remove('active');
        }
    });
}

function initializeStatisticsModal() {
    const modal = document.getElementById('statisticsModal');
    const closeBtn = document.getElementById('closeStatistics');
    const monthSelect = document.getElementById('statsMonthSelect');
    const yearSelect = document.getElementById('statsYearSelect');
    
    // Populate month and year selects
    const months = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 
                    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
    months.forEach((month, index) => {
        const option = document.createElement('option');
        option.value = index;
        option.textContent = month;
        monthSelect.appendChild(option);
    });
    
    const currentYear = new Date().getFullYear();
    for (let i = currentYear - 1; i <= currentYear + 2; i++) {
        const option = document.createElement('option');
        option.value = i;
        option.textContent = i;
        yearSelect.appendChild(option);
    }
    
    monthSelect.value = state.currentMonth;
    yearSelect.value = state.currentYear;
    
    closeBtn.addEventListener('click', () => {
        modal.classList.remove('active');
    });
    
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.classList.remove('active');
        }
    });
}

function viewAllMonthBookings(month, year) {
    const months = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 
                    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
    
    const reportModal = document.getElementById('reportModal');
    const reportContent = document.getElementById('reportContent');
    
    let html = `<h2 style="margin-bottom: 20px;">Todos os Agendamentos - ${months[month]} ${year}</h2>`;
    
    const monthBookings = {};
    Object.keys(state.bookings).forEach(dateKey => {
        const [bookingYear, bookingMonth] = dateKey.split('-').map(Number);
        if (bookingYear === year && bookingMonth === month) {
            monthBookings[dateKey] = state.bookings[dateKey];
        }
    });
    
    const bookingEntries = Object.entries(monthBookings).sort();
    
    if (bookingEntries.length === 0) {
        html += '<p class="no-bookings">Nenhum agendamento encontrado para este mês.</p>';
    } else {
        bookingEntries.forEach(([dateKey, bookings]) => {
            const [year, month, day] = dateKey.split('-').map(Number);
            const monthConfig = state.configurations[`${year}-${month}`];

            html += `<div class="report-date-group">
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

                const cleanPhone = booking.phone.replace(/\D/g, '');
                const whatsappLink = `https://wa.me/55${cleanPhone}`;
                const formattedDoc = booking.cpf 
                    ? booking.cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
                    : booking.re || 'N/A';
                const docLabel = booking.type === 'militar' ? 'RE' : 'CPF';
                const patientType = booking.type === 'militar' ? 'Militar' : 'Civil';
                
                html += `
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
                            <tr>
                                <td style="padding: 8px; width: 30%; font-weight: 600;">Paciente:</td>
                                <td style="padding: 8px;">${booking.name}</td>
                            </tr>
                            <tr>
                                <td style="padding: 8px; width: 30%; font-weight: 600;">${docLabel}:</td>
                                <td style="padding: 8px;">${formattedDoc}</td>
                            </tr>
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
            });

            html += `</div></div>`;
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
    
    reportModal.classList.add('active');
}

export function showStatistics() {
    const modal = document.getElementById('statisticsModal');
    const monthSelect = document.getElementById('statsMonthSelect');
    const yearSelect = document.getElementById('statsYearSelect');
    const content = document.getElementById('statisticsContent');
    
    monthSelect.value = state.currentMonth;
    yearSelect.value = state.currentYear;
    
    content.innerHTML = `
        <div style="text-align: center; padding: 40px;">
            <p style="color: var(--text-secondary); font-size: 16px; margin-bottom: 20px;">
                Selecione o mês e ano acima e clique em "Buscar" para visualizar as estatísticas
            </p>
            <button id="searchStatsBtn" class="btn-primary">Buscar</button>
        </div>
    `;
    
    document.getElementById('searchStatsBtn').addEventListener('click', () => {
        renderStatistics();
    });
    
    modal.classList.add('active');
}

function renderStatistics() {
    const content = document.getElementById('statisticsContent');
    const monthSelect = document.getElementById('statsMonthSelect');
    const yearSelect = document.getElementById('statsYearSelect');
    const month = parseInt(monthSelect.value);
    const year = parseInt(yearSelect.value);
    
    const months = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 
                    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
    
    const configKey = `${year}-${month}`;
    const monthConfig = state.configurations[configKey];
    
    if (!monthConfig) {
        content.innerHTML = `
            <p class="no-statistics">Nenhuma configuração encontrada para este mês.</p>
            <button class="btn-primary" onclick="viewAllMonthBookings(${month}, ${year})" style="margin-top: 20px;">
                Ver Todos os Agendamentos do Mês
            </button>
            <button id="searchStatsBtn2" class="btn-secondary" style="margin-top: 12px; margin-left: 12px;">
                Nova Busca
            </button>
        `;
        
        document.getElementById('searchStatsBtn2')?.addEventListener('click', () => {
            showStatistics();
        });
        return;
    }
    
    // Calculate occupancy by period
    const periodStats = calculatePeriodOccupancy(month, year, monthConfig);
    
    // Render chart
    let html = `
        <div style="margin-bottom: 20px;">
            <button class="btn-primary" onclick="viewAllMonthBookings(${month}, ${year})">
                Ver Todos os Agendamentos do Mês
            </button>
            <button id="searchStatsBtn3" class="btn-secondary" style="margin-left: 12px;">
                Nova Busca
            </button>
        </div>
        
        <h3 style="margin-bottom: 20px; font-size: 20px;">Ocupação por Período - ${months[month]} ${year}</h3>
        
        <div class="occupancy-chart">
            ${renderOccupancyChart(periodStats)}
        </div>
        
        <div class="occupancy-legend">
            <div class="legend-item">
                <div class="legend-color" style="background: #4caf50;"></div>
                <span>Vagas Livres</span>
            </div>
            <div class="legend-item">
                <div class="legend-color" style="background: #f44336;"></div>
                <span>Vagas Ocupadas</span>
            </div>
        </div>
    `;
    
    content.innerHTML = html;
    
    document.getElementById('searchStatsBtn3')?.addEventListener('click', () => {
        showStatistics();
    });
}

function calculatePeriodOccupancy(month, year, monthConfig) {
    // Return per-period totals plus breakdown by category: civis, militares copom, militares outros
    const periodStats = {
        'Manhã': { total: 0, civis: 0, mil_copom: 0, mil_outros: 0 },
        'Tarde': { total: 0, civis: 0, mil_copom: 0, mil_outros: 0 },
        'Noite': { total: 0, civis: 0, mil_copom: 0, mil_outros: 0 }
    };
    
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    
    for (let day = 1; day <= daysInMonth; day++) {
        const dateKey = `${year}-${month}-${day}`;
        const dayOfWeek = new Date(year, month, day).getDay();
        
        // Get effective configuration for this day
        const customConfig = state.customDayConfigurations && state.customDayConfigurations[dateKey];
        let effectiveConfig = null;
        
        if (customConfig) {
            effectiveConfig = customConfig;
        } else if (monthConfig && monthConfig.daysConfig) {
            const withinRange = day >= (monthConfig.startDay || 1) && day <= (monthConfig.endDay || daysInMonth);
            if (withinRange && monthConfig.daysConfig[dayOfWeek]) {
                effectiveConfig = monthConfig.daysConfig[dayOfWeek];
            }
        }
        
        if (!effectiveConfig || state.blockedDays[dateKey]) continue;
        
        const dayBookings = state.bookings[dateKey] || [];
        
        effectiveConfig.periods.forEach((period, index) => {
            const periodName = period.name;
            if (!periodStats[periodName]) return;
            const slots = period.slots || 1;
            periodStats[periodName].total += slots;
            
            // Count bookings per category
            const activeBookings = dayBookings.filter(b => b.periodIndex === index && !b.cancellation);
            activeBookings.forEach(b => {
                if (b.type === 'civil' || (b.type === undefined && b.cpf)) {
                    periodStats[periodName].civis += 1;
                } else {
                    // military
                    if (b.unit === 'copom') periodStats[periodName].mil_copom += 1;
                    else periodStats[periodName].mil_outros += 1;
                }
            });
        });
    }
    
    return periodStats;
}

function renderOccupancyChart(periodStats) {
    let html = '';
    
    Object.keys(periodStats).forEach(periodName => {
        const stats = periodStats[periodName];
        
        if (stats.total === 0) return;
        
        // breakdown counts
        const civis = stats.civis || 0;
        const copom = stats.mil_copom || 0;
        const outros = stats.mil_outros || 0;
        const occupied = civis + copom + outros;
        const free = Math.max(0, stats.total - occupied);
        
        const civisPct = ((civis / stats.total) * 100).toFixed(1);
        const copomPct = ((copom / stats.total) * 100).toFixed(1);
        const outrosPct = ((outros / stats.total) * 100).toFixed(1);
        const freePct = ((free / stats.total) * 100).toFixed(1);
        
        html += `
            <div class="chart-row">
                <div class="chart-label">
                    <strong>${periodName}</strong>
                    <span>${occupied} / ${stats.total} vagas ocupadas</span>
                </div>
                <div class="chart-bar-container">
                    <div class="chart-bar-segment occupied" style="width: ${copomPct}% ; background: #6a1b9a;" title="${copom} militares COPOM (${copomPct}%)">
                        ${copomPct > 12 ? `${copomPct}%` : ''}
                    </div>
                    <div class="chart-bar-segment occupied" style="width: ${outrosPct}% ; background: #ff7043;" title="${outros} militares Outros (${outrosPct}%)">
                        ${outrosPct > 12 ? `${outrosPct}%` : ''}
                    </div>
                    <div class="chart-bar-segment occupied" style="width: ${civisPct}% ; background: #f44336;" title="${civis} civis (${civisPct}%)">
                        ${civisPct > 12 ? `${civisPct}%` : ''}
                    </div>
                    <div class="chart-bar-segment free" style="width: ${freePct}%;" title="${free} livres (${freePct}%)">
                        ${freePct > 12 ? `${freePct}%` : ''}
                    </div>
                </div>
                <div class="chart-stats">
                    <div class="stat-item" style="text-align:center;">
                        <span class="stat-value" style="color:#f44336">${civis}</span>
                        <span class="stat-label">Civis</span>
                    </div>
                    <div class="stat-item" style="text-align:center;">
                        <span class="stat-value" style="color:#6a1b9a">${copom}</span>
                        <span class="stat-label">Militares COPOM</span>
                    </div>
                    <div class="stat-item" style="text-align:center;">
                        <span class="stat-value" style="color:#ff7043">${outros}</span>
                        <span class="stat-label">Militares Outros</span>
                    </div>
                    <div class="stat-item" style="text-align:center;">
                        <span class="stat-value">${free}</span>
                        <span class="stat-label">Livres</span>
                    </div>
                </div>
            </div>
        `;
    });
    
    if (html === '') {
        html = '<p class="no-statistics">Nenhum dado disponível para este mês.</p>';
    }
    
    return html;
}


function initializePatientVerificationModal() {
    const modal = document.getElementById('patientVerificationModal');
    const closeBtn = document.getElementById('closePatientVerification');
    const docInput = document.getElementById('verifyDoc');
    const docLabel = document.getElementById('verifyDocLabel');
    const verifyBtn = document.getElementById('verifyPatientBtn');

    const resetVerificationForm = () => {
        docInput.value = '';
        docInput.dataset.detectedType = '';
        docLabel.textContent = 'CPF ou RE:';
        docInput.placeholder = 'Digite CPF ou RE';
        docInput.maxLength = 14;
        verifyBtn.disabled = true;
    };

    closeBtn.addEventListener('click', () => {
        modal.classList.remove('active');
        resetVerificationForm();
    });
    
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.classList.remove('active');
            resetVerificationForm();
        }
    });
    
    docInput.addEventListener('input', (e) => {
        e.target.value = formatCpfOrReInput(e.target.value);
        const detected = detectCpfOrReFromDigits(e.target.value);
        e.target.dataset.detectedType = detected.type;

        if (detected.type === 'civil') {
            docLabel.textContent = 'CPF identificado:';
        } else if (detected.type === 'militar') {
            docLabel.textContent = 'RE identificado:';
        } else {
            docLabel.textContent = 'CPF ou RE:';
        }

        verifyBtn.disabled = !['civil', 'militar'].includes(detected.type);
    });
    
    docInput.addEventListener('blur', () => {
        validateDetectedCpfOrRe(docInput.value, 'Verificação de Cadastro');
    });

    verifyBtn.addEventListener('click', () => {
        if (!validateDetectedCpfOrRe(docInput.value, 'Verificação de Cadastro')) return;

        const patient = findRegisteredPatientByCpfOrRe(docInput.value);
        if (!patient) {
            window.showFmuNotice('Paciente não cadastrado. Entre em contato com a entidade antes do agendamento.', 'Cadastro não encontrado');
            return;
        }
        
        const day = parseInt(modal.dataset.day);
        modal.classList.remove('active');
        resetVerificationForm();
        window.dispatchEvent(new CustomEvent('openBookingModal', { 
            detail: { day, patient } 
        }));
    });
    
    docInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !verifyBtn.disabled) {
            verifyBtn.click();
        }
    });
}

function initializePatientRegistrationModal() {
    const modal = document.getElementById('patientRegistrationModal');
    const closeBtn = document.getElementById('closePatientRegistration');
    const cancelBtn = document.getElementById('cancelPatientRegistration');
    const saveBtn = document.getElementById('savePatientRegistration');
    const docInput = document.getElementById('regDoc');
    const docLabel = document.getElementById('regDocLabel');
    const nameInput = document.getElementById('regName');
    const emailInput = document.getElementById('regEmail');
    const phoneInput = document.getElementById('regPhone');
    const rankInput = document.getElementById('regRank');
    const rankField = document.getElementById('regRankField');
    const unitField = document.getElementById('regMilitaryUnitField');
    const adminSearchInput = document.getElementById('adminPatientSearchInput');
    const adminSearchBtn = document.getElementById('adminPatientSearchBtn');
    const pmAutoFillStatus = document.getElementById('pmAutoFillStatus');
    const phoneSuggestionWrap = document.getElementById('regPhoneSuggestionWrap');
    const phoneSuggestionSelect = document.getElementById('regPhoneSuggestion');

    let currentType = '';
    let pmLookupTimer = null;
    let lastPmLookupKey = '';

    const getRegistrationType = () => {
        const parts = getCpfReInputParts(docInput.value);
        if (!parts.value) return '';
        return parts.cpfMode ? 'civil' : 'militar';
    };

    const applyDetectedRegistrationType = () => {
        const parts = getCpfReInputParts(docInput.value);
        currentType = getRegistrationType();

        if (!parts.value) {
            docLabel.textContent = 'CPF ou RE:';
            docInput.placeholder = 'Digite CPF ou RE';
            docInput.maxLength = 14;
            rankField.style.display = 'none';
            unitField.style.display = 'none';
        } else if (currentType === 'civil') {
            docLabel.textContent = 'CPF identificado:';
            docInput.placeholder = '000.000.000-00';
            docInput.maxLength = 14;
            rankField.style.display = 'none';
            unitField.style.display = 'none';
            rankInput.value = '';
            document.querySelectorAll('input[name="regMilitaryUnit"]').forEach(r => r.checked = false);
        } else {
            docLabel.textContent = 'RE identificado:';
            docInput.placeholder = '000000-0 ou CPF';
            // Mantem 14 para permitir continuar digitando. Se passar de 7 caracteres, vira CPF.
            docInput.maxLength = 14;
            rankField.style.display = 'block';
            unitField.style.display = 'block';
        }
    };

    const runAdminPatientSearch = () => {
        const matches = findAdminPatientMatches(adminSearchInput.value);
        renderAdminPatientSearchResults(matches);
    };

    const setPmAutoFillStatus = (message = '', type = 'info') => {
        if (!pmAutoFillStatus) return;

        pmAutoFillStatus.textContent = message;
        pmAutoFillStatus.dataset.type = type;
        pmAutoFillStatus.hidden = !message;
    };

    const clearPhoneSuggestions = () => {
        if (phoneSuggestionSelect) {
            phoneSuggestionSelect.innerHTML = '<option value="">Selecione um telefone</option>';
        }
        if (phoneSuggestionWrap) {
            phoneSuggestionWrap.hidden = true;
        }
    };

    const normalizePhoneDigits = (value) => String(value || '').replace(/\D/g, '').slice(-11);

    const findRankOptionValue = (rankText) => {
        if (!rankInput || !rankText) return '';

        const normalize = (value) => String(value || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^A-Z0-9]/gi, '')
            .toUpperCase();

        const aliases = {
            SDPM2CL: 'Sd PM 2cl',
            SDPM1CL: 'Sd PM 1cl',
            SDPM: 'Sd PM 1cl',
            CBPM: 'Cb PM',
            CABOPM: 'Cb PM',
            '3SGTPM': '3º Sgt PM',
            '3SARGENTOPM': '3º Sgt PM',
            '2SGTPM': '2º Sgt PM',
            '2SARGENTOPM': '2º Sgt PM',
            '1SGTPM': '1º Sgt PM',
            '1SARGENTOPM': '1º Sgt PM',
            SUBTENPM: 'Subten PM',
            SUBTENENTPM: 'Subten PM',
            ASPOFPM: 'Asp Of PM',
            ASPIRANTEOFICIALPM: 'Asp Of PM',
            '2TENPM': '2º Ten PM',
            '2TENENTEPM': '2º Ten PM',
            '1TENPM': '1º Ten PM',
            '1TENENTEPM': '1º Ten PM',
            CAPPM: 'Cap PM',
            CAPITAOPM: 'Cap PM',
            MAJPM: 'Maj PM',
            MAJORPM: 'Maj PM',
            TENCELPM: 'Ten Cel PM',
            TENENTECORONELPM: 'Ten Cel PM',
            CELPM: 'Cel PM',
            CORONELPM: 'Cel PM'
        };

        const key = normalize(rankText);
        if (aliases[key]) return aliases[key];

        const found = Array.from(rankInput.options).find((option) => normalize(option.value) === key || normalize(option.textContent) === key);
        return found ? found.value : '';
    };

    const fillPhoneSuggestions = (telefones = []) => {
        clearPhoneSuggestions();

        if (!phoneSuggestionSelect || !phoneSuggestionWrap || !Array.isArray(telefones) || telefones.length === 0) {
            return;
        }

        phoneSuggestionSelect.innerHTML = '<option value="">Selecione um telefone</option>';

        telefones.forEach((telefone, index) => {
            const digits = normalizePhoneDigits(telefone.digits || telefone.e164 || `${telefone.ddd || ''}${telefone.numero || ''}`);
            if (!/^\d{2}9\d{8}$/.test(digits)) return;

            const option = document.createElement('option');
            option.value = digits;
            option.textContent = telefone.formatado || `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
            if (index === 0) option.selected = true;
            phoneSuggestionSelect.appendChild(option);
        });

        const outro = document.createElement('option');
        outro.value = '__outro__';
        outro.textContent = 'Outro número / digitar manualmente';
        phoneSuggestionSelect.appendChild(outro);

        const firstPhone = phoneSuggestionSelect.querySelector('option[value]:not([value=""]):not([value="__outro__"])');
        if (firstPhone) {
            phoneInput.value = firstPhone.value;
            phoneSuggestionWrap.hidden = false;
        }
    };

    const applyPmDataToForm = (pmData) => {
        if (!pmData) return;

        if (pmData.nomeCompleto) nameInput.value = pmData.nomeCompleto.toUpperCase();
        if (pmData.emailFuncional) emailInput.value = pmData.emailFuncional;

        const rankValue = findRankOptionValue(pmData.graduacaoSigla || pmData.graduacao);
        if (rankValue) rankInput.value = rankValue;

        fillPhoneSuggestions(pmData.telefones || []);

        setPmAutoFillStatus(`Dados localizados no Firebase para RE ${pmData.re}. Confira e salve o cadastro.`, 'success');
        validateForm();
    };

    const lookupPmAndAutofill = async ({ force = false } = {}) => {
        const detectedType = getRegistrationType();
        const parts = getCpfReInputParts(docInput.value);

        if (detectedType !== 'militar' || !parts.value) {
            lastPmLookupKey = '';
            clearPhoneSuggestions();
            setPmAutoFillStatus('');
            return;
        }

        const lookupKey = parts.value.replace(/\D/g, '') || parts.value;
        if (!force && lookupKey === lastPmLookupKey) return;

        lastPmLookupKey = lookupKey;
        setPmAutoFillStatus('Consultando RE no Firebase...', 'loading');

        try {
            const pmData = await buscarPolicialMilitarPorRe(docInput.value);

            if (!pmData) {
                clearPhoneSuggestions();
                setPmAutoFillStatus('RE não encontrado na base importada. Você pode preencher manualmente.', 'warning');
                validateForm();
                return;
            }

            applyPmDataToForm(pmData);
        } catch (error) {
            console.error('Erro ao consultar PM no Firestore:', error);
            clearPhoneSuggestions();
            setPmAutoFillStatus('Não foi possível consultar o Firebase agora. Preencha manualmente ou verifique a configuração.', 'error');
            validateForm();
        }
    };

    const schedulePmLookup = () => {
        clearTimeout(pmLookupTimer);
        pmLookupTimer = setTimeout(() => lookupPmAndAutofill(), 550);
    };

    if (adminSearchBtn && adminSearchInput) {
        adminSearchBtn.addEventListener('click', runAdminPatientSearch);
        adminSearchInput.addEventListener('input', () => {
            adminSearchInput.value = formatCpfOrReInput(adminSearchInput.value);
            const normalized = normalizeAdminPatientSearch(adminSearchInput.value);
            if (normalized.length >= 3) {
                runAdminPatientSearch();
            } else {
                const results = document.getElementById('adminPatientSearchResults');
                const details = document.getElementById('adminPatientDetails');
                if (results) results.innerHTML = '';
                if (details) details.innerHTML = '';
            }
        });
        adminSearchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                runAdminPatientSearch();
            }
        });
    }

    const validateForm = () => {
        applyDetectedRegistrationType();
        const parts = getCpfReInputParts(docInput.value);
        const docValid = currentType === 'civil'
            ? /^\d{11}$/.test(parts.value)
            : currentType === 'militar' && /^\d{6}[A-Z0-9]$/.test(parts.value);

        const name = nameInput.value.trim();
        const email = emailInput.value.trim();
        const phone = phoneInput.value.trim();
        const rankValid = currentType !== 'militar' || rankInput.value !== '';
        const unitValid = currentType !== 'militar' || document.querySelector('input[name="regMilitaryUnit"]:checked') !== null;

        saveBtn.disabled = !(docValid && name && email.includes('@') && phone.length === 11 && rankValid && unitValid);
    };

    docInput.addEventListener('input', (e) => {
        e.target.value = formatCpfOrReInput(e.target.value);
        validateForm();
        schedulePmLookup();
    });

    docInput.addEventListener('blur', async () => {
        const detectedType = getRegistrationType();
        if (!detectedType) return;
        if (!validateIncompleteDocument(docInput.value, detectedType, 'Cadastro de Paciente')) return;

        const parts = getCpfReInputParts(docInput.value);
        const doc = parts.value;
        const duplicate = localizarPacienteDuplicado({
            cpf: detectedType === 'civil' ? doc : '',
            re: detectedType === 'militar' ? doc : '',
            excludeId: docInput.dataset.updatePatientId || ''
        });

        if (duplicate) {
            const atualizar = await window.showFmuConfirm(formatPatientDetailsForConfirm(duplicate.patient), 'Cadastro já existente', 'Atualizar existente', 'Cancelar');
            if (atualizar) {
                window.editPatient(duplicate.id);
                window.showFmuNotice('Dados carregados para atualização. Confira as informações e clique em Salvar Cadastro.', 'Atualização de cadastro');
            } else {
                docInput.value = '';
                docInput.dataset.updatePatientId = '';
                validateForm();
            }
            return;
        }

        docInput.dataset.updatePatientId = detectedType === 'civil' ? 'civil_' + doc : 'militar_' + doc;

        if (detectedType === 'militar') {
            lookupPmAndAutofill({ force: true });
        }
    });

    emailInput.addEventListener('blur', async () => {
        const email = normalizeEmail(emailInput.value);
        if (!email) return;
        const detectedType = getRegistrationType();
        const parts = getCpfReInputParts(docInput.value);
        const patientId = detectedType === 'civil' ? `civil_${parts.value}` : detectedType === 'militar' ? `militar_${parts.value}` : '';
        const duplicated = findGlobalDuplicate({ email, excludePatientId: docInput.dataset.updatePatientId || patientId });
        if (duplicated) {
            const duplicatePatient = localizarPacienteDuplicado({ email, excludeId: patientId });
            if (duplicatePatient) {
                const atualizar = await window.showFmuConfirm(formatPatientDetailsForConfirm(duplicatePatient.patient), 'Cadastro já existente', 'Atualizar existente', 'Cancelar');
                if (atualizar) window.editPatient(duplicatePatient.id);
            } else {
                window.showFmuNotice(duplicated, 'Cadastro duplicado');
            }
        }
    });

    nameInput.addEventListener('input', () => {
        nameInput.value = nameInput.value.toUpperCase();
        validateForm();
    });

    emailInput.addEventListener('input', validateForm);

    phoneInput.addEventListener('input', (e) => {
        e.target.value = e.target.value.replace(/\D/g, '').slice(0, 11);
        if (phoneSuggestionSelect && phoneSuggestionSelect.value !== e.target.value) {
            phoneSuggestionSelect.value = '__outro__';
        }
        validateForm();
    });

    if (phoneSuggestionSelect) {
        phoneSuggestionSelect.addEventListener('change', () => {
            if (phoneSuggestionSelect.value && phoneSuggestionSelect.value !== '__outro__') {
                phoneInput.value = phoneSuggestionSelect.value;
            } else if (phoneSuggestionSelect.value === '__outro__') {
                phoneInput.value = '';
                phoneInput.focus();
            }
            validateForm();
        });
    }

    rankInput.addEventListener('change', validateForm);
    document.querySelectorAll('input[name="regMilitaryUnit"]').forEach(r => {
        r.addEventListener('change', validateForm);
    });

    saveBtn.addEventListener('click', () => {
        const detectedType = getRegistrationType();
        if (!detectedType) {
            window.showFmuNotice('Digite um CPF ou RE válido para continuar.', 'Documento obrigatório');
            return;
        }

        const parts = getCpfReInputParts(docInput.value);
        currentType = detectedType;
        const doc = parts.value;
        const patientId = currentType === 'civil' ? `civil_${doc}` : `militar_${doc}`;
        const updatePatientId = docInput.dataset.updatePatientId || patientId;

        if (!validateIncompleteDocument(docInput.value, currentType, 'Cadastro de Paciente')) return;

        if (!state.registeredPatients) state.registeredPatients = {};

        const duplicateMessage = findGlobalDuplicate({
            cpf: currentType === 'civil' ? doc : '',
            re: currentType === 'militar' ? doc : '',
            email: emailInput.value,
            excludePatientId: updatePatientId
        });
        if (duplicateMessage) {
            window.showFmuNotice(duplicateMessage + ' O sistema não aceita CPF, RE ou email repetidos, mesmo em funções diferentes.', 'Cadastro duplicado');
            return;
        }

        const previousPatient = state.registeredPatients[updatePatientId];
        const patientData = {
            type: currentType,
            name: nameInput.value.trim(),
            email: emailInput.value.trim(),
            phone: phoneInput.value.trim(),
            createdAt: previousPatient?.createdAt || new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        if (currentType === 'civil') {
            patientData.cpf = doc;
        } else {
            patientData.re = doc;
            patientData.rank = rankInput.value;
            const selectedUnit = document.querySelector('input[name="regMilitaryUnit"]:checked');
            patientData.unit = selectedUnit ? selectedUnit.value : null;
        }

        if (updatePatientId && updatePatientId !== patientId && state.registeredPatients[updatePatientId]) {
            delete state.registeredPatients[updatePatientId];
        }
        state.registeredPatients[patientId] = patientData;
        saveState();

        window.showFmuNotice(previousPatient ? 'Paciente atualizado com sucesso!' : 'Paciente cadastrado com sucesso!', 'Sucesso');

        docInput.value = '';
        nameInput.value = '';
        emailInput.value = '';
        phoneInput.value = '';
        rankInput.value = '';
        docInput.dataset.updatePatientId = '';
        lastPmLookupKey = '';
        clearPhoneSuggestions();
        setPmAutoFillStatus('');
        document.querySelectorAll('input[name="regMilitaryUnit"]').forEach(r => r.checked = false);
        applyDetectedRegistrationType();
        renderRegisteredPatientsList();
        validateForm();
    });

    cancelBtn.addEventListener('click', () => {
        modal.classList.remove('active');
        clearPhoneSuggestions();
        setPmAutoFillStatus('');
        clearAdminPatientRecordArea();
    });

    closeBtn.addEventListener('click', () => {
        modal.classList.remove('active');
        clearPhoneSuggestions();
        setPmAutoFillStatus('');
        clearAdminPatientRecordArea();
    });

    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.classList.remove('active');
            clearAdminPatientRecordArea();
        }
    });

    applyDetectedRegistrationType();
    validateForm();
}

function initializePatientSearchModal() {
    const modal = document.getElementById('patientSearchModal');
    const closeBtn = document.getElementById('closePatientSearch');
    const docInput = document.getElementById('patientDoc');
    const docLabel = document.getElementById('patientDocLabel');
    const searchBtn = document.getElementById('patientSearchBtn');
    const patientTypeRadios = document.querySelectorAll('input[name="patientType"]');

    let currentType = 'civil';

    const updateDocField = () => {
        const selectedType = document.querySelector('input[name="patientType"]:checked').value;
        const typeChanged = currentType !== selectedType;
        currentType = selectedType;
        
        if (selectedType === 'civil') {
            docLabel.textContent = 'Digite seu CPF:';
            docInput.placeholder = '000.000.000-00';
            docInput.maxLength = 14;
        } else {
            docLabel.textContent = 'Digite seu RE (Registro):';
            docInput.placeholder = '000000-0';
            docInput.maxLength = 8;
        }
        if (typeChanged) docInput.value = '';
        searchBtn.disabled = true;
    };

    patientTypeRadios.forEach(radio => {
        radio.addEventListener('change', updateDocField);
        radio.addEventListener('input', updateDocField);
        radio.addEventListener('click', updateDocField);
    });
    
    closeBtn.addEventListener('click', () => {
        modal.classList.remove('active');
        docInput.value = '';
        document.getElementById('patientSearchResults').innerHTML = '';
    });
    
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.classList.remove('active');
            docInput.value = '';
            document.getElementById('patientSearchResults').innerHTML = '';
        }
    });
    
    // Format document as user types
    docInput.addEventListener('input', (e) => {
        if (currentType === 'civil') {
            let v = e.target.value.replace(/\D/g, '');
            if (v.length > 11) v = v.slice(0, 11);
            if (v.length > 9) v = v.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
            else if (v.length > 6) v = v.replace(/(\d{3})(\d{3})(\d{1,3})/, '$1.$2.$3');
            else if (v.length > 3) v = v.replace(/(\d{3})(\d{1,3})/, '$1.$2');
            e.target.value = v;
            
            const cleanCpf = v.replace(/\D/g, '');
            searchBtn.disabled = cleanCpf.length !== 11;
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
            
            const cleanRe = raw.replace(/\D/g, '');
            searchBtn.disabled = raw.length !== 7;
        }
    });
    
    docInput.addEventListener('blur', () => {
        validateIncompleteDocument(docInput.value, currentType, 'Consulta de Agendamentos');
    });

    searchBtn.addEventListener('click', () => {
        if (!validateIncompleteDocument(docInput.value, currentType, 'Consulta de Agendamentos')) return;
        // Check if patient is registered and open booking
        const doc = currentType === 'civil' 
            ? docInput.value.replace(/\D/g, '')
            : docInput.value.replace(/-/g, '');
        
        const patientId = currentType === 'civil' ? `civil_${doc}` : `militar_${doc}`;
        const patient = state.registeredPatients && state.registeredPatients[patientId];
        
        if (!patient) {
            window.showFmuNotice('Paciente não cadastrado. Dirija-se ao balcão para realizar o cadastro antes do agendamento.', 'Cadastro não encontrado');
            return;
        }
        
        // Close this modal and open booking selection
        modal.classList.remove('active');
        window.dispatchEvent(new CustomEvent('openPatientBooking', { detail: { patient } }));
    });
    
    docInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !searchBtn.disabled) {
            searchBtn.click();
        }
    });
}

export function showPatientSearch() {
    const modal = document.getElementById('patientSearchModal');
    const docInput = document.getElementById('patientDoc');
    docInput.value = '';
    document.getElementById('patientSearchResults').innerHTML = '';
    document.getElementById('patientSearchBtn').disabled = true;
    
    // Reset to civil by default
    const patientCivilRadio = document.querySelector('input[name="patientType"][value="civil"]');
    if (patientCivilRadio) patientCivilRadio.checked = true;
    document.getElementById('patientDocLabel').textContent = 'Digite seu CPF:';
    docInput.placeholder = '000.000.000-00';
    docInput.maxLength = 14;
    if (patientCivilRadio) patientCivilRadio.dispatchEvent(new Event('change', { bubbles: true }));
    
    modal.classList.add('active');
    docInput.focus();
}

function searchPatientBookings(type, limitRecords = null) {
    const docInput = document.getElementById('patientDoc');
    const searchResults = document.getElementById('patientSearchResults');
    
    let searchDoc = '';
    if (type === 'civil') {
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
    const now = new Date();
    
    // Search through all bookings
    Object.entries(state.bookings || {}).forEach(([dateKey, bookings]) => {
        const bookingList = Array.isArray(bookings) ? bookings : Object.values(bookings || {});
        bookingList.forEach((booking, index) => {
            const matches = type === 'civil'
                ? (booking.cpf && booking.cpf.replace(/\D/g, '') === searchDoc)
                : (booking.re && booking.re.toUpperCase() === searchDoc.toUpperCase());
            
            if (matches) {
                const [year, month, day] = dateKey.split('-').map(Number);
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
                
                // Determine status
                let status = 'cancelled';
                if (!booking.cancellation && period) {
                    const [endHour, endMinute] = period.end.split(':').map(Number);
                    const bookingEndDateTime = new Date(year, month, day, endHour, endMinute);
                    
                    if (now < bookingEndDateTime) {
                        status = 'scheduled';
                    } else {
                        status = 'completed';
                    }
                }
                
                foundBookings.push({ dateKey, booking, bookingIndex: index, status, period });
            }
        });
    });
    
    if (foundBookings.length === 0) {
        if (type === 'civil') {
            searchResults.innerHTML = '<p class="no-bookings">CPF inexistente.</p>';
        } else {
            searchResults.innerHTML = '<p class="no-bookings">RE inexistente.</p>';
        }
        return;
    }
    
    // Sort by date (newest first)
    foundBookings.sort((a, b) => b.dateKey.localeCompare(a.dateKey));
    
    const totalRecords = foundBookings.length;
    
    // Record limit controls
    let html = '<div style="background: var(--bg-primary); padding: 16px; border-radius: 8px; margin-bottom: 20px;">';
    html += `<p style="font-size: 16px; font-weight: 600; margin-bottom: 12px;">📊 Total de registros encontrados: <strong style="color: #4caf50;">${totalRecords}</strong></p>`;
    html += '<div style="display: flex; gap: 12px; align-items: center; flex-wrap: wrap;">';
    html += '<label style="font-weight: 500;">Exibir:</label>';
    html += '<div style="display: flex; gap: 8px; flex-wrap: wrap;">';
    html += `<button class="btn-secondary" style="margin: 0; padding: 8px 16px;" onclick="window.searchPatientBookingsWithLimit('${type}', null)">Todos (${totalRecords})</button>`;
    html += `<button class="btn-secondary" style="margin: 0; padding: 8px 16px;" onclick="window.searchPatientBookingsWithLimit('${type}', 5)">5 últimos</button>`;
    html += `<button class="btn-secondary" style="margin: 0; padding: 8px 16px;" onclick="window.searchPatientBookingsWithLimit('${type}', 10)">10 últimos</button>`;
    html += '</div>';
    html += '<div style="display: flex; gap: 8px; align-items: center;">';
    html += '<input type="number" id="customRecordLimit" min="1" max="' + totalRecords + '" placeholder="Personalizado" style="width: 120px; padding: 8px; border: 2px solid var(--border-color); background: var(--bg-secondary); color: var(--text-primary); border-radius: 8px; font-size: 14px;">';
    html += `<button class="btn-primary" style="margin: 0; padding: 8px 16px;" onclick="window.applyCustomRecordLimit('${type}')">Aplicar</button>`;
    html += '</div>';
    html += '</div>';
    html += '</div>';
    
    // Apply limit if specified
    const recordsToShow = limitRecords !== null && limitRecords < totalRecords 
        ? foundBookings.slice(0, limitRecords) 
        : foundBookings;
    
    if (limitRecords !== null && limitRecords < totalRecords) {
        html += `<p style="margin-bottom: 12px; color: var(--text-secondary); font-style: italic;">Exibindo ${limitRecords} de ${totalRecords} registros</p>`;
    }
    
    // Separate into categories
    const scheduled = recordsToShow.filter(b => b.status === 'scheduled');
    const completed = recordsToShow.filter(b => b.status === 'completed');
    const cancelled = recordsToShow.filter(b => b.status === 'cancelled');
    
    html += '<div class="report-content">';
    
    if (scheduled.length > 0) {
        html += '<h3 style="color: #4caf50; margin-bottom: 12px;">📅 Agendamentos Futuros</h3>';
        scheduled.forEach(({ dateKey, booking, period }) => {
            html += renderPatientBookingCard(dateKey, booking, period, 'scheduled', months);
        });
    }
    
    if (completed.length > 0) {
        html += '<h3 style="color: #2196F3; margin-top: 24px; margin-bottom: 12px;">✅ Atendimentos Realizados</h3>';
        completed.forEach(({ dateKey, booking, period }) => {
            html += renderPatientBookingCard(dateKey, booking, period, 'completed', months);
        });
    }
    
    if (cancelled.length > 0) {
        html += '<h3 style="color: #f44336; margin-top: 24px; margin-bottom: 12px;">❌ Cancelados</h3>';
        cancelled.forEach(({ dateKey, booking, period }) => {
            html += renderPatientBookingCard(dateKey, booking, period, 'cancelled', months);
        });
    }
    
    html += '</div>';
    searchResults.innerHTML = html;
}


function formatUserCpf(value) {
    return formatCpf(value);
}

function normalizeCpf(value) {
    return String(value || '').replace(/\D/g, '').slice(0, 11);
}

function normalizeEmail(value) {
    return String(value || '').trim().toLowerCase();
}

function getCpfReInputParts(value) {
    const raw = String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    const cpfMode = raw.length > 7;

    if (cpfMode) {
        // Passou de 7 caracteres: trata como CPF e aceita somente numeros.
        const digits = raw.replace(/\D/g, '').slice(0, 11);
        return { raw, cpfMode: true, value: digits, digits };
    }

    // Ate o 6o caractere: somente numeros. 7o caractere: letra ou numero.
    const firstSix = raw.slice(0, 6).replace(/\D/g, '');
    const seventh = raw.length > 6 ? raw.slice(6, 7).replace(/[^A-Z0-9]/g, '') : '';
    const re = (firstSix + seventh).slice(0, 7);
    return { raw, cpfMode: false, value: re, digits: re.replace(/\D/g, '') };
}

function normalizeCpfReRaw(value) {
    return getCpfReInputParts(value).value;
}

function normalizeReValue(value) {
    const raw = String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    const firstSix = raw.slice(0, 6).replace(/\D/g, '');
    const seventh = raw.length > 6 ? raw.slice(6, 7).replace(/[^A-Z0-9]/g, '') : '';
    return (firstSix + seventh).slice(0, 7);
}

function formatCpfPartial(digits) {
    const clean = String(digits || '').replace(/\D/g, '').slice(0, 11);
    if (clean.length > 9) return clean.replace(/(\d{3})(\d{3})(\d{3})(\d{0,2})/, '$1.$2.$3-$4');
    if (clean.length > 6) return clean.replace(/(\d{3})(\d{3})(\d{1,3})/, '$1.$2.$3');
    if (clean.length > 3) return clean.replace(/(\d{3})(\d{1,3})/, '$1.$2');
    return clean;
}

function validateIncompleteDocument(value, type, title = 'Documento incompleto') {
    const clean = type === 'civil' ? normalizeCpf(value) : normalizeReValue(value);
    if (!clean) return true;
    if (type === 'civil' && clean.length < 11) {
        window.showFmuNotice('CPF incompleto. Digite os 11 números do CPF para continuar.', title);
        return false;
    }
    if (type === 'militar' && clean.length < 6) {
        window.showFmuNotice('o R.E deve conter 6 digitos!', title);
        return false;
    }
    return true;
}

function detectCpfOrReFromDigits(value) {
    const parts = getCpfReInputParts(value);
    const clean = parts.value;
    if (parts.cpfMode) {
        if (/^\d{11}$/.test(clean)) return { type: 'civil', value: clean, digits: clean };
        return { type: '', value: clean, digits: clean };
    }
    if (/^\d{6}[A-Z0-9]$/.test(clean)) return { type: 'militar', value: clean, digits: clean.replace(/\D/g, '') };
    return { type: '', value: clean, digits: clean.replace(/\D/g, '') };
}

function formatCpfOrReInput(value) {
    const parts = getCpfReInputParts(value);
    const clean = parts.value;

    if (parts.cpfMode) {
        // CPF: remove letras automaticamente e aplica mascara parcial de CPF.
        return formatCpfPartial(clean);
    }

    // RE: ate 6 digitos numericos; 7o caractere pode ser letra ou numero.
    if (/^\d{6}[A-Z0-9]$/.test(clean)) return `${clean.slice(0, 6)}-${clean.slice(6, 7)}`;
    return clean;
}

function findRegisteredPatientByCpfOrRe(docValue) {
    const parts = getCpfReInputParts(docValue);
    const clean = parts.value;
    if (parts.cpfMode && !/^\d{11}$/.test(clean)) return null;
    if (!parts.cpfMode && !/^\d{6}[A-Z0-9]$/.test(clean)) return null;

    return Object.values(state.registeredPatients || {}).find((patient) => {
        const cpf = normalizeCpf(patient.cpf);
        const re = normalizeReValue(patient.re);
        return cpf === clean || re === clean;
    }) || null;
}

function validateDetectedCpfOrRe(value, title = 'Verificação de Cadastro') {
    const parts = getCpfReInputParts(value);
    const clean = parts.value;
    if (!clean) return true;
    if (parts.cpfMode) {
        if (clean.length < 11) {
            window.showFmuNotice('CPF incompleto. Como passou de 7 caracteres, o sistema considera CPF. Digite os 11 números do CPF.', title);
            return false;
        }
        if (!/^\d{11}$/.test(clean)) {
            window.showFmuNotice('CPF inválido. CPF deve conter apenas números.', title);
            return false;
        }
        return true;
    }
    if (clean.length < 7) {
        window.showFmuNotice('RE incompleto. Digite 6 números e o 7º caractere, que pode ser letra ou número.', title);
        return false;
    }
    if (!/^\d{6}[A-Z0-9]$/.test(clean)) {
        window.showFmuNotice('RE inválido. Os 6 primeiros caracteres devem ser números e o 7º pode ser letra ou número.', title);
        return false;
    }
    return true;
}

function formatPatientDetailsForConfirm(patient) {
    if (!patient) return 'Registro localizado.';
    const docLabel = patient.type === 'civil' ? 'CPF' : 'RE';
    const doc = patient.type === 'civil' ? formatCpf(patient.cpf) : formatRe(patient.re);
    return [
        'Já existe um cadastro com este registro:' ,
        '',
        'Nome: ' + (patient.name || ''),
        docLabel + ': ' + doc,
        'Email: ' + (patient.email || ''),
        'WhatsApp: ' + (patient.phone || ''),
        patient.rank ? 'Graduação: ' + patient.rank : '',
        patient.unit ? 'Unidade: ' + (patient.unit === 'copom' ? 'COPOM' : 'Outros') : '',
        '',
        'Deseja atualizar o cadastro existente ou cancelar?'
    ].filter(Boolean).join('\n');
}

function formatUserDetailsForConfirm(user) {
    if (!user) return 'Usuário localizado.';
    return [
        'Já existe um usuário com este CPF:' ,
        '',
        'Nome: ' + (user.name || ''),
        'CPF: ' + formatUserCpf(user.cpf),
        'Especialidade: ' + (user.specialty || ''),
        'Email: ' + (user.email || ''),
        '',
        'Deseja atualizar o usuário existente ou cancelar?'
    ].filter(Boolean).join('\n');
}

function localizarPacienteDuplicado({ cpf = '', re = '', email = '', excludeId = '' } = {}) {
    const cleanCpf = normalizeCpf(cpf);
    const cleanRe = normalizeReValue(re);
    const cleanEmail = normalizeEmail(email);
    for (const [id, patient] of Object.entries(state.registeredPatients || {})) {
        if (excludeId && id === excludeId) continue;
        if (cleanCpf && normalizeCpf(patient.cpf) === cleanCpf) return { id, patient, field: 'CPF' };
        if (cleanRe && normalizeReValue(patient.re) === cleanRe) return { id, patient, field: 'RE' };
        if (cleanEmail && normalizeEmail(patient.email) === cleanEmail) return { id, patient, field: 'email' };
    }
    return null;
}

function localizarUsuarioDuplicado({ cpf = '', email = '', excludeId = '' } = {}) {
    const cleanCpf = normalizeCpf(cpf);
    const cleanEmail = normalizeEmail(email);
    for (const [id, user] of Object.entries(state.systemUsers || {})) {
        if (excludeId && id === excludeId) continue;
        if (cleanCpf && normalizeCpf(user.cpf) === cleanCpf) return { id, user, field: 'CPF' };
        if (cleanEmail && normalizeEmail(user.email) === cleanEmail) return { id, user, field: 'email' };
    }
    return null;
}

function findGlobalDuplicate({ cpf = '', re = '', email = '', excludePatientId = '', excludeUserId = '' } = {}) {
    const cleanCpf = normalizeCpf(cpf);
    const cleanRe = normalizeReValue(re);
    const cleanEmail = normalizeEmail(email);

    for (const [id, patient] of Object.entries(state.registeredPatients || {})) {
        if (excludePatientId && id === excludePatientId) continue;
        if (cleanCpf && normalizeCpf(patient.cpf) === cleanCpf) return 'Já existe cadastro com este CPF.';
        if (cleanRe && normalizeReValue(patient.re) === cleanRe) return 'Já existe cadastro com este RE.';
        if (cleanEmail && normalizeEmail(patient.email) === cleanEmail) return 'Já existe cadastro com este email.';
    }

    for (const [id, user] of Object.entries(state.systemUsers || {})) {
        if (excludeUserId && id === excludeUserId) continue;
        if (cleanCpf && normalizeCpf(user.cpf) === cleanCpf) return 'Já existe usuário cadastrado com este CPF.';
        if (cleanEmail && normalizeEmail(user.email) === cleanEmail) return 'Já existe usuário cadastrado com este email.';
    }

    return '';
}

function generateTemporaryPassword(length = 8) {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let password = '';
    for (let i = 0; i < length; i++) {
        password += chars[Math.floor(Math.random() * chars.length)];
    }
    return password;
}

function getUserIdFromCpf(cpf) {
    return `user_${normalizeCpf(cpf)}`;
}

function renderSpecialtyOptions() {
    const select = document.getElementById('userSpecialtySelect');
    if (!select) return;
    const specialties = Array.isArray(state.specialties) && state.specialties.length
        ? state.specialties
        : ['Fisioterapeuta', 'Massagista'];
    select.innerHTML = specialties.map(s => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join('');
}

function clearUserForm() {
    ['userEditId','userNameInput','userCpfInput','userEmailInput','userPasswordInput','newSpecialtyInput'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    const cpfInput = document.getElementById('userCpfInput');
    if (cpfInput) cpfInput.dataset.updateUserId = '';
    renderSpecialtyOptions();
}

function renderSystemUsersList() {
    const list = document.getElementById('systemUsersList');
    if (!list) return;
    const users = Object.entries(state.systemUsers || {}).sort((a, b) => String(a[1].name || '').localeCompare(String(b[1].name || '')));
    if (!users.length) {
        list.innerHTML = '<p style="color: var(--text-secondary); font-style: italic;">Nenhum usuário cadastrado.</p>';
        return;
    }

    list.innerHTML = users.map(([id, user]) => `
        <div style="padding: 12px; margin-bottom: 8px; border: 2px solid var(--border-color); border-radius: 8px; background: var(--bg-secondary);">
            <div style="display:flex; justify-content:space-between; gap:12px; align-items:center; flex-wrap:wrap;">
                <div>
                    <strong>${escapeHtml(user.name || '')}</strong><br>
                    <small>CPF: ${escapeHtml(formatUserCpf(user.cpf))} | Especialidade: ${escapeHtml(user.specialty || '')}</small><br>
                    <small>Email: ${escapeHtml(user.email || '')} ${user.mustChangePassword ? '| Senha temporária pendente' : ''}</small>
                </div>
                <div class="user-card-actions">
                    <button class="btn-secondary" type="button" onclick="window.editSystemUser('${id}')">Editar</button>
                    <button class="btn-danger" type="button" onclick="window.deleteSystemUser('${id}')">Excluir</button>
                </div>
            </div>
        </div>
    `).join('');
}

window.editSystemUser = function(userId) {
    const user = state.systemUsers?.[userId];
    if (!user) return;
    document.getElementById('userEditId').value = userId;
    document.getElementById('userNameInput').value = user.name || '';
    document.getElementById('userCpfInput').value = formatUserCpf(user.cpf);
    document.getElementById('userCpfInput').dataset.updateUserId = userId;
    document.getElementById('userEmailInput').value = user.email || '';
    document.getElementById('userPasswordInput').value = '';
    renderSpecialtyOptions();
    const specialtySelect = document.getElementById('userSpecialtySelect');
    if (specialtySelect) specialtySelect.value = user.specialty || specialtySelect.value;
};

window.deleteSystemUser = async function(userId) {
    const confirmed = await window.showFmuConfirm('Excluir este usuário do sistema?', 'Excluir usuário', 'Excluir', 'Cancelar');
    if (!confirmed) return;
    delete state.systemUsers[userId];
    saveState();
    renderSystemUsersList();
    clearUserForm();
};

async function saveSystemUserFromForm() {
    const editId = document.getElementById('userEditId').value;
    const name = document.getElementById('userNameInput').value.trim().toUpperCase();
    const cpf = normalizeCpf(document.getElementById('userCpfInput').value);
    const specialty = document.getElementById('userSpecialtySelect').value;
    const email = document.getElementById('userEmailInput').value.trim();
    const passwordField = document.getElementById('userPasswordInput').value.trim();

    if (!name || cpf.length !== 11 || !specialty || !email.includes('@')) {
        window.showFmuNotice('Preencha nome, CPF com 11 dígitos, especialidade e email válido.', 'Atenção');
        return;
    }

    state.systemUsers = state.systemUsers || {};
    const calculatedUserId = getUserIdFromCpf(cpf);
    const updateUserId = document.getElementById('userCpfInput')?.dataset.updateUserId || editId || calculatedUserId;
    const previous = updateUserId ? state.systemUsers?.[updateUserId] : state.systemUsers?.[calculatedUserId];
    const duplicateMessage = findGlobalDuplicate({ cpf, email, excludeUserId: updateUserId });
    if (duplicateMessage) {
        window.showFmuNotice(duplicateMessage + ' O sistema não aceita CPF, RE ou email repetidos, mesmo em funções diferentes.', 'Cadastro duplicado');
        return;
    }

    const userId = calculatedUserId;
    if (updateUserId && updateUserId !== userId && state.systemUsers[updateUserId]) {
        delete state.systemUsers[updateUserId];
    }
    const temporaryPassword = passwordField || (previous ? previous.password : generateTemporaryPassword());
    const mustChangePassword = passwordField ? true : (!previous || previous.mustChangePassword === true);

    state.systemUsers[userId] = {
        name,
        cpf,
        specialty,
        email,
        password: temporaryPassword,
        mustChangePassword,
        createdAt: previous?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };

    saveState();
    renderSystemUsersList();
    clearUserForm();

    const result = await sendUserTemporaryPasswordEmail({
        name,
        cpf,
        cpfFormatted: formatCpf(cpf),
        specialty,
        email,
        temporaryPassword
    });

    if (result.ok) {
        window.showFmuNotice(previous ? 'Cadastro atualizado com sucesso. Senha temporária enviada por e-mail.' : 'Usuário salvo e senha temporária enviada por e-mail.', 'Cadastro de Usuário');
    } else {
        window.showFmuNotice(previous ? `Cadastro atualizado com sucesso. Não foi possível enviar o e-mail automaticamente: ${result.reason || 'EmailJS não configurado.'}\n\nSenha temporária: ${temporaryPassword}` : `Usuário salvo. Não foi possível enviar o e-mail automaticamente: ${result.reason || 'EmailJS não configurado.'}\n\nSenha temporária: ${temporaryPassword}`, 'Cadastro de Usuário');
    }
}

function initializeUserRegistrationModal() {
    const modal = document.getElementById('userRegistrationModal');
    if (!modal) return;
    const closeBtn = document.getElementById('closeUserRegistration');
    const saveBtn = document.getElementById('saveUserBtn');
    const clearBtn = document.getElementById('clearUserFormBtn');
    const addSpecialtyBtn = document.getElementById('addSpecialtyBtn');
    const cpfInput = document.getElementById('userCpfInput');
    const nameInput = document.getElementById('userNameInput');

    const openModal = () => {
        renderSpecialtyOptions();
        renderSystemUsersList();
        modal.classList.add('active');
    };

    window.addEventListener('showUserRegistration', openModal);

    closeBtn?.addEventListener('click', () => modal.classList.remove('active'));
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.classList.remove('active'); });
    clearBtn?.addEventListener('click', clearUserForm);
    saveBtn?.addEventListener('click', saveSystemUserFromForm);

    nameInput?.addEventListener('input', () => { nameInput.value = nameInput.value.toUpperCase(); });
    cpfInput?.addEventListener('input', (event) => {
        let digits = normalizeCpf(event.target.value);
        event.target.value = formatCpf(digits);
    });
    cpfInput?.addEventListener('blur', async () => {
        const cpf = normalizeCpf(cpfInput.value);
        if (cpf && cpf.length < 11) {
            window.showFmuNotice('CPF incompleto. Digite os 11 números do CPF do especialista.', 'CPF incompleto');
            return;
        }
        if (cpf.length === 11) {
            const editId = document.getElementById('userEditId')?.value || cpfInput.dataset.updateUserId || '';
            const duplicateUser = localizarUsuarioDuplicado({ cpf, excludeId: editId });
            if (duplicateUser) {
                const atualizar = await window.showFmuConfirm(formatUserDetailsForConfirm(duplicateUser.user), 'Usuário já existente', 'Atualizar existente', 'Cancelar');
                if (atualizar) {
                    window.editSystemUser(duplicateUser.id);
                    window.showFmuNotice('Dados carregados para atualização. Confira as informações e clique em Salvar Usuário.', 'Atualização de usuário');
                } else {
                    cpfInput.value = '';
                    cpfInput.dataset.updateUserId = '';
                }
                return;
            }
            const duplicatePatient = localizarPacienteDuplicado({ cpf });
            if (duplicatePatient) {
                window.showFmuNotice(formatPatientDetailsForConfirm(duplicatePatient.patient).replace('Deseja atualizar o cadastro existente ou cancelar?', 'Este CPF já está vinculado a um paciente. O sistema não aceita CPF repetido em funções diferentes.'), 'Cadastro duplicado');
            }
        }
    });
    document.getElementById('userEmailInput')?.addEventListener('blur', async () => {
        const editId = document.getElementById('userEditId')?.value || '';
        const cpf = normalizeCpf(cpfInput?.value || '');
        const email = normalizeEmail(document.getElementById('userEmailInput')?.value || '');
        if (!email) return;
        const duplicated = findGlobalDuplicate({ cpf, email, excludeUserId: editId || getUserIdFromCpf(cpf) });
        if (duplicated) {
            const duplicateUser = localizarUsuarioDuplicado({ email, excludeId: editId || getUserIdFromCpf(cpf) });
            if (duplicateUser) {
                const atualizar = await window.showFmuConfirm(formatUserDetailsForConfirm(duplicateUser.user), 'Usuário já existente', 'Atualizar existente', 'Cancelar');
                if (atualizar) window.editSystemUser(duplicateUser.id);
            } else {
                window.showFmuNotice(duplicated, 'Cadastro duplicado');
            }
        }
    });

    addSpecialtyBtn?.addEventListener('click', () => {
        const input = document.getElementById('newSpecialtyInput');
        const value = String(input.value || '').trim();
        if (!value) return;
        state.specialties = Array.isArray(state.specialties) ? state.specialties : ['Fisioterapeuta', 'Massagista'];
        if (!state.specialties.some(s => s.toUpperCase() === value.toUpperCase())) {
            state.specialties.push(value);
            saveState();
        }
        input.value = '';
        renderSpecialtyOptions();
        document.getElementById('userSpecialtySelect').value = value;
    });
}

function initializeEmailConfigModal() {
    const modal = document.getElementById('emailConfigModal');
    const closeBtn = document.getElementById('closeEmailConfig');
    const cancelBtn = document.getElementById('cancelEmailConfig');
    const saveBtn = document.getElementById('saveEmailConfig');
    
    closeBtn.addEventListener('click', () => {
        modal.classList.remove('active');
    });
    
    cancelBtn.addEventListener('click', () => {
        modal.classList.remove('active');
    });
    
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.classList.remove('active');
        }
    });
    
    saveBtn.addEventListener('click', () => {
        const emailConfig = {
            provider: 'emailjs',
            publicKey: document.getElementById('emailJsPublicKey').value.trim(),
            serviceId: document.getElementById('emailJsServiceId').value.trim(),
            templateId: document.getElementById('emailJsTemplateId').value.trim(),
            fromName: document.getElementById('emailFromName').value.trim() || 'FMU',
            replyTo: document.getElementById('emailReplyTo').value.trim(),
            adminEmail: document.getElementById('emailAdminCopy').value.trim(),
            autoSend: document.getElementById('emailAutoSend').checked
        };
        
        if (!emailConfig.publicKey || !emailConfig.serviceId || !emailConfig.templateId) {
            window.showFmuNotice('Preencha EMAILJS_PUBLIC_KEY, EMAILJS_SERVICE_ID e EMAILJS_TEMPLATE_ID.', 'Atenção');
            return;
        }
        
        state.emailConfig = emailConfig;
        saveState();
        window.showFmuNotice('Configuração de EmailJS salva com sucesso!', 'Sucesso');
        modal.classList.remove('active');
    });
}

// Make these functions globally available
window.searchPatientBookingsWithLimit = function(type, limit) {
    searchPatientBookings(type, limit);
};

window.applyCustomRecordLimit = function(type) {
    const customLimit = parseInt(document.getElementById('customRecordLimit').value);
    if (customLimit && customLimit > 0) {
        searchPatientBookings(type, customLimit);
    }
};

function renderPatientBookingCard(dateKey, booking, period, status, months) {
    const [year, month, day] = dateKey.split('-').map(Number);
    const periodName = period ? period.name : 'Período desconhecido';
    const periodTime = period ? `${period.start} - ${period.end}` : '';
    const formattedDoc = booking.cpf 
        ? booking.cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
        : booking.re || 'N/A';
    const docLabel = booking.type === 'militar' ? 'RE' : 'CPF';
    const patientType = booking.type === 'militar' ? 'Militar' : 'Civil';
    
    let statusBadge = '';
    if (status === 'scheduled') {
        statusBadge = '<span style="background: #4caf50; color: white; padding: 4px 12px; border-radius: 4px; font-size: 12px; font-weight: 600;">AGENDADO</span>';
    } else if (status === 'completed') {
        statusBadge = '<span style="background: #2196F3; color: white; padding: 4px 12px; border-radius: 4px; font-size: 12px; font-weight: 600;">REALIZADO</span>';
    } else if (status === 'cancelled') {
        statusBadge = '<span style="background: #f44336; color: white; padding: 4px 12px; border-radius: 4px; font-size: 12px; font-weight: 600;">CANCELADO</span>';
    }
    
    return `
        <div class="report-booking-card" style="margin-bottom: 12px; page-break-inside: avoid;">
            <table style="width: 100%; border-collapse: collapse;">
                <tr style="background: var(--bg-primary);">
                    <td colspan="2" style="padding: 12px; border-bottom: 2px solid var(--border-color);">
                        <strong style="font-size: 16px;">${day} de ${months[month]} de ${year}</strong>
                        <span style="float: right;">${statusBadge}</span>
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
                    <td style="padding: 8px; width: 30%; font-weight: 600;">Período:</td>
                    <td style="padding: 8px;">${periodName} (${periodTime})</td>
                </tr>
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
                    <td style="padding: 8px;">${booking.phone}</td>
                </tr>
                ${booking.complaint ? `
                <tr>
                    <td style="padding: 8px; width: 30%; font-weight: 600; vertical-align: top;">Queixa:</td>
                    <td style="padding: 8px;">${booking.complaint}</td>
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
                ` : ''}
            </table>
        </div>
    `;
}
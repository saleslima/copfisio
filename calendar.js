// Calendar rendering module
import { state, saveState } from './state.js';

export function renderCalendar() {
    const calendar = document.getElementById('calendar');
    const title = document.getElementById('calendarTitle');
    const months = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 
                    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

    title.textContent = `${months[state.currentMonth]} ${state.currentYear}`;

    const key = `${state.currentYear}-${state.currentMonth}`;
    const config = state.configurations[key];

    calendar.innerHTML = '';

    renderCalendarHeader(calendar);
    renderCalendarDays(calendar, config);
}

function renderCalendarHeader(calendar) {
    const dayNames = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
    dayNames.forEach(name => {
        const dayHeader = document.createElement('div');
        dayHeader.className = 'calendar-day empty';
        dayHeader.style.fontWeight = '600';
        dayHeader.textContent = name;
        calendar.appendChild(dayHeader);
    });
}

function renderCalendarDays(calendar, config) {
    const firstDay = new Date(state.currentYear, state.currentMonth, 1).getDay();
    const daysInMonth = new Date(state.currentYear, state.currentMonth + 1, 0).getDate();

    for (let i = 0; i < firstDay; i++) {
        const emptyDay = document.createElement('div');
        emptyDay.className = 'calendar-day empty';
        calendar.appendChild(emptyDay);
    }

    for (let day = 1; day <= daysInMonth; day++) {
        const dayElement = createDayElement(day, config, daysInMonth);
        calendar.appendChild(dayElement);
    }
}

function createDayElement(day, config, daysInMonth) {
    const dayElement = document.createElement('div');
    dayElement.className = 'calendar-day';
    dayElement.innerHTML = `<span>${day}</span>`;

    const dateKey = `${state.currentYear}-${state.currentMonth}-${day}`;
    const isBlocked = state.blockedDays[dateKey];

    if (isBlocked) {
        dayElement.classList.add('blocked');
        dayElement.title = 'Dia bloqueado pelo administrador';
    } else {
        const date = new Date(state.currentYear, state.currentMonth, day);
        const dayOfWeek = date.getDay();

        // Check if there's a custom configuration for this specific day
        const customConfig = state.customDayConfigurations && state.customDayConfigurations[dateKey];

        let effectiveConfig = null;

        if (customConfig) {
            effectiveConfig = customConfig;
        } else if (config && config.daysConfig) {
            const withinRange = day >= (config.startDay || 1) && day <= (config.endDay || daysInMonth);
            if (withinRange && config.daysConfig[dayOfWeek]) {
                effectiveConfig = config.daysConfig[dayOfWeek];
            }
        }

        if (!effectiveConfig) {
            dayElement.classList.add('disabled');
        } else {
            const hasAvailableSlots = applyBookingStatus(dayElement, dateKey, effectiveConfig);
            if (hasAvailableSlots) {
                dayElement.addEventListener('click', () => {
                    selectCalendarDay(dayElement);
                });

                dayElement.addEventListener('dblclick', () => {
                    selectCalendarDay(dayElement);
                    // Check if booking password is enabled
                    if (state.bookingPassword && state.bookingPassword.enabled) {
                        showBookingPasswordModal(day);
                    } else {
                        // Show patient verification modal
                        showPatientVerificationModal(day);
                    }
                });
            }
        }
    }

    return dayElement;
}


function selectCalendarDay(dayElement) {
    const calendar = document.getElementById('calendar');
    if (!calendar || !dayElement) return;

    calendar.querySelectorAll('.calendar-day.selected').forEach((selectedDay) => {
        selectedDay.classList.remove('selected');
    });

    dayElement.classList.add('selected');
}

function showBookingPasswordModal(day) {
    const modal = document.getElementById('bookingPasswordModal');
    modal.dataset.day = day;
    modal.classList.add('active');
    document.getElementById('bookingPasswordInput').focus();
}

function showPatientVerificationModal(day) {
    const modal = document.getElementById('patientVerificationModal');
    modal.dataset.day = day;
    
    // Reset form
    document.getElementById('verifyDoc').value = '';
    const verifyCivilRadio = document.querySelector('input[name="verifyPatientType"][value="civil"]');
    if (verifyCivilRadio) verifyCivilRadio.checked = true;
    document.getElementById('verifyDocLabel').textContent = 'Digite seu CPF:';
    document.getElementById('verifyDoc').placeholder = '000.000.000-00';
    document.getElementById('verifyDoc').maxLength = 14;
    document.getElementById('verifyPatientBtn').disabled = true;
    if (verifyCivilRadio) verifyCivilRadio.dispatchEvent(new Event('change', { bubbles: true }));
    
    modal.classList.add('active');
    document.getElementById('verifyDoc').focus();
}

function applyBookingStatus(dayElement, dateKey, config) {
    const dayBookings = state.bookings[dateKey] || [];
    const activeBookings = dayBookings.filter(b => !b.cancellation);

    let totalSlots = 0;
    let bookedSlots = 0;

    config.periods.forEach((period, index) => {
        totalSlots += period.slots || 1;
        const periodBookings = activeBookings.filter(b => b.periodIndex === index);
        bookedSlots += periodBookings.length;
    });

    const availableSlots = Math.max(totalSlots - bookedSlots, 0);
    dayElement.dataset.availableSlots = String(availableSlots);
    dayElement.dataset.totalSlots = String(totalSlots);

    if (availableSlots > 0) {
        dayElement.classList.add(bookedSlots === 0 ? 'available' : 'partially-booked');
        dayElement.title = `${availableSlots} vaga(s) disponível(is). Dê dois cliques para agendar.`;
        return true;
    }

    dayElement.classList.add('fully-booked');
    dayElement.title = 'Sem vagas disponíveis neste dia';
    return false;
}

export function renderBlockedCalendar() {
    const calendar = document.getElementById('blockedCalendar');
    const title = document.getElementById('blockedCalendarTitle');
    const months = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 
                    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

    title.textContent = `${months[state.blockedCalendarMonth]} ${state.blockedCalendarYear}`;

    calendar.innerHTML = '';

    renderCalendarHeader(calendar);
    renderBlockedCalendarDays(calendar);
}

function renderBlockedCalendarDays(calendar) {
    const firstDay = new Date(state.blockedCalendarYear, state.blockedCalendarMonth, 1).getDay();
    const daysInMonth = new Date(state.blockedCalendarYear, state.blockedCalendarMonth + 1, 0).getDate();

    for (let i = 0; i < firstDay; i++) {
        const emptyDay = document.createElement('div');
        emptyDay.className = 'calendar-day empty';
        calendar.appendChild(emptyDay);
    }

    for (let day = 1; day <= daysInMonth; day++) {
        const dayElement = document.createElement('div');
        dayElement.className = 'calendar-day';
        dayElement.textContent = day;

        const dateKey = `${state.blockedCalendarYear}-${state.blockedCalendarMonth}-${day}`;
        const isBlocked = state.blockedDays[dateKey];

        if (isBlocked) {
            dayElement.classList.add('blocked');
        } else {
            dayElement.classList.add('available');
        }

        dayElement.addEventListener('click', () => {
            toggleBlockedDay(dateKey);
        });

        calendar.appendChild(dayElement);
    }
}

export function toggleBlockedDay(dateKey) {
    if (state.blockedDays[dateKey]) {
        delete state.blockedDays[dateKey];
    } else {
        // Check only for active (non-cancelled) bookings
        const activeBookings = state.bookings[dateKey]?.filter(b => !b.cancellation) || [];
        if (activeBookings.length > 0) {
            window.showFmuNotice('Não é possível bloquear este dia. Existem agendamentos ativos que precisam ser cancelados primeiro.', 'Atenção');
            return;
        }
        state.blockedDays[dateKey] = true;
    }
    saveState();
    renderBlockedCalendar();
    renderCalendar();
}

export function initializeUserPanel() {
    document.getElementById('prevMonth').addEventListener('click', () => {
        state.currentMonth--;
        if (state.currentMonth < 0) {
            state.currentMonth = 11;
            state.currentYear--;
        }
        renderCalendar();
    });

    document.getElementById('nextMonth').addEventListener('click', () => {
        state.currentMonth++;
        if (state.currentMonth > 11) {
            state.currentMonth = 0;
            state.currentYear++;
        }
        renderCalendar();
    });

    renderCalendar();
}
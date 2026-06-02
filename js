function openCustomizeDayForm(day, dateKey) {
    // ... existing code ...
    const periodsToShow = customConfig ? customConfig.periods : (baseConfig ? baseConfig.periods : []);

    periodsContainer.innerHTML = '';

    periodsToShow.forEach((period, index) => {
        const periodItem = document.createElement('div');
        periodItem.className = 'period-item';
-        periodItem.innerHTML = `
-            <input type="text" placeholder="Nome do período" value="${period.name}" class="period-name">
-            <input type="time" value="${period.start}" class="period-start">
-            <input type="time" value="${period.end}" class="period-end">
-            <input type="number" placeholder="Vagas" value="${period.slots || 1}" min="1" class="period-slots">
-            <button class="remove-period" ${periodsToShow.length === 1 ? 'disabled' : ''}>×</button>
-        `;
+        periodItem.innerHTML = `
+            <select class="period-name">
+                <option value="Manhã">Manhã</option>
+                <option value="Tarde">Tarde</option>
+                <option value="Noite">Noite</option>
+            </select>
+            <input type="time" value="${period.start}" class="period-start">
+            <input type="time" value="${period.end}" class="period-end">
+            <input type="number" placeholder="Vagas" value="${period.slots || 1}" min="1" class="period-slots">
+            <button class="remove-period" ${periodsToShow.length === 1 ? 'disabled' : ''}>×</button>
+        `;
+
+        const select = periodItem.querySelector('.period-name');
+        if (select) {
+            if (['Manhã', 'Tarde', 'Noite'].includes(period.name)) {
+                select.value = period.name;
+            }
+        }
        // ... existing code ...
    });
    // ... existing code ...

    document.getElementById('addCustomPeriodBtn').onclick = () => {
        const container = document.getElementById('customDayPeriodsContainer');
        
        const periodItem = document.createElement('div');
        periodItem.className = 'period-item';
        periodItem.innerHTML = `
-            <input type="text" placeholder="Nome do período" class="period-name">
+            <select class="period-name">
+                <option value="Manhã">Manhã</option>
+                <option value="Tarde">Tarde</option>
+                <option value="Noite">Noite</option>
+            </select>
            <input type="time" class="period-start">
            <input type="time" class="period-end">
            <input type="number" placeholder="Vagas" min="1" value="5" class="period-slots">
            <button class="remove-period">×</button>
        `;
        // ... existing code ...
    };
    // ... existing code ...
}


/* ---------- STATE & CONFIG ---------- */
const MS_DAY = 86400000;
const CLOSED_STATUS = 'TERMINADO';
const UNASSIGNED_LABEL = 'Sin Asignar';

const state = {
  allData: [],
  filteredData: [],
  charts: {},
  detailsDataTable: null,
  avgModuleDataTable: null,
};

const todayMarkerId = 'today_marker';

const COLORS = ['#1976d2', '#42a5f5', '#00acc1', '#546e7a', '#81c784', '#ffb74d', '#9e9e9e', '#1e88e5'];

const GANTT_CATEGORY_COLORS = {
    'Digitalización': '#3b82f6', 'Legajo Digital': '#ef4444', 'Recibos de Sueldo': '#f97316',
    'Vacaciones': '#eab308', 'Libro Sueldo Digital': '#22c55e', 'Otro': '#8b5cf6', 'N/A': '#64748b',
    'LIBRO SUELDO DIGITAL': '#22c55e', 'RECIBOS DE SUELDO': '#f97316', 'LEGAJO DIGITAL': '#ef4444',
    'DIGITALIZACION': '#3b82f6', 'VACACIONES': '#eab308'
};

const CHART_CONFIG = {
    priority: { id: 'priorityChart', type: 'doughnut', title: 'Prioridades' },
    status: { id: 'statusChart', type: 'doughnut', title: 'Estados' },
    assignee: { id: 'assigneeChart', type: 'bar', title: 'Tickets por Implementador', options: { 
        indexAxis: 'y', 
        plugins: { 
            legend: { display: false },
            datalabels: { display: true, color: '#fff', font: { weight: 'bold' }, anchor: 'center', align: 'center' }
        } 
    }},
    comercial: { id: 'comercialChart', type: 'doughnut', title: 'Comercial Responsable' },
    monthlyStacked: { id: 'monthlyStackedChart', type: 'bar', title: 'Tickets Mensuales por Categoría', options: { scales: { x: { stacked: true }, y: { stacked: true } } } }
};

const FILTERS_CONFIG = [
  { key: 'Priority', label: 'Prioridad' }, { key: 'Status', label: 'Estado' },
  { key: 'Assignee', label: 'Implementador' }, { key: 'Custom field (Comercial Responsable)', label: 'Comercial Responsable' },
  { key: 'Category', label: 'Categoría' }, { key: 'CompanyName', label: 'Empresa' }
];

/* ---------- PLUGINS & HELPERS ---------- */
const doughnutInteractiveCenter = {
  id: 'doughnutInteractiveCenter',
  afterDraw(chart) {
    if (chart.config.type !== 'doughnut' || !chart.data.datasets[0].data.length) return;
    const { ctx, width, height } = chart;
    ctx.restore();
    let mainText = '', subText = 'Total';
    const total = chart.data.datasets[0].data.reduce((a, b) => a + b, 0);
    const activeElements = chart.getActiveElements();
    if (activeElements.length > 0) {
        const activeEl = activeElements[0];
        mainText = chart.data.datasets[activeEl.datasetIndex].data[activeEl.index];
        subText = chart.data.labels[activeEl.index];
    } else { mainText = total; }
    const textColor = getComputedStyle(document.documentElement).getPropertyValue('--text-primary').trim();
    const secondaryTextColor = getComputedStyle(document.documentElement).getPropertyValue('--text-secondary').trim();
    const centerX = width / 2, centerY = height / 2;
    ctx.font = `bold 2em sans-serif`; ctx.fillStyle = textColor; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.fillText(mainText, centerX, centerY);
    ctx.font = `normal 1em sans-serif`; ctx.fillStyle = secondaryTextColor; ctx.textBaseline = 'top';
    ctx.fillText(subText, centerX, centerY + 5);
    ctx.save();
  }
};

Chart.register(doughnutInteractiveCenter, ChartDataLabels);

function hexToRgba(hex, alpha) {
    const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/* ---------- DOM READY & EVENT LISTENERS ---------- */
document.addEventListener('DOMContentLoaded', () => {
  document.querySelector('img[alt=\"Logo Cardinal Systems\"]')?.remove();
  $('#footer-year').text(new Date().getFullYear());
  setupEventListeners();
  initializeTheme();
  setupGantt();
});

function setupEventListeners() {
    $('#file-upload').on('change', handleFileUpload);
    $('#modal-close-btn').on('click', () => toggleModal(false));
    $('#clear-filters-btn').on('click', clearFilters);
    $('#theme-checkbox').on('change', toggleTheme);
    $('#gantt-fullscreen-btn').on('click', toggleGanttFullscreen);
    $('#gantt-expand-all-btn').on('click', expandAllGantt);
    $('#gantt-collapse-all-btn').on('click', collapseAllGantt);
    $('#kpi-total-card').on('click', () => showDetailsModal(null, state.filteredData, 'Todos los tickets del período'));
    $('#kpi-closed-card').on('click', () => showDetailsModal(null, state.filteredData.filter(r => r.Status === CLOSED_STATUS), 'Implementaciones Cerradas'));
    $('#kpi-open-card').on('click', () => showDetailsModal(null, state.filteredData.filter(r => r.Status !== CLOSED_STATUS), 'Implementaciones Abiertas'));
    $('#kpi-unassigned-card').on('click', () => showDetailsModal(null, state.filteredData.filter(r => r.Assignee === UNASSIGNED_LABEL), 'Tickets sin asignar'));
    $(document).on('click', (event) => { if (!$(event.target).closest('.custom-filter-container').length) $('.custom-filter-dropdown').slideUp(200); });
}

/* ---------- THEME & LOADER ---------- */
function toggleTheme() {
    const isDark = $('#theme-checkbox').is(':checked');
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
    if (state.allData.length) renderDashboard();
}

function initializeTheme() {
    const savedTheme = localStorage.getItem('theme') || 'dark';
    document.documentElement.setAttribute('data-theme', savedTheme);
    $('#theme-checkbox').prop('checked', savedTheme === 'dark');
}

function toggleLoader(show) { $('#loader-overlay').toggleClass('hidden', !show); }

/* ---------- FILE & DATA HANDLING ---------- */
function handleFileUpload(e) {
  const file = e.target.files[0];
  if (!file) return;

  $('#file-upload-filename').text(file.name).css('color', 'var(--text-primary)');

  toggleLoader(true);
  Papa.parse(file, {
    header: true, skipEmptyLines: true, transformHeader: h => h.trim(),
    complete: res => {
      try {
        state.allData = res.data.map(cleanRow);
        populateFilters();
        applyFiltersAndRender();
        $('#dashboard-body').removeClass('hidden');
        $('#welcome-message').addClass('hidden');
      } catch (error) {
        console.error("Error procesando el archivo CSV:", error);
        alert("Hubo un error al procesar el archivo CSV. Por favor, verifica que el formato sea correcto y que las columnas de fecha sean válidas.");
        $('#file-upload-filename').text('Ningún archivo seleccionado').css('color', 'var(--text-tertiary)');
        $('#file-upload').val('');
      } finally {
        toggleLoader(false);
      }
    }
  });
}

function cleanRow(r) {
    const out = {};
    for (const k in r) out[k] = typeof r[k] === 'string' ? r[k].trim() : r[k];
    const toDate = s => s && !isNaN(new Date(s)) ? new Date(s) : null;
    out.StartDate = toDate(out['Custom field (Start date)']);
    out.GoLiveDate = toDate(out['Custom field (Fecha Go-Live)']);
    out.DueDate = toDate(out['Due date']);
    out.Category = out['Custom field (Category)'] || 'N/A';
    out.Assignee = out.Assignee || UNASSIGNED_LABEL;
    out.Period = out.StartDate ? `${out.StartDate.getFullYear()}-${String(out.StartDate.getMonth() + 1).padStart(2, '0')}` : null;
    const s = out.Summary || '';
    const idx = s.indexOf('|');
    out.CompanyName = idx !== -1 ? s.slice(0, idx).trim() : 'Cliente no especificado';
    return out;
}

/* ---------- FILTERS ---------- */
function populateFilters() {
    const cont = $('#filters-container').html('');
    const periods = [...new Set(state.allData.map(r => r.Period))].filter(Boolean).sort().reverse();
    cont.append(`<div class="custom-filter-container"><label class="filter-title-static">Período</label><select id="f-period" class="filter-select-period"><option value="">Todos</option>${periods.map(v => `<option value="${v}">${v}</option>`).join('')}</select></div>`);
    $('#f-period').on('change', applyFiltersAndRender);

    FILTERS_CONFIG.forEach(f => {
        const id = 'f-' + f.key.replace(/[^a-zA-Z0-9]/g, '_');
        const vals = [...new Set(state.allData.map(r => r[f.key]))].filter(Boolean).sort();
        const optionsHtml = vals.map(v => `<label class="custom-filter-option"><input type="checkbox" class="custom-filter-checkbox" value="${v}"><span class="option-text">${v}</span></label>`).join('');
        cont.append(`<div class="custom-filter-container" id="${id}-container"><button class="custom-filter-header"><span class="filter-label-text">${f.label}</span><span class="filter-selection-count"></span><svg class="dropdown-arrow" viewBox="0 0 16 16"><path fill-rule="evenodd" d="M1.646 4.646a.5.5 0 0 1 .708 0L8 10.293l5.646-5.647a.5.5 0 0 1 .708.708l-6 6a.5.5 0 0 1-.708 0l-6-6a.5.5 0 0 1 0-.708z"/></svg></button><div class="custom-filter-dropdown" style="display: none;">${optionsHtml}</div></div>`);
    });

    $('.custom-filter-header').on('click', function(e) {
        e.stopPropagation();
        const dropdown = $(this).siblings('.custom-filter-dropdown');
        $('.custom-filter-dropdown').not(dropdown).slideUp(200);
        dropdown.slideToggle(200);
    });
    $('.custom-filter-checkbox').on('change', () => {
        $('.custom-filter-container').each((_, el) => updateFilterHeader($(el)));
        applyFiltersAndRender();
    });
}

function updateFilterHeader(container) {
    const count = container.find('.custom-filter-checkbox:checked').length;
    container.find('.filter-selection-count').text(count > 0 ? `(${count})` : '').toggle(count > 0);
}

function clearFilters() {
    $('#f-period').val('');
    $('.custom-filter-checkbox').prop('checked', false);
    $('.custom-filter-container').each((_, el) => updateFilterHeader($(el)));
    applyFiltersAndRender();
}

function applyFiltersAndRender() {
    let data = state.allData;
    const selectedPeriod = $('#f-period').val();
    if (selectedPeriod) data = data.filter(r => r.Period === selectedPeriod);

    FILTERS_CONFIG.forEach(f => {
        const id = 'f-' + f.key.replace(/[^a-zA-Z0-9]/g, '_');
        const checked = $(`#${id}-container .custom-filter-checkbox:checked`);
        if (checked.length > 0) {
            const selectedVals = checked.map((_, el) => $(el).val()).get();
            data = data.filter(r => selectedVals.includes(r[f.key]));
        }
    });
    state.filteredData = data;
    renderDashboard();
}

/* ---------- DASHBOARD & CHART RENDERING ---------- */
function renderDashboard() {
    if (!state.allData.length) return;
    Object.values(state.charts).forEach(c => c?.destroy());
    state.charts = {};
    $('.chart-canvas').show();
    $('.empty-chart-message').remove();
    updateKPIs();
    renderCharts();
    renderGanttChart();
    renderAvgModuleTable();
}

function updateKPIs() {
    const d = state.filteredData;
    $('#kpi-total').text(d.length);
    $('#kpi-closed').text(d.filter(r => r.Status === CLOSED_STATUS).length);
    $('#kpi-open').text(d.filter(r => r.Status !== CLOSED_STATUS).length);
    $('#kpi-unassigned').text(d.filter(r => r.Assignee === UNASSIGNED_LABEL).length);
    generateNarrativeAnalysis(d);
}

function createChart(cfg, data, onClick) {
    const chartCard = $(`#${cfg.id}`).parent();
    if (!data || !data.labels || data.labels.length === 0) {
        chartCard.find('.chart-canvas').hide();
        chartCard.append('<div class="empty-chart-message">No hay datos para esta vista.</div>');
        return;
    }

    const ctx = document.getElementById(cfg.id).getContext('2d');
    const textColor = getComputedStyle(document.documentElement).getPropertyValue('--text-primary').trim();
    const gridColor = getComputedStyle(document.documentElement).getPropertyValue('--color-border').trim();
    const { plugins: customPlugins, ...otherOptions } = cfg.options || {};
    const opts = {
        responsive: true, maintainAspectRatio: false, ...otherOptions,
        plugins: {
            title: { display: !!cfg.title, text: cfg.title, font: { size: 16, weight: '600' }, color: textColor, padding: { bottom: 20 } },
            legend: { display: cfg.type !== 'doughnut', position: 'top', labels: { color: textColor } },
            datalabels: cfg.type === 'doughnut' ? { formatter: v => v > 0 ? v : '', color: '#fff', font: { weight: 'bold', size: 14 } } : { display: false },
            ...customPlugins
        }
    };
    if (opts.scales) Object.values(opts.scales).forEach(axis => {
        axis.ticks = { ...axis.ticks, color: textColor };
        axis.grid = { ...axis.grid, color: gridColor };
        axis.title = { ...axis.title, color: textColor };
    });
    if (onClick) opts.onClick = (evt, e) => { if (e.length) onClick(state.charts[cfg.id], e[0]); };
    state.charts[cfg.id] = new Chart(ctx, { type: cfg.type, data, options: opts });
}

function renderCharts() {
    const d = state.filteredData;
    const countBy = k => Object.entries(d.reduce((a, r) => { const v = r[k] || 'N/A'; a[v] = (a[v] || 0) + 1; return a; }, {})).sort((a, b) => b[1] - a[1]);
    
    const build = (cfg, arr, key) => {
        let datasets;
        if (cfg.id === 'assigneeChart') {
            const warningColor = getComputedStyle(document.documentElement).getPropertyValue('--color-warning').trim();
            const defaultColor = COLORS[0];
            datasets = [{
                data: arr.map(a => a[1]),
                backgroundColor: arr.map(a => a[0] === UNASSIGNED_LABEL ? warningColor : defaultColor)
            }];
        } else {
            datasets = [{ data: arr.map(a => a[1]), backgroundColor: cfg.type === 'bar' ? COLORS[0] : COLORS, borderColor: getComputedStyle(document.documentElement).getPropertyValue('--bg-card-bg').trim(), borderWidth: cfg.type === 'doughnut' ? 2 : 0 }];
        }
        
        createChart(cfg, { labels: arr.map(a => a[0]), datasets }, (chart, el) => {
            const label = chart.data.labels[el.index];
            showDetailsModal(null, d.filter(r => (r[key] || 'N/A') === label), `Tickets con ${key}: ${label}`);
        });
    };

    build(CHART_CONFIG.priority, countBy('Priority'), 'Priority');
    build(CHART_CONFIG.status, countBy('Status'), 'Status');
    build(CHART_CONFIG.assignee, countBy('Assignee'), 'Assignee');
    build(CHART_CONFIG.comercial, countBy('Custom field (Comercial Responsable)'), 'Custom field (Comercial Responsable)');
    renderMonthlyStackedChart();
}

function renderMonthlyStackedChart() {
    const d = state.filteredData;
    const map = {};
    d.forEach(r => {
        if (!r.Period) return;
        const c = r.Category || 'N/A';
        map[r.Period] = map[r.Period] || {};
        map[r.Period][c] = (map[r.Period][c] || 0) + 1;
    });
    const months = Object.keys(map).sort();
    const cats = [...new Set(d.map(r => r.Category || 'N/A'))].filter(Boolean);
    const datasets = cats.map((c, i) => ({ label: c, data: months.map(m => map[m][c] || 0), backgroundColor: COLORS[i % COLORS.length] }));
    createChart(CHART_CONFIG.monthlyStacked, { labels: months, datasets }, (chart, element) => {
        const monthLabel = chart.data.labels[element.index];
        const categoryLabel = chart.data.datasets[element.datasetIndex].label;
        const dataSubset = d.filter(r => r.Period === monthLabel && (r.Category || 'N/A') === categoryLabel);
        showDetailsModal(null, dataSubset, `Tickets de ${categoryLabel} en ${monthLabel}`);
    });
}

/* ---------- GANTT CHART ---------- */
function setupGantt() {
    gantt.plugins({ marker: true, fullscreen: true, tooltip: true });
    gantt.i18n.setLocale("es");
    gantt.config.date_format = "%Y-%m-%d";
    gantt.config.row_height = 40;
    gantt.config.open_tree_initially = false;
    gantt.config.scales = [{unit: "year", step: 1, format: "%Y"}, {unit: "month", step: 1, format: "%M '%y"}];
    
    // MODIFICADO: Template para la columna de la parrilla con icono de completado
    gantt.config.columns = [{ 
        name: "text", 
        label: "Cliente / Módulo", 
        tree: true, 
        width: '*', 
        template: task => {
            if (task.type === 'project') {
                const hasInProgress = gantt.getChildren(task.id).some(id => state.filteredData.find(r => r['Issue key'] === id)?.Status !== CLOSED_STATUS);
                return hasInProgress ? `<div class="gantt_in_progress_project">${task.text}</div>` : task.text;
            }
            // Para las tareas (módulos)
            const originalTask = state.filteredData.find(r => r['Issue key'] === task.id);
            const isCompleted = originalTask && originalTask.Status === CLOSED_STATUS;
            if (isCompleted) {
                const icon = `<svg class="gantt-task-completed-icon" viewBox="0 0 16 16"><path fill-rule="evenodd" d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0z"></path></svg>`;
                return `<div class="gantt-task-grid-content"><span class="gantt-task-icon-wrapper">${icon}</span><span class="gantt-task-grid-text completed">${task.text}</span></div>`;
            }
            return `<div class="gantt-task-grid-content"><span class="gantt-task-grid-text">${task.text}</span></div>`;
        }
    }];
    
    // Plantilla de tooltip para mostrar toda la info al pasar el ratón.
    gantt.templates.tooltip_text = function(start, end, task) {
        if (task.type === 'project') {
            // Calcular el rango de fechas del proyecto a partir de sus tareas hijas
            let minDate = Infinity;
            let maxDate = -Infinity;
            const children = gantt.getChildren(task.id);
            if (children.length > 0) {
                children.forEach(childId => {
                    const childTask = gantt.getTask(childId);
                    if (childTask.start_date) minDate = Math.min(minDate, childTask.start_date.getTime());
                    if (childTask.end_date) maxDate = Math.max(maxDate, childTask.end_date.getTime());
                });
            }

            const dateToStr = gantt.date.date_to_str("%d/%m/%Y");
            const projectStartDate = minDate === Infinity ? 'N/A' : dateToStr(new Date(minDate));
            const projectEndDate = maxDate === -Infinity ? 'N/A' : dateToStr(new Date(maxDate));

            return `<b>Cliente:</b> ${task.text}<br/>` +
                   `<b>Inicio (módulos):</b> ${projectStartDate}<br/>` +
                   `<b>Fin (módulos):</b> ${projectEndDate}`;
        }

        const original = state.filteredData.find(r => r['Issue key'] === task.id);
        if (!original) return task.text;

        const dateToStr = gantt.date.date_to_str("%d/%m/%Y");
        const effectiveEndDate = original.Status === CLOSED_STATUS && original.GoLiveDate ? original.GoLiveDate : (original.DueDate || original.GoLiveDate);

        return `
            <b>Módulo:</b> ${task.text}<br/>
            <b>Estado:</b> ${original.Status}<br/>
            <b>Inicio:</b> ${dateToStr(task.start_date)}<br/>
            <b>Fin:</b> ${dateToStr(effectiveEndDate)}
        `;
    };

    // Texto DENTRO de la barra: Solo el nombre del módulo.
    gantt.templates.task_text = (start, end, task) => task.text;

    // ELIMINADO: Custom renderer para proyectos. Ahora se maneja con CSS y la estructura por defecto.
    
    gantt.attachEvent("onTaskClick", (id) => {
        // Permitir que Gantt maneje el click para expandir/contraer proyectos
        return true; 
    });
    gantt.init("dhtmlx-gantt-container");
}

function renderGanttChart() {
    const ganttData = [];
    const companies = {};
    state.filteredData
      .filter(r => r.StartDate && (r.GoLiveDate || r.DueDate))
      .sort((a, b) => a.CompanyName.localeCompare(b.CompanyName))
      .forEach(r => {
        if (!companies[r.CompanyName]) {
            const id = `P_${r.CompanyName.replace(/[^a-zA-Z0-9]/g, '')}`;
            // Asegurarse de que el tipo sea 'project' para que DHTMLX Gantt lo reconozca y permita expandir/contraer
            companies[r.CompanyName] = { id, text: r.CompanyName, type: gantt.config.types.project, open: false };
            ganttData.push(companies[r.CompanyName]);
        }
        const category = r.Category || 'N/A';
        const isCompleted = r.Status === CLOSED_STATUS && r.GoLiveDate;
        let effectiveEndDate = isCompleted ? r.GoLiveDate : (r.DueDate || r.GoLiveDate);
        if (!effectiveEndDate) return;

        const color = GANTT_CATEGORY_COLORS[category.toUpperCase()] || GANTT_CATEGORY_COLORS['N/A'];
        ganttData.push({
            id: r['Issue key'], text: category, start_date: r.StartDate.toISOString().slice(0, 10),
            end_date: effectiveEndDate.toISOString().slice(0, 10), parent: companies[r.CompanyName].id,
            progress: isCompleted ? 1 : 0, color: isCompleted ? 'var(--color-success)' : color, // Usar variable CSS para el verde de completado
            css: isCompleted ? 'gantt_completed_task' : 'gantt_in_progress_task'
        });
    });
    gantt.clearAll();
    gantt.addMarker({ start_date: new Date(), css: "today", text: "Hoy", id: todayMarkerId });
    gantt.parse({ data: ganttData });
}

function toggleGanttFullscreen() { gantt.ext.fullscreen.toggle(); }
function expandAllGantt() { gantt.eachTask(t => { if (gantt.isTaskExists(t.id) && t.type === 'project') gantt.open(t.id); }); }
function collapseAllGantt() { gantt.eachTask(t => { if (gantt.isTaskExists(t.id) && t.type === 'project') gantt.close(t.id); }); }

/* ---------- OTHER COMPONENTS ---------- */
function renderAvgModuleTable() {
    if (state.avgModuleDataTable) state.avgModuleDataTable.destroy();
    $('.empty-chart-message', '#avgModuleTable_wrapper').parent().remove();
    const withDates = state.filteredData.filter(r => r.StartDate && r.GoLiveDate);
    if (withDates.length === 0) {
        $('#avgModuleTable').hide();
        $('#avgModuleTable_wrapper').hide();
        $('#avgModuleNote').before('<div class="empty-chart-message">No hay datos para calcular promedios.</div>');
        return;
    }
    $('#avgModuleTable').show();
    $('#avgModuleTable_wrapper').show();

    const excluded = state.filteredData.length - withDates.length;
    const stats = {};
    withDates.forEach(r => {
        const c = r.Category || 'N/A';
        const days = (new Date(r.GoLiveDate) - new Date(r.StartDate)) / MS_DAY;
        stats[c] = stats[c] || { days: 0, count: 0 };
        stats[c].days += days; stats[c].count++;
    });
    const data = Object.keys(stats).sort().map(c => ({
        Module: c, Promedio: (stats[c].days / stats[c].count).toFixed(1), Cantidad: stats[c].count
    }));
    state.avgModuleDataTable = new DataTable('#avgModuleTable', {
        data,
        columns: [{ data: 'Module', title: 'Módulo' }, { data: 'Promedio', title: 'Promedio (días)' }, { data: 'Cantidad', title: 'Cantidad' }],
        paging: false, searching: false, info: false, order: [[1, 'desc']],
        language: { url: 'https://cdn.datatables.net/plug-ins/2.0.7/i18n/es-ES.json' }
    });
    $('#avgModuleNote').text(excluded ? `* Se excluyeron ${excluded} ticket(s) sin fechas de inicio/fin. *` : '');
}

function generateNarrativeAnalysis(arr) {
    const p = $('#narrative-analysis');
    if (!arr.length) { p.text('No hay datos para los filtros seleccionados.'); return; }
    const total = arr.length;
    const done = arr.filter(r => r.Status === CLOSED_STATUS).length;
    const open = total - done;
    const withDates = arr.filter(r => r.StartDate && r.GoLiveDate);
    const avg = withDates.length ? (withDates.reduce((s, r) => s + (new Date(r.GoLiveDate) - new Date(r.StartDate)), 0) / MS_DAY / withDates.length).toFixed(1) : 'N/A';
    const topCat = Object.entries(arr.reduce((a, r) => { (a[r.Category] = a[r.Category] || 0), a[r.Category]++; return a; }, {})).sort((a,b) => b[1] - a[1])[0]?.[0] || 'N/A';
    const topImp = Object.entries(arr.reduce((a, r) => { (a[r.Assignee] = a[r.Assignee] || 0), a[r.Assignee]++; return a; }, {})).sort((a,b) => b[1] - a[1])[0]?.[0] || 'N/A';
    p.html(`Se analizan <strong>${total}</strong> tickets: <strong>${open}</strong> abiertos y <strong>${done}</strong> cerrados. El tiempo promedio de implementación es de <strong>${avg} días</strong>. El módulo más frecuente es <strong>${topCat}</strong> y el implementador con más carga es <strong>${topImp}</strong>.`);
}

function toggleModal(show) { $('#details-modal').toggleClass('modal-active', show).toggleClass('modal-inactive', !show); }

function showDetailsModal(filterObj, pre, title) {
    const data = pre || state.filteredData.filter(r => r[Object.keys(filterObj)[0]] === Object.values(filterObj)[0]);
    $('#modal-title').text(title);
    if(state.detailsDataTable) state.detailsDataTable.destroy();
    
    const relevantCols = [
        'Issue key', 'Summary', 'Assignee', 'Status', 'Priority', 'Category',
        'Custom field (Comercial Responsable)', 'StartDate', 'DueDate', 'GoLiveDate'
    ];
    
    const cols = relevantCols.map(k => ({
        title: k, data: k, 
        render: (d) => {
            if (k === 'Issue key' && d) return `<a href="https://cardinalecm.atlassian.net/issues/${d}" target="_blank" rel="noopener noreferrer" class="text-blue-500 hover:underline font-semibold">${d}</a>`;
            if ((k === 'StartDate' || k === 'DueDate' || k === 'GoLiveDate') && d) {
                try { return new Date(d).toLocaleDateString('es-ES'); } catch(e) { return d; }
            }
            return d;
        }
    }));
    state.detailsDataTable = new DataTable('#details-table', {
        data, columns: cols, responsive: true, pageLength: 10,
        layout: { topStart: { buttons: ['copy', 'csv', 'excel'] } },
        language: { url: 'https://cdn.datatables.net/plug-ins/2.0.7/i18n/es-ES.json' }
    });
    toggleModal(true);
}

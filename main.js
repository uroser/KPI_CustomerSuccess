/* ---------- STATE & CONFIG ---------- */
const MS_DAY = 86_400_000;
const MIN_GANTT_DATE = new Date('2024-01-01');
const CLOSED_STATUS = 'TERMINADO'; // Case-sensitive

const state = {
  allData: [],
  filteredData: [],
  charts: {},
  detailsDataTable: null,
  avgModuleDataTable: null
};

const COLORS = ['#3b82f6', '#ef4444', '#f97316', '#eab308', '#22c55e', '#8b5cf6', '#10b981', '#64748b'];

const CHART_CONFIG = {
    priority: { id: 'priorityChart', type: 'doughnut', title: 'Prioridades' },
    status: { id: 'statusChart', type: 'doughnut', title: 'Estados' },
    assignee: { id: 'assigneeChart', type: 'bar', title: 'Tickets por Implementador', options: { indexAxis: 'y' } },
    gantt: { id: 'ganttChart', type: 'bar', options: { indexAxis: 'y', scales: { x: { type: 'time', min: MIN_GANTT_DATE.getTime(), time: { unit: 'month', displayFormats: { month: 'MMM yy' } } } } } },
    comercial: { id: 'comercialChart', type: 'doughnut', title: 'Comercial Responsable' },
    monthlyStacked: { id: 'monthlyStackedChart', type: 'bar', title: 'Tickets Mensuales por Categoría', options: { scales: { x: { stacked: true }, y: { stacked: true } } } }
};

const FILTERS_CONFIG = [
  { key: 'Priority', label: 'Prioridad' },
  { key: 'Status', label: 'Estado' },
  { key: 'Assignee', label: 'Implementador' },
  { key: 'Custom field (Comercial Responsable)', label: 'Comercial Responsable' },
  { key: 'Category', label: 'Categoría' },
  { key: 'CompanyName', label: 'Empresa' }
];

/* ---------- PLUGINS & HELPERS ---------- */
const doughnutCenterText = {
  id: 'doughnutCenterText',
  afterDraw(chart) {
    if (chart.config.type !== 'doughnut') return;
    const { ctx, width, height } = chart;
    const total = chart.getDatasetMeta(0).total || 0;
    ctx.restore();
    ctx.font = `bold ${(height / 114).toFixed(2)}em sans-serif`;
    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--text-primary').trim();
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    ctx.fillText(total, width / 2, height / 2);
    ctx.save();
  }
};
Chart.register(doughnutCenterText, ChartDataLabels);

/* ---------- DOM READY & EVENT LISTENERS ---------- */
document.addEventListener('DOMContentLoaded', () => {
  setupEventListeners();
  initializeTheme();
});

function setupEventListeners() {
    $('#file-upload').on('change', handleFileUpload);
    $('#modal-close-btn').on('click', () => toggleModal(false));
    $('#clear-filters-btn').on('click', clearFilters);
    $('#theme-checkbox').on('change', toggleTheme);

    // KPI Card Click Handlers
    $('#kpi-total-card').on('click', () => showDetailsModal(null, state.filteredData, 'Todos los tickets del período'));
    $('#kpi-closed-card').on('click', () => {
        const rows = state.filteredData.filter(r => r.Status === CLOSED_STATUS);
        showDetailsModal(null, rows, 'Implementaciones Cerradas');
    });
    $('#kpi-open-card').on('click', () => {
        const rows = state.filteredData.filter(r => r.Status !== CLOSED_STATUS);
        showDetailsModal(null, rows, 'Implementaciones Abiertas');
    });
    $('#kpi-unassigned-card').on('click', () => {
        const rows = state.filteredData.filter(r => !r.Assignee || r.Assignee === 'Sin Asignar');
        showDetailsModal(null, rows, 'Tickets sin asignar');
    });
}

/* ---------- THEME & LOADER ---------- */
function toggleTheme() {
    const isDark = $('#theme-checkbox').is(':checked');
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
    // Re-render charts to adapt to new theme colors if necessary
    renderDashboard();
}

function initializeTheme() {
    const savedTheme = localStorage.getItem('theme') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);
    $('#theme-checkbox').prop('checked', savedTheme === 'dark');
}

function toggleLoader(show) {
    $('#loader-overlay').toggleClass('hidden', !show);
}


/* ---------- FILE & DATA HANDLING ---------- */
function handleFileUpload(e) {
  const file = e.target.files[0];
  if (!file) return;
  toggleLoader(true);
  
  Papa.parse(file, {
    header: true,
    skipEmptyLines: true,
    transformHeader: h => h.trim(),
    complete: res => {
      state.allData = res.data.map(cleanRow);
      populateFilters();
      applyFiltersAndRender();
      $('#dashboard-body').removeClass('hidden');
      $('#welcome-message').addClass('hidden');
      toggleLoader(false);
    }
  });
}

function cleanRow(r) {
    const out = {};
    for (const k in r) {
        out[k] = typeof r[k] === 'string' ? r[k].trim() : r[k];
    }
    const toDate = s => {
        if (!s || s === '') return null;
        const d = new Date(s);
        return isNaN(d) ? null : d;
    };
    out.StartDate = toDate(out['Custom field (Start date)']);
    out.GoLiveDate = toDate(out['Custom field (Fecha Go-Live)']);
    out.Category = out['Custom field (Category)'];
    out.Period = out.StartDate ? `${out.StartDate.getFullYear()}-${String(out.StartDate.getMonth() + 1).padStart(2, '0')}` : null;
    const s = out.Summary || '';
    const idx = s.indexOf('|');
    out.CompanyName = idx !== -1 ? s.slice(0, idx).trim() : (out['Issue key'] || 'N/A');
    return out;
}

/* ---------- FILTERS ---------- */
function sanitize(str) { return str.replace(/[^a-zA-Z0-9]/g, '_'); }

function populateFilters() {
    const cont = $('#filters-container');
    cont.html('');

    const periods = [...new Set(state.allData.map(r => r.Period))].filter(Boolean).sort().reverse();
    cont.append(
        `<div><label class="block text-sm font-medium filter-title mb-1" for="f-period">Período</label>
           <select id="f-period" class="filter-select mt-1 block w-full border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500">
             <option value="">Todos</option>
             ${periods.map(v => `<option value="${v}">${v}</option>`).join('')}
           </select></div>`
    );
    $('#f-period').on('change', applyFiltersAndRender);

    FILTERS_CONFIG.forEach(f => {
        const id = 'f-' + sanitize(f.key);
        const vals = [...new Set(state.allData.map(r => r[f.key]))].filter(Boolean).sort();
        cont.append(
            `<div class="border-t border-border-color pt-4"><label class="block text-sm font-medium filter-title mb-1" for="${id}">${f.label}</label>
               <select id="${id}" multiple class="filter-select mt-1 block w-full border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500">
                 ${vals.map(v => `<option value="${v}">${v}</option>`).join('')}
               </select></div>`
        );
        $('#' + id).on('change', applyFiltersAndRender);
    });
}

function clearFilters() {
    $('#f-period').val('');
    FILTERS_CONFIG.forEach(f => $('#f-' + sanitize(f.key)).val([]));
    applyFiltersAndRender();
}

function applyFiltersAndRender() {
    const selectedPeriod = $('#f-period').val();
    let data = state.allData;

    if (selectedPeriod) {
        data = data.filter(r => r.Period === selectedPeriod);
    }

    const activeFilters = FILTERS_CONFIG
        .map(f => ({ key: f.key, vals: $('#f-' + sanitize(f.key)).val() || [] }))
        .filter(f => f.vals.length);

    state.filteredData = data.filter(r => activeFilters.every(f => f.vals.includes(r[f.key])));

    renderDashboard();
}

/* ---------- DASHBOARD & CHART RENDERING ---------- */
function renderDashboard() {
    if (!state.allData.length) return;
    Object.values(state.charts).forEach(c => c && c.destroy());
    state.charts = {};
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
    $('#kpi-unassigned').text(d.filter(r => !r.Assignee || r.Assignee === 'Sin Asignar').length);
    generateNarrativeAnalysis(d);
}

function createChart(cfg, data, onClick) {
    const ctx = document.getElementById(cfg.id).getContext('2d');
    state.charts[cfg.id] && state.charts[cfg.id].destroy();

    // Global theme-aware options
    const textColor = getComputedStyle(document.documentElement).getPropertyValue('--text-primary').trim();
    const gridColor = getComputedStyle(document.documentElement).getPropertyValue('--color-border').trim();

    const opts = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            title: { display: !!cfg.title, text: cfg.title, font: { size: 16 }, color: textColor },
            legend: { display: (cfg.type !== 'doughnut' || cfg.id === 'ganttChart'), position: 'top', labels: { color: textColor } },
            datalabels: cfg.type === 'doughnut' ? {
                formatter: (v, ctx) => { const t = ctx.chart.getDatasetMeta(0).total; return t ? `${(v / t * 100).toFixed(0)}%` : ''; },
                color: '#fff', font: { weight: 'bold', size: 14 }
            } : { display: false }
        },
        ...cfg.options
    };
    
    // Theme-aware scales for bar charts
    if (cfg.type === 'bar' && opts.scales) {
        Object.keys(opts.scales).forEach(axis => {
            opts.scales[axis].ticks = { ...opts.scales[axis].ticks, color: textColor };
            opts.scales[axis].grid = { ...opts.scales[axis].grid, color: gridColor };
        });
    }

    if (onClick) {
        opts.onClick = (evt, e) => {
            if (!e.length) return;
            const el = e[0];
            const chart = state.charts[cfg.id];
            onClick(chart, el);
        };
    }
    state.charts[cfg.id] = new Chart(ctx, { type: cfg.type, data, options: opts });
}

function renderCharts() {
    const d = state.filteredData;
    const countBy = (k) => Object.entries(d.reduce((a, r) => { const v = r[k] || 'N/A'; a[v] = (a[v] || 0) + 1; return a; }, {}))
        .sort((a, b) => b[1] - a[1]);

    const build = (cfg, arr, filterKey) => {
        createChart(cfg, {
            labels: arr.map(a => a[0]),
            datasets: [{ data: arr.map(a => a[1]), backgroundColor: cfg.type === 'bar' ? COLORS[0] : COLORS }]
        }, (chart, element) => {
            const label = chart.data.labels[element.index];
            const dataSubset = state.filteredData.filter(r => (r[filterKey] || 'N/A') === label);
            showDetailsModal(null, dataSubset, `Tickets con ${filterKey}: ${label}`);
        });
    };

    build(CHART_CONFIG.priority, countBy('Priority'), 'Priority');
    build(CHART_CONFIG.status, countBy('Status'), 'Status');
    build(CHART_CONFIG.assignee, countBy('Assignee'), 'Assignee');
    build(CHART_CONFIG.comercial, countBy('Custom field (Comercial Responsable)'), 'Custom field (Comercial Responsable)');
    renderMonthlyStackedChart();
}

function renderMonthlyStackedChart() {
    const map = {};
    state.filteredData.forEach(r => {
        if (!r.Period) return;
        const c = r.Category || 'N/A';
        map[r.Period] = map[r.Period] || {};
        map[r.Period][c] = (map[r.Period][c] || 0) + 1;
    });
    const months = Object.keys(map).sort();
    const cats = [...new Set(state.filteredData.map(r => r.Category))].filter(Boolean);
    const datasets = cats.map((c, i) => ({ label: c, data: months.map(m => map[m][c] || 0), backgroundColor: COLORS[i % COLORS.length] }));

    createChart(CHART_CONFIG.monthlyStacked, { labels: months, datasets }, (chart, element) => {
        const monthLabel = chart.data.labels[element.index];
        const categoryLabel = chart.data.datasets[element.datasetIndex].label;
        const dataSubset = state.filteredData.filter(r => r.Period === monthLabel && r.Category === categoryLabel);
        showDetailsModal(null, dataSubset, `Tickets de ${categoryLabel} en ${monthLabel}`);
    });
}

function renderGanttChart() {
    let rows = state.filteredData
        .filter(r => r.GoLiveDate && r.GoLiveDate >= MIN_GANTT_DATE)
        .map(r => ({
            ...r,
            StartDate: r.StartDate && r.StartDate < MIN_GANTT_DATE ? MIN_GANTT_DATE : r.StartDate
        }))
        .filter(r => r.StartDate && r.GoLiveDate)
        .sort((a, b) => a.CompanyName.localeCompare(b.CompanyName));

    const cats = [...new Set(rows.map(r => r.Category || 'N/A'))];
    const datasets = cats.map((c, i) => ({
        label: c,
        data: rows.filter(r => (r.Category || 'N/A') === c).map(r => ({
            x: [r.StartDate.getTime(), r.GoLiveDate.getTime()],
            y: r.CompanyName,
            issueKey: r['Issue key']
        })),
        backgroundColor: `${COLORS[i % COLORS.length]}B3`
    }));

    $('#ganttWrapper').css('height', `${Math.max(400, rows.length * 35)}px`);

    createChart(CHART_CONFIG.gantt, { datasets }, (chart, element) => {
        const issueKey = chart.data.datasets[element.datasetIndex].data[element.index].issueKey;
        const dataSubset = state.filteredData.filter(r => r['Issue key'] === issueKey);
        showDetailsModal(null, dataSubset, `Detalle Ticket: ${issueKey}`);
    });
}

function renderAvgModuleTable() {
    state.avgModuleDataTable && state.avgModuleDataTable.destroy();
    const withDates = state.filteredData.filter(r => r.StartDate && r.GoLiveDate);
    const excluded = state.filteredData.length - withDates.length;
    const stats = {};
    withDates.forEach(r => {
        const c = r.Category || 'N/A';
        const days = (r.GoLiveDate - r.StartDate) / MS_DAY;
        stats[c] = stats[c] || [0, 0];
        stats[c][0] += days;
        stats[c][1]++;
    });
    const data = Object.keys(stats).sort().map(c => ({
        Module: c,
        Promedio: (stats[c][0] / stats[c][1]).toFixed(1),
        Cantidad: stats[c][1]
    }));
    state.avgModuleDataTable = new DataTable('#avgModuleTable', {
        data,
        columns: [
            { data: 'Module', title: 'Módulo' },
            { data: 'Promedio', title: 'Promedio (días)' },
            { data: 'Cantidad', title: 'Cantidad' }
        ],
        paging: false, searching: false, info: false, order: [[1, 'desc']]
    });
    $('#avgModuleNote').text(excluded ? `Se excluyeron ${excluded} ticket(s) sin fechas completas.` : '');
}

/* ---------- NARRATIVE & MODAL ---------- */
function generateNarrativeAnalysis(arr) {
    const p = $('#narrative-analysis');
    if (!arr.length) {
        p.text('No hay datos para los filtros seleccionados.');
        return;
    }
    const total = arr.length;
    const countStatus = arr.reduce((a, r) => { const v = r['Status'] || 'N/A'; a[v] = (a[v] || 0) + 1; return a; }, {});
    const done = countStatus[CLOSED_STATUS] || 0;
    const open = total - done;
    const withDates = arr.filter(r => r.StartDate && r.GoLiveDate);
    const avg = withDates.length ? (withDates.reduce((s, r) => s + (r.GoLiveDate - r.StartDate), 0) / MS_DAY / withDates.length).toFixed(1) : 'N/A';
    const topCat = Object.entries(arr.reduce((a,r)=>{const v=r['Category']||'N/A';a[v]=(a[v]||0)+1;return a;},{})).sort((a,b)=>b[1]-a[1])[0]?.[0]||'N/A';
    const topImp = Object.entries(arr.reduce((a,r)=>{const v=r['Assignee']||'N/A';a[v]=(a[v]||0)+1;return a;},{})).sort((a,b)=>b[1]-a[1])[0]?.[0]||'N/A';
    
    p.html(`<strong>${total}</strong> tickets analizados: <strong>${open}</strong> abiertos y <strong>${done}</strong> cerrados. El tiempo promedio de implementación es <strong>${avg} días</strong>. Módulo más frecuente: <strong>${topCat}</strong>. Implementador con más carga: <strong>${topImp}</strong>.`);
}

function toggleModal(show) {
    $('#details-modal').toggleClass('modal-active', show).toggleClass('modal-inactive', !show);
}

function showDetailsModal(filterObj, pre = null, title = 'Detalle de Tickets') {
    let data;
    if (pre) {
        data = pre;
    } else if (filterObj) {
        data = state.filteredData.filter(r => r[Object.keys(filterObj)[0]] === Object.values(filterObj)[0]);
    } else {
        data = state.filteredData;
    }

    $('#modal-title').text(title);
    state.detailsDataTable && state.detailsDataTable.destroy();
    const cols = state.allData.length ? Object.keys(state.allData[0]).map(k => ({ title: k, data: k })) : [];
    state.detailsDataTable = new DataTable('#details-table', {
        data,
        columns: cols,
        responsive: true,
        pageLength: 10,
        layout: { topStart: { buttons: ['copy', 'csv', 'excel'] } },
        language: { url: 'https://cdn.datatables.net/plug-ins/2.0.7/i18n/es-ES.json' }
    });
    toggleModal(true);
}
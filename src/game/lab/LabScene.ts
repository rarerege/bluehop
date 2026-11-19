import type { Chart as ChartType, ChartConfiguration, ChartDataset } from 'chart.js';
import { Scene } from '../../app/Scene';
import type { BackdropMode } from '../Backdrop';
import {
  analyticCollisionPct,
  analyticSetupBin,
  analyticThroughputKbps,
  analyticWifiLossPct,
  logSpace,
  wifiBand,
} from '../../sim/experiments';
import { SETUP_MAX_S, SETUP_MEAN_S } from '../../sim/constants';
import { ACL_TYPES, PACKETS, rateTable, SCO_TYPES, scoRateBps, type AclType } from '../../sim/packets';
import { downloadCsv, toCsv } from '../../lab/csv';
import { LabRunner } from '../../lab/runner';
import { WIFI_DUTIES, type CollisionResult, type LabJob, type LabResult, type SetupResult, type ThroughputResult, type WifiResult } from '../../lab/protocol';
import { button, h } from '../../ui/dom';
import { icons } from '../../ui/icons';

/**
 * Lab Mode — the examiner's view. Every graph overlays the analytic result
 * (lines) on the simulator's output (dots / bars), produced by the same
 * engine the levels use. Simulations run in a Web Worker.
 */

const TYPE_COLORS: Record<AclType, string> = {
  DM1: '#00e5ff',
  DH1: '#ff2bd6',
  DM3: '#3bffb0',
  DH3: '#ffe45c',
  DM5: '#8a4dff',
  DH5: '#ff8a00',
};

type ChartCtor = typeof import('chart.js').Chart;

interface Panel {
  el: HTMLElement;
  canvas: HTMLCanvasElement | null;
  status: HTMLElement;
  run: HTMLButtonElement;
  csv: HTMLButtonElement;
  select: HTMLSelectElement;
}

export class LabScene extends Scene {
  override readonly backdrop: BackdropMode = 'none';

  private runner = new LabRunner();
  private Chart: ChartCtor | null = null;
  private charts: ChartType[] = [];
  private seed = 1;
  private destroyed = false;

  private results: {
    throughput?: ThroughputResult;
    collision?: CollisionResult;
    wifi?: WifiResult;
    setup?: SetupResult;
  } = {};
  private panels!: Record<'throughput' | 'collision' | 'wifi' | 'setup', Panel>;
  private chartsBy: Partial<Record<'throughput' | 'collision' | 'wifi' | 'setup', ChartType>> = {};

  protected enter(): void {
    this.dom.classList.add('screen--blocking');
    const back = button('Back', { icon: icons.back, className: 'btn--ghost btn--small', onClick: () => this.ctx.back() });
    back.dataset.autofocus = '';

    this.panels = {
      throughput: this.panel(
        'throughput',
        '1 · Throughput vs bit error rate',
        'Forward goodput of each ACL packet type with a 1-slot ACK return, from BER 10⁻⁵ to 10⁻². Lines: analytic model. Dots: simulated with ARQ.',
        'DH packets win on a clean channel (DH5 → 723.2 kbit/s), but collapse first as BER rises; the 2/3 FEC of DM packets keeps them alive longer. Multi-slot packets pay one header for more payload.',
        [
          ['20 000 slots / point', '20000'],
          ['50 000 slots / point', '50000'],
          ['200 000 slots / point', '200000'],
        ],
        1,
      ),
      collision: this.panel(
        'collision',
        '2 · Collisions vs co-located piconets',
        'Chance that a piconet’s slot lands on the same channel as at least one of n − 1 other piconets hopping independently.',
        'Theory: P = 1 − (78/79)^(n−1). Two piconets collide ≈ 1.27 % of the time; even 10 piconets only collide ≈ 10.8 % — this is why FH-CDMA lets many piconets share 79 MHz.',
        [
          ['10 000 slots / n', '10000'],
          ['50 000 slots / n', '50000'],
          ['200 000 slots / n', '200000'],
        ],
        1,
      ),
      wifi: this.panel(
        'wifi',
        '3 · Packet loss vs Wi-Fi duty cycle',
        `DH1 traffic next to a Wi-Fi AP on channel 6 (Bluetooth channels ${wifiBand()[0]}–${wifiBand()[1]}). AFH off vs AFH on (those 23 channels blacklisted).`,
        'Without AFH the loss grows linearly: (23/79) × duty ≈ 29 % at 100 %. With AFH (Bluetooth 1.2) the hop set avoids the band and the loss drops to ≈ 0 — the coexistence fix.',
        [
          ['10 000 slots / point', '10000'],
          ['40 000 slots / point', '40000'],
          ['160 000 slots / point', '160000'],
        ],
        1,
      ),
      setup: this.panel(
        'setup',
        '4 · Connection setup time',
        `Histogram of simulated inquiry + page delays. Model: T = ${SETUP_MAX_S} s × Beta(1, 3). Bars: simulation. Line: expected counts.`,
        `Most connections are quick, with a long tail: mean ≈ ${SETUP_MEAN_S} s, never more than ${SETUP_MAX_S} s — the textbook figures for Bluetooth connection setup.`,
        [
          ['1 000 samples', '1000'],
          ['10 000 samples', '10000'],
          ['100 000 samples', '100000'],
        ],
        1,
      ),
    };

    const table = this.rateTablePanel();
    this.dom.append(
      h(
        'div',
        { class: 'wrap lab-page' },
        h('div', { class: 'screen-head' }, back, h('h2', {}, 'Lab Mode')),
        h(
          'p',
          { class: 'dim lab-intro' },
          'The numbers behind the game. Every curve comes from src/sim — the same engine the levels run on (with a simplified hop generator; the real spec uses the hop-selection kernel). AFH is a later enhancement (Bluetooth 1.2). Press L in any level to overlay live Lab numbers there.',
        ),
        h('div', { class: 'lab-grid' }, this.panels.throughput.el, this.panels.collision.el, this.panels.wifi.el, this.panels.setup.el, table),
      ),
    );

    void this.loadCharts();
  }

  override destroy(): void {
    this.destroyed = true;
    for (const c of this.charts) c.destroy();
    this.charts = [];
    this.runner.dispose();
    super.destroy();
  }

  // ── Panels ──────────────────────────────────────────────────────────

  private panel(key: keyof LabScene['panels'], title: string, desc: string, note: string, options: [string, string][], def: number): Panel {
    const select = h('select', { class: 'lab-select', 'aria-label': `${title}: sample count` });
    options.forEach(([label, value], i) => {
      const o = h('option', { value }, label);
      if (i === def) o.selected = true;
      select.append(o);
    });
    const run = button('Run simulation', { icon: icons.play, className: 'btn--small btn--primary', onClick: () => void this.runPanel(key) });
    const csv = button('CSV', { className: 'btn--small btn--ghost', title: 'Download the data as CSV', onClick: () => this.exportCsv(key) });
    csv.disabled = true;
    const status = h('div', { class: 'lab-status mono' }, 'Loading charts…');
    const canvas = h('canvas', { role: 'img', 'aria-label': title });
    const el = h(
      'section',
      { class: 'lab-card panel' },
      h('h3', {}, title),
      h('p', { class: 'dim' }, desc),
      h('div', { class: 'lab-controls' }, select, run, csv),
      h('div', { class: 'chart' }, canvas),
      status,
      h('p', { class: 'lab-note' }, note),
    );
    return { el, canvas, status, run, csv, select };
  }

  private rateTablePanel(): HTMLElement {
    const rows = rateTable();
    const csv = button('CSV', {
      className: 'btn--small btn--ghost',
      onClick: () =>
        downloadCsv(
          'bluehop-max-data-rates.csv',
          toCsv(
            ['type', 'slots', 'payload_bytes', 'fec', 'symmetric_kbps', 'asym_forward_kbps', 'asym_return_kbps'],
            [
              ...rows.map((r) => [r.type, r.slots, r.payloadBytes, r.fec, r.symmetricKbps.toFixed(1), r.asymForwardKbps.toFixed(1), r.asymReturnKbps.toFixed(1)]),
              ...SCO_TYPES.map((t) => [t, PACKETS[t].slots, PACKETS[t].payloadBytes, PACKETS[t].fec, (scoRateBps(t) / 1000).toFixed(1), '', '']),
            ],
          ),
        ),
    });
    const td = (v: string, cls = '') => h('td', { class: cls }, v);
    const table = h(
      'table',
      { class: 'rate-table' },
      h(
        'thead',
        {},
        h(
          'tr',
          {},
          ...['Type', 'Slots', 'Payload', 'FEC', 'Symmetric', 'Asym. →', 'Asym. ←'].map((x) => h('th', {}, x)),
        ),
      ),
      h(
        'tbody',
        {},
        ...rows.map((r) =>
          h(
            'tr',
            { class: r.type === 'DH5' ? 'hi' : '' },
            td(r.type, 'mono'),
            td(String(r.slots)),
            td(`${r.payloadBytes} B`),
            td(r.fec),
            td(r.symmetricKbps.toFixed(1), 'mono'),
            td(r.asymForwardKbps.toFixed(1), 'mono'),
            td(r.asymReturnKbps.toFixed(1), 'mono'),
          ),
        ),
        ...SCO_TYPES.map((t) =>
          h(
            'tr',
            { class: 'sco' },
            td(t, 'mono'),
            td('1'),
            td(`${PACKETS[t].payloadBytes} B`),
            td(PACKETS[t].fec),
            td(`${(scoRateBps(t) / 1000).toFixed(1)}`, 'mono'),
            td(`T_SCO = ${PACKETS[t].tsco}`, 'dim'),
            td('no retransmission', 'dim'),
          ),
        ),
      ),
    );
    return h(
      'section',
      { class: 'lab-card lab-card--wide panel' },
      h('h3', {}, '5 · Maximum data rates (kbit/s)'),
      h('p', { class: 'dim' }, 'Rate = payload bytes × 8 / (slots used per exchange × 625 µs). Asymmetric: the reply is a 1-slot packet of the same family (DM1 / DH1).'),
      h('div', { class: 'lab-controls' }, csv),
      h('div', { class: 'table-scroll' }, table),
      h(
        'ul',
        { class: 'lab-derive mono' },
        h('li', {}, 'DH5 → + DH1 ←:  339 × 8 / (6 × 625 µs) = 723.2 kbit/s  ·  27 × 8 / (6 × 625 µs) = 57.6 kbit/s'),
        h('li', {}, 'DH5 both ways:  339 × 8 / (10 × 625 µs) = 433.9 kbit/s each'),
        h('li', {}, 'HV1/HV2/HV3:  10 / 20 / 30 bytes every 2 / 4 / 6 slots = 64 kbit/s each way'),
      ),
    );
  }

  // ── Charts ──────────────────────────────────────────────────────────

  private async loadCharts(): Promise<void> {
    try {
      const mod = await import('chart.js/auto');
      if (this.destroyed) return;
      this.Chart = mod.Chart;
      const d = this.Chart.defaults;
      d.color = '#93a6c9';
      d.borderColor = 'rgba(143,163,199,0.15)';
      d.font.family = "'Segoe UI', system-ui, sans-serif";
      d.animation = this.ctx.settings.get().reducedMotion ? false : { duration: 400 };
    } catch {
      for (const p of Object.values(this.panels)) p.status.textContent = 'Could not load the chart library.';
      return;
    }
    for (const k of ['throughput', 'collision', 'wifi', 'setup'] as const) {
      this.draw(k);
      this.panels[k].status.textContent = 'Theory shown. Running simulation…';
    }
    // First visit: run every simulation once with the default sample counts.
    for (const k of ['throughput', 'collision', 'wifi', 'setup'] as const) void this.runPanel(k);
  }

  private jobFor(key: keyof LabScene['panels'], samples: number): LabJob {
    const seed = this.seed++;
    switch (key) {
      case 'throughput':
        return { kind: 'throughput', slots: samples, seed };
      case 'collision':
        return { kind: 'collision', slots: samples, nMax: 20, seed };
      case 'wifi':
        return { kind: 'wifi', slots: samples, seed };
      case 'setup':
        return { kind: 'setup', n: samples, seed };
    }
  }

  private async runPanel(key: keyof LabScene['panels']): Promise<void> {
    const p = this.panels[key];
    if (p.run.disabled) return;
    p.run.disabled = true;
    p.status.textContent = 'Simulating… 0 %';
    const t0 = performance.now();
    try {
      const result: LabResult = await this.runner.run(this.jobFor(key, Number(p.select.value)), (x) => {
        p.status.textContent = `Simulating… ${Math.round(x * 100)} %`;
      });
      if (this.destroyed) return;
      (this.results as Record<string, LabResult>)[key] = result;
      this.draw(key);
      p.csv.disabled = false;
      p.status.textContent = `${this.summary(key)}  ·  ${((performance.now() - t0) / 1000).toFixed(1)} s`;
    } catch (err) {
      p.status.textContent = `Simulation failed: ${String((err as Error)?.message ?? err)}`;
    } finally {
      p.run.disabled = false;
    }
  }

  private summary(key: keyof LabScene['panels']): string {
    switch (key) {
      case 'throughput': {
        const pt = this.results.throughput?.points.find((x) => x.type === 'DH5' && x.ber === 1e-5);
        return pt ? `DH5 @ 1e-5: sim ${pt.kbps.toFixed(1)} vs theory ${analyticThroughputKbps('DH5', 1e-5).toFixed(1)} kbit/s` : '';
      }
      case 'collision': {
        const pt = this.results.collision?.points.find((x) => x.n === 2);
        return pt ? `n = 2: sim ${pt.pct.toFixed(2)} % vs theory ${analyticCollisionPct(2).toFixed(2)} %` : '';
      }
      case 'wifi': {
        const pt = this.results.wifi?.points.find((x) => x.duty === 1);
        return pt ? `duty 100 %: AFH off ${pt.off.toFixed(1)} % (theory ${analyticWifiLossPct(1, false).toFixed(1)} %), AFH on ${pt.on.toFixed(1)} %` : '';
      }
      case 'setup': {
        const hst = this.results.setup?.hist;
        return hst ? `n = ${hst.n}: mean ${hst.mean.toFixed(3)} s (theory ${SETUP_MEAN_S}), max ${hst.max.toFixed(2)} s (limit ${SETUP_MAX_S})` : '';
      }
    }
  }

  private draw(key: keyof LabScene['panels']): void {
    if (!this.Chart) return;
    const cfg = this.config(key);
    const existing = this.chartsBy[key];
    if (existing) {
      existing.data = cfg.data;
      existing.update();
      return;
    }
    const canvas = this.panels[key].canvas!;
    const chart = new this.Chart(canvas, cfg);
    this.chartsBy[key] = chart;
    this.charts.push(chart);
  }

  private baseOptions(xTitle: string, yTitle: string): NonNullable<ChartConfiguration['options']> {
    return {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'nearest', intersect: false },
      plugins: {
        legend: { labels: { boxWidth: 12, usePointStyle: true } },
        tooltip: { backgroundColor: 'rgba(5,6,15,0.92)', borderColor: 'rgba(0,229,255,0.4)', borderWidth: 1 },
      },
      scales: {
        x: { title: { display: true, text: xTitle } },
        y: { title: { display: true, text: yTitle }, beginAtZero: true },
      },
    };
  }

  private config(key: keyof LabScene['panels']): ChartConfiguration {
    switch (key) {
      case 'throughput': {
        const xs = logSpace(1e-5, 1e-2, 60);
        const datasets: ChartDataset<'scatter'>[] = [];
        for (const t of ACL_TYPES) {
          datasets.push({
            label: t,
            data: xs.map((x) => ({ x, y: analyticThroughputKbps(t, x) })),
            showLine: true,
            pointRadius: 0,
            borderWidth: 2,
            borderColor: TYPE_COLORS[t],
            backgroundColor: TYPE_COLORS[t],
          });
        }
        for (const t of ACL_TYPES) {
          const pts = this.results.throughput?.points.filter((p) => p.type === t) ?? [];
          datasets.push({
            label: `${t} sim`,
            data: pts.map((p) => ({ x: p.ber, y: p.kbps })),
            pointRadius: 4,
            pointStyle: 'circle',
            borderColor: '#05060f',
            backgroundColor: TYPE_COLORS[t],
          });
        }
        const o = this.baseOptions('Bit error rate (log)', 'Goodput, kbit/s');
        o.scales!.x = {
          type: 'logarithmic',
          min: 1e-5,
          max: 1e-2,
          title: { display: true, text: 'Bit error rate (log scale)' },
          ticks: {
            callback: (v) => {
              const n = Number(v);
              const e = Math.log10(n);
              return Math.abs(e - Math.round(e)) < 1e-9 ? `1e${Math.round(e)}` : '';
            },
          },
        };
        o.scales!.y = { min: 0, max: 800, title: { display: true, text: 'Forward goodput, kbit/s' } };
        o.plugins!.legend = { labels: { boxWidth: 12, filter: (item) => !item.text.endsWith(' sim') } };
        return { type: 'scatter', data: { datasets }, options: o };
      }
      case 'collision': {
        const ns = Array.from({ length: 20 }, (_, i) => i + 1);
        const datasets: ChartDataset<'scatter'>[] = [
          {
            label: 'Theory 1 − (78/79)^(n−1)',
            data: ns.map((n) => ({ x: n, y: analyticCollisionPct(n) })),
            showLine: true,
            pointRadius: 0,
            borderWidth: 2,
            borderColor: '#00e5ff',
            backgroundColor: '#00e5ff',
          },
          {
            label: 'Simulated',
            data: (this.results.collision?.points ?? []).map((p) => ({ x: p.n, y: p.pct })),
            pointRadius: 5,
            borderColor: '#05060f',
            backgroundColor: '#ff8a00',
          },
        ];
        const o = this.baseOptions('Co-located piconets n', 'Collision probability, %');
        o.scales!.x = { type: 'linear', min: 1, max: 20, ticks: { stepSize: 1 }, title: { display: true, text: 'Co-located piconets n' } };
        return { type: 'scatter', data: { datasets }, options: o };
      }
      case 'wifi': {
        const duties = WIFI_DUTIES.map((d) => d * 100);
        const pts = this.results.wifi?.points ?? [];
        const datasets: ChartDataset<'scatter'>[] = [
          { label: 'Theory, AFH off', data: duties.map((d) => ({ x: d, y: analyticWifiLossPct(d / 100, false) })), showLine: true, pointRadius: 0, borderWidth: 2, borderColor: '#ff2bd6', backgroundColor: '#ff2bd6' },
          { label: 'Simulated, AFH off', data: pts.map((p) => ({ x: p.duty * 100, y: p.off })), pointRadius: 5, borderColor: '#05060f', backgroundColor: '#ff2bd6' },
          { label: 'Theory, AFH on', data: duties.map((d) => ({ x: d, y: analyticWifiLossPct(d / 100, true) })), showLine: true, pointRadius: 0, borderWidth: 2, borderDash: [6, 4], borderColor: '#3bffb0', backgroundColor: '#3bffb0' },
          { label: 'Simulated, AFH on', data: pts.map((p) => ({ x: p.duty * 100, y: p.on })), pointRadius: 5, pointStyle: 'rectRot', borderColor: '#05060f', backgroundColor: '#3bffb0' },
        ];
        const o = this.baseOptions('Wi-Fi duty cycle, %', 'ACL packet loss, %');
        o.scales!.x = { type: 'linear', min: 0, max: 100, title: { display: true, text: 'Wi-Fi duty cycle, %' } };
        o.scales!.y = { min: 0, max: 35, title: { display: true, text: 'ACL packet loss, %' } };
        return { type: 'scatter', data: { datasets }, options: o };
      }
      case 'setup': {
        const hst = this.results.setup?.hist;
        const w = 0.1;
        const bins = Math.ceil(SETUP_MAX_S / w);
        const n = hst?.n ?? 10_000;
        const labels = Array.from({ length: bins }, (_, i) => (i * w).toFixed(1));
        const o = this.baseOptions('Setup time, s (bin start)', 'Connections');
        o.scales!.x = { title: { display: true, text: 'Setup time, s (0.1 s bins)' }, ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 14 } };
        return {
          type: 'bar',
          data: {
            labels,
            datasets: [
              { type: 'bar', label: hst ? `Simulated (n = ${hst.n})` : 'Simulated', data: hst ? hst.counts : [], backgroundColor: 'rgba(0,229,255,0.55)', borderColor: '#00e5ff', borderWidth: 1 },
              { type: 'line', label: 'Theory', data: labels.map((_, i) => analyticSetupBin(i * w, w, n)), borderColor: '#ffe45c', backgroundColor: '#ffe45c', pointRadius: 0, borderWidth: 2, tension: 0.3 },
            ],
          },
          options: o,
        } as ChartConfiguration;
      }
    }
  }

  // ── CSV ─────────────────────────────────────────────────────────────

  private exportCsv(key: keyof LabScene['panels']): void {
    switch (key) {
      case 'throughput': {
        const pts = this.results.throughput?.points ?? [];
        downloadCsv(
          'bluehop-throughput-vs-ber.csv',
          toCsv(['packet_type', 'ber', 'simulated_kbps', 'analytic_kbps'], pts.map((p) => [p.type, p.ber, p.kbps.toFixed(3), analyticThroughputKbps(p.type, p.ber).toFixed(3)])),
        );
        break;
      }
      case 'collision': {
        const pts = this.results.collision?.points ?? [];
        downloadCsv('bluehop-collisions-vs-piconets.csv', toCsv(['piconets', 'simulated_pct', 'analytic_pct'], pts.map((p) => [p.n, p.pct.toFixed(4), analyticCollisionPct(p.n).toFixed(4)])));
        break;
      }
      case 'wifi': {
        const pts = this.results.wifi?.points ?? [];
        downloadCsv(
          'bluehop-loss-vs-wifi-duty.csv',
          toCsv(['duty_pct', 'afh_off_simulated_pct', 'afh_off_analytic_pct', 'afh_on_simulated_pct', 'afh_on_analytic_pct'], pts.map((p) => [p.duty * 100, p.off.toFixed(3), analyticWifiLossPct(p.duty, false).toFixed(3), p.on.toFixed(3), 0])),
        );
        break;
      }
      case 'setup': {
        const hst = this.results.setup?.hist;
        if (!hst) return;
        downloadCsv(
          'bluehop-setup-time-histogram.csv',
          toCsv(['bin_start_s', 'bin_end_s', 'simulated_count', 'expected_count'], hst.counts.map((c, i) => [(i * hst.binWidth).toFixed(2), ((i + 1) * hst.binWidth).toFixed(2), c, analyticSetupBin(i * hst.binWidth, hst.binWidth, hst.n).toFixed(1)])),
        );
        break;
      }
    }
  }
}

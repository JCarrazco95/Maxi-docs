/**
 * DesignPanel — Panel de diseño del documento
 * Controla: color de tema, tipografía, estilos de tabla, header/footer
 * Genera CSS que se inyecta en el editor y en el PDF final.
 */
import { useState, useCallback } from 'react'

const FONTS = [
  { label: 'Arial (default)',        value: 'Arial, Helvetica, sans-serif' },
  { label: 'Georgia (elegante)',     value: 'Georgia, "Times New Roman", serif' },
  { label: 'Calibri (moderno)',      value: 'Calibri, Candara, sans-serif' },
  { label: 'Helvetica (limpio)',     value: '"Helvetica Neue", Helvetica, sans-serif' },
  { label: 'Times New Roman',       value: '"Times New Roman", Times, serif' },
  { label: 'Trebuchet MS',          value: '"Trebuchet MS", Tahoma, sans-serif' },
]

const PRESET_COLORS = [
  { label: 'MAXIRent Navy',   value: '#1B3055' },
  { label: 'MAXIRent Orange', value: '#F5A000' },
  { label: 'Azul Corporativo',value: '#0073ea' },
  { label: 'Verde Empresarial',value: '#258750' },
  { label: 'Rojo Ejecutivo',  value: '#e2445c' },
  { label: 'Gris Profesional',value: '#323338' },
]

const DEFAULT_DESIGN = {
  primaryColor:   '#1B3055',
  accentColor:    '#F5A000',
  bodyFont:       'Arial, Helvetica, sans-serif',
  headingFont:    'Arial, Helvetica, sans-serif',
  fontSize:       '10pt',
  tableHeaderBg:  '#F5A000',
  tableHeaderTxt: '#ffffff',
  headerText:     '',
  footerText:     '',
  logoUrl:        '',
  pageMargin:     '20mm',
}

export function buildDesignCss(design) {
  const d = { ...DEFAULT_DESIGN, ...design }
  return `
    body, .document-body {
      font-family: ${d.bodyFont};
      font-size: ${d.fontSize};
      color: #222;
    }
    h1, h2, h3, h4 {
      font-family: ${d.headingFont};
      color: ${d.primaryColor};
    }
    a { color: ${d.primaryColor}; }
    table th, .pt-cols-header > div {
      background: ${d.tableHeaderBg} !important;
      color: ${d.tableHeaderTxt} !important;
    }
    .pt-header { background: ${d.primaryColor} !important; }
    .pt-grand-val, .pt-total-val { color: ${d.accentColor} !important; }
  `.trim()
}

export default function DesignPanel({ design, onChange, onClose }) {
  const d = { ...DEFAULT_DESIGN, ...(design ?? {}) }
  const [tab, setTab] = useState('colors') // colors | typography | tables | page

  function update(key, val) {
    onChange({ ...d, [key]: val })
  }

  const Row = ({ label, children }) => (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: '#676879', marginBottom: 5, textTransform: 'uppercase', letterSpacing: 0.4 }}>{label}</div>
      {children}
    </div>
  )

  const ColorRow = ({ label, field }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
      <input type="color" value={d[field]} onChange={e => update(field, e.target.value)}
        style={{ width: 36, height: 36, border: '1px solid #e0e2ea', borderRadius: 6, cursor: 'pointer', padding: 2 }} />
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: '#323338' }}>{label}</div>
        <div style={{ fontSize: 10, color: '#94a3b8', fontFamily: 'monospace' }}>{d[field]}</div>
      </div>
    </div>
  )

  return (
    <div style={s.panel}>
      <div style={s.header}>
        <span style={s.title}>Diseño del documento</span>
        {onClose && <button onClick={onClose} style={s.closeBtn}>×</button>}
      </div>

      {/* Tabs */}
      <div style={s.tabs}>
        {[['colors','Colores'],['typography','Tipografía'],['tables','Tablas'],['page','Página']].map(([k,l]) => (
          <button key={k} onClick={() => setTab(k)} style={{
            ...s.tab, background: tab === k ? 'white' : 'transparent',
            fontWeight: tab === k ? 700 : 400, color: tab === k ? '#1B3055' : '#676879',
          }}>{l}</button>
        ))}
      </div>

      <div style={s.body}>

        {/* ── Colores ──────────────────────────────────── */}
        {tab === 'colors' && (
          <div>
            <Row label="Presets">
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {PRESET_COLORS.map(p => (
                  <button key={p.value} title={p.label}
                    onClick={() => update('primaryColor', p.value)}
                    style={{ width: 28, height: 28, borderRadius: 6, background: p.value, border: d.primaryColor === p.value ? '3px solid #1B3055' : '1px solid rgba(0,0,0,0.15)', cursor: 'pointer' }} />
                ))}
              </div>
            </Row>
            <ColorRow label="Color principal (headers, títulos)" field="primaryColor" />
            <ColorRow label="Color de acento (totales, detalles)" field="accentColor" />
            <ColorRow label="Header de tabla" field="tableHeaderBg" />
            <Row label="Texto del header de tabla">
              <div style={{ display: 'flex', gap: 8 }}>
                {['#ffffff','#000000','#1B3055'].map(c => (
                  <button key={c} onClick={() => update('tableHeaderTxt', c)}
                    style={{ width: 30, height: 30, background: c, border: d.tableHeaderTxt === c ? '3px solid #0073ea' : '1px solid #e0e2ea', borderRadius: 6, cursor: 'pointer' }} />
                ))}
              </div>
            </Row>
          </div>
        )}

        {/* ── Tipografía ───────────────────────────────── */}
        {tab === 'typography' && (
          <div>
            <Row label="Fuente del cuerpo">
              <select value={d.bodyFont} onChange={e => update('bodyFont', e.target.value)} style={s.select}>
                {FONTS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
              </select>
            </Row>
            <Row label="Fuente de encabezados">
              <select value={d.headingFont} onChange={e => update('headingFont', e.target.value)} style={s.select}>
                {FONTS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
              </select>
            </Row>
            <Row label="Tamaño de fuente base">
              <select value={d.fontSize} onChange={e => update('fontSize', e.target.value)} style={s.select}>
                {['8pt','9pt','10pt','11pt','12pt'].map(sz => <option key={sz} value={sz}>{sz}</option>)}
              </select>
            </Row>
            <div style={{ padding: 12, background: '#f6f7fb', borderRadius: 8, marginTop: 8 }}>
              <div style={{ fontFamily: d.bodyFont, fontSize: d.fontSize, color: '#323338' }}>
                Vista previa del texto del documento
              </div>
              <div style={{ fontFamily: d.headingFont, fontSize: '14pt', fontWeight: 700, color: d.primaryColor, marginTop: 6 }}>
                Encabezado del documento
              </div>
            </div>
          </div>
        )}

        {/* ── Tablas ───────────────────────────────────── */}
        {tab === 'tables' && (
          <div>
            <div style={{ padding: 12, background: '#f6f7fb', borderRadius: 8, marginBottom: 14 }}>
              <div style={{ fontSize: 12, color: '#676879', marginBottom: 8 }}>Vista previa</div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                <thead>
                  <tr style={{ background: d.tableHeaderBg }}>
                    <th style={{ padding: '6px 8px', color: d.tableHeaderTxt, textAlign: 'left' }}>CANTIDAD</th>
                    <th style={{ padding: '6px 8px', color: d.tableHeaderTxt, textAlign: 'left' }}>DESCRIPCIÓN</th>
                    <th style={{ padding: '6px 8px', color: d.tableHeaderTxt, textAlign: 'right' }}>TOTAL</th>
                  </tr>
                </thead>
                <tbody>
                  <tr><td style={{ padding: '5px 8px', borderBottom: '1px solid #e0e2ea' }}>1</td><td style={{ padding: '5px 8px', borderBottom: '1px solid #e0e2ea' }}>Servicio de renta</td><td style={{ padding: '5px 8px', borderBottom: '1px solid #e0e2ea', textAlign: 'right', color: d.primaryColor, fontWeight: 700 }}>$1,200.00</td></tr>
                  <tr><td colSpan={2} style={{ padding: '5px 8px', textAlign: 'right', fontWeight: 600 }}>TOTAL CON IVA</td><td style={{ padding: '5px 8px', textAlign: 'right', color: d.accentColor, fontWeight: 800, fontSize: 13 }}>$1,200.00</td></tr>
                </tbody>
              </table>
            </div>
            <Row label="Color header de tabla">
              <ColorRow label="" field="tableHeaderBg" />
            </Row>
          </div>
        )}

        {/* ── Página ───────────────────────────────────── */}
        {tab === 'page' && (
          <div>
            <Row label="Márgenes del PDF">
              <select value={d.pageMargin} onChange={e => update('pageMargin', e.target.value)} style={s.select}>
                {['10mm','15mm','20mm','25mm','30mm'].map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </Row>
            <Row label="URL del logo (encabezado)">
              <input value={d.logoUrl} onChange={e => update('logoUrl', e.target.value)}
                placeholder="https://..." style={s.input} />
              {d.logoUrl && <img src={d.logoUrl} alt="logo" style={{ marginTop: 6, maxHeight: 40, maxWidth: '100%', borderRadius: 4 }} onError={e => e.target.style.display = 'none'} />}
            </Row>
            <Row label="Texto del encabezado">
              <input value={d.headerText} onChange={e => update('headerText', e.target.value)}
                placeholder="Nombre de la empresa · Teléfono" style={s.input} />
            </Row>
            <Row label="Texto del pie de página">
              <input value={d.footerText} onChange={e => update('footerText', e.target.value)}
                placeholder="Términos · maxirentempresas.com.mx" style={s.input} />
            </Row>
          </div>
        )}
      </div>
    </div>
  )
}

const s = {
  panel: { width: 280, flexShrink: 0, display: 'flex', flexDirection: 'column', background: '#fafbfc', borderLeft: '1px solid #e0e2ea', overflow: 'hidden' },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px 8px', borderBottom: '1px solid #e0e2ea', flexShrink: 0 },
  title:  { fontSize: 13, fontWeight: 700, color: '#1B3055' },
  closeBtn: { background: 'none', border: 'none', cursor: 'pointer', color: '#9699a6', fontSize: 18, lineHeight: 1 },
  tabs: { display: 'flex', borderBottom: '1px solid #e0e2ea', flexShrink: 0 },
  tab:  { flex: 1, padding: '7px 4px', border: 'none', cursor: 'pointer', fontSize: 11, borderBottom: '2px solid transparent' },
  body: { flex: 1, overflowY: 'auto', padding: '14px 12px' },
  select: { width: '100%', padding: '6px 8px', border: '1px solid #e0e2ea', borderRadius: 6, fontSize: 12, background: 'white' },
  input:  { width: '100%', padding: '6px 8px', border: '1px solid #e0e2ea', borderRadius: 6, fontSize: 12, boxSizing: 'border-box' },
}

/**
 * Generador del reporte E2E como PDF, armado ON-DEMAND en el navegador con @react-pdf/renderer.
 * El backend ya no crea ni guarda PDFs: se compone al momento de Ver/Descargar y nunca se persiste.
 *
 * Diseño siguiendo product-ux-designer: jerarquía clara, whitespace-first, color restringido (un
 * primario + neutros, semántico solo para estado), eyebrows en mayúscula tracked, presentación tipo
 * reporte corporativo (masthead + panel resumen + evidencia por paso). Calidad enterprise.
 *
 * Módulo pesado (react-pdf): se importa de forma diferida para no inflar el bundle principal.
 */
import { Document, Page, View, Text, Image, StyleSheet, pdf } from '@react-pdf/renderer';
import type { E2eDocData } from '@/features/e2e/models/e2e.model';

// Paleta restringida: un primario (navy), neutros y semántico solo para estado.
const INK = '#0F172A';        // texto principal
const NAVY = '#1E3A5F';       // primario / acentos
const SUBTLE = '#64748B';     // texto secundario
const FAINT = '#94A3B8';      // labels/eyebrows
const HAIR = '#E7ECF1';       // hairlines / bordes
const PANEL = '#F8FAFC';      // fondos suaves
const OK = '#15803D';
const OK_BG = '#ECFDF3';
const ERR = '#B42318';
const ERR_BG = '#FEF3F2';

const s = StyleSheet.create({
  page: {
    paddingTop: 40, paddingBottom: 52, paddingHorizontal: 48,
    fontSize: 9.5, color: INK, fontFamily: 'Helvetica', lineHeight: 1.5,
  },

  /* Masthead: SOLO en la primera página (flujo normal, no fixed) */
  runHead: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingBottom: 16, marginBottom: 22,
    borderBottomWidth: 1, borderBottomColor: HAIR,
  },
  runLogo: { height: 52, objectFit: 'contain' },
  runLogoText: { fontSize: 16, fontFamily: 'Helvetica-Bold', color: NAVY, letterSpacing: 0.5 },
  runRight: { fontSize: 7.5, color: FAINT, letterSpacing: 1.4, fontFamily: 'Helvetica-Bold' },

  /* Running footer */
  foot: {
    position: 'absolute', bottom: 0, left: 0, right: 0, height: 34,
    paddingHorizontal: 48, paddingTop: 11,
    borderTopWidth: 1, borderTopColor: HAIR,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  footL: { fontSize: 7, color: FAINT, letterSpacing: 0.8 },
  footR: { fontSize: 7.5, color: SUBTLE },

  /* Masthead (página 1) */
  eyebrow: { fontSize: 7.5, color: NAVY, letterSpacing: 2, fontFamily: 'Helvetica-Bold', marginBottom: 6 },
  title: { fontSize: 21, fontFamily: 'Helvetica-Bold', color: INK, lineHeight: 1.15 },
  crumb: { fontSize: 9.5, color: SUBTLE, marginTop: 6 },
  rule: { height: 2, backgroundColor: NAVY, width: 44, marginTop: 14, marginBottom: 18 },

  /* Panel resumen */
  panel: { borderWidth: 1, borderColor: HAIR, borderRadius: 8, overflow: 'hidden', marginBottom: 24 },
  panelHead: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 12, paddingHorizontal: 16, backgroundColor: PANEL,
    borderBottomWidth: 1, borderBottomColor: HAIR,
  },
  statusWrap: { flexDirection: 'row', alignItems: 'center' },
  statusDot: { width: 8, height: 8, borderRadius: 4, marginRight: 8 },
  statusText: { fontSize: 12, fontFamily: 'Helvetica-Bold' },
  statusCaption: { fontSize: 8.5, color: SUBTLE, marginLeft: 10 },
  pill: { fontSize: 8, fontFamily: 'Helvetica-Bold', letterSpacing: 0.5, paddingVertical: 3, paddingHorizontal: 8, borderRadius: 10 },

  grid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 16, paddingTop: 14, paddingBottom: 4 },
  field: { width: '33.33%', marginBottom: 14, paddingRight: 12 },
  fieldLabel: { fontSize: 7, color: FAINT, letterSpacing: 1.2, fontFamily: 'Helvetica-Bold', marginBottom: 3 },
  fieldValue: { fontSize: 10, color: INK },

  barWrap: { paddingHorizontal: 16, paddingBottom: 14 },
  barTrack: { height: 6, backgroundColor: '#EEF2F6', borderRadius: 4, overflow: 'hidden' },
  barFill: { height: 6, borderRadius: 4 },

  /* Evidencia */
  sectionLabel: { fontSize: 7.5, color: FAINT, letterSpacing: 2, fontFamily: 'Helvetica-Bold', marginBottom: 14, marginTop: 4 },

  /* Encabezado de grupo (testName) */
  group: { flexDirection: 'row', alignItems: 'center', marginTop: 8, marginBottom: 12 },
  groupBar: { width: 3, height: 13, borderRadius: 2, marginRight: 8 },
  groupText: { fontSize: 10, fontFamily: 'Helvetica-Bold', color: INK },

  /* Paso */
  step: { marginBottom: 20 },
  stepHead: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  stepNum: {
    width: 22, height: 22, borderRadius: 11, backgroundColor: NAVY, color: '#fff',
    fontSize: 9.5, fontFamily: 'Helvetica-Bold', textAlign: 'center', paddingTop: 5.5, marginRight: 10,
  },
  stepDesc: { fontSize: 10, color: INK, flex: 1, lineHeight: 1.4 },
  shot: { width: '100%', objectFit: 'contain', borderWidth: 1, borderColor: HAIR, borderRadius: 4, marginLeft: 32, maxWidth: '92%' },

  /* Fallo */
  errPanel: { marginTop: 22, borderWidth: 1, borderColor: '#FBD3CE', borderRadius: 8, overflow: 'hidden' },
  errHead: { flexDirection: 'row', alignItems: 'center', backgroundColor: ERR_BG, paddingVertical: 10, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: '#FBD3CE' },
  errTitle: { fontSize: 10.5, fontFamily: 'Helvetica-Bold', color: ERR },
  errBody: { padding: 16 },
  errText: { fontSize: 9.5, color: '#7A271A', marginBottom: 6, lineHeight: 1.5 },
  errShotLabel: { fontSize: 7, color: ERR, letterSpacing: 1, fontFamily: 'Helvetica-Bold', marginTop: 10, marginBottom: 5 },
  errShot: { width: '100%', objectFit: 'contain', borderWidth: 1, borderColor: '#FBD3CE', borderRadius: 4 },
  tech: { fontSize: 7, color: FAINT, marginTop: 12, fontFamily: 'Courier', lineHeight: 1.4 },
});

type ImgMap = Record<string, string>;

function fmtDate(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  const meses = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  return `${p(d.getDate())} ${meses[d.getMonth()]} ${d.getFullYear()}, ${p(d.getHours())}:${p(d.getMinutes())}`;
}

async function toDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { credentials: 'include' });
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise((resolve) => {
      const fr = new FileReader();
      fr.onloadend = () => resolve(typeof fr.result === 'string' ? fr.result : null);
      fr.onerror = () => resolve(null);
      fr.readAsDataURL(blob);
    });
  } catch { return null; }
}

function Field({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <View style={s.field}>
      <Text style={s.fieldLabel}>{label}</Text>
      <Text style={s.fieldValue}>{value}</Text>
    </View>
  );
}

export function ReportDoc({ doc, empresa, entorno, logo, imgs }: { doc: E2eDocData; empresa?: string; entorno?: string; logo: string | null; imgs: ImgMap }) {
  const { result } = doc;
  const ok = result.ok;
  const color = ok ? OK : ERR;
  const bg = ok ? OK_BG : ERR_BG;
  const pct = ok ? 100 : result.failed > 0 ? 0 : 100;
  const caption = ok
    ? `${result.stepCount} paso(s) completados correctamente`
    : result.stepCount > 0 ? `Falló tras ${result.stepCount} paso(s)` : 'No completó ningún paso';
  const tipoCap = doc.tipo ? doc.tipo.charAt(0).toUpperCase() + doc.tipo.slice(1) : undefined;
  let lastTest = '';

  return (
    <Document title={`Reporte E2E — ${doc.name}`} author="TestVerse" subject="Documentación de prueba automatizada">
      <Page size="A4" style={s.page}>
        {/* Masthead — solo en la primera página (sin fixed) */}
        <View style={s.runHead}>
          {logo ? <Image src={logo} style={s.runLogo} /> : <Text style={s.runLogoText}>TestVerse</Text>}
          <Text style={s.runRight}>REPORTE DE PRUEBA E2E</Text>
        </View>

        {/* Masthead */}
        <Text style={s.eyebrow}>DOCUMENTACIÓN DE PRUEBA · E2E</Text>
        <Text style={s.title}>{doc.name}</Text>
        <Text style={s.crumb}>{[doc.module, doc.page].filter(Boolean).join('  ›  ')}</Text>
        <View style={s.rule} />

        {/* Panel resumen */}
        <View style={s.panel}>
          <View style={s.panelHead}>
            <View style={s.statusWrap}>
              <View style={[s.statusDot, { backgroundColor: color }]} />
              <Text style={[s.statusText, { color }]}>{ok ? 'Pasó' : 'Falló'}</Text>
              <Text style={s.statusCaption}>{caption}</Text>
            </View>
            <Text style={[s.pill, { backgroundColor: bg, color }]}>{pct}%</Text>
          </View>

          <View style={s.grid}>
            <Field label="EMPRESA" value={empresa} />
            <Field label="ENTORNO" value={entorno} />
            <Field label="TIPO DE FLUJO" value={tipoCap} />
            <Field label="PASOS" value={String(result.stepCount)} />
            <Field label="RESULTADO" value={ok ? 'Exitoso' : `${result.failed} fallo(s)`} />
            <Field label="EJECUTADO" value={fmtDate(doc.runAt)} />
          </View>

          <View style={s.barWrap}>
            <View style={s.barTrack}><View style={[s.barFill, { width: `${pct}%`, backgroundColor: color }]} /></View>
          </View>
        </View>

        {/* Evidencia por paso */}
        {doc.steps.length > 0 ? <Text style={s.sectionLabel}>EVIDENCIA POR PASO</Text> : null}
        {doc.steps.map((st) => {
          const isNeg = !!st.testName && /negativo|negativa|error|fallo|sin completar/i.test(st.testName);
          const showGroup = !!st.testName && st.testName !== lastTest;
          if (showGroup) lastTest = st.testName as string;
          const img = imgs[st.screenshot];
          return (
            <View key={st.num} wrap={false}>
              {showGroup ? (
                <View style={s.group}>
                  <View style={[s.groupBar, { backgroundColor: isNeg ? ERR : NAVY }]} />
                  <Text style={s.groupText}>{st.testName}</Text>
                </View>
              ) : null}
              <View style={s.step}>
                <View style={s.stepHead}>
                  <Text style={s.stepNum}>{st.num}</Text>
                  <Text style={s.stepDesc}>{st.description}</Text>
                </View>
                {img ? <Image src={img} style={s.shot} /> : null}
              </View>
            </View>
          );
        })}

        {/* Detalle del fallo */}
        {!ok && (doc.humanError || doc.failureScreenshots.length) ? (
          <View style={s.errPanel} wrap={false}>
            <View style={s.errHead}><Text style={s.errTitle}>Detalle del fallo</Text></View>
            <View style={s.errBody}>
              {doc.humanError ? <Text style={s.errText}>{doc.humanError}</Text> : null}
              {doc.failureScreenshots.map((f, i) => {
                const img = imgs[f];
                if (!img) return null;
                return (
                  <View key={f}>
                    <Text style={s.errShotLabel}>PANTALLA AL MOMENTO DEL ERROR — FALLO {i + 1}</Text>
                    <Image src={img} style={s.errShot} />
                  </View>
                );
              })}
              {doc.outputExcerpt ? <Text style={s.tech}>{doc.outputExcerpt}</Text> : null}
            </View>
          </View>
        ) : null}

        {/* Footer corrido */}
        <View style={s.foot} fixed>
          <Text style={s.footL}>CONFIDENCIAL · TESTVERSE · {fmtDate(new Date().toISOString())}</Text>
          <Text style={s.footR} render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}

export interface BuildReportParams {
  doc: E2eDocData;
  empresa?: string;
  entorno?: string;
  logoUrl?: string;
  screenshotUrl: (file: string) => string;
}

/** Arma el PDF en el navegador y devuelve el Blob (Ver o Descargar). Nada se guarda en el server. */
export async function buildE2eReportBlob(params: BuildReportParams): Promise<Blob> {
  const { doc, empresa, entorno, logoUrl = '/testverse-full.png', screenshotUrl } = params;

  const logo = await toDataUrl(logoUrl);
  const files = Array.from(new Set([...doc.steps.map((st) => st.screenshot), ...doc.failureScreenshots]));
  const imgs: ImgMap = {};
  await Promise.all(files.map(async (f) => {
    const d = await toDataUrl(screenshotUrl(f));
    if (d) imgs[f] = d;
  }));

  return pdf(<ReportDoc doc={doc} empresa={empresa} entorno={entorno} logo={logo} imgs={imgs} />).toBlob();
}

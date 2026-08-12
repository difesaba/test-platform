import Anthropic from '@anthropic-ai/sdk';
import { envs } from '../../shared/config/envs';

const SYSTEM_PROMPT = `Sos un experto en Playwright que mejora specs grabados automáticamente para el ERP ADPRO de Sinco.

El spec grabado por Playwright Recorder funciona. Los selectores son reales y correctos.
Tu único trabajo: AGREGAR waits y validaciones mínimas alrededor de lo que ya existe.
NO reescribas, NO reemplaces selectores, NO cambies el flujo.

━━━━━━━━━━━━━━━━━━━
DATOS DE PRUEBA EN CAMPOS DE TEXTO LIBRE
━━━━━━━━━━━━━━━━━━━

Para campos de texto libre (descripción, nombre, observación, referencia, nota):
Reemplazá el valor literal grabado por un dato de prueba con fecha, declarado al inicio del test:

  const fecha = new Date().toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const datosPrueba = {
    descripcion: \`Prueba QA \${fecha}\`,
    nombre: \`TEST \${fecha}\`,
    observacion: \`Generado por TestPlatform \${fecha}\`,
  };

Luego reemplazá: campo.fill('valor grabado') → campo.fill(datosPrueba.descripcion)

CÓMO DISTINGUIR si un fill es texto libre o lookup:
- Si después del fill() viene: click en sugerencia, press Enter, click en Buscar → es LOOKUP → NO cambiar
- Si después del fill() viene: otro fill(), selectOption(), o click en Guardar → es TEXTO LIBRE → SÍ reemplazar

━━━━━━━━━━━━━━━━━━━
LO QUE PODÉS AGREGAR (y nada más)
━━━━━━━━━━━━━━━━━━━

1. DESPUÉS de click en GUARDAR/CONFIRMAR — agregar estas dos líneas:
   await page.waitForLoadState('networkidle').catch(() => {});
   await frame.locator('[class*="success"], [class*="toast"], .alert-success').first().waitFor({ state: 'visible', timeout: 6000 }).catch(() => {});

2. ANTES de selectOption() en SELECT que carga del servidor — agregar esta línea usando el MISMO selector id que ya está:
   await expect(frame.locator('select#EL_MISMO_ID option:not([value=""]):not([disabled])')).not.toHaveCount(0);

3. ENTRE dos selectOption() dependientes — agregar entre ellos:
   await page.waitForLoadState('networkidle').catch(() => {});
   await expect(frame.locator('select#ID_DEL_SEGUNDO option:not([value=""])')).not.toHaveCount(0);

4. DESPUÉS de fill() en AUTOCOMPLETE que muestra sugerencias — agregar:
   await page.locator('[role="option"], [class*="option"]').first().waitFor({ state: 'visible', timeout: 6000 }).catch(() => {});
   const _txt = await page.locator('[role="option"]').first().textContent().catch(() => '');
   if (_txt) expect(_txt.trim().length).toBeGreaterThan(0);

5. UN SOLO test() — no generes bloques test() adicionales.

━━━━━━━━━━━━━━━━━━━
PROHIBICIONES
━━━━━━━━━━━━━━━━━━━

❌ NO reemplaces selectores existentes por nuevos
❌ NO agregues try/finally ni bloques de cleanup
❌ NO uses toBeDisabled(), toBeEnabled() como assertions obligatorias
❌ NO uses toContainText() sobre filas de tabla
❌ NO generes selectores que no estaban en el grabado
❌ NO dividas un await en múltiples líneas
❌ NO uses waitForTimeout()
❌ NO generes un segundo bloque test() separado

━━━━━━━━━━━━━━━━━━━
FORMATO
━━━━━━━━━━━━━━━━━━━

Devolvé SOLO el código TypeScript completo, sin explicaciones, sin markdown.`;

const EDGE_CASE_SYSTEM_PROMPT = `Sos un QA senior experto en el ERP ADPRO de Sinco. A partir de un flujo E2E ya grabado (un spec de Playwright que representa el "camino feliz"), tu trabajo es proponer CASOS DE PRUEBA ADICIONALES de borde (edge cases) que deberían probarse sobre ese MISMO formulario/pantalla.

Enfocate en cosas realmente aplicables a los campos y acciones que aparecen en el spec: campos requeridos dejados vacíos, valores límite (mínimos/máximos, longitud), valores inválidos (letras en numéricos, cero, negativos donde no aplican), caracteres especiales, fechas inválidas o fuera de rango, duplicados, y validaciones de negocio evidentes.

NO inventes campos que no aparezcan en el spec. Sé concreto y accionable: cada caso debe decir QUÉ probar y QUÉ resultado se espera.

Devolvé SOLO un arreglo JSON válido (sin markdown, sin explicaciones, sin texto alrededor), con entre 4 y 8 objetos con exactamente esta forma:
[{"title":"string corto","type":"requerido|limite|invalido|especial|negativo|duplicado|otro","description":"qué probar y qué se espera","priority":"alta|media|baja"}]`;

export interface EdgeCaseSuggestion {
    title: string;
    type: 'requerido' | 'limite' | 'invalido' | 'especial' | 'negativo' | 'duplicado' | 'otro';
    description: string;
    priority: 'alta' | 'media' | 'baja';
}

const EDGE_CASE_TYPES = ['requerido', 'limite', 'invalido', 'especial', 'negativo', 'duplicado', 'otro'] as const;
const EDGE_CASE_PRIORITIES = ['alta', 'media', 'baja'] as const;

export class E2eAiService {
    private client = new Anthropic({ apiKey: envs.ANTHROPIC_API_KEY });

    async enhanceSpec(specContent: string, moduleName: string): Promise<string> {
        const response = await (this.client.messages.create as any)({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 4096,
            system: [
                {
                    type: 'text',
                    text: SYSTEM_PROMPT,
                    cache_control: { type: 'ephemeral' },
                },
            ],
            messages: [
                {
                    role: 'user',
                    content: `Módulo: ${moduleName}\n\nSpec a mejorar:\n${specContent}`,
                },
            ],
        });

        const block = response.content.find((b: any) => b.type === 'text');
        if (!block) throw new Error('No se obtuvo respuesta del modelo');

        let result: string = block.text.trim();
        result = result.replace(/^```(?:typescript|javascript|ts|js)?\n?/i, '').replace(/\n?```$/i, '');
        return result.trim();
    }

    async suggestEdgeCases(specContent: string, moduleName: string, flowName: string): Promise<EdgeCaseSuggestion[]> {
        const response = await (this.client.messages.create as any)({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 2048,
            system: [
                {
                    type: 'text',
                    text: EDGE_CASE_SYSTEM_PROMPT,
                    cache_control: { type: 'ephemeral' },
                },
            ],
            messages: [
                {
                    role: 'user',
                    content: `Módulo: ${moduleName}\nFlujo: ${flowName}\n\nSpec grabado:\n${specContent}`,
                },
            ],
        });

        const block = response.content.find((b: any) => b.type === 'text');
        if (!block) return [];

        try {
            let raw: string = block.text.trim();
            raw = raw.replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/i, '').trim();
            const parsed = JSON.parse(raw);
            if (!Array.isArray(parsed)) return [];
            const out: EdgeCaseSuggestion[] = [];
            for (const item of parsed) {
                if (!item || typeof item !== 'object') continue;
                const title = typeof item.title === 'string' ? item.title.trim() : '';
                if (!title) continue;
                const type = EDGE_CASE_TYPES.includes(item.type) ? item.type : 'otro';
                const priority = EDGE_CASE_PRIORITIES.includes(item.priority) ? item.priority : 'media';
                const description = typeof item.description === 'string' ? item.description : '';
                out.push({ title, type, description, priority });
            }
            return out;
        } catch {
            return [];
        }
    }
}

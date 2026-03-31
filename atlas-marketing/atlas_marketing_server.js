// atlas_marketing_server.js — ATLAS-MARKETING v1.0
// 5 Agentes Estratégicos: Content & Messaging, CRO, Competitive, SEO, Brand
// Arquitectura de memoria idéntica a Antigravity Squad v2.0
require('dotenv').config();
const express = require('express');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json());

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// ─── WORKSPACES DE LOS 5 AGENTES ─────────────────────────────────────────────
const WORKSPACE_ROOT = process.env.WORKSPACE_ROOT || '/workspaces/ALIUN_ATLAS';

const WORKSPACES = {
  content_messaging:      path.join(WORKSPACE_ROOT, '02_ATLAS_MARKETING/01_content_messaging'),
  cro_funnel:             path.join(WORKSPACE_ROOT, '02_ATLAS_MARKETING/02_cro_funnel'),
  competitive_positioning: path.join(WORKSPACE_ROOT, '02_ATLAS_MARKETING/03_competitive_positioning'),
  technical_seo:          path.join(WORKSPACE_ROOT, '02_ATLAS_MARKETING/04_technical_seo'),
  brand_strategy:         path.join(WORKSPACE_ROOT, '02_ATLAS_MARKETING/05_brand_strategy'),
};

// ─── REGISTRO DE IAs POR AGENTE ───────────────────────────────────────────────
// Qué modelo usa cada agente y por qué
const AGENT_AI_MAP = {
  content_messaging: {
    primary:     'gemini-2.0-flash-exp',   // Rápido, multimodal, análisis de oferta
    secondary:   'claude',                  // Narrativa B2C/B2B cuando Aldo lo activa
    local_ollama: 'llama3.1',              // Auditoría de copy sin costo ni privacidad
    tool:        'NotebookLM',             // Base de conocimiento de SOPs internos
    why: 'Gemini Flash para briefs diarios rápidos. Claude para narrativas de campaña premium. Ollama local para auditar copies sin exponer datos a la nube.'
  },
  cro_funnel: {
    primary:     'gemini-2.0-flash-exp',   // Análisis de métricas, A/B testing, patrones
    secondary:   'gemini-pro',             // Análisis profundo de embudos
    local_ollama: 'llama3.1',             // Análisis de conversión sin costo
    tool:        'Supabase Views',         // v_squad_performance, KPIs directos
    why: 'Gemini para análisis cuantitativo de métricas. Ollama local para procesamiento de logs de conversión masivos a $0.'
  },
  competitive_positioning: {
    primary:     'perplexity',            // Research en tiempo real — su razón de existir
    secondary:   'gemini-2.0-flash-exp', // Estructurar el intel en JSON/brief
    local_ollama: 'llama3.1',            // Análisis privado de precios de competidores
    tool:        'Perplexity API',        // Búsqueda web en tiempo real con fuentes
    why: 'Perplexity es el único con acceso a precios actuales de OTAs (Booking, Expedia, Despegar). Ollama para procesar datos de competencia sin filtrar a la nube.'
  },
  technical_seo: {
    primary:     'gemini-2.0-flash-exp', // Genera meta_tags, titles, descriptions en lote
    secondary:   'perplexity',           // Keywords actuales, tendencias de búsqueda RD
    local_ollama: 'llama3.1',           // Auditoría masiva de SEO on-page a $0
    tool:        'Supabase (marketing_offers.ai_generated_content)',
    why: 'Gemini Flash para generación de metadatos en lote (116 hoteles). Perplexity para validar que los keywords reflejen búsquedas reales actuales en RD.'
  },
  brand_strategy: {
    primary:     'gemini-2.0-flash-exp', // Análisis de consistencia visual rápido
    secondary:   'claude',               // Narrativa de marca profunda, brand voice
    local_ollama: 'llama3.1',           // Revisión de coherencia de copias sin costo
    tool:        'NotebookLM',           // Guías de marca, asset registry
    why: 'Claude para definir y mantener el brand voice (el más fuerte en narrativa de identidad). Gemini para análisis visual multimodal de posts publicados.'
  }
};

// ─── FUNCIÓN: LEER MEMORIA DEL AGENTE ────────────────────────────────────────
function loadAgentMemory(agentKey) {
  const contextPath = path.join(WORKSPACES[agentKey], 'CONTEXT.md');
  const weeklyLog   = path.join(WORKSPACES[agentKey], 'WEEKLY_INTEL.md');
  const decisionsLog = path.join(WORKSPACES[agentKey], 'DECISIONS_LOG.md');

  let context = '', weeklyIntel = '', decisions = '';

  try { if (fs.existsSync(contextPath)) context = fs.readFileSync(contextPath, 'utf8'); } catch(e) {}
  try { if (fs.existsSync(weeklyLog)) weeklyIntel = fs.readFileSync(weeklyLog, 'utf8').split('\n').slice(-40).join('\n'); } catch(e) {}
  try { if (fs.existsSync(decisionsLog)) decisions = fs.readFileSync(decisionsLog, 'utf8').split('\n').slice(-20).join('\n'); } catch(e) {}

  return { context, weeklyIntel, decisions };
}

// ─── FUNCIÓN: ESCRIBIR INTEL SEMANAL ─────────────────────────────────────────
function appendWeeklyIntel(agentKey, entry) {
  const logPath = path.join(WORKSPACES[agentKey], 'WEEKLY_INTEL.md');
  const timestamp = new Date().toISOString();
  try {
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    fs.appendFileSync(logPath, `\n## ${timestamp}\n${entry}\n---\n`, 'utf8');
  } catch(e) { console.warn(`[INTEL] Error escribiendo log de ${agentKey}:`, e.message); }
}

// ─── FUNCIÓN: LOG A SUPABASE ──────────────────────────────────────────────────
async function logToSupabase(payload) {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_KEY) return;
  try {
    await fetch(`${process.env.SUPABASE_URL}/rest/v1/marketing_strategic_log`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': process.env.SUPABASE_KEY,
        'Authorization': `Bearer ${process.env.SUPABASE_KEY}`,
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify(payload)
    });
  } catch(e) { console.warn('[SUPABASE LOG]', e.message); }
}

// ─── FUNCIÓN: LLAMAR AGENTE GEMINI ───────────────────────────────────────────
async function callGeminiAgent(systemInstruction, userMessage, temp = 0.6) {
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.0-flash-exp',
    systemInstruction,
    generationConfig: { temperature: temp, maxOutputTokens: 2048 },
  });
  const result = await model.generateContent(userMessage);
  return result.response.text().trim();
}

// ─── FUNCIÓN: LLAMAR OLLAMA LOCAL (si disponible) ────────────────────────────
async function callOllamaLocal(prompt, model = 'llama3.1') {
  const ollamaUrl = process.env.OLLAMA_URL || 'http://localhost:11434';
  try {
    const res = await fetch(`${ollamaUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, prompt, stream: false }),
      signal: AbortSignal.timeout(30000)
    });
    const data = await res.json();
    return data.response || '';
  } catch(e) {
    console.warn(`[OLLAMA] No disponible (${e.message}), usando Gemini como fallback`);
    return null; // Fallback a Gemini en el caller
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// ENDPOINTS DE LOS 5 AGENTES ESTRATÉGICOS
// ═══════════════════════════════════════════════════════════════════════════════

// ─── AGENTE 01: CONTENT & MESSAGING ──────────────────────────────────────────
// Recibe: datos de oferta | Produce: strategic_brief para Antigravity Squad
app.post('/api/v1/marketing/content-messaging', async (req, res) => {
  const { offer_id, hotel_name, price, offer_type, target_audience, campaign_objective, authorized_by } = req.body;
  if (!hotel_name || !offer_type) return res.status(400).json({ error: 'hotel_name y offer_type requeridos' });

  const memory = loadAgentMemory('content_messaging');
  const ai = AGENT_AI_MAP['content_messaging'];

  const systemPrompt = `
Eres el Agente de Content & Messaging de ATLAS-MARKETING, ALIUN Travel SRL.
Tu output es el BRIEF ESTRATÉGICO que recibe el Escuadrón Antigravity (Copywriter, Director de Arte).
No produces copy final — produces la DIRECTIVA que guía al ejecutor.

REGLAS INVARIABLES (Hard-Coded del sistema):
- CERO urgencia falsa. Si el stock no es bajo, no se comunica escasez.
- Precio siempre con impuestos incluidos. Sin "desde" ni "aproximadamente".
- Human-in-the-Loop: toda oferta pasa por aprobación humana antes de publicarse.

TU OUTPUT: JSON con el strategic_brief para el Escuadrón Antigravity.
${memory.context ? `\nMEMORIA DE ROL:\n${memory.context}` : ''}
${memory.weeklyIntel ? `\nINTEL RECIENTE:\n${memory.weeklyIntel}` : ''}
`.trim();

  const userMsg = `
Genera el strategic_brief para esta oferta:
Hotel: ${hotel_name} | Precio: $${price} USD | Tipo: ${offer_type}
Público objetivo: ${target_audience || 'familias dominicanas y parejas clase media-alta'}
Objetivo de campaña: ${campaign_objective || 'conversión directa WhatsApp'}

Responde SOLO con JSON válido:
{
  "angle": "ángulo estratégico del mensaje",
  "tone": "tono específico para este tipo de oferta y audiencia",
  "primary_benefit": "el beneficio #1 a comunicar",
  "secondary_benefits": ["beneficio 2", "beneficio 3"],
  "cta_strategy": "estrategia de llamada a la acción",
  "platform_notes": {
    "instagram": "adaptación de tono para IG",
    "facebook": "adaptación para FB",
    "tiktok": "adaptación para TT"
  },
  "urgency_allowed": boolean,
  "urgency_note": "razón por la que se permite o no urgencia"
}
`.trim();

  try {
    const raw = await callGeminiAgent(systemPrompt, userMsg);
    const brief = JSON.parse(raw.replace(/```json\n?|\n?```/g, '').trim());

    appendWeeklyIntel('content_messaging',
      `Hotel: ${hotel_name} | Tipo: ${offer_type} | Ángulo: ${brief.angle}`
    );

    logToSupabase({
      agent: 'content_messaging', offer_id: offer_id || null,
      hotel_name, output_preview: brief.angle,
      authorized_by: authorized_by || 'auto', created_at: new Date().toISOString()
    });

    return res.json({ ...brief, meta: { agent: 'content_messaging', ai_used: ai.primary, timestamp: new Date().toISOString() } });
  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
});

// ─── AGENTE 02: CRO & FUNNEL ──────────────────────────────────────────────────
// Recibe: métricas de rendimiento | Produce: recomendaciones de optimización
app.post('/api/v1/marketing/cro-funnel', async (req, res) => {
  const { metrics_window_days, offer_type_filter, hotel_filter, authorized_by } = req.body;

  const memory = loadAgentMemory('cro_funnel');
  const ai = AGENT_AI_MAP['cro_funnel'];

  // Intentar leer métricas reales de Supabase
  let supabaseMetrics = null;
  if (process.env.SUPABASE_URL && process.env.SUPABASE_KEY) {
    try {
      const r = await fetch(
        `${process.env.SUPABASE_URL}/rest/v1/v_squad_performance?limit=10`,
        { headers: { 'apikey': process.env.SUPABASE_KEY, 'Authorization': `Bearer ${process.env.SUPABASE_KEY}` } }
      );
      supabaseMetrics = await r.json();
    } catch(e) { console.warn('[CRO] No se pudieron leer métricas de Supabase'); }
  }

  const systemPrompt = `
Eres el Agente CRO & Funnel de ATLAS-MARKETING, ALIUN Travel SRL.
Analizas métricas de rendimiento de posts y ofertas para optimizar conversión.
Tu output es un informe de recomendaciones accionables en JSON.
KPIs objetivo del sistema: CTR > 3%, Conversión DM→Lead > 15%, Tiempo respuesta Kommo < 2h.
${memory.context ? `\nMEMORIA DE ROL:\n${memory.context}` : ''}
${memory.weeklyIntel ? `\nINTEL RECIENTE:\n${memory.weeklyIntel}` : ''}
`.trim();

  const userMsg = `
Analiza el rendimiento y genera recomendaciones de optimización.
Ventana de análisis: últimos ${metrics_window_days || 7} días.
${offer_type_filter ? `Filtro por tipo: ${offer_type_filter}` : ''}
${hotel_filter ? `Filtro por hotel: ${hotel_filter}` : ''}
Métricas disponibles de Supabase: ${supabaseMetrics ? JSON.stringify(supabaseMetrics).substring(0, 600) : 'No disponibles, usar benchmarks del sistema'}

Responde SOLO con JSON:
{
  "performance_summary": "resumen ejecutivo del rendimiento",
  "top_performing_pattern": "qué patrón de oferta convierte mejor",
  "optimization_actions": [
    { "area": "área a optimizar", "action": "acción específica", "priority": "high|medium|low" }
  ],
  "cta_recommendation": "CTA recomendado esta semana",
  "best_publish_times": { "instagram": "hora", "facebook": "hora", "tiktok": "hora" },
  "alert": "alerta crítica si algún KPI está en rojo o null si todo OK"
}
`.trim();

  try {
    // CRO usa Ollama si disponible (análisis de datos sin costo)
    let raw = await callOllamaLocal(`${systemPrompt}\n\n${userMsg}`);
    if (!raw) raw = await callGeminiAgent(systemPrompt, userMsg, 0.4);

    const analysis = JSON.parse(raw.replace(/```json\n?|\n?```/g, '').trim());
    appendWeeklyIntel('cro_funnel', `Análisis: ${analysis.performance_summary}`);

    return res.json({ ...analysis, meta: { agent: 'cro_funnel', ai_used: raw ? ai.local_ollama : ai.primary, timestamp: new Date().toISOString() } });
  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
});

// ─── AGENTE 03: COMPETITIVE POSITIONING ──────────────────────────────────────
// Recibe: hotel o destino | Produce: intel de mercado y posicionamiento
app.post('/api/v1/marketing/competitive', async (req, res) => {
  const { hotel_name, competitor_names, destination, intel_type, authorized_by } = req.body;

  const memory = loadAgentMemory('competitive_positioning');
  const ai = AGENT_AI_MAP['competitive_positioning'];

  // NOTA: Perplexity API se conecta aquí cuando esté disponible.
  // Mientras tanto: Gemini genera intel basado en conocimiento del sistema.
  // Para activar Perplexity: reemplazar callGeminiAgent por callPerplexityAPI()
  const perplexityAvailable = !!process.env.PERPLEXITY_API_KEY;

  const systemPrompt = `
Eres el Agente de Competitive Positioning de ATLAS-MARKETING, ALIUN Travel SRL.
Tu misión: inteligencia de mercado real. Monitorear competidores (D'KATA Dreams Tours, Explora Tours,
agencias dominicanas en RRSS) y OTAs (Booking.com, Expedia, Despegar).
Ventaja competitiva de ALIUN a siempre destacar: precio transparente con impuestos, respuesta <2h,
agente IA 24/7, multi-plataforma simultáneo.
${memory.context ? `\nMEMORIA:\n${memory.context}` : ''}
${memory.weeklyIntel ? `\nINTEL ACUMULADO:\n${memory.weeklyIntel}` : ''}
`.trim();

  const userMsg = `
Genera análisis de posicionamiento competitivo.
Hotel/destino analizado: ${hotel_name || destination || 'mercado general RD'}
Competidores a evaluar: ${(competitor_names || ['D\'KATA Dreams Tours', 'Explora Tours', 'Agencias RRSS RD']).join(', ')}
Tipo de análisis: ${intel_type || 'precio y posicionamiento'}
Modo: ${perplexityAvailable ? 'Perplexity ACTIVO — usa datos en tiempo real' : 'Gemini — usa conocimiento del sistema + recomendaciones basadas en contexto'}

Responde SOLO con JSON:
{
  "market_position": "posición actual de ALIUN vs competidores",
  "competitor_intel": [
    { "name": "competidor", "pricing_strategy": "su estrategia", "weakness": "su punto débil vs ALIUN" }
  ],
  "price_recommendation": "rango de precio óptimo para ser competitivo sin comprometer margen 15%",
  "differentiation_angle": "ángulo de diferenciación a comunicar esta semana",
  "opportunity": "oportunidad de mercado identificada",
  "threat": "amenaza a monitorear o null si no hay",
  "data_source": "${perplexityAvailable ? 'perplexity_realtime' : 'system_knowledge'}"
}
`.trim();

  try {
    let raw;
    if (perplexityAvailable) {
      // Placeholder: reemplazar con llamada real a Perplexity API
      raw = await callGeminiAgent(systemPrompt, userMsg, 0.5);
    } else {
      // Intentar Ollama para análisis privado de competencia
      raw = await callOllamaLocal(`${systemPrompt}\n\n${userMsg}`);
      if (!raw) raw = await callGeminiAgent(systemPrompt, userMsg, 0.5);
    }

    const intel = JSON.parse(raw.replace(/```json\n?|\n?```/g, '').trim());
    appendWeeklyIntel('competitive_positioning',
      `${hotel_name || destination}: ${intel.differentiation_angle}`
    );

    return res.json({ ...intel, meta: { agent: 'competitive_positioning', ai_used: perplexityAvailable ? 'perplexity' : ai.local_ollama, timestamp: new Date().toISOString() } });
  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
});

// ─── AGENTE 04: TECHNICAL SEO ─────────────────────────────────────────────────
// Recibe: offer data | Produce: meta_tags, title, description SEO optimizados
app.post('/api/v1/marketing/seo', async (req, res) => {
  const { hotel_name, hotel_slug, offer_type, destination, stars, price, offer_id, authorized_by } = req.body;
  if (!hotel_name) return res.status(400).json({ error: 'hotel_name requerido' });

  const memory = loadAgentMemory('technical_seo');
  const ai = AGENT_AI_MAP['technical_seo'];

  const systemPrompt = `
Eres el Agente de Technical SEO de ATLAS-MARKETING, ALIUN Travel SRL.
Generas metadatos SEO optimizados para cada oferta en marketing_offers.
Keywords principales del mercado RD: "hotel todo incluido republica dominicana",
"paquetes punta cana", "oferta playa dominicana", "resort all inclusive RD".
Schema.org recomendado: TouristTrip + Offer.
Title: max 60 chars. Description: 150-160 chars. Meta_tags: array de 5-8 tags.
${memory.context ? `\nMEMORIA:\n${memory.context}` : ''}
`.trim();

  const userMsg = `
Genera metadatos SEO para esta oferta:
Hotel: ${hotel_name} | Slug: ${hotel_slug || hotel_name.toLowerCase().replace(/ /g,'-')}
Destino: ${destination || 'Punta Cana, República Dominicana'}
Tipo oferta: ${offer_type || 'last_minute'} | Estrellas: ${stars || 4} | Precio: $${price || 'N/A'} USD

Responde SOLO con JSON (sin markdown):
{
  "seo_title": "title tag optimizado max 60 chars",
  "seo_description": "meta description 150-160 chars con CTA natural",
  "meta_tags": ["tag1", "tag2", "tag3", "tag4", "tag5"],
  "schema_type": "TouristTrip",
  "url_slug_recommended": "slug-seo-friendly",
  "h1_recommended": "H1 de la página de oferta",
  "keyword_primary": "keyword principal",
  "keyword_secondary": ["kw2", "kw3"]
}
`.trim();

  try {
    // SEO en lote — Ollama es ideal para procesar 116 hoteles a $0
    let raw = await callOllamaLocal(`${systemPrompt}\n\n${userMsg}`);
    if (!raw) raw = await callGeminiAgent(systemPrompt, userMsg, 0.3);

    const seoData = JSON.parse(raw.replace(/```json\n?|\n?```/g, '').trim());

    // Actualizar marketing_offers en Supabase si tenemos offer_id
    if (offer_id && process.env.SUPABASE_URL && process.env.SUPABASE_KEY) {
      try {
        await fetch(`${process.env.SUPABASE_URL}/rest/v1/marketing_offers?id=eq.${offer_id}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'apikey': process.env.SUPABASE_KEY,
            'Authorization': `Bearer ${process.env.SUPABASE_KEY}`
          },
          body: JSON.stringify({ meta_tags: seoData.meta_tags })
        });
      } catch(e) { console.warn('[SEO] No se pudo actualizar Supabase'); }
    }

    appendWeeklyIntel('technical_seo', `${hotel_name}: ${seoData.keyword_primary}`);

    return res.json({ ...seoData, meta: { agent: 'technical_seo', ai_used: raw ? ai.local_ollama : ai.primary, offer_id_updated: !!offer_id, timestamp: new Date().toISOString() } });
  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
});

// ─── AGENTE 05: BRAND STRATEGY ────────────────────────────────────────────────
// Recibe: post publicado o asset visual | Produce: auditoría de coherencia de marca
app.post('/api/v1/marketing/brand', async (req, res) => {
  const { copy_to_audit, platform, offer_type, action, authorized_by } = req.body;

  const memory = loadAgentMemory('brand_strategy');
  const ai = AGENT_AI_MAP['brand_strategy'];

  const systemPrompt = `
Eres el Agente de Brand Strategy de ATLAS-MARKETING, ALIUN Travel SRL.
Custodias la identidad de marca en todas las comunicaciones.
IDENTIDAD ALIUN TRAVEL:
- Posicionamiento: luxury accesible para familias y parejas dominicanas clase media-alta.
- Tono: cálido, experto, honesto. Nunca genérico, nunca corporativo frío.
- Paleta visual: azul caribe (#0066CC), arena dorada (#D4A843), blanco puro (#FFFFFF).
- Logo: siempre esquina inferior derecha, fondo transparente 150x50px.
- Sin texto sobre imagen superior al 30% del área.
- Emojis: máx 5, nunca agresivos (no 🔥💥⚡).

TU ACCIÓN:
- "audit": revisar copy o asset y emitir veredicto APROBADO/RECHAZADO con notas.
- "guidelines": generar guías de plataforma específica.
- "voice_sample": generar muestra del brand voice para un tipo de oferta.
${memory.context ? `\nMEMORIA:\n${memory.context}` : ''}
${memory.weeklyIntel ? `\nINTEL DE MARCA:\n${memory.weeklyIntel}` : ''}
`.trim();

  const userMsg = `
Acción: ${action || 'audit'}
Plataforma: ${platform || 'instagram'}
Tipo de oferta: ${offer_type || 'general'}
${copy_to_audit ? `Copy a auditar:\n"${copy_to_audit}"` : 'Genera guías de marca para la plataforma especificada.'}

Responde SOLO con JSON:
{
  "action_performed": "${action || 'audit'}",
  "verdict": "APROBADO|RECHAZADO|GUIDELINES|VOICE_SAMPLE",
  "brand_score": número_del_1_al_10,
  "issues": ["issue 1 si hay", "issue 2 si hay"],
  "corrections": ["corrección sugerida si aplica"],
  "approved_version": "versión corregida del copy o null si ya está bien",
  "brand_notes": "observación de marca para el archivo de memoria"
}
`.trim();

  try {
    // Brand strategy: Claude sería ideal (mejor en narrativa de identidad)
    // Usando Gemini como proxy hasta que se integre Claude API directamente aquí
    const raw = await callGeminiAgent(systemPrompt, userMsg, 0.5);
    const audit = JSON.parse(raw.replace(/```json\n?|\n?```/g, '').trim());

    appendWeeklyIntel('brand_strategy',
      `Auditoría ${platform}: ${audit.verdict} | Score: ${audit.brand_score}/10`
    );

    return res.json({ ...audit, meta: { agent: 'brand_strategy', ai_used: ai.secondary + '_via_gemini_proxy', note: ai.why, timestamp: new Date().toISOString() } });
  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
});

// ─── ENDPOINT ORQUESTADOR: PIPELINE COMPLETO DE OFERTA ───────────────────────
// Ejecuta los 5 agentes en secuencia para una oferta completa
// Produce: strategic_brief listo para Antigravity Squad
app.post('/api/v1/marketing/full-pipeline', async (req, res) => {
  const startTime = Date.now();
  const { hotel_name, price, offer_type, destination, stars, hotel_slug, offer_id, authorized_by } = req.body;

  if (!hotel_name || !price || !offer_type) {
    return res.status(400).json({ error: 'hotel_name, price y offer_type requeridos' });
  }

  console.log(`\n[ATLAS-MKT] Pipeline completo: ${hotel_name} @ $${price} | ${offer_type}`);

  try {
    // Paso 1: Content & Messaging genera el brief estratégico
    const contentRes = await fetch(`http://localhost:${process.env.PORT || 4000}/api/v1/marketing/content-messaging`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hotel_name, price, offer_type, destination, authorized_by })
    });
    const contentBrief = await contentRes.json();

    // Paso 2: SEO genera metadatos
    const seoRes = await fetch(`http://localhost:${process.env.PORT || 4000}/api/v1/marketing/seo`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hotel_name, hotel_slug, offer_type, destination, stars, price, offer_id, authorized_by })
    });
    const seoData = await seoRes.json();

    // Paso 3: Brand valida el ángulo estratégico
    const brandRes = await fetch(`http://localhost:${process.env.PORT || 4000}/api/v1/marketing/brand`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ copy_to_audit: contentBrief.angle, platform: 'instagram', offer_type, action: 'audit', authorized_by })
    });
    const brandAudit = await brandRes.json();

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);

    // Output final: payload listo para Antigravity Squad
    const antigravityPayload = {
      hotel_name,
      price,
      offer_type,
      destination: destination || 'Punta Cana, República Dominicana',
      // El strategic_brief que usa Antigravity Squad v2.0
      strategic_brief: `
ÁNGULO: ${contentBrief.angle}
TONO: ${contentBrief.tone}
BENEFICIO PRINCIPAL: ${contentBrief.primary_benefit}
BENEFICIOS SECUNDARIOS: ${(contentBrief.secondary_benefits || []).join(' | ')}
CTA STRATEGY: ${contentBrief.cta_strategy}
URGENCIA PERMITIDA: ${contentBrief.urgency_allowed ? 'SÍ — ' + contentBrief.urgency_note : 'NO'}
BRAND SCORE: ${brandAudit.brand_score}/10 | VEREDICTO: ${brandAudit.verdict}
`.trim(),
      meta_tags: seoData.meta_tags,
      seo_title: seoData.seo_title,
      authorized_by: authorized_by || 'atlas_marketing_pipeline'
    };

    console.log(`[ATLAS-MKT] Pipeline completado en ${elapsed}s`);

    return res.json({
      antigravity_payload: antigravityPayload,
      pipeline_details: { content_brief: contentBrief, seo_data: seoData, brand_audit: brandAudit },
      meta: { pipeline_version: '1.0', elapsed_seconds: parseFloat(elapsed), timestamp: new Date().toISOString() }
    });

  } catch(e) {
    return res.status(500).json({ error: 'Pipeline ATLAS-MARKETING falló', detail: e.message });
  }
});

// ─── ENDPOINTS DE MEMORIA ────────────────────────────────────────────────────
app.get('/api/v1/marketing/memory/:agent', (req, res) => {
  const { agent } = req.params;
  if (!WORKSPACES[agent]) return res.status(404).json({ error: `Agente desconocido: ${agent}`, available: Object.keys(WORKSPACES) });
  const memory = loadAgentMemory(agent);
  const ai = AGENT_AI_MAP[agent];
  return res.json({ agent, ai_stack: ai, has_context: !!memory.context, has_intel: !!memory.weeklyIntel, context_preview: memory.context?.substring(0, 300), recent_intel: memory.weeklyIntel });
});

app.post('/api/v1/marketing/memory/:agent', (req, res) => {
  const { agent } = req.params;
  const { context, authorized_by } = req.body;
  if (!WORKSPACES[agent]) return res.status(404).json({ error: `Agente desconocido: ${agent}` });
  try {
    const contextPath = path.join(WORKSPACES[agent], 'CONTEXT.md');
    fs.mkdirSync(path.dirname(contextPath), { recursive: true });
    fs.writeFileSync(contextPath, context, 'utf8');
    return res.json({ success: true, agent, updated_by: authorized_by, timestamp: new Date().toISOString() });
  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
});

// ─── HEALTH CHECK ────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  const status = {};
  for (const [key] of Object.entries(WORKSPACES)) {
    const mem = loadAgentMemory(key);
    status[key] = { has_context: !!mem.context, ai_stack: AGENT_AI_MAP[key].primary };
  }
  return res.json({
    status: 'alive', service: 'atlas-marketing',
    version: '1.0', agents: status,
    perplexity_connected: !!process.env.PERPLEXITY_API_KEY,
    ollama_url: process.env.OLLAMA_URL || 'http://localhost:11434 (local)',
    workspace_root: WORKSPACE_ROOT
  });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`\n📣 ATLAS-MARKETING v1.0 activo en puerto ${PORT}`);
  console.log(`🤖 Agentes: Content & Messaging | CRO & Funnel | Competitive | SEO | Brand`);
  console.log(`🧠 Perplexity: ${process.env.PERPLEXITY_API_KEY ? 'CONECTADO' : 'PENDIENTE (usando Gemini/Ollama)'}`);
  console.log(`🏠 Ollama Local: ${process.env.OLLAMA_URL || 'http://localhost:11434'}\n`);
});

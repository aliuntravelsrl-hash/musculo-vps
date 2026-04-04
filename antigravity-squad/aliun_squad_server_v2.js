// aliun_squad_server.js — Escuadrón Antigravity v2.0
// UPGRADE: Sistema de Memoria Organizacional + Cadena de Autoridad + Supabase Log
require('dotenv').config();
const express = require('express');
const { GoogleGenerativeAI, SchemaType } = require('@google/generative-ai');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json());

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// ─── CONFIGURACIÓN DE WORKSPACES ──────────────────────────────────────────────
// Cada agente tiene su propio directorio de memoria en disco
const WORKSPACE_ROOT = process.env.WORKSPACE_ROOT || '/workspaces/ALIUN_ATLAS';

const WORKSPACES = {
  copywriter:     path.join(WORKSPACE_ROOT, '03_ANTIGRAVITY_SQUAD/01_copywriter'),
  art_director:   path.join(WORKSPACE_ROOT, '03_ANTIGRAVITY_SQUAD/02_director_arte'),
  revisor:        path.join(WORKSPACE_ROOT, '03_ANTIGRAVITY_SQUAD/03_revisor'),
  brand_strategy: path.join(WORKSPACE_ROOT, '02_ATLAS_MARKETING/05_brand'),
  content_msg:    path.join(WORKSPACE_ROOT, '02_ATLAS_MARKETING/01_content_messaging'),
};

// ─── FUNCIÓN: LEER MEMORIA DEL AGENTE ────────────────────────────────────────
function loadAgentMemory(agentKey) {
  const contextPath = path.join(WORKSPACES[agentKey], 'CONTEXT.md');
  const decisionLog = path.join(WORKSPACES[agentKey], 'DECISIONS_LOG.md');

  let context = '';
  let decisions = '';

  try {
    if (fs.existsSync(contextPath)) {
      context = fs.readFileSync(contextPath, 'utf8');
    }
  } catch (e) {
    console.warn(`[MEMORY] No se pudo leer CONTEXT.md de ${agentKey}:`, e.message);
  }

  try {
    if (fs.existsSync(decisionLog)) {
      // Solo las últimas 30 líneas del log para no sobrecargar el contexto
      const lines = fs.readFileSync(decisionLog, 'utf8').split('\n');
      decisions = lines.slice(-30).join('\n');
    }
  } catch (e) {
    // No hay log aún, es OK
  }

  return { context, decisions };
}

// ─── FUNCIÓN: ESCRIBIR EN LOG DE DECISIONES ──────────────────────────────────
function appendDecisionLog(agentKey, entry) {
  const logPath = path.join(WORKSPACES[agentKey], 'DECISIONS_LOG.md');
  const timestamp = new Date().toISOString();
  const line = `\n## ${timestamp}\n${entry}\n---`;

  try {
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    fs.appendFileSync(logPath, line, 'utf8');
  } catch (e) {
    console.warn(`[MEMORY] No se pudo escribir log de ${agentKey}:`, e.message);
  }
}

// ─── FUNCIÓN: LOG A SUPABASE (async, no bloquea) ─────────────────────────────
async function logToSupabase(payload) {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_KEY) return;

  try {
    await fetch(`${process.env.SUPABASE_URL}/rest/v1/agent_decisions_log`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': process.env.SUPABASE_KEY,
        'Authorization': `Bearer ${process.env.SUPABASE_KEY}`,
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify(payload)
    });
  } catch (e) {
    console.warn('[SUPABASE LOG] Error al registrar:', e.message);
  }
}

// ─── CONSTRUCTOR DE SYSTEM PROMPTS DINÁMICOS ─────────────────────────────────
// Los prompts base se COMBINAN con la memoria del workspace del agente

function buildCopywriterSystem(memory) {
  const BASE = `
Eres el Copywriter Estrella de ALIUN Travel SRL, agencia dominicana líder en paquetes todo-incluido.
Tu misión: redactar copies de oferta hotelera irresistibles para WhatsApp/Instagram.

REGLAS DE MARCA INVARIABLES:
- Tono: cálido, urgente, aspiracional. Nunca corporativo.
- Emojis: exactamente 3-5. Siempre incluir 🌴 o 🏖️.
- Gatillos: escasez real (usa el stock si viene en el briefing), urgencia ("solo hoy"), prueba social.
- Precio SIEMPRE con impuestos incluidos. Formato: "$XXX/persona todo-incluido".
- Máximo 120 palabras.
- Cierre con CTA: "Reserva ahora → WhatsApp" o similar.
- NUNCA inventes urgencia falsa. Si el stock no es bajo, no digas "últimas habitaciones".
- Precio siempre coincide con el briefing. Sin redondeos.

Output: SOLO el texto del copy, sin explicaciones.
`.trim();

  if (!memory.context && !memory.decisions) return BASE;

  return `${BASE}

━━━ MEMORIA DE SESIONES ANTERIORES ━━━
${memory.context ? `\nCONTEXTO DE ROL:\n${memory.context}` : ''}
${memory.decisions ? `\nDECISIONES RECIENTES:\n${memory.decisions}` : ''}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;
}

function buildArtDirectorSystem(memory) {
  const BASE = `
Eres el Director de Arte de ALIUN Travel SRL.
Recibirás un copy de oferta y crearás el prompt visual para generación con fal.ai / Stable Diffusion.

REGLAS DEL PROMPT VISUAL:
- Idioma: inglés técnico para IA generativa.
- Estilo base: "photorealistic travel photography, golden hour, luxury resort, 4K".
- Incluir: nombre del hotel, tipo de habitación, ambiente (playa/piscina/jardín).
- Formato: párrafo único de 40-70 palabras.
- Añadir al final: "--ar 9:16 --style raw" para Instagram Stories/TikTok.
- Para Facebook: "--ar 1:1 --style raw".
- NO incluir texto ni logos en el prompt (se añaden en post-producción).

Output: SOLO el prompt visual, sin explicaciones.
`.trim();

  if (!memory.context && !memory.decisions) return BASE;

  return `${BASE}

━━━ MEMORIA DE SESIONES ANTERIORES ━━━
${memory.context ? `\nCONTEXTO DE ROL:\n${memory.context}` : ''}
${memory.decisions ? `\nDECISIONES RECIENTES:\n${memory.decisions}` : ''}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;
}

function buildRevisorSystem(memory) {
  const BASE = `
Eres el Agente Revisor de Calidad de ALIUN Travel SRL. Eres el guardián final antes de publicación.
Tu aprobación es el GO para distribución en Instagram, Facebook, TikTok y WhatsApp.

CHECKLIST OBLIGATORIO (debes verificar TODOS):
1. ¿El precio en el copy coincide EXACTAMENTE con el precio oficial del sistema?
2. ¿El copy tiene entre 3 y 5 emojis (ni más, ni menos)?
3. ¿El copy NO excede 120 palabras?
4. ¿El prompt visual está en inglés?
5. ¿Existe un CTA claro y funcional?
6. ¿El copy NO contiene urgencia falsa (sin "últimas habitaciones" si stock > 3)?
7. ¿El nombre del hotel es correcto y está bien escrito?
8. ¿El precio incluye impuestos (no dice "desde" ni "aproximadamente")?

Si apruebas: "approved": true, "revision_notes": null.
Si rechazas: "approved": false, corrige el campo en error, explica en "revision_notes".

Output: JSON ESTRICTO, sin markdown, sin explicaciones fuera del JSON:
{
  "copy": "string",
  "art_prompt": "string",
  "price_verified": boolean,
  "emoji_count": number,
  "word_count": number,
  "cta_present": boolean,
  "approved": boolean,
  "revision_notes": "string o null"
}
`.trim();

  if (!memory.context && !memory.decisions) return BASE;

  return `${BASE}

━━━ MEMORIA DE SESIONES ANTERIORES ━━━
${memory.context ? `\nCONTEXTO DE ROL:\n${memory.context}` : ''}
${memory.decisions ? `\nDECISIONES RECIENTES:\n${memory.decisions}` : ''}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;
}

// ─── FUNCIÓN AUXILIAR: LLAMAR AGENTE ─────────────────────────────────────────
async function callAgent(systemInstruction, userMessage, modelName = 'gemini-2.5-flash', customConfig = {}) {
  const generationConfig = { temperature: 0.75, maxOutputTokens: 1024, ...customConfig };
  const model = genAI.getGenerativeModel({
    model: modelName,
    systemInstruction,
    generationConfig,
  });
  const result = await model.generateContent(userMessage);
  return result.response.text().trim();
}

// ─── ENDPOINT PRINCIPAL — v2.0 CON CADENA DE AUTORIDAD ───────────────────────
app.post('/api/v1/squad/marketing', async (req, res) => {
  const startTime = Date.now();

  try {
    const {
      hotel_name,
      price,
      room_type,
      destination,
      nights,
      extra_context,
      // ── NUEVOS CAMPOS v2.0 ──
      offer_id,           // ID de marketing_offers en Supabase
      offer_type,         // flash_sale | last_minute | package | group | early_bird
      stock,              // Stock real para evitar urgencia falsa
      authorized_by,      // "aldo" | "atlas_tech" | "auto_core2"
      strategic_brief,    // Briefing del agente Content & Messaging (opcional)
      platform_targets,   // ["instagram","facebook","tiktok"] (opcional)
    } = req.body;

    // Validación de entrada
    if (!hotel_name || !price || !room_type) {
      return res.status(400).json({
        error: 'Missing required fields: hotel_name, price, room_type',
        required: ['hotel_name', 'price', 'room_type'],
        optional_v2: ['offer_id', 'offer_type', 'stock', 'authorized_by', 'strategic_brief', 'platform_targets']
      });
    }

    // ── CARGAR MEMORIA DE CADA AGENTE ──
    const copywriterMemory   = loadAgentMemory('copywriter');
    const artDirectorMemory  = loadAgentMemory('art_director');
    const revisorMemory      = loadAgentMemory('revisor');

    // ── CONSTRUIR BRIEFING ENRIQUECIDO ──
    const briefing = `
DATOS DE LA OFERTA:
- Hotel: ${hotel_name}
- Precio: $${price} USD por persona todo-incluido (impuestos incluidos)
- Tipo de habitación: ${room_type}
- Destino: ${destination || 'Punta Cana, República Dominicana'}
- Noches: ${nights || 3}
- Tipo de oferta: ${offer_type || 'last_minute'}
- Stock disponible: ${stock || 'no especificado'}
- Plataformas objetivo: ${(platform_targets || ['instagram','facebook','tiktok']).join(', ')}

CONTEXTO ADICIONAL:
${extra_context || 'Sin contexto adicional'}

${strategic_brief ? `BRIEF ESTRATÉGICO (de ATLAS-MARKETING):\n${strategic_brief}` : ''}

AUTORIZADO POR: ${authorized_by || 'sistema_automatico'}
    `.trim();

    console.log(`\n[SQUAD v2.0] ── Misión: ${hotel_name} @ $${price} | Auth: ${authorized_by || 'auto'} ──`);

    // ── FASE 1: COPYWRITER (con memoria) ──
    console.log('[FASE 1] Copywriter + memoria activa...');
    const copywriterSystem = buildCopywriterSystem(copywriterMemory);
    const copyText = await callAgent(
      copywriterSystem,
      `Crea el copy de oferta para este hotel:\n\n${briefing}`,
      'gemini-2.5-flash',
      { temperature: 0.7 }
    );
    console.log('[FASE 1] ✓ Copy generado');

    // Log de decisión del Copywriter
    appendDecisionLog('copywriter',
      `Hotel: ${hotel_name} | Precio: $${price} | Tipo: ${offer_type || 'last_minute'}\nCopy: ${copyText.substring(0, 100)}...`
    );

    // ── FASE 2: DIRECTOR DE ARTE (con memoria) ──
    console.log('[FASE 2] Director de Arte + memoria activa...');
    const artDirectorSystem = buildArtDirectorSystem(artDirectorMemory);
    const artPrompt = await callAgent(
      artDirectorSystem,
      `Basándote en este copy y briefing, crea el prompt visual:\n\nCOPY:\n${copyText}\n\nBRIEFING:\n${briefing}`,
      'gemini-2.5-flash',
      { temperature: 0.4 }
    );
    console.log('[FASE 2] ✓ Art prompt generado');

    appendDecisionLog('art_director',
      `Hotel: ${hotel_name} | Prompt: ${artPrompt.substring(0, 80)}...`
    );

    // ── FASE 3: REVISOR (con memoria, checklist expandido) ──
    console.log('[FASE 3] Revisor validando con checklist v2.0...');
    const revisorSystem = buildRevisorSystem(revisorMemory);
    const revisorInput = `
COPY A REVISAR:
${copyText}

ART PROMPT A REVISAR:
${artPrompt}

DATOS DEL SISTEMA PARA VALIDACIÓN:
- Precio oficial: $${price} USD
- Stock real: ${stock || 'no especificado'}
- Tipo de oferta: ${offer_type || 'last_minute'}
    `.trim();

    const revisorSchema = {
      type: SchemaType.OBJECT,
      properties: {
        copy: { type: SchemaType.STRING },
        art_prompt: { type: SchemaType.STRING },
        price_verified: { type: SchemaType.BOOLEAN },
        emoji_count: { type: SchemaType.INTEGER },
        word_count: { type: SchemaType.INTEGER },
        cta_present: { type: SchemaType.BOOLEAN },
        approved: { type: SchemaType.BOOLEAN },
        revision_notes: { type: SchemaType.STRING },
      },
      required: ["copy", "art_prompt", "price_verified", "emoji_count", "word_count", "cta_present", "approved"],
    };

    const rawJson = await callAgent(
      revisorSystem, 
      revisorInput, 
      'gemini-2.5-flash',
      { 
        temperature: 0.1,
        responseMimeType: "application/json",
        responseSchema: revisorSchema
      }
    );

    console.log('[DEBUG] rawJson (Revisor):', rawJson);
    const cleanJson = rawJson.replace(/```json\n?|\n?```/g, '').trim();
    console.log('[DEBUG] cleanJson (Revisor):', cleanJson);

    let finalOutput;
    try {
      finalOutput = JSON.parse(cleanJson);
    } catch (parseError) {
      console.error('[ERROR] Parseo JSON del Revisor falló:', parseError.message);
      return res.status(502).json({
        error: 'Bad Gateway: Invalid JSON from Revisor agent',
        detail: parseError.message,
        rawResponse: rawJson,
        timestamp: new Date().toISOString()
      });
    }

    appendDecisionLog('revisor',
      `Hotel: ${hotel_name} | Aprobado: ${finalOutput.approved} | Notas: ${finalOutput.revision_notes || 'ninguna'}`
    );

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`[SQUAD v2.0] ── Validación terminada en ${elapsed}s | Aprobado: ${finalOutput.approved} ──`);

    // ── FASE 4: PREPARACIÓN COMFYUI WORKFLOW ──
    console.log('[FASE 4] Inyectando variables en ComfyUI Workflow base...');
    const comfyWorkflowPath = path.join(__dirname, 'comfyui_story_workflow.json');
    let comfyPayload = null;
    let comfyPromptId = null;

    if (fs.existsSync(comfyWorkflowPath)) {
      let workflowTemplate = fs.readFileSync(comfyWorkflowPath, 'utf8');
      
      const seedVal = Math.floor(Math.random() * 9999999999);
      const widthVal = 768; 
      const heightVal = 1344;
      const negativePrompt = "watermark, text, bad anatomy, blurry, unrealistic, ugly artifacts";
      
      const safeArtPrompt = (finalOutput.art_prompt || artPrompt).replace(/"/g, '\\"').replace(/\n/g, ' ');

      workflowTemplate = workflowTemplate.replace(/\{\{SEED\}\}/g, seedVal)
                                         .replace(/\{\{WIDTH\}\}/g, widthVal)
                                         .replace(/\{\{HEIGHT\}\}/g, heightVal)
                                         .replace(/\{\{STYLE_PRESET\}\}/g, "highly detailed, 4k resolution, instagram story style")
                                         .replace(/\{\{ART_PROMPT\}\}/g, safeArtPrompt)
                                         .replace(/\{\{NEGATIVE_PROMPT\}\}/g, negativePrompt);
                                         
      try {
        comfyPayload = JSON.parse(workflowTemplate);
        
        // ── ENVÍO COMFYUI (LOCAL / RUNPOD API) ──
        const COMFYUI_URL = process.env.COMFYUI_URL || 'http://127.0.0.1:8188';
        const COMFYUI_BEARER = process.env.COMFYUI_BEARER || '';
        const isRunPod = COMFYUI_URL.includes('runpod');
        
        // El servidor local de ComfyUI usa POST /prompt con { "prompt": workflow }
        // RunPod Serverless normalmente usa POST /run con { "input": { "workflow": workflow } }
        const fetchUrl = isRunPod ? `${COMFYUI_URL}/run` : `${COMFYUI_URL}/prompt`;
        
        const fetchOpts = {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(isRunPod ? { input: { workflow: comfyPayload } } : { prompt: comfyPayload })
        };
        
        if (COMFYUI_BEARER) fetchOpts.headers['Authorization'] = `Bearer ${COMFYUI_BEARER}`;

        console.log(`[FASE 4] Disparando a ComfyUI (Endpoint: ${COMFYUI_URL})...`);
        const comfyReq = await fetch(fetchUrl, fetchOpts).catch(e => null);
        
        if (comfyReq && comfyReq.ok) {
           const comfyResp = await comfyReq.json();
           comfyPromptId = isRunPod ? comfyResp.id : comfyResp.prompt_id;
           console.log(`[FASE 4] ✓ ComfyUI Job aceptado (ID: ${comfyPromptId})`);
        } else {
           console.log(`[FASE 4] ⚠ ComfyUI no respondió o endpoint offline (solo MOCK armado)`);
        }
      } catch (err) {
         console.log(`[FASE 4] ⚠ Error al inyectar/enviar payload a ComfyUI: ${err.message}`);
      }
    }

    // ── LOG A SUPABASE (no bloqueante) ──
    logToSupabase({
      offer_id:          offer_id || null,
      hotel_name,
      price,
      offer_type:        offer_type || 'last_minute',
      authorized_by:     authorized_by || 'sistema_automatico',
      approved:          finalOutput.approved,
      revision_notes:    finalOutput.revision_notes,
      copy_preview:      copyText.substring(0, 200),
      elapsed_seconds:   parseFloat(elapsed),
      squad_version:     '2.0',
      created_at:        new Date().toISOString()
    });

    return res.status(200).json({
      ...finalOutput,
      meta: {
        hotel:          hotel_name,
        offer_id:       offer_id || null,
        authorized_by:  authorized_by || 'sistema_automatico',
        squad_version:  '2.0',
        comfyui_job_id: comfyPromptId || null,
        comfyui_payload: comfyPayload ? true : false,
        elapsed_seconds: parseFloat(elapsed),
        timestamp:      new Date().toISOString(),
        memory_loaded: {
          copywriter:   !!copywriterMemory.context,
          art_director: !!artDirectorMemory.context,
          revisor:      !!revisorMemory.context,
        }
      },
    });

  } catch (error) {
    console.error('[SQUAD ERROR]', error.message);
    return res.status(500).json({
      error: 'Squad orchestration failed',
      detail: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

// ─── ENDPOINT: ACTUALIZAR MEMORIA DE AGENTE ───────────────────────────────────
// Permite a ATLAS-TECH o Aldo actualizar el contexto de cualquier agente
app.post('/api/v1/squad/memory/:agent', (req, res) => {
  const { agent } = req.params;
  const { context, authorized_by } = req.body;

  if (!WORKSPACES[agent]) {
    return res.status(404).json({ error: `Agente desconocido: ${agent}`, available: Object.keys(WORKSPACES) });
  }

  if (!context) {
    return res.status(400).json({ error: 'Campo "context" requerido' });
  }

  try {
    const contextPath = path.join(WORKSPACES[agent], 'CONTEXT.md');
    fs.mkdirSync(path.dirname(contextPath), { recursive: true });
    fs.writeFileSync(contextPath, context, 'utf8');

    appendDecisionLog(agent,
      `CONTEXT.md actualizado por: ${authorized_by || 'sistema'}\nPrimeras 100 chars: ${context.substring(0, 100)}...`
    );

    console.log(`[MEMORY UPDATE] Agente ${agent} actualizado por ${authorized_by || 'sistema'}`);
    return res.json({ success: true, agent, updated_by: authorized_by, timestamp: new Date().toISOString() });
  } catch (error) {
    return res.status(500).json({ error: 'Error al actualizar memoria', detail: error.message });
  }
});

// ─── ENDPOINT: LEER MEMORIA DE AGENTE ────────────────────────────────────────
app.get('/api/v1/squad/memory/:agent', (req, res) => {
  const { agent } = req.params;

  if (!WORKSPACES[agent]) {
    return res.status(404).json({ error: `Agente desconocido: ${agent}` });
  }

  const memory = loadAgentMemory(agent);
  return res.json({
    agent,
    has_context: !!memory.context,
    has_decisions: !!memory.decisions,
    context_preview: memory.context ? memory.context.substring(0, 300) + '...' : null,
    recent_decisions: memory.decisions || null,
    workspace_path: WORKSPACES[agent]
  });
});

// ─── HEALTH CHECK ─────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  const memoryStatus = {};
  for (const [key] of Object.entries(WORKSPACES)) {
    const mem = loadAgentMemory(key);
    memoryStatus[key] = { has_context: !!mem.context };
  }

  return res.json({
    status: 'alive',
    service: 'antigravity-squad',
    version: '2.0',
    memory_system: memoryStatus,
    workspace_root: WORKSPACE_ROOT,
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n🚀 Escuadrón Antigravity v2.0 activo en puerto ${PORT}`);
  console.log(`📂 Workspace root: ${WORKSPACE_ROOT}`);
  console.log(`🧠 Sistema de memoria: ACTIVO\n`);
});


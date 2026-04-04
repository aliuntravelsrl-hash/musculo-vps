# Contrato Paramétrico: ComfyUI JSON Workflow

Para asegurar que cualquier "motor visual" externo o instancia local corra bajo los mismoss estándares, los Blueprints JSON (`hotel-story-9x16.api.json`) tendrán la siguiente política de inyección mandatoria:

### Nodos de Inyección Dinámicos Aprobados

| Reemplazo Token | Nodo Comfy API | Propiedad Interna Reemplazada | Propósito |
| :--- | :--- | :--- | :--- |
| `{{SEED}}` | `KSampler` (ID: 3) | `inputs.seed` | Garantiza trazabilidad de lotes e iteraciones con misma topología generativa. |
| `{{WIDTH}}` | `EmptyLatentImage` (ID: 5) | `inputs.width` | Restringe ratio de salida. Valores estándar: 768 / 896 |
| `{{HEIGHT}}` | `EmptyLatentImage` (ID: 5) | `inputs.height` | Restringe ratio de salida. Valores estándar: 1344 / 1152 |
| `{{STYLE_PRESET}}` | `CLIPText` (ID: 6) | Prefix en `inputs.text` | Fija adjetivos mandatorios (EJ: *"Highly detailed, Masterpiece"*). Carga manual local. |
| `{{ART_PROMPT}}` | `CLIPText` (ID: 6) | Contenido de `inputs.text` | La directiva calculada por el Agente *Antigravity Director de Arte*. |
| `{{NEGATIVE_PROMPT}}` | `CLIPText` (ID: 7) | Contenido de `inputs.text` | Negativas estándar para mitigar ruido (EJ: *"text, watermark, ugly"*). |

### Reglas
- Cualquier Blueprint de Comfy API no deberá exceder las 150 líneas sin minificar.
- Toda llave en formato Mustache `{{TAG}}` está reservada por el Orquestador JS (Antigravity).
- Nodos "Custom" (e.g. ComfyUI-Impact-Pack) no están autorizados a interactuar con capas dinámicas en Fase 1. Usar Nodos Nativos (KSampler, LoadCheckpoint, etc).

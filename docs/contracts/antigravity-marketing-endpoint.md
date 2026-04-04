# Contrato API: Antigravity Marketing Endpoint

El Squad Server expone el endpoint interno de marketing usado de puente de inicio.

### `POST /api/v1/squad/marketing`

Endpoint principal orquestado por n8n. Desata la fase 1 (Copywriter), fase 2 (Director de Arte), fase 3 (Revisor/JSON Struct) y fase 4 (Inyector ComfyUI).

**Payload Request Esperado (Entrada obligatoria):**
```json
{
  "hotel_name": "Nombre Hotel",
  "price": 100,
  "room_type": "Categoria Cuarto",
  "offer_type": "last_minute",
  "stock": 5
}
```

**Payload Response Síncrono (Salida Final):**
```json
{
  "approved": true,
  "copy": "¡Tu escapada a Punta Cana te llama!...",
  "art_prompt": "highly detailed, 4k resolution, instagram story style...",
  ...
  "meta": {
    "comfyui_job_id": "848bd1b5-xxxx-xxxx-xxxx-xxxxxxxxxx",
    "comfyui_payload": true,
    "elapsed_seconds": 15.30
  }
}
```

*Nota:* Dependiendo del rate limit de APIs de terceros subyacentes, Antigravity puede retornar respuestas seguras `HTTP 502 Bad Gateway` en caso de recibir cadenas generadas rotas para ser re-procesadas nativamente por auto-retry de n8n.

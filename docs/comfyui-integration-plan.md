# ComfyUI Integration Plan

## Visión Estratégica
Integración API-First de ComfyUI en el motor de campañas visuales de ALIUN Travel. ComfyUI actúa únicamente como "Worker Visual" gestionado remotamente a través de workflows JSON generados por la capa cognitiva de Antigravity.

## Proceso de Experimentación
1. **Laboratorio Local**: Entorno primario para estructurar topologías y mapear los identificadores de ComfyUI (IDs de nodo). Ejecución vía POST http `/prompt` local en puerto 8188.
2. **Experimentación Cloud-First**: A fin de mantener control económico y escalabilidad horizontal, toda ejecución de generación final y pesada usará un orquestador externo y elástico (Ej: RunPod Serverless).
3. **Workflow Mínimo Aprobado**: Generación de "Historia Vertical Hotelera 9x16". Variables controladas: Hotel Name, Style, Aspect Ratio, Seed determinístico, Art Prompt dirigido.

## Flujo Lógico de Inyección
1. **Lectura JSON**: Antigravity Squad extrae plantilla desde `/workflows/comfyui`.
2. **Inyección Variables**: Usando mapeo clave-valor sobre las llaves estáticas contenidas en los inputs internos del JSON (`KSampler`, `EmptyLatentImage`).
3. **Envío de Payload Asíncrono**: Despacho al Endpoint seleccionado (Local/RunPod).
4. **Rescate Asíncrono**: Obtención del `prompt_id` y derivado final al repositorio visual (Subida a S3 u obtención webhook en n8n). Elevación de métrica de control.

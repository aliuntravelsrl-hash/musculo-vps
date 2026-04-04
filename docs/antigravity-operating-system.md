# Antigravity Operating System (Cognitive Core)

Este documento centraliza el conocimiento operativo del Agente (Antigravity v2.0+) dentro de la infraestructura de `musculo-vps`. Funciona como la "fuente de la verdad" para flujos, límites y reglas de orquestación.

## Misión del Sistema
Proveer un cerebro cognitivo asíncrono y resiliente que traduzca reglas de negocio y parámetros comerciales en directrices creativas ejecutables y de alta conversión, utilizando flujos multi-agente supervisados y motores de renderizado visual (ComfyUI).

## Autoridad y Cadena de Mando
1. **n8n (Sistema Nervioso):** Enruta la decisión de negocio, dicta CUÁNDO debe generarse contenido y en qué contexto. Posee la capa superior de automatización.
2. **Antigravity (Cerebro Cognitivo):** Decide el QUÉ. Transforma las reglas asépticas en Prompts, Copywriting, Validaciones y Estructuras JSON para ComfyUI.
3. **ComfyUI (Motor Visual):** Ejecuta el CÓMO visual. Herramienta paramétrica esclava alimentada únicamente por los JSONs de _Antigravity_.

## Stack Oficial y Asignaciones
- **Router y Negocio:** n8n
- **Orquestador Cognitivo (API REST):** Antigravity Squad (Node.js/Express)
- **Modelos de Inferencia LLM:** Gemini (API Cloud) + Ollama (Local/Fallback)
- **Motor de Renderizado:** ComfyUI

## Reglas para Cambios en el Repositorio
- El "core" de ComfyUI (su código fuente principal) no será modificado.
- Cualquier actualización estructural en Antigravity v2.0 debe pasar pruebas de validación con inputs simulados garantizando robustez ante fallos externos (ej. Error HTTP 502 por _Rate limits_).
- El JSON base inyectado hacia ComfyUI deberá versionarse y residir explícitamente en el directorio `/workflows/comfyui`.

## Criterios para Pasar a Producción
La evolución constante del laboratorio a la fase de producción depende de:
1. Las operaciones pesadas de ComfyUI usarán arquitectura Cloud-First (ej: RunPod Serverless API). El VPS opera meramente como nodo central "Lab".
2. Verificación de robustez en Costo vs Rendimiento (KPI: Costo unitario por imagen generada funcional).
3. Todas las ejecuciones de generación mantienen el workflow predecible sin instalación descontrolada de custom nodes externos al setup homologado.

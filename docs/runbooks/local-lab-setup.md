# Runbook: Configuración de Laboratorio Local ComfyUI

Este runbook instruye los pasos técnicos autorizados para iniciar ciclos de experimentación generativa local usando `ComfyUI` base.

## 1. Activación de Laboratorio
1. Navega a `C:\Users\Admin\.antigravity\ComfyUI` (repositorio clonado oficial).
2. Asegura tener Python 3.10+ o Miniconda.
3. Instala dependencias con `pip install torch torchvision torchaudio --extra-index-url https://download.pytorch.org/whl/cu121` y luego `pip install -r requirements.txt`.
4. Levanta el server visual con `python main.py --preview-method auto`.

## 2. Ingesta de Modelos (Checkpoints)
- Para SDXL Base, transfiere tu archivo estático `sd_xl_base_1.0.safetensors` a `/models/checkpoints/` dentro de la carpeta local de ComfyUI.

## 3. Comprobación Antigravity Orquestador
1. Valida que tu `musculo-vps/antigravity-squad/.env` tenga `COMFYUI_URL=http://127.0.0.1:8188`.
2. Ejecuta un webhook Payload Mock a `localhost:3000/api/v1/squad/marketing`.
3. Valida en la consola de Python de ComfyUI que reciba el requerimiento (Salida: `Got prompt`).
4. Revisa salida final en: `ComfyUI/output`.

**Nota Ejecutiva:** Este entorno es estrictamente de diseño y simulación. Una vez comprobado que el JSON de Comfy (`hotel-story-9x16.workflow.json`) arroja buena calidad, expórtalo como formato API, nómbralo `.api.json` y configúralo en la nube (ej: RunPod).

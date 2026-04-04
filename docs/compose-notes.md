# Docker Compose Notes
These notes were extracted from the main `docker-compose.yml` to keep the configuration file clean.

## 1. PAPERCLIP
- Orquestador maestro
- Base de datos Postgres en el servicio interno paperclip_db
- Auth / UI / despliegue
- Opcional: claves LLM si quieres que Paperclip use modelos externos
- Workspace persistente para skills y contexto de agentes
- URLs internas de agentes HTTP

## 2. PAPERCLIP DB
- PostgreSQL interno dedicado

## 3. ANTIGRAVITY
- Agente HTTP copy+arte
- MONTAJE LOCAL AÑADIDO PARA WORKSPACES ORGANIZADOS

## 4. ATLAS MARKETING
- Agente HTTP estratégico
- MONTAJE LOCAL AÑADIDO PARA WORKSPACES ORGANIZADOS

## 5. OLLAMA
- Motor LLM local

## 6. OLLAMA PULL
- Descarga inicial de modelos

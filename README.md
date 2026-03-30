# Músculo VPS 2 – Paperclip + Antigravity + Atlas Marketing + Ollama

Infraestructura Docker Compose del segundo VPS de Aliun Travel SRL (el "Músculo"), que orquesta:

- **Paperclip** — Orquestador maestro de agentes
- **Antigravity Squad** — Copywriting + Dirección de Arte
- **Atlas Marketing** — 5 agentes estratégicos (Content, CRO, Competitive, SEO, Brand)
- **Ollama** — Motor LLM local (Llama 3.1, análisis a $0)

Todo expuesto mediante Traefik/Dokploy con SSL automático (Let's Encrypt), base de datos Postgres interna dedicada para Paperclip y modelos LLM persistidos en disco.

---

## 1. Requisitos previos

- VPS con Docker y Docker Compose instalados
- Dokploy (o Traefik) ya funcionando como reverse proxy con certificados Let's Encrypt
- Dominios DNS configurados y apuntando al VPS:
  - `paperclip.aliuntravelsrl.com`
  - `antigravity.aliuntravelsrl.com`
  - `marketing.aliuntravelsrl.com`

---

## 2. Arquitectura del stack

```
┌─────────────────────────────────────────────────────────┐
│  paperclip.aliuntravelsrl.com   →  :3100  (Orquestador) │
│  antigravity.aliuntravelsrl.com →  :3000  (Squad)       │
│  marketing.aliuntravelsrl.com   →  :4000  (Marketing)   │
│  ollama (solo red interna)      →  :11434               │
└─────────────────────────────────────────────────────────┘
```

Todos los servicios se comunican dentro de la red Docker `musculo_net` por nombre:
`http://paperclip:3100`, `http://antigravity:3000`, `http://atlas_marketing:4000`, `http://ollama:11434`

> **VPS 3 futuro:** OpenClaw se conectará a Paperclip como agente HTTP desde `vps3.aliuntravelsrl.com`. Paperclip lo orquestará via heartbeat.

---

## 3. Servicios

### 3.1 Paperclip (orquestador maestro)
- Imagen: `paperclipai/paperclip:latest`
- UI en `https://paperclip.aliuntravelsrl.com`
- Postgres interno dedicado (`paperclip_db`) para org chart, tickets, budgets e historial de decisiones
- Orquesta agentes HTTP: Antigravity y Atlas Marketing
- Modo de despliegue: `authenticated` + `private`
- Autenticación via `BETTER_AUTH_SECRET`

### 3.2 Antigravity Squad
- Servicio Node.js: Copywriter + Director de Arte + Revisor
- Usa Gemini, Supabase y Ollama (Llama 3.1) como motores
- Registrado en Paperclip via `PAPERCLIP_HEARTBEAT_TOKEN`
- Workspace compartido en `/workspaces/ALIUN_ATLAS`

### 3.3 Atlas Marketing
- Servicio Node.js con 5 agentes: Content, CRO, Competitive Intelligence, SEO, Brand
- Usa Gemini, Perplexity, Supabase y Ollama
- Registrado en Paperclip via `PAPERCLIP_HEARTBEAT_TOKEN`
- Workspace compartido en `/workspaces/ALIUN_ATLAS`

### 3.4 Ollama (motor LLM local)
- Imagen: `ollama/ollama:latest`
- **Solo accesible dentro de la red Docker** — sin exposición pública, sin labels Traefik
- Modelos persistidos en volumen `ollama_models`
- Sidecar `ollama_pull` descarga `llama3.1` al primer arranque (~4.5GB, ~10-15 min)

---

## 4. Volúmenes persistentes

| Volumen | Contenido | Backup |
|---|---|---|
| `paperclip_data` | Org chart, skills, contexto de agentes | Semanal |
| `paperclip_db_data` | PostgreSQL de Paperclip | Semanal |
| `workspaces_data` | CONTEXT.md y DECISIONS_LOG.md de los agentes | Semanal |
| `ollama_models` | Modelos descargados (~5GB llama3.1) | No necesario |

---

## 5. Pasos de despliegue

**1. Clona el repo en el VPS:**

```bash
git clone git@github.com:aliuntravelsrl-hash/musculo-vps.git
cd musculo-vps
```

**2. Crea tu archivo `.env` a partir del molde:**

```bash
cp .env.example .env
nano .env
```

**3. Levanta el stack:**

```bash
docker compose up -d
```

**4. Verifica que todos los servicios estén saludables:**

```bash
docker compose ps
docker compose logs -f paperclip
```

**5. Accede a las interfaces:**

- Orquestador Paperclip: https://paperclip.aliuntravelsrl.com
- Antigravity Squad: https://antigravity.aliuntravelsrl.com
- Atlas Marketing: https://marketing.aliuntravelsrl.com

---

## 6. Variables de entorno requeridas

Copia `.env.example` a `.env` y rellena:

| Variable | Descripción |
|---|---|
| `PAPERCLIP_DB_PASS` | Contraseña de la base de datos interna |
| `PAPERCLIP_ADMIN_EMAIL` | Email del admin de Paperclip |
| `PAPERCLIP_ADMIN_PASSWORD` | Contraseña del admin de Paperclip |
| `BETTER_AUTH_SECRET` | String largo aleatorio para autenticación |
| `PAPERCLIP_PUBLIC_URL` | URL pública de Paperclip |
| `OPENAI_API_KEY` | Clave OpenAI (opcional para Paperclip) |
| `ANTHROPIC_API_KEY` | Clave Anthropic (opcional para Paperclip) |
| `GEMINI_API_KEY` | Clave Google Gemini |
| `PERPLEXITY_API_KEY` | Clave Perplexity (Atlas Marketing) |
| `SUPABASE_URL` | URL del proyecto Supabase |
| `SUPABASE_KEY` | Anon/Service Role key de Supabase |
| `INTER_VPS_TOKEN` | Token secreto para heartbeats entre VPS |

> **Seguridad:** `.env` está incluido en `.gitignore`. Nunca subas claves reales al repositorio.

---

## 7. Flujo de trabajo Git

Después de cambios en la infraestructura:

```bash
git add docker-compose.yml README.md .env.example .gitignore
git commit -m "chore: descripcion del cambio"
git push origin main
```

---

## 8. Notas de seguridad

- Postgres (`paperclip_db`) **no se expone al exterior** — solo red interna Docker
- Ollama **no tiene labels Traefik** — nunca accesible desde internet
- Paperclip corre en modo `private` + `authenticated` — requiere login para acceder a la UI
- `BETTER_AUTH_SECRET` debe ser un string aleatorio de al menos 32 caracteres
- Hacer backup semanal de `paperclip_data`, `paperclip_db_data` y `workspaces_data`

---

*Stack VPS 2 — Aliun Travel SRL | Repo: aliuntravelsrl-hash/musculo-vps*

# Músculo VPS 2 – Paperclip + Antigravity + Atlas Marketing + Ollama

Infraestructura Docker Compose del segundo VPS de Aliun Travel SRL (el “Músculo”), que orquesta:

- Paperclip (orquestador maestro de agentes)
- Antigravity Squad (copy + arte)
- Atlas Marketing (estrategia y marketing)
- Ollama (motor LLM local, Llama 3.1)

Todo expuesto mediante Traefik/Dokploy, con base de datos interna dedicada para Paperclip y modelos LLM almacenados de forma persistente en disco.[web:33][web:8]

---

## 1. Requisitos previos

- VPS con Docker y Docker Compose instalados.
- Dokploy (o Traefik) ya funcionando como reverse proxy con certificados Let’s Encrypt.
- Dominio configurado:
  - `paperclip.aliuntravelsrl.com`
  - `antigravity.aliuntravelsrl.com`
  - `marketing.aliuntravelsrl.com`.[web:30]

---

## 2. Servicios del stack

### 2.1 Paperclip (orquestador maestro)

- Imagen: `paperclipai/paperclip:latest`.[web:37]
- Expone la UI en `https://paperclip.aliuntravelsrl.com`.
- Usa un Postgres interno dedicado (`paperclip_db`) para:
  - Org chart, tickets, budgets.
  - Historial de decisiones y auditoría.
- Orquesta agentes HTTP:
  - Antigravity (`http://antigravity:3000`)
  - Atlas Marketing (`http://atlas_marketing:4000`)

Modo de despliegue:

- `SERVE_UI=true`
- `PAPERCLIP_DEPLOYMENT_MODE=authenticated`
- `PAPERCLIP_DEPLOYMENT_EXPOSURE=private`
- `PAPERCLIP_PUBLIC_URL=https://paperclip.aliuntravelsrl.com`
- `BETTER_AUTH_SECRET` para la capa de autenticación (string largo aleatorio).[web:13]

### 2.2 Antigravity Squad

- Servicio Node.js para copywriting, dirección de arte y revisión.
- Expone HTTP en `https://antigravity.aliuntravelsrl.com`.
- Usa:
  - `GEMINI_API_KEY` para generación de contenido.
  - Supabase (`SUPABASE_URL`, `SUPABASE_KEY`) como datastore.
  - `WORKSPACE_ROOT=/workspaces/ALIUN_ATLAS` para contexto persistente.
  - `OLLAMA_URL=http://ollama:11434` para análisis con Llama 3.1.
  - `PAPERCLIP_HEARTBEAT_TOKEN` para registro/orquestación con Paperclip.

### 2.3 Atlas Marketing

- Servicio Node.js con 5 agentes estratégicos:
  - Content, CRO, Competitive, SEO, Brand.
- Expone HTTP en `https://marketing.aliuntravelsrl.com`.
- Usa:
  - `GEMINI_API_KEY`, `PERPLEXITY_API_KEY`.
  - `SUPABASE_URL`, `SUPABASE_KEY`.
  - `WORKSPACE_ROOT=/workspaces/ALIUN_ATLAS`.
  - `OLLAMA_URL=http://ollama:11434`.
  - `PAPERCLIP_HEARTBEAT_TOKEN` para integrarse con Paperclip.

### 2.4 Ollama (motor LLM local)

- Imagen: `ollama/ollama:latest`.[web:36]
- Solo accesible dentro de la red Docker (`musculo_net`), sin exposición pública.
- Modelos persistidos en el volumen `ollama_models` (`/root/.ollama`).[web:8]
- Sidecar `ollama_pull` realiza la descarga inicial de `llama3.1` al primer arranque.

---

## 3. docker-compose.yml

Este es el `docker-compose.yml` completo para el stack del Músculo:

```yaml
version: '3.8'

services:
  # 1. PAPERCLIP — Orquestador maestro
  paperclip:
    image: paperclipai/paperclip:latest
    container_name: aliun_paperclip
    restart: unless-stopped
    ports:
      - "3100:3100"
    environment:
      - NODE_ENV=production
      - PORT=3100
      # Base de datos Postgres en el servicio interno paperclip_db
      - DATABASE_URL=postgresql://paperclip:${PAPERCLIP_DB_PASS}@paperclip_db:5432/paperclip
      # Auth / UI / despliegue
      - SERVE_UI=true
      - PAPERCLIP_DEPLOYMENT_MODE=authenticated
      - PAPERCLIP_DEPLOYMENT_EXPOSURE=private
      - PAPERCLIP_PUBLIC_URL=https://paperclip.aliuntravelsrl.com
      - BETTER_AUTH_SECRET=${BETTER_AUTH_SECRET}
      # Opcional: claves LLM si quieres que Paperclip use modelos externos
      - OPENAI_API_KEY=${OPENAI_API_KEY}
      - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
      # Workspace persistente para skills y contexto de agentes
      - PAPERCLIP_DATA_DIR=/data/paperclip
      # URLs internas de agentes HTTP
      - ANTIGRAVITY_URL=http://antigravity:3000
      - ATLAS_MARKETING_URL=http://atlas_marketing:4000
    volumes:
      - paperclip_data:/data/paperclip
    networks:
      - musculo_net
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.paperclip.rule=Host(`paperclip.aliuntravelsrl.com`)"
      - "traefik.http.routers.paperclip.tls.certresolver=letsencrypt"
      - "traefik.http.services.paperclip.loadbalancer.server.port=3100"
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost:3100/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 30s
    depends_on:
      paperclip_db:
        condition: service_healthy

  # 2. PAPERCLIP DB — PostgreSQL interno dedicado
  paperclip_db:
    image: postgres:16-alpine
    container_name: aliun_paperclip_db
    restart: unless-stopped
    environment:
      - POSTGRES_DB=paperclip
      - POSTGRES_USER=paperclip
      - POSTGRES_PASSWORD=${PAPERCLIP_DB_PASS}
    volumes:
      - paperclip_db_data:/var/lib/postgresql/data
    networks:
      - musculo_net
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U paperclip -d paperclip"]
      interval: 10s
      timeout: 5s
      retries: 5

  # 3. ANTIGRAVITY — Agente HTTP copy+arte
  antigravity:
    build:
      context: ./antigravity-squad
      dockerfile: Dockerfile
    container_name: aliun_antigravity
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - PORT=3000
      - GEMINI_API_KEY=${GEMINI_API_KEY}
      - SUPABASE_URL=${SUPABASE_URL}
      - SUPABASE_KEY=${SUPABASE_KEY}
      - WORKSPACE_ROOT=/workspaces/ALIUN_ATLAS
      - OLLAMA_URL=http://ollama:11434
      - PAPERCLIP_HEARTBEAT_TOKEN=${INTER_VPS_TOKEN}
    volumes:
      - workspaces_data:/workspaces/ALIUN_ATLAS
    networks:
      - musculo_net
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.antigravity.rule=Host(`antigravity.aliuntravelsrl.com`)"
      - "traefik.http.routers.antigravity.tls.certresolver=letsencrypt"
      - "traefik.http.services.antigravity.loadbalancer.server.port=3000"
    healthcheck:
      test: ["CMD", "node", "-e", "require('http').get('http://localhost:3000/health',(r)=>{process.exit(r.statusCode===200?0:1)})"]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 15s
    depends_on:
      ollama:
        condition: service_healthy

  # 4. ATLAS MARKETING — Agente HTTP estratégico
  atlas_marketing:
    build:
      context: ./atlas-marketing
      dockerfile: Dockerfile
    container_name: aliun_atlas_marketing
    restart: unless-stopped
    ports:
      - "4000:4000"
    environment:
      - NODE_ENV=production
      - PORT=4000
      - GEMINI_API_KEY=${GEMINI_API_KEY}
      - SUPABASE_URL=${SUPABASE_URL}
      - SUPABASE_KEY=${SUPABASE_KEY}
      - PERPLEXITY_API_KEY=${PERPLEXITY_API_KEY}
      - WORKSPACE_ROOT=/workspaces/ALIUN_ATLAS
      - OLLAMA_URL=http://ollama:11434
      - PAPERCLIP_HEARTBEAT_TOKEN=${INTER_VPS_TOKEN}
    volumes:
      - workspaces_data:/workspaces/ALIUN_ATLAS
    networks:
      - musculo_net
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.marketing.rule=Host(`marketing.aliuntravelsrl.com`)"
      - "traefik.http.routers.marketing.tls.certresolver=letsencrypt"
      - "traefik.http.services.marketing.loadbalancer.server.port=4000"
    healthcheck:
      test: ["CMD", "node", "-e", "require('http').get('http://localhost:4000/health',(r)=>{process.exit(r.statusCode===200?0:1)})"]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 15s
    depends_on:
      ollama:
        condition: service_healthy

  # 5. OLLAMA — Motor LLM local
  ollama:
    image: ollama/ollama:latest
    container_name: aliun_ollama
    restart: unless-stopped
    environment:
      - OLLAMA_HOST=0.0.0.0
    volumes:
      - ollama_models:/root/.ollama
    networks:
      - musculo_net
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:11434/api/tags"]
      interval: 30s
      timeout: 10s
      retries: 5
      start_period: 60s

  # 6. OLLAMA PULL — Descarga inicial de modelos
  ollama_pull:
    image: ollama/ollama:latest
    container_name: aliun_ollama_pull
    restart: "no"
    volumes:
      - ollama_models:/root/.ollama
    networks:
      - musculo_net
    entrypoint: >
      sh -c "sleep 20 && ollama pull llama3.1 && echo '[OLLAMA] llama3.1 listo'"
    depends_on:
      ollama:
        condition: service_healthy

volumes:
  paperclip_data:
    driver: local
  paperclip_db_data:
    driver: local
  workspaces_data:
    driver: local
  ollama_models:
    driver: local

networks:
  musculo_net:
    driver: bridge
```

---

## 4. `.env.example`

Molde público (sin secretos reales), listo para copiar a `.env` en el VPS:

```bash
PAPERCLIP_DB_PASS=change_me
PAPERCLIP_ADMIN_EMAIL=admin@aliuntravelsrl.com
PAPERCLIP_ADMIN_PASSWORD=change_me
BETTER_AUTH_SECRET=generate_long_random_string
PAPERCLIP_PUBLIC_URL=https://paperclip.aliuntravelsrl.com

OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=...
GEMINI_API_KEY=...
PERPLEXITY_API_KEY=...

SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-anon-or-service-role-key

INTER_VPS_TOKEN=change_me
```

---

## 5. `.gitignore`

Protege secretos y volúmenes de datos:

```bash
.env
*.env.local
paperclip_db_data/
paperclip_data/
workspaces_data/
ollama_models/
```

---

## 6. Pasos de despliegue

1. Clona el repo en el VPS:

```bash
git clone git@github.com:aliuntravelsrl-hash/musculo-vps.git
cd musculo-vps
```

2. Crea tu archivo `.env` a partir del molde:

```bash
cp .env.example .env
# Edita .env y rellena todas las variables con valores reales
```

3. Levanta el stack:

```bash
docker compose up -d
```

4. Verifica que los servicios estén saludables:

```bash
docker compose ps
docker compose logs -f paperclip
```

5. Accede a las interfaces a través del reverse proxy (Traefik/Dokploy):

- Orquestador Paperclip: https://paperclip.aliuntravelsrl.com  
- Antigravity Squad: https://antigravity.aliuntravelsrl.com  
- Atlas Marketing: https://marketing.aliuntravelsrl.com

---

## 7. Flujo de trabajo Git

Después de cambios en la infraestructura (compose, README, etc.):

```bash
git add docker-compose.yml README.md .env.example .gitignore
git commit -m "chore: infra musculo vps2 con paperclip, agentes y ollama"
git push origin main
```

Con esto, la infraestructura del Músculo (VPS 2) queda documentada, versionada y lista para auditoría técnica y despliegues reproducibles en Aliun Travel SRL.[web:26]

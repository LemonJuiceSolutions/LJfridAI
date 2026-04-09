#!/bin/bash

# Vai nella cartella del progetto
cd "$(dirname "$0")"

# Colori per output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Funzione di cleanup globale
cleanup() {
    echo -e "\n${RED}🛑 Terminazione processi in corso...${NC}"
    [ ! -z "$PYTHON_PID" ] && kill $PYTHON_PID 2>/dev/null
    [ ! -z "$SCHEDULER_PID" ] && kill $SCHEDULER_PID 2>/dev/null
    lsof -ti:9002,5005,5001,3001 | xargs kill -9 2>/dev/null
    exit
}

# Imposta il trap
trap cleanup SIGINT SIGTERM EXIT

echo -e "${BLUE}🧹 Pulizia processi esistenti (Porte 5001, 5005, 9002, 3001)...${NC}"
lsof -ti:9002,5005,5001,3001 | xargs kill -9 2>/dev/null

echo -e "${GREEN}🚀 Avvio FridAI...${NC}"

# 1. Docker - Verifica e avvia se necessario
echo -e "${BLUE}🐳 Verifica Docker Desktop...${NC}"
if ! docker info >/dev/null 2>&1; then
    echo -e "${YELLOW}⏳ Docker non è in esecuzione. Avvio Docker Desktop...${NC}"
    open -a Docker
    COUNTER=0
    while ! docker info >/dev/null 2>&1 && [ $COUNTER -lt 60 ]; do
        sleep 2
        COUNTER=$((COUNTER + 2))
        echo -ne "${YELLOW}.${NC}"
    done
    echo ""

    if ! docker info >/dev/null 2>&1; then
        echo -e "${RED}❌ Docker non si è avviato in tempo. Riprova.${NC}"
        exit 1
    fi
fi
echo -e "${GREEN}✅ Docker è in esecuzione${NC}"

# 2. Database PostgreSQL - Verifica, avvia o crea
echo -e "${BLUE}📦 Gestione Database PostgreSQL...${NC}"

# Controlla se il container esiste
if docker ps -a --format '{{.Names}}' | grep -q "^rulesage-db$"; then
    # Container esiste - verifica se è in esecuzione
    if docker ps --format '{{.Names}}' | grep -q "^rulesage-db$"; then
        echo -e "${GREEN}✅ Database già in esecuzione${NC}"
    else
        echo -e "${YELLOW}⏳ Avvio container database esistente...${NC}"
        docker start rulesage-db
        sleep 3
        if docker ps --format '{{.Names}}' | grep -q "^rulesage-db$"; then
            echo -e "${GREEN}✅ Database avviato${NC}"
        else
            echo -e "${RED}❌ Impossibile avviare il database. Ricreo il container...${NC}"
            docker rm rulesage-db 2>/dev/null
            docker run -d --name rulesage-db \
                -e POSTGRES_USER=postgres \
                -e POSTGRES_PASSWORD=postgres \
                -e POSTGRES_DB=rulesagedb \
                -p 5432:5432 \
                postgres:15
            sleep 5
        fi
    fi
else
    # Container non esiste - crealo
    echo -e "${YELLOW}⏳ Creazione container database...${NC}"
    docker run -d --name rulesage-db \
        -e POSTGRES_USER=postgres \
        -e POSTGRES_PASSWORD=postgres \
        -e POSTGRES_DB=rulesagedb \
        -p 5432:5432 \
        postgres:15
    sleep 5
    echo -e "${GREEN}✅ Container database creato${NC}"
fi

# Attendi che PostgreSQL sia pronto
echo -e "${BLUE}⏳ Attesa che PostgreSQL sia pronto...${NC}"
COUNTER=0
while ! docker exec rulesage-db pg_isready -U postgres >/dev/null 2>&1 && [ $COUNTER -lt 30 ]; do
    sleep 1
    COUNTER=$((COUNTER + 1))
    echo -ne "${YELLOW}.${NC}"
done
echo ""

if docker exec rulesage-db pg_isready -U postgres >/dev/null 2>&1; then
    echo -e "${GREEN}✅ PostgreSQL è pronto${NC}"
else
    echo -e "${RED}❌ PostgreSQL non risponde. Verifica Docker.${NC}"
    exit 1
fi

# 3. Prisma - Sincronizza schema se necessario
echo -e "${BLUE}🔄 Sincronizzazione schema database...${NC}"
npx prisma db push --skip-generate 2>/dev/null
npx prisma generate 2>/dev/null
echo -e "${GREEN}✅ Schema database sincronizzato${NC}"

# 4. Python Backend
if [ -d "python-backend" ]; then
    echo -e "${BLUE}🐍 Avvio Python Backend su porta 5005...${NC}"

    if [ ! -d "python-backend/venv" ]; then
        echo -e "${YELLOW}⏳ Creazione virtual environment Python...${NC}"
        python3 -m venv python-backend/venv
    fi

    (
        cd python-backend
        source venv/bin/activate
        pip install -r requirements.txt --quiet 2>/dev/null
        python app.py 2>&1 | sed 's/^/[Python] /'
    ) &
    PYTHON_PID=$!

    # Attendi che il Python backend sia pronto
    echo -e "${BLUE}⏳ Attesa che Python Backend sia pronto...${NC}"
    COUNTER=0
    while ! curl -s http://localhost:5005/health >/dev/null 2>&1 && [ $COUNTER -lt 30 ]; do
        sleep 1
        COUNTER=$((COUNTER + 1))
        echo -ne "${YELLOW}.${NC}"
    done
    echo ""

    if curl -s http://localhost:5005/health >/dev/null 2>&1; then
        echo -e "${GREEN}✅ Python Backend pronto su porta 5005${NC}"
    else
        echo -e "${YELLOW}⚠️ Python Backend non ancora pronto, Next.js partira' comunque${NC}"
    fi
fi

# 5. Scheduler Service (opzionale)
# Viene avviato solo se SCHEDULER_SERVICE_URL è impostato in .env
SCHEDULER_SERVICE_URL_VALUE=""
if [ -f ".env" ]; then
    SCHEDULER_SERVICE_URL_VALUE=$(grep -E '^SCHEDULER_SERVICE_URL=' .env | cut -d'=' -f2- | tr -d '"' | tr -d "'")
fi

if [ ! -z "$SCHEDULER_SERVICE_URL_VALUE" ]; then
    echo -e "${BLUE}⚙️  Avvio Scheduler Service su porta 3001...${NC}"
    echo -e "${YELLOW}   (SCHEDULER_SERVICE_URL=${SCHEDULER_SERVICE_URL_VALUE})${NC}"

    # Installa deps scheduler se mancanti
    if [ ! -d "scheduler-service/node_modules" ]; then
        echo -e "${YELLOW}⏳ Installazione dipendenze scheduler...${NC}"
        (cd scheduler-service && npm install --silent 2>/dev/null)
    fi

    (
        cd scheduler-service
        npx tsx index.ts 2>&1 | sed 's/^/[Scheduler] /'
    ) &
    SCHEDULER_PID=$!

    # Attendi che lo scheduler sia pronto
    echo -e "${BLUE}⏳ Attesa che Scheduler Service sia pronto...${NC}"
    COUNTER=0
    while ! curl -s http://localhost:3001/health >/dev/null 2>&1 && [ $COUNTER -lt 30 ]; do
        sleep 1
        COUNTER=$((COUNTER + 1))
        echo -ne "${YELLOW}.${NC}"
    done
    echo ""

    if curl -s http://localhost:3001/health >/dev/null 2>&1; then
        echo -e "${GREEN}✅ Scheduler Service pronto su porta 3001${NC}"
    else
        echo -e "${YELLOW}⚠️ Scheduler Service non ancora pronto, Next.js partira' comunque${NC}"
    fi
else
    echo -e "${BLUE}ℹ️  Scheduler in-process (SCHEDULER_SERVICE_URL non impostato in .env)${NC}"
fi

# 6. Apri browser dopo un delay
echo -e "${BLUE}🌐 Apertura http://localhost:9002 tra 5 secondi...${NC}"
(sleep 5 && open http://localhost:9002) &

# 7. Avvia Next.js
echo -e "${GREEN}🔥 Avvio Next.js su porta 9002...${NC}"
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
npm run dev

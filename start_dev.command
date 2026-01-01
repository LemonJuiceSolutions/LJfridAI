#!/bin/bash

# Vai nella cartella del progetto
cd "$(dirname "$0")"

# Funzione di cleanup globale
cleanup() {
    echo "🛑 Terminazione processi in corso..."
    [ ! -z "$PYTHON_PID" ] && kill $PYTHON_PID 2>/dev/null
    lsof -ti:9002,5005,5001 | xargs kill -9 2>/dev/null
    exit
}

# Imposta il trap
trap cleanup SIGINT SIGTERM EXIT

echo "🧹 Pulizia processi esistenti (Porte 5001, 5005, 9002)..."
lsof -ti:9002,5005,5001 | xargs kill -9 2>/dev/null

echo "🚀 Avvio Like AI Said..."

# 1. Docker
if ! docker info >/dev/null 2>&1; then
    echo "🐳 Avvio Docker Desktop..."
    open -a Docker
    COUNTER=0
    while ! docker info >/dev/null 2>&1 && [ $COUNTER -lt 30 ]; do
        sleep 2
        COUNTER=$((COUNTER + 2))
        echo -n "."
    done
    echo ""
fi

# 2. Database
echo "📦 Database PostgreSQL..."
docker-compose up -d db
sleep 2

# 3. Python Backend
if [ -d "python-backend" ]; then
    echo "🐍 Avvio Python Backend (v1.0.4) su porta 5005..."
    
    if [ ! -d "python-backend/venv" ]; then
        python3 -m venv python-backend/venv
    fi
    
    (
        cd python-backend
        source venv/bin/activate
        pip install -r requirements.txt --quiet
        python app.py 2>&1 | sed 's/^/[Python] /'
    ) &
    PYTHON_PID=$!
fi

# 4. App & Browser
echo "🌐 Apertura http://localhost:9002..."
(sleep 5 && open http://localhost:9002) &

echo "🔥 Avvio Next.js..."
npm run dev

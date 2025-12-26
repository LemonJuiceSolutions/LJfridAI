#!/bin/bash

# Vai nella cartella del progetto
cd "$(dirname "$0")"

echo "🚀 Avvio Like AI Said in modalità Sviluppo..."

# 1. Tenta di avviare Docker Desktop se non è attivo
if ! docker info >/dev/null 2>&1; then
    echo "🐳 Docker non è attivo. Tento di avviarlo..."
    open -a Docker
    echo "Attendere l'avvio di Docker (potrebbe volere un minuto)..."
    # Aspetta finché docker non risponde o finché passano 60 secondi
    COUNTER=0
    while ! docker info >/dev/null 2>&1 && [ $COUNTER -lt 60 ]; do
        sleep 2
        let COUNTER=COUNTER+2
        echo -n "."
    done
    echo ""
fi

# 2. Avvia solo il database in background
echo "📦 Avvio del database PostgreSQL..."
docker-compose up -d db

# 3. Aspetta un attimo che il DB sia pronto
sleep 3

# 4. Verifica se le tabelle esistono (opzionale ma consigliato)
echo "🔄 Sincronizzazione schema database (saltato per evitare reset)..."
# npx prisma db push --skip-generate

# 5. Apri il browser e avvia l'app
echo "🌐 Apertura browser..."
(sleep 3 && open http://localhost:9002) &

echo "🔥 Avvio Next.js..."
npm run dev

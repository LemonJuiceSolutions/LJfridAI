#!/bin/bash

echo "🐍 Avvio Python Backend per esecuzione script..."

cd "$(dirname "$0")"

# Check if virtual environment exists
if [ ! -d "venv" ]; then
    echo "📦 Creazione ambiente virtuale..."
    python3 -m venv venv
fi

# Activate virtual environment
source venv/bin/activate

# Install dependencies
echo "📥 Installazione dipendenze..."
pip install -r requirements.txt --quiet

# Run the Flask app
echo "🚀 Avvio server su porta 5001..."
python app.py

# Istruzioni per Deployment Docker - Like AI Said (Windows 11)

## 📦 Prerequisiti
Installa **Docker Desktop per Windows**:
1. Scarica da: https://www.docker.com/products/docker-desktop/
2. Installa e riavvia il PC se richiesto
3. Avvia Docker Desktop e attendi che sia "Running" (icona verde nella barra delle applicazioni)

> **Nota**: Docker Desktop richiede WSL2. Se non è installato, Docker ti guiderà nell'installazione automatica.

---

## 🚀 Istruzioni per l'Installazione

### 1. Estrai l'archivio
- Fai **clic destro** su `LikeAiSaid-docker-export.zip`
- Seleziona **"Estrai tutto..."**
- Scegli una cartella di destinazione (es. `C:\LikeAiSaid`)

### 2. Apri PowerShell nella cartella
- Vai nella cartella estratta
- Tieni premuto **Shift** + **clic destro** nello spazio vuoto
- Seleziona **"Apri finestra PowerShell qui"** (o "Apri nel terminale")

Oppure:
```powershell
cd C:\LikeAiSaid
```

### 3. Configura le variabili d'ambiente
Apri il file `.env` con Notepad e verifica le variabili:

| Variabile | Descrizione |
|-----------|-------------|
| `DATABASE_URL` | Connessione al database PostgreSQL (già configurata per Docker) |
| `OPENROUTER_API_KEY` | Chiave API OpenRouter per funzionalità AI |

> **Nota**: Per Docker, la `DATABASE_URL` deve essere:
> ```
> DATABASE_URL="postgresql://postgres:postgres@db:5432/rulesagedb"
> ```

### 4. Avvia l'applicazione
```powershell
# Costruisci e avvia i container
docker-compose up --build
```

Oppure per avviare in background:
```powershell
docker-compose up --build -d
```

### 5. Inizializza il database (solo la prima volta)
Apri un **nuovo terminale PowerShell** e esegui:
```powershell
docker exec -it rulesage-app npx prisma@5 db push --skip-generate
```
> **Nota**: Usa `prisma@5` per evitare conflitti di versione. L'errore "Generator failed" alla fine è normale e può essere ignorato.

### 6. Accedi all'applicazione
Apri il browser e vai su:
```
http://localhost:3000
```

---

## 🛑 Comandi Utili (PowerShell)

### Fermare l'applicazione
```powershell
docker-compose down
```

### Vedere i log
```powershell
docker logs rulesage-app -f
```

### Riavviare dopo modifiche
```powershell
docker-compose down
docker-compose up --build
```

### Verificare che i container siano attivi
```powershell
docker ps
```

---

## 📁 Struttura File

```
LikeAiSaid/
├── Dockerfile           # Istruzioni build immagine Next.js
├── docker-compose.yml   # Configurazione servizi (app + db)
├── prisma/
│   └── schema.prisma    # Schema database
├── .env                 # Variabili d'ambiente
├── src/                 # Codice sorgente
└── ...
```

---

## ⚠️ Troubleshooting Windows

### Docker Desktop non si avvia
1. Verifica che la virtualizzazione sia abilitata nel BIOS
2. Esegui in PowerShell come Amministratore:
   ```powershell
   wsl --install
   ```
3. Riavvia il PC

### Errore: "Port 3000 already in use"
```powershell
# Trova il processo che usa la porta
netstat -ano | findstr :3000
# Termina il processo (sostituisci PID con il numero trovato)
taskkill /PID <PID> /F
```

### Errore: "Database connection failed"
1. Verifica che Docker Desktop sia in esecuzione
2. Controlla che i container siano attivi: `docker ps`
3. Attendi qualche secondo (il database potrebbe essere ancora in avvio)

### File .env non visibile
I file che iniziano con `.` sono nascosti su Windows. Per vederli:
- Esplora File → Visualizza → Mostra → Elementi nascosti

---

## 🔐 Sicurezza
Per un ambiente di produzione, modifica:
- La password PostgreSQL in `docker-compose.yml`
- Le chiavi API in `.env`

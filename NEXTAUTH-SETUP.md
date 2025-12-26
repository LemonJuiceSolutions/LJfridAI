# NextAuth.js Configuration

## Aggiungi queste variabili al file .env.local:

```bash
# NextAuth Secret (genera con: openssl rand -base64 32)
NEXTAUTH_SECRET="your-secret-key-here"

# NextAuth URL (per sviluppo locale)
NEXTAUTH_URL="http://localhost:9002"
```

## Come generare NEXTAUTH_SECRET:

```bash
openssl rand -base64 32
```

Copia l'output e incollalo come valore di NEXTAUTH_SECRET nel file .env.local

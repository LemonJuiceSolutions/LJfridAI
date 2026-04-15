export default function PrivacyPolicyPage() {
  return (
    <div className="max-w-3xl mx-auto py-12 px-6">
      <h1 className="text-3xl font-bold mb-8">Privacy Policy</h1>
      <p className="text-sm text-muted-foreground mb-8">Ultimo aggiornamento: Aprile 2026</p>

      <div className="space-y-8 text-sm leading-relaxed">
        <section>
          <h2 className="text-xl font-semibold mb-3">1. Titolare del Trattamento</h2>
          <p>
            Il titolare del trattamento dei dati personali è la società che gestisce la piattaforma FridAI
            (di seguito &quot;Titolare&quot;). Per contattare il Titolare o il DPO, scrivere a:{' '}
            <span className="font-medium">privacy@fridai.com</span>.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-3">2. Dati Raccolti</h2>
          <p className="mb-2">Raccogliamo le seguenti categorie di dati personali:</p>
          <ul className="list-disc pl-6 space-y-1">
            <li><strong>Dati di registrazione:</strong> nome, cognome, email aziendale, password (hash)</li>
            <li><strong>Dati di utilizzo:</strong> log di accesso, interazioni con la piattaforma, conversazioni con agenti AI</li>
            <li><strong>Dati aziendali:</strong> nome azienda, reparto, ruolo</li>
            <li><strong>Dati tecnici:</strong> indirizzo IP, tipo di browser, sistema operativo</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-3">3. Finalità e Base Giuridica (Art. 6 GDPR)</h2>
          <ul className="list-disc pl-6 space-y-1">
            <li><strong>Esecuzione del contratto (Art. 6.1.b):</strong> gestione account, accesso alla piattaforma, funzionalità SaaS</li>
            <li><strong>Interesse legittimo (Art. 6.1.f):</strong> sicurezza, prevenzione frodi, miglioramento del servizio</li>
            <li><strong>Consenso (Art. 6.1.a):</strong> cookie analitici, comunicazioni marketing (ove applicabile)</li>
            <li><strong>Obbligo legale (Art. 6.1.c):</strong> adempimenti fiscali e contabili</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-3">4. Conservazione dei Dati</h2>
          <p>
            I dati personali sono conservati per la durata del rapporto contrattuale e per un massimo
            di <strong>2 anni</strong> dalla cessazione del servizio, salvo obblighi di legge che richiedano
            una conservazione più lunga. I log di sistema vengono eliminati automaticamente dopo 2 anni.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-3">5. Diritti dell&apos;Interessato (Artt. 15-22 GDPR)</h2>
          <p className="mb-2">Hai diritto a:</p>
          <ul className="list-disc pl-6 space-y-1">
            <li><strong>Accesso (Art. 15):</strong> ottenere una copia dei tuoi dati personali</li>
            <li><strong>Rettifica (Art. 16):</strong> correggere dati inesatti o incompleti</li>
            <li><strong>Cancellazione (Art. 17):</strong> richiedere la cancellazione del tuo account e dei tuoi dati</li>
            <li><strong>Portabilità (Art. 20):</strong> ricevere i tuoi dati in formato strutturato (JSON)</li>
            <li><strong>Opposizione (Art. 21):</strong> opporti a specifici trattamenti</li>
            <li><strong>Limitazione (Art. 18):</strong> richiedere il blocco temporaneo del trattamento</li>
          </ul>
          <p className="mt-3">
            Per esercitare i tuoi diritti, puoi utilizzare le funzionalità integrate nella piattaforma
            (Impostazioni &gt; Privacy) oppure contattare <span className="font-medium">privacy@fridai.com</span>.
            Risponderemo entro 30 giorni dalla richiesta.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-3">6. Cookie</h2>
          <p>
            Utilizziamo <strong>cookie tecnici</strong> necessari al funzionamento (sessione di autenticazione).
            I cookie analitici vengono attivati solo previo tuo consenso tramite il banner cookie.
            Puoi modificare le tue preferenze in qualsiasi momento.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-3">7. Servizi di Terze Parti</h2>
          <p className="mb-2">I dati possono essere trattati dai seguenti sub-responsabili:</p>
          <ul className="list-disc pl-6 space-y-1">
            <li><strong>Provider AI</strong> (OpenRouter, Anthropic, Google) — elaborazione richieste AI</li>
            <li><strong>Provider email</strong> (Resend/SMTP) — invio notifiche e reset password</li>
            <li><strong>Provider hosting</strong> — infrastruttura server</li>
            <li><strong>Stripe</strong> — gestione pagamenti e fatturazione</li>
          </ul>
          <p className="mt-2">
            Con ciascun sub-responsabile è stato stipulato un accordo di trattamento dati (DPA)
            conforme all&apos;Art. 28 GDPR.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-3">8. Trasferimenti Extra-UE</h2>
          <p>
            Alcuni sub-responsabili hanno sede al di fuori dell&apos;UE. I trasferimenti sono effettuati
            sulla base di Clausole Contrattuali Standard (SCC) approvate dalla Commissione Europea
            o di decisioni di adeguatezza.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-3">9. Sicurezza</h2>
          <p>
            Adottiamo misure tecniche e organizzative adeguate (Art. 32 GDPR): crittografia dei dati
            in transito (TLS), hashing delle password (bcrypt), isolamento dei dati per tenant,
            controllo degli accessi basato su ruoli, audit log degli accessi.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-3">10. Contatti e Reclami</h2>
          <p>
            Per qualsiasi domanda sulla presente policy, contattare{' '}
            <span className="font-medium">privacy@fridai.com</span>.
            Hai inoltre diritto di proporre reclamo all&apos;Autorità Garante per la Protezione dei Dati Personali
            (<a href="https://www.garanteprivacy.it" className="underline" target="_blank" rel="noopener noreferrer">www.garanteprivacy.it</a>).
          </p>
        </section>
      </div>
    </div>
  );
}

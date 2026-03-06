---
description: Genera un messaggio di commit basato sui file in staging
allowed-tools: Bash(git status:*), Bash(git diff:*)
---

# Task
1. Analizza i file attualmente in staging utilizzando `git status` e `git diff --cached`.
2. Genera un messaggio di commit conciso seguendo lo standard Conventional Commits: `<tipo>(<ambito>): <descrizione>`.
3. Assicurati che il messaggio rifletta accuratamente le modifiche logiche apportate.
4. Chiedimi conferma prima di eseguire effettivamente `git commit -m "[messaggio]"`.

## Contesto Git Corrente
- Status: !`git status`
- Modifiche in staging: !`git diff --cached`


/**
 * Converts an AlgoSchema object to a well-formatted Markdown string.
 */
import type { AlgoSchema } from '@/components/rule-sage/algorithm-schema-view';

export function algoSchemaToMarkdown(schema: AlgoSchema, title?: string): string {
    const lines: string[] = [];

    if (title) {
        lines.push(`# ${title}`, '');
    }

    // ─── Sources ─────────────────────────────────────────────────
    lines.push('## Sorgenti Dati', '');
    for (const src of schema.sources) {
        lines.push(`### ${src.name}`);
        lines.push(`- **Tipo**: ${src.type}`);
        if (src.columns && src.columns.length > 0) {
            lines.push(`- **Colonne**: \`${src.columns.join('`, `')}\``);
        }
        lines.push('');
    }

    // ─── Steps ───────────────────────────────────────────────────
    lines.push('## Flusso Trasformazioni', '');
    schema.steps.forEach((step, i) => {
        lines.push(`${i + 1}. **[${step.action}]** ${step.description}`);
        if (step.detail) {
            lines.push(`   \`\`\`sql`);
            lines.push(`   ${step.detail}`);
            lines.push(`   \`\`\``);
        }
    });
    lines.push('');

    // ─── Output ──────────────────────────────────────────────────
    lines.push('## Output Finale', '');
    lines.push(`- **Tipo**: ${schema.output.type}`);
    if (schema.output.description) {
        lines.push(`- **Descrizione**: ${schema.output.description}`);
    }
    if (schema.output.columns && schema.output.columns.length > 0) {
        lines.push(`- **Colonne**: \`${schema.output.columns.join('`, `')}\``);
    }
    lines.push('');

    // ─── Notes ───────────────────────────────────────────────────
    if (schema.notes && schema.notes.length > 0) {
        lines.push('## Note', '');
        for (const note of schema.notes) {
            lines.push(`- ${note}`);
        }
        lines.push('');
    }

    return lines.join('\n');
}

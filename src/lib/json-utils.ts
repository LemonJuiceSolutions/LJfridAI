/**
 * Pure JSON parsing helpers.
 * NO 'use server' — safe to import anywhere.
 */

export function sanitizeJSONString(str: string): string {
    let result = '';
    let inString = false;
    let escaped = false;
    for (let i = 0; i < str.length; i++) {
        const char = str[i];
        if (inString) {
            if (char === '\\' && !escaped) { escaped = true; result += char; }
            else if (char === '"' && !escaped) { inString = false; result += char; }
            else {
                if (escaped) { escaped = false; result += char; }
                else {
                    const code = char.charCodeAt(0);
                    if (code <= 0x1F) {
                        if (char === '\n') result += '\\n';
                        else if (char === '\r') result += '\\r';
                        else if (char === '\t') result += '\\t';
                        else result += ' ';
                    } else { result += char; }
                }
            }
        } else {
            if (char === '"') inString = true;
            result += char;
        }
    }
    return result;
}

export function extractFirstJSON(str: string): any {
    const firstOpen = str.indexOf('{');
    const firstArrayOpen = str.indexOf('[');
    if (firstOpen === -1 && firstArrayOpen === -1) return null;
    const startIndex = (firstOpen !== -1 && (firstArrayOpen === -1 || firstOpen < firstArrayOpen)) ? firstOpen : firstArrayOpen;
    let braceCount = 0;
    let inString = false;
    let escaped = false;
    for (let i = startIndex; i < str.length; i++) {
        const char = str[i];
        if (inString) {
            if (char === '\\' && !escaped) escaped = true;
            else if (char === '"' && !escaped) inString = false;
            else escaped = false;
        } else {
            if (char === '"') { inString = true; }
            else if (char === '{' || char === '[') { braceCount++; }
            else if (char === '}' || char === ']') {
                braceCount--;
                if (braceCount === 0) {
                    const potentialJson = str.substring(startIndex, i + 1);
                    try { return JSON.parse(potentialJson); }
                    catch {
                        try { return JSON.parse(sanitizeJSONString(potentialJson)); }
                        catch { return null; }
                    }
                }
            }
        }
    }
    return null;
}

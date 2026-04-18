#!/usr/bin/env node
// Spawn Next.js dev + scheduler-service dev together with prefixed output.
// The scheduler-service runs on :3001 and handles all heavy task execution
// so the Next.js process stays responsive for pages/APIs.

import { spawn } from 'node:child_process';

const procs = [
    { name: 'next', color: '\x1b[36m', cmd: 'npm', args: ['run', 'dev'] },
    { name: 'sched', color: '\x1b[33m', cmd: 'npm', args: ['run', 'dev:scheduler'] },
];

const RESET = '\x1b[0m';

function prefix(name, color) {
    return (line) => {
        if (line.length === 0) return;
        process.stdout.write(`${color}[${name}]${RESET} ${line}\n`);
    };
}

const children = procs.map(({ name, color, cmd, args }) => {
    const child = spawn(cmd, args, { stdio: ['inherit', 'pipe', 'pipe'], env: process.env });
    const out = prefix(name, color);

    let stdoutBuf = '';
    child.stdout.on('data', (chunk) => {
        stdoutBuf += chunk.toString();
        const lines = stdoutBuf.split('\n');
        stdoutBuf = lines.pop() ?? '';
        lines.forEach(out);
    });

    let stderrBuf = '';
    child.stderr.on('data', (chunk) => {
        stderrBuf += chunk.toString();
        const lines = stderrBuf.split('\n');
        stderrBuf = lines.pop() ?? '';
        lines.forEach(out);
    });

    child.on('exit', (code) => {
        out(`exited with code ${code}`);
        // If any child dies, kill the others.
        for (const c of children) {
            if (c !== child && !c.killed) c.kill('SIGTERM');
        }
        process.exit(code ?? 1);
    });

    return child;
});

// Propagate Ctrl+C to children.
for (const sig of ['SIGINT', 'SIGTERM']) {
    process.on(sig, () => {
        for (const c of children) {
            if (!c.killed) c.kill(sig);
        }
    });
}

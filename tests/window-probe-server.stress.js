const { spawn } = require('node:child_process');
const path = require('node:path');

const REQUESTS = 1000;
const executable = process.env.WINDOW_PROBE_EXE || path.join(__dirname, '..', 'bin', 'WindowProbe.exe');
const probe = spawn(executable, ['--server'], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
let buffer = '';
let received = 0;
const startedAt = process.hrtime.bigint();
const individualStarts = new Map();
const latencies = [];

probe.stdout.setEncoding('utf8');
probe.stdout.on('data', (chunk) => {
  buffer += chunk;
  const lines = buffer.split(/\r?\n/);
  buffer = lines.pop() || '';
  for (const line of lines) {
    if (!line.trim()) continue;
    const result = JSON.parse(line);
    const began = individualStarts.get(result.id);
    if (began) latencies.push(Number(process.hrtime.bigint() - began) / 1e6);
    individualStarts.delete(result.id);
    received += 1;
    if (received === REQUESTS) {
      const totalMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
      const sorted = latencies.sort((a, b) => a - b);
      const summary = {
        ok: true,
        requests: received,
        totalMs: Number(totalMs.toFixed(2)),
        averageThroughputMs: Number((totalMs / received).toFixed(3)),
        p95ResponseMs: Number(sorted[Math.floor(sorted.length * 0.95)].toFixed(2)),
        maxResponseMs: Number(sorted[sorted.length - 1].toFixed(2))
      };
      console.log(JSON.stringify(summary));
      probe.kill();
    } else {
      sendRequest(received + 1);
    }
  }
});

probe.on('error', (error) => {
  console.error(error);
  process.exitCode = 1;
});

probe.on('exit', () => {
  if (received !== REQUESTS) {
    console.error(JSON.stringify({ ok: false, expected: REQUESTS, received }));
    process.exitCode = 1;
  }
});

function sendRequest(id) {
  individualStarts.set(id, process.hrtime.bigint());
  probe.stdin.write(`${id},1000,100,8192,52,0,0\n`);
}

sendRequest(1);

setTimeout(() => {
  if (received === REQUESTS) return;
  console.error(JSON.stringify({ ok: false, reason: 'timeout', received }));
  probe.kill();
  process.exitCode = 1;
}, 15000);

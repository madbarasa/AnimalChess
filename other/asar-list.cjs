// Minimal ASAR header reader.
// usage: node asar-list.cjs <asar> <mode> [needle]
//   mode=list    : list entry paths containing needle
//   mode=packages: list unique package names under dsh/node_modules (incl. scoped)
//   mode=cat     : print the content of the single entry whose path contains needle
const fs = require('fs');

const asar = process.argv[2];
const mode = process.argv[3] || 'list';
const needle = (process.argv[4] || '').toLowerCase();

const fd = fs.openSync(asar, 'r');
const head = Buffer.alloc(16);
fs.readSync(fd, head, 0, 16, 0);
const headerSize = head.readUInt32LE(12);
const hb = Buffer.alloc(headerSize);
fs.readSync(fd, hb, 0, headerSize, 16);
let json = hb.toString('utf8');
json = json.slice(0, json.lastIndexOf('}') + 1);
const header = JSON.parse(json);
const dataOffset = 16 + headerSize;

function walk(node, prefix, out) {
  if (!node.files) return;
  for (const [name, child] of Object.entries(node.files)) {
    const p = prefix ? prefix + '/' + name : name;
    if (child.files) walk(child, p, out);
    else out.push({ path: p, entry: child });
  }
}

const files = [];
walk(header, '', files);

if (mode === 'packages') {
  const names = new Set();
  for (const f of files) {
    const m = f.path.match(/^dsh\/node_modules\/((?:@[^/]+\/)?[^/]+)\//);
    if (m) names.add(m[1]);
  }
  for (const n of [...names].sort()) console.log(n);
  console.log('TOTAL', names.size);
} else if (mode === 'cat') {
  const hit = files.filter((f) => f.path.toLowerCase().includes(needle));
  if (hit.length !== 1) {
    console.log('matches:', hit.length);
    for (const h of hit.slice(0, 20)) console.log('  ', h.path);
    process.exit(2);
  }
  const f = hit[0];
  const buf = Buffer.alloc(f.entry.size);
  fs.readSync(fd, buf, 0, f.entry.size, dataOffset + Number(f.entry.offset));
  process.stdout.write(buf.toString('utf8'));
} else {
  const hit = files.filter((f) => f.path.toLowerCase().includes(needle));
  console.log('matches:', hit.length);
  for (const h of hit.slice(0, 300)) console.log(h.path);
}
fs.closeSync(fd);

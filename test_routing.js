// Test what Next.js catch-all actually captures
// According to Next.js docs, catch-all segments [...slug] capture remaining path segments

// Simulating a request to: GET /api/proxy/../../etc/passwd
// Next.js URL decoder will decode this, then pass to catch-all
// The question is: does it normalize the path first?

const url = '/api/proxy/../../etc/passwd';
const parts = url.split('/').filter(p => p);
console.log('URL parts (filtered):', parts);

// After "api" and "proxy", the catch-all gets:
const catchAllParts = parts.slice(2);
console.log('Catch-all params:', catchAllParts);

// Now what happens when we construct:
const reconstructed = `http://localhost:4000/api/v1/${catchAllParts.join('/')}`;
console.log('Reconstructed URL:', reconstructed);

// The critical question: does the fetch() function normalize the path?
// Node.js URL constructor normalizes paths!
const nodeUrl = new URL(reconstructed);
console.log('Node.js URL.pathname:', nodeUrl.pathname);

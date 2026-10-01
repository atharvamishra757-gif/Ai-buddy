import { Readable } from 'node:stream';
import { handleRequest } from '../../server/index.js';

export async function handler(event) {
  const requestUrl = event.rawUrl || `https://netlify.local${event.path || '/api'}`;
  const url = new URL(requestUrl);
  const body = event.body
    ? Buffer.from(event.body, event.isBase64Encoded ? 'base64' : 'utf8')
    : Buffer.alloc(0);
  const req = Readable.from(body.length ? [body] : []);
  req.url = `${url.pathname}${url.search}`;
  req.method = event.httpMethod || 'GET';
  req.headers = Object.fromEntries(
    Object.entries(event.headers || {}).map(([key, value]) => [key.toLowerCase(), value]),
  );

  let statusCode = 200;
  const headers = {};
  let responseBody = '';
  const res = {
    headersSent: false,
    setHeader(name, value) { headers[name] = value; },
    writeHead(status, values = {}) {
      statusCode = status;
      Object.assign(headers, values);
      this.headersSent = true;
    },
    end(value = '') {
      responseBody += value;
    },
  };

  await handleRequest(req, res);
  return {
    statusCode,
    headers,
    body: responseBody,
  };
}

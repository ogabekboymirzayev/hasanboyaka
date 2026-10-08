const { getLeads, saveLeads } = require('../../lib/leadsDb');

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

function sendJson(res, statusCode, data) {
  if (typeof res.status === 'function' && typeof res.json === 'function') {
    return res.status(statusCode).json(data);
  }
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

async function parseBody(req) {
  if (req.body !== undefined && typeof req.body === 'object') {
    return req.body;
  }
  if (typeof req.body === 'string' && req.body) {
    try {
      return JSON.parse(req.body);
    } catch (e) {
      return {};
    }
  }

  return new Promise((resolve) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 1e6) {
        req.destroy();
        resolve({});
      }
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (err) {
        resolve({});
      }
    });
    req.on('error', () => resolve({}));
  });
}

module.exports = async function handler(req, res) {
  setCors(res);

  if (req.method === 'OPTIONS') {
    if (typeof res.status === 'function') {
      return res.status(204).end();
    }
    res.writeHead(204);
    res.end();
    return;
  }

  // Extract ID from route parameter or URL
  let id = req.query && req.query.id;
  if (!id && req.url) {
    const match = req.url.match(/\/api\/leads\/([a-zA-Z0-9_-]+)/);
    if (match) id = match[1];
  }

  const leads = getLeads();
  const index = leads.findIndex(l => l.id === id);

  if (index === -1) {
    return sendJson(res, 404, { success: false, error: 'Lead topilmadi' });
  }

  if (req.method === 'PUT' || req.method === 'PATCH') {
    const body = await parseBody(req);
    const target = leads[index];

    if (body.status !== undefined) target.status = body.status;
    if (body.result !== undefined) target.result = body.result;
    if (body.recommendedTariff !== undefined) target.recommendedTariff = body.recommendedTariff;
    if (body.notes !== undefined) target.notes = body.notes;
    if (body.name !== undefined) target.name = body.name;
    if (body.phone !== undefined) target.phone = body.phone;

    saveLeads(leads);
    return sendJson(res, 200, { success: true, lead: target });
  }

  if (req.method === 'DELETE') {
    const removed = leads.splice(index, 1)[0];
    saveLeads(leads);
    return sendJson(res, 200, { success: true, lead: removed });
  }

  if (req.method === 'GET') {
    return sendJson(res, 200, { success: true, lead: leads[index] });
  }

  return sendJson(res, 405, { success: false, error: 'Method not allowed' });
};

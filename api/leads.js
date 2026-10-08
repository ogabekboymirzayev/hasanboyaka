const { getLeads, saveLeads } = require('../lib/leadsDb');

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

  // Handle GET /api/leads
  if (req.method === 'GET') {
    const leads = getLeads();
    return sendJson(res, 200, { success: true, leads });
  }

  // Handle POST /api/leads
  if (req.method === 'POST') {
    const body = await parseBody(req);
    const name = (body.name || '').trim();
    const phone = (body.phone || '').trim();
    const tariff = (body.recommendedTariff || body.tariff || 'premium').toLowerCase();

    if (!name || !phone) {
      return sendJson(res, 400, {
        success: false,
        error: 'Ism va telefon raqami kiritilishi shart'
      });
    }

    const now = new Date();
    const pad = n => String(n).padStart(2, '0');
    const createdAt = `${pad(now.getDate())}.${pad(now.getMonth() + 1)}.${now.getFullYear()}, ${pad(now.getHours())}:${pad(now.getMinutes())}`;

    const newLead = {
      id: 'lead-' + now.getTime() + '-' + Math.floor(Math.random() * 1000),
      name: name,
      phone: phone,
      recommendedTariff: tariff,
      status: 'yangi',
      result: 'kutilmoqda',
      createdAt: createdAt,
      timestamp: now.getTime(),
      notes: body.notes || '',
      source: body.source || 'Web-sayt'
    };

    const leads = getLeads();
    leads.unshift(newLead);
    saveLeads(leads);

    return sendJson(res, 201, { success: true, lead: newLead });
  }

  // Fallback for query param ?id=... (PUT/PATCH/DELETE)
  const id = req.query && req.query.id;
  if (id) {
    const leads = getLeads();
    const index = leads.findIndex(l => l.id === id);

    if (req.method === 'PUT' || req.method === 'PATCH') {
      if (index === -1) {
        return sendJson(res, 404, { success: false, error: 'Lead topilmadi' });
      }

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
      if (index === -1) {
        return sendJson(res, 404, { success: false, error: 'Lead topilmadi' });
      }

      const removed = leads.splice(index, 1)[0];
      saveLeads(leads);
      return sendJson(res, 200, { success: true, lead: removed });
    }
  }

  return sendJson(res, 405, { success: false, error: 'Method not allowed' });
};

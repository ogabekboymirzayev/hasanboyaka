const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PORT = process.env.PORT || 3000;
const DB_FILE = path.join(__dirname, 'leads.json');

// Ensure leads.json exists
if (!fs.existsSync(DB_FILE)) {
  fs.writeFileSync(DB_FILE, JSON.stringify([], null, 2), 'utf-8');
}

function getLeads() {
  try {
    const raw = fs.readFileSync(DB_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch (e) {
    console.error('Error reading leads.json:', e);
    return [];
  }
}

function saveLeads(leads) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(leads, null, 2), 'utf-8');
    return true;
  } catch (e) {
    console.error('Error saving leads.json:', e);
    return false;
  }
}

// SSE (Server-Sent Events) clients
const sseClients = new Set();

function broadcastEvent(eventName, payload) {
  const dataString = `event: ${eventName}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const client of sseClients) {
    try {
      client.write(dataString);
    } catch (e) {
      sseClients.delete(client);
    }
  }
}

// Find local network IP for mobile device access
function getLocalIpAddress() {
  const interfaces = os.networkInterfaces();
  for (const devName in interfaces) {
    const iface = interfaces[devName];
    for (let i = 0; i < iface.length; i++) {
      const alias = iface[i];
      if (alias.family === 'IPv4' && !alias.internal && !alias.address.startsWith('169.254')) {
        return alias.address;
      }
    }
  }
  return 'localhost';
}

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 1e6) {
        req.destroy();
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (err) {
        resolve({});
      }
    });
    req.on('error', reject);
  });
}

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp'
};

const server = http.createServer(async (req, res) => {
  setCors(res);

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = decodeURIComponent(parsedUrl.pathname);

  // 1. SSE Real-time events endpoint
  if (pathname === '/api/events') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*'
    });
    res.write(': heartbeat\n\n');
    sseClients.add(res);

    req.on('close', () => {
      sseClients.delete(res);
    });
    return;
  }

  // 2. REST API /api/leads
  if (pathname === '/api/leads') {
    if (req.method === 'GET') {
      const leads = getLeads();
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ success: true, leads }));
      return;
    }

    if (req.method === 'POST') {
      const body = await parseJsonBody(req);
      const name = (body.name || '').trim();
      const phone = (body.phone || '').trim();
      const tariff = (body.recommendedTariff || body.tariff || 'premium').toLowerCase();

      if (!name || !phone) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ success: false, error: 'Ism va telefon raqami kiritilishi shart' }));
        return;
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
      leads.unshift(newLead); // Add to beginning of list
      saveLeads(leads);

      // Broadcast to all operators in real-time
      broadcastEvent('new_lead', newLead);

      res.writeHead(201, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ success: true, lead: newLead }));
      return;
    }
  }

  // 3. API Lead Update / Delete: /api/leads/:id
  const leadMatch = pathname.match(/^\/api\/leads\/([a-zA-Z0-9_-]+)$/);
  if (leadMatch) {
    const leadId = leadMatch[1];
    const leads = getLeads();
    const index = leads.findIndex(l => l.id === leadId);

    if (req.method === 'PUT' || req.method === 'PATCH') {
      if (index === -1) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Lead topilmadi' }));
        return;
      }

      const body = await parseJsonBody(req);
      const target = leads[index];

      if (body.status !== undefined) target.status = body.status;
      if (body.result !== undefined) target.result = body.result;
      if (body.recommendedTariff !== undefined) target.recommendedTariff = body.recommendedTariff;
      if (body.notes !== undefined) target.notes = body.notes;
      if (body.name !== undefined) target.name = body.name;
      if (body.phone !== undefined) target.phone = body.phone;

      saveLeads(leads);
      broadcastEvent('update_lead', target);

      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ success: true, lead: target }));
      return;
    }

    if (req.method === 'DELETE') {
      if (index === -1) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Lead topilmadi' }));
        return;
      }

      const removed = leads.splice(index, 1)[0];
      saveLeads(leads);
      broadcastEvent('delete_lead', { id: leadId });

      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ success: true, lead: removed }));
      return;
    }
  }

  // 4. HTML Routes & File Serving
  let filePath = '';

  if (pathname === '/' || pathname === '/mijoz' || pathname === '/client') {
    filePath = path.join(__dirname, 'mijozlar.html');
    if (!fs.existsSync(filePath)) {
      filePath = path.join(__dirname, 'ai-segment-mijozlar (5).html');
    }
  } else if (pathname === '/operator' || pathname === '/crm' || pathname === '/admin') {
    filePath = path.join(__dirname, 'operator.html');
    if (!fs.existsSync(filePath)) {
      filePath = path.join(__dirname, 'ai-segment-operator (5).html');
    }
  } else {
    // direct static file
    filePath = path.join(__dirname, pathname.replace(/^\//, ''));
  }

  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath).toLowerCase();
    const mime = MIME_TYPES[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': mime });
    fs.createReadStream(filePath).pipe(res);
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Sahifa topilmadi (404 Not Found)');
});

server.listen(PORT, '0.0.0.0', () => {
  const localIp = getLocalIpAddress();
  console.log('====================================================');
  console.log(`🚀 AI SEGMENT SERVER ISHQQA TUSHDI!`);
  console.log(`----------------------------------------------------`);
  console.log(`💻 KOMPYUTER UCHUN HAVOLALAR:`);
  console.log(`   👉 Mijozlar paneli:   http://localhost:${PORT}/`);
  console.log(`   👉 Operatorlar CRM:   http://localhost:${PORT}/operator`);
  console.log(`----------------------------------------------------`);
  console.log(`📱 TELEFON VA TARMOQDAGI QURILMALAR UCHUN:`);
  console.log(`   👉 Mijozlar paneli:   http://${localIp}:${PORT}/`);
  console.log(`   👉 Operatorlar CRM:   http://${localIp}:${PORT}/operator`);
  console.log(`====================================================`);
});

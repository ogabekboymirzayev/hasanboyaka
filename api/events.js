function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
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

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*'
  });

  res.write(': heartbeat\n\n');
  res.write(`event: connected\ndata: {"status":"ok","time":${Date.now()}}\n\n`);

  // If on Vercel Serverless Function, complete gracefully after a few seconds to avoid gateway timeouts
  if (process.env.VERCEL) {
    const timer = setTimeout(() => {
      try {
        res.end();
      } catch (e) {}
    }, 4000);

    req.on('close', () => {
      clearTimeout(timer);
    });
  }
};

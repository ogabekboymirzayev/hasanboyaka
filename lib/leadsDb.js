const fs = require('fs');
const path = require('path');

// Vercel serverless environment has a read-only filesystem except /tmp
const isVercel = Boolean(process.env.VERCEL);
const BUNDLED_DB = path.join(process.cwd(), 'leads.json');
const TMP_DB = path.join('/tmp', 'leads.json');
const DB_FILE = isVercel ? TMP_DB : BUNDLED_DB;

let memoryLeads = null;

function readInitialBundledData() {
  try {
    if (fs.existsSync(BUNDLED_DB)) {
      const content = fs.readFileSync(BUNDLED_DB, 'utf-8');
      return JSON.parse(content);
    }
  } catch (err) {
    console.error('Error reading bundled leads.json:', err);
  }
  return [];
}

function getLeads() {
  if (isVercel) {
    // If running on Vercel, check /tmp/leads.json
    try {
      if (fs.existsSync(TMP_DB)) {
        const raw = fs.readFileSync(TMP_DB, 'utf-8');
        memoryLeads = JSON.parse(raw);
        return memoryLeads;
      }
    } catch (e) {
      if (memoryLeads !== null) return memoryLeads;
    }

    // First time in this serverless instance: populate /tmp with bundled data
    if (memoryLeads === null) {
      memoryLeads = readInitialBundledData();
      try {
        fs.writeFileSync(TMP_DB, JSON.stringify(memoryLeads, null, 2), 'utf-8');
      } catch (err) {}
    }
    return memoryLeads;
  }

  // Local development
  try {
    if (fs.existsSync(BUNDLED_DB)) {
      const raw = fs.readFileSync(BUNDLED_DB, 'utf-8');
      memoryLeads = JSON.parse(raw);
      return memoryLeads;
    }
  } catch (e) {
    console.error('Error reading leads.json:', e);
  }

  if (memoryLeads === null) memoryLeads = [];
  return memoryLeads;
}

function saveLeads(leads) {
  memoryLeads = leads;
  const targetFile = isVercel ? TMP_DB : BUNDLED_DB;

  try {
    fs.writeFileSync(targetFile, JSON.stringify(leads, null, 2), 'utf-8');
    return true;
  } catch (e) {
    console.error(`Error saving leads to ${targetFile}:`, e);
    // If local write failed due to permissions or read-only, try /tmp fallback
    if (!isVercel) {
      try {
        fs.writeFileSync(TMP_DB, JSON.stringify(leads, null, 2), 'utf-8');
        return true;
      } catch (err) {}
    }
    return false;
  }
}

module.exports = {
  getLeads,
  saveLeads,
  DB_FILE
};

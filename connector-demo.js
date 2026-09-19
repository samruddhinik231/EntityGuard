const http = require('http');

console.log("==================================================");
console.log("🚀 UEBA EXTERNAL LOG CONNECTOR SIMULATOR STARTED");
console.log("==================================================\n");
console.log("Sending simulated Active Directory, Firewall, and VPN logs");
console.log("to the UEBA Ingestion API (http://localhost:5000/api/v1/logs/ingest)...\n");

const TARGET_URL = 'http://localhost:5000/api/v1/logs/ingest';
const LOGIN_URL = 'http://localhost:5000/api/v1/auth/login';
const CONNECTOR_USER = process.env.CONNECTOR_USER || 'connector';
const CONNECTOR_PASSWORD = process.env.CONNECTOR_PASSWORD || 'connector123';

let authToken = null;

// A mix of normal and anomalous logs
const logTemplates = [
  // Normal
  { source: 'ActiveDirectory', action: 'login_success', user: 'admin', count: 1 },
  { source: 'ActiveDirectory', action: 'login_success', user: 'employee_01', count: 1 },
  { source: 'Firewall', action: 'data_transfer', bytes: 50000, user: 'contractor_1' },
  { source: 'VPN', action: 'login', location: 'Local Office', user: 'guest' },
  
  // Anomalous (Matches rules in server/routes/api.js)
  { source: 'ActiveDirectory', action: 'login_failed', user: 'employee_01', count: 10 }, // Brute Force High severity
  { source: 'Firewall', action: 'large_data_transfer', bytes: 15000000, user: 'contractor_1' }, // Exfiltration Critical severity
  { source: 'VPN', action: 'login', location: 'Outside Expected Country', user: 'admin' }, // Impossible travel Medium severity
  { source: 'Endpoint', action: 'privilege_escalation', user: 'guest' } // Privilege escalation Critical
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const requestJson = (url, payload) => {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);

    const req = http.request(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {})
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve(parsed);
        } catch(e) {
          resolve(data);
        }
      });
    });

    req.on('error', (e) => reject(e));
    req.write(body);
    req.end();
  });
};

const authenticateConnector = async () => {
  const response = await requestJson(LOGIN_URL, {
    username: CONNECTOR_USER,
    password: CONNECTOR_PASSWORD
  });

  if (!response?.token) {
    throw new Error('Authentication failed: token missing');
  }

  authToken = response.token;
};

const sendLog = (logData) => {
  logData.timestamp = new Date().toISOString();
  return requestJson(TARGET_URL, logData);
};

const startSimulation = async () => {
  try {
    await authenticateConnector();
    console.log('[auth] Connector authenticated successfully.\n');
  } catch (error) {
    console.error(`\x1b[31mAuthentication failed: ${error.message}\x1b[0m`);
    process.exit(1);
  }

  let tick = 0;
  while (true) {
    tick++;
    
    // For every 3 normal logs, send 1 anomalous log
    let log;
    if (tick % 4 === 0) {
      log = logTemplates[Math.floor(Math.random() * 4) + 4]; // Pick anomalous
      console.log(`\x1b[31m[!] Sending Suspicious Log:\x1b[0m ${log.source} - ${log.action} for user '${log.user}'`);
    } else {
      log = logTemplates[Math.floor(Math.random() * 4)]; // Pick normal
      console.log(`\x1b[32m[+] Sending Normal Log:\x1b[0m ${log.source} - ${log.action} for user '${log.user}'`);
    }
    
    try {
      const response = await sendLog(log);
      if (response && response.anomalous) {
        console.log(`   -> \x1b[33mServer registered ANOMALY. Alert triggered.\x1b[0m\n`);
      } else {
        console.log(`   -> Server ingested log safely.\n`);
      }
    } catch (err) {
      console.error(`   -> \x1b[31mFailed to connect to server: ${err.message}\x1b[0m\n`);
    }

    // Wait 4-7 seconds before next log
    const delay = Math.floor(Math.random() * 3000) + 4000;
    await sleep(delay);
  }
};

startSimulation();

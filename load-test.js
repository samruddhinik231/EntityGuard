const http = require('http');

const TARGET_URL = 'http://localhost:5000/api/v1/logs/ingest';
const LOGIN_URL = 'http://localhost:5000/api/v1/auth/login';

const BATCH_SIZE = 50; // batch size to prevent saturating Node's network stack entirely
const TOTAL_LOGS = 10000;

const userNames = ['alice.smith', 'bob.jones', 'carol.williams', 'david.brown', 'eve.davis', 'frank.miller', 'grace.wilson', 'harry.moore', 'ivy.taylor', 'jack.anderson'];
const sources = ['Firewall', 'VPN', 'ActiveDirectory', 'Endpoint'];
const locations = ['New York', 'London', 'Tokyo', 'Sydney', 'Outside Expected Country'];

function randomChoice(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function generateRandomLog() {
  const isAnomalous = Math.random() < 0.05; // 5% chance of being an anomaly

  if (isAnomalous) {
    const anomalyType = Math.random();
    if (anomalyType < 0.3) {
      return { source: 'ActiveDirectory', action: 'login_failed', user: randomChoice(userNames), count: Math.floor(Math.random() * 10) + 6 }; // >5 triggers Brute Force
    } else if (anomalyType < 0.6) {
      return { source: 'Firewall', action: 'large_data_transfer', user: randomChoice(userNames), bytes: Math.floor(Math.random() * 10000000) + 5000001 }; // >5M triggers Exfiltration
    } else if (anomalyType < 0.9) {
      return { source: 'VPN', action: 'login', user: randomChoice(userNames), location: 'Outside Expected Country' };
    } else {
      return { source: 'Endpoint', action: 'privilege_escalation', user: randomChoice(userNames) };
    }
  }

  // Normal ops
  return {
    source: randomChoice(sources),
    action: 'standard_activity',
    user: randomChoice(userNames),
    location: randomChoice(locations)
  };
}

async function login() {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ username: 'connector', password: 'connector123' });
    const req = http.request(LOGIN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length
      }
    }, res => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => {
        const parsed = JSON.parse(body);
        if (parsed.token) resolve(parsed.token);
        else {
          const cookieHeader = res.headers['set-cookie'];
          if (cookieHeader) {
            let cookie = Array.isArray(cookieHeader) ? cookieHeader[0] : cookieHeader;
            resolve({ cookie: cookie.split(';')[0] });
          } else {
            console.error("Login failed, no token or cookie: ", parsed);
            reject(new Error("Login failed"));
          }
        }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function sendLog(log, auth) {
  return new Promise((resolve) => {
    const data = JSON.stringify(log);
    const headers = {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(data)
    };
    if (auth.cookie) headers['Cookie'] = auth.cookie;
    else headers['Authorization'] = 'Bearer ' + auth;

    const req = http.request(TARGET_URL, { method: 'POST', headers }, res => {
      res.on('data', () => {}); // Consume buffer
      res.on('end', resolve);
    });
    req.on('error', () => resolve()); // Ignore network errors during load test
    req.write(data);
    req.end();
  });
}

async function runLoadTest() {
  console.log(`🚀 Starting load test of ${TOTAL_LOGS} logs...`);
  try {
    const auth = await login();
    console.log(`✅ Logged in as connector machine. Proceeding to fire logs...`);

    let sent = 0;
    while (sent < TOTAL_LOGS) {
      const batch = [];
      const currentBatchSize = Math.min(BATCH_SIZE, TOTAL_LOGS - sent);
      
      for (let i = 0; i < currentBatchSize; i++) {
        batch.push(sendLog(generateRandomLog(), auth));
      }

      await Promise.all(batch);
      sent += currentBatchSize;
      
      if (sent % 1000 === 0) {
        console.log(`🔥 Sent ${sent}/${TOTAL_LOGS} logs...`);
      }
    }
    
    console.log(`🎉 Demo population complete! Sent ${TOTAL_LOGS} logs.`);
    console.log(`Login at http://localhost:5177 with admin/admin123 to verify the generated SOC Alerts.`);
  } catch (e) {
    console.error(`❌ Load test failed: `, e.message);
  }
}

runLoadTest();
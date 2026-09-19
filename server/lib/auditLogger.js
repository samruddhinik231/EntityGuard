const fs = require('fs/promises');
const path = require('path');

const logDir = path.join(__dirname, '..', 'logs');
const logFile = path.join(logDir, 'audit.log');

const maxFileSizeMb = Number(process.env.AUDIT_MAX_FILE_SIZE_MB || 10);
const maxFileSizeBytes = Math.max(1, maxFileSizeMb) * 1024 * 1024;
const maxRotatedFiles = Number(process.env.AUDIT_MAX_FILES || 5);

const getRotatedFiles = async () => {
  const entries = await fs.readdir(logDir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.startsWith('audit-') && entry.name.endsWith('.log'))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));
};

const rotateIfNeeded = async (nextLineLength) => {
  try {
    const stat = await fs.stat(logFile);
    if (stat.size + nextLineLength <= maxFileSizeBytes) {
      return;
    }

    const suffix = new Date().toISOString().replace(/[:.]/g, '-');
    const rotatedName = `audit-${suffix}.log`;
    const rotatedPath = path.join(logDir, rotatedName);
    await fs.rename(logFile, rotatedPath);

    const rotatedFiles = await getRotatedFiles();
    while (rotatedFiles.length > maxRotatedFiles) {
      const oldest = rotatedFiles.shift();
      await fs.unlink(path.join(logDir, oldest));
    }
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw error;
    }
  }
};

const safeWrite = async (line) => {
  await fs.mkdir(logDir, { recursive: true });
  await rotateIfNeeded(Buffer.byteLength(`${line}\n`));
  await fs.appendFile(logFile, `${line}\n`, 'utf-8');
};

const logAuditEvent = async ({
  action,
  outcome,
  actor,
  role,
  path: requestPath,
  method,
  ip,
  reason,
  metadata
}) => {
  try {
    const event = {
      timestamp: new Date().toISOString(),
      action,
      outcome,
      actor: actor || 'anonymous',
      role: role || null,
      path: requestPath || null,
      method: method || null,
      ip: ip || null,
      reason: reason || null,
      metadata: metadata || null
    };

    const eventJson = JSON.stringify(event);

    if (process.env.AUDIT_LOG_STDOUT === 'true') {
      process.stdout.write(eventJson + '\n');
    }

    await safeWrite(eventJson);
  } catch (error) {
    // Logging must never block the API request path.
    console.error('audit-log-write-failed', error.message);
  }
};

module.exports = {
  logAuditEvent
};
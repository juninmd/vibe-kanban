import fs from 'node:fs';
import path from 'node:path';

const SECRETS_FILE = path.resolve(process.cwd(), 'secrets.json');

export function getMaskedSecrets() {
  const secrets = getRawSecrets();
  const maskedSecrets: Record<string, string> = {};
  for (const [key, value] of Object.entries(secrets)) {
    if (typeof value === 'string' && value.length > 0) {
      maskedSecrets[key] = '[REDACTED]';
    }
  }
  return maskedSecrets;
}

export function getRawSecrets() {
  if (!fs.existsSync(SECRETS_FILE)) {
    return {};
  }
  try {
    const data = fs.readFileSync(SECRETS_FILE, 'utf-8');
    return JSON.parse(data) as Record<string, string>;
  } catch (e) {
    console.error('Failed to read secrets file:', e);
    return {};
  }
}

export function setSecrets(newSecrets: Record<string, string>) {
  let existingSecrets: Record<string, string> = {};
  if (fs.existsSync(SECRETS_FILE)) {
    try {
      const data = fs.readFileSync(SECRETS_FILE, 'utf-8');
      existingSecrets = JSON.parse(data);
    } catch (e) {
      console.error('Failed to read secrets file for writing:', e);
    }
  }

  const updatedSecrets = { ...existingSecrets };
  for (const [key, value] of Object.entries(newSecrets)) {
    if (value !== '[REDACTED]') {
      updatedSecrets[key] = value;
    }
  }

  fs.writeFileSync(SECRETS_FILE, JSON.stringify(updatedSecrets, null, 2), 'utf-8');
  return true;
}

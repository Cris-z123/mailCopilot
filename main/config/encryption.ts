import { webcrypto } from 'crypto';

/**
 * AES-256-GCM field-level encryption
 *
 * Features:
 * - 256-bit key encryption using Web Crypto API
 * - Authenticated encryption (GCM mode) prevents tampering
 * - Buffer.fill(0) cleanup for sensitive data
 * - Base64 encoding for database storage
 */

export interface EncryptedData {
  ciphertext: string; // Base64 encoded
  iv: string; // Base64 encoded initialization vector
  authTag: string; // Base64 encoded authentication tag
}

// CryptoKey type - using any to avoid complex webcrypto type issues
// This is safe because we only get CryptoKey from webcrypto.subtle.generateKey()
export type CryptoKey = any;

/**
 * Generate a random 256-bit encryption key
 */
export async function generateKey(): Promise<CryptoKey> {
  return await webcrypto.subtle.generateKey(
    {
      name: 'AES-GCM',
      length: 256,
    },
    true, // extractable
    ['encrypt', 'decrypt']
  );
}

/**
 * Generate a random initialization vector (IV)
 */
function generateIV(): Uint8Array {
  return webcrypto.getRandomValues(new Uint8Array(12)); // 96-bit IV for GCM
}

/**
 * Encrypt data using AES-256-GCM
 *
 * @param key - Encryption key (CryptoKey)
 * @param plaintext - Data to encrypt (string or Buffer)
 * @returns Encrypted data with IV and auth tag
 */
export async function encrypt(
  key: CryptoKey,
  plaintext: string | Buffer
): Promise<EncryptedData> {
  const iv = generateIV();
  const data = typeof plaintext === 'string'
    ? new TextEncoder().encode(plaintext)
    : plaintext;

  const ciphertext = await webcrypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv,
    },
    key,
    data
  );

  // Web Crypto API GCM mode includes auth tag in ciphertext
  // For database storage, we store the complete ciphertext (with auth tag embedded)
  const ciphertextBuffer = new Uint8Array(ciphertext);

  return {
    ciphertext: bufferToBase64(ciphertextBuffer),
    iv: bufferToBase64(iv),
    authTag: '', // Empty since auth tag is embedded in ciphertext
  };
}

/**
 * Decrypt data using AES-256-GCM
 *
 * @param key - Decryption key (CryptoKey)
 * @param encryptedData - Encrypted data with IV and auth tag
 * @returns Decrypted plaintext
 */
export async function decrypt(
  key: CryptoKey,
  encryptedData: EncryptedData
): Promise<string> {
  const { ciphertext, iv } = encryptedData;

  // Web Crypto API GCM mode expects ciphertext with embedded auth tag
  const ciphertextBuffer = base64ToBuffer(ciphertext);

  const decrypted = await webcrypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: base64ToBuffer(iv),
    },
    key,
    ciphertextBuffer
  );

  // Clean up sensitive data
  ciphertextBuffer.fill(0);

  return new TextDecoder().decode(decrypted);
}

/**
 * Encrypt field for database storage
 *
 * @param key - Encryption key
 * @param value - Value to encrypt
 * @returns JSON string of encrypted data for BLOB storage
 */
export async function encryptField(
  key: CryptoKey,
  value: string
): Promise<string> {
  const encrypted = await encrypt(key, value);
  return JSON.stringify(encrypted);
}

/**
 * Decrypt field from database storage
 *
 * @param key - Decryption key
 * @param blob - JSON string of encrypted data from BLOB
 * @returns Decrypted value
 */
export async function decryptField(
  key: CryptoKey,
  blob: string
): Promise<string> {
  const encrypted: EncryptedData = JSON.parse(blob);
  return await decrypt(key, encrypted);
}

/**
 * Compute SHA-256 hash for integrity checking
 *
 * @param data - Data to hash
 * @returns Hex-encoded hash
 */
export async function sha256(data: string): Promise<string> {
  const buffer = new TextEncoder().encode(data);
  const hashBuffer = await webcrypto.subtle.digest('SHA-256', buffer);
  return bufferToHex(hashBuffer);
}

/**
 * Compute HMAC-SHA256 for config integrity
 *
 * @param key - HMAC key
 * @param data - Data to authenticate
 * @returns Hex-encoded HMAC
 */
export async function hmacSha256(
  key: CryptoKey,
  data: string
): Promise<string> {
  const buffer = new TextEncoder().encode(data);
  const hmac = await webcrypto.subtle.sign(
    'HMAC',
    key,
    buffer
  );
  return bufferToHex(hmac);
}

/**
 * Generate HMAC key for config signing
 */
export async function generateHMACKey(): Promise<CryptoKey> {
  return await webcrypto.subtle.generateKey(
    {
      name: 'HMAC',
      hash: 'SHA-256',
    },
    true,
    ['sign', 'verify']
  );
}

// Helper functions

function bufferToBase64(buffer: Uint8Array): string {
  return Buffer.from(buffer).toString('base64');
}

function base64ToBuffer(base64: string): Uint8Array {
  return new Uint8Array(Buffer.from(base64, 'base64'));
}

function bufferToHex(buffer: ArrayBuffer): string {
  return Buffer.from(buffer).toString('hex');
}

/**
 * Securely clear sensitive data from buffer
 */
export function clearBuffer(buffer: Uint8Array): void {
  buffer.fill(0);
}

/**
 * Export CryptoKey to raw bytes for storage
 */
export async function exportKey(key: CryptoKey): Promise<string> {
  const exported = await webcrypto.subtle.exportKey('raw', key);
  return bufferToBase64(new Uint8Array(exported));
}

/**
 * Import CryptoKey from raw bytes
 */
export async function importKey(keyData: string): Promise<CryptoKey> {
  const buffer = base64ToBuffer(keyData);
  return await webcrypto.subtle.importKey(
    'raw',
    buffer,
    {
      name: 'AES-GCM',
      length: 256,
    },
    true,
    ['encrypt', 'decrypt']
  );
}

export default {
  generateKey,
  encrypt,
  decrypt,
  encryptField,
  decryptField,
  sha256,
  hmacSha256,
  generateHMACKey,
  exportKey,
  importKey,
  clearBuffer,
};

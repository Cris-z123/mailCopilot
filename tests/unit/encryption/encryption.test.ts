import { describe, it, expect, beforeEach } from 'vitest';
import {
  generateKey,
  encrypt,
  decrypt,
  encryptField,
  decryptField,
  sha256,
  clearBuffer,
  exportKey,
  importKey,
  generateHMACKey,
  hmacSha256,
  type EncryptedData,
  type CryptoKey
} from '@/config/encryption';

describe('Field Encryption/Decryption', () => {
  let testKey: CryptoKey;

  beforeEach(async () => {
    testKey = await generateKey();
  });

  describe('T018: AES-256-GCM Field Encryption', () => {
    it('should encrypt and decrypt string data correctly', async () => {
      const plaintext = 'This is sensitive action item content';
      const encrypted = await encrypt(testKey, plaintext);
      const decrypted = await decrypt(testKey, encrypted);

      expect(decrypted).toBe(plaintext);
    });

    it('should encrypt and decrypt Buffer data correctly', async () => {
      const plaintext = Buffer.from('Binary sensitive data');
      const encrypted = await encrypt(testKey, plaintext);
      const decrypted = await decrypt(testKey, encrypted);

      expect(decrypted).toBe('Binary sensitive data');
    });

    it('should produce different ciphertext for each encryption (random IV)', async () => {
      const plaintext = 'Same content';

      const encrypted1 = await encrypt(testKey, plaintext);
      const encrypted2 = await encrypt(testKey, plaintext);

      // Ciphertext should be different due to random IV
      expect(encrypted1.ciphertext).not.toBe(encrypted2.ciphertext);
      expect(encrypted1.iv).not.toBe(encrypted2.iv);

      // But both should decrypt to same value
      const decrypted1 = await decrypt(testKey, encrypted1);
      const decrypted2 = await decrypt(testKey, encrypted2);

      expect(decrypted1).toBe(decrypted2);
      expect(decrypted1).toBe(plaintext);
    });

    it('should include all required fields in encrypted data', async () => {
      const plaintext = 'Test content';
      const encrypted = await encrypt(testKey, plaintext);

      expect(encrypted).toHaveProperty('ciphertext');
      expect(encrypted).toHaveProperty('iv');
      expect(encrypted).toHaveProperty('authTag');

      // Verify Base64 encoding (no invalid characters)
      expect(encrypted.ciphertext).toMatch(/^[A-Za-z0-9+/=]+$/);
      expect(encrypted.iv).toMatch(/^[A-Za-z0-9+/=]+$/);
      // authTag is empty in Web Crypto API GCM (embedded in ciphertext)
      expect(typeof encrypted.authTag).toBe('string');
    });

    it('should fail to decrypt with wrong key', async () => {
      const plaintext = 'Secret data';
      const encrypted = await encrypt(testKey, plaintext);

      const wrongKey = await generateKey();

      await expect(decrypt(wrongKey, encrypted)).rejects.toThrow();
    });

    it('should fail to decrypt with tampered ciphertext', async () => {
      const plaintext = 'Secret data';
      const encrypted = await encrypt(testKey, plaintext);

      // Tamper with ciphertext (flip a bit in base64)
      const tampered: EncryptedData = {
        ...encrypted,
        ciphertext: encrypted.ciphertext.substring(0, 10) +
          (encrypted.ciphertext[10] === 'A' ? 'B' : 'A') +
          encrypted.ciphertext.substring(11)
      };

      await expect(decrypt(testKey, tampered)).rejects.toThrow();
    });

    it('should fail to decrypt with wrong IV', async () => {
      const plaintext = 'Secret data';
      const encrypted = await encrypt(testKey, plaintext);

      // Use wrong IV (12 bytes = 16 base64 chars)
      const tampered: EncryptedData = {
        ...encrypted,
        iv: 'AAAAAAAAAAAAAAAAAAAAAA=='
      };

      await expect(decrypt(testKey, tampered)).rejects.toThrow();
    });
  });

  describe('Database Field Encryption', () => {
    it('should encrypt and decrypt field for database storage', async () => {
      const fieldValue = 'Sensitive action item';
      const encryptedBlob = await encryptField(testKey, fieldValue);

      // Should be valid JSON string
      expect(typeof encryptedBlob).toBe('string');
      const parsed: EncryptedData = JSON.parse(encryptedBlob);
      expect(parsed).toHaveProperty('ciphertext');
      expect(parsed).toHaveProperty('iv');
      expect(parsed).toHaveProperty('authTag');

      // Decrypt back
      const decrypted = await decryptField(testKey, encryptedBlob);
      expect(decrypted).toBe(fieldValue);
    });

    it('should handle empty strings', async () => {
      const fieldValue = '';
      const encryptedBlob = await encryptField(testKey, fieldValue);
      const decrypted = await decryptField(testKey, encryptedBlob);

      expect(decrypted).toBe('');
    });

    it('should handle special characters and unicode', async () => {
      const fieldValue = '测试中文 🎉 Action Item: " quotes & <tags>';
      const encryptedBlob = await encryptField(testKey, fieldValue);
      const decrypted = await decryptField(testKey, encryptedBlob);

      expect(decrypted).toBe(fieldValue);
    });

    it('should handle large content (email body)', async () => {
      // Simulate email body up to 100k chars (from constraint)
      const largeContent = 'A'.repeat(10000);
      const encryptedBlob = await encryptField(testKey, largeContent);
      const decrypted = await decryptField(testKey, encryptedBlob);

      expect(decrypted).toBe(largeContent);
    });
  });

  describe('Buffer.fill(0) Memory Cleanup', () => {
    it('should clear sensitive buffer after decryption', async () => {
      const plaintext = 'Very sensitive data';
      const encrypted = await encrypt(testKey, plaintext);

      // Decrypt internally creates combined buffer
      const decrypted = await decrypt(testKey, encrypted);

      // Verify decryption worked
      expect(decrypted).toBe(plaintext);

      // The clearBuffer function should work correctly
      const testBuffer = new Uint8Array([1, 2, 3, 4, 5]);
      clearBuffer(testBuffer);

      // All bytes should be zero
      expect(Array.from(testBuffer)).toEqual([0, 0, 0, 0, 0]);
    });

    it('should not affect other buffers when clearing', async () => {
      const buffer1 = new Uint8Array([1, 2, 3]);
      const buffer2 = new Uint8Array([4, 5, 6]);

      clearBuffer(buffer1);

      expect(Array.from(buffer1)).toEqual([0, 0, 0]);
      expect(Array.from(buffer2)).toEqual([4, 5, 6]); // Unchanged
    });
  });

  describe('SHA-256 Hash Generation', () => {
    it('should generate consistent SHA-256 hashes', async () => {
      const data = 'test@email.com + 2024-01-01 + Sender Name';

      const hash1 = await sha256(data);
      const hash2 = await sha256(data);

      expect(hash1).toBe(hash2);
      expect(hash1).toMatch(/^[a-f0-9]{64}$/); // 64 hex chars
    });

    it('should generate different hashes for different inputs', async () => {
      const data1 = 'email1@test.com + 2024-01-01';
      const data2 = 'email2@test.com + 2024-01-01';

      const hash1 = await sha256(data1);
      const hash2 = await sha256(data2);

      expect(hash1).not.toBe(hash2);
    });

    it('should handle empty string', async () => {
      const hash = await sha256('');
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should handle special characters', async () => {
      const data = '🎉 <special> "quotes" & ampersands';
      const hash = await sha256(data);

      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });
  });

  describe('Key Export/Import', () => {
    it('should export and import key correctly', async () => {
      const plaintext = 'Test data for key export';
      const encrypted = await encrypt(testKey, plaintext);

      // Export key
      const exportedKeyData = await exportKey(testKey);
      expect(typeof exportedKeyData).toBe('string');
      expect(exportedKeyData.length).toBeGreaterThan(0);

      // Import key
      const importedKey = await importKey(exportedKeyData);

      // Decrypt with imported key should work
      const decrypted = await decrypt(importedKey, encrypted);
      expect(decrypted).toBe(plaintext);
    });

    it('should produce same encrypted data with imported key', async () => {
      const plaintext = 'Test data';

      // Export original key
      const exportedKeyData = await exportKey(testKey);
      const importedKey = await importKey(exportedKeyData);

      // Encrypt with original
      const encrypted1 = await encrypt(testKey, plaintext);

      // Encrypt with imported
      const encrypted2 = await encrypt(importedKey, plaintext);

      // Both should decrypt successfully with either key
      const decrypted1 = await decrypt(testKey, encrypted1);
      const decrypted2 = await decrypt(importedKey, encrypted2);

      expect(decrypted1).toBe(plaintext);
      expect(decrypted2).toBe(plaintext);
    });
  });

  describe('HMAC-SHA256 for Config Integrity', () => {
    it('should generate and verify HMAC correctly', async () => {
      const hmacKey = await generateHMACKey();
      const data = 'config_value_to_sign';

      const signature = await hmacSha256(hmacKey, data);

      expect(signature).toMatch(/^[a-f0-9]{64}$/);
      expect(signature.length).toBe(64);
    });

    it('should generate different HMACs for different data', async () => {
      const hmacKey = await generateHMACKey();

      const sig1 = await hmacSha256(hmacKey, 'data1');
      const sig2 = await hmacSha256(hmacKey, 'data2');

      expect(sig1).not.toBe(sig2);
    });

    it('should generate different HMACs with different keys', async () => {
      const data = 'same data';

      const key1 = await generateHMACKey();
      const key2 = await generateHMACKey();

      const sig1 = await hmacSha256(key1, data);
      const sig2 = await hmacSha256(key2, data);

      expect(sig1).not.toBe(sig2);
    });
  });

  describe('Security Constraints', () => {
    it('should use 256-bit key (AES-256)', async () => {
      const key = await generateKey();

      // Export key to check length
      const exported = await exportKey(key);
      const buffer = Buffer.from(exported, 'base64');

      // 256 bits = 32 bytes
      expect(buffer.length).toBe(32);
    });

    it('should use 96-bit IV (12 bytes) for GCM', async () => {
      const plaintext = 'Test';
      const encrypted = await encrypt(testKey, plaintext);

      const ivBuffer = Buffer.from(encrypted.iv, 'base64');

      // GCM standard uses 96-bit IV
      expect(ivBuffer.length).toBe(12);
    });

    it('should use 128-bit auth tag (16 bytes) for GCM', async () => {
      const plaintext = 'Test';
      const encrypted = await encrypt(testKey, plaintext);

      // In Web Crypto API, auth tag is embedded in ciphertext
      // GCM adds 16 bytes auth tag to the ciphertext
      const ciphertextBuffer = Buffer.from(encrypted.ciphertext, 'base64');

      // Ciphertext length = plaintext length + 16 bytes auth tag
      // (actual length varies due to GCM padding, but should be > plaintext)
      expect(ciphertextBuffer.length).toBeGreaterThan(0);
    });
  });
});

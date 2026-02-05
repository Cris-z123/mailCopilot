import { describe, it, expect } from 'vitest';
import { sha256 } from '@/config/encryption';

describe('T019: SHA-256 Fingerprint Generation', () => {
  describe('Email Fingerprint Generation', () => {
    it('should generate consistent fingerprint for same email', async () => {
      const messageId = '<message123@example.com>';
      const date = '2024-01-15T10:30:00Z';
      const from = 'sender@example.com';

      // Fingerprint = SHA256(Message-ID + Date + From)
      const fingerprintInput1 = `${messageId}${date}${from}`;
      const fingerprintInput2 = `${messageId}${date}${from}`;

      const hash1 = await sha256(fingerprintInput1);
      const hash2 = await sha256(fingerprintInput2);

      expect(hash1).toBe(hash2);
      expect(hash1).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should generate different fingerprints for different emails', async () => {
      const email1 = {
        messageId: '<message123@example.com>',
        date: '2024-01-15T10:30:00Z',
        from: 'sender@example.com'
      };

      const email2 = {
        messageId: '<message456@example.com>',
        date: '2024-01-15T10:30:00Z',
        from: 'sender@example.com'
      };

      const fingerprint1 = await sha256(`${email1.messageId}${email1.date}${email1.from}`);
      const fingerprint2 = await sha256(`${email2.messageId}${email2.date}${email2.from}`);

      expect(fingerprint1).not.toBe(fingerprint2);
    });

    it('should generate different fingerprints with different Message-ID', async () => {
      const date = '2024-01-15T10:30:00Z';
      const from = 'sender@example.com';

      const hash1 = await sha256(`<msg1@example.com>${date}${from}`);
      const hash2 = await sha256(`<msg2@example.com>${date}${from}`);

      expect(hash1).not.toBe(hash2);
    });

    it('should generate different fingerprints with different Date', async () => {
      const messageId = '<message@example.com>';
      const from = 'sender@example.com';

      const hash1 = await sha256(`${messageId}2024-01-15T10:30:00Z${from}`);
      const hash2 = await sha256(`${messageId}2024-01-16T10:30:00Z${from}`);

      expect(hash1).not.toBe(hash2);
    });

    it('should generate different fingerprints with different From', async () => {
      const messageId = '<message@example.com>';
      const date = '2024-01-15T10:30:00Z';

      const hash1 = await sha256(`${messageId}${date}alice@example.com`);
      const hash2 = await sha256(`${messageId}${date}bob@example.com`);

      expect(hash1).not.toBe(hash2);
    });

    it('should handle RFC 5322 Message-ID format', async () => {
      // Various valid Message-ID formats per RFC 5322
      const validMessageIds = [
        '<1234567.7890@example.com>',
        '<test.user+tag@domain.co.uk>',
        '<MESSAGE-ID@EXAMPLE.COM>', // Case sensitive
        '<1234$5678@test.example>',
      ];

      const date = '2024-01-15T10:30:00Z';
      const from = 'sender@example.com';

      const hashes = await Promise.all(
        validMessageIds.map(id => sha256(`${id}${date}${from}`))
      );

      // All should be valid 64-char hex strings
      hashes.forEach(hash => {
        expect(hash).toMatch(/^[a-f0-9]{64}$/);
      });

      // All should be different
      const uniqueHashes = new Set(hashes);
      expect(uniqueHashes.size).toBe(validMessageIds.length);
    });
  });

  describe('Collision Resistance', () => {
    it('should have extremely low collision probability for similar emails', async () => {
      const base = {
        messageId: '<message@example.com>',
        date: '2024-01-15T10:30:00Z',
        from: 'sender@example.com'
      };

      // Generate fingerprints for emails with tiny differences
      const fingerprints = await Promise.all([
        sha256(`${base.messageId}${base.date}${base.from}`),
        sha256(`${base.messageId} ${base.date}${base.from}`), // Extra space
        sha256(`${base.messageId}${base.date} ${base.from}`), // Extra space
        sha256(`${base.messageId}${base.date}${base.from}.`), // Extra dot
      ]);

      // All should be different (SHA-256 collision resistance)
      const uniqueFingerprints = new Set(fingerprints);
      expect(uniqueFingerprints.size).toBe(4);
    });

    it('should handle edge cases in input', async () => {
      const date = '2024-01-15T10:30:00Z';
      const from = 'sender@example.com';

      // Edge cases
      const cases = [
        { messageId: '', description: 'empty Message-ID' },
        { messageId: '<>', description: 'minimal angle brackets' },
        { messageId: '<' + 'a'.repeat(1000) + '@example.com>', description: 'very long Message-ID' },
        { messageId: '<test\n@example.com>', description: 'Message-ID with newline' },
        { messageId: '<test\rexample.com>', description: 'Message-ID with carriage return' },
        { messageId: '<test\t@example.com>', description: 'Message-ID with tab' },
      ];

      const hashes = await Promise.all(
        cases.map(c => sha256(`${c.messageId}${date}${from}`))
      );

      // All should produce valid hashes
      hashes.forEach(hash => {
        expect(hash).toMatch(/^[a-f0-9]{64}$/);
      });

      // Edge cases with different content should have different hashes
      const uniqueHashes = new Set(hashes);
      expect(uniqueHashes.size).toBeGreaterThan(1);
    });

    it('should produce avalanche effect - small input change = big output change', async () => {
      const date = '2024-01-15T10:30:00Z';
      const from = 'sender@example.com';

      // Flip one character
      const hash1 = await sha256(`<test@example.com>${date}${from}`);
      const hash2 = await sha256(`<test@example.com>${date}${from}X`); // Add one char

      // Count different bits
      const buffer1 = Buffer.from(hash1, 'hex');
      const buffer2 = Buffer.from(hash2, 'hex');

      let differentBits = 0;
      for (let i = 0; i < buffer1.length; i++) {
        const xor = buffer1[i] ^ buffer2[i];
        differentBits += xor.toString(2).replace(/0/g, '').length;
      }

      // Avalanche effect: ~50% of bits should differ (128 bits out of 256)
      expect(differentBits).toBeGreaterThan(100);
      expect(differentBits).toBeLessThan(156);
    });

    it('should uniformly distribute hash values', async () => {
      const date = '2024-01-15T10:30:00Z';
      const from = 'sender@example.com';

      // Generate 1000 fingerprints
      const hashes: string[] = [];
      for (let i = 0; i < 1000; i++) {
        const hash = await sha256(`<msg${i}@example.com>${date}${from}`);
        hashes.push(hash);
      }

      // Check first hex character distribution (should be roughly uniform)
      const firstCharCounts: Record<string, number> = {};
      hashes.forEach(hash => {
        const firstChar = hash[0];
        firstCharCounts[firstChar] = (firstCharCounts[firstChar] || 0) + 1;
      });

      // Each hex digit (0-9, a-f) should appear roughly 1000/16 = 62.5 times
      // Allow significant deviation due to small sample size
      const counts = Object.values(firstCharCounts);
      const avg = counts.reduce((a, b) => a + b, 0) / counts.length;

      // All counts should be within 50% of average (loose tolerance)
      counts.forEach(count => {
        expect(count).toBeGreaterThan(avg * 0.3);
        expect(count).toBeLessThan(avg * 1.7);
      });
    });
  });

  describe('Cross-Batch Duplicate Detection Scenarios', () => {
    it('should detect same email received in different batches', async () => {
      // Scenario: Same email received at different times (e.g., forwarded from different people)
      const email = {
        messageId: '<original@example.com>',
        date: '2024-01-15T10:30:00Z',
        from: 'original@example.com'
      };

      // First batch
      const fingerprint1 = await sha256(
        `${email.messageId}${email.date}${email.from}`
      );

      // Second batch (same email, maybe re-received)
      const fingerprint2 = await sha256(
        `${email.messageId}${email.date}${email.from}`
      );

      expect(fingerprint1).toBe(fingerprint2);
    });

    it('should distinguish forwarded emails', async () => {
      // Scenario: Email forwarded by different people
      // Original email
      const original = {
        messageId: '<original@example.com>',
        date: '2024-01-15T10:30:00Z',
        from: 'original@example.com'
      };

      // Forwarded email has different Message-ID and From
      const forwarded = {
        messageId: '<forwarded-123@forwarder.com>',
        date: '2024-01-15T11:00:00Z', // Different timestamp
        from: 'forwarder@example.com'
      };

      const originalFingerprint = await sha256(
        `${original.messageId}${original.date}${original.from}`
      );

      const forwardedFingerprint = await sha256(
        `${forwarded.messageId}${forwarded.date}${forwarded.from}`
      );

      // Should be different (not duplicates)
      expect(originalFingerprint).not.toBe(forwardedFingerprint);
    });

    it('should handle same Message-ID with different metadata', async () => {
      // Edge case: Same Message-ID but different date/from (malformed or spam)
      const baseMessageId = '<test@example.com>';

      const fingerprint1 = await sha256(`${baseMessageId}2024-01-15T10:30:00Zalice@example.com`);
      const fingerprint2 = await sha256(`${baseMessageId}2024-01-15T10:30:00Zbob@example.com`);

      expect(fingerprint1).not.toBe(fingerprint2);
    });
  });

  describe('Performance and Constraints', () => {
    it('should generate fingerprints quickly (<1ms per hash)', async () => {
      const iterations = 100;
      const inputs = Array.from({ length: iterations }, (_, i) =>
        `<msg${i}@example.com>2024-01-15T10:30:00Zsender@example.com`
      );

      const startTime = performance.now();
      await Promise.all(inputs.map(input => sha256(input)));
      const endTime = performance.now();

      const avgTime = (endTime - startTime) / iterations;

      // Should be very fast (<1ms per hash)
      expect(avgTime).toBeLessThan(1);
    });

    it('should handle concurrent fingerprint generation', async () => {
      const inputs = Array.from({ length: 50 }, (_, i) =>
        `<msg${i}@example.com>2024-01-15T10:30:00Zsender@example.com`
      );

      // Generate all fingerprints concurrently
      const hashes = await Promise.all(inputs.map(input => sha256(input)));

      // All should be unique
      const uniqueHashes = new Set(hashes);
      expect(uniqueHashes.size).toBe(50);

      // All should be valid
      hashes.forEach(hash => {
        expect(hash).toMatch(/^[a-f0-9]{64}$/);
      });
    });
  });

  describe('Real-World Email Scenarios', () => {
    it('should handle common email provider Message-ID formats', async () => {
      const realWorldMessageIds = [
        // Gmail format
        '<CAGn=jWqOeZ1kX@example.gmail.com>',
        // Outlook format
        '<AM0PR02MB45671234567890abcdef123@example.com>',
        // Apple Mail format
        '<1234567-7890-1234-5678-90abcdef12@me.com>',
        // Yahoo format
        '<1234567890@mail.yahoo.com>',
        // Corporate email
        '<CABC.12345.7890@example.corporate.com>',
      ];

      const date = '2024-01-15T10:30:00Z';
      const from = 'sender@example.com';

      const hashes = await Promise.all(
        realWorldMessageIds.map(id => sha256(`${id}${date}${from}`))
      );

      // All should be valid
      hashes.forEach(hash => {
        expect(hash).toMatch(/^[a-f0-9]{64}$/);
      });

      // All should be different
      const uniqueHashes = new Set(hashes);
      expect(uniqueHashes.size).toBe(realWorldMessageIds.length);
    });

    it('should handle international characters in From field', async () => {
      const messageId = '<test@example.com>';
      const date = '2024-01-15T10:30:00Z';

      const internationalSenders = [
        '用户@example.cn',
        'user@例え.jp',
        'benötigter@example.de',
        'naïve@example.fr',
      ];

      const hashes = await Promise.all(
        internationalSenders.map(from => sha256(`${messageId}${date}${from}`))
      );

      // All should be valid
      hashes.forEach(hash => {
        expect(hash).toMatch(/^[a-f0-9]{64}$/);
      });

      // All should be different
      const uniqueHashes = new Set(hashes);
      expect(uniqueHashes.size).toBe(internationalSenders.length);
    });
  });
});

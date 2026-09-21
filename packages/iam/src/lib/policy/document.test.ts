import { describe, expect, it } from 'vitest';
import { fromApiDocument, toApiDocument } from './document';
import type { PolicyDocument } from './types';

describe('policy document mapping', () => {
  it('keeps sid and condition on the way out', () => {
    const document: PolicyDocument = {
      version: '2012-10-17',
      statements: [
        {
          sid: 'OfficeOnly',
          effect: 'Allow',
          action: ['s3:GetObject'],
          resource: ['arn:aws:s3:::bucket/*'],
          condition: { IpAddress: { 'aws:SourceIp': ['10.0.0.0/8'] } },
        },
      ],
    };

    expect(toApiDocument(document)).toEqual({
      Version: '2012-10-17',
      Statement: [
        {
          Sid: 'OfficeOnly',
          Effect: 'Allow',
          Action: ['s3:GetObject'],
          Resource: ['arn:aws:s3:::bucket/*'],
          Condition: { IpAddress: { 'aws:SourceIp': ['10.0.0.0/8'] } },
        },
      ],
    });
  });

  it('keeps sid and condition on the way in', () => {
    const parsed = fromApiDocument(
      JSON.stringify({
        Version: '2012-10-17',
        Statement: [
          {
            Sid: 'Expires',
            Effect: 'Allow',
            Action: 's3:GetObject',
            Resource: 'arn:aws:s3:::bucket/*',
            Condition: {
              DateLessThan: { 'aws:CurrentTime': '2030-01-01T00:00:00Z' },
            },
          },
        ],
      })
    );

    expect(parsed.statements[0].sid).toBe('Expires');
    expect(parsed.statements[0].condition).toEqual({
      DateLessThan: { 'aws:CurrentTime': '2030-01-01T00:00:00Z' },
    });
  });

  it('round-trips a document unchanged', () => {
    const document: PolicyDocument = {
      version: '2012-10-17',
      statements: [
        {
          sid: 'ListOnly',
          effect: 'Allow',
          action: 's3:ListBucket',
          resource: 'arn:aws:s3:::bucket',
          condition: { NotIpAddress: { 'aws:SourceIp': '192.0.2.0/24' } },
        },
      ],
    };

    expect(fromApiDocument(JSON.stringify(toApiDocument(document)))).toEqual(
      document
    );
  });

  it('omits sid and condition when absent', () => {
    const statement = toApiDocument({
      version: '2012-10-17',
      statements: [
        { effect: 'Deny', action: 's3:*', resource: 'arn:aws:s3:::bucket/*' },
      ],
    }).Statement[0];

    expect(statement).not.toHaveProperty('Sid');
    expect(statement).not.toHaveProperty('Condition');
  });

  it('accepts a single statement object', () => {
    const parsed = fromApiDocument(
      JSON.stringify({
        Version: '2012-10-17',
        Statement: {
          Effect: 'Allow',
          Action: 's3:GetObject',
          Resource: '*',
        },
      })
    );

    expect(parsed.statements).toHaveLength(1);
    expect(parsed.statements[0].effect).toBe('Allow');
  });
});

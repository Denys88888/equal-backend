import { describe, it, expect } from 'vitest';
import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { CreateClubDto, PostContentDto, TextContentDto } from './clubs.dto';

/** The same pipe main.ts installs globally. */
const pipe = new ValidationPipe({ whitelist: true, transform: true });
const run = (metatype: new () => object, body: unknown) => pipe.transform(body, { type: 'body', metatype });

describe('CreateClubDto', () => {
  const valid = { name: 'Warsaw Hikers', description: 'Weekend trails', category: 'Sports' };

  it('strips every field a user must not set on a club', async () => {
    const out = await run(CreateClubDto, {
      ...valid,
      memberCount: 99999,
      icon: 'https://evil.example/x.png',
      id: 'chosen-id',
      createdAt: '2000-01-01',
      status: 'ACTIVE',
      createdBy: 'someone-else',
    });

    for (const k of ['memberCount', 'icon', 'id', 'createdAt', 'status', 'createdBy']) {
      expect(out).not.toHaveProperty(k);
    }
    expect(out).toMatchObject(valid);
  });

  it('rejects a category the app has no card for', async () => {
    await expect(run(CreateClubDto, { ...valid, category: 'Casino' })).rejects.toThrow(BadRequestException);
  });

  it('rejects a name that is too short or too long', async () => {
    await expect(run(CreateClubDto, { ...valid, name: 'ab' })).rejects.toThrow(BadRequestException);
    await expect(run(CreateClubDto, { ...valid, name: 'x'.repeat(81) })).rejects.toThrow(BadRequestException);
  });
});

describe('club content DTOs', () => {
  it('turns a non-string comment into a 400 instead of a crash in .trim()', async () => {
    await expect(run(TextContentDto, { content: { $gt: '' } })).rejects.toThrow(BadRequestException);
    await expect(run(TextContentDto, { content: 42 })).rejects.toThrow(BadRequestException);
  });

  it('caps comment/message length', async () => {
    await expect(run(TextContentDto, { content: 'x'.repeat(2001) })).rejects.toThrow(BadRequestException);
    await expect(run(TextContentDto, { content: 'hello' })).resolves.toEqual({ content: 'hello' });
  });

  it('lets a post have no text (photo-only posts)', async () => {
    await expect(run(PostContentDto, {})).resolves.toEqual({});
    await expect(run(PostContentDto, { content: 'x'.repeat(5001) })).rejects.toThrow(BadRequestException);
  });
});

import { describe, it, expect } from 'vitest';
import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { CreateEventDto } from './events.dto';

/** The same pipe main.ts installs globally. */
const pipe = new ValidationPipe({ whitelist: true, transform: true });
const run = (body: unknown) => pipe.transform(body, { type: 'body', metatype: CreateEventDto });

const valid = {
  title: 'Board games night',
  date: new Date(Date.now() + 86400000).toISOString(),
  location: 'Cafe Nero',
  city: 'Warsaw',
  category: 'Parties',
};

describe('CreateEventDto', () => {
  it('strips everything a user must not set: price, status, featured, author', async () => {
    const out = await run({ ...valid, price: 99, status: 'ACTIVE', featured: true, createdBy: 'someone' });

    // These reach the service only if the DTO declares them — it must not.
    expect(out).not.toHaveProperty('price');
    expect(out).not.toHaveProperty('status');
    expect(out).not.toHaveProperty('featured');
    expect(out).not.toHaveProperty('createdBy');
  });

  it('accepts a well-formed event', async () => {
    await expect(run(valid)).resolves.toMatchObject({ title: 'Board games night', category: 'Parties' });
  });

  it('rejects a category the Events screen cannot filter by', async () => {
    await expect(run({ ...valid, category: 'Casino' })).rejects.toThrow(BadRequestException);
  });

  it('rejects a missing location and a too-short title', async () => {
    const { location: _omit, ...noLocation } = valid;
    await expect(run(noLocation)).rejects.toThrow(BadRequestException);
    await expect(run({ ...valid, title: 'ab' })).rejects.toThrow(BadRequestException);
  });

  it('rejects a date that is not a date', async () => {
    await expect(run({ ...valid, date: 'next friday' })).rejects.toThrow(BadRequestException);
  });
});

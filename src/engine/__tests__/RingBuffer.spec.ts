import { expect, test, describe } from 'vitest';
import { RingBuffer } from '../debug/RingBuffer';

describe('RingBuffer', () => {
  test('handles basic pushing and counting', () => {
    const buf = new RingBuffer(5);
    expect(buf.getCount()).toBe(0);

    buf.push(10);
    expect(buf.getCount()).toBe(1);
    expect(buf.getHeadIndex()).toBe(1);

    const arr = buf.toArray();
    expect(arr.length).toBe(1);
    expect(arr[0]).toBe(10);
  });

  test('handles capacity rollover without reallocation', () => {
    const buf = new RingBuffer(3);
    buf.push(1);
    buf.push(2);
    buf.push(3);
    expect(buf.getCount()).toBe(3);
    expect(Array.from(buf.toArray())).toEqual([1, 2, 3]);

    buf.push(4); // pushes out 1
    expect(buf.getCount()).toBe(3);
    // Tail should now be 1, Head should be 1
    expect(buf.getTailIndex()).toBe(1);
    expect(buf.getHeadIndex()).toBe(1);
    expect(Array.from(buf.toArray())).toEqual([2, 3, 4]);

    buf.push(5); // pushes out 2
    expect(Array.from(buf.toArray())).toEqual([3, 4, 5]);
  });
});

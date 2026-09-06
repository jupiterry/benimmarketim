import test from 'node:test';
import assert from 'node:assert/strict';
import Coupon from '../models/coupon.model.js';
import Order from '../models/order.model.js';
import { getCoupon } from '../controllers/coupon.controller.js';

test('Wallet hides first-order and exhausted coupons while keeping audit records', async (t) => {
  const coupons = [
    new Coupon({ code: 'FIRST', firstOrderOnly: true, expirationDate: new Date(Date.now() + 86400000) }),
    new Coupon({ code: 'GLOBAL', usageLimit: 1, usageCount: 1, expirationDate: new Date(Date.now() + 86400000) }),
    new Coupon({ code: 'USED', usedBy: [{ user: '507f1f77bcf86cd799439011' }], expirationDate: new Date(Date.now() + 86400000) }),
    new Coupon({ code: 'AVAILABLE', expirationDate: new Date(Date.now() + 86400000) }),
  ];
  t.mock.method(Coupon, 'find', () => ({ sort: async () => coupons }));
  const exists = t.mock.method(Order, 'exists', async () => ({ _id: 'order' }));
  let result;
  const res = { json: (body) => { result = body; }, status: () => res };
  await getCoupon({ user: { _id: '507f1f77bcf86cd799439011' } }, res);
  assert.deepEqual(result.coupons.map((coupon) => coupon.code), ['AVAILABLE']);
  assert.equal(coupons[2].usedBy.length, 1);
  exists.mock.mockImplementation(async () => null);
  await getCoupon({ user: { _id: '507f1f77bcf86cd799439011' } }, res);
  assert.deepEqual(result.coupons.map((coupon) => coupon.code), ['FIRST', 'AVAILABLE']);
});

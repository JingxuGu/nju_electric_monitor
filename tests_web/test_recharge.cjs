const {test} = require("node:test");
const assert = require("node:assert/strict");
const {calculateRecharge} = require("../src/static/dashboard.js");

test("recharge deducts current balance and rounds up to ten yuan", () => {
  const plan = calculateRecharge({balance: 100, average: 10, price: 0.5, days: 30});
  assert.equal(plan.amount, 100);
  assert.ok(Math.abs(plan.days - 30) < 1e-10);
});

test("sufficient balance requires no recharge", () => {
  assert.deepEqual(calculateRecharge({balance: 200, average: 10, price: 0.5, days: 10}), {amount: 0, days: 20});
});

test("changing tariff affects cost and outstanding balance is included", () => {
  assert.deepEqual(calculateRecharge({balance: 0, average: 10, price: 0.8, days: 30}), {amount: 240, days: 30});
  assert.deepEqual(calculateRecharge({balance: -20, average: 10, price: 0.5, days: 2}), {amount: 20, days: 2});
});

test("floating point noise does not add an extra ten yuan", () => {
  const plan = calculateRecharge({balance: 0, average: 7, price: 0.1 + 0.2, days: 100});
  assert.equal(plan.amount, 210);
  assert.ok(Math.abs(plan.days - 100) < 1e-10);
});

test("missing observations and invalid inputs cannot produce advice", () => {
  const base = {balance: 100, average: 10, price: 0.5, days: 30};
  for (const change of [
    {balance: null}, {balance: Infinity}, {average: null}, {average: 0},
    {price: 0}, {price: -1}, {price: NaN}, {price: 101},
    {days: 0}, {days: 30.5}, {days: 366}, {days: NaN},
  ]) assert.equal(calculateRecharge({...base, ...change}), null);
});

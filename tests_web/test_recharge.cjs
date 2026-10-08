const {test} = require("node:test");
const assert = require("node:assert/strict");
const {calculateRecharge} = require("../src/static/dashboard.js");
test("purchase ignores existing balance and does not round to ten yuan", () => {
 for (const balance of [0,449,-20,10000,null]) {
  assert.deepEqual(calculateRecharge({balance,average:7.25,price:0.5,days:30}),{amount:108.75,days:30});
 }
});
test("price changes cost, duration counts only new electricity", () => {
 assert.deepEqual(calculateRecharge({average:10,price:0.8,days:30}),{amount:240,days:30});
});
test("currency rounds to cents and duration uses that amount", () => {
 const plan=calculateRecharge({average:7.123,price:0.5,days:30});
 assert.equal(plan.amount,106.85);
 assert.ok(Math.abs(plan.days-106.85/0.5/7.123)<1e-10);
 assert.equal(calculateRecharge({average:7,price:0.1+0.2,days:100}).amount,210);
});
test("invalid inputs do not produce advice", () => {
 const base={average:10,price:0.5,days:30};
 for(const change of [{average:null},{average:0},{average:Infinity},{price:0},{price:-1},{price:NaN},{price:101},{days:0},{days:30.5},{days:366},{days:NaN}])
 assert.equal(calculateRecharge({...base,...change}),null);
});

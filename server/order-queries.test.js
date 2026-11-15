const assert = require("node:assert/strict");
const { test } = require("node:test");
const DatabaseService = require("./database");

/**
 * "One page, a dozen calls — twice" (investigation I3) tells students how
 * many database calls an order makes: seven that never change, plus one per
 * cart item. Its answer key is written from that shape, so this pins it:
 * if createOrder starts looping differently, or batches the item inserts,
 * the checkpoint's numbers need updating (angular-app/src/app/services/
 * investigations.ts, slug one-page-a-dozen-calls).
 *
 * createOrder itself issues BEGIN, the customer select and update, the order
 * insert, one insert per item and COMMIT. The route adds two reads before it
 * (the restaurant, then its menu items) to validate the cart, which is what
 * makes the per-item lookup by name unnecessary.
 */
function fakeDatabase() {
  const statements = [];
  const db = new DatabaseService();
  db.isConnected = true;
  db.client = {
    async query(sql) {
      statements.push(String(sql).replace(/\s+/g, " ").trim());
      return {
        rows: [
          {
            id: "row-id",
            order_number: "ORDER-1",
            status: "pending",
            total_amount: 10,
            created_at: new Date(),
          },
        ],
      };
    },
  };
  return { db, statements };
}

function cart(lines, { withIds = true } = {}) {
  return {
    deliverTo: { name: "OU-TEST", phone: "(503) 555-0100", address: "1 Test St" },
    restaurant: { id: "restaurant-a" },
    items: Array.from({ length: lines }, (_, i) => ({
      ...(withIds ? { id: `item-${i}` } : {}),
      name: `Item ${i}`,
      price: 5,
      qty: 1,
    })),
    total: 5 * lines,
  };
}

test("an order runs five calls plus one insert per cart item", async () => {
  for (const lines of [1, 2, 4]) {
    const { db, statements } = fakeDatabase();
    await db.createOrder(cart(lines));
    assert.equal(statements.length, 5 + lines, `${lines} item(s)`);
  }
});

test("the per-item calls are the order-item inserts, and nothing else repeats", async () => {
  const { db, statements } = fakeDatabase();
  await db.createOrder(cart(4));

  assert.deepEqual(statements.slice(0, 1), ["BEGIN"]);
  assert.equal(statements.at(-1), "COMMIT");
  assert.equal(statements.filter((sql) => /INSERT INTO order_items/.test(sql)).length, 4);
  assert.equal(statements.filter((sql) => /INSERT INTO orders\b/.test(sql)).length, 1);
  assert.equal(statements.filter((sql) => /FROM customers/.test(sql)).length, 1);
  assert.equal(statements.filter((sql) => /UPDATE customers/.test(sql)).length, 1);
  assert.equal(statements.filter((sql) => /FROM menu_items/.test(sql)).length, 0);
});

test("with the route's two validation reads, a 4-item order is eleven calls", async () => {
  const { db, statements } = fakeDatabase();
  await db.createOrder(cart(4));
  const routeReads = 2; // getRestaurantById: the restaurant, then its menu items
  assert.equal(routeReads + statements.length, 11);
});

test("items sent without an id are looked up by name, which doubles the loop", async () => {
  const { db, statements } = fakeDatabase();
  await db.createOrder(cart(4, { withIds: false }));
  assert.equal(statements.filter((sql) => /FROM menu_items/.test(sql)).length, 4);
  assert.equal(statements.length, 5 + 4 * 2);
});

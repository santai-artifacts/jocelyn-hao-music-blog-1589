import { Hono } from "hono";
import { cors } from "hono/cors";
import Database from "bun:sqlite";
import { readFileSync } from "fs";

const db = new Database(process.env.DATABASE_URL || "./data/app.db");

db.exec(`
  CREATE TABLE IF NOT EXISTS reviews (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    song TEXT NOT NULL,
    artist TEXT NOT NULL,
    album TEXT,
    genre TEXT,
    rating INTEGER NOT NULL CHECK(rating >= 1 AND rating <= 5),
    body TEXT NOT NULL,
    reviewer TEXT NOT NULL DEFAULT 'Anonymous',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )
`);

// Seed some initial reviews
const count = db.prepare("SELECT COUNT(*) as c FROM reviews").get() as { c: number };
if (count.c === 0) {
  const insert = db.prepare(
    `INSERT INTO reviews (song, artist, album, genre, rating, body, reviewer) VALUES (?, ?, ?, ?, ?, ?, ?)`
  );
  const seeds = [
    ["Bohemian Rhapsody", "Queen", "A Night at the Opera", "Rock", 5, "An absolute masterpiece that defies genre. Freddie Mercury's vocal range and the operatic middle section still give me chills decades later. There's nothing else like it.", "Jamie L."],
    ["Blinding Lights", "The Weeknd", "After Hours", "Synth-pop", 5, "The 80s-inspired synth production is intoxicating. Abel's falsetto is at its peak here and the driving energy never lets up. Easily one of the best pop songs of the decade.", "Marcus T."],
    ["Redbone", "Childish Gambino", "Awaken, My Love!", "R&B/Soul", 5, "Donald Glover fully embodied the spirit of 70s funk and soul here. The slowed-down groove is hypnotic, and the falsetto is utterly intoxicating. Pure magic.", "Priya S."],
    ["Motion Picture Soundtrack", "Radiohead", "Kid A", "Art Rock", 4, "A devastatingly beautiful closer. Thom Yorke's vocals feel ghostly and distant in the best possible way. It's a fragile, heartbreaking send-off to the album.", "Alex R."],
    ["Peaches", "Justin Bieber", "Justice", "Pop", 2, "Inoffensive and breezy but completely forgettable. It floats in one ear and out the other. Not bad, just utterly weightless — a midsummer daydream you forget by noon.", "Sam W."],
  ];
  for (const s of seeds) insert.run(...(s as Parameters<typeof insert.run>));
}

const app = new Hono();
app.use("*", cors());

// API routes
app.get("/api/reviews", (c) => {
  const { genre, sort } = c.req.query();
  let query = "SELECT * FROM reviews";
  const params: string[] = [];
  if (genre && genre !== "all") {
    query += " WHERE genre = ?";
    params.push(genre);
  }
  if (sort === "rating_desc") query += " ORDER BY rating DESC, created_at DESC";
  else if (sort === "rating_asc") query += " ORDER BY rating ASC, created_at DESC";
  else query += " ORDER BY created_at DESC";
  const rows = db.prepare(query).all(...params);
  return c.json(rows);
});

app.get("/api/reviews/:id", (c) => {
  const row = db.prepare("SELECT * FROM reviews WHERE id = ?").get(c.req.param("id"));
  if (!row) return c.json({ error: "Not found" }, 404);
  return c.json(row);
});

app.post("/api/reviews", async (c) => {
  const body = await c.req.json();
  const { song, artist, album, genre, rating, review_body, reviewer } = body;
  if (!song || !artist || !rating || !review_body) {
    return c.json({ error: "Missing required fields" }, 400);
  }
  const r = parseInt(rating);
  if (r < 1 || r > 5) return c.json({ error: "Rating must be 1–5" }, 400);
  const result = db
    .prepare(
      `INSERT INTO reviews (song, artist, album, genre, rating, body, reviewer)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(song, artist, album || null, genre || null, r, review_body, reviewer || "Anonymous");
  const created = db.prepare("SELECT * FROM reviews WHERE id = ?").get(result.lastInsertRowid);
  return c.json(created, 201);
});

app.delete("/api/reviews/:id", (c) => {
  db.prepare("DELETE FROM reviews WHERE id = ?").run(c.req.param("id"));
  return c.json({ ok: true });
});

app.get("/api/genres", (c) => {
  const rows = db.prepare("SELECT DISTINCT genre FROM reviews WHERE genre IS NOT NULL ORDER BY genre").all() as { genre: string }[];
  return c.json(rows.map((r) => r.genre));
});

// Serve frontend
app.get("*", (c) => {
  const html = readFileSync(`${import.meta.dir}/public/index.html`, "utf-8");
  return new Response(html, { headers: { "Content-Type": "text/html" } });
});

export default { port: process.env.PORT || 3000, fetch: app.fetch };

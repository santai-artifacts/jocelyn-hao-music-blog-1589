const express = require("express");
const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs");

const dataDir = path.join(__dirname, "data");
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(process.env.DATABASE_URL || path.join(dataDir, "app.db"));

db.exec(`
  CREATE TABLE IF NOT EXISTS reviews (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    review_type TEXT NOT NULL DEFAULT 'song',
    song TEXT,
    artist TEXT NOT NULL,
    album TEXT,
    genre TEXT,
    rating INTEGER NOT NULL CHECK(rating >= 1 AND rating <= 5),
    body TEXT NOT NULL,
    reviewer TEXT NOT NULL DEFAULT 'Anonymous',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )
`);

// Migration: add review_type column if upgrading from old schema
try { db.exec(`ALTER TABLE reviews ADD COLUMN review_type TEXT NOT NULL DEFAULT 'song'`); } catch(_) {}

// Seed data
const count = db.prepare("SELECT COUNT(*) as c FROM reviews").get();
if (count.c === 0) {
  const ins = db.prepare(
    `INSERT INTO reviews (review_type, song, artist, album, genre, rating, body, reviewer) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  );
  [
    // Song reviews
    ['song', 'Bohemian Rhapsody',       'Queen',            'A Night at the Opera', 'Rock',      5, "An absolute masterpiece that defies genre. Freddie Mercury's vocal range and the operatic middle section still give me chills decades later. There's nothing else like it.", "Jamie L."],
    ['song', "You're My Best Friend",   'Queen',            'A Night at the Opera', 'Rock',      4, "A bubbly, joyful contrast to the heavier tracks. The electric piano riff is irresistible and it never outstays its welcome. Pure feel-good energy.", "Marcus T."],
    ['song', 'Blinding Lights',         'The Weeknd',       'After Hours',          'Synth-pop', 5, "The 80s-inspired synth production is intoxicating. Abel's falsetto is at its peak here and the driving energy never lets up. Easily one of the best pop songs of the decade.", "Priya S."],
    ['song', 'In Your Eyes',            'The Weeknd',       'After Hours',          'Synth-pop', 4, "A gorgeous slow-burn closer. The saxophone breakdown is unexpected and totally works. Feels like watching the credits roll on a noir film.", "Alex R."],
    ['song', 'Redbone',                 'Childish Gambino', "Awaken, My Love!",     'R&B/Soul',  5, "Donald Glover fully embodied the spirit of 70s funk and soul. The slowed-down groove is hypnotic and the falsetto is utterly intoxicating.", "Sam W."],
    ['song', 'Motion Picture Soundtrack','Radiohead',       'Kid A',                'Art Rock',  5, "A devastatingly beautiful closer. Thom Yorke's vocals feel ghostly and distant in the best possible way. Fragile and heartbreaking.", "Chris M."],
    // Album reviews
    ['album', null, 'Queen',            'A Night at the Opera', 'Rock',      5, "A breathtaking leap in ambition. Every track feels intentional, and the sequencing is impeccable. Bohemian Rhapsody alone would make this legendary, but every song earns its place. A perfect album from start to finish.", "Tara K."],
    ['album', null, 'The Weeknd',       'After Hours',          'Synth-pop', 4, "The Weeknd's most cohesive record. It commits fully to a moody 80s aesthetic and never breaks character. A few tracks drag in the middle but the highs are extraordinary. Blinding Lights and In Your Eyes alone justify the purchase.", "Jamie L."],
    ['album', null, 'Childish Gambino', "Awaken, My Love!",     'R&B/Soul',  5, "A stunning reinvention. Abandoning rap entirely, Glover channels Parliament-Funkadelic and delivers something timeless. Every track feels alive and purposeful. One of the boldest genre pivots in recent memory.", "Alex R."],
  ].forEach(row => ins.run(...row));
}

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

app.get("/api/reviews", (req, res) => {
  const { genre, sort } = req.query;
  let query = "SELECT * FROM reviews";
  const params = [];
  if (genre && genre !== "all") {
    query += " WHERE genre = ?";
    params.push(genre);
  }
  if (sort === "rating_desc") query += " ORDER BY rating DESC, created_at DESC";
  else if (sort === "rating_asc") query += " ORDER BY rating ASC, created_at DESC";
  else query += " ORDER BY created_at DESC";
  res.json(db.prepare(query).all(...params));
});

app.get("/api/reviews/:id", (req, res) => {
  const row = db.prepare("SELECT * FROM reviews WHERE id = ?").get(req.params.id);
  if (!row) return res.status(404).json({ error: "Not found" });
  res.json(row);
});

app.post("/api/reviews", (req, res) => {
  const { review_type, song, artist, album, genre, rating, review_body, reviewer } = req.body;
  const type = review_type === "album" ? "album" : "song";
  if (type === "song" && !song) return res.status(400).json({ error: "Song title required for song reviews" });
  if (!artist || !rating || !review_body) return res.status(400).json({ error: "Missing required fields" });
  const r = parseInt(rating);
  if (r < 1 || r > 5) return res.status(400).json({ error: "Rating must be 1–5" });
  const result = db.prepare(
    `INSERT INTO reviews (review_type, song, artist, album, genre, rating, body, reviewer) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(type, song || null, artist, album || null, genre || null, r, review_body, reviewer || "Anonymous");
  res.status(201).json(db.prepare("SELECT * FROM reviews WHERE id = ?").get(result.lastInsertRowid));
});

app.delete("/api/reviews/:id", (req, res) => {
  db.prepare("DELETE FROM reviews WHERE id = ?").run(req.params.id);
  res.json({ ok: true });
});

app.get("/api/genres", (req, res) => {
  const rows = db.prepare("SELECT DISTINCT genre FROM reviews WHERE genre IS NOT NULL ORDER BY genre").all();
  res.json(rows.map(r => r.genre));
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => console.log(`Groove running on port ${PORT}`));

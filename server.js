const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcrypt');
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();
const port = 3000;
const db = new sqlite3.Database('./database.db');

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE,
      email TEXT UNIQUE,
      password_hash TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS subjects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS posts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT,
      content TEXT,
      author TEXT,
      subject_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(subject_id) REFERENCES subjects(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS replies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      post_id INTEGER,
      content TEXT,
      author TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(post_id) REFERENCES posts(id)
    )
  `);

  const defaultSubjects = ['Mathematics', 'Science', 'History', 'English', 'Programming', 'Other'];
  db.get("SELECT COUNT(*) as count FROM subjects", (err, row) => {
    if (row.count === 0) {
      const stmt = db.prepare("INSERT INTO subjects (name) VALUES (?)");
      defaultSubjects.forEach(name => stmt.run(name));
      stmt.finalize();
    }
  });
});

app.get('/api/subjects', (req, res) => {
  db.all('SELECT * FROM subjects', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.get('/api/posts', (req, res) => {
  const { subject_id, sort } = req.query;
  let query = 'SELECT * FROM posts';
  const params = [];

  if (subject_id) {
    query += ' WHERE subject_id = ?';
    params.push(subject_id);
  }

  if (sort === 'new') {
    query += ' ORDER BY created_at DESC';
  } else if (sort === 'top') {
    query += ' ORDER BY (SELECT COUNT(*) FROM replies WHERE replies.post_id = posts.id) DESC';
  }

  db.all(query, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.post('/api/posts', (req, res) => {
  const { title, content, author, subject_id } = req.body;
  db.run(
    'INSERT INTO posts (title, content, author, subject_id) VALUES (?, ?, ?, ?)',
    [title, content, author, subject_id],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ id: this.lastID });
    }
  );
});

app.get('/api/posts/:id/replies', (req, res) => {
  db.all(
    'SELECT * FROM replies WHERE post_id = ? ORDER BY created_at',
    [req.params.id],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows);
    }
  );
});

app.post('/api/posts/:id/replies', (req, res) => {
  const { content, author } = req.body;
  db.run(
    'INSERT INTO replies (post_id, content, author) VALUES (?, ?, ?)',
    [req.params.id, content, author],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ id: this.lastID });
    }
  );
});

app.post('/api/register', async (req, res) => {
  const { username, email, password } = req.body;
  
  if (!username || !email || !password) {
    return res.status(400).json({ error: 'All fields are required' });
  }

  try {
    const passwordHash = await bcrypt.hash(password, 10);
    db.run(
      'INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)',
      [username, email, passwordHash],
      function(err) {
        if (err) {
          if (err.message.includes('UNIQUE constraint failed')) {
            return res.status(400).json({ error: 'Username or email already exists' });
          }
          return res.status(500).json({ error: err.message });
        }
        res.json({ id: this.lastID });
      }
    );
  } catch (error) {
    res.status(500).json({ error: 'Registration failed' });
  }
});

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }

  db.get('SELECT * FROM users WHERE username = ?', [username], async (err, user) => {
    if (err || !user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    try {
      const valid = await bcrypt.compare(password, user.password_hash);
      if (!valid) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      const { password_hash, ...userData } = user;
      res.json(userData);
    } catch (error) {
      res.status(500).json({ error: 'Login failed' });
    }
  });
});

app.listen(port, '0.0.0.0', () => {
  console.log(`Server running at http://localhost:${port}`);
});


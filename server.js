const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcrypt');
const cors = require('cors');
const bodyParser = require('body-parser');
const { body, validationResult } = require('express-validator');

const app = express();
const port = 3000;
const db = new sqlite3.Database('./database.db');

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// Input validation middleware
const validateUsername = body('username')
    .trim()
    .isLength({ min: 3, max: 20 })
    .withMessage('Username must be between 3 and 20 characters')
    .matches(/^[a-zA-Z0-9_]+$/)
    .withMessage('Username can only contain letters, numbers, and underscores');

const validatePassword = body('password')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters');

const validateEmail = body('email')
    .isEmail()
    .withMessage('Invalid email address');

const validatePostTitle = body('title')
    .trim()
    .isLength({ min: 3, max: 100 })
    .withMessage('Title must be between 3 and 100 characters');

const validatePostContent = body('content')
    .trim()
    .isLength({ min: 10 })
    .withMessage('Content must be at least 10 characters');

db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE,
        email TEXT UNIQUE,
        password_hash TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    
    db.run(`CREATE TABLE IF NOT EXISTS subjects (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE
    )`);
    
    db.run(`CREATE TABLE IF NOT EXISTS posts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT,
        content TEXT,
        author TEXT,
        subject_id INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(subject_id) REFERENCES subjects(id)
    )`);
    
    db.run(`CREATE TABLE IF NOT EXISTS replies (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        post_id INTEGER,
        content TEXT,
        author TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(post_id) REFERENCES posts(id)
    )`);
    
    const defaultSubjects = ['English', 'Mathematics', 'Science', 'Other'];
    db.get("SELECT COUNT(*) as count FROM subjects", (err, row) => {
        if (row.count === 0) {
            const stmt = db.prepare("INSERT INTO subjects (name) VALUES (?)");
            defaultSubjects.forEach(name => stmt.run(name));
            stmt.finalize();
        }
    });
});

// Helper function to safely execute SQL queries
function dbAll(query, params) {
    return new Promise((resolve, reject) => {
        db.all(query, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
}

function dbGet(query, params) {
    return new Promise((resolve, reject) => {
        db.get(query, params, (err, row) => {
            if (err) reject(err);
            else resolve(row);
        });
    });
}

function dbRun(query, params) {
    return new Promise((resolve, reject) => {
        db.run(query, params, function(err) {
            if (err) reject(err);
            else resolve(this);
        });
    });
}

app.get('/api/subjects', async (req, res) => {
    try {
        const rows = await dbAll('SELECT * FROM subjects', []);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/posts', async (req, res) => {
    try {
        const { subject_id, sort, search, user } = req.query;
        let query = 'SELECT p.*, COUNT(r.id) as reply_count FROM posts p LEFT JOIN replies r ON p.id = r.post_id';
        const params = [];
        const conditions = [];

        if (subject_id) {
            conditions.push('p.subject_id = ?');
            params.push(subject_id);
        }

        if (search) {
            conditions.push('(p.title LIKE ? OR p.content LIKE ?)');
            params.push(`%${search}%`, `%${search}%`);
        }

        if (user) {
            conditions.push('p.author = ?');
            params.push(user);
        }

        if (conditions.length) {
            query += ' WHERE ' + conditions.join(' AND ');
        }

        query += ' GROUP BY p.id';

        if (sort === 'top') {
            query += ' ORDER BY reply_count DESC';
        } else {
            query += ' ORDER BY p.created_at DESC';
        }

        const rows = await dbAll(query, params);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/posts/:id', async (req, res) => {
    try {
        const row = await dbGet('SELECT * FROM posts WHERE id = ?', [req.params.id]);
        if (!row) return res.status(404).json({ error: 'Post not found' });
        res.json(row);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/posts/:id/replies', async (req, res) => {
    try {
        const rows = await dbAll('SELECT * FROM replies WHERE post_id = ? ORDER BY created_at', [req.params.id]);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/replies', async (req, res) => {
    try {
        const { user } = req.query;
        let query = 'SELECT * FROM replies';
        const params = [];

        if (user) {
            query += ' WHERE author = ?';
            params.push(user);
        }

        const rows = await dbAll(query, params);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/posts', async (req, res) => {
  try {
    const { title, content, author, subject_id } = req.body;
    
    // Enhanced validation
    if (!title || !content || !author || !subject_id) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const subjectId = parseInt(subject_id);
    if (isNaN(subjectId)) {
      return res.status(400).json({ error: 'Invalid subject ID' });
    }

    const result = await dbRun(
      'INSERT INTO posts (title, content, author, subject_id) VALUES (?, ?, ?, ?)',
      [title, content, author, subjectId]
    );
    
    res.json({ id: result.lastID });
  } catch (err) {
    console.error('Post creation error:', err);
    res.status(500).json({ 
      error: 'Failed to create post',
      details: err.message 
    });
  }
});

app.post('/api/posts/:id/replies', [
    body('content').trim().isLength({ min: 1 }).withMessage('Content is required')
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    try {
        const { content, author } = req.body;
        const result = await dbRun(
            'INSERT INTO replies (post_id, content, author) VALUES (?, ?, ?)',
            [req.params.id, content, author]
        );
        res.json({ id: result.lastID });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/posts/:id', async (req, res) => {
    try {
        await dbRun('DELETE FROM posts WHERE id = ?', [req.params.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/replies/:id', async (req, res) => {
    try {
        await dbRun('DELETE FROM replies WHERE id = ?', [req.params.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/register', [
    validateUsername,
    validateEmail,
    validatePassword
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    try {
        const { username, email, password } = req.body;
        const passwordHash = await bcrypt.hash(password, 10);
        
        try {
            const result = await dbRun(
                'INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)',
                [username, email, passwordHash]
            );
            res.json({ id: result.lastID });
        } catch (err) {
            if (err.message.includes('UNIQUE constraint failed')) {
                res.status(400).json({ error: 'Username or email already exists' });
            } else {
                throw err;
            }
        }
    } catch (err) {
        res.status(500).json({ error: 'Registration failed' });
    }
});

app.post('/api/login', [
    body('username').trim().notEmpty().withMessage('Username is required'),
    body('password').notEmpty().withMessage('Password is required')
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    try {
        const { username, password } = req.body;
        const user = await dbGet('SELECT * FROM users WHERE username = ?', [username]);
        
        if (!user) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const valid = await bcrypt.compare(password, user.password_hash);
        if (!valid) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const { password_hash, ...userData } = user;
        res.json(userData);
    } catch (err) {
        res.status(500).json({ error: 'Login failed' });
    }
});

app.listen(port, '0.0.0.0', () => {
    console.log(`Server running at http://localhost:${port}`);
});
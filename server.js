const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcrypt');
const cors = require('cors');
const bodyParser = require('body-parser');
const fs = require('fs'); // Import the file system module

const app = express();
const port = 3000;
const dbPath = './database.db'; // Define the database path

// --- FOR DEBUGGING ONLY: Force delete database on startup (keep this commented out) ---
/*
if (fs.existsSync(dbPath)) {
    console.log(`[DEBUG] Deleting existing database: ${dbPath}`);
    try {
        fs.unlinkSync(dbPath);
        console.log('[DEBUG] Database deleted successfully.');
    } catch (err) {
        console.error('[DEBUG] Error deleting database:', err);
    }
}
*/
// --- END DEBUG BLOCK ---

const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error opening database:', err.message);
    } else {
        console.log('Connected to the SQLite database.');
    }
});

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

db.serialize(() => {
    console.log('[DB Setup] Starting database schema initialization...');

    // CREATE TABLE IF NOT EXISTS users
    db.run(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE,
            email TEXT UNIQUE,
            password_hash TEXT,
            isAdmin BOOLEAN DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `, (err) => {
        if (err) {
            console.error('[DB Setup] Error creating users table:', err.message);
        } else {
            console.log('[DB Setup] Users table checked/created.');
        }
    });

    // CREATE TABLE IF NOT EXISTS subjects
    db.run(`
        CREATE TABLE IF NOT EXISTS subjects (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT UNIQUE
        )
    `, (err) => {
        if (err) {
            console.error('[DB Setup] Error creating subjects table:', err.message);
        } else {
            console.log('[DB Setup] Subjects table checked/created.');
        }
    });

    // CREATE TABLE IF NOT EXISTS posts
    db.run(`
        CREATE TABLE IF NOT EXISTS posts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT,
            content TEXT,
            author TEXT,
            author_id INTEGER,
            subject_id INTEGER,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(subject_id) REFERENCES subjects(id),
            FOREIGN KEY(author_id) REFERENCES users(id)
        )
    `, (err) => {
        if (err) {
            console.error('[DB Setup] Error creating posts table:', err.message);
        } else {
            console.log('[DB Setup] Posts table checked/created.');
        }
    });

    // CREATE TABLE IF NOT EXISTS replies
    db.run(`
        CREATE TABLE IF NOT EXISTS replies (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            post_id INTEGER,
            content TEXT,
            author TEXT,
            author_id INTEGER,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(post_id) REFERENCES posts(id),
            FOREIGN KEY(author_id) REFERENCES users(id)
        )
    `, (err) => {
        if (err) {
            console.error('[DB Setup] Error creating replies table:', err.message);
        } else {
            console.log('[DB Setup] Replies table checked/created.');
        }
    });


    // Check if isAdmin column exists and add it if not (for existing databases)
    // *** MODIFIED: Using db.all instead of db.get for PRAGMA table_info ***
    db.all("PRAGMA table_info(users)", (err, columns) => {
        if (err) {
            console.error("[DB Setup] Error checking table info for users (PRAGMA):", err.message);
            return;
        }

        if (Array.isArray(columns)) {
            console.log('[DB Setup] PRAGMA table_info(users) returned an array. Columns:', columns.map(col => col.name));
            const hasIsAdmin = columns.some(col => col.name === 'isAdmin');
            if (!hasIsAdmin) {
                console.log("[DB Setup] 'isAdmin' column not found in 'users' table. Attempting to add...");
                db.run("ALTER TABLE users ADD COLUMN isAdmin BOOLEAN DEFAULT 0", (alterErr) => {
                    if (alterErr) {
                        console.error("[DB Setup] Error adding isAdmin column to users:", alterErr.message);
                    } else {
                        console.log("[DB Setup] Successfully added 'isAdmin' column to 'users' table.");
                    }
                });
            } else {
                console.log("[DB Setup] 'isAdmin' column already exists in 'users' table.");
            }
        } else {
            // This 'else' block should ideally not be hit with db.all
            console.warn("PRAGMA table_info(users) did not return an array for columns. Skipping isAdmin column check.");
            console.warn("This might indicate a deeper issue with the database access or a corrupted table.");
        }
    });

    // Check if author_id columns exist and add them to posts
    // *** MODIFIED: Using db.all instead of db.get for PRAGMA table_info ***
    db.all("PRAGMA table_info(posts)", (err, columns) => {
        if (err) {
            console.error("[DB Setup] Error checking table info for posts (PRAGMA):", err.message);
            return;
        }
        if (Array.isArray(columns) && !columns.some(col => col.name === 'author_id')) {
            console.log("[DB Setup] 'author_id' column not found in 'posts' table. Attempting to add...");
            db.run("ALTER TABLE posts ADD COLUMN author_id INTEGER", (alterErr) => {
                if (alterErr) console.error("[DB Setup] Error adding author_id to posts:", alterErr.message);
                else console.log("[DB Setup] Successfully added 'author_id' column to 'posts' table.");
            });
        } else if (Array.isArray(columns)) {
             console.log("[DB Setup] 'author_id' column already exists in 'posts' table.");
        }
    });

    // Check if author_id columns exist and add them to replies
    // *** MODIFIED: Using db.all instead of db.get for PRAGMA table_info ***
    db.all("PRAGMA table_info(replies)", (err, columns) => {
        if (err) {
            console.error("[DB Setup] Error checking table info for replies (PRAGMA):", err.message);
            return;
        }
        if (Array.isArray(columns) && !columns.some(col => col.name === 'author_id')) {
            console.log("[DB Setup] 'author_id' column not found in 'replies' table. Attempting to add...");
            db.run("ALTER TABLE replies ADD COLUMN author_id INTEGER", (alterErr) => {
                if (alterErr) console.error("[DB Setup] Error adding author_id to replies:", alterErr.message);
                else console.log("[DB Setup] Successfully added 'author_id' column to 'replies' table.");
            });
        } else if (Array.isArray(columns)) {
             console.log("[DB Setup] 'author_id' column already exists in 'replies' table.");
        }
    });


    const defaultSubjects = ['Mathematics', 'Science', 'History', 'English', 'Programming', 'Other'];
    db.get("SELECT COUNT(*) as count FROM subjects", (err, row) => {
        if (err) {
            console.error("[DB Setup] Error counting subjects:", err.message);
            return;
        }
        if (row && row.count === 0) {
            console.log("[DB Setup] Inserting default subjects...");
            const stmt = db.prepare("INSERT INTO subjects (name) VALUES (?)");
            defaultSubjects.forEach(name => stmt.run(name));
            stmt.finalize(() => {
                console.log("[DB Setup] Default subjects inserted.");
            });
        } else if (row) {
            console.log(`[DB Setup] ${row.count} subjects already exist.`);
        }
    });
    console.log('[DB Setup] Finished database schema initialization commands.');
});

// --- Authentication Middleware ---
const authenticateUser = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    if (!authHeader) {
        return res.status(401).json({ error: 'Authentication required' });
    }

    const token = authHeader.split(' ')[1]; // Expects "Bearer <encoded_user_json>"
    if (!token) {
        return res.status(401).json({ error: 'Authentication token missing' });
    }

    try {
        const user = JSON.parse(decodeURIComponent(token));
        if (!user || !user.id || !user.username) {
            return res.status(401).json({ error: 'Invalid authentication token data' });
        }
        req.user = user;
        next();
    } catch (e) {
        console.error("Error parsing authentication token:", e);
        return res.status(401).json({ error: 'Invalid authentication token format' });
    }
};

// Middleware to check if user is admin
const authorizeAdmin = (req, res, next) => {
    if (!req.user || !req.user.isAdmin) {
        return res.status(403).json({ error: 'Forbidden: Admin access required' });
    }
    next();
};

// --- API Endpoints ---

app.get('/api/subjects', (req, res) => {
    db.all('SELECT * FROM subjects', [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.get('/api/posts', (req, res) => {
    const { subject_id, sort, search, user } = req.query;
    let query = 'SELECT p.id, p.title, p.content, u.username AS author, p.author_id, p.subject_id, p.created_at FROM posts p JOIN users u ON p.author_id = u.id';
    const params = [];
    const conditions = [];

    if (subject_id) {
        conditions.push('p.subject_id = ?');
        params.push(subject_id);
    }
    if (search) {
        conditions.push('(p.title LIKE ? OR p.content LIKE ? OR u.username LIKE ?)');
        params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    if (user) {
        conditions.push('u.username = ?');
        params.push(user);
    }

    if (conditions.length > 0) {
        query += ' WHERE ' + conditions.join(' AND ');
    }

    if (sort === 'new') {
        query += ' ORDER BY p.created_at DESC';
    } else if (sort === 'top') {
        query += ' ORDER BY (SELECT COUNT(*) FROM replies WHERE replies.post_id = p.id) DESC';
    } else {
        query += ' ORDER BY p.created_at DESC';
    }

    db.all(query, params, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.get('/api/posts/:id', (req, res) => {
    const postId = req.params.id;
    db.get('SELECT p.id, p.title, p.content, u.username AS author, p.author_id, p.subject_id, p.created_at FROM posts p JOIN users u ON p.author_id = u.id WHERE p.id = ?', [postId], (err, post) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!post) return res.status(404).json({ error: 'Post not found' });
        res.json(post);
    });
});


app.post('/api/posts', authenticateUser, (req, res) => {
    const { title, content, subject_id } = req.body;
    const author = req.user.username;
    const author_id = req.user.id;

    if (!title || !content || !subject_id) {
        return res.status(400).json({ error: 'Title, content, and subject are required' });
    }

    db.run(
        'INSERT INTO posts (title, content, author, author_id, subject_id) VALUES (?, ?, ?, ?, ?)',
        [title, content, author, author_id, subject_id],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.status(201).json({ id: this.lastID, title, content, author, author_id, subject_id, created_at: new Date().toISOString() });
        }
    );
});

app.delete('/api/posts/:id', authenticateUser, (req, res) => {
    const postId = req.params.id;
    const userId = req.user.id;
    const isAdmin = req.user.isAdmin;

    db.get('SELECT author_id FROM posts WHERE id = ?', [postId], (err, post) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!post) return res.status(404).json({ error: 'Post not found' });

        if (post.author_id === userId || isAdmin) {
            db.run('DELETE FROM posts WHERE id = ?', [postId], function(delErr) {
                if (delErr) return res.status(500).json({ error: delErr.message });
                if (this.changes === 0) return res.status(404).json({ error: 'Post not found after delete attempt' });
                res.status(204).send();
            });
        } else {
            res.status(403).json({ error: 'Forbidden: You do not have permission to delete this post.' });
        }
    });
});

app.get('/api/replies', (req, res) => {
    const { user } = req.query;
    if (!user) {
        return res.status(400).json({ error: 'Username is required for fetching replies by user' });
    }

    db.all(
        'SELECT r.id, r.post_id, r.content, u.username AS author, r.author_id, r.created_at FROM replies r JOIN users u ON r.author_id = u.id WHERE u.username = ? ORDER BY r.created_at DESC',
        [user],
        (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(rows);
        }
    );
});

app.get('/api/posts/:id/replies', (req, res) => {
    db.all(
        'SELECT r.id, r.post_id, r.content, u.username AS author, r.author_id, r.created_at FROM replies r JOIN users u ON r.author_id = u.id WHERE r.post_id = ? ORDER BY r.created_at',
        [req.params.id],
        (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(rows);
        }
    );
});

app.post('/api/posts/:id/replies', authenticateUser, (req, res) => {
    const { content } = req.body;
    const postId = req.params.id;
    const author = req.user.username;
    const author_id = req.user.id;

    if (!content) {
        return res.status(400).json({ error: 'Reply content is required' });
    }

    db.run(
        'INSERT INTO replies (post_id, content, author, author_id) VALUES (?, ?, ?, ?)',
        [postId, content, author, author_id],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.status(201).json({ id: this.lastID, post_id: postId, content, author, author_id, created_at: new Date().toISOString() });
        }
    );
});

app.delete('/api/replies/:id', authenticateUser, (req, res) => {
    const replyId = req.params.id;
    const userId = req.user.id;
    const isAdmin = req.user.isAdmin;

    db.get('SELECT author_id, post_id FROM replies WHERE id = ?', [replyId], (err, reply) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!reply) return res.status(404).json({ error: 'Reply not found' });

        if (reply.author_id === userId || isAdmin) {
            db.run('DELETE FROM replies WHERE id = ?', [replyId], function(delErr) {
                if (delErr) return res.status(500).json({ error: delErr.message });
                if (this.changes === 0) return res.status(404).json({ error: 'Reply not found after delete attempt' });
                res.status(204).send();
            });
        } else {
            res.status(403).json({ error: 'Forbidden: You do not have permission to delete this reply.' });
        }
    });
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
                    console.error("Registration error:", err.message);
                    return res.status(500).json({ error: 'Registration failed due to server error.' });
                }
                res.status(201).json({ id: this.lastID, username, email, isAdmin: false });
            }
        );
    } catch (error) {
        console.error("Hashing error during registration:", error);
        res.status(500).json({ error: 'Registration failed' });
    }
});

app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ error: 'Username and password required' });
    }

    db.get('SELECT * FROM users WHERE username = ?', [username], async (err, user) => {
        if (err) {
            console.error('Database error during login:', err.message);
            return res.status(500).json({ error: 'Login failed due to server error.' });
        }
        if (!user) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        try {
            const valid = await bcrypt.compare(password, user.password_hash);
            if (!valid) {
                return res.status(401).json({ error: 'Invalid credentials' });
            }

            const { password_hash, ...userData } = user;
            userData.isAdmin = Boolean(userData.isAdmin);
            res.json(userData);
        } catch (error) {
            console.error('Error during password comparison or login response:', error);
            res.status(500).json({ error: 'Login failed' });
        }
    });
});

app.post('/api/admin/set-admin', authenticateUser, authorizeAdmin, (req, res) => {
    const { username, isAdmin } = req.body;

    if (!username || typeof isAdmin !== 'boolean') {
        return res.status(400).json({ error: 'Username and isAdmin (boolean) are required' });
    }

    const isAdminValue = isAdmin ? 1 : 0;

    db.run(
        'UPDATE users SET isAdmin = ? WHERE username = ?',
        [isAdminValue, username],
        function(err) {
            if (err) {
                console.error('Error setting admin status:', err.message);
                return res.status(500).json({ error: err.message });
            }
            if (this.changes === 0) {
                return res.status(404).json({ error: 'User not found' });
            }
            res.json({ message: `User '${username}' admin status set to ${isAdmin}` });
        }
    );
});


app.listen(port, '0.0.0.0', () => {
    console.log(`Server running at http://localhost:${port}`);
});
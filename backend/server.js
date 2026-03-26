const express = require('express');
const mongoose = require('mongoose');
const crypto = require('crypto');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// MongoDB Connection
mongoose.connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
})
.then(() => console.log('✅ MongoDB verbunden'))
.catch(err => console.error('❌ MongoDB Fehler:', err));

// Middleware
app.use(cors({
    origin: [
        'https://danielovice.github.io',
        'http://localhost:3000',
        'http://127.0.0.1:3000'
    ],
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

// === SCHEMAS ===
const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true, lowercase: true },
    password: { type: String, required: true },
    lists: { 
        type: Object, 
        default: { "Meine Liste": { todos: [], type: "todo", color: "#0a84ff" }}
    },
    listOrder: { type: Array, default: ["Meine Liste"] },
    currentList: { type: String, default: "Meine Liste" },
    created: { type: Date, default: Date.now },
    lastUpdate: Date
});

const tokenSchema = new mongoose.Schema({
    token: { type: String, required: true, unique: true },
    username: { type: String, required: true },
    expires: { type: Date, required: true, expires: 0 }
});

const User = mongoose.model('User', userSchema);
const Token = mongoose.model('Token', tokenSchema);

// === HELPERS ===
function hashPassword(password) {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
    return `${salt}:${hash}`;
}

function verifyPassword(password, storedHash) {
    const [salt, hash] = storedHash.split(':');
    const verifyHash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
    return hash === verifyHash;
}

function generateToken() {
    return crypto.randomBytes(32).toString('hex');
}

// === API ENDPOINTS ===

// REGISTER
app.post('/register', async (req, res) => {
    try {
        const { username, password } = req.body;
        
        if (!username || !password || password.length < 4) {
            return res.status(400).json({ error: 'Name und Passwort (min. 4 Zeichen) nötig' });
        }
        
        const existing = await User.findOne({ username: username.toLowerCase() });
        if (existing) {
            return res.status(409).json({ error: 'Benutzer existiert bereits' });
        }
        
        const newUser = new User({
            username: username.toLowerCase(),
            password: hashPassword(password),
            lists: { "Meine Liste": { todos: [], type: "todo", color: "#0a84ff" }},
            listOrder: ["Meine Liste"],
            currentList: "Meine Liste"
        });
        
        await newUser.save();
        res.status(201).json({ success: true });
        
    } catch (e) {
        console.error('Register Error:', e);
        res.status(500).json({ error: 'Serverfehler' });
    }
});

// LOGIN
app.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        
        const user = await User.findOne({ username: username.toLowerCase() });
        if (!user || !verifyPassword(password, user.password)) {
            return res.status(401).json({ error: 'Falscher Name oder Passwort' });
        }
        
        const token = generateToken();
        await new Token({
            token,
            username: user.username,
            expires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
        }).save();
        
        res.json({ success: true, token, username: user.username });
        
    } catch (e) {
        console.error('Login Error:', e);
        res.status(500).json({ error: 'Serverfehler' });
    }
});

// GET DATA
app.get('/data', async (req, res) => {
    try {
        const token = req.headers['authorization'];
        if (!token) return res.status(401).json({ error: 'Nicht eingeloggt' });
        
        const tokenDoc = await Token.findOne({ token });
        if (!tokenDoc || tokenDoc.expires < new Date()) {
            return res.status(401).json({ error: 'Token ungültig' });
        }
        
        const user = await User.findOne({ username: tokenDoc.username });
        if (!user) return res.status(404).json({ error: 'User nicht gefunden' });
        
        tokenDoc.expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        await tokenDoc.save();
        
        const userData = user.toObject();
        delete userData.password;
        res.json(userData);
        
    } catch (e) {
        console.error('Get Data Error:', e);
        res.status(500).json({ error: 'Serverfehler' });
    }
});

// SAVE DATA
app.post('/data', async (req, res) => {
    try {
        const token = req.headers['authorization'];
        if (!token) return res.status(401).json({ error: 'Nicht eingeloggt' });
        
        const tokenDoc = await Token.findOne({ token });
        if (!tokenDoc || tokenDoc.expires < new Date()) {
            return res.status(401).json({ error: 'Token ungültig' });
        }
        
        const { lists, listOrder, currentList } = req.body;
        
        await User.findOneAndUpdate(
            { username: tokenDoc.username },
            { lists, listOrder, currentList, lastUpdate: new Date() }
        );
        
        res.json({ success: true });
        
    } catch (e) {
        console.error('Save Data Error:', e);
        res.status(500).json({ error: 'Serverfehler' });
    }
});

// LOGOUT
app.post('/logout', async (req, res) => {
    try {
        const token = req.headers['authorization'];
        if (token) await Token.deleteOne({ token });
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: 'Serverfehler' });
    }
});

// HEALTH CHECK
app.get('/', (req, res) => {
    res.json({ status: 'OK', message: 'Todo API läuft!' });
});

// START SERVER
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server läuft auf Port ${PORT}`);
});

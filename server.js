const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = 3000;
const DATA_DIR = __dirname;

const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.ico': 'image/x-icon'
};

function hashPassword(password) {
    return crypto.createHash('sha256').update(password).digest('hex');
}

function getUserFile(username) {
    return path.join(DATA_DIR, `user_${username.toLowerCase()}.json`);
}

function getTokenFile(token) {
    return path.join(DATA_DIR, `token_${token}.json`);
}

const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
    'Content-Type': 'application/json'
};

const server = http.createServer((req, res) => {
    if (req.method === 'OPTIONS') {
        res.writeHead(200, headers);
        res.end();
        return;
    }

    const url = req.url;
    const method = req.method;
    console.log(method + ' ' + url);

    // === API ENDPOINTS ===
    if (method === 'POST' && url === '/register') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try {
                const { username, password } = JSON.parse(body);
                if (!username || !password) {
                    res.writeHead(400, headers);
                    res.end(JSON.stringify({ error: 'Name und Passwort nötig' }));
                    return;
                }
                const userFile = getUserFile(username);
                if (fs.existsSync(userFile)) {
                    res.writeHead(409, headers);
                    res.end(JSON.stringify({ error: 'Benutzer existiert bereits' }));
                    return;
                }
                const userData = {
                    username: username,
                    password: hashPassword(password),
                    created: new Date().toISOString(),
                    lists: { "Meine Liste": { todos: [], type: "todo", color: "#0a84ff" } },
                    listOrder: ["Meine Liste"],
                    currentList: "Meine Liste"
                };
                fs.writeFileSync(userFile, JSON.stringify(userData, null, 2));
                res.writeHead(201, headers);
                res.end(JSON.stringify({ success: true }));
            } catch (e) {
                res.writeHead(400, headers);
                res.end(JSON.stringify({ error: 'Fehler' }));
            }
        });
        return;
    }

    if (method === 'POST' && url === '/login') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try {
                const { username, password } = JSON.parse(body);
                const userFile = getUserFile(username);
                if (!fs.existsSync(userFile)) {
                    res.writeHead(401, headers);
                    res.end(JSON.stringify({ error: 'Falscher Name oder Passwort' }));
                    return;
                }
                const userData = JSON.parse(fs.readFileSync(userFile, 'utf8'));
                if (userData.password !== hashPassword(password)) {
                    res.writeHead(401, headers);
                    res.end(JSON.stringify({ error: 'Falscher Name oder Passwort' }));
                    return;
                }
                const token = crypto.randomBytes(16).toString('hex');
                fs.writeFileSync(getTokenFile(token), JSON.stringify({ username }));
                res.writeHead(200, headers);
                res.end(JSON.stringify({ success: true, token, username }));
            } catch (e) {
                res.writeHead(400, headers);
                res.end(JSON.stringify({ error: 'Fehler' }));
            }
        });
        return;
    }

    if (method === 'GET' && url === '/data') {
        const token = req.headers['authorization'];
        if (!token || !fs.existsSync(getTokenFile(token))) {
            res.writeHead(401, headers);
            res.end(JSON.stringify({ error: 'Nicht eingeloggt' }));
            return;
        }
        const tokenData = JSON.parse(fs.readFileSync(getTokenFile(token), 'utf8'));
        const userFile = getUserFile(tokenData.username);
        const userData = JSON.parse(fs.readFileSync(userFile, 'utf8'));
        delete userData.password;
        res.writeHead(200, headers);
        res.end(JSON.stringify(userData));
        return;
    }

    if (method === 'POST' && url === '/data') {
        const token = req.headers['authorization'];
        if (!token || !fs.existsSync(getTokenFile(token))) {
            res.writeHead(401, headers);
            res.end(JSON.stringify({ error: 'Nicht eingeloggt' }));
            return;
        }
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try {
                const tokenData = JSON.parse(fs.readFileSync(getTokenFile(token), 'utf8'));
                const userFile = getUserFile(tokenData.username);
                const userData = JSON.parse(fs.readFileSync(userFile, 'utf8'));
                const newData = JSON.parse(body);
                userData.lists = newData.lists;
                userData.listOrder = newData.listOrder;
                userData.currentList = newData.currentList;
                userData.lastUpdate = new Date().toISOString();
                fs.writeFileSync(userFile, JSON.stringify(userData, null, 2));
                res.writeHead(200, headers);
                res.end(JSON.stringify({ success: true }));
            } catch (e) {
                res.writeHead(400, headers);
                res.end(JSON.stringify({ error: 'Fehler' }));
            }
        });
        return;
    }

    if (method === 'POST' && url === '/logout') {
        const token = req.headers['authorization'];
        if (token && fs.existsSync(getTokenFile(token))) {
            fs.unlinkSync(getTokenFile(token));
        }
        res.writeHead(200, headers);
        res.end(JSON.stringify({ success: true }));
        return;
    }

    // === STATIC FILES ===
    let filePath = url === '/' ? '/index.html' : url;
    filePath = filePath.split('?')[0];
    filePath = path.join(DATA_DIR, filePath);
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    fs.readFile(filePath, (err, content) => {
        if (err) {
            if (err.code === 'ENOENT') {
                res.writeHead(404, { 'Content-Type': 'text/html' });
                res.end('<h1>404 - Datei nicht gefunden</h1>');
            } else {
                res.writeHead(500, { 'Content-Type': 'text/html' });
                res.end('<h1>500 - Server Fehler</h1>');
            }
        } else {
            res.writeHead(200, { 'Content-Type': contentType, ...headers });
            res.end(content);
        }
    });
});

server.listen(PORT, '0.0.0.0', () => {
    console.log('Server läuft auf Port ' + PORT);
    console.log('Erreichbar unter: http://localhost:' + PORT);
});
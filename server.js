// ==================== MODULE LADEN ====================
// HTTP-Server Modul
const http = require('http');
// Dateisystem Modul
const fs = require('fs');
// Pfad Modul
const path = require('path');
// Krypto Modul (für Passwörter & Tokens)
const crypto = require('crypto');

// ==================== KONFIGURATION ====================
// Port auf dem der Server läuft
const PORT = 3000;
// Verzeichnis für Daten-Dateien
const DATA_DIR = __dirname;

// ==================== PASSWORT HASHING ====================
// Passwort hashen (SHA256)
function hashPassword(password) {
    return crypto.createHash('sha256').update(password).digest('hex');
}

// ==================== DATEI PFADER ====================
// Pfad zur User-Datei erstellen
function getUserFile(username) {
    return path.join(DATA_DIR, `user_${username.toLowerCase()}.json`);
}

// Pfad zur Token-Datei erstellen
function getTokenFile(token) {
    return path.join(DATA_DIR, `token_${token}.json`);
}

// ==================== CORS HEADERS ====================
// CORS Headers für alle Requests
const headers = {
    'Access-Control-Allow-Origin': '*',  // Alle Origins erlauben
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',  // Methoden
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',  // Headers
    'Access-Control-Max-Age': '86400',  // Cache-Zeit
    'Content-Type': 'application/json'  // Content-Type
};

// ==================== SERVER ERSTELLEN ====================
const server = http.createServer((req, res) => {
    // CORS Preflight Request behandeln
    if (req.method === 'OPTIONS') {
        res.writeHead(200, headers);
        res.end();
        return;
    }
    
    // URL und Methode speichern
    const url = req.url;
    const method = req.method;
    
    // Request loggen
    console.log(method + ' ' + url);
    
    // ==================== REGISTER ENDPOINT ====================
    if (method === 'POST' && url === '/register') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try {
                // JSON parsen
                const { username, password } = JSON.parse(body);
                
                // Validierung: Felder dürfen nicht leer sein
                if (!username || !password) {
                    res.writeHead(400, headers);
                    res.end(JSON.stringify({ error: 'Name und Passwort nötig' }));
                    return;
                }
                
                // User-Datei Pfad
                const userFile = getUserFile(username);
                
                // Prüfen ob User bereits existiert
                if (fs.existsSync(userFile)) {
                    res.writeHead(409, headers);
                    res.end(JSON.stringify({ error: 'Benutzername bereits vergeben' }));
                    return;
                }
                
                // User-Daten erstellen
                const userData = {
                    username: username.toLowerCase(),  // Kleinbuchstaben
                    password: hashPassword(password),  // Gehasht
                    created: new Date().toISOString(),
                    lists: {
                        "Meine Liste": {
                            todos: [],
                            type: "todo",
                            color: "#0a84ff"
                        }
                    },
                    listOrder: ["Meine Liste"],
                    currentList: "Meine Liste"
                };
                
                // Datei schreiben
                fs.writeFileSync(userFile, JSON.stringify(userData, null, 2));
                
                // Erfolg
                res.writeHead(201, headers);
                res.end(JSON.stringify({ success: true }));
                
            } catch (e) {
                // Fehler
                res.writeHead(400, headers);
                res.end(JSON.stringify({ error: 'Fehler' }));
            }
        });
        return;
    }
    
    // ==================== LOGIN ENDPOINT ====================
    if (method === 'POST' && url === '/login') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try {
                // JSON parsen
                const { username, password } = JSON.parse(body);
                const userFile = getUserFile(username);
                
                // Prüfen ob User existiert
                if (!fs.existsSync(userFile)) {
                    res.writeHead(401, headers);
                    res.end(JSON.stringify({ error: 'Falscher Name oder Passwort' }));
                    return;
                }
                
                // User-Daten laden
                const userData = JSON.parse(fs.readFileSync(userFile, 'utf8'));
                
                // Passwort prüfen
                if (userData.password !== hashPassword(password)) {
                    res.writeHead(401, headers);
                    res.end(JSON.stringify({ error: 'Falscher Name oder Passwort' }));
                    return;
                }
                
                // Token generieren
                const token = crypto.randomBytes(16).toString('hex');
                
                // Token speichern
                fs.writeFileSync(getTokenFile(token), JSON.stringify({ username }));
                
                // Erfolg
                res.writeHead(200, headers);
                res.end(JSON.stringify({ success: true, token, username }));
                
            } catch (e) {
                // Fehler
                res.writeHead(400, headers);
                res.end(JSON.stringify({ error: 'Fehler' }));
            }
        });
        return;
    }
    
    // ==================== DATEN LADEN ENDPOINT ====================
    if (method === 'GET' && url === '/data') {
        // Token aus Header
        const token = req.headers['authorization'];
        
        // Token prüfen
        if (!token || !fs.existsSync(getTokenFile(token))) {
            res.writeHead(401, headers);
            res.end(JSON.stringify({ error: 'Nicht eingeloggt' }));
            return;
        }
        
        // Token-Daten laden
        const tokenData = JSON.parse(fs.readFileSync(getTokenFile(token), 'utf8'));
        const userFile = getUserFile(tokenData.username);
        const userData = JSON.parse(fs.readFileSync(userFile, 'utf8'));
        
        // Passwort löschen (nicht senden)
        delete userData.password;
        
        // Erfolg
        res.writeHead(200, headers);
        res.end(JSON.stringify(userData));
        return;
    }
    
    // ==================== DATEN SPEICHERN ENDPOINT ====================
    if (method === 'POST' && url === '/data') {
        // Token aus Header
        const token = req.headers['authorization'];
        
        // Token prüfen
        if (!token || !fs.existsSync(getTokenFile(token))) {
            res.writeHead(401, headers);
            res.end(JSON.stringify({ error: 'Nicht eingeloggt' }));
            return;
        }
        
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try {
                // Token-Daten laden
                const tokenData = JSON.parse(fs.readFileSync(getTokenFile(token), 'utf8'));
                const userFile = getUserFile(tokenData.username);
                const userData = JSON.parse(fs.readFileSync(userFile, 'utf8'));
                
                // Neue Daten parsen
                const newData = JSON.parse(body);
                
                // Daten aktualisieren
                userData.lists = newData.lists;
                userData.listOrder = newData.listOrder;
                userData.currentList = newData.currentList;
                userData.lastUpdate = new Date().toISOString();
                
                // Datei schreiben
                fs.writeFileSync(userFile, JSON.stringify(userData, null, 2));
                
                // Erfolg
                res.writeHead(200, headers);
                res.end(JSON.stringify({ success: true }));
                
            } catch (e) {
                // Fehler
                res.writeHead(400, headers);
                res.end(JSON.stringify({ error: 'Fehler' }));
            }
        });
        return;
    }
    
    // ==================== LOGOUT ENDPOINT ====================
    if (method === 'POST' && url === '/logout') {
        const token = req.headers['authorization'];
        // Token löschen
        if (token && fs.existsSync(getTokenFile(token))) {
            fs.unlinkSync(getTokenFile(token));
        }
        // Erfolg
        res.writeHead(200, headers);
        res.end(JSON.stringify({ success: true }));
        return;
    }
    
    // ==================== HEALTH CHECK ====================
    if (url === '/') {
        res.writeHead(200, headers);
        res.end(JSON.stringify({ status: 'OK' }));
        return;
    }
    
    // ==================== 404 ====================
    res.writeHead(404, headers);
    res.end('Nicht gefunden');
});

// ==================== SERVER STARTEN ====================
server.listen(PORT, '0.0.0.0', () => {
    console.log('Server läuft auf Port ' + PORT);
});

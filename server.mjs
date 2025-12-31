import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcrypt';
import { connection } from './snowflake-config.js';

const saltRounds = 10;
const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Rate limiting map
const creationAttempts = new Map();

async function MakeSnowflakeConnection() {
    try {
        console.log("Forbinder til Snowflake...");
        await connection.connectAsync();
        console.log("❄️ Snowflake er klar!");
    } catch (err) {
        console.error("Kunne ikke starte app'en pga. Snowflake:", err);
    }
}
MakeSnowflakeConnection();

const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

io.on('connection', (socket) => {
    console.log('Ny bruger forbundet, socket.id=', socket.id);

    // --- AUTHENTICATION (LOGIN / REGISTRERING) ---
    socket.on('authenticate', async (data) => {
        const { email, password, isNewUser } = data;

        if (isNewUser) {
            const ip = socket.handshake.address;
            const lastAttempt = creationAttempts.get(ip);
            const now = Date.now();

            if (lastAttempt && (now - lastAttempt) < 60000) {
                return socket.emit('auth response', {
                    success: false,
                    message: 'For security reasons, max 1 new user can be created per minute from an IP. <br>Wait a minute!'
                });
            }
            creationAttempts.set(ip, now);


            connection.execute({
                // TRIN 1: Tjek om emailen allerede er optaget
                sqlText: 'SELECT ID FROM USERS WHERE EMAIL = ?',
                binds: [email],
                complete: async (err, stmt, rows) => {
                    if (err) {
                        console.error("Fejl under tjek af eksisterende bruger:", err);
                        return socket.emit('auth response', { success: false, message: 'Database error.' });
                    }

                    // Hvis 'rows' ikke er tom, betyder det at emailen findes
                    if (rows && rows.length > 0) {
                        console.log("Registrering afvist: Email findes allerede ->", email);
                        return socket.emit('auth response', {
                            success: false,
                            message: 'This email is already registered. <br>Please use another or log in.'
                        });
                    }

                    // TRIN 2: Hvis vi er nået hertil, er emailen ledig!
                    try {
                        const hashedPassword = await bcrypt.hash(password, saltRounds);
                        const insertSql = `INSERT INTO USERS (email, password) VALUES (?, ?)`;

                        connection.execute({
                            sqlText: insertSql,
                            binds: [email, hashedPassword],
                            complete: (insertErr) => {
                                if (insertErr) {
                                    return socket.emit('auth response', { success: false, message: 'Error creating user.' });
                                }
                                // SUCCESS: Send grøn besked til frontenden
                                socket.emit('auth response', {
                                    success: true,
                                    email: email,
                                    message: 'User created successfully! <br>You can now log in.',
                                    isNewUser: true // Fortæller frontenden at den skal vise grøn besked
                                });
                            }
                        });
                    } catch (hashError) {
                        socket.emit('auth response', { success: false, message: 'Security error.' });
                    }
                }
            });

        }  // new user finished
        else {
            // LOGIN
            const sql = 'SELECT email, password FROM USERS WHERE email = ?';
            connection.execute({
                sqlText: sql,
                binds: [email],
                complete: async (err, stmt, rows) => {
                    if (err || rows.length === 0) {
                        return socket.emit('auth response', { success: false, message: 'User not found or database error.' });
                    }

                    const user = rows[0];
                    const dbPassword = user.PASSWORD || user.password;
                    const match = await bcrypt.compare(password, dbPassword);
                    console.log('match:', match)
                    if (match) {
                        socket.emit('auth response', { success: true, email: email, message: 'User logged in.' });
                    } else {
                        socket.emit('auth response', { success: false, message: 'Email and Password combination not found.' });
                    }
                }
            });
        }
    }); // --- AUTHENTICATION (LOGIN / REGISTRERING) finished---

    // --- ROOM MANAGEMENT ---
    socket.on('join room', async (room) => {
        socket.rooms.forEach(r => {
            if (r !== socket.id) socket.leave(r);
        });

        socket.join(room);

        // Hent historik funktion (defineret herinde for at have adgang til socket)
        try {
            const sql = `
                SELECT USERNAME as "username", MESSAGE as "message", ROOM as "room", 
                TO_CHAR(SENT_AT, 'YYYY-MM-DD HH24:MI') as "timestamp" 
                FROM CHAT_MESSAGES WHERE room = ? 
                ORDER BY sent_at ASC LIMIT 100`;

            connection.execute({
                sqlText: sql,
                binds: [room],
                complete: (err, stmt, rows) => {
                    if (!err) {
                        socket.emit('chat history', rows);
                    }
                }
            });
        } catch (err) {
            console.error("Historik fejl:", err);
        }

        socket.emit('chat message', `System: You are now in room: ${room}`);
    });

    // --- MESSAGING ---
    socket.on('chat message', async (data) => {
        const timedMsg = `[${new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}] ${data.username}: ${data.msg}`;
        
        // Send til alle i rummet med det samme
        io.to(data.room).emit('chat message', timedMsg);

        // Gem i Snowflake
        const sql = `INSERT INTO CHAT_MESSAGES (username, room, message) VALUES (?, ?, ?)`;
        connection.execute({
            sqlText: sql,
            binds: [data.username, data.room, data.msg],
            complete: (err) => {
                if (err) console.error('Snowflake gem fejl:', err.message);
            }
        });
    });
}); // <--- LUKKER io.on('connection')

httpServer.listen(PORT, () => {
    console.log(`Serveren kører på port ${PORT}`);
});
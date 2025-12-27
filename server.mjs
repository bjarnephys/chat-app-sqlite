import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import sqlite3 from 'sqlite3';
import bcrypt from 'bcrypt';
const saltRounds = 10; // Hvor kraftig skal krypteringen være? 10 er standard.

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
//  C:\Users\bh\Documents\programmering\node.js\chat-projekt
//  node server.mjs
// Tilføj dette i toppen af din server.mjs
//console.clear();
//process.stdout.write('\x1B[2J\x1B[0f');

// --- SQLITE SETUP ---, data gemmes i filen
const db = new sqlite3.Database('./chat.db');

// Opret tabellen med de felter du bad om
db.serialize(() => {
  // Ny tabel til brugere - bemærk UNIQUE på email
  // Tilføj 'password' kolonnen (Slet evt. din chat.db fil for at genstarte tabellen rent)
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE,
    password TEXT
  )`);
  
  db.run(`CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    room TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    message TEXT
  )`);
});
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

io.on('connection', (socket) => {
 
  socket.on('authenticate', async (data) => {
    const { email, password, isNewUser } = data;

    if (isNewUser) {
        // --- REGISTRERING ---
        // 1. Hash adgangskoden før vi gemmer den
        const hashedPassword = await bcrypt.hash(password, saltRounds);

        db.run("INSERT INTO users (email, password) VALUES (?, ?)", [email, hashedPassword], function(err) {
            if (err) {
                return socket.emit('auth response', { success: false, message: 'Emailen findes allerede.' });
            }
            socket.emit('auth response', { success: true, email: email });
        });

    } else {
        // --- LOGIN ---
        // 1. Find brugeren baseret på email
        db.get("SELECT * FROM users WHERE email = ?", [email], async (err, row) => {
            if (err) return console.error(err.message);
            
            if (row) {
                // 2. Sammenlign den indtastede kode med den hashede kode fra DB
                const match = await bcrypt.compare(password, row.password);
                
                if (match) {
                    socket.emit('auth response', { success: true, email: email });
                } else {
                    socket.emit('auth response', { success: false, message: 'Forkert adgangskode.' });
                }
            } else {
                socket.emit('auth response', { success: false, message: 'Bruger findes ikke.' });
            }
        });
    }
	});

  /*
  socket.on('authenticate', (data) => {
	  console.log('authenticate');
    const { email, password, isNewUser } = data;

    if (isNewUser) {
      // REGISTRERING: Prøv at indsætte ny bruger
      db.run("INSERT INTO users (email, password) VALUES (?, ?)", [email, password], function(err) {
        if (err) {
          return socket.emit('auth response', { success: false, message: 'Emailen findes allerede.' });
        }
        socket.emit('auth response', { success: true, email: email });
      });
    } else {
      // LOGIN: Tjek om både email og password passer
      db.get("SELECT * FROM users WHERE email = ? AND password = ?", [email, password], (err, row) => {
        if (err) return console.error(err.message);
        
        if (row) {
          socket.emit('auth response', { success: true, email: email });
        } else {
          socket.emit('auth response', { success: false, message: 'Forkert email eller password.' });
        }
      });
    }
  });
  */
	
  console.log('Ny bruger forbundet, socket.id=',socket.id); //hver bruger har unikt id
  //Ny bruger forbundet, socket.id= rcRpY6D0PNKStgdgAAAD  unikt random tal

  // Lyt efter når en bruger vil skifte rum, room er roomSelect.value, efter authenticate ok, så emitter clienten 'join room'
  socket.on('join room', (room) => {
	  console.log('room',room);
	  console.log('join room, socket.id=',socket.id);
    // Forlad tidligere rum (undtagen det unikke rum:socket.id )
    socket.rooms.forEach(r => {
		console.log('r:',r)
      if(r !== socket.id) socket.leave(r);
    });


	
    socket.join(room); // så er brugeren socket i to rum, hans id-rum og room
    // 3. DEBUG LOG: Se hvad der sker lige nu
    // Vi bruger Array.from() for at gøre Set'et læsbart for console.log
    const aktiveRum = Array.from(socket.rooms);
    console.log(`-----------------------------------`);
    console.log(`Bruger ID: ${socket.id}`);
    console.log(`Aktive rum:`, aktiveRum);
    console.log(`-----------------------------------`);
	
	// HENT HISTORIK FOR RUMMET: Når brugeren logger på et rum
    db.all("SELECT * FROM messages WHERE room = ? ORDER BY timestamp ASC", [room], (err, rows) => {
      if (err) return console.error(err);
      // Send hele historikken til den nye bruger
      socket.emit('chat history', rows);
    });
	
    console.log(`Bruger trådte ind i rummet: ${room}`);
    
    // Bekræftelse til brugeren
    socket.emit('chat message', `Du er nu i rummet: ${room}`); 
  });

  // Modtag besked og send den KUN til det specifikke rum
  socket.on('chat message', (data) => {
    // data forventes nu at være et objekt: { room: 'Sport', msg: 'Hej!' }
    const timedMsg = `[${new Date().toLocaleTimeString()}] ${data.msg}`;
    // GEM I DB: id autogenereres, tid er default CURRENT_TIMESTAMP
    const stmt = db.prepare("INSERT INTO messages (room, message) VALUES (?, ?)");
    stmt.run(data.room, data.msg);
    stmt.finalize();
	
    // io.to(room) sender kun til brugere i det aktuelle room
    io.to(data.room).emit('chat message', timedMsg);
  });
});

httpServer.listen(3000, () => {
  console.log('Chatserver med RUM kører på http://localhost:3000');
});
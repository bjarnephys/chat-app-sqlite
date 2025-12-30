import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import sqlite3 from 'sqlite3';
import bcrypt from 'bcrypt';
import { connection, connectToSnowflake } from './snowflake-config.js';
const saltRounds = 10; // Hvor kraftig skal krypteringen være? 10 er standard.
import { rateLimit } from 'express-rate-limit';

// cd C:\Users\bh\Documents\programmering\node.js\chat-projekt 
// node server.mjs    npm start


const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer);
const __dirname = path.dirname(fileURLToPath(import.meta.url));// Brug porten fra systemet (Render), eller 3000 hvis vi er på localhost

async function MakeSnowflakeConnection() {
    try {
        console.log("Forbinder til Snowflake...");
        await connection.connectAsync(); // DETTE MANGLER SIKKERT
        console.log("❄️ Snowflake er klar!");

    
    } catch (err) {
        console.error("Kunne ikke starte app'en pga. Snowflake:", err);
    }
}
MakeSnowflakeConnection();

// Øverst i din server.mjs
const creationAttempts = new Map(); // Gemmer IP -> tidsstempel


// Brug porten fra systemet (Render), eller 3000 hvis vi er på localhost
const PORT = process.env.PORT || 3000;
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
	username TEXT,
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
		const ip = socket.handshake.address; // Hent brugerens IP
		const lastAttempt = creationAttempts.get(ip);
		const now = Date.now();
		// Hvis der er gået mindre end 60 sekunder
        if (lastAttempt && (now - lastAttempt) < 60000) {
            return socket.emit('auth response', { 
                success: false, 
                message: 'For security reasons, max 1 new user can be created per minute from an IP. Waite a minute!' 
            });
        }
		
		
		// Opdater tidsstempel for denne IP
        creationAttempts.set(ip, now);

		//console.log( 'creationAttempts ', creationAttempts );
    
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

  
	
  console.log('Ny bruger forbundet, socket.id=',socket.id); //hver bruger har unikt id
  //Ny bruger forbundet, socket.id= rcRpY6D0PNKStgdgAAAD  unikt random tal

  // Lyt efter når en bruger vil skifte rum, room er roomSelect.value, efter authenticate ok, så emitter clienten 'join room'
  socket.on('join room', async (room) => {
	  //console.log('room',room);
	  //console.log('join room, socket.id=',socket.id);
    // Forlad tidligere rum (undtagen det unikke rum:socket.id )
    socket.rooms.forEach(r => {
		//console.log('r:',r)
      if(r !== socket.id) socket.leave(r);
    });


	
    socket.join(room); // så er brugeren socket i to rum, hans id-rum og room
    // 3. DEBUG LOG: Se hvad der sker lige nu
    // Vi bruger Array.from() for at gøre Set'et læsbart for console.log
    const aktiveRum = Array.from(socket.rooms);
	/*
    console.log(`-----------------------------------`);
    console.log(`Bruger ID: ${socket.id}`);
    console.log(`Aktive rum:`, aktiveRum);
    console.log(`-----------------------------------`);
	console.log(`Bruger trådte ind i rummet: ${room}`);
	*/
	async function getRoomHistory(roomName) {
	  const sql = `
	 SELECT USERNAME as "username", MESSAGE as "message", ROOM as "room", TO_CHAR(SENT_AT, 'YYYY-MM-DD HH24:MI') as "timestamp" from CHAT_MESSAGES  
	 WHERE room = ? 
	 ORDER BY sent_at ASC 
	 LIMIT 100`;
	  //console.log('sql:',sql);
	  return new Promise((resolve, reject) => {
		connection.execute({
		  sqlText: sql,
		  binds: [roomName],
		  complete: (err, stmt, rows) => {
		
			if (err) {
			  console.error('Fejl ved hentning af historik fra Snowflake:', err.message);
			  reject(err);
			} else {
			  //console.log('Første række fra Snowflake:', rows[0]); // Se her i din terminal!
			  resolve(rows);
			}
		  }
		});
	  });
	}
	
	// HENT HISTORIK FOR RUMMET: Når brugeren logger på et rum
	try {
        // HENT HISTORIK FRA SNOWFLAKE:
        const history = await getRoomHistory(room);
        
        // Send historikken KUN til den bruger, der lige er logget på
        socket.emit('chat history', history);
    } catch (err) {
        console.error("Kunne ikke sende historik til brugeren.");
    }
	
	/*
    db.all("SELECT * FROM messages WHERE room = ? ORDER BY timestamp ASC", [room], (err, rows) => {
      if (err) return console.error(err);
      // Send hele historikken til den nye bruger
      socket.emit('chat history', rows);
    });
	*/
   
    
    // Bekræftelse til brugeren
    socket.emit('chat message', `Du er nu i rummet: ${room}`); //bliver vist overskrevet før den vises !?
  });


	async function saveMessageToSnowflake(username, room, message) {
		if (!connection.isUp()) {
		console.log("Snowflake forbindelse ikke aktiv. Forsøger at forbinde...");
		await connection.connectAsync();
		}
	
	  const sql = `
		INSERT INTO CHAT_MESSAGES (username, room, message) 
		VALUES (?, ?, ?)
	  `;

	  return new Promise((resolve, reject) => {
		connection.execute({
		  sqlText: sql,
		  binds: [username, room, message], // "Binds" beskytter mod SQL injection
		  complete: (err, stmt, rows) => {
			if (err) {
			  console.error('Fejl ved gem i Snowflake:', err.message);
			  reject(err);
			} else {
			  console.log('Besked gemt i Snowflake!');
			  resolve(rows);
			}
		  }
		});
	  });
	}

  // Modtag besked og send den KUN til det specifikke rum
  socket.on('chat message', async (data)  => {
    // data forventes nu at være et objekt: { room: 'Sport', msg: 'Hej!' }
    const timedMsg = `[${new Date().toLocaleTimeString()}] ${data.username}: ${data.msg}`;
    // GEM I DB: id autogenereres, tid er default CURRENT_TIMESTAMP
    const stmt = db.prepare("INSERT INTO messages (username, room, message) VALUES (?, ?, ?)");
    stmt.run(data.username, data.room, data.msg);
    stmt.finalize();
	
    // io.to(room) sender kun til brugere i det aktuelle room
    io.to(data.room).emit('chat message', timedMsg);
	
	// Gem beskeden i Snowflake (til fremtidig analyse)
    try {
      await saveMessageToSnowflake(data.username, data.room, data.msg);
    } catch (err) {
      // Vi lader chatten køre videre, selvom Snowflake fejler
      console.log("Snowflake logning fejlede, men chatten fortsætter.");
    }
	
  });
});


httpServer.listen(PORT, () => {
    console.log(`Serveren kører på port ${PORT}`);
});

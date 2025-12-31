# Snowflake & Socket.io Chat App

En fuldt funktionel realtids chat-applikation bygget med Node.js. Projektet demonstrerer brugen af WebSockets til kommunikation, Snowflake til datalagring og sikker brugerautentificering med bcrypt.

## ✨ Funktioner

* **Brugerstyring:** Log ind som eksisterende bruger eller opret en ny profil.
* **Sikkerhed:** Adgangskoder hashes med `bcrypt` før lagring i databasen.
* **Persistens:** Beskedhistorik og brugerdata gemmes i en remote Snowflake database.
* **Beskederne gemmes også i en Snowflake database
* **Chatrum:** Mulighed for at skifte mellem forskellige rum (f.eks. Generelt, Sport, Kodning).
* **Realtid:** Beskeder sendes og modtages øjeblikkeligt via Socket.io.
* **Historik:** Når en bruger joiner et rum, hentes de tidligere beskeder automatisk fra databasen.

## 🛠️ Teknologier

* **Backend:** Node.js, Express
* **Realtid:** Socket.io
* **Database:** Snowflake database
* **Kryptering:** Bcrypt
* **Frontend:** HTML5, CSS3, JavaScript (Vanilla)

## 🚀 Installation & Opstart

Følg disse trin for at få projektet op at køre lokalt:

1.  **Naviger til projektmappen:**
    ```bash
    cd chat-projekt
    ```

2.  **Installer afhængigheder:**
    ```bash
    npm install
    ```

3.  **Start serveren:**
    ```bash
    npm start
    ```

4.  **Brug appen:**
    Åbn din browser og gå til: `http://localhost:3000`

## 📂 Projektstruktur

* `server.mjs` - Server-logik, database-forbindelse og Socket.io events.
* `snowflake-config.js`  -opkobling til Snowflake
* `index.html` - Client-side UI og WebSocket logik.
* `package.json` - Projektkonfiguration og afhængigheder.
* `.gitignore` - Fortæller Git, hvilke filer der skal ignoreres (f.eks. `node_modules` og password filen `.env`).

## 🔒 Sikkerhedsbemærkning
Projektet bruger `bcrypt` til hashing af adgangskoder. Dette sikrer, at adgangskoder aldrig gemmes i klar tekst i databasen. 

---
*Udviklet som et læringsprojekt i Node.js og realtids-kommunikation.*

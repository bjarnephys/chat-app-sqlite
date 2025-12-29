import snowflake from 'snowflake-sdk';
import 'dotenv/config';

// Opret forbindelsen
const connection = snowflake.createConnection({
  account: process.env.SNOWFLAKE_ACCOUNT,
  username: process.env.SNOWFLAKE_USER,
  password: process.env.SNOWFLAKE_PASSWORD,
  warehouse: process.env.SNOWFLAKE_WAREHOUSE,
  database: process.env.SNOWFLAKE_DATABASE,
  schema: process.env.SNOWFLAKE_SCHEMA
});

// Funktion til at starte forbindelsen
export async function connectToSnowflake() {
  try {
    if (!connection.isUp()) {
      await connection.connectAsync();
      console.log('❄️  Snowflake: Forbindelse etableret.');
    }
  } catch (err) {
    console.error('❌ Snowflake: Kunne ikke forbinde:', err.message);
    throw err;
  }
}

// Eksporter selve connection-objektet til brug i inserts
export { connection };

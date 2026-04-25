import 'reflect-metadata';
import * as dotenv from 'dotenv';
import { DataSource } from 'typeorm';
import path from 'path';
import fs from 'fs';
import { User, Agent, Conversation, Message, BlackList } from './entities';

dotenv.config();

const dbPath = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'hermes.sqlite');
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const AppDataSource = new DataSource({
  type: 'better-sqlite3',
  database: dbPath,
  synchronize: true,
  entities: [User, Agent, Conversation, Message, BlackList],
});

export default AppDataSource;

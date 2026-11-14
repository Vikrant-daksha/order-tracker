import { MongoClient, Db, Collection } from "mongodb";

// Replace or set via environment variable: process.env.MONGODB_URI
const uri = process.env.MONGODB_URI || "";

let db: Db | null = null;
export async function getDb(): Promise<Db | any> {
  try {
    const client = new MongoClient(uri);

    if (!db) {
      await client.connect();
      // Specify your database name here
      db = client.db(process.env.MONGODB_DB_NAME || "cherrybrush_db");
      console.log("Connected to MongoDB successfully!");
    }
    return db;
  } catch (error) {
    console.error("Error connecting to MongoDB!");
    return error;
  }
}

export async function getOrdersCollection(): Promise<Collection> {
  const database = await getDb();
  return database.collection("orders");
}

export async function getCustomersCollection(): Promise<Collection> {
  const database = await getDb();
  return database.collection("customers");
}

export async function getProductsCollection(): Promise<Collection> {
  const database = await getDb();
  return database.collection("products");
}

export async function getExpensesCollection(): Promise<Collection> {
  const database = await getDb();
  return database.collection("expenses");
}

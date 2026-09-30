const mysql = require("mysql");

module.exports = async (bot) => {
  let db = await mysql.createConnection({
    host: "localhost",
    user: "root",
    password: "",
    database: "Tsuki",
  });

  return db;
};

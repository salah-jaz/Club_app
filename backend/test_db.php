<?php
try {
  $pdo = new PDO('mysql:host=127.0.0.1;port=3306;dbname=clubconnect', 'root', '');
  echo 'DB_OK' . PHP_EOL;
  $stmt = $pdo->query('SHOW TABLES');
  echo 'TABLES:' . $stmt->rowCount() . PHP_EOL;
} catch (Throwable $e) {
  echo 'DB_ERR: ' . $e->getMessage() . PHP_EOL;
}

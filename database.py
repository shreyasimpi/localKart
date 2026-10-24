import sqlite3
from pathlib import Path

DB_PATH = Path(__file__).resolve().parent / "database.db"
SCHEMA_PATH = Path(__file__).resolve().parent / "schema.sql"


def get_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db():
    with get_connection() as conn:
        schema = SCHEMA_PATH.read_text(encoding="utf-8")
        conn.executescript(schema)


def add_seller(name, email=""):
    with get_connection() as conn:
        cur = conn.execute(
            "INSERT INTO sellers (name, email) VALUES (?, ?)",
            (name, email)
        )
        return cur.lastrowid


def add_product(seller_id, name, price, category,
                image_url="", stock=0):
    with get_connection() as conn:
        cur = conn.execute(
            """INSERT INTO products
               (seller_id, name, price, category, image_url, stock)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (seller_id, name, price, category, image_url, stock)
        )
        return cur.lastrowid


def get_all_products():
    with get_connection() as conn:
        rows = conn.execute(
            """SELECT products.*, sellers.name AS seller_name
               FROM products
               JOIN sellers ON products.seller_id = sellers.id
               ORDER BY products.id"""
        ).fetchall()
        return [dict(row) for row in rows]


def update_product(product_id, name=None, price=None,
                   category=None, image_url=None, stock=None):
    fields = {
        "name": name,
        "price": price,
        "category": category,
        "image_url": image_url,
        "stock": stock
    }
    updates = {key: value for key, value in fields.items()
               if value is not None}

    if not updates:
        return False

    columns = ", ".join(f"{key} = ?" for key in updates)
    values = list(updates.values()) + [product_id]

    with get_connection() as conn:
        cur = conn.execute(
            f"UPDATE products SET {columns} WHERE id = ?",
            values
        )
        return cur.rowcount > 0


def delete_product(product_id):
    with get_connection() as conn:
        cur = conn.execute(
            "DELETE FROM products WHERE id = ?",
            (product_id,)
        )
        return cur.rowcount > 0


def create_order(product_id, quantity):
    if not isinstance(quantity, int) or quantity <= 0:
        raise ValueError("Quantity must be a positive integer")

    with get_connection() as conn:
        product = conn.execute(
            "SELECT price, stock FROM products WHERE id = ?",
            (product_id,)
        ).fetchone()

        if product is None:
            raise ValueError("Product not found")

        if product["stock"] < quantity:
            raise ValueError("Insufficient stock")

        total = round(product["price"] * quantity, 2)

        cur = conn.execute(
            """INSERT INTO orders
               (product_id, quantity, total, status)
               VALUES (?, ?, ?, 'pending')""",
            (product_id, quantity, total)
        )

        conn.execute(
            """UPDATE products
               SET stock = stock - ?
               WHERE id = ?""",
            (quantity, product_id)
        )

        return cur.lastrowid


def get_all_orders():
    with get_connection() as conn:
        rows = conn.execute(
            """SELECT orders.*, products.name AS product_name
               FROM orders
               JOIN products ON orders.product_id = products.id
               ORDER BY orders.id"""
        ).fetchall()
        return [dict(row) for row in rows]


if __name__ == "__main__":
    init_db()
    print("Database initialized successfully.")
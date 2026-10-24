from database import init_db, add_seller, add_product

init_db()

seller_id = add_seller(
    "Campus Canteen",
    "canteen@example.com"
)

add_product(
    seller_id, "Veg Sandwich", 50,
    "Snacks", "", 20
)

add_product(
    seller_id, "Masala Dosa", 70,
    "South Indian", "", 15
)

add_product(
    seller_id, "Veg Fried Rice", 90,
    "Rice", "", 10
)

print("Sample sellers and products added!")
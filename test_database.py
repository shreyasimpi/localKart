from database import (
    init_db,
    get_all_products,
    create_order,
    get_all_orders,
    update_product
)

init_db()

products = get_all_products()

print("PRODUCTS:")
for product in products:
    print(product)

if products:
    product = products[0]
    product_id = product["id"]

    print("\nTEST: UPDATE PRODUCT")
    print(update_product(product_id, stock=25))

    print("\nTEST: CREATE ORDER")
    try:
        order_id = create_order(product_id, 2)
        print("Order created:", order_id)
    except ValueError as error:
        print("Order rejected:", error)

    print("\nTEST: RETRIEVE ORDERS")
    for order in get_all_orders():
        print(order)
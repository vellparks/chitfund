import requests
import json

BASE_URL = "http://127.0.0.1:8000"

def test_workflow():
    print("Testing API Workflow...")

    # 1. Create Customer
    customer_data = {
        "name": "Raja",
        "phone": "9876543210",
        "address": "Chennai"
    }
    response = requests.post(f"{BASE_URL}/customers/", json=customer_data)
    if response.status_code != 200:
        print("Failed to create customer:", response.text)
        return
    customer = response.json()
    print(f"Customer Created: {customer['name']} (ID: {customer['id']})")

    # 2. Create Loan
    loan_data = {
        "customer_id": customer['id'],
        "loan_type": "daily",
        "amount": 10000,
        "deduction": 1500,
        "daily_due": 100,
        "total_days": 100
    }
    response = requests.post(f"{BASE_URL}/loans/", json=loan_data)
    if response.status_code != 200:
        print("Failed to create loan:", response.text)
        return
    loan = response.json()
    print(f"Loan Created: Amount={loan['amount']}, Disbursed={loan['disbursed_amount']} (ID: {loan['id']})")

    # 3. Make Payment
    payment_data = {
        "amount": 100
    }
    response = requests.post(f"{BASE_URL}/loans/{loan['id']}/pay", json=payment_data)
    if response.status_code != 200:
        print("Failed to make payment:", response.text)
        return
    transaction = response.json()
    print(f"Payment Received: ₹{transaction['amount']}")

    print("Test Completed Successfully!")

if __name__ == "__main__":
    try:
        test_workflow()
    except Exception as e:
        print(f"Error: {e}")

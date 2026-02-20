from datetime import datetime, timedelta

class DailyLoan:
    def __init__(self, customer_name, loan_amount, deduction, daily_due, days):
        self.customer_name = customer_name
        self.loan_amount = loan_amount  # Approved Amount (e.g., 10000)
        self.deduction = deduction      # Upfront deduction (e.g., 1500)
        self.disbursed_amount = loan_amount - deduction # Given to customer (8500)
        self.daily_due = daily_due      # Daily collection (e.g., 100)
        self.total_days = days          # Duration (e.g., 100)
        self.start_date = datetime.now()
        self.collections = []
        
    def make_payment(self, amount, date=None):
        if date is None:
            date = datetime.now()
        self.collections.append({"date": date, "amount": amount})
        print(f"Payment of ₹{amount} received for {self.customer_name} on {date.strftime('%Y-%m-%d')}")

    def get_status(self):
        total_collected = sum(item['amount'] for item in self.collections)
        outstanding = self.loan_amount - total_collected
        days_remaining = self.total_days - len(self.collections)
        
        print("\n--- Loan Status ---")
        print(f"Customer: {self.customer_name}")
        print(f"Loan Amount: ₹{self.loan_amount}")
        print(f"Disbursed: ₹{self.disbursed_amount}")
        print(f"Total Collected: ₹{total_collected}")
        print(f"Outstanding: ₹{outstanding}")
        print(f"Status: {'Closed' if outstanding <= 0 else 'Active'}")
        print("-------------------")

# Example Usage
if __name__ == "__main__":
    # Create a loan for a customer
    # 10000 Loan, 1500 Deduction (So 8500 given), 100 Daily, 100 Days
    loan = DailyLoan("Raja", 10000, 1500, 100, 100)
    
    print(f"Loan Created for {loan.customer_name}. Handover Cash: ₹{loan.disbursed_amount}")
    
    # Simulate 5 days of collection
    for i in range(5):
        payment_date = datetime.now() + timedelta(days=i)
        loan.make_payment(100, payment_date)
        
    loan.get_status()

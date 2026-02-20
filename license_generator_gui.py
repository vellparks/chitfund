import tkinter as tk
from tkinter import messagebox
import hashlib

LICENSE_SECRET = "FM-LIC-SECRET-2026"


def compute_license_key(product_code: str) -> str:
    base = (product_code or "").replace("-", "").upper()
    if not base or len(base) < 16:
        raise ValueError("Invalid product code")
    h = hashlib.sha256((base + LICENSE_SECRET).encode("utf-8")).hexdigest().upper()
    core = h[:20]
    return "-".join(core[i:i + 5] for i in range(0, 20, 5))


def on_generate():
    code = entry_code.get().strip()
    try:
        key = compute_license_key(code)
        entry_key.config(state="normal")
        entry_key.delete(0, tk.END)
        entry_key.insert(0, key)
        entry_key.config(state="readonly")
    except Exception as e:
        messagebox.showerror("Error", str(e))


root = tk.Tk()
root.title("License Key Generator")

tk.Label(root, text="Product Code").grid(row=0, column=0, padx=8, pady=8, sticky="w")
entry_code = tk.Entry(root, width=35)
entry_code.grid(row=0, column=1, padx=8, pady=8)

btn = tk.Button(root, text="Generate License Key", command=on_generate)
btn.grid(row=1, column=0, columnspan=2, padx=8, pady=8)

tk.Label(root, text="License Key").grid(row=2, column=0, padx=8, pady=8, sticky="w")
entry_key = tk.Entry(root, width=35, state="readonly")
entry_key.grid(row=2, column=1, padx=8, pady=8)

root.mainloop()


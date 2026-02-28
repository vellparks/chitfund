import os
import sys
import traceback
from datetime import datetime

BASE_DIR = os.path.dirname(__file__)
LOG_PATH = os.path.join(BASE_DIR, "wsgi_startup.log")

if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

def _log(line: str):
    try:
        with open(LOG_PATH, "a", encoding="utf-8") as f:
            f.write(f"[{datetime.now().isoformat()}] {line}\n")
    except Exception:
        pass

try:
    _log("passenger_wsgi: start")
    
    # Import the Flask app
    # Note: flask_app.py defines 'app'
    from flask_app import app as application
    
    _log("passenger_wsgi: imported flask_app.app as application")

except Exception as e:
    _log(f"passenger_wsgi: ERROR {e}")
    _log(traceback.format_exc())
    
    def application(environ, start_response):
        start_response('200 OK', [('Content-Type', 'text/plain')])
        msg = "WSGI startup error.\n\n"
        msg += f"{type(e).__name__}: {e}\n\n"
        msg += f"See log: {LOG_PATH}\n"
        return [msg.encode("utf-8", errors="replace")]

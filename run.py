import os
import sys
import subprocess
import time
import signal

def print_banner():
    banner = """
============================================================
              CommAI UNIVERSAL SYSTEM LAUNCHER              
       FastAPI Backend [8001] + React Vite Frontend [5173]   
============================================================
"""
    print(banner)

def check_and_install_dependencies():
    root_dir = os.path.dirname(os.path.abspath(__file__))
    frontend_dir = os.path.join(root_dir, "frontend")
    backend_dir = os.path.join(root_dir, "backend")
    
    # 1. Check Frontend node_modules
    node_modules_path = os.path.join(frontend_dir, "node_modules")
    if not os.path.exists(node_modules_path):
        print("[LAUNCHER] node_modules not found in frontend directory.")
        print("[LAUNCHER] Running 'npm install' in frontend...")
        try:
            subprocess.run("npm install", shell=True, cwd=frontend_dir, check=True)
            print("[LAUNCHER] Frontend dependencies installed successfully.")
        except subprocess.CalledProcessError as e:
            print(f"[LAUNCHER] Error installing frontend dependencies: {e}")
            sys.exit(1)
    else:
        print("[LAUNCHER] Frontend node_modules verified.")

    # 2. Check Backend Virtual Environment
    venv_dir = os.path.join(root_dir, "venv")
    python_exe = sys.executable  # fallback
    
    if os.path.exists(venv_dir):
        # Resolve Windows path structure for virtualenv python
        win_py = os.path.join(venv_dir, "Scripts", "python.exe")
        unix_py = os.path.join(venv_dir, "bin", "python")
        if os.path.exists(win_py):
            python_exe = win_py
        elif os.path.exists(unix_py):
            python_exe = unix_py
            
        print(f"[LAUNCHER] Virtual environment found. Using Python: {python_exe}")
    else:
        print("[LAUNCHER] Warning: 'venv' folder not found at root directory. Using system python.")

    # 3. Check and Install Python Packages
    print("[LAUNCHER] Checking backend dependencies...")
    req_file = os.path.join(backend_dir, "requirements.txt")
    
    # Verify imports
    dependencies_installed = True
    try:
        # Check critical packages
        subprocess.run([python_exe, "-c", "import fastapi, uvicorn, openpyxl, docx, sqlalchemy"], 
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)
        print("[LAUNCHER] Backend dependencies verified.")
    except (subprocess.CalledProcessError, FileNotFoundError):
        dependencies_installed = False

    if not dependencies_installed:
        print("[LAUNCHER] Critical Python packages missing. Installing requirements.txt...")
        try:
            subprocess.run([python_exe, "-m", "pip", "install", "-r", req_file], check=True)
            print("[LAUNCHER] Backend dependencies installed successfully.")
        except subprocess.CalledProcessError as e:
            print(f"[LAUNCHER] Error installing backend dependencies: {e}")
            sys.exit(1)
            
    return python_exe

def main():
    print_banner()
    root_dir = os.path.dirname(os.path.abspath(__file__))
    frontend_dir = os.path.join(root_dir, "frontend")
    backend_dir = os.path.join(root_dir, "backend")
    
    python_exe = check_and_install_dependencies()
    
    print("\n[LAUNCHER] Starting servers...")
    
    # Launch Backend (FastAPI on Port 8001)
    backend_cmd = [python_exe, "-m", "uvicorn", "app.main:app", "--reload", "--host", "127.0.0.1", "--port", "8001"]
    print(f"[LAUNCHER] Backend startup: {' '.join(backend_cmd)}")
    
    backend_process = subprocess.Popen(
        backend_cmd,
        cwd=backend_dir,
        creationflags=subprocess.CREATE_NEW_PROCESS_GROUP if os.name == 'nt' else 0
    )
    
    # Give backend a second to bind to port
    time.sleep(1.5)
    
    # Launch Frontend (Vite Dev Server on Port 5173)
    frontend_cmd = "npm run dev"
    print(f"[LAUNCHER] Frontend startup: {frontend_cmd}")
    
    frontend_process = subprocess.Popen(
        frontend_cmd,
        shell=True,
        cwd=frontend_dir,
        creationflags=subprocess.CREATE_NEW_PROCESS_GROUP if os.name == 'nt' else 0
    )
    
    print("\n[LAUNCHER] Both servers are running!")
    print("  -> Backend OpenAPI: http://127.0.0.1:8001/docs")
    print("  -> React Frontend:  http://localhost:5173")
    print("\nPress Ctrl+C to terminate both servers and exit.")
    
    try:
        while True:
            # Check if any process exited unexpectedly
            back_code = backend_process.poll()
            front_code = frontend_process.poll()
            
            if back_code is not None:
                print(f"[LAUNCHER] Backend server terminated unexpectedly (Exit Code: {back_code}). Exiting...")
                break
            if front_code is not None:
                print(f"[LAUNCHER] Frontend server terminated unexpectedly (Exit Code: {front_code}). Exiting...")
                break
                
            time.sleep(1)
    except KeyboardInterrupt:
        print("\n[LAUNCHER] Shutting down servers gracefully...")
    finally:
        # Kill backend
        if backend_process.poll() is None:
            if os.name == 'nt':
                backend_process.send_signal(signal.CTRL_BREAK_EVENT)
            backend_process.terminate()
            backend_process.wait()
            print("[LAUNCHER] Backend server stopped.")
            
        # Kill frontend
        if frontend_process.poll() is None:
            if os.name == 'nt':
                # Vite shell spawns child nodes, taskkill is cleaner on Windows
                subprocess.run(f"taskkill /F /T /PID {frontend_process.pid}", stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, shell=True)
            else:
                frontend_process.terminate()
            frontend_process.wait()
            print("[LAUNCHER] Frontend server stopped.")
            
        print("[LAUNCHER] Universal exit clean.")

if __name__ == "__main__":
    main()

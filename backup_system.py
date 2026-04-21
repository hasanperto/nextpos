import os
import shutil
import zipfile
import subprocess
from datetime import datetime

def backup():
    base_dir = r"d:\xampp\htdocs\nextpos"
    backup_dir = os.path.join(base_dir, "backups")
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    db_backup_name = f"nextpos_db_{timestamp}.sql"
    code_backup_name = f"nextpos_code_{timestamp}.zip"

    if not os.path.exists(backup_dir):
        os.makedirs(backup_dir)

    print(f"🚀 Starting NextPOS Backup at {timestamp}...")

    # 1. Database Backup (Docker version)
    print("📦 Dumping Database via Docker (nextpos-postgres-1)...")
    env = os.environ.copy()
    env["PGPASSWORD"] = "nextpos"
    db_file_path = os.path.join(backup_dir, db_backup_name)
    try:
        container_name = "nextpos-postgres-1"
        command = [
            "docker", "exec", "-e", "PGPASSWORD=nextpos",
            container_name, "pg_dump", "-U", "nextpos", "-F", "p", "nextpos"
        ]
        with open(db_file_path, "w", encoding="utf-8") as f:
            subprocess.run(command, stdout=f, check=True)
        print(f"✅ DB Backup Complete: {db_backup_name}")
    except Exception as e:
        print(f"❌ DB Backup Failed: {e}")

    # 2. Codebase Backup
    print("📂 Compressing Codebase (excluding large folders)...")
    exclude_dirs = {"node_modules", ".next", "dist", "build", ".turbo", ".git", "backups", "nextpos_temp_backup", "nextpos_backup_tmp"}
    
    zip_path = os.path.join(backup_dir, code_backup_name)
    try:
        with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
            for root, dirs, files in os.walk(base_dir):
                # Filter out excluded directories
                dirs[:] = [d for d in dirs if d not in exclude_dirs]
                
                for file in files:
                    if file.endswith(".log") or file.endswith(".bak"):
                        continue
                    file_path = os.path.join(root, file)
                    arcname = os.path.relpath(file_path, base_dir)
                    zipf.write(file_path, arcname)
        print(f"✅ Code Backup Complete: {code_backup_name}")
    except Exception as e:
        print(f"❌ Code Backup Failed: {e}")

    print(f"⭐ All backups stored in: {backup_dir}")

if __name__ == "__main__":
    backup()
